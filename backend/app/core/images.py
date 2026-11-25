"""Pictures people upload (profile photos, company logos), made safe to show: read, checked, and re-encoded as a
square WebP. Re-encoding drops whatever else the file held (location and camera data, scripts, a second format
hidden inside), so only a plain picture is ever served."""
import io
from typing import Literal

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import Invalid

MAX_BYTES = 5 * 1024 * 1024
SIZE = 256


def read_upload(data: bytes) -> None:
    """Refuse an empty or oversized upload before reading it as a picture."""
    if not data:
        raise Invalid("That file is empty", field="file")
    if len(data) > MAX_BYTES:
        raise Invalid("Pictures can be up to 5 MB", field="file")


def square_webp(data: bytes, fit: Literal["cover", "contain"]) -> bytes:
    """A 256 × 256 WebP: `cover` crops to the centre (photos); `contain` fits the whole picture in, keeping any
    transparency around it (logos, which must never be cut off)."""
    read_upload(data)
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in ("JPEG", "PNG", "WEBP"):
                raise Invalid("Upload a JPEG, PNG or WebP picture", field="file")
            if probe.width * probe.height > 40_000_000:
                raise Invalid("That picture is too large. Use one under 40 megapixels.", field="file")
            probe.verify()
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            if fit == "cover":
                image = ImageOps.fit(image.convert("RGB"), (SIZE, SIZE), method=Image.Resampling.LANCZOS)
            else:
                inner = ImageOps.contain(image.convert("RGBA"), (SIZE, SIZE), method=Image.Resampling.LANCZOS)
                image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
                image.paste(inner, ((SIZE - inner.width) // 2, (SIZE - inner.height) // 2), inner)
            out = io.BytesIO()
            image.save(out, format="WEBP", quality=88)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError) as e:
        raise Invalid("That file isn’t a picture FlyFleet can read. Use a JPEG, PNG or WebP.", field="file") from e
