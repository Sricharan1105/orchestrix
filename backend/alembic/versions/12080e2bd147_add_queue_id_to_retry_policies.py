"""add queue id to retry policies

Revision ID: 12080e2bd147
Revises:
Create Date: 2026-07-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "12080e2bd147"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "retry_policies",
        sa.Column("queue_id", sa.Integer(), nullable=True),
    )

    op.create_foreign_key(
        "fk_retry_policies_queue_id",
        "retry_policies",
        "queues",
        ["queue_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_unique_constraint(
        "uq_retry_policies_queue_id",
        "retry_policies",
        ["queue_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_retry_policies_queue_id",
        "retry_policies",
        type_="unique",
    )

    op.drop_constraint(
        "fk_retry_policies_queue_id",
        "retry_policies",
        type_="foreignkey",
    )

    op.drop_column("retry_policies", "queue_id")