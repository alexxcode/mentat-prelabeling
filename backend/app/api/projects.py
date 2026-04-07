from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Frame, Video, Annotation
from app.models.project_label import ProjectLabel
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.project_label import ProjectLabelCreate, ProjectLabelResponse

router = APIRouter()


# ─────────────────────── PROYECTOS ───────────────────────

@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=data.name, description=data.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.created_at.desc()).all()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    db.delete(project)
    db.commit()


# ─────────────────────── ETIQUETAS DEL PROYECTO ───────────────────────

@router.get("/{project_id}/labels", response_model=list[ProjectLabelResponse])
def get_project_labels(project_id: int, db: Session = Depends(get_db)):
    """Devuelve todas las etiquetas confirmadas del proyecto."""
    return (
        db.query(ProjectLabel)
        .filter(ProjectLabel.project_id == project_id)
        .order_by(ProjectLabel.created_at)
        .all()
    )


@router.post("/{project_id}/labels", response_model=ProjectLabelResponse, status_code=201)
def add_project_label(project_id: int, data: ProjectLabelCreate, db: Session = Depends(get_db)):
    """Registra manualmente una etiqueta en el proyecto (idempotente)."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    label_name = data.label_name.strip()
    if not label_name:
        raise HTTPException(status_code=400, detail="Nombre de etiqueta vacío")

    existing = (
        db.query(ProjectLabel)
        .filter(ProjectLabel.project_id == project_id, ProjectLabel.label_name == label_name)
        .first()
    )
    if existing:
        return existing

    label = ProjectLabel(project_id=project_id, label_name=label_name)
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


@router.delete("/{project_id}/labels/{label_name}", status_code=204)
def delete_project_label(project_id: int, label_name: str, db: Session = Depends(get_db)):
    """Elimina una etiqueta del registro del proyecto."""
    db.query(ProjectLabel).filter(
        ProjectLabel.project_id == project_id,
        ProjectLabel.label_name == label_name,
    ).delete()
    db.commit()


# ─────────────────────── ESTADÍSTICAS DE VÍDEO ───────────────────────

@router.get("/{project_id}/videos/{video_id}/stats")
def video_stats(project_id: int, video_id: int, db: Session = Depends(get_db)):
    """Métricas de progreso de anotación de un vídeo."""
    video = db.get(Video, video_id)
    if not video or video.project_id != project_id:
        raise HTTPException(status_code=404, detail="Vídeo no encontrado")

    frames = db.query(Frame).filter(Frame.video_id == video_id).all()
    frame_ids = [f.id for f in frames]

    annotations = (
        db.query(Annotation).filter(Annotation.frame_id.in_(frame_ids)).all()
        if frame_ids else []
    )

    annotated_frame_ids = set(a.frame_id for a in annotations)
    approved_count = sum(1 for a in annotations if a.is_approved)
    propagated_count = sum(1 for a in annotations if a.is_propagated)

    return {
        "total_frames": len(frames),
        "annotated_frames": len(annotated_frame_ids),
        "total_annotations": len(annotations),
        "approved_annotations": approved_count,
        "propagated_annotations": propagated_count,
        "coverage_pct": round(len(annotated_frame_ids) / len(frames) * 100, 1) if frames else 0,
    }
