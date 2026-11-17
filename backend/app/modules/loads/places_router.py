"""Where loads go: the facilities the company has saved or already sent trucks to, and how far a route is.

Distances are estimates: the straight line between the cities, stretched to road miles, as the live fleet's ETAs
use. A city that isn't on FlyFleet's map is said to be so rather than guessed at."""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import places
from app.core.crud import like
from app.core.deps import Principal, get_db, require
from app.modules.customers.models import Customer, CustomerAddress
from app.modules.loads.models import Load, LoadStop
from app.modules.tracking.incidents import ROAD_FACTOR

router = APIRouter(tags=["loads"])
KM_PER_MILE = 1.609344


class FacilityOption(BaseModel):
    label: str
    address: str | None
    city: str
    state: str | None
    postal_code: str | None
    contact_name: str | None = None
    contact_phone: str | None = None
    customer: str | None = Field(default=None, description="Whose saved facility it is")
    source: Literal["saved", "recent"]
    located: bool = Field(description="The city is on FlyFleet's map, so miles to it can be estimated")


@router.get("/facilities", response_model=list[FacilityOption],
            summary="Facilities to pick for a stop: customers' saved ones, then places loads already went")
def facilities(q: str = Query(default="", max_length=80), limit: int = Query(default=8, ge=1, le=25),
               p: Principal = Depends(require("loads.create", "loads.update")), db: Session = Depends(get_db)):
    term = q.strip()
    out: list[FacilityOption] = []
    seen: set[tuple[str, str]] = set()

    def add(option: FacilityOption) -> None:
        key = (option.label.strip().lower(), option.city.strip().lower())
        if key not in seen and len(out) < limit:
            seen.add(key)
            out.append(option)

    saved = select(CustomerAddress, Customer.name).join(Customer, Customer.id == CustomerAddress.customer_id)
    if term:
        pattern = like(term)
        saved = saved.where(or_(CustomerAddress.label.ilike(pattern), CustomerAddress.city.ilike(pattern),
                                CustomerAddress.address.ilike(pattern), Customer.name.ilike(pattern)))
    for address, customer in db.execute(saved.order_by(CustomerAddress.label).limit(limit)).all():
        add(FacilityOption(label=address.label, address=address.address, city=address.city, state=address.state,
                           postal_code=address.postal_code, contact_name=address.contact_name,
                           contact_phone=address.contact_phone, customer=customer, source="saved",
                           located=places.locate(address.city, address.state) is not None))
    if len(out) < limit:
        recent = (select(LoadStop.name, LoadStop.address, LoadStop.city, LoadStop.state, LoadStop.postal_code,
                         func.max(Load.created_at).label("last"))
                  .join(Load, Load.id == LoadStop.load_id)
                  .where(LoadStop.name.is_not(None))
                  .group_by(LoadStop.name, LoadStop.address, LoadStop.city, LoadStop.state, LoadStop.postal_code))
        if term:
            pattern = like(term)
            recent = recent.where(or_(LoadStop.name.ilike(pattern), LoadStop.city.ilike(pattern),
                                      LoadStop.address.ilike(pattern)))
        for name, address, city, state, postal, _ in db.execute(recent.order_by(func.max(Load.created_at).desc())
                                                                .limit(limit * 2)).all():
            add(FacilityOption(label=name, address=address, city=city, state=state, postal_code=postal,
                               source="recent", located=places.locate(city, state) is not None))
    return out


class RoutePoint(BaseModel):
    city: str = Field(default="", max_length=80)
    state: str | None = Field(default=None, max_length=40)


class RouteIn(BaseModel):
    stops: list[RoutePoint] = Field(max_length=20)


class RouteEstimate(BaseModel):
    located: list[bool] = Field(description="For each stop: whether its city is on the map")
    legs: list[int | None] = Field(description="Miles from the stop before, for each stop after the first")
    miles: int | None = Field(description="The whole route, when every leg could be estimated")


@router.post("/route-estimate", response_model=RouteEstimate, summary="Road miles between stops, estimated")
def route_estimate(body: RouteIn, p: Principal = Depends(require("loads.read")), db: Session = Depends(get_db)):
    points = [places.locate(stop.city, stop.state) if stop.city.strip() else None for stop in body.stops]
    legs: list[int | None] = []
    for before, after in zip(points, points[1:], strict=False):
        legs.append(round(places.km(*before, *after) * ROAD_FACTOR / KM_PER_MILE) if before and after else None)
    return RouteEstimate(located=[point is not None for point in points], legs=legs,
                         miles=sum(leg for leg in legs if leg is not None) if legs and None not in legs else None)
