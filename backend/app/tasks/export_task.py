"""
Tarea Celery: exporta un dataset y lo sube a Google Cloud Storage en background.
"""

import json
import os

from app.tasks.celery_app import celery
from app.database import SessionLocal
from app.models import Job

STORAGE_PATH = os.environ.get("STORAGE_PATH", "/app/storage")


@celery.task(bind=True, name="export_to_gcs")
def export_to_gcs_task(
    self,
    project_id: int,
    video_id: int | None,
    bucket_name: str,
    gcs_prefix: str,
    fmt: str,
    train_split: float,
    approved_only: bool,
    job_id: int,
):
    """
    Genera el dataset (yolo_seg / yolo_det / coco) y lo sube a GCS.
    Actualiza el Job con progreso y resultado final.
    """
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        job.status = "running"
        job.progress = 0
        db.commit()

        export_dir = os.path.join(STORAGE_PATH, "exports", str(project_id))
        os.makedirs(export_dir, exist_ok=True)

        from app.services.export_service import export_and_upload_gcs

        def _progress(pct: int):
            job.progress = pct
            db.commit()
            self.update_state(state="PROGRESS", meta={"progress": pct})

        result = export_and_upload_gcs(
            project_id=project_id,
            db=db,
            export_dir=export_dir,
            bucket_name=bucket_name,
            gcs_prefix=gcs_prefix,
            fmt=fmt,
            train_split=train_split,
            approved_only=approved_only,
            video_id=video_id,
            progress_callback=_progress,
        )

        job.status = "success"
        job.progress = 100
        job.result = json.dumps(result)
        db.commit()
        return result

    except Exception as exc:
        db.rollback()
        job = db.get(Job, job_id)
        if job:
            job.status = "error"
            job.error_message = str(exc)
            db.commit()
        raise

    finally:
        db.close()
