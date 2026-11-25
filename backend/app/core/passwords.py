"""The rules a new password must meet, and how strong it is. The web app shows the same rules as you type;
these are the ones that count."""
import re

MIN_LENGTH = 12
LABELS = ("Weak", "Fair", "Good", "Strong")


def problems(new: str, current: str | None = None) -> list[str]:
    """What is wrong with a new password, in words a person can act on. Empty when it is acceptable."""
    out = []
    if len(new) < MIN_LENGTH:
        out.append(f"Use at least {MIN_LENGTH} characters")
    if not (re.search(r"[a-z]", new) and re.search(r"[A-Z]", new)):
        out.append("Use upper and lower case letters")
    if not re.search(r"[0-9]", new):
        out.append("Include a number")
    if current is not None and new == current:
        out.append("Choose a password different from the current one")
    return out


def strength(password: str) -> int:
    """0 (weak) to 3 (strong): length and the kinds of character used. Mirrors the meter in the web app."""
    kinds = sum(bool(re.search(p, password)) for p in (r"[a-z]", r"[A-Z]", r"[0-9]", r"[^A-Za-z0-9]"))
    score = 0
    if len(password) >= 8:
        score += 1
    if len(password) >= MIN_LENGTH and kinds >= 3:
        score += 1
    if len(password) >= 16 or (len(password) >= MIN_LENGTH and kinds == 4):
        score += 1
    return min(score, 3)
