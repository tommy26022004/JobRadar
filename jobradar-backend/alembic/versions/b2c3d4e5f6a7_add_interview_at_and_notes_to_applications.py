"""add_interview_at_and_notes_to_applications

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-18 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('applications', sa.Column('interview_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('applications', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('applications', 'notes')
    op.drop_column('applications', 'interview_at')
