"""Fuel & IFTA: purchases with their checks, miles by truck and state, tax rates, and the quarterly return."""
import csv
import io
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.deps import Principal, get_db, get_or_404, require
from app.core.errors import Conflict, Invalid
from app.core.money import Money
from app.modules.drivers.models import Driver
from app.modules.equipment.models import Vehicle
from app.modules.expenses.models import Expense
from app.modules.ifta import service
from app.modules.ifta.models import IftaReturn, IftaTrip, IftaTripMiles

router = APIRouter(prefix="/ifta", tags=["fuel"])
READ = require("expenses.read")
MANAGE = require("expenses.manage")


def _quarter(p: Principal, quarter: str | None) -> str:
    q = quarter or service.quarter_of(p.today())
    service.parse(q)
    return q


class Overview(BaseModel):
    quarter: str
    label: str
    miles: str
    states: int
    trucks: int
    sources: list[str]
    gallons: str
    amount: Money
    purchases: int
    mpg: str | None
    net_tax: Money
    states_due: int
    base: str | None
    base_net: Money | None
    status: str
    due_on: date
    days_left: int
    missing_rates: list[str]
    held_trips: int
    rates: int
    mileage_trucks: int


@router.get("/overview", response_model=Overview, summary="The quarter at a glance: miles, fuel, MPG, tax and status")
def overview(quarter: str | None = None, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    q = _quarter(p, quarter)
    v = service.view(db, p, q)
    base_line = next((x for x in v["lines"] if x["jurisdiction"] == v["base"]), None)
    due = [x for x in v["lines"] if x["tax"] is not None and Decimal(x["tax"]) > 0]
    return Overview(quarter=q, label=v["label"], miles=v["total_miles"], states=len(v["lines"]), trucks=v["trucks"],
                    sources=v["sources"], gallons=v["total_gallons"], amount=Decimal(v["amount"]),
                    purchases=v["purchases"], mpg=v["mpg"], net_tax=Decimal(v["net_tax"]), states_due=len(due),
                    base=v["base"], base_net=Decimal(base_line["tax"]) if base_line and base_line["tax"] else None,
                    status=v["status"], due_on=v["due_on"], days_left=(v["due_on"] - p.today()).days,
                    missing_rates=v["missing_rates"], held_trips=v["held_trips"],
                    rates=len(service.rates_for(db, q)), mileage_trucks=len(service.mileage(db, q)["rows"]))


class Purchase(BaseModel):
    id: uuid.UUID
    incurred_on: date
    created_at: datetime
    vehicle_id: uuid.UUID | None
    unit_number: str | None
    driver: str | None
    vendor: str | None
    paid_with: str | None
    reference: str | None
    jurisdiction: str | None
    category: str
    gallons: str | None
    price_per_gallon: str | None
    amount: Money
    tone: str
    check: str
    load_id: uuid.UUID | None


class Purchases(BaseModel):
    items: list[Purchase]
    total: int
    flagged: int
    receipts: int


@router.get("/purchases", response_model=Purchases, summary="Fuel bought in the quarter, newest first, with each one's check")
def purchases(quarter: str | None = None, show: Literal["all", "flagged", "receipts"] = "all", limit: int = 50,
              p: Principal = Depends(READ), db: Session = Depends(get_db)):
    q = _quarter(p, quarter)
    start, end = service.bounds(q)
    rows = list(db.scalars(select(Expense).where(
        Expense.incurred_on >= start, Expense.incurred_on <= end,
        or_(Expense.category == "fuel", Expense.paid_with == "fuel_card"))
        .order_by(Expense.incurred_on.desc(), Expense.created_at.desc())))
    checks = service.purchase_checks(db, rows)
    units = {v.id: v.unit_number for v in db.scalars(select(Vehicle).where(Vehicle.id.in_(
        [e.vehicle_id for e in rows if e.vehicle_id])))} if rows else {}
    drivers = {d.id: f"{d.first_name} {d.last_name}" for d in db.scalars(select(Driver).where(Driver.id.in_(
        [e.driver_id for e in rows if e.driver_id])))} if rows else {}
    flagged = [e for e in rows if checks[e.id][0] in ("warn", "bad", "info")]
    with_receipt = [e for e in rows if checks[e.id][1].startswith("Receipt")]
    chosen = flagged if show == "flagged" else with_receipt if show == "receipts" else rows
    items = []
    for e in chosen[:max(1, min(limit, 200))]:
        tone, label, load_id = checks[e.id]
        items.append(Purchase(
            id=e.id, incurred_on=e.incurred_on, created_at=e.created_at, vehicle_id=e.vehicle_id,
            unit_number=units.get(e.vehicle_id), driver=drivers.get(e.driver_id), vendor=e.vendor,
            paid_with=e.paid_with, reference=e.reference, jurisdiction=e.jurisdiction, category=e.category,
            gallons=f"{e.gallons:.1f}" if e.gallons else None,
            price_per_gallon=f"{(e.amount / e.gallons):.3f}" if e.gallons else None, amount=e.amount,
            tone=tone, check=label, load_id=load_id))
    return Purchases(items=items, total=len(rows), flagged=len(flagged), receipts=len(with_receipt))


class Receipt(BaseModel):
    document_id: uuid.UUID
    filename: str
    title: str
    detail: str
    created_at: datetime
    status: str
    tone: str
    expense_id: uuid.UUID | None


@router.get("/receipts", response_model=list[Receipt], summary="Scanned fuel receipts, newest first")
def receipts(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return [Receipt(**r) for r in service.receipts(db)]


class MileageRow(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str
    driver: str | None
    miles: dict[str, str]
    total: str
    gallons: str
    mpg: str | None
    sources: list[str]
    held: int


class Gap(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str
    kind: str
    title: str
    detail: str
    trip_id: uuid.UUID | None = None


class Mileage(BaseModel):
    quarter: str
    states: list[str]
    rows: list[MileageRow]
    gaps: list[Gap]
    totals: dict[str, str]
    total: str


@router.get("/mileage", response_model=Mileage, summary="Miles by truck and state, MPG per truck, and the gaps to review")
def mileage(quarter: str | None = None, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return Mileage(**service.mileage(db, _quarter(p, quarter)))


class Source(BaseModel):
    kind: Literal["import", "manual"]
    ext: str
    title: str
    detail: str
    status: str
    tone: str
    import_id: uuid.UUID | None
    vehicle_id: uuid.UUID | None
    at: datetime


@router.get("/sources", response_model=list[Source], summary="Mileage imports and trips entered by hand, newest first")
def sources(quarter: str | None = None, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return [Source(**x) for x in service.sources(db, _quarter(p, quarter))]


class StateMiles(BaseModel):
    jurisdiction: str = Field(min_length=2, max_length=40)
    miles: Decimal = Field(ge=0, le=100000)


class TripIn(BaseModel):
    vehicle_id: uuid.UUID
    trip_date: date
    load_id: uuid.UUID | None = None
    miles: list[StateMiles] = Field(min_length=1, max_length=20)
    odometer_start: int | None = Field(default=None, ge=0)
    odometer_end: int | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=300)


class TripOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    trip_date: date
    source: str
    held: bool
    miles: dict[str, str]


def _trip_out(db: Session, trip: IftaTrip) -> TripOut:
    miles = {m.jurisdiction: str(m.miles) for m in db.scalars(select(IftaTripMiles).where(IftaTripMiles.trip_id == trip.id))}
    return TripOut(id=trip.id, vehicle_id=trip.vehicle_id, trip_date=trip.trip_date, source=trip.source, held=trip.held,
                   miles=miles)


@router.post("/trips", response_model=TripOut, status_code=201,
             summary="A trip entered by hand: miles by state for a truck without GPS, marked manual on the return")
def add_trip(body: TripIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    trip = service.add_trip(db, p, vehicle_id=body.vehicle_id, trip_date=body.trip_date, load_id=body.load_id,
                            miles=[(m.jurisdiction, m.miles) for m in body.miles], odometer_start=body.odometer_start,
                            odometer_end=body.odometer_end, note=body.note)
    audit(db, p, "ifta.trip_added", "vehicle", body.vehicle_id,
          {"trip_id": str(trip.id), "date": body.trip_date.isoformat(),
           "miles": {m.jurisdiction: str(m.miles) for m in body.miles}})
    db.commit()
    return _trip_out(db, trip)


def _editable_trip(db: Session, trip_id: uuid.UUID) -> IftaTrip:
    trip = get_or_404(db, IftaTrip, trip_id, "Trip")
    r = service.get_return(db, service.quarter_of(trip.trip_date))
    if r is not None and r.status in ("approved", "filed", "paid"):
        raise Conflict(f"The {service.label(r.quarter)} return is {r.status}. Reopen it first.", code="RETURN_LOCKED")
    return trip


@router.post("/trips/{trip_id}/release", response_model=TripOut, summary="Count held imported miles on the return")
def release(trip_id: uuid.UUID, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    trip = _editable_trip(db, trip_id)
    trip.held = False
    audit(db, p, "ifta.trip_released", "vehicle", trip.vehicle_id, {"trip_id": str(trip.id)})
    db.commit()
    return _trip_out(db, trip)


@router.delete("/trips/{trip_id}", status_code=204, summary="Remove a trip's miles")
def remove(trip_id: uuid.UUID, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    trip = _editable_trip(db, trip_id)
    audit(db, p, "ifta.trip_removed", "vehicle", trip.vehicle_id, {"trip_id": str(trip.id), "date": trip.trip_date.isoformat()})
    db.delete(trip)
    db.commit()


class RateRow(BaseModel):
    jurisdiction: str
    name: str
    rate: str | None
    surcharge: str | None
    change: str | None
    miles: str
    source: str | None
    updated_at: datetime | None


class RateIn(BaseModel):
    jurisdiction: str = Field(min_length=2, max_length=40)
    rate: Decimal = Field(ge=0, le=5)
    surcharge: Decimal = Field(default=Decimal("0"), ge=0, le=5)


class RatesIn(BaseModel):
    rates: list[RateIn] = Field(min_length=1, max_length=80)


@router.get("/rates", response_model=list[RateRow], summary="The quarter's diesel rates for the states the trucks ran in")
def rates(quarter: str | None = None, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    return [RateRow(**r) for r in service.rates_view(db, _quarter(p, quarter))]


@router.put("/rates/{quarter}", response_model=list[RateRow], summary="Enter or correct the quarter's rates")
def put_rates(quarter: str, body: RatesIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.set_rates(db, p, quarter, [(r.jurisdiction, r.rate, r.surcharge) for r in body.rates], "manual")
    db.commit()
    return [RateRow(**r) for r in service.rates_view(db, quarter)]


@router.post("/rates/import", response_model=list[RateRow],
             summary="Bring the quarter's rates in from the tax matrix as a CSV: jurisdiction, rate and surcharge")
def import_rates(quarter: str = Form(...), file: UploadFile = File(...), p: Principal = Depends(MANAGE),
                 db: Session = Depends(get_db)):
    text = file.file.read(1_000_000).decode("utf-8-sig", errors="replace")
    rows = []
    for line in csv.reader(io.StringIO(text)):
        cells = [c.strip() for c in line]
        if len(cells) < 2 or not cells[0] or cells[0].lower() in ("jurisdiction", "state"):
            continue
        try:
            rate = Decimal(cells[1].replace("$", ""))
            surcharge = Decimal(cells[2].replace("$", "")) if len(cells) > 2 and cells[2] else Decimal("0")
        except InvalidOperation as e:
            raise Invalid(f"“{cells[1]}” for {cells[0]} isn't a rate", field="file") from e
        rows.append((cells[0], rate, surcharge))
    if not rows:
        raise Invalid("The file has no rates: one row per jurisdiction, with its rate", field="file")
    service.set_rates(db, p, quarter, rows, "import")
    db.commit()
    return [RateRow(**r) for r in service.rates_view(db, quarter)]


class ReturnLine(BaseModel):
    jurisdiction: str
    name: str
    total_miles: str
    taxable_miles: str
    taxable_gallons: str
    tax_paid_gallons: str
    net_gallons: str
    rate: str | None
    surcharge: str | None
    tax: str | None


class HistoryItem(BaseModel):
    who: str
    what: str
    when: datetime
    tone: str


class ReturnOut(BaseModel):
    quarter: str
    label: str
    status: str
    estimate: bool
    period_start: date
    period_end: date
    due_on: date
    base: str | None
    lines: list[ReturnLine]
    total_miles: str
    total_gallons: str
    mpg: str | None
    net_tax: str
    missing_rates: list[str]
    held_trips: int
    version: int
    filed_on: date | None
    filed_reference: str | None
    paid_on: date | None
    reviewed_at: datetime | None
    approved_at: datetime | None
    reviewed_by_name: str | None = None
    approved_by_name: str | None = None
    allowed_actions: list[str]
    history: list[HistoryItem] = []


class ReturnRow(BaseModel):
    quarter: str
    label: str
    status: str
    net_tax: str | None
    filed_on: date | None
    paid_on: date | None


def _names(db: Session, ids: list) -> dict:
    from app.modules.organizations.models import User
    ids = [x for x in ids if x]
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


def _return_out(db: Session, p: Principal, quarter: str) -> ReturnOut:
    v = service.view(db, p, quarter)
    names = _names(db, [v["reviewed_by"], v["approved_by"]])
    status = v["status"]
    end = v["period_end"]
    allowed = {"collecting": ["review"] if p.today() > end else [], "in_review": ["approve", "reopen"],
               "approved": ["file", "reopen"], "filed": ["pay"], "paid": []}[status] if p.can("expenses.manage") else []
    return ReturnOut(**{k: v[k] for k in ("quarter", "label", "status", "estimate", "period_start", "period_end", "due_on",
                                          "base", "total_miles", "total_gallons", "mpg", "net_tax", "missing_rates",
                                          "held_trips", "version", "filed_on", "filed_reference", "paid_on",
                                          "reviewed_at", "approved_at")},
                     lines=[ReturnLine(**x) for x in v["lines"]], reviewed_by_name=names.get(v["reviewed_by"]),
                     approved_by_name=names.get(v["approved_by"]), allowed_actions=allowed,
                     history=[HistoryItem(**h) for h in service.history(db, service.get_return(db, quarter))])


@router.get("/returns", response_model=list[ReturnRow], summary="Returns by quarter, newest first")
def returns(p: Principal = Depends(READ), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(IftaReturn).order_by(IftaReturn.quarter.desc())))
    return [ReturnRow(quarter=r.quarter, label=service.label(r.quarter), status=r.status,
                      net_tax=str(r.net_tax) if r.net_tax is not None else None, filed_on=r.filed_on, paid_on=r.paid_on)
            for r in rows]


@router.get("/returns/{quarter}", response_model=ReturnOut, summary="A quarter's return: by state, with its status")
def get_return(quarter: str, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    service.parse(quarter)
    return _return_out(db, p, quarter)


class ActionIn(BaseModel):
    action: Literal["review", "approve", "reopen", "file", "pay"]
    version: int
    filed_on: date | None = None
    reference: str | None = Field(default=None, max_length=80)
    paid_on: date | None = None
    note: str | None = Field(default=None, max_length=1000)


@router.post("/returns/{quarter}/actions", response_model=ReturnOut,
             summary="Move the return on: review, approve (fixes its lines), file, record payment, or reopen")
def act(quarter: str, body: ActionIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.parse(quarter)
    service.transition(db, p, quarter, body.action, body.version, filed_on=body.filed_on, reference=body.reference,
                       paid_on=body.paid_on, note=body.note)
    db.commit()
    return _return_out(db, p, quarter)


@router.get("/returns/{quarter}/export", summary="The return as CSV: one row per truck, state and trip",
            responses={200: {"content": {"text/csv": {}}}})
def export(quarter: str, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    start, end = service.bounds(quarter)
    trips = list(db.scalars(select(IftaTrip).where(IftaTrip.trip_date >= start, IftaTrip.trip_date <= end)
                            .order_by(IftaTrip.trip_date)))
    units = {v.id: v.unit_number for v in db.scalars(select(Vehicle).where(Vehicle.id.in_([t.vehicle_id for t in trips])))} \
        if trips else {}
    miles = {}
    if trips:
        for m in db.scalars(select(IftaTripMiles).where(IftaTripMiles.trip_id.in_([t.id for t in trips]))):
            miles.setdefault(m.trip_id, []).append(m)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Quarter", "Truck", "Date", "State", "Miles", "Source", "Held", "Trip"])
    for t in trips:
        for m in miles.get(t.id, []):
            w.writerow([quarter, units.get(t.vehicle_id, ""), t.trip_date.isoformat(), m.jurisdiction, m.miles, t.source,
                        "yes" if t.held else "", t.id])
    v = service.view(db, p, quarter)
    w.writerow([])
    w.writerow(["State", "Total miles", "Taxable miles", "Taxable gallons", "Tax-paid gallons", "Net gallons", "Rate",
                "Tax (credit)"])
    for line in v["lines"]:
        w.writerow([line["jurisdiction"], line["total_miles"], line["taxable_miles"], line["taxable_gallons"],
                    line["tax_paid_gallons"], line["net_gallons"], line["rate"] or "", line["tax"] or ""])
    audit(db, p, "ifta.return_exported", "ifta_return", None, {"quarter": quarter})
    db.commit()
    return Response(content="﻿" + out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="ifta-{quarter}.csv"'})


@router.get("/returns/{quarter}/pdf", summary="The return's jurisdiction schedule as a PDF",
            responses={200: {"content": {"application/pdf": {}}}})
def return_pdf(quarter: str, p: Principal = Depends(READ), db: Session = Depends(get_db)):
    service.parse(quarter)
    content = service.return_pdf(db, p, quarter)
    audit(db, p, "ifta.return_exported", "ifta_return", None, {"quarter": quarter, "format": "pdf"})
    db.commit()
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="ifta-{quarter}.pdf"'})


class Week(BaseModel):
    week_start: date
    amount: str
    gallons: str
    miles: str
    cost_per_mile: str | None
    price_per_gallon: str | None
    mpg: str | None


class TruckMpg(BaseModel):
    vehicle_id: uuid.UUID
    unit_number: str
    driver: str | None
    mpg: str | None
    miles: str
    gallons: str


class FuelReport(BaseModel):
    weeks: list[Week]
    trucks: list[TruckMpg]
    fleet_mpg: str | None
    quarter: str
    amount: str
    gallons: str
    net_tax: str
    miles: str
    cost_per_mile: str | None
    previous_cost_per_mile: str | None
    previous_mpg: str | None
    base: str | None
    base_tax: str | None
    missing_rates: list[str]


@router.get("/report", response_model=FuelReport, summary="Fuel cost per mile by week, and MPG by truck against the fleet",
            responses={200: {"content": {"text/csv": {}}}})
def report(weeks: int = 8, vehicle_id: uuid.UUID | None = None, format: Literal["json", "csv"] = "json",
           p: Principal = Depends(require("reports.read")), db: Session = Depends(get_db)):
    data = service.weekly(db, p, max(2, min(weeks, 26)), vehicle_id)
    if format == "csv":
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["Week of", "Fuel spend", "Gallons", "Miles", "Diesel per gallon", "MPG", "Fuel cost per mile"])
        for x in data["weeks"]:
            w.writerow([x["week_start"].isoformat(), x["amount"], x["gallons"], x["miles"], x["price_per_gallon"] or "",
                        x["mpg"] or "", x["cost_per_mile"] or ""])
        audit(db, p, "report.exported", "report", None, {"report": "fuel", "weeks": weeks})
        db.commit()
        return Response(content="\ufeff" + out.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="fuel_{data["quarter"]}_{weeks}w.csv"'})
    return FuelReport(**data)
