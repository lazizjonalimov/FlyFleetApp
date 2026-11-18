"""The customer's shipment portal: a sign-in tied to one customer, which sees that customer's shipments, their bills
of lading and proofs of delivery, and its invoices, and can write to the carrier's dispatch.

Revision ID: 0020
Revises: 0019
"""
import sqlalchemy as sa

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_memberships", sa.Column("customer_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_memberships_customer", "organization_memberships", "customers",
                          ["organization_id", "customer_id"], ["organization_id", "id"], ondelete="CASCADE")
    op.create_check_constraint(op.f("ck_organization_memberships_portal_needs_customer"), "organization_memberships",
                               "(role = 'customer') = (customer_id IS NOT NULL)")


def downgrade() -> None:
    op.execute("DELETE FROM organization_memberships WHERE role = 'customer'")
    op.drop_constraint(op.f("ck_organization_memberships_portal_needs_customer"), "organization_memberships",
                       type_="check")
    op.drop_constraint("fk_memberships_customer", "organization_memberships", type_="foreignkey")
    op.drop_column("organization_memberships", "customer_id")
