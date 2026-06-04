# MENTAT — Pre-Labeling con SAM 2

**Herramienta de pre-etiquetado automático de vídeo industrial mediante segmentación semántica con SAM 2 (Meta AI), con exportación directa a la fábrica de modelos AlphaPlus.**

Reduce el tiempo de etiquetado entre un 70 % y un 85 % respecto al flujo manual.

---

## Tabla de contenidos

1. [El problema que resuelve](#el-problema-que-resuelve)
2. [Arquitectura general](#arquitectura-general)
3. [Stack tecnológico](#stack-tecnológico)
4. [Modelo de datos](#modelo-de-datos)
5. [Flujo de anotación end-to-end](#flujo-de-anotación-end-to-end)
6. [Servicios y orquestación de jobs asíncronos](#servicios-y-orquestación-de-jobs-asíncronos)
7. [Integración SAM 2](#integración-sam-2)
8. [Formatos de exportación](#formatos-de-exportación)
9. [Integración con AlphaPlus (fábrica de modelos)](#integración-con-alphaplus-fábrica-de-modelos)
10. [API REST — referencia](#api-rest--referencia)
11. [Despliegue](#despliegue)
12. [Configuración por variables de entorno](#configuración-por-variables-de-entorno)
13. [Operación y costes](#operación-y-costes)

---

## El problema que resuelve

El pipeline de entrenamiento de modelos de visión artificial en entornos industriales requiere etiquetar vídeos **frame a frame** antes de entrenar modelos YOLO. Hacerlo a mano es:

- **Lento** — 200-400 frames por minuto de vídeo → horas de trabajo manual por clip.
- **Inconsistente** — la calidad varía entre operarios y entre sesiones.
- **No escalable** — cada nuevo dataset es un nuevo coste lineal.

MENTAT automatiza la propagación temporal de máscaras: el operario hace **un clic** sobre el objeto en un frame, SAM 2 lo rastrea a lo largo de todo el clip, y el operario solo **revisa y aprueba en lote**. El resultado se exporta directamente al bucket de la fábrica de modelos para entrenar el YOLO sin intervención manual adicional.

---

## Arquitectura general

MENTAT corre en una VM con GPU (Tesla T4) y se integra con la fábrica de modelos **AlphaPlus** alojada en otra VM, en otro proyecto de GCP. La comunicación es **HTTP + GCS compartido**.

```
                            GCP — multi-project, multi-region

  ┌─ Proyecto: <MENTAT_PROJECT_ID> ──────────────┐    ┌─ Proyecto: <ALPHAPLUS_PROJECT_ID> ─────────────┐
  │   VM: <MENTAT_PROJECT_ID> (asia-east1-c)     │    │   VM: fabricademodelos-app             │
  │   IP: <MENTAT_VM_IP>                    │    │   IP: <ALPHAPLUS_VM_IP>                    │
  │   GPU: Tesla T4 16 GB                  │    │                                         │
  │                                        │    │   • FastAPI app                        │
  │   ┌──────────────────────────────┐    │    │   • Recibe POST /api/datasets/mentat/  │
  │   │ docker-compose (6 servicios)  │    │    │     register                           │
  │   │  ├─ nginx       (puerto 80)   │    │    │   • Lanza training en VM2 GPU          │
  │   │  ├─ frontend    (Vite 5173)   │    │    │                                         │
  │   │  ├─ backend     (FastAPI)     │◀──┼────┼─▶ GET /api/config  (descubrimiento)    │
  │   │  ├─ worker      (Celery+GPU)  │    │    │   POST /api/datasets/mentat/register   │
  │   │  ├─ db          (Postgres 15) │    │    │                                         │
  │   │  └─ redis       (Redis 7)     │    │    │   ┌─ VM2 GPU (only on-demand) ────┐   │
  │   └──────────────────────────────┘    │    │   │  fabricademodelos--trainer     │   │
  │                                        │    │   │  L4 GPU — arranca solo cuando  │   │
  │                                        │    │   │  hay job de training en cola   │   │
  │                                        │    │   └────────────────────────────────┘   │
  └────────────────┬───────────────────────┘    └────────────────┬───────────────────────┘
                   │                                              │
                   │                                              │
                   │     Google Cloud Storage (<ALPHAPLUS_PROJECT_ID>)    │
                   │     gs://<ALPHAPLUS_BUCKET>/                │
                   └────────▶ datasets/mentat/project_{N}/...  ◀──┘
                              ├── images/{train,val}/*.jpg
                              ├── labels/{train,val}/*.txt
                              └── data.yaml
```

### Componentes internos (Docker Compose)

```
nginx ──┬─▶ frontend (Vite dev server con HMR)
        └─▶ backend  (Uvicorn con --reload)
              │
              ├─▶ db    (PostgreSQL 15)
              ├─▶ redis (broker Celery)
              └─▶ worker (Celery con acceso GPU NVIDIA)
                    │
                    └─▶ SAM 2 (PyTorch + CUDA)
```

El **backend** y el **worker** comparten la misma imagen y mismo volumen (`./backend:/app`). El worker tiene acceso GPU vía `device_requests` en docker-compose, lo que permite que SAM 2 corra inferencia y propagación en CUDA.

---

## Stack tecnológico

| Capa | Tecnología | Notas |
|------|------------|-------|
| Modelo de segmentación | **SAM 2** (Meta AI) | `sam2_hiera_base_plus.pt` — 8 GB VRAM |
| Inferencia | PyTorch 2.7 + CUDA 12.8 | NVIDIA Tesla T4 |
| Backend | FastAPI + Python 3.10 | Async-first, Pydantic v2 |
| Tareas asíncronas | Celery + Redis 7 | Concurrency=1 (GPU exclusiva) |
| ORM | SQLAlchemy 2.0 | `Mapped[...]` type hints |
| Migraciones | Alembic | Versionado lineal |
| Base de datos | PostgreSQL 15 | `frames`, `annotations`, `jobs`, `project_labels` |
| Procesamiento de vídeo | OpenCV + FFmpeg | Extracción de frames JPEG |
| Cloud storage | google-cloud-storage 2.17 | Application Default Credentials (ADC) |
| Frontend | React 18 + Vite 5 | HMR, ES modules |
| Canvas interactivo | Konva.js | Capa de máscaras + puntos de clic |
| Estado global | Zustand | Sin Redux boilerplate |
| HTTP cliente | Axios | Timeout 5 min para uploads/propagaciones |
| Proxy inverso | Nginx | `/api/*` → backend, resto → frontend |
| Orquestación | Docker Compose v2 | 6 servicios, healthchecks en BD y Redis |
| Cloud | Google Compute Engine | 2 VMs en 2 proyectos distintos |

---

## Modelo de datos

```
┌─────────────┐         ┌────────────┐         ┌────────────┐         ┌──────────────┐
│  projects   │1───────∞│   videos   │1───────∞│   frames   │1───────∞│ annotations  │
├─────────────┤         ├────────────┤         ├────────────┤         ├──────────────┤
│ id          │         │ id         │         │ id         │         │ id           │
│ name        │         │ project_id │         │ video_id   │         │ frame_id     │
│ description │         │ filename   │         │ frame_idx  │         │ label        │
│ created_at  │         │ fps        │         │ file_path  │         │ bbox_xywh    │
│ updated_at  │         │ duration   │         │ created_at │         │ mask_rle     │
└─────────────┘         └────────────┘         └────────────┘         │ is_approved  │
       │1                                                              │ source_      │
       │                                                                │   annot_id   │←┐
       │∞                                                              └──────────────┘ │
┌──────────────┐                                                                        │
│ project_     │                                                              (auto-ref:│
│ labels       │                                                              propagated│
├──────────────┤                                                              from)     │
│ id           │                                                                        │
│ project_id   │                                                                        │
│ label_name   │                                                                        │
└──────────────┘                                                                        │
                                                                                        │
                              ┌────────────┐                                            │
                              │    jobs    │                                            │
                              ├────────────┤                                            │
                              │ id         │                                            │
                              │ job_type   │  ← 'propagation' | 'export_gcs'           │
                              │ status     │  ← 'pending' | 'running' | 'success' | …  │
                              │ progress   │  ← 0-100                                  │
                              │ celery_task_id                                          │
                              │ result     │  ← JSON serializado                       │
                              │ error_message                                          │
                              │ video_id   │                                            │
                              └────────────┘                                            │
                                                                                        │
                                                                                        │
                                                              ─────────────────────────┘
```

**Puntos clave del esquema:**

- `annotations.mask_rle` — máscara binaria comprimida en run-length encoding (RLE), formato `{"start": 0|1, "rle": [n1, n2, ...]}`. Se descomprime al exportar para sacar polígonos.
- `annotations.source_annotation_id` — trazabilidad multi-instancia. Cuando SAM 2 propaga una anotación a otros frames, las hijas referencian a la madre, permitiendo aprobaciones en lote y borrados en cascada.
- `annotations.is_approved` — flag de validación humana. La exportación puede filtrar por `approved_only=true`.
- `jobs` — patrón outbox para tareas Celery. El frontend hace polling cada 2 s a `GET /jobs/{id}`.
- `project_labels` — vocabulario por proyecto que se auto-puebla al aprobar anotaciones, pero también admite gestión manual.

---

## Flujo de anotación end-to-end

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1.  UPLOAD VÍDEO                                                          │
│    POST /projects/{id}/videos  (multipart/form-data)                     │
│      ↳ backend guarda mp4 en /app/storage/videos/                        │
│      ↳ OpenCV extrae N frames JPEG → /app/storage/frames/{video_id}/     │
│      ↳ Crea registros Frame en BD                                        │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ 2.  SEGMENTACIÓN INTERACTIVA  (AnnotatePage + Konva canvas)              │
│    Operario hace clic sobre objeto → POST /annotations/segment-options   │
│      ↳ SAM 2 multi-mask → devuelve 3 máscaras candidatas con score       │
│      ↳ Frontend renderiza las 3 sobre el frame, operario elige           │
│    POST /annotations/save-mask  → guarda RLE + bbox + label              │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ 3.  PROPAGACIÓN TEMPORAL  (job Celery asíncrono)                         │
│    POST /annotations/propagate {annotation_id, from_idx, to_idx}         │
│      ↳ Crea Job(status='pending') → devuelve job_id                      │
│      ↳ Celery worker (GPU): SAM2VideoPredictor.propagate_in_video()      │
│      ↳ Por cada frame del rango: crea Annotation hija con                │
│        source_annotation_id = madre, is_approved=False                   │
│      ↳ Job.progress se actualiza 0→100                                   │
│    Frontend hace polling GET /jobs/{id} cada 2s                          │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ 4.  REVISIÓN EN LOTE  (PropagationPage — filmstrip)                      │
│    Operario revisa filmstrip de todas las propagaciones                  │
│    POST /annotations/approve-bulk {annotation_ids: [...]}                │
│      ↳ Marca is_approved=true                                            │
│      ↳ Auto-añade label a project_labels (vocabulario del proyecto)     │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ 5.  EXPORTACIÓN  (VideoPage — panel GCS)                                 │
│    Opción A — ZIP descargable:                                           │
│      POST /projects/{id}/export → FileResponse(.zip)                     │
│                                                                           │
│    Opción B — Subida directa al bucket de la fábrica:                    │
│      POST /projects/{id}/export/gcs → {job_id}                           │
│      ↳ Celery worker:                                                    │
│         1. Construye dataset YOLO-Seg/Det o COCO en disco                │
│         2. Sube archivos a gs://<ALPHAPLUS_BUCKET>/datasets/mentat/...  │
│         3. Llama a POST http://alphaplus/api/datasets/mentat/register    │
│         4. AlphaPlus encola training en su VM GPU                        │
│      ↳ result.factory_dataset_id → frontend muestra link a fábrica       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Servicios y orquestación de jobs asíncronos

### Patrón Job + Polling

Todas las operaciones largas (propagación, export a GCS) siguen el mismo patrón:

```
Cliente ───POST /endpoint───▶ Backend (FastAPI)
                                 │
                                 ├─▶ INSERT INTO jobs (status='pending')
                                 ├─▶ celery_task.delay(args)
                                 └─◀── return {"job_id": N}      [< 200 ms]

Cliente ───GET /jobs/N─────▶ Backend
                                 └─◀── {status, progress, result}  [polling 2s]

           (en background)  Celery Worker
                                 │
                                 ├─▶ UPDATE jobs SET status='running'
                                 ├─▶ trabajo pesado (GPU / GCS upload)
                                 │   actualiza job.progress en cada paso
                                 ├─▶ UPDATE jobs SET status='success', result=JSON(...)
                                 └─▶ FIN
```

### Tabla de tareas Celery

| Task name | Trigger | GPU | Duración típica |
|-----------|---------|-----|-----------------|
| `propagation_task` | `POST /annotations/propagate` | ✅ | 10-90 s |
| `export_to_gcs` | `POST /projects/{id}/export/gcs` | ❌ | 30 s – varios min |

El worker corre con `--concurrency=1` para serializar acceso a la GPU.

---

## Integración SAM 2

### Carga del modelo

`backend/app/services/sam2_service.py` carga `SAM2ImagePredictor` y `SAM2VideoPredictor` lazy en el primer uso. El checkpoint está montado como volumen Docker en `/app/checkpoints/sam2_hiera_base_plus.pt`.

### Segmentación interactiva (multi-mask output)

```python
predictor.set_image(frame_rgb)
masks, scores, logits = predictor.predict(
    point_coords=np.array([[x, y]]),
    point_labels=np.array([1]),     # 1 = foreground
    multimask_output=True,          # devuelve 3 candidatos
)
```

El backend codifica las 3 máscaras como RLE y las devuelve junto a sus scores. El frontend pinta las 3 superpuestas sobre el frame, y el operario elige la mejor.

### Propagación temporal

`SAM2VideoPredictor` mantiene memoria temporal cross-frame. Dado un frame inicial con una máscara, propaga la segmentación a frames adyacentes manteniendo coherencia espacial:

```python
inference_state = predictor.init_state(video_path=frames_dir)
predictor.add_new_mask(inference_state, frame_idx=start, obj_id=1, mask=initial_mask)

for out_frame_idx, out_obj_ids, out_mask_logits in predictor.propagate_in_video(inference_state):
    # Persiste Annotation hija con source_annotation_id = annotation madre
    ...
```

---

## Formatos de exportación

### YOLO Segmentation (recomendado)

```
dataset_seg/
├── data.yaml
├── images/
│   ├── train/ frame_8_000001.jpg
│   └── val/
└── labels/
    ├── train/ frame_8_000001.txt      ← <class_id> <x1> <y1> <x2> <y2> ...
    └── val/
```

Cada línea en `.txt`: `class_id` seguido de pares `(x, y)` normalizados en `[0, 1]`, extraídos del contorno mayor de la máscara binaria mediante `cv2.findContours` + `cv2.approxPolyDP` (simplificación con `epsilon = 0.002 * arcLength`).

### YOLO Detection

Mismo layout. Cada línea: `class_id x_center y_center width height` (todo normalizado).

### COCO JSON

```json
{
  "info": {"description": "MENTAT Export - Project N"},
  "categories": [{"id": 1, "name": "label_name", "supercategory": "object"}],
  "images":      [{"id": 1, "file_name": "...", "frame_index": N, "video_id": M}],
  "annotations": [{"id": 1, "image_id": 1, "category_id": 1,
                   "bbox": [x, y, w, h], "area": w*h, "iscrowd": 0,
                   "segmentation": [[x1, y1, x2, y2, ...]]}]
}
```

Las coordenadas de segmentación COCO son **absolutas en píxeles**, a diferencia de YOLO que las usa normalizadas.

---

## Integración con AlphaPlus (fábrica de modelos)

MENTAT se integra con **AlphaPlus** (FastAPI en otra VM, otro proyecto GCP) para entregar datasets listos para entrenar.

### Descubrimiento de configuración

Al arrancar el backend o al hacer la primera consulta, MENTAT llama a:

```
GET http://alphaplus-host/api/config
```

Respuesta esperada:

```json
{
  "gcs_bucket":        "<ALPHAPLUS_BUCKET>",
  "datasets_prefix":   "datasets/",
  "register_endpoint": "/api/datasets/mentat/register",
  "api_version":       "1.0"
}
```

El resultado se cachea en memoria. Si el endpoint no responde, MENTAT cae a `ALPHA_PLUS_BUCKET` del `.env` (prioridad env > config remoto).

### Flujo de exportación directa

```
┌─ MENTAT backend ─────────────────────────────────────────┐
│                                                           │
│  POST /projects/{id}/export/gcs                          │
│         │                                                 │
│         ▼                                                 │
│  export_to_gcs_task (Celery)                              │
│         │                                                 │
│         ├─ 1. build dataset en /tmp                      │
│         │                                                 │
│         ├─ 2. upload_to_gcs(                             │
│         │       bucket="<ALPHAPLUS_BUCKET>",            │
│         │       prefix="datasets/mentat/project_N/...")  │
│         │                                                 │
│         └─ 3. notify_factory()                           │
│               POST /api/datasets/mentat/register         │
│               {                                           │
│                 "project_name": "...",                   │
│                 "format": "yolo_seg",                    │
│                 "bucket": "<ALPHAPLUS_BUCKET>",         │
│                 "gcs_prefix": "datasets/mentat/...",     │
│                 "files_uploaded": 755,                   │
│                 "source_project_id": N                   │
│               }                                           │
│               → {"dataset_id": 42}                       │
└───────────────────────────────────────────────────────────┘

   Result devuelto al frontend:
   {
     "factory_dataset_id": 42,
     "files_uploaded": 755,
     "bucket": "<ALPHAPLUS_BUCKET>",
     "gcs_prefix": "datasets/mentat/project_N/video_M"
   }
```

El frontend renderiza un botón **"Ver en fábrica de modelos →"** que enlaza directamente al dataset.

### Tolerancia a fallos

`notify_factory()` es **idempotente y tolera fallos**:

- Si AlphaPlus está caído, el dataset ya está en GCS y `factory_dataset_id = None`.
- El frontend muestra una nota: *"Dataset en GCS. Regístralo manualmente en la fábrica si es necesario."*
- La VM2 GPU de AlphaPlus puede descubrirlo igualmente vía `GET /api/datasets/mentat` (escaneo de GCS).

### Permisos IAM cross-project

La service account por defecto de la VM de MENTAT (`{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`) necesita escritura sobre el bucket de AlphaPlus:

```bash
gcloud storage buckets add-iam-policy-binding gs://<ALPHAPLUS_BUCKET> \
  --member=serviceAccount:{MENTAT_PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectAdmin \
  --project=<ALPHAPLUS_PROJECT_ID>
```

Sin esto: `403 Forbidden — does not have storage.objects.create access`.

---

## API REST — referencia

### Proyectos y vídeos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/projects` | Crear proyecto |
| `GET` | `/projects` | Listar proyectos |
| `GET` | `/projects/{id}` | Detalle de proyecto |
| `DELETE` | `/projects/{id}` | Eliminar (cascade videos+frames+annotations) |
| `POST` | `/projects/{id}/videos` | Subir vídeo + extraer frames |
| `GET` | `/projects/{id}/videos` | Listar vídeos del proyecto |
| `GET` | `/projects/{pid}/videos/{vid}/stats` | Stats de anotación: cobertura, aprobadas, etc. |

### Etiquetas del proyecto

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/projects/{id}/labels` | Vocabulario de etiquetas |
| `POST` | `/projects/{id}/labels` | Añadir etiqueta manual |
| `DELETE` | `/projects/{id}/labels/{name}` | Quitar etiqueta del vocabulario |

### Anotaciones y propagación

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/annotations/segment` | Segmentar (un clic, una máscara) |
| `POST` | `/annotations/segment-options` | 3 máscaras candidatas (multi-mask) |
| `POST` | `/annotations/save-mask` | Persistir máscara elegida |
| `POST` | `/annotations/propagate` | Propagar a frames adyacentes (job Celery) |
| `POST` | `/annotations/approve-bulk` | Aprobar en lote + registrar etiquetas |
| `GET` | `/annotations/frame/{frame_id}` | Anotaciones de un frame |
| `PUT` | `/annotations/{id}` | Modificar etiqueta/máscara |
| `DELETE` | `/annotations/{id}` | Eliminar (cascade hijas) |

### Jobs

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/jobs/{id}` | Estado, progress, result, error_message |

### Exportación

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/projects/{id}/export` | Genera ZIP (responseType: blob) |
| `POST` | `/projects/{id}/export/gcs` | Sube a GCS + notifica AlphaPlus (job Celery) |

### Configuración

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/config` | Devuelve config de AlphaPlus (bucket, prefix, register endpoint) |

---

## Despliegue

### Requisitos en la máquina del desarrollador

- VS Code con extensión Remote-SSH
- gcloud CLI autenticado (`gcloud auth login`)

### 1. Crear la VM con GPU

```bash
gcloud compute instances create mentat-dev \
  --project=TU_PROJECT_ID \
  --zone=asia-east1-c \
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

> ⚠️ El scope `devstorage.read_write` es **obligatorio** para que la exportación a GCS funcione. No se puede añadir después sin detener y recrear la VM.

### 2. Firewall

```bash
gcloud compute firewall-rules create allow-http \
  --project=TU_PROJECT_ID \
  --allow=tcp:80 \
  --source-ranges=0.0.0.0/0
```

### 3. Clonar repo en la VM

```bash
ssh-keygen -t ed25519 -C "mentat-dev"
gcloud compute config-ssh --project=TU_PROJECT_ID

# Dentro de la VM:
git clone https://github.com/TU_USUARIO/MENTAT.git
cd MENTAT
```

### 4. Descargar checkpoint SAM 2

```bash
wget -P checkpoints \
  https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_base_plus.pt
```

| Variante | VRAM | Velocidad | Uso |
|----------|------|-----------|-----|
| sam2_hiera_tiny | 4 GB | ⚡⚡⚡ | Testing |
| sam2_hiera_small | 6 GB | ⚡⚡ | GPU pequeña |
| **sam2_hiera_base_plus** | **8 GB** | ⚡ | **Recomendado (T4)** |
| sam2_hiera_large | 12-16 GB | 🐢 | Máxima precisión |

### 5. Configurar `.env`

```bash
cp .env.example .env
nano .env   # ver sección "Configuración por variables de entorno"
```

### 6. Levantar la app

```bash
docker compose up --build -d
docker compose ps   # verificar 6 servicios Up
```

La primera build tarda 5-10 min (PyTorch + dependencias). Las siguientes son rápidas.

### 7. Acceder

```
http://IP_PUBLICA_VM/        ← app
http://IP_PUBLICA_VM/api/docs ← Swagger UI
```

---

## Configuración por variables de entorno

Consulta `.env.example` para la lista completa de variables. Las claves principales son:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `REDIS_URL` | Broker Celery |
| `STORAGE_PATH` | Ruta donde se persisten vídeos y frames |
| `SAM2_MODEL` / `SAM2_CHECKPOINT` | Variante y checkpoint de SAM 2 |
| `VITE_API_URL` | `/api` en producción (nginx) o `http://localhost:8000` en dev |
| `ALPHA_PLUS_URL` | URL interna de la fábrica de modelos |
| `ALPHA_PLUS_BUCKET` | Override del bucket si la fábrica no expone `/api/config` |

> ⚠️ Tras editar el `.env`, **`docker compose restart` NO es suficiente** — no recarga `env_file`. Usa `docker compose up -d` para recrear los contenedores con las nuevas variables.

---

## Operación y costes

### Apagar / encender la VM

```bash
gcloud compute instances stop  mentat-dev --zone=asia-east1-c --project=TU_PROJECT_ID
gcloud compute instances start mentat-dev --zone=asia-east1-c --project=TU_PROJECT_ID
```

> La IP pública cambia cada vez que se reinicia. El disco (frames, BD, checkpoints) persiste.

### Coste estimado (Tesla T4 + n1-standard-4)

| Uso diario | Coste/día | Coste/mes |
|------------|-----------|-----------|
| 4 h | ~2.20 USD | ~66 USD |
| 6 h | ~3.30 USD | ~99 USD |
| 8 h | ~4.40 USD | ~132 USD |

### Logs y debug

```bash
docker compose logs -f backend
docker compose logs -f worker
docker exec mentat-backend-1 env | grep ALPHA   # verificar vars cargadas
curl http://localhost:8000/config               # verificar integración AlphaPlus
```

---

## Licencia

Propietario — Uso interno restringido.
