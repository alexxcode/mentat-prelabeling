from fastapi import APIRouter
from app.services.factory_client import get_factory_full_config

router = APIRouter()


@router.get("/config")
def get_config():
    """Devuelve configuración pública para el frontend (incluye config de AlphaPlus)."""
    return get_factory_full_config()
