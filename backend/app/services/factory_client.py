"""
Cliente HTTP para notificar a ALPHA PLUS (fábrica de modelos) tras exportar a GCS.

Flujo:
  POST {register_endpoint}  →  registra el dataset y encola el job en AlphaPlus

Config remota (GET /api/config en AlphaPlus):
  {
    "gcs_bucket":        "...",
    "datasets_prefix":   "datasets/",
    "register_endpoint": "/api/datasets/mentat/register",
    "api_version":       "1.0"
  }

Si la fábrica no está disponible, se loguea el error y se devuelve None
para que el job de exportación no falle.
"""

import logging
import os
import requests

logger = logging.getLogger(__name__)

FACTORY_URL     = os.environ.get("ALPHA_PLUS_URL",     "http://34.42.231.172")
FACTORY_TIMEOUT = int(os.environ.get("ALPHA_PLUS_TIMEOUT", "15"))

_config_cache: dict | None = None


def _fetch_remote_config() -> dict:
    """Lee GET /api/config de AlphaPlus y cachea el resultado en memoria."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache
    try:
        resp = requests.get(
            f"{FACTORY_URL.rstrip('/')}/api/config",
            timeout=FACTORY_TIMEOUT,
        )
        resp.raise_for_status()
        _config_cache = resp.json()
        logger.info("factory_client: config cargada de AlphaPlus: %s", _config_cache)
    except Exception as exc:
        logger.warning("factory_client: no se pudo leer /api/config de AlphaPlus: %s", exc)
        _config_cache = {}
    return _config_cache


def get_factory_bucket() -> str:
    """
    Devuelve el bucket GCS de la fábrica.
    Prioridad: env ALPHA_PLUS_BUCKET → GET /api/config (campo gcs_bucket).
    """
    local = os.environ.get("ALPHA_PLUS_BUCKET", "").strip()
    if local:
        return local
    return _fetch_remote_config().get("gcs_bucket", "")


def get_factory_datasets_prefix() -> str:
    """Devuelve el prefijo raíz donde AlphaPlus almacena datasets (ej: 'datasets/')."""
    return _fetch_remote_config().get("datasets_prefix", "datasets/")


def get_factory_full_config() -> dict:
    """Devuelve el config completo de AlphaPlus para exponerlo al frontend."""
    cfg = _fetch_remote_config()
    return {
        "factory_url":       FACTORY_URL,
        "factory_bucket":    get_factory_bucket(),
        "datasets_prefix":   cfg.get("datasets_prefix", "datasets/"),
        "register_endpoint": cfg.get("register_endpoint", "/api/datasets/mentat/register"),
        "api_version":       cfg.get("api_version", ""),
    }


def notify_factory(
    project_name: str,
    fmt: str,
    project_id: int,
    gcs_prefix: str,
    bucket_name: str,
    files_uploaded: int,
) -> int | None:
    """
    Registra el dataset en la fábrica via el endpoint configurado en AlphaPlus.
    Devuelve factory_dataset_id o None si falla.
    """
    cfg = _fetch_remote_config()
    register_path = cfg.get("register_endpoint", "/api/datasets/mentat/register")
    url = f"{FACTORY_URL.rstrip('/')}{register_path}"

    try:
        resp = requests.post(
            url,
            json={
                "project_name":      project_name,
                "format":            fmt,
                "bucket":            bucket_name,
                "gcs_prefix":        gcs_prefix,
                "files_uploaded":    files_uploaded,
                "source_project_id": project_id,
            },
            timeout=FACTORY_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        dataset_id = data.get("dataset_id") or data.get("id") if isinstance(data, dict) else None
        logger.info(
            "factory notificada: dataset_id=%s proyecto=%s gcs_prefix=%s",
            dataset_id, project_name, gcs_prefix,
        )
        return int(dataset_id) if dataset_id is not None else None

    except Exception as exc:
        logger.warning("factory_client: no se pudo notificar la fábrica: %s", exc)
        return None
