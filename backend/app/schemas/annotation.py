from datetime import datetime
from pydantic import BaseModel


class SegmentRequest(BaseModel):
    frame_id: int
    label: str
    # Punto de click del operario, coordenadas absolutas en pixeles
    point_x: int
    point_y: int
    # 1 = incluir objeto, 0 = excluir zona
    point_label: int = 1


class PropagateRequest(BaseModel):
    annotation_id: int
    # Frame de inicio de la propagacion (por defecto el frame de la anotacion)
    start_frame_index: int | None = None


class AnnotationUpdate(BaseModel):
    label: str | None = None
    mask_rle: str | None = None
    bbox_x: float | None = None
    bbox_y: float | None = None
    bbox_w: float | None = None
    bbox_h: float | None = None
    is_approved: bool | None = None


class BulkApproveRequest(BaseModel):
    annotation_ids: list[int]


# --- Multi-mask (opciones) ---
class MaskProposal(BaseModel):
    """Una de las N mascaras candidatas devueltas por SAM 2 (multimask_output=True)."""
    mask_rle: str
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    score: float


class SaveMaskRequest(BaseModel):
    """Guarda en BD la mascara elegida por el operario de entre las propuestas."""
    frame_id: int
    label: str
    mask_rle: str
    bbox_x: float | None = None
    bbox_y: float | None = None
    bbox_w: float | None = None
    bbox_h: float | None = None


class AnnotationResponse(BaseModel):
    id: int
    frame_id: int
    label: str
    mask_rle: str | None
    bbox_x: float | None
    bbox_y: float | None
    bbox_w: float | None
    bbox_h: float | None
    is_propagated: bool
    is_approved: bool
    source_annotation_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
