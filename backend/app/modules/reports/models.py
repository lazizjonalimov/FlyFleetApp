from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped


class DashboardSnapshot(Base, IdMixin, TenantScoped):
    """A dashboard figure that is a state, as it stood on a day, for comparisons and sparklines."""
    __tablename__ = "dashboard_snapshots"
    scope_key: Mapped[str] = mapped_column(String(80))
    kpi: Mapped[str] = mapped_column(String(40))
    day: Mapped[date] = mapped_column(Date)
    value: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("organization_id", "scope_key", "kpi", "day"),)
