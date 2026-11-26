import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core import scope as team_scope
from app.core.audit import audit
from app.core.crud import child_router
from app.core.deps import Principal, get_db, require
from app.core.errors import Forbidden, Invalid
from app.core.idempotency import run_idempotent
from app.core.pagination import Page, envelope
from app.modules.loads import bol, service, workflow
from app.modules.loads import schemas as s
from app.modules.loads.models import Load, LoadCharge, LoadItem

router = APIRouter(tags=["loads"])


@router.get("/loads", response_model=Page[s.LoadListItem])
def list_loads(params: Annotated[s.LoadListParams, Query()], p: Principal = Depends(require("loads.read")),
               db: Session = Depends(get_db)):
    items, info = service.list_loads(db, p, params)
    return envelope(items, info)


@router.get("/loads/facets", response_model=s.LoadFacets, summary="How many loads each filter value would show")
def load_facets(params: Annotated[s.LoadListParams, Query()], p: Principal = Depends(require("loads.read")),
                db: Session = Depends(get_db)):
    return service.facets(db, p, params)


@router.get("/loads/export.csv", response_class=Response, summary="The filtered list as CSV",
            responses={200: {"content": {"text/csv": {}}}})
def export_loads(params: Annotated[s.LoadListParams, Query()], p: Principal = Depends(require("loads.read")),
                 db: Session = Depends(get_db)):
    """Every load the filters match, up to 10,000. Rates and margin only for roles that may see them."""
    import csv
    import io
    rates = p.can("loads.rates.read")
    head = ["Load", "Status", "Customer", "PO", "BOL", "Pickup #", "Delivery #", "Origin", "Destination", "Pickup",
            "Delivery", "Equipment", "Miles", "Driver", "Risk"] + (["Revenue", "Margin", "Margin %"] if rates else [])
    buf = io.StringIO()
    out = csv.writer(buf)
    out.writerow(head)
    cursor, written = None, 0
    while written < 10_000:
        page = params.model_copy(update={"cursor": cursor, "limit": 200, "count": False})
        items, info = service.list_loads(db, p, page)
        for x in items:
            place = lambda c, st: ", ".join(v for v in (c, st) if v)  # noqa: E731
            row = [x.load_number, x.status, x.customer.name, x.reference or "", x.bol_number or "",
                   x.pickup_number or "", x.delivery_number or "", place(x.origin_city, x.origin_state),
                   place(x.destination_city, x.destination_state), x.pickup_at.isoformat() if x.pickup_at else "",
                   x.delivery_at.isoformat() if x.delivery_at else "", x.equipment_type, x.miles or "",
                   x.assignment.driver.name if x.assignment else "", "; ".join(r.label for r in x.risks)]
            if rates:
                row += [x.revenue, x.margin if x.margin is not None else "", x.margin_pct if x.margin_pct is not None
                        else ""]
            out.writerow(row)
            written += 1
        cursor = info.next_cursor
        if not cursor:
            break
    audit(db, p, "loads.exported", "load", None, {"rows": written})
    db.commit()
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="flyfleet-loads.csv"'})


@router.get("/loads/bols.pdf", response_class=Response, summary="Bills of lading to print, one page per load",
            responses={200: {"content": {"application/pdf": {}}}})
def print_bols(ids: Annotated[list[uuid.UUID], Query(max_length=50)], p: Principal = Depends(require("loads.read")),
               db: Session = Depends(get_db)):
    if not ids:
        raise Invalid("Choose the loads to print", field="ids")
    content, printed = bol.bols_pdf(db, p, ids)
    audit(db, p, "load.bols_printed", "load", printed[0].id if len(printed) == 1 else None,
          {"loads": [load.load_number for load in printed]})
    db.commit()
    name = f"bol-{printed[0].load_number}.pdf" if len(printed) == 1 else f"bols-{len(printed)}-loads.pdf"
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{name}"'})


@router.post("/loads", response_model=s.LoadDetail, status_code=201)
def create_load(body: s.LoadCreate, p: Principal = Depends(require("loads.create")), db: Session = Depends(get_db),
                idempotency_key: Annotated[str | None, Header()] = None):
    """Book a load. Send an Idempotency-Key so a retried request can't book it twice."""
    def work():
        load = service.create_load(db, p, body)
        db.flush()
        return 201, service.load_detail(db, p, load.id)
    return run_idempotent(db, p, idempotency_key, "POST /loads", body.model_dump(mode="json"), work)


@router.get("/loads/{load_id}", response_model=s.LoadDetail)
def get_load(load_id: uuid.UUID, p: Principal = Depends(require("loads.read")), db: Session = Depends(get_db)):
    return service.load_detail(db, p, load_id)


@router.patch("/loads/{load_id}", response_model=s.LoadDetail)
def update_load(load_id: uuid.UUID, body: s.LoadUpdate, p: Principal = Depends(require("loads.update")),
                db: Session = Depends(get_db)):
    service.update_load(db, p, load_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.post("/loads/{load_id}/transitions", response_model=s.LoadDetail)
def transition(load_id: uuid.UUID, body: s.TransitionIn, p: Principal = Depends(require("loads.read")),
               db: Session = Depends(get_db)):
    """Move a load through its lifecycle. The action decides which permission is needed."""
    load = service.lock_load(db, load_id, p)
    service.check_version(load, body.version)
    service.transition(db, p, load, body.action, reason=body.reason, stop_id=body.stop_id,
                       occurred_at=body.occurred_at)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.post("/loads/{load_id}/board-move", response_model=s.LoadDetail,
             summary="Drop a load in a board column; refused with the reason when the move isn't possible")
def board_move(load_id: uuid.UUID, body: s.BoardMoveIn, p: Principal = Depends(require("loads.update")),
               db: Session = Depends(get_db)):
    workflow.board_move(db, p, load_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.post("/loads/{load_id}/duplicate", response_model=s.LoadDetail, status_code=201,
             summary="Copy a load as a new draft")
def duplicate_load(load_id: uuid.UUID, p: Principal = Depends(require("loads.create")),
                   db: Session = Depends(get_db)):
    copy = workflow.duplicate(db, p, load_id)
    db.commit()
    return service.load_detail(db, p, copy.id)


class VersionIn(BaseModel):
    version: int


@router.post("/loads/{load_id}/undo-cancel", response_model=s.LoadDetail, summary="Put back a just-cancelled load")
def undo_cancel(load_id: uuid.UUID, body: VersionIn, p: Principal = Depends(require("loads.cancel")),
                db: Session = Depends(get_db)):
    workflow.undo_cancel(db, p, load_id, body.version)
    db.commit()
    return service.load_detail(db, p, load_id)


class ChargeReviewIn(BaseModel):
    verdict: s.ChargeStatus
    charge_ids: list[uuid.UUID] | None = Field(default=None, max_length=50, description="Left out: every pending one")


@router.post("/loads/{load_id}/charges/review", response_model=s.LoadDetail,
             summary="Approve or reject extra charges")
def review_charges(load_id: uuid.UUID, body: ChargeReviewIn, p: Principal = Depends(require("loads.update")),
                   db: Session = Depends(get_db)):
    workflow.review_charges(db, p, load_id, body.charge_ids, body.verdict)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.put("/loads/{load_id}/tracking-link", response_model=s.LoadDetail,
            summary="Turn the customer's tracking link on or off, and choose what it shows")
def set_tracking_link(load_id: uuid.UUID, body: s.TrackingLinkIn, p: Principal = Depends(require("loads.update")),
                      db: Session = Depends(get_db)):
    workflow.set_link(db, p, load_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.post("/loads/{load_id}/tracking-link/send", response_model=s.LoadDetail,
             summary="Email the tracking link to the customer")
def send_tracking_link(load_id: uuid.UUID, body: s.TrackingSendIn, p: Principal = Depends(require("loads.update")),
                       db: Session = Depends(get_db)):
    workflow.send_link(db, p, load_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


class InvoiceMade(BaseModel):
    invoice_id: uuid.UUID


@router.post("/loads/{load_id}/invoice", response_model=InvoiceMade, status_code=201,
             summary="Make a draft invoice for this load once it is ready")
def invoice_load(load_id: uuid.UUID, p: Principal = Depends(require("invoices.create")),
                 db: Session = Depends(get_db)):
    invoice_id = workflow.create_invoice(db, p, load_id)
    db.commit()
    return InvoiceMade(invoice_id=invoice_id)


class Ingested(BaseModel):
    accepted: int


@router.post("/reefer/readings", response_model=Ingested, status_code=202, tags=["tracking"],
             summary="Trailer temperatures from reefer units or telematics")
def ingest_reefer(body: s.ReeferIn, p: Principal = Depends(require("tracking.ingest")),
                  db: Session = Depends(get_db)):
    n = workflow.ingest_reefer(db, p, body)
    db.commit()
    return Ingested(accepted=n)


class LoadCosts(BaseModel):
    """What the margin estimate takes a mile to cost. One set per company."""
    driver_pay_per_mile: Decimal = Field(ge=0, le=20, max_digits=8, decimal_places=3)
    mpg: Decimal = Field(gt=0, le=30, max_digits=8, decimal_places=3)
    fuel_price: Decimal = Field(ge=0, le=20, max_digits=8, decimal_places=3)
    overhead_per_mile: Decimal = Field(ge=0, le=20, max_digits=8, decimal_places=3)


@router.get("/load-costs", response_model=LoadCosts, summary="The company's cost rates for margin estimates")
def get_costs(p: Principal = Depends(require("loads.rates.read")), db: Session = Depends(get_db)):
    return LoadCosts(**vars(service.costs_of(db, p.org_id)))


@router.put("/load-costs", response_model=LoadCosts, summary="Change the company's cost rates")
def set_costs(body: LoadCosts, p: Principal = Depends(require("organization.manage")),
              db: Session = Depends(get_db)):
    from app.modules.organizations.models import Organization
    if not p.can("loads.rates.read"):
        raise Forbidden("Your role does not allow seeing rates")
    org = db.get(Organization, p.org_id)
    for k, v in body.model_dump().items():
        setattr(org, f"cost_{k}", v)
    audit(db, p, "organization.load_costs", "organization", p.org_id, body.model_dump(mode="json"))
    db.commit()
    return body


class PodRequestOut(BaseModel):
    driver: str
    sent: bool = Field(description="False when the driver isn't on the driver app, so nothing reached them")
    times: int = Field(description="How many times the driver has been asked for this load")
    conversation_id: uuid.UUID


@router.post("/loads/{load_id}/pod-request", response_model=PodRequestOut,
             summary="Ask the driver for the signed proof of delivery")
def request_pod(load_id: uuid.UUID, p: Principal = Depends(require("loads.update", "loads.close")),
                db: Session = Depends(get_db)):
    """Whoever changes loads, or reviews their proof of delivery, can ask the driver for it."""
    from app.modules.messaging import service as messaging
    load = service.lock_load(db, load_id, p)
    out = messaging.request_pod(db, p, load)
    db.commit()
    return PodRequestOut(**out)


@router.put("/loads/{load_id}/stops", response_model=s.LoadDetail)
def replace_stops(load_id: uuid.UUID, body: s.StopsReplace, p: Principal = Depends(require("loads.update")),
                  db: Session = Depends(get_db)):
    """Set the whole route at once: add, remove and reorder stops. Allowed until the load is dispatched."""
    service.set_stops(db, p, load_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.patch("/loads/{load_id}/stops/{stop_id}", response_model=s.LoadDetail)
def update_stop(load_id: uuid.UUID, stop_id: uuid.UUID, body: s.StopPatch,
                p: Principal = Depends(require("loads.update")), db: Session = Depends(get_db)):
    """Change a stop's appointment or contact. Allowed until the truck has left that stop."""
    service.patch_stop(db, p, load_id, stop_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.post("/loads/{load_id}/notes", response_model=s.LoadDetail, status_code=201)
def add_note(load_id: uuid.UUID, body: s.NoteIn, p: Principal = Depends(require("loads.update")),
             db: Session = Depends(get_db)):
    service.add_note(db, p, load_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


@router.post("/loads/{load_id}/tracking", response_model=s.LoadDetail, status_code=201)
def add_check_call(load_id: uuid.UUID, body: s.TrackingIn, p: Principal = Depends(require("loads.update")),
                   db: Session = Depends(get_db)):
    """Record where the truck is, or that something has gone wrong."""
    service.add_tracking(db, p, load_id, body)
    db.commit()
    return service.load_detail(db, p, load_id)


def _prepare_charge(db: Session, p: Principal, data: dict, obj) -> None:
    if obj is not None and obj.managed:
        from app.core.errors import Conflict
        raise Conflict("The fuel surcharge follows the rate and the load’s fuel percent. Change those instead.")
    quantity = data.get("quantity") or (obj.quantity if obj is not None else None)
    rate = data.get("rate") if data.get("rate") is not None else (obj.rate if obj is not None else None)
    for required in ("type", "quantity", "rate", "billable", "driver_payable"):
        if required in data and data[required] is None:
            data.pop(required)  # an explicit null means "leave it"
    if quantity is not None and rate is not None:
        data["amount"] = service.charge_amount(quantity, rate)


router.include_router(child_router(
    prefix="/loads/{parent_id}/items", tag="loads", entity="load_item", label="item", model=LoadItem,
    parent_model=Load, parent_fk="load_id", parent_label="Load", create_schema=s.ItemIn, update_schema=s.ItemPatch,
    read_schema=s.ItemOut, read_perm="loads.read", write_perm="loads.update", parent_guard=service.guard_open,
    after_change=service.after_item_change, parent_scope=lambda p: team_scope.loads(p.scope)))
router.include_router(child_router(
    prefix="/loads/{parent_id}/charges", tag="loads", entity="load_charge", label="charge", model=LoadCharge,
    parent_model=Load, parent_fk="load_id", parent_label="Load", create_schema=s.ChargeIn,
    update_schema=s.ChargePatch, read_schema=s.ChargeOut, read_perm="loads.rates.read", write_perm="loads.update",
    before_save=_prepare_charge, parent_guard=service.guard_rates, after_change=service.after_charge_change,
    parent_scope=lambda p: team_scope.loads(p.scope)))
