"""merge migration heads

Revision ID: 61ecc33f4ff2
Revises: 6568010acb05
Create Date: 2026-07-05 17:53:29.242402

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '61ecc33f4ff2'
down_revision: Union[str, None] = '6568010acb05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
