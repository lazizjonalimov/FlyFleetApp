"""Trailers: a custom type when the type is Other (an end dump, a lowboy). Documents can be filed with an
inspection (the roadside report it was read from).

Revision ID: 0009
Revises: 0008
"""
import sqlalchemy as sa

from alembic import op

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


ENTITIES = "('load', 'driver', 'vehicle', 'trailer', 'customer', 'work_order', 'invoice', 'expense', 'owner', 'inspection')"
OLD_ENTITIES = "('load', 'driver', 'vehicle', 'trailer', 'customer', 'work_order', 'invoice', 'expense', 'owner')"


def upgrade() -> None:
    op.add_column("trailers", sa.Column("type_other", sa.String(40), nullable=True))
    op.drop_constraint(op.f("ck_document_links_entity_valid"), "document_links", type_="check")
    op.create_check_constraint(op.f("ck_document_links_entity_valid"), "document_links", f"entity_type IN {ENTITIES}")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_document_links_entity_valid"), "document_links", type_="check")
    op.create_check_constraint(op.f("ck_document_links_entity_valid"), "document_links", f"entity_type IN {OLD_ENTITIES}")
    op.drop_column("trailers", "type_other")
