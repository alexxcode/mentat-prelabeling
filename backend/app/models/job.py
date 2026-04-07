from datetime import datetime
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Tipos: extract_frames | propagate_mask

    status: Mapped[str] = mapped_column(
        String(50), default="pending", nullable=False
    )
    # Estados: pending | running | success | error

    # Referencias opcionales segun el tipo de job
    video_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("videos.id", ondelete="SET NULL"), nullable=True
    )
    annotation_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("annotations.id", ondelete="SET NULL"), nullable=True
    )

    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Porcentaje 0-100

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON con el resultado del job

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
