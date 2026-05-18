"""add_title_to_seen_jobs

Revision ID: a1b2c3d4e5f6
Revises: f210be9d917b
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f210be9d917b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('seen_jobs', sa.Column('title', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('seen_jobs', 'title')
