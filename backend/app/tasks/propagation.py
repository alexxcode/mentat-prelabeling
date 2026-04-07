"""
Tarea Celery: propaga una mascara SAM 2 a todos los frames de un video.
"""

import os
from app.tasks.celery_app import celery
from app.database import SessionLocal
from app.models import Annotation, Frame, Job, Video

STORAGE_PATH = os.environ.get("STORAGE_PATH", "/app/storage")


@celery.task(bind=True, name="propagate_mask")
def propagate_mask_task(
    self,
    annotation_id: int,
    video_id: int,
    start_frame_index: int,
    job_id: int,
):
    """
    Propaga la mascara de `annotation_id` a todos los frames del video.
    Crea una Annotation por cada frame con is_propagated=True.
    """
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        job.status = "running"
        db.commit()

        annotation = db.get(Annotation, annotation_id)
        video = db.get(Video, video_id)

        frames_dir = os.path.join(STORAGE_PATH, "frames", str(video_id))

        from app.services.sam2_service import propagate_video

        def _progress(percent: int):
            job.progress = percent
            db.commit()
            # Actualizar estado en Celery para polling externo
            self.update_state(state="PROGRESS", meta={"progress": percent})

        results = propagate_video(
            frames_dir=frames_dir,
            init_frame_index=start_frame_index,
            init_mask_rle=annotation.mask_rle,
            progress_callback=_progress,
        )

        # Recuperar todos los frames del video
        frames = (
            db.query(Frame)
            .filter(Frame.video_id == video_id)
            .order_by(Frame.frame_index)
            .all()
        )
        frame_by_index = {f.frame_index: f for f in frames}

        for frame_index, (mask_rle, bbox) in results.items():
            frame = frame_by_index.get(frame_index)
            if frame is None:
                continue

            # No duplicar: el frame fuente ya tiene la anotacion original
            if frame.id == annotation.frame_id:
                continue

            # Buscar por source_annotation_id para no pisar otras instancias del mismo label
            existing = (
                db.query(Annotation)
                .filter(
                    Annotation.frame_id == frame.id,
                    Annotation.source_annotation_id == annotation_id,
                )
                .first()
            )
            if existing:
                existing.mask_rle = mask_rle
                existing.bbox_x = bbox[0]
                existing.bbox_y = bbox[1]
                existing.bbox_w = bbox[2]
                existing.bbox_h = bbox[3]
                existing.is_approved = False
            else:
                new_ann = Annotation(
                    frame_id=frame.id,
                    label=annotation.label,
                    mask_rle=mask_rle,
                    bbox_x=bbox[0],
                    bbox_y=bbox[1],
                    bbox_w=bbox[2],
                    bbox_h=bbox[3],
                    is_propagated=True,
                    is_approved=False,
                    source_annotation_id=annotation_id,
                )
                db.add(new_ann)

        job.status = "success"
        job.progress = 100
        db.commit()
        return {"status": "success", "frames_propagated": len(results)}

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
