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


def test_a_pdf_page_is_shown_as_an_image(org):
    doc = upload_unattached(org, registration(valid_vin()), "registration", "reg.pdf", "application/pdf")
    page = org.get(f"/documents/{doc['id']}/pages/1")
    assert page.headers["content-type"] == "image/png" and page.content[:4] == b"\x89PNG"
    org.get(f"/documents/{doc['id']}/pages/2", expect=404)


def test_a_fuel_receipt_is_read_matched_to_the_truck_on_the_load_and_filed_with_the_purchase(org):
    from datetime import UTC, datetime, timedelta

    from tests.conftest import assign, new_load
    s = seed(org)
    now = datetime.now(UTC)
    load = new_load(org, s["customer"]["id"], stops=[
        {"type": "pickup", "city": "Dallas", "state": "TX", "appt_start": (now - timedelta(days=1)).isoformat()},
        {"type": "delivery", "city": "Tulsa", "state": "OK", "appt_start": (now + timedelta(days=1)).isoformat()}])
    assign(org, load, s)
    day = now.date()
    receipt = text_pdf([[(40, 740, "TRAVEL CENTER #432"), (40, 725, "I-35 FRONTAGE RD"), (40, 710, "WACO, TX"),
                         (40, 680, f"{day:%m/%d/%Y} 08:02"), (40, 650, "DIESEL #2"), (40, 635, "GALLONS 88.214"),
                         (40, 620, "PRICE/GAL $3.849"), (40, 590, "FUEL TOTAL $339.53"), (40, 575, "CASH $340.00")]])
    doc = upload_unattached(org, receipt, "receipt", "receipt.pdf", "application/pdf")
    read = org.post("/intake/reads", {"document_id": doc["id"], "kind": "fuel_receipt"}, 201).json()
    got = {f["key"]: f for f in read["fields"]}
    assert (got["vendor"]["value"], got["city"]["value"], got["state"]["value"]) == ("Travel Center #432", "Waco", "TX")
    assert (got["gallons"]["value"], got["price_per_gallon"]["value"], got["total"]["value"]) == ("88.214", "3.849", "339.53")
    assert got["purchased_on"]["value"] == day.isoformat() and got["paid_with"]["value"] == "cash"
    assert got["total"]["note"] == "Matches gallons × price"
    truck = next(c for c in read["checks"] if c["title"] == "Truck matched")
    assert truck["record_id"] == s["truck"]["id"] and load["load_number"] in truck["detail"]
    assert read["suggestions"]["vehicle_id"] == s["truck"]["id"] and read["suggestions"]["driver_id"] == s["driver"]["id"]

    bought = org.post("/expenses", {"category": "fuel", "incurred_on": str(day), "amount": "339.53", "gallons": "88.214",
                                    "jurisdiction": "TX", "vendor": "Travel Center #432 · Waco", "paid_with": "cash",
                                    "vehicle_id": s["truck"]["id"], "driver_id": s["driver"]["id"],
                                    "driver_treatment": "reimburse"}, 201).json()
    applied = org.post(f"/intake/reads/{read['id']}/apply", {"entity_type": "expense", "entity_id": bought["id"],
                                                             "saved": {"vendor": "Travel Center #432 · Waco"}}, 200).json()
    assert list(applied["corrections"]) == ["vendor"]
    assert [d["id"] for d in org.items("/documents", entity_type="expense", entity_id=bought["id"])] == [doc["id"]]
    [kept] = org.get("/ifta/receipts").json()
    assert (kept["status"], kept["title"]) == ("Matched", "Travel Center #432 · Waco · TX")
    assert org.get(f"/documents/{doc['id']}").json()["review_status"] == "approved"
    # The same receipt again is caught as a duplicate.
    again = org.post("/intake/reads", {"document_id": doc["id"], "kind": "fuel_receipt"}, 201).json()
    assert any(c["title"] == "Possible duplicate" and c["record_id"] == bought["id"] for c in again["checks"])


def test_a_receipt_that_prints_its_amounts_in_a_column_is_read_from_the_same_line(org):
    receipt = text_pdf([[(200, 740, "TRAVEL CENTER #432"), (240, 710, "WACO, TX"), (150, 680, "11/12/2026 08:02"),
                         (150, 635, "GALLONS"), (360, 635, "88.214"), (150, 620, "PRICE/GAL"), (360, 620, "$3.849"),
                         (150, 590, "FUEL TOTAL"), (360, 590, "$339.53"), (150, 575, "CASH"), (360, 575, "$340.00")]])
    doc = upload_unattached(org, receipt, "receipt", "receipt.pdf", "application/pdf")
    read = org.post("/intake/reads", {"document_id": doc["id"], "kind": "fuel_receipt"}, 201).json()
    got = {f["key"]: f["value"] for f in read["fields"]}
    assert (got["gallons"], got["price_per_gallon"], got["total"], got["paid_with"]) == ("88.214", "3.849", "339.53", "cash")


def test_a_load_spreadsheet_books_drafts_and_adds_new_customers(org):
    globex = org.post("/customers", {"name": "Globex"}, 201).json()
    org.post("/loads", {"customer_id": globex["id"], "reference": "PO-1", "commodity": "Paper", "stops": [
        {"type": "pickup", "city": "Dallas", "state": "TX", "appt_start": "2031-03-10T14:00:00Z"},
        {"type": "delivery", "city": "Austin", "state": "TX", "appt_start": "2031-03-11T14:00:00Z"}]}, 201)
    csv = (b"Customer,PO #,Shipper,Origin City,Origin State,Pickup Date,Pickup Time,Consignee,Dest City,Dest State,"
           b"Delivery Date,Delivery Time,Rate,Miles,Weight,Equipment\n"
           b"Globex,PO-2,Globex DC,Dallas,TX,03/12/2031,08:00-10:00,Receiver,Houston,TX,03/13/2031,2:30 PM,"
           b"\"$1,850.00\",240,42000,Reefer\n"
           b"Initech,PO-9,,Memphis,TN,03/12/2031,,,Atlanta,GA,03/14/2031,,1200,,,\n"
           b"Globex,PO-1,,Dallas,TX,03/12/2031,,,Austin,TX,03/13/2031,,900,,,\n"
           b"Globex,PO-3,,Dallas,TX,03/14/2031,25:00,,Austin,TX,03/13/2031,,900,,,\n")
    imp = start_import(org, "loads", "loads.csv", csv)
    cols = {c["header"]: c["field"] for c in imp["columns"]}
    assert (cols["Customer"], cols["PO #"], cols["Origin City"], cols["Pickup Time"], cols["Dest State"]) == (
        "customer", "reference", "pickup_city", "pickup_time", "delivery_state")
    assert imp["covered"] and (imp["ready"], imp["look"], imp["cant"]) == (1, 1, 2)
    issues = {i["row"]: i for i in imp["issues"]}
    assert issues[3]["message"] == "“Initech” isn't a customer yet: added as one, or the row skipped"
    assert issues[3]["decision"] == "update"
    assert issues[4]["message"] == "Already in FlyFleet as L-1001"
    assert issues[5]["message"] == "Pickup time “25:00” isn't a time"
    done = org.post(f"/imports/{imp['id']}/commit", {"reminders": False}, 200).json()
    result = done["result"]
    assert (result["created"], result["customers_added"], result["skipped"]) == (2, 1, 2) and result["failed"] == []
    loads = {load["reference"]: load for load in org.items("/loads") if load["reference"] in ("PO-2", "PO-9")}
    first = org.get(f"/loads/{loads['PO-2']['id']}").json()
    assert first["status"] == "draft" and first["equipment_type"] == "reefer" and first["revenue"] == "1850.00"
    assert (first["miles"], first["weight_lbs"]) == (240, 42000)
    pickup, delivery = first["stops"]
    assert (pickup["name"], pickup["city"], pickup["state"]) == ("Globex DC", "Dallas", "TX")
    assert pickup["appt_start"].startswith("2031-03-12T08:00") and pickup["appt_end"].startswith("2031-03-12T10:00")
    assert delivery["appt_start"].startswith("2031-03-13T14:30") and delivery["appt_end"] is None
    # No time in the file: the appointment is the whole day.
    other = org.get(f"/loads/{loads['PO-9']['id']}").json()
    assert other["customer"]["name"] == "Initech" and other["equipment_type"] == "dry_van"
    assert other["stops"][0]["appt_start"].startswith("2031-03-12T00:00") and other["stops"][0]["appt_end"].startswith("2031-03-12T23:59")
    # Someone who can book loads but not add customers can't bring new ones in.
    dispatcher = org.add_user("dispatcher")
    again = start_import(dispatcher, "loads", "loads.csv", b"Customer,Origin City,Pickup Date,Dest City,Delivery Date\n"
                         b"Hooli,Dallas,03/12/2031,Austin,03/13/2031\n")
    assert again["cant"] == 1 and again["issues"][0]["message"] == "Customer “Hooli” isn't in FlyFleet; your role can't add customers"
    org.add_user("safety_manager").error("POST", "/imports", 403, "FORBIDDEN", files={"file": ("l.csv", b"a\n1\n")},
                                         data={"kind": "loads"})
