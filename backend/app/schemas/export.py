from pydantic import BaseModel
from typing import Literal


class ExportRequest(BaseModel):
    format: Literal["yolo", "coco"] = "yolo"
    # Porcentaje de frames para train (resto va a val)
    train_split: float = 0.8
    # Solo exportar anotaciones aprobadas
    approved_only: bool = False
