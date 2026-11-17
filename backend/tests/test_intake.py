"""Adding records from documents and spreadsheets: what was read, how it was checked, what a person corrected,
and imports that catch bad rows before anything is saved."""
import io
import json
from types import SimpleNamespace

import pytest

from app.core.config import get_settings
from app.modules.intake import vin as vins
from app.modules.intake import vision
from tests.conftest import PNG, seed
from tests.pdfmake import text_pdf
from tests.test_owners import DATES


def valid_vin(prefix: str = "1FUJGLDR", rest: str = "CLBP8834") -> str:
    draft = prefix + "0" + rest
    return prefix + vins.check_digit(draft) + rest


def upload_unattached(api, content: bytes, doc_type: str, filename: str, content_type: str) -> dict:
    intent = api.post("/documents/upload-intents", {"filename": filename, "content_type": content_type,
                                                    "size_bytes": len(content), "type": doc_type}, 201).json()
    api.put(intent["upload"]["url"], content=content, headers=intent["upload"]["headers"], expect=204)
    return api.post(f"/documents/{intent['document']['id']}/complete", expect=200).json()


def registration(vin: str) -> bytes:
    return text_pdf([[(40, 740, "VEHICLE REGISTRATION"), (40, 700, "Plate: S9K 4416"), (300, 700, "State: TEXAS"),
                      (450, 700, "Expires: 11/30/27"), (40, 660, "Vehicle identification number"), (40, 645, vin),
                      (40, 610, "Year 2012"), (160, 610, "Make FRHT"), (300, 610, "Model CASCADIA 126"),
                      (470, 610, "GVWR 80,000")]])


def test_a_registration_pdf_is_read_checked_and_its_corrections_kept(org):
    vin = valid_vin()
    org.post("/vehicles", {"unit_number": "T-1187", **DATES}, 201)
    doc = upload_unattached(org, registration(vin), "registration", "registration.pdf", "application/pdf")
    assert doc["links"] == []
    read = org.post("/intake/reads", {"document_id": doc["id"], "kind": "registration"}, 201).json()
    assert (read["status"], read["reader"]) == ("done", "text")
    got = {f["key"]: f for f in read["fields"]}
    assert (got["plate"]["value"], got["plate_state"]["value"], got["registration_expiry"]["value"]) == \
        ("S9K 4416", "TX", "2027-11-30")
    assert got["vin"]["value"] == vin and got["vin"]["note"] == "Valid" and got["vin"]["state"] == "read"
    assert got["make"]["value"] == "Freightliner" and got["make"]["note"] == "Matches VIN"
    assert got["year"]["note"] == "Matches VIN" and len(got["plate"]["box"]) == 4
    assert read["suggestions"]["unit_number"] == "T-1188"
    assert [c["title"] for c in read["checks"]] == ["VIN decoded"]

    truck = org.post("/vehicles", {"unit_number": "T-1188", "vin": vin, "plate": "S9K 4415", "plate_state": "TX",
                                   **DATES}, 201).json()
    applied = org.post(f"/intake/reads/{read['id']}/apply", {
        "entity_type": "vehicle", "entity_id": truck["id"],
        "saved": {"vin": vin, "plate": "S9K 4415", "plate_state": "TX"}}, 200).json()
    assert applied["corrections"] == {"plate": {"read": "S9K 4416", "saved": "S9K 4415"}}
    filed = org.items("/documents", entity_type="vehicle", entity_id=truck["id"])
    assert [d["id"] for d in filed] == [doc["id"]]
    org.error("POST", f"/intake/reads/{read['id']}/apply", 409, "ALREADY_APPLIED",
              json={"entity_type": "vehicle", "entity_id": truck["id"], "saved": {}})
    # The same VIN read again is caught as already in FlyFleet.
    again = org.post("/intake/reads", {"document_id": doc["id"], "kind": "registration"}, 201).json()
    assert any(c["title"] == "Already in FlyFleet" and c["record_id"] == truck["id"] for c in again["checks"])


def test_a_photo_needs_the_photo_reader_and_says_so(org):
    doc = upload_unattached(org, PNG, "license", "cdl_front.png", "image/png")
    read = org.post("/intake/reads", {"document_id": doc["id"], "kind": "cdl"}, 201).json()
    assert read["status"] == "needs_reader" and "photo reader" in read["error"]
    assert all(f["state"] == "missing" for f in read["fields"])
    assert org.get("/intake/reader").json() == {"text_pdfs": True, "photos": False}


def test_roles_need_the_right_to_make_the_record(org):
    s = seed(org)
    doc = upload_unattached(org, registration(valid_vin()), "registration", "reg.pdf", "application/pdf")
    dispatcher = org.add_user("dispatcher")
    dispatcher.error("POST", "/intake/reads", 403, "FORBIDDEN", json={"document_id": doc["id"], "kind": "registration"})
    assert s["truck"]


def test_the_photo_reader_turns_the_models_answer_into_fields(monkeypatch):
    monkeypatch.setattr(get_settings(), "document_reader", "anthropic")
    answer = {"is_expected_document": True, "violations": [], "fields": [
        {"key": "cdl_number", "value": "41208837", "confidence": 0.98, "page": 1, "box": [0.1, 0.2, 0.3, 0.25]},
        {"key": "endorsements", "value": "N, H", "confidence": 0.74, "page": 1, "box": []}]}
    calls = []

    def create(**kw):
        calls.append(kw)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(answer))])
    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create)))
    result = vision.read(PNG, "image/png", "cdl", client=client)
    assert vision.enabled()
    assert [(f.key, f.value, f.confidence) for f in result.fields] == [("cdl_number", "41208837", 0.98),
                                                                         ("endorsements", "N, H", 0.74)]
    request = calls[0]
    assert request["model"] == "claude-opus-5-5" and request["fallbacks"] == "default"
    assert request["output_config"]["format"]["type"] == "json_schema"
    assert request["messages"][0]["content"][0]["type"] == "image"
    # A refusal or a document of the wrong kind is said plainly, never saved.
    refused = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(
        create=lambda **kw: SimpleNamespace(stop_reason="refusal", content=[]))))
    with pytest.raises(vision.ReaderError, match="declined"):
        vision.read(PNG, "image/png", "cdl", client=refused)
    wrong = {**answer, "is_expected_document": False}
    other = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(
        create=lambda **kw: SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(wrong))]))))
    with pytest.raises(vision.ReaderError, match="doesn't look like"):
        vision.read(PNG, "image/png", "cdl", client=other)


def start_import(api, kind: str, filename: str, data: bytes, expect: int = 201) -> dict:
    return api.post("/imports", files={"file": (filename, data)}, data={"kind": kind}, expect=expect).json()


def test_a_truck_csv_is_matched_checked_and_only_ready_rows_are_saved(org):
    good, other, existing = valid_vin(), valid_vin("4V4NC9EH", "NN000901"), valid_vin("1XKYD49X", "EJ123456")
    org.post("/vehicles", {"unit_number": "T-1121", "vin": existing, **DATES}, 201)
    bad = good[:8] + ("1" if good[8] != "1" else "2") + good[9:]  # a wrong check digit
    csv = ("Unit #,VIN,Year,Make,Plate,St,Plate Exp,Notes\n"
           f"T-1190,{good},2023,FRHT,R4K 2291,TX,03/31/2027,new\n"
           f"T-1191,{bad},2022,Volvo,R4K 2292,TX,03/31/2027,\n"
           f"T-1190,{other},2022,Volvo,R4K 2293,TX,03/31/2027,again\n"
           f"T-1121,{existing},2021,KW,R4K 2294,OK,12/31/26,update me\n").encode()
    imp = start_import(org, "trucks", "trucks.csv", csv)
    cols = {c["header"]: c for c in imp["columns"]}
    assert cols["Unit #"]["field"] == "unit_number" and cols["St"]["field"] == "plate_state"
    assert cols["Plate Exp"]["field"] == "registration_expiry" and cols["Notes"]["status"] == "ignored"
    assert imp["covered"] and (imp["ready"], imp["look"], imp["cant"]) == (1, 1, 2)
    issues = {i["row"]: i for i in imp["issues"]}
    assert issues[3]["message"].startswith("VIN fails the check digit") and issues[3]["tone"] == "bad"
    assert issues[4]["message"] == "Same unit number as row 2"
    assert issues[5]["message"] == "Already in FlyFleet with the same VIN" and issues[5]["decision"] == "skip"
    imp = org.put(f"/imports/{imp['id']}", {"mapping": {c["header"]: c["field"] for c in imp["columns"]},
                                            "decisions": {"5": "update"}}, 200).json()
    done = org.post(f"/imports/{imp['id']}/commit", {"reminders": True}, 200).json()
    assert done["status"] == "committed"
    assert (done["result"]["created"], done["result"]["updated"], done["result"]["skipped"]) == (1, 1, 2)
    units = {u["unit_number"]: u for u in org.items("/vehicles")}
    assert units["T-1190"]["make"] == "Freightliner" and units["T-1190"]["registration_expiry"] == "2027-03-31"
    assert units["T-1121"]["plate"] == "R4K 2294" and units["T-1121"]["plate_state"] == "OK"
    org.error("POST", f"/imports/{imp['id']}/commit", 409, "IMPORT_DONE", json={"reminders": False})


def test_a_driver_spreadsheet_splits_names_and_flags_two_digit_years(org):
    import openpyxl
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = "Sheet 1"
    sheet.append(["Driver Name", "Cell", "CDL #", "St", "Class", "End.", "CDL Exp", "Med Card", "Hire Date"])
    sheet.append(["Casey Lund", "(214) 555-0172", "41208837", "TX", "A", "N H", "06/14/2030", "8/2/27", "2024-09-03"])
    sheet.append(["Medina, Carlos", "(214) 555-0173", "41208838", "Texas", "A", "", "06/14/2030", "8/2/27", "2024-09-04"])
    data = io.BytesIO()
    book.save(data)
    imp = start_import(org, "drivers", "drivers.xlsx", data.getvalue())
    assert imp["sheet"] == "Sheet 1" and imp["rows"] == 2 and imp["covered"]
    cols = {c["header"]: c for c in imp["columns"]}
    assert cols["Driver Name"]["field"] == "full_name" and cols["CDL Exp"]["note"] == "MM/DD/YYYY"
    assert cols["Med Card"]["status"] == "warn" and cols["Med Card"]["note"] == "2-digit years → 2027"
    done = org.post(f"/imports/{imp['id']}/commit", {"reminders": False}, 200).json()
    assert done["result"]["created"] == 2
    drivers = {d["full_name"]: d for d in org.items("/drivers")}
    assert drivers["Carlos Medina"]["medical_cert_expiry"] == "2027-08-02"
    assert drivers["Casey Lund"]["endorsements"] == "N, H" and drivers["Casey Lund"]["cdl_state"] == "TX"
    # The same file again: both drivers are already on file by their CDL numbers.
    again = start_import(org, "drivers", "drivers.xlsx", data.getvalue())
    assert again["look"] == 2 and again["ready"] == 0


def test_a_file_that_isnt_a_spreadsheet_is_refused(org):
    start_import(org, "trucks", "notes.csv", b"\x00\x01binary", expect=422)
    start_import(org, "trucks", "empty.csv", b"Unit,VIN\n", expect=422)
