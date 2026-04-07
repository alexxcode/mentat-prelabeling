from datetime import datetime
from pydantic import BaseModel


class ProjectLabelCreate(BaseModel):
    label_name: str


class ProjectLabelResponse(BaseModel):
    id: int
    project_id: int
    label_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class GCSExportRequest(BaseModel):
    """Solicitud de exportación de dataset a Google Cloud Storage."""
    bucket_name: str                   # Nombre del bucket GCS destino
    gcs_prefix: str | None = None      # Ruta dentro del bucket (ej: "datasets/v1")
    format: str = "yolo_seg"          # "yolo_seg" | "yolo_det" | "coco"
    train_split: float = 0.8
    approved_only: bool = True         # Exportar solo anotaciones aprobadas
    video_id: int | None = None        # None = todo el proyecto
