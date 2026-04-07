from datetime import datetime
from pydantic import BaseModel


class JobResponse(BaseModel):
    id: int
    celery_task_id: str | None
    job_type: str
    status: str
    video_id: int | None
    annotation_id: int | None
    progress: int
    error_message: str | None
    result: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
