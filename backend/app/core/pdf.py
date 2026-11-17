"""A small PDF writer for the documents FlyFleet hands out as files: text in Helvetica at positions, with rules,
over as many letter-size pages as it takes. The fonts are the PDF standard ones, so nothing is embedded."""
from dataclasses import dataclass, field

# Helvetica advance widths (per 1000 units of the font size) for the characters numbers and labels are made of;
# anything else is taken as an average letter.
_WIDTHS = {**dict.fromkeys("0123456789$", 556), " ": 278, ",": 278, ".": 278, "(": 333, ")": 333, "-": 333,
           "%": 889, "/": 278, ":": 278, "·": 278, "—": 1000, "–": 556}
_BOLD_WIDTHS = {**_WIDTHS, **dict.fromkeys("()", 333), "-": 333}
PAGE_W, PAGE_H = 612, 792


def text_width(text: str, size: float, bold: bool = False) -> float:
    widths = _BOLD_WIDTHS if bold else _WIDTHS
    return sum(widths.get(ch, 611 if bold else 556) for ch in text) * size / 1000


@dataclass
class Page:
    ops: list[str] = field(default_factory=list)

    def text(self, x: float, y: float, text: str, size: float = 9, bold: bool = False, right: bool = False,
             grey: bool = False) -> None:
        if right:
            x -= text_width(text, size, bold)
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        colour = "0.42 0.45 0.5 rg" if grey else "0.07 0.09 0.13 rg"
        self.ops.append(f"BT {colour} /{'F2' if bold else 'F1'} {size} Tf {x:.2f} {y:.2f} Td ({safe}) Tj ET")

    def rule(self, x0: float, y: float, x1: float, width: float = 0.5) -> None:
        self.ops.append(f"0.82 0.84 0.87 RG {width} w {x0:.2f} {y:.2f} m {x1:.2f} {y:.2f} l S")


def render(pages: list[Page]) -> bytes:
    """The pages as a PDF file."""
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    regular = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    bold = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    pages_id = len(objects) + 1 + 2 * len(pages)
    page_ids = []
    for page in pages:
        stream = "\n".join(page.ops).encode("cp1252", errors="replace")
        content = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        page_ids.append(add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] /Contents %d 0 R "
                            b"/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> >>"
                            % (pages_id, PAGE_W, PAGE_H, content, regular, bold)))
    kids = " ".join(f"{i} 0 R" for i in page_ids).encode()
    assert add(b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(page_ids)) == pages_id
    catalog = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog, xref)
    return bytes(out)
