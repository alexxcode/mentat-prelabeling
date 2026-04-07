from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.api import projects, videos, annotations, export, jobs

app = FastAPI(
    title="EXPAI Pre-Labeling Tool",
    description="Herramienta de pre-etiquetado de video industrial con SAM 2",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(videos.router, prefix="/projects", tags=["videos"])
app.include_router(annotations.router, prefix="/annotations", tags=["annotations"])
app.include_router(export.router, prefix="/projects", tags=["export"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])

# Servir archivos estaticos (frames extraidos)
storage_path = os.environ.get("STORAGE_PATH", "/app/storage")
if os.path.exists(storage_path):
    app.mount("/storage", StaticFiles(directory=storage_path), name="storage")


@app.get("/health")
def health():
    return {"status": "ok"}
