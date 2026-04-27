import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Job
from app.schemas import ExportRequest
from app.schemas.project_label import GCSExportRequest
from app.services.export_service import (
    export_yolo,
    export_yolo_seg,
    export_coco,
)

router = APIRouter()

STORAGE_PATH = os.environ.get("STORAGE_PATH", "/app/storage")


@router.post("/{project_id}/export")
def export_dataset(
    project_id: int, data: ExportRequest, db: Session = Depends(get_db)
):
    """Exporta el dataset y lo devuelve como ZIP descargable."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    export_dir = os.path.join(STORAGE_PATH, "exports", str(project_id))
    os.makedirs(export_dir, exist_ok=True)

    if data.format == "yolo_seg":
        zip_path = export_yolo_seg(
            project_id=project_id,
            db=db,
            export_dir=export_dir,
            train_split=data.train_split,
            approved_only=data.approved_only,
        )
    elif data.format in ("yolo", "yolo_det"):
        zip_path = export_yolo(
            project_id=project_id,
            db=db,
            export_dir=export_dir,
            train_split=data.train_split,
            approved_only=data.approved_only,
        )
    else:
        zip_path = export_coco(
            project_id=project_id,
            db=db,
            export_dir=export_dir,
            train_split=data.train_split,
            approved_only=data.approved_only,
        )

    return FileResponse(
        path=zip_path,
        filename=os.path.basename(zip_path),
        media_type="application/zip",
    )


@router.post("/{project_id}/export/gcs")
def export_to_gcs(
    project_id: int, data: GCSExportRequest, db: Session = Depends(get_db)
):
    """
    Lanza un job Celery para exportar el dataset a GCS en segundo plano.
    Devuelve { job_id } inmediatamente para que el frontend pueda hacer polling.
    """
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    if not data.bucket_name:
        raise HTTPException(status_code=400, detail="bucket_name es requerido")

    gcs_prefix = data.gcs_prefix or f"mentat/project_{project_id}"

    # Crear registro de Job
    job = Job(
        job_type="export_gcs",
        status="pending",
        progress=0,
        video_id=data.video_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Despachar tarea Celery (no bloquea)
    from app.tasks.export_task import export_to_gcs_task

    celery_task = export_to_gcs_task.delay(
        project_id=project_id,
        video_id=data.video_id,
        bucket_name=data.bucket_name,
        gcs_prefix=gcs_prefix,
        fmt=data.format,
        train_split=data.train_split,
        approved_only=data.approved_only,
        job_id=job.id,
    )

    job.celery_task_id = celery_task.id
    db.commit()

    return {"job_id": job.id}
