"""Messages and tasks: conversations with drivers, customers and teammates, the messages in them with how each
reached people, who has read how far, and tasks for one person. Messages are kept whatever channel carried them.

Revision ID: 0012
Revises: 0011
"""
import os

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import NO_DELETE, READ_WRITE, secure_tenant_table

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None

APP_ROLE = os.environ.get("FLYFLEET_APP_ROLE", "flyfleet_app")


def upgrade() -> None:
    op.create_table('tasks',
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('detail', sa.String(length=300), nullable=True),
    sa.Column('assignee_user_id', sa.Uuid(), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('due_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('all_day', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('priority', sa.String(length=6), server_default='medium', nullable=False),
    sa.Column('status', sa.String(length=10), server_default='open', nullable=False),
    sa.Column('done_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('done_by', sa.Uuid(), nullable=True),
    sa.Column('outcome', sa.String(length=200), nullable=True),
    sa.Column('entity_type', sa.String(length=20), nullable=True),
    sa.Column('entity_id', sa.Uuid(), nullable=True),
    sa.Column('entity_label', sa.String(length=60), nullable=True),
    sa.Column('action', sa.String(length=20), nullable=True),
    sa.Column('source', sa.String(length=10), server_default='manual', nullable=False),
    sa.Column('incident_id', sa.Uuid(), nullable=True),
    sa.Column('source_key', sa.String(length=120), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("priority IN ('high', 'medium', 'low')", name=op.f('ck_tasks_priority_valid')),
    sa.CheckConstraint("source IN ('manual', 'incident', 'reminder')", name=op.f('ck_tasks_source_valid')),
    sa.CheckConstraint("status IN ('open', 'done', 'cancelled')", name=op.f('ck_tasks_status_valid')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_tasks_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tasks'))
    )
    op.create_index('ix_tasks_org_assignee', 'tasks', ['organization_id', 'assignee_user_id', 'status', 'due_at'], unique=False)
    op.create_index('uq_tasks_open_source', 'tasks', ['organization_id', 'source_key'], unique=True, postgresql_where=sa.text("status = 'open' AND source_key IS NOT NULL"))
    op.create_table('conversations',
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('driver_id', sa.Uuid(), nullable=True),
    sa.Column('customer_id', sa.Uuid(), nullable=True),
    sa.Column('contact_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=120), nullable=True),
    sa.Column('members', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_message_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('draft', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("(kind = 'customer') = (customer_id IS NOT NULL)", name=op.f('ck_conversations_customer_thread')),
    sa.CheckConstraint("(kind = 'driver') = (driver_id IS NOT NULL)", name=op.f('ck_conversations_driver_thread')),
    sa.CheckConstraint("kind IN ('driver', 'customer', 'team')", name=op.f('ck_conversations_kind_valid')),
    sa.ForeignKeyConstraint(['organization_id', 'customer_id'], ['customers.organization_id', 'customers.id'], name='fk_conversations_customer', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id', 'driver_id'], ['drivers.organization_id', 'drivers.id'], name='fk_conversations_driver', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_conversations_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_conversations')),
    sa.UniqueConstraint('organization_id', 'id', name=op.f('uq_conversations_organization_id_id'))
    )
    op.create_index('ix_conversations_org_last', 'conversations', ['organization_id', 'last_message_at'], unique=False)
    op.create_index('uq_conversations_driver', 'conversations', ['organization_id', 'driver_id'], unique=True, postgresql_where=sa.text("kind = 'driver'"))
    op.create_table('conversation_reads',
    sa.Column('conversation_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('last_read_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['organization_id', 'conversation_id'], ['conversations.organization_id', 'conversations.id'], name='fk_conversation_reads_conversation', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_conversation_reads_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_conversation_reads')),
    sa.UniqueConstraint('organization_id', 'conversation_id', 'user_id', name='uq_conversation_reads')
    )
    op.create_table('messages',
    sa.Column('conversation_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.String(length=10), server_default='text', nullable=False),
    sa.Column('event', sa.String(length=20), nullable=True),
    sa.Column('direction', sa.String(length=8), nullable=False),
    sa.Column('author_user_id', sa.Uuid(), nullable=True),
    sa.Column('author_driver_id', sa.Uuid(), nullable=True),
    sa.Column('author_name', sa.String(length=120), nullable=True),
    sa.Column('title', sa.String(length=160), nullable=True),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('load_id', sa.Uuid(), nullable=True),
    sa.Column('incident_id', sa.Uuid(), nullable=True),
    sa.Column('document_ids', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('deliveries', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('via', sa.String(length=10), nullable=True),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('clock_timestamp()'), nullable=False),
    sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("direction IN ('out', 'in', 'internal', 'system')", name=op.f('ck_messages_direction_valid')),
    sa.CheckConstraint("kind IN ('text', 'system')", name=op.f('ck_messages_kind_valid')),
    sa.ForeignKeyConstraint(['organization_id', 'conversation_id'], ['conversations.organization_id', 'conversations.id'], name='fk_messages_conversation', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_messages_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_messages'))
    )
    op.create_index('ix_messages_org_conversation', 'messages', ['organization_id', 'conversation_id', 'created_at'], unique=False)
    # A message's delivery states change after it is sent (sent, delivered, read), so messages are updated in place,
    # but the application never deletes a conversation, a message or a task: they are kept as the company's record.
    for table, privileges in (('conversations', NO_DELETE), ('conversation_reads', READ_WRITE),
                              ('messages', NO_DELETE), ('tasks', NO_DELETE)):
        for statement in secure_tenant_table(table, APP_ROLE, privileges):
            op.execute(statement)


def downgrade() -> None:
    op.drop_index('ix_messages_org_conversation', table_name='messages')
    op.drop_table('messages')
    op.drop_table('conversation_reads')
    op.drop_index('uq_conversations_driver', table_name='conversations', postgresql_where=sa.text("kind = 'driver'"))
    op.drop_index('ix_conversations_org_last', table_name='conversations')
    op.drop_table('conversations')
    op.drop_index('uq_tasks_open_source', table_name='tasks', postgresql_where=sa.text("status = 'open' AND source_key IS NOT NULL"))
    op.drop_index('ix_tasks_org_assignee', table_name='tasks')
    op.drop_table('tasks')
