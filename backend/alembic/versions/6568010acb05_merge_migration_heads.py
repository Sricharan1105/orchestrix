"""merge migration heads

Revision ID: 6568010acb05
Revises: 001, 12080e2bd147
Create Date: 2026-07-05 17:47:11.554920

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6568010acb05'
down_revision: Union[str, None] = '12080e2bd147'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
