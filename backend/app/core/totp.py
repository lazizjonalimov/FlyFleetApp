"""Time-based one-time codes (RFC 6238) for authenticator apps: 6 digits, a new one every 30 seconds."""
import base64
import hashlib
import hmac
import io
import re
import secrets
import struct
import time
from urllib.parse import quote, urlencode

import segno

STEP, DIGITS = 30, 6


def new_secret() -> str:
    """A random 160-bit key, in the base32 form authenticator apps take."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10 ** DIGITS).zfill(DIGITS)


def now_code(secret: str, at: float | None = None) -> str:
    return _code(secret, int((time.time() if at is None else at) // STEP))


def verify(secret: str, code: str, at: float | None = None) -> bool:
    """Whether the code is right now, allowing one step either side for a phone clock that is slightly off."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != DIGITS:
        return False
    counter = int((time.time() if at is None else at) // STEP)
    return any(hmac.compare_digest(_code(secret, counter + d), code) for d in (-1, 0, 1))


def uri(secret: str, account: str, issuer: str = "FlyFleet") -> str:
    label = quote(f"{issuer}:{account}")
    return f"otpauth://totp/{label}?{urlencode({'secret': secret, 'issuer': issuer, 'digits': DIGITS, 'period': STEP})}"


def qr_svg(text: str) -> str:
    """The QR code an authenticator app scans, as an SVG document."""
    out = io.BytesIO()
    # a standalone document (with its namespace), so a browser can show it as an image
    segno.make(text, error="m").save(out, kind="svg", scale=5, border=2, dark="#101828", light="#ffffff",
                                     xmldecl=False, svgns=True, svgclass=None, lineclass=None)
    svg = out.getvalue().decode()
    # a viewBox lets it scale to whatever size the page gives it
    size = re.search(r'width="(\d+)" height="(\d+)"', svg)
    return svg.replace(size.group(0), f'viewBox="0 0 {size.group(1)} {size.group(2)}"', 1) if size else svg


def grouped(secret: str) -> str:
    """The setup key in groups of four, for typing it in by hand."""
    return " ".join(secret[i:i + 4] for i in range(0, len(secret), 4))
