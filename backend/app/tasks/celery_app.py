import os
from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")

celery = Celery(
    "expai",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.propagation", "app.tasks.export_task"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Un solo worker para no saturar la GPU
    worker_concurrency=1,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


# Importar tareas para que Celery las registre
# (export_task NO se importa aqui para evitar importacion circular;
#  celery la descubre via include= en el constructor de arriba)
from app.tasks.propagation import propagate_mask_task  # noqa: E402, F401
