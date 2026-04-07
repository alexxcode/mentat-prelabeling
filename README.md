# Pre-Labeling con SAM 2

**Herramienta de pre-etiquetado automático de vídeo industrial mediante segmentación semántica.**
Reduce el tiempo de etiquetado entre un 70 y 85 % respecto al flujo manual.

---

## El problema que resuelve

El pipeline de entrenamiento de modelos de visión artificial en entornos industriales requiere etiquetar vídeos frame a frame antes de entrenar modelos YOLO. Este proceso es lento, inconsistente y no escala.

Esta herramienta automatiza la propagación de máscaras de segmentación a lo largo del vídeo: el operario hace clic una vez sobre el objeto, SAM 2 lo rastrea en todos los frames del clip y genera las anotaciones automáticamente. El operario solo revisa y aprueba.

---

## Flujo de trabajo

```
Vídeo .mp4
    │
    ▼
Extracción de frames (OpenCV) ──────────────────────────────────┐
    │                                                            │
    ▼                                                         almacena
Operario abre frame y hace clic sobre objeto/defecto         frames JPEG
    │                                                         en disco
    ▼
SAM 2 genera máscara en ese frame (~500 ms)
    │
    ├─── Modo 3 opciones: SAM 2 devuelve 3 candidatos con score
    │    El operario elige la más precisa
    │
    ▼
SAM 2 propaga la máscara a todos los frames del clip
    │    (Celery background job sobre GPU — 10-90 segundos)
    │
    ▼
Operario revisa filmstrip y aprueba en lote
    │    (auto-registro de etiquetas en project_labels)
    │
    ▼
VideoPage — Hub de progreso por vídeo
    │    · % frames anotados, anotaciones aprobadas/propagadas
    │    · Gestión del vocabulario de etiquetas del proyecto
    │
    ▼
Exportar dataset (Celery background job)
    ├── YOLO Segmentation (.txt con polígonos normalizados)
    ├── YOLO Detection (.txt con bboxes normalizadas)
    └── COCO JSON
         │
         └── Subida directa a Google Cloud Storage
              (progress bar en tiempo real via polling)
    │
    ▼
Dataset listo en GCS para entrenar modelo YOLO
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Modelo de segmentación | SAM 2 (Meta AI, PyTorch, CUDA) |
| Backend | FastAPI + Python 3.10 |
| Tareas asíncronas (GPU) | Celery + Redis |
| Base de datos | PostgreSQL 15 + SQLAlchemy 2 |
| Migraciones | Alembic |
| Procesamiento de vídeo | OpenCV + FFmpeg |
| Cloud storage | google-cloud-storage 2.17 (ADC) |
| Frontend | React 18 + Vite 5 |
| Canvas interactivo | Konva.js |
| Estado global | Zustand |
| Proxy inverso | Nginx |
| Contenedores | Docker + Docker Compose |
| GPU | NVIDIA Tesla T4 16 GB (GCP Compute Engine) |

---

## Requisitos locales

Solo necesitas esto en tu laptop:

- [VS Code](https://code.visualstudio.com/) con extensión [Remote - SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh)
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) autenticado

```bash
gcloud auth list       # verificar autenticación
gcloud auth login      # si no, autenticar
```

---

## Paso 1 — Crear la VM en GCP

Crea una VM con GPU T4, 100 GB SSD y la imagen Deep Learning (CUDA + drivers NVIDIA preinstalados):

```bash
gcloud compute instances create expai-dev \
  --project=TU_PROJECT_ID \
  --zone=asia-east1-b \
  --machine-type=n1-standard-4 \
  --accelerator=type=nvidia-tesla-t4,count=1 \
  --image-family=pytorch-2-7-cu128-ubuntu-2204-nvidia-570 \
  --image-project=deeplearning-platform-release \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-ssd \
  --maintenance-policy=TERMINATE \
  --scopes=default,https://www.googleapis.com/auth/devstorage.read_write \
  --metadata=install-nvidia-driver=True
```

> ⚠️ El scope `devstorage.read_write` es obligatorio para que la exportación a GCS funcione. No se puede añadir después sin detener la VM.

Verificar que la VM arrancó:

```bash
gcloud compute instances list --project=TU_PROJECT_ID
```

---

## Paso 2 — Abrir el firewall HTTP

Para acceder a la app desde el navegador:

```bash
gcloud compute firewall-rules create allow-http \
  --project=TU_PROJECT_ID \
  --allow=tcp:80 \
  --source-ranges=0.0.0.0/0
```

---

## Paso 3 — Conectar VS Code a la VM

```bash
# Generar clave SSH si no tienes una
ssh-keygen -t ed25519 -C "expai-dev"

# Registrar la clave en GCP
gcloud compute config-ssh --project=TU_PROJECT_ID
```

En VS Code: `Ctrl+Shift+P` → `Remote-SSH: Connect to Host` → selecciona la VM.

Verificar GPU dentro de la VM:

```bash
nvidia-smi   # debe mostrar T4 con 16 GB VRAM
```

---

## Paso 4 — Clonar el proyecto en la VM

```bash
git clone https://github.com/tu-org/expai-prelabeling.git
cd expai-prelabeling
```

---

## Paso 5 — Descargar checkpoint de SAM 2

```bash
# Modelo recomendado para T4 (8 GB VRAM, mejor balance velocidad/precisión)
wget -P checkpoints \
  https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_base_plus.pt
```

| Variante | VRAM | Velocidad | Uso |
|----------|------|-----------|-----|
| sam2_hiera_tiny | 4 GB | Muy rápida | Testing |
| sam2_hiera_small | 6 GB | Rápida | GPU pequeña |
| sam2_hiera_base_plus | 8 GB | Media | **Recomendado (T4)** |
| sam2_hiera_large | 12-16 GB | Lenta | Máxima precisión |

---

## Paso 6 — Variables de entorno

```bash
cp .env.example .env
```

Valores por defecto en `.env.example`:

```env
DATABASE_URL=postgresql://postgres:expai_secret@db:5432/expai
REDIS_URL=redis://redis:6379
STORAGE_PATH=/app/storage
SAM2_MODEL=sam2_hiera_base_plus
SAM2_CHECKPOINT=/app/checkpoints/sam2_hiera_base_plus.pt

# En producción con nginx: usar /api (ruta relativa)
# En desarrollo local sin nginx: usar http://localhost:8000
VITE_API_URL=/api
```

---

## Paso 7 — Levantar con Docker Compose

```bash
docker compose up --build
```

La primera vez tarda varios minutos (instala PyTorch + SAM 2). Las siguientes son inmediatas.

Verificar que todos los contenedores están activos:

```bash
docker compose ps
```

Debes ver 6 servicios en `Up`: `db`, `redis`, `backend`, `worker`, `frontend`, `nginx`.

---

## Paso 8 — Acceder a la app

La app queda accesible en:

```
http://IP_PUBLICA_VM/
```

La documentación interactiva de la API (Swagger UI):

```
http://IP_PUBLICA_VM/api/docs
```

> En desarrollo local con VS Code Remote SSH, los puertos se redirigen automáticamente:
> `http://localhost:5173` (frontend directo) · `http://localhost:8000/docs` (API)

---

## Estructura del proyecto

```
expai-prelabeling/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── annotations.py   # Segmentación, propagación, aprobación masiva
│   │   │   ├── projects.py      # CRUD proyectos + etiquetas + stats de vídeo
│   │   │   ├── videos.py        # Upload + extracción de frames
│   │   │   ├── jobs.py          # Estado de jobs asíncronos
│   │   │   └── export.py        # Export ZIP y export a GCS (async)
│   │   ├── models/
│   │   │   ├── annotation.py    # source_annotation_id (trazabilidad multi-instancia)
│   │   │   ├── frame.py
│   │   │   ├── video.py
│   │   │   ├── project.py
│   │   │   ├── project_label.py # Vocabulario de etiquetas por proyecto
│   │   │   └── job.py
│   │   ├── services/
│   │   │   ├── sam2_service.py     # Segmentación + multi-mask output
│   │   │   ├── export_service.py   # YOLO-Det, YOLO-Seg, COCO, GCS upload
│   │   │   └── video_service.py    # Extracción de frames con OpenCV
│   │   └── tasks/
│   │       ├── celery_app.py
│   │       ├── propagation.py      # Propagación GPU asíncrona
│   │       └── export_task.py      # Export GCS asíncrono con progress callbacks
│   ├── alembic/versions/
│   │   ├── 001_initial_schema.py
│   │   ├── 002_source_annotation_id.py
│   │   └── 003_project_labels.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── ProjectsPage.jsx       # Lista y creación de proyectos
│       │   ├── ProjectDetailPage.jsx  # Videos del proyecto
│       │   ├── VideoPage.jsx          # Hub: stats + etiquetas + export GCS
│       │   ├── AnnotatePage.jsx       # Canvas interactivo + SAM 2
│       │   └── PropagationPage.jsx    # Revisión filmstrip
│       ├── components/
│       │   ├── AnnotationCanvas.jsx   # Konva.js + interacción punto de clic
│       │   └── ExportPanel.jsx        # Panel de exportación ZIP
│       ├── store/useStore.js          # Zustand — estado global
│       └── api/client.js             # Axios — cliente REST
├── checkpoints/
├── storage/                           # Frames JPEG (volumen Docker)
├── docs/
├── docker-compose.yml
├── nginx.conf
└── .env.example
```

---

## API — Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/projects` | Crear proyecto |
| `GET` | `/projects` | Listar proyectos |
| `POST` | `/projects/{id}/videos` | Subir vídeo (extrae frames automáticamente) |
| `GET` | `/projects/{pid}/videos/{vid}/stats` | Estadísticas de anotación del vídeo |
| `GET` | `/projects/{id}/labels` | Vocabulario de etiquetas del proyecto |
| `POST` | `/projects/{id}/labels` | Añadir etiqueta manualmente |
| `POST` | `/annotations/segment` | Segmentar objeto con SAM 2 (un clic) |
| `POST` | `/annotations/segment-options` | 3 máscaras candidatas (multi-mask) |
| `POST` | `/annotations/save-mask` | Guardar máscara elegida |
| `POST` | `/annotations/propagate` | Propagar máscara (job Celery asíncrono) |
| `POST` | `/annotations/approve-bulk` | Aprobar en lote + auto-registrar etiquetas |
| `DELETE` | `/annotations/{id}` | Eliminar anotación |
| `GET` | `/jobs/{id}` | Estado y progreso de job asíncrono |
| `POST` | `/projects/{id}/export` | Generar ZIP descargable (YOLO-Det, YOLO-Seg, COCO) |
| `POST` | `/projects/{id}/export/gcs` | Exportar a GCS (job Celery — devuelve `job_id`) |

---

## Formatos de exportación

### YOLO Segmentation (recomendado)

```
dataset/
├── data.yaml                      # nc, names, train/val paths
├── images/
│   ├── train/  frame_8_000001.jpg
│   └── val/
└── labels/
    ├── train/  frame_8_000001.txt  # <class> x1 y1 x2 y2 ... (polígono normalizado)
    └── val/
```

Cada línea en `.txt`: `<class_id> <x1> <y1> <x2> <y2> ...` — coordenadas normalizadas `[0,1]` extraídas del contorno de la máscara binaria RLE mediante `cv2.findContours`.

### YOLO Detection

Mismo layout, labels en formato `<class_id> <x_center> <y_center> <width> <height>`.

### COCO JSON

Exporta `annotations.json` con estructura COCO estándar, incluyendo segmentación poligonal cuando hay máscara disponible.

---

## Exportación asíncrona a GCS

El endpoint `POST /projects/{id}/export/gcs` devuelve `{"job_id": N}` inmediatamente. La subida corre en background (Celery). El cliente hace polling a `GET /jobs/{id}` para consultar progreso.

```
POST /api/projects/8/export/gcs
→ {"job_id": 29}           (< 200 ms)

GET /api/jobs/29
→ {"status": "running", "progress": 44}

GET /api/jobs/29
→ {"status": "success", "progress": 100,
   "result": {"files_uploaded": 755, "bucket": "mi-bucket", ...}}
```

La VideoPage muestra una barra de progreso animada durante la subida.

---

## Gestionar la VM — costes

La T4 cuesta ~0.55 USD/hora solo cuando la VM está en `RUNNING`. Apagarla siempre que no se esté usando.

```bash
# Apagar (desde tu laptop)
gcloud compute instances stop expai-dev --zone=asia-east1-b --project=TU_PROJECT_ID

# Encender
gcloud compute instances start expai-dev --zone=asia-east1-b --project=TU_PROJECT_ID

# Ver IP actual (cambia cada vez que arranca)
gcloud compute instances describe expai-dev \
  --zone=asia-east1-b --project=TU_PROJECT_ID \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

> ⚠️ La IP pública cambia cada vez que se reinicia la VM. El disco (frames, BD, checkpoints) persiste siempre.

| Horas de uso diario | Costo diario | Costo mensual |
|---------------------|-------------|---------------|
| 4 h | ~2.20 USD | ~66 USD |
| 6 h | ~3.30 USD | ~99 USD |
| 8 h | ~4.40 USD | ~132 USD |

---

## Licencia

Propietario — Uso interno restringido.
