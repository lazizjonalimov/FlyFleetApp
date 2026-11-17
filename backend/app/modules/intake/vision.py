"""The photo reader: photos and scanned PDFs read by Claude, through the Anthropic API.

Off unless the operator turns it on (FLYFLEET_DOCUMENT_READER=anthropic) with an Anthropic credential in the
environment (ANTHROPIC_API_KEY, or any credential the SDK resolves). Without it, a photo can't be read and the
screen says so and offers the manual form. The model returns the same fields the built-in PDF reader does, each
with how sure it is and where it is on the page, as JSON that must match a schema; nothing it returns is saved
until a person has checked it.
"""
import base64
import io
import json
import logging

import anthropic

from app.core.config import get_settings
from app.modules.intake.fields import KINDS
from app.modules.intake.pdf_reader import Read, Result

log = logging.getLogger(__name__)

# The API takes images up to about 5 MB; a phone photo is scaled down to a size that still reads well.
MAX_IMAGE_BYTES = 4_500_000
MAX_SIDE = 2400

SYSTEM = (
    "You read documents for a US trucking company's records: driver's licenses, vehicle registrations, rate "
    "confirmations, proofs of delivery, roadside inspection reports and fuel receipts. Report only what is "
    "printed or written on the document. Never guess a value that isn't there: leave the field out. A person "
    "checks every value before anything is saved, so say how sure you are honestly."
)


class ReaderError(Exception):
    """The reader couldn't read the document; the message is safe to show."""


def enabled() -> bool:
    return get_settings().document_reader == "anthropic"


def _schema(kind: str) -> dict:
    keys = [f.key for f in KINDS[kind][1]]
    return {
        "type": "object",
        "properties": {
            "is_expected_document": {"type": "boolean"},
            "fields": {"type": "array", "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "enum": keys},
                    "value": {"type": "string"},
                    "confidence": {"type": "number"},
                    "page": {"type": "integer"},
                    "box": {"type": "array", "items": {"type": "number"}},
                },
                "required": ["key", "value", "confidence", "page", "box"],
                "additionalProperties": False,
            }},
            "violations": {"type": "array", "items": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "description": {"type": "string"},
                    "unit": {"type": "string"},
                    "out_of_service": {"type": "boolean"},
                },
                "required": ["code", "description", "unit", "out_of_service"],
                "additionalProperties": False,
            }},
        },
        "required": ["is_expected_document", "fields", "violations"],
        "additionalProperties": False,
    }


def _instructions(kind: str) -> str:
    label, specs = KINDS[kind]
    formats = {"date": "a date as YYYY-MM-DD", "money": "an amount in dollars like 1234.56, no symbol",
               "price": "a price per unit with every printed decimal, like 3.849, no symbol",
               "decimal": "a number with every printed decimal, like 88.214",
               "int": "a whole number, digits only", "state": "the two-letter US state or Canadian province code",
               "vin": "the 17-character VIN exactly as printed", "list": "the codes separated by commas"}
    lines = [f"- {s.key}: {s.label}{' (' + formats[s.type] + ')' if s.type in formats else ''}" for s in specs]
    extra = ""
    if kind == "inspection_report":
        extra = ("\nList each violation in `violations` with its regulation code (for example 393.9), its description, "
                 "the unit it was written against (driver, truck or trailer) and whether it put the driver or vehicle "
                 "out of service. For out_of_service among the fields, answer Yes or No.")
    if kind == "cdl":
        extra = "\nendorsements and restrictions are the letter codes on the license; write NONE as an empty list."
    if kind == "fuel_receipt":
        extra = ("\npaid_with is how it was paid: cash, fuel_card (WEX, Comdata, EFS, AtoB, Fleet One and other fleet "
                 "cards) or company_card (Visa, Mastercard, Amex, debit). card_last4 is the last four digits only.")
    return (f"This should be a {label.lower()}. Set is_expected_document to false if it is something else.\n"
            f"Read these fields when they appear:\n" + "\n".join(lines) + extra +
            "\nFor each field: confidence is 0 to 1 (below 0.8 when glare, blur, handwriting or a cut-off edge makes it "
            "uncertain); page is the 1-based page; box is where the value sits as fractions of the page or image "
            "[left, top, right, bottom], or an empty list if you can't place it. Use an empty violations list unless "
            "this is an inspection report.")


def _block(data: bytes, content_type: str) -> dict:
    if content_type == "application/pdf":
        return {"type": "document", "source": {"type": "base64", "media_type": "application/pdf",
                                               "data": base64.standard_b64encode(data).decode()}}
    media_type = content_type
    if len(data) > MAX_IMAGE_BYTES:
        from PIL import Image
        image = Image.open(io.BytesIO(data))
        image.thumbnail((MAX_SIDE, MAX_SIDE))
        out = io.BytesIO()
        image.convert("RGB").save(out, format="JPEG", quality=85)
        data, media_type = out.getvalue(), "image/jpeg"
    return {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                        "data": base64.standard_b64encode(data).decode()}}


def read(data: bytes, content_type: str, kind: str, client: anthropic.Anthropic | None = None) -> Result:
    settings = get_settings()
    client = client or anthropic.Anthropic(timeout=120.0, max_retries=2)
    try:
        response = client.beta.messages.create(
            model=settings.document_reader_model,
            max_tokens=16000,
            # If the model declines a document, the API retries it on a fallback model in the same call.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": _schema(kind)}},
            system=SYSTEM,
            messages=[{"role": "user", "content": [_block(data, content_type),
                                                   {"type": "text", "text": _instructions(kind)}]}],
        )
    except anthropic.RateLimitError as e:
        log.warning("document reader rate limited: %s", e)
        raise ReaderError("The reader is busy right now. Try again in a minute, or type it in.") from e
    except anthropic.BadRequestError as e:
        log.warning("document reader refused the file: %s", e)
        raise ReaderError("The reader couldn't open this file. Try a clearer photo or a PDF.") from e
    except anthropic.APIStatusError as e:
        log.warning("document reader error %s: %s", e.status_code, e)
        raise ReaderError("The reader isn't available right now. Try again, or type it in.") from e
    except anthropic.APIConnectionError as e:
        log.warning("document reader unreachable: %s", e)
        raise ReaderError("The reader can't be reached right now. Try again, or type it in.") from e
    if response.stop_reason == "refusal":
        raise ReaderError("The reader declined this file. Type it in instead.")
    if response.stop_reason == "max_tokens":
        raise ReaderError("This document is too long to read in one go. Type it in, or upload fewer pages.")
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        body = json.loads(text)
    except json.JSONDecodeError as e:
        raise ReaderError("The reader's answer couldn't be used. Try again, or type it in.") from e
    if not body.get("is_expected_document", True):
        raise ReaderError(f"This doesn't look like a {KINDS[kind][0].lower()}. Check the file, or type it in.")
    fields = []
    for f in body.get("fields", []):
        box = [round(min(max(float(x), 0.0), 1.0), 4) for x in f.get("box", [])][:4]
        fields.append(Read(f["key"], str(f["value"]).strip(), round(min(max(float(f["confidence"]), 0.0), 1.0), 2),
                           max(int(f.get("page") or 1), 1), box if len(box) == 4 else [], "vision"))
    pages = 1 if content_type != "application/pdf" else max([f.page for f in fields] or [1])
    return Result(fields=fields, violations=body.get("violations", []), pages=pages, reader="vision")
