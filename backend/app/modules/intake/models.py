import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TenantScoped

READ_KINDS = ("cdl", "registration", "rate_confirmation", "pod", "inspection_report", "fuel_receipt")
IMPORT_KINDS = ("drivers", "trucks", "trailers", "mileage", "loads")


class DocumentRead(Base, IdMixin, TenantScoped):
    """What was read from an uploaded document, kept next to what was saved from it. The values a person changed
    before saving are the corrections, so a record made from a document shows what the document said."""
    __tablename__ = "document_reads"
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    kind: Mapped[str] = mapped_column(String(20))
    # done: read | needs_reader: a photo and no photo reader is turned on | failed: the reader couldn't read it
    status: Mapped[str] = mapped_column(String(15))
    reader: Mapped[str] = mapped_column(String(10))  # text | vision | none
    pages: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    fields: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    violations: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    error: Mapped[str | None] = mapped_column(String(300))
    applied_entity_type: Mapped[str | None] = mapped_column(String(20))
    applied_entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    corrections: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    applied_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("kind IN " + str(READ_KINDS), name="kind_valid"),
        CheckConstraint("status IN ('done', 'needs_reader', 'failed')", name="status_valid"),
        ForeignKeyConstraint(["organization_id", "document_id"], ["documents.organization_id", "documents.id"],
                             name="fk_document_reads_document", ondelete="CASCADE"),
        Index("ix_document_reads_org_document", "organization_id", "document_id"),
    )


class Import(Base, IdMixin, TenantScoped):
    """A spreadsheet being brought in: its columns, rows, how the columns map to fields, and what it made."""
    __tablename__ = "imports"
    kind: Mapped[str] = mapped_column(String(10))
    filename: Mapped[str] = mapped_column(String(255))
    sheet: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(10), default="mapping", server_default="mapping")
    headers: Mapped[list[str]] = mapped_column(JSONB)
    rows: Mapped[list[list[str]]] = mapped_column(JSONB)
    mapping: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default="{}")
    # Row number -> "update" | "skip" | "add": what to do with a row that needs a look.
    decisions: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default="{}")
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("kind IN " + str(IMPORT_KINDS), name="kind_valid"),
        CheckConstraint("status IN ('mapping', 'committed')", name="status_valid"),
        Index("ix_imports_org_created", "organization_id", "created_at"),
    )
