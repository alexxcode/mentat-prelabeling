"""add source_annotation_id to annotations

Revision ID: 002
Revises: 001
Create Date: 2026-01-01 00:00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Columna ya puede existir si se creo antes via create_all(); se salta si es asi
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='annotations' AND column_name='source_annotation_id'"
        )
    ).fetchone()
    if result is None:
        op.add_column(
            "annotations",
            sa.Column(
                "source_annotation_id",
                sa.Integer(),
                sa.ForeignKey("annotations.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("annotations", "source_annotation_id")
