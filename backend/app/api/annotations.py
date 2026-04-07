from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Annotation, Frame, Job
from app.schemas import (
    AnnotationResponse,
    SegmentRequest,
    PropagateRequest,
    AnnotationUpdate,
    BulkApproveRequest,
)
from app.schemas.annotation import MaskProposal, SaveMaskRequest
from app.schemas.job import JobResponse

router = APIRouter()


@router.post("/segment", response_model=AnnotationResponse, status_code=201)
def segment_frame(data: SegmentRequest, db: Session = Depends(get_db)):
    """
    Genera una mascara de segmentacion para un frame usando SAM 2.
    El operario hace click sobre el objeto y SAM 2 devuelve la mascara.
    """
    frame = db.get(Frame, data.frame_id)
    if not frame:
        raise HTTPException(status_code=404, detail="Frame no encontrado")

    from app.services.sam2_service import segment_frame as _segment

    mask_rle, bbox = _segment(
        frame_path=frame.file_path,
        point_x=data.point_x,
        point_y=data.point_y,
        point_label=data.point_label,
    )

    annotation = Annotation(
        frame_id=frame.id,
        label=data.label,
        mask_rle=mask_rle,
        bbox_x=bbox[0],
        bbox_y=bbox[1],
        bbox_w=bbox[2],
        bbox_h=bbox[3],
        is_propagated=False,
        is_approved=False,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.post("/propagate", response_model=JobResponse, status_code=202)
def propagate_mask(data: PropagateRequest, db: Session = Depends(get_db)):
    """
    Inicia la propagacion asincrona de una mascara a todos los frames del video.
    Devuelve un Job para que el frontend pueda consultar el estado.
    """
    annotation = db.get(Annotation, data.annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Anotacion no encontrada")

    frame = db.get(Frame, annotation.frame_id)
    if not frame:
        raise HTTPException(status_code=404, detail="Frame no encontrado")

    job = Job(
        job_type="propagate_mask",
        video_id=frame.video_id,
        annotation_id=annotation.id,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Encolar tarea Celery
    from app.tasks.celery_app import propagate_mask_task

    task = propagate_mask_task.delay(
        annotation_id=annotation.id,
        video_id=frame.video_id,
        start_frame_index=data.start_frame_index or frame.frame_index,
        job_id=job.id,
    )

    job.celery_task_id = task.id
    job.status = "running"
    db.commit()
    db.refresh(job)
    return job


@router.put("/{annotation_id}", response_model=AnnotationResponse)
def update_annotation(
    annotation_id: int, data: AnnotationUpdate, db: Session = Depends(get_db)
):
    annotation = db.get(Annotation, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Anotacion no encontrada")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(annotation, field, value)

    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/{annotation_id}", status_code=204)
def delete_annotation(annotation_id: int, db: Session = Depends(get_db)):
    annotation = db.get(Annotation, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Anotacion no encontrada")
    db.delete(annotation)
    db.commit()


@router.post("/approve-bulk", status_code=200)
def approve_bulk(data: BulkApproveRequest, db: Session = Depends(get_db)):
    """
    Aprueba multiples anotaciones en una sola llamada.
    Ademas auto-registra las labels en la tabla project_labels del proyecto.
    """
    if not data.annotation_ids:
        return {"approved": 0}

    db.query(Annotation).filter(
        Annotation.id.in_(data.annotation_ids)
    ).update({"is_approved": True}, synchronize_session=False)
    db.commit()

    # Auto-registrar labels confirmadas en el registro del proyecto
    from app.models.project_label import ProjectLabel
    from app.models import Frame, Video

    approved_anns = (
        db.query(Annotation)
        .filter(Annotation.id.in_(data.annotation_ids))
        .all()
    )

    # Recopilar (project_id, label_name) unicos
    seen = set()
    for ann in approved_anns:
        frame = db.get(Frame, ann.frame_id)
        if not frame:
            continue
        video = db.get(Video, frame.video_id)
        if not video:
            continue
        key = (video.project_id, ann.label)
        if key in seen:
            continue
        seen.add(key)
        exists = (
            db.query(ProjectLabel)
            .filter(
                ProjectLabel.project_id == video.project_id,
                ProjectLabel.label_name == ann.label,
            )
            .first()
        )
        if not exists:
            db.add(ProjectLabel(project_id=video.project_id, label_name=ann.label))

    db.commit()
    return {"approved": len(data.annotation_ids)}


@router.post("/segment-options", response_model=list[MaskProposal])
def segment_options(data: SegmentRequest, db: Session = Depends(get_db)):
    """
    Genera 3 mascaras candidatas (multimask_output=True) sin guardarlas en BD.
    El operario elige la mejor y luego llama a /save-mask.
    """
    frame = db.get(Frame, data.frame_id)
    if not frame:
        raise HTTPException(status_code=404, detail="Frame no encontrado")

    from app.services.sam2_service import segment_frame_options

    proposals = segment_frame_options(
        frame_path=frame.file_path,
        point_x=data.point_x,
        point_y=data.point_y,
        point_label=data.point_label,
    )
    return [
        MaskProposal(
            mask_rle=p["mask_rle"],
            bbox_x=p["bbox"][0],
            bbox_y=p["bbox"][1],
            bbox_w=p["bbox"][2],
            bbox_h=p["bbox"][3],
            score=p["score"],
        )
        for p in proposals
    ]


@router.post("/save-mask", response_model=AnnotationResponse, status_code=201)
def save_mask(data: SaveMaskRequest, db: Session = Depends(get_db)):
    """
    Guarda en BD la mascara que el operario eligio de entre las propuestas.
    """
    frame = db.get(Frame, data.frame_id)
    if not frame:
        raise HTTPException(status_code=404, detail="Frame no encontrado")

    annotation = Annotation(
        frame_id=frame.id,
        label=data.label,
        mask_rle=data.mask_rle,
        bbox_x=data.bbox_x,
        bbox_y=data.bbox_y,
        bbox_w=data.bbox_w,
        bbox_h=data.bbox_h,
        is_propagated=False,
        is_approved=False,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.get("/frame/{frame_id}", response_model=list[AnnotationResponse])
def get_frame_annotations(frame_id: int, db: Session = Depends(get_db)):
    frame = db.get(Frame, frame_id)
    if not frame:
        raise HTTPException(status_code=404, detail="Frame no encontrado")
    return (
        db.query(Annotation)
        .filter(Annotation.frame_id == frame_id)
        .all()
    )
