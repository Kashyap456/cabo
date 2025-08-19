"""rename state to phase

Revision ID: a06631024034
Revises: e5fce852c1cb
Create Date: 2025-08-18 19:43:17.896030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a06631024034'
down_revision: Union[str, Sequence[str], None] = 'e5fce852c1cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1) Rename the enum type itself
    op.execute("ALTER TYPE roomstate RENAME TO roomphase")
    # 2) Rename the column
    op.alter_column("game_rooms", "state", new_column_name="phase")


def downgrade():
    # Reverse the operations
    op.alter_column("game_rooms", "phase", new_column_name="state")
    op.execute("ALTER TYPE roomphase RENAME TO roomstate")
