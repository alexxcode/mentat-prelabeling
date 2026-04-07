from datetime import datetime
from pydantic import BaseModel


class FrameResponse(BaseModel):
    id: int
    video_id: int
    frame_index: int
    file_path: str
    created_at: datetime

    model_config = {"from_attributes": True}
