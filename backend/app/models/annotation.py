from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    frame_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("frames.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)

    # Mascara de segmentacion serializada como RLE (Run-Length Encoding) JSON
    mask_rle: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Bounding box derivado de la mascara: x, y, w, h normalizados [0-1]
    bbox_x: Mapped[float | None] = mapped_column(nullable=True)
    bbox_y: Mapped[float | None] = mapped_column(nullable=True)
    bbox_w: Mapped[float | None] = mapped_column(nullable=True)
    bbox_h: Mapped[float | None] = mapped_column(nullable=True)

    # Anotacion origen de la que se propago esta (None = anotacion manual original)
    source_annotation_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("annotations.id", ondelete="SET NULL"), nullable=True
    )

    # true = generado por SAM 2, false = corregido manualmente
    is_propagated: Mapped[bool] = mapped_column(Boolean, default=False)
    # true = revisado y aprobado por el operario
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    frame: Mapped["Frame"] = relationship("Frame", back_populates="annotations")  # noqa: F821
