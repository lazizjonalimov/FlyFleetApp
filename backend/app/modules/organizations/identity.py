"""How a company shows itself where several mix: a short code beside its numbers, and a colour on its mark."""
import re

PALETTE = ["#1F4FE0", "#0E9F6E", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#DC2626", "#4D7C0F", "#334155"]
SKIPPED = {"the", "of", "and", "inc", "llc", "co"}
CODE = re.compile(r"^[A-Z0-9]{2,6}$")
COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


def default_code(name: str, taken: set[str]) -> str:
    """Initials of the name (2 to 4 letters), made different from the codes already used in the account."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", name) if w]
    initials = "".join(w[0] for w in words if w.lower() not in SKIPPED)[:4]
    base = (initials if len(initials) >= 2 else (words[0][:3] if words else "CO")).upper()
    if len(base) < 2:
        base = (base + "X")[:2]
    code, n = base, 1
    lowered = {t.lower() for t in taken}
    while code.lower() in lowered:
        n += 1
        code = f"{base[: 6 - len(str(n))]}{n}"
    return code


def default_color(taken: list[str]) -> str:
    """The first palette colour no company of the account uses yet, then round again."""
    used = [c.lower() for c in taken]
    for color in PALETTE:
        if color.lower() not in used:
            return color
    return PALETTE[len(used) % len(PALETTE)]


def logo_url(company_id, updated_at) -> str | None:
    """Where a company's logo is served, for its members; changes whenever the logo does, so it's never stale."""
    return f"/api/v1/me/companies/{company_id}/logo?v={int(updated_at.timestamp())}" if updated_at else None
