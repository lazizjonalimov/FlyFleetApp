"""Looking up a carrier's MC number with FMCSA (the QCMobile API), behind one small function.

With no WebKey configured nothing is sent anywhere and the answer is "unchecked": the app says so rather than
claiming a check it didn't make. Answers are kept for an hour, so typing an MC number doesn't call FMCSA on every
keystroke.
"""
import re
import time
from dataclasses import dataclass
from typing import Literal

import httpx

from app.core.config import get_settings

Status = Literal["authorized", "not_authorized", "not_found", "unchecked", "unavailable"]


@dataclass(frozen=True)
class Carrier:
    status: Status
    legal_name: str | None = None
    dot_number: str | None = None
    state: str | None = None


_cache: dict[str, tuple[float, Carrier]] = {}
_TTL = 3600


def digits(mc: str) -> str:
    return re.sub(r"[^0-9]", "", mc or "")


def lookup(mc: str) -> Carrier:
    """What FMCSA knows about an MC number: whether it is authorized to operate for hire, and the carrier's
    legal name, USDOT number and home state."""
    settings = get_settings()
    number = digits(mc)
    if not settings.fmcsa_web_key:
        return Carrier("unchecked")
    hit = _cache.get(number)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    try:
        response = httpx.get(f"{settings.fmcsa_url.rstrip('/')}/carriers/docket-number/{number}",
                             params={"webKey": settings.fmcsa_web_key}, timeout=6.0)
    except httpx.HTTPError:
        return Carrier("unavailable")
    if response.status_code == 404:
        result = Carrier("not_found")
    elif response.status_code != 200:
        return Carrier("unavailable")
    else:
        content = (response.json() or {}).get("content") or []
        first = content[0] if isinstance(content, list) and content else None
        carrier = (first or {}).get("carrier") if isinstance(first, dict) else None
        if not carrier:
            result = Carrier("not_found")
        else:
            result = Carrier(
                "authorized" if str(carrier.get("allowedToOperate", "")).upper() == "Y" else "not_authorized",
                legal_name=carrier.get("legalName"), dot_number=str(carrier.get("dotNumber") or "") or None,
                state=carrier.get("phyState"))
    _cache[number] = (time.monotonic() + _TTL, result)
    return result
