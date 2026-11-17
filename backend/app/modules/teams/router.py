"""Dispatch teams: which trucks a group of dispatchers works, and what a dispatcher on no team sees."""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import Principal, get_db, require
from app.modules.teams import service

router = APIRouter(tags=["dispatch teams"])
MANAGE = require("users.manage")
Queue = Literal["tagged", "shared"]


class TeamDispatcher(BaseModel):
    id: uuid.UUID
    name: str
    lead: bool


class TeamTruck(BaseModel):
    id: uuid.UUID
    unit_number: str
    driver_name: str | None


class TeamOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    unassigned_loads: Queue
    lead_user_id: uuid.UUID | None
    created_at: datetime
    created_by_name: str | None
    version: int
    open_loads: int
    dispatchers: list[TeamDispatcher]
    vehicles: list[TeamTruck]


class NoTeam(BaseModel):
    dispatchers: list[TeamDispatcher]
    vehicles: int


class DispatcherChoice(BaseModel):
    id: uuid.UUID
    name: str
    team_id: uuid.UUID | None


class TruckChoice(BaseModel):
    id: uuid.UUID
    unit_number: str
    driver_name: str | None
    team_id: uuid.UUID | None


class TeamChange(BaseModel):
    who: str
    what: str
    at: datetime


class TeamsOverview(BaseModel):
    teams: list[TeamOut]
    no_team: NoTeam
    total_vehicles: int
    dispatchers_without_team: Literal["all", "none"]
    dispatchers: list[DispatcherChoice]
    trucks: list[TruckChoice]
    changes: list[TeamChange]
    colors: list[str]


class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str | None = None
    unassigned_loads: Queue = "tagged"
    user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    vehicle_ids: list[uuid.UUID] = Field(default_factory=list, max_length=2000)
    lead_user_id: uuid.UUID | None = None


class TeamPatch(BaseModel):
    version: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: str | None = None
    unassigned_loads: Queue | None = None
    lead_user_id: uuid.UUID | None = None
    clear_lead: bool = False


class TeamMembersIn(BaseModel):
    user_ids: list[uuid.UUID] = Field(max_length=200)
    lead_user_id: uuid.UUID | None = None


class TeamTrucksIn(BaseModel):
    vehicle_ids: list[uuid.UUID] = Field(max_length=2000)


class TeamDefaultIn(BaseModel):
    dispatchers_without_team: Literal["all", "none"]


def _overview(db: Session, p: Principal):
    return service.overview(db, p)


@router.get("/dispatch-teams", response_model=TeamsOverview)
def list_teams(p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """Every dispatch team with its dispatchers and trucks, who is on no team, and the latest changes."""
    return _overview(db, p)


@router.post("/dispatch-teams", response_model=TeamsOverview, status_code=201)
def create_team(body: TeamIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.create(db, p, name=body.name, color=body.color, unassigned_loads=body.unassigned_loads,
                   user_ids=body.user_ids, vehicle_ids=body.vehicle_ids, lead_user_id=body.lead_user_id)
    db.commit()
    return _overview(db, p)


@router.patch("/dispatch-teams/{team_id}", response_model=TeamsOverview)
def update_team(team_id: uuid.UUID, body: TeamPatch, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    service.update(db, p, service._team(db, team_id), version=body.version, name=body.name, color=body.color,
                   unassigned_loads=body.unassigned_loads, lead_user_id=body.lead_user_id, clear_lead=body.clear_lead)
    db.commit()
    return _overview(db, p)


@router.put("/dispatch-teams/{team_id}/members", response_model=TeamsOverview)
def set_members(team_id: uuid.UUID, body: TeamMembersIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """The team's dispatchers. A dispatcher on another team moves to this one."""
    service.set_members(db, p, service._team(db, team_id), body.user_ids, body.lead_user_id)
    db.commit()
    return _overview(db, p)


@router.put("/dispatch-teams/{team_id}/vehicles", response_model=TeamsOverview)
def set_vehicles(team_id: uuid.UUID, body: TeamTrucksIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """The team's trucks. A truck in another team moves to this one."""
    service.set_vehicles(db, p, service._team(db, team_id), body.vehicle_ids)
    db.commit()
    return _overview(db, p)


@router.delete("/dispatch-teams/{team_id}", response_model=TeamsOverview)
def delete_team(team_id: uuid.UUID, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """Its dispatchers and trucks are left on no team."""
    service.remove(db, p, service._team(db, team_id))
    db.commit()
    return _overview(db, p)


@router.put("/dispatch-teams-default", response_model=TeamsOverview)
def set_default(body: TeamDefaultIn, p: Principal = Depends(MANAGE), db: Session = Depends(get_db)):
    """What a dispatcher on no team sees: every truck, or none until they are put on a team."""
    service.set_default(db, p, body.dispatchers_without_team)
    db.commit()
    return _overview(db, p)
