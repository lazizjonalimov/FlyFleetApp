"""Intake: what was read from uploaded documents (and what a person corrected), and spreadsheet imports.

Revision ID: 0008
Revises: 0007

Both tables are under forced row-level security like every company table.
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import READ_WRITE, secure_tenant_table

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def upgrade() -> None:
    op.create_table(
        'document_reads',
        sa.Column('document_id', sa.Uuid(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=15), nullable=False),
        sa.Column('reader', sa.String(length=10), nullable=False),
        sa.Column('pages', sa.Integer(), server_default='1', nullable=False),
        sa.Column('duration_ms', sa.Integer(), server_default='0', nullable=False),
        sa.Column('fields', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('violations', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('error', sa.String(length=300), nullable=True),
        sa.Column('applied_entity_type', sa.String(length=20), nullable=True),
        sa.Column('applied_entity_id', sa.Uuid(), nullable=True),
        sa.Column('corrections', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('applied_by', sa.Uuid(), nullable=True),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.CheckConstraint("kind IN ('cdl', 'registration', 'rate_confirmation', 'pod', 'inspection_report', 'fuel_receipt')",
                           name=op.f('ck_document_reads_kind_valid')),
        sa.CheckConstraint("status IN ('done', 'needs_reader', 'failed')", name=op.f('ck_document_reads_status_valid')),
        sa.ForeignKeyConstraint(['organization_id', 'document_id'], ['documents.organization_id', 'documents.id'],
                                name='fk_document_reads_document', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_document_reads_organization_id'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_document_reads')),
    )
    op.create_index('ix_document_reads_org_document', 'document_reads', ['organization_id', 'document_id'])
    op.create_table(
        'imports',
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('sheet', sa.String(length=100), nullable=True),
        sa.Column('status', sa.String(length=10), server_default='mapping', nullable=False),
        sa.Column('headers', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('rows', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('mapping', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('decisions', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('committed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.CheckConstraint("kind IN ('drivers', 'trucks', 'trailers')", name=op.f('ck_imports_kind_valid')),
        sa.CheckConstraint("status IN ('mapping', 'committed')", name=op.f('ck_imports_status_valid')),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_imports_organization_id'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_imports')),
    )
    op.create_index('ix_imports_org_created', 'imports', ['organization_id', 'created_at'])
    for table in ('document_reads', 'imports'):
        for statement in secure_tenant_table(table, APP_ROLE, READ_WRITE):
            op.execute(statement)


def downgrade() -> None:
    op.drop_index('ix_imports_org_created', table_name='imports')
    op.drop_table('imports')
    op.drop_index('ix_document_reads_org_document', table_name='document_reads')
    op.drop_table('document_reads')
