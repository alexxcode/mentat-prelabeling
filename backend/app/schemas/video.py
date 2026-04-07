from datetime import datetime
from pydantic import BaseModel


class VideoResponse(BaseModel):
    id: int
    project_id: int
    filename: str
    original_name: str
    fps: float | None
    duration_seconds: float | None
    total_frames: int | None
    width: int | None
    height: int | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
