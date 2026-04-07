from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Job
from app.schemas.job import JobResponse

router = APIRouter()


@router.get("/{job_id}", response_model=JobResponse)
def get_job_status(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    db.refresh(job)
    return job
