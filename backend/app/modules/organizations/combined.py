"""Working in all of an account's companies at once (/api/v1/all/...).

Each request is answered company by company: the same request is made inside every company the person can
open, with that company's own principal, so their role and dispatch team in it decide what they see, exactly as
when they work there alone. The answers are merged, each row tagged with the company it came from.

* Reads (GET) merge list pages and add `by_company`. A summary (not a list) comes back per company.
* A write (POST) must say which company with `organization_id`, or it is refused with `COMPANY_REQUIRED`.
* Settings, roles, the audit log, IFTA and the account itself stay per company and are not offered here.
* Archived companies are left out: they are read-only history, opened one at a time.
"""
import asyncio
import base64
import csv
import io
import json
import uuid

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text

from app.core.db import new_session
from app.core.deps import Principal, get_principal
from app.core.errors import Invalid, NotFound
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT

router = APIRouter(prefix="/all", tags=["all companies"])

# Only these resources can be combined. Everything else is per company.
ALLOWED = {"customers", "drivers", "vehicles", "trailers", "loads", "invoices", "settlements", "owner-settlements",
           "owners", "maintenance", "expenses", "documents", "incidents", "tasks", "payments", "dashboard", "fleet",
           "equipment", "dispatch", "positions", "safety", "reports", "persons", "geofences"}
FETCH_CAP = 500  # rows read from each company to build one merged page


def _companies(user_id: uuid.UUID, home: uuid.UUID) -> list:
    db = new_session(org_id=home, user_id=user_id)
    try:
        rows = db.execute(text("SELECT organization_id, name, slug, status, code, color "
                               "FROM auth_user_organizations(:u)"), {"u": user_id}).all()
    finally:
        db.close()
    return [r for r in rows if r.status == "active"]


def _ref(c) -> dict:
    return {"id": str(c.organization_id), "code": c.code, "name": c.name, "slug": c.slug, "color": c.color}


def _offset(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return int(json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))["o"])
    except Exception as e:  # noqa: BLE001
        raise Invalid("This page link is no longer valid. Start again from the first page.", field="cursor") from e


def _cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(json.dumps({"o": offset}).encode()).decode().rstrip("=")


def _sortable(v):
    return (v is None, str(v).lower() if isinstance(v, str) else v)


async def _call(client: httpx.AsyncClient, method: str, url: str, headers: dict, company, **kw):
    r = await client.request(method, url, headers={**headers, "x-company": str(company.organization_id)}, **kw)
    return company, r


def _forward_headers(request: Request) -> dict:
    keep = ("authorization", "accept", "x-request-id", "idempotency-key", "content-type")
    return {k: v for k, v in request.headers.items() if k.lower() in keep}


async def _fetch_all(client, base: str, headers: dict, company, params: dict, need: int):
    """Pages of one company's list until `need` rows are read or it runs out."""
    items, cursor = [], None
    while len(items) < need:
        q = {**params, "limit": MAX_LIMIT, "count": "false"}
        if cursor:
            q["cursor"] = cursor
        _, r = await _call(client, "GET", base, headers, company, params=q)
        if r.status_code >= 400:
            return company, r, items
        body = r.json()
        items += body["items"]
        cursor = body["page"].get("next_cursor")
        if not body["page"].get("has_more") or not cursor:
            break
    return company, None, items


@router.api_route("/{path:path}", methods=["GET", "POST"], include_in_schema=False)
async def combined(path: str, request: Request, p: Principal = Depends(get_principal)):
    head = path.split("/", 1)[0]
    if head not in ALLOWED:
        raise NotFound("This isn't available across companies. Open one company to use it.")
    companies = _companies(p.user_id, p.org_id)
    base = f"/api/v1/{path}"
    headers = _forward_headers(request)
    transport = httpx.ASGITransport(app=request.app)

    async with httpx.AsyncClient(transport=transport, base_url="http://flyfleet.internal", timeout=60) as client:
        if request.method == "POST":
            return await _write(client, request, base, headers, companies)
        params = {k: v for k, v in request.query_params.items() if k != "organization_id"}
        wanted = set(request.query_params.getlist("organization_id"))
        picked = [c for c in companies if not wanted or str(c.organization_id) in wanted or c.slug in wanted or c.code in wanted]
        if wanted and not picked:
            raise NotFound("Company not found")

        # A first probe tells a list from a summary or a file.
        probe_params = {k: v for k, v in params.items() if k != "cursor"}
        if "limit" in probe_params:
            probe_params["limit"] = 1
        probe = await asyncio.gather(*[_call(client, "GET", base, headers, c, params=probe_params) for c in picked])
        ok = [(c, r) for c, r in probe if r.status_code < 400]
        if not ok:
            c, r = probe[0] if probe else (None, None)
            if r is None:
                return JSONResponse({"items": [], "page": {"has_more": False, "next_cursor": None, "total_count": 0},
                                     "by_company": []})
            return Response(r.content, status_code=r.status_code, media_type=r.headers.get("content-type"))
        ctype = ok[0][1].headers.get("content-type", "")
        if "json" not in ctype:
            return await _files(client, base, headers, picked, params, ok)
        first = ok[0][1].json()
        if not (isinstance(first, dict) and "items" in first and "page" in first):
            return {"by_company": [{"organization": _ref(c), "data": r.json()} for c, r in ok],
                    "totals": _totals([r.json() for _, r in ok])}
        return await _list(client, request, base, headers, picked, params)


async def _list(client, request: Request, base: str, headers: dict, picked: list, params: dict):
    limit = max(1, min(int(params.get("limit", DEFAULT_LIMIT)), MAX_LIMIT))
    offset = _offset(params.get("cursor"))
    need = min(offset + limit + 1, FETCH_CAP)
    inner = {k: v for k, v in params.items() if k not in ("cursor", "limit")}
    results = await asyncio.gather(*[_fetch_all(client, base, headers, c, inner, need) for c in picked])
    rows, counts, more = [], [], False
    for c, err, items in results:
        if err is not None:
            continue
        ref = _ref(c)
        counts.append({"organization": ref, "count": len(items)})
        rows += [{**i, "organization": ref} for i in items]
    sort = inner.get("sort") or ""
    key = sort.lstrip("-")
    if key and rows and key in rows[0]:
        rows.sort(key=lambda i: _sortable(i.get(key)), reverse=sort.startswith("-"))
    page = rows[offset:offset + limit]
    more = len(rows) > offset + limit
    info = {"next_cursor": _cursor(offset + limit) if more else None, "has_more": more, "total_count": None}
    if params.get("count") in ("true", "1"):
        totals = await asyncio.gather(*[_call(client, "GET", base, headers, c, params={**inner, "limit": 1, "count": "true"})
                                        for c in picked])
        by = []
        for c, r in totals:
            if r.status_code < 400:
                by.append({"organization": _ref(c), "count": (r.json()["page"].get("total_count") or 0)})
        counts = by
        info["total_count"] = sum(b["count"] for b in by)
    return {"items": page, "page": info, "by_company": counts,
            "meta": {"request_id": request.headers.get("x-request-id"), "generated_at": None}}


def _totals(docs: list) -> dict:
    """Counts add across companies; money and anything else stays by company (currencies are never mixed)."""
    out: dict = {}
    for d in docs:
        if not isinstance(d, dict):
            continue
        for k, v in d.items():
            if isinstance(v, int) and not isinstance(v, bool):
                out[k] = out.get(k, 0) + v
    return out


async def _files(client, base, headers, picked, params, ok):
    """Exports: one CSV with a Company column. Other file types come from one company at a time."""
    if "csv" not in ok[0][1].headers.get("content-type", ""):
        raise Invalid("Open one company to download this file.", code="SINGLE_COMPANY_ONLY")
    out, header = io.StringIO(), None
    writer = csv.writer(out)
    for c, r in ok:
        lines = list(csv.reader(io.StringIO(r.text)))
        if not lines:
            continue
        if header is None:
            header = lines[0]
            writer.writerow(["Company", *header])
        for row in lines[1:]:
            writer.writerow([c.code, *row])
    return Response(out.getvalue(), media_type="text/csv")


async def _write(client, request: Request, base: str, headers: dict, companies: list):
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = None
    target = body.pop("organization_id", None) if isinstance(body, dict) else None
    if not target:
        raise Invalid("Choose which company this is for.", field="organization_id", code="COMPANY_REQUIRED")
    company = next((c for c in companies if str(c.organization_id) == str(target)), None)
    if company is None:
        raise NotFound("Company not found")
    _, r = await _call(client, "POST", base, headers, company, json=body, params=dict(request.query_params))
    return Response(r.content, status_code=r.status_code, media_type=r.headers.get("content-type"))
