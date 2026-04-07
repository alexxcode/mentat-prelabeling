import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Video, Frame, Job
from app.schemas import VideoResponse, FrameResponse
from app.services.video_service import extract_frames_sync

router = APIRouter()

STORAGE_PATH = os.environ.get("STORAGE_PATH", "/app/storage")


@router.post("/{project_id}/videos", response_model=VideoResponse, status_code=201)
async def upload_video(
    project_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    if not file.filename.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
        raise HTTPException(status_code=400, detail="Formato de video no soportado")

    # Guardar el archivo de video
    video_dir = os.path.join(STORAGE_PATH, "videos")
    os.makedirs(video_dir, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(video_dir, unique_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    video = Video(
        project_id=project_id,
        filename=unique_name,
        original_name=file.filename,
        file_path=file_path,
        status="uploaded",
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    # Crear job de extraccion de frames
    job = Job(job_type="extract_frames", video_id=video.id, status="pending")
    db.add(job)
    db.commit()
    db.refresh(job)

    # Extraer frames en background
    background_tasks.add_task(
        _run_extraction, video.id, file_path, job.id
    )

    return video


def _run_extraction(video_id: int, file_path: str, job_id: int):
    """Tarea de background: extrae frames y actualiza la BD."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        video = db.get(Video, video_id)

        job.status = "running"
        video.status = "extracting"
        db.commit()

        frames_dir = os.path.join(STORAGE_PATH, "frames", str(video_id))
        os.makedirs(frames_dir, exist_ok=True)

        metadata, frame_paths = extract_frames_sync(file_path, frames_dir)

        # Actualizar metadatos del video
        video.fps = metadata["fps"]
        video.duration_seconds = metadata["duration_seconds"]
        video.total_frames = metadata["total_frames"]
        video.width = metadata["width"]
        video.height = metadata["height"]
        video.status = "ready"

        # Insertar frames en BD
        for idx, path in enumerate(frame_paths):
            frame = Frame(
                video_id=video_id,
                frame_index=idx,
                file_path=path,
            )
            db.add(frame)

        job.status = "success"
        job.progress = 100
        db.commit()

    except Exception as exc:
        db.rollback()
        job = db.get(Job, job_id)
        video = db.get(Video, video_id)
        if job:
            job.status = "error"
            job.error_message = str(exc)
        if video:
            video.status = "error"
        db.commit()
    finally:
        db.close()


@router.get("/{project_id}/videos", response_model=list[VideoResponse])
def list_videos(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project.videos


@router.delete("/{project_id}/videos/{video_id}/frames/{frame_id}", status_code=204)
def delete_frame(project_id: int, video_id: int, frame_id: int, db: Session = Depends(get_db)):
    """Elimina un frame y sus anotaciones en cascada. Borra el JPEG del disco."""
    frame = db.get(Frame, frame_id)
    if not frame or frame.video_id != video_id:
        raise HTTPException(status_code=404, detail="Frame no encontrado")
    if os.path.exists(frame.file_path):
        os.remove(frame.file_path)
    db.delete(frame)
    db.commit()


@router.get("/{project_id}/videos/{video_id}/frames", response_model=list[FrameResponse])
def list_frames(project_id: int, video_id: int, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video or video.project_id != project_id:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    return (
        db.query(Frame)
        .filter(Frame.video_id == video_id)
        .order_by(Frame.frame_index)
        .all()
    )
