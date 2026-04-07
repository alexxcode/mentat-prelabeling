# MENTAT — Memoria Técnica del Sistema
## *Automatic Pre-Labeling Tool for Industrial Video Annotation*

---

> **DOCUMENTO PRIVADO Y CONFIDENCIAL**
> Este documento contiene información técnica y estratégica de carácter reservado.
> Queda prohibida su reproducción, distribución o divulgación total o parcial sin
> autorización expresa del equipo de desarrollo.

---

| Campo             | Detalle                                |
|-------------------|----------------------------------------|
| **Nombre**        | MENTAT — Video Pre-Labeling System     |
| **Versión doc**   | 2.0                                    |
| **Fecha**         | Marzo 2026                             |
| **Estado**        | Activo — en desarrollo                 |
| **Clasificación** | Privado / Confidencial                 |

### Historial de versiones

| Versión | Fecha | Cambios principales |
|---------|-------|---------------------|
| 1.0 | Feb 2026 | Documento inicial. Arquitectura base, SAM 2, flujos de anotación y propagación |
| 2.0 | Mar 2026 | Jerarquía Proyectos→Videos, registro de etiquetas, exportación YOLO-Seg y GCS, diferenciación vs CVAT, análisis EXPAI |

---

## Tabla de Contenidos

1. [Propósito y Alcance](#1-propósito-y-alcance)
2. [Motivación y Contexto Industrial](#2-motivación-y-contexto-industrial)
3. [MENTAT vs CVAT — Diferenciación Estratégica](#3-mentat-vs-cvat--diferenciación-estratégica)
4. [Cómo MENTAT Destrava los Problemas de EXPAI](#4-cómo-mentat-destrava-los-problemas-de-expai)
5. [Nombre del Producto](#5-nombre-del-producto)
6. [Visión General del Sistema](#6-visión-general-del-sistema)
7. [Arquitectura de Alto Nivel](#7-arquitectura-de-alto-nivel)
8. [Stack Tecnológico](#8-stack-tecnológico)
9. [Arquitectura Backend](#9-arquitectura-backend)
10. [Arquitectura Frontend](#10-arquitectura-frontend)
11. [Integración con SAM 2](#11-integración-con-sam-2)
12. [Modelo de Datos](#12-modelo-de-datos)
13. [Flujos de Trabajo Principales](#13-flujos-de-trabajo-principales)
14. [Exportación de Datasets](#14-exportación-de-datasets)
15. [Infraestructura y Despliegue](#15-infraestructura-y-despliegue)
16. [Seguridad y Privacidad](#16-seguridad-y-privacidad)
17. [Capacidades Actuales](#17-capacidades-actuales)
18. [Limitaciones Conocidas](#18-limitaciones-conocidas)
19. [Hoja de Ruta](#19-hoja-de-ruta)
20. [Glosario](#20-glosario)

---

## 1. Propósito y Alcance

### 1.1 Propósito

MENTAT es una herramienta de software diseñada para **acelerar y semi-automatizar el proceso de etiquetado de datos de vídeo** en entornos industriales. Su función principal es actuar como capa de pre-etiquetado (*pre-labeling*), generando anotaciones de segmentación de alta calidad con intervención mínima del operario humano, que posteriormente valida y corrige el resultado.

El sistema no sustituye al experto humano: le asiste, reduciendo drásticamente el tiempo necesario para producir *datasets* de entrenamiento anotados para modelos de visión artificial.

### 1.2 Alcance del Documento

Este documento cubre:

- La diferenciación estratégica respecto a alternativas del mercado (CVAT)
- El análisis de los problemas específicos de EXPAI y cómo MENTAT los resuelve
- La arquitectura completa del sistema (backend, frontend, infraestructura)
- La integración con el modelo de segmentación SAM 2
- Los flujos de trabajo del operario
- El pipeline de exportación de datasets (YOLO-Seg, YOLO-Det, COCO, GCS)
- El estado actual del desarrollo y la hoja de ruta

**Fuera de alcance:** Detalles de los proyectos industriales específicos que utilizan MENTAT como herramienta interna.

---

## 2. Motivación y Contexto Industrial

### 2.1 El Problema del Etiquetado de Vídeo

El entrenamiento de modelos de visión artificial supervisados requiere grandes volúmenes de datos anotados. En el contexto de la videovigilancia industrial, la inspección de calidad y el seguimiento de objetos en vídeo, el proceso de etiquetado manual presenta los siguientes retos:

| Reto | Descripción |
|------|-------------|
| **Volumen** | Un vídeo de 30 fps durante 10 segundos contiene 300 frames individuales, cada uno con potencialmente decenas de objetos a etiquetar |
| **Consistencia** | El etiquetado manual entre diferentes operarios produce variaciones que degradan la calidad del dataset |
| **Coste temporal** | Un experto puede tardar varias horas en anotar un minuto de vídeo con precisión de píxel |
| **Fatiga** | La repetitividad del proceso genera errores por cansancio en jornadas largas |
| **Seguimiento temporal** | La misma instancia de un objeto debe ser rastreable frame a frame, lo que el etiquetado manual por frame no garantiza |

### 2.2 La Oportunidad: Modelos de Segmentación Zero-Shot

La aparición de modelos de segmentación de propósito general capaces de operar sin entrenamiento específico (*zero-shot*) abre la posibilidad de:

1. El operario hace un único clic sobre el objeto en un frame inicial
2. El modelo genera automáticamente una máscara de segmentación precisa a nivel de píxel
3. El modelo propaga esa máscara a todos los frames restantes del vídeo
4. El operario solo revisa y aprueba (o corrige) el resultado

Este paradigma reduce el trabajo humano de **horas a minutos**.

### 2.3 Contexto de Validación

MENTAT se está validando internamente en el contexto del proyecto **EXPAI**, un proyecto de experimentación en entorno industrial donde se generan datasets de vídeo para entrenar modelos de detección y seguimiento. EXPAI actúa como banco de pruebas controlado para el sistema de pre-etiquetado.

> ⚠️ EXPAI es un proyecto de validación interna. Los casos de uso, datos e identidades industriales asociados a dicho proyecto son confidenciales y no se detallan en este documento.

---

## 3. MENTAT vs CVAT — Diferenciación Estratégica

**CVAT** (*Computer Vision Annotation Tool*, desarrollado por Intel y mantenido como proyecto open-source) es la herramienta de referencia en el sector para anotación de datasets de visión artificial. La comparación directa con MENTAT revela una diferencia fundamental de filosofía y alcance.

### 3.1 Tabla Comparativa

| Dimensión | CVAT | MENTAT |
|-----------|------|--------|
| **Propósito** | Herramienta genérica de anotación manual (imágenes, vídeo, 3D) | Pre-etiquetado automático de vídeo mediante segmentación con IA |
| **Modelo de trabajo** | El operario dibuja cada anotación manualmente en cada frame | El operario hace un clic; la IA genera y propaga la máscara |
| **Integración con IA** | Opcional, requiere configuración externa (modelos serverless) | SAM 2 integrado nativamente; inferencia on-premise en GPU propia |
| **Tipo de anotación** | BBox, polígonos, keypoints, tags, semántica | Segmentación de instancia por píxel (máscara binaria + RLE) |
| **Propagación de vídeo** | Interpolación lineal de bboxes entre keyframes | Propagación semántica real frame a frame (SAM 2 VideoPredictor) |
| **Calidad de máscara** | Limitada por la destreza manual del operario | Precisión de píxel, independiente del operario |
| **Curva de aprendizaje** | Alta. Interfaz compleja con decenas de opciones | Baja. Interfaz minimalista: clic → máscara → propagar |
| **Infraestructura** | Requiere servidor con K8s o Docker Compose multi-servicio + configuración extensa | Un único `docker compose up` sobre VM con GPU |
| **Multi-usuario** | Sí, con control de tareas, roles, organizaciones | No (diseño actual mono-usuario, roadmap multi-usuario) |
| **Exportación** | YOLO, COCO, VOC, LabelMe, etc. (muchos formatos) | YOLO-Det, YOLO-Seg, COCO JSON + subida directa a GCS |
| **Integración con cloud storage** | No nativa | Sí: exportación directa a Google Cloud Storage con ADC |
| **Control del vocabulario** | Por proyecto en la plataforma | Registro de etiquetas a nivel de proyecto con auto-población al aprobar |
| **Velocidad de etiquetado** | ~2-5 minutos por frame complejo (manual) | ~30 segundos por objeto en frame inicial + propagación automática |
| **Licencia** | Open source (MIT) — autogestión o CVAT.ai SaaS | Desarrollo propietario interno |
| **Coste operativo** | Alto si se usa CVAT.ai SaaS; alto en mantenimiento si self-hosted | Solo coste de VM GCP (~$0.35/h con T4, pagando solo cuando se usa) |

### 3.2 Por Qué CVAT No Es Suficiente para EXPAI

CVAT es una herramienta excelente para el caso de uso general de anotación colaborativa a gran escala. Sin embargo, presenta fricción estructural para el caso específico de EXPAI:

**1. La propagación de CVAT no es semántica.**
CVAT puede interpolar la posición de una bbox entre dos keyframes, pero no comprende la forma del objeto. Cuando el objeto rota, se deforma, cambia de escala o es ocluido parcialmente, la interpolación produce bboxes incorrectas que requieren corrección manual frame a frame. SAM 2 en MENTAT sí comprende la forma y la reasigna en cada frame.

**2. CVAT no produce máscaras de segmentación de instancia con naturalidad.**
El flujo de CVAT para crear polígonos precisos a nivel de píxel requiere que el operario trace el contorno punto a punto. En objetos industriales con bordes complejos esto es extremadamente lento. MENTAT genera la máscara automáticamente.

**3. El setup de CVAT con IA es complejo y frágil.**
Integrar un modelo de IA en CVAT requiere configurar "functions" serverless (Nuclio), desplegar el modelo como microservicio separado y mantener esa integración. MENTAT tiene SAM 2 integrado como servicio interno con cero fricción de configuración.

**4. CVAT no cierra el ciclo hacia la plataforma de entrenamiento.**
CVAT exporta localmente. En EXPAI, el dataset debe llegar a una plataforma de entrenamiento externa que lee desde Google Cloud Storage. MENTAT exporta directamente a GCS con un solo botón, eliminando la transferencia manual.

### 3.3 El Nicho de MENTAT

MENTAT no compite con CVAT en el espacio general de anotación colaborativa. MENTAT ocupa un nicho específico y de alto valor:

> **Equipos técnicos pequeños que necesitan producir datasets de segmentación de instancia en vídeo de manera rápida, con mínima intervención humana y exportación directa al pipeline de entrenamiento.**

En ese nicho, MENTAT es entre **5x y 20x más rápido** que el etiquetado manual con CVAT, dependiendo de la duración del vídeo y la complejidad de los objetos.

---

## 4. Cómo MENTAT Destrava los Problemas de EXPAI

EXPAI enfrenta un conjunto de problemas concretos en su ciclo de experimentación. Esta sección describe cada problema y la solución que MENTAT aporta.

### 4.1 Problema: El Etiquetado Manual es el Cuello de Botella

**Situación:** El equipo de EXPAI trabaja con vídeos industriales de duración variable (típicamente 5-30 segundos a 25-30 fps). Anotar cada frame manualmente requería horas de trabajo por vídeo, convirtiendo el etiquetado en el principal cuello de botella del ciclo de experimentación.

**Solución MENTAT:**
- El operario hace un único clic sobre el objeto en el frame más representativo
- SAM 2 genera la máscara completa en ~500ms
- La propagación automática cubre los 263 frames restantes en ~4 minutos
- El operario solo revisa el resultado: aprobación masiva en 1 llamada API

**Impacto medido:** Reducción del tiempo de etiquetado de **~4 horas a ~15 minutos** por vídeo de ~10 segundos con 2-3 categorías de objetos.

---

### 4.2 Problema: Inconsistencia en el Vocabulario de Etiquetas

**Situación:** En sesiones de trabajo distintas, los operarios usaban variantes del mismo concepto ("pieza", "Pieza", "PIEZA", "componente") sin un registro centralizado. Esta inconsistencia producía datasets con clases duplicadas que degradaban el entrenamiento.

**Solución MENTAT — Registro de Etiquetas por Proyecto (`ProjectLabel`):**

```
Proyecto EXPAI-01
└── Etiquetas confirmadas:
    ├── pieza           ← confirmada al aprobar anotaciones
    ├── operario        ← confirmada al aprobar anotaciones
    └── herramienta     ← añadida manualmente por el supervisor
```

- Al aprobar anotaciones (`/approve-bulk`), el sistema **auto-registra automáticamente** cada label nueva en la tabla `project_labels` del proyecto
- La `VideoPage` muestra el registro de etiquetas en tiempo real con gestión manual (añadir/eliminar)
- Al abrir `AnnotatePage`, el operario ve las etiquetas ya confirmadas como chips de selección rápida, preveniendo variantes incorrectas
- La tabla tiene una `UniqueConstraint(project_id, label_name)` que garantiza no-duplicidad a nivel de BD

---

### 4.3 Problema: La Plataforma de Entrenamiento Requiere Datos en GCS

**Situación:** La plataforma de entrenamiento de modelos de EXPAI consume datasets desde Google Cloud Storage en formato YOLO Segmentation. El proceso anterior requería: exportar ZIP desde la herramienta → descargar localmente → subir manualmente a GCS → configurar ruta. Proceso propenso a errores y lento.

**Solución MENTAT — Exportación directa a GCS:**

```
VideoPage
  └── ☁️ Exportar dataset
        ├── Formato: YOLO Segmentation (recomendado)
        ├── Bucket GCS: mi-bucket-expai
        ├── Prefijo: datasets/expai-01/video-42
        └── [Subir a GCS] → genera estructura → sube → devuelve URIs
```

El pipeline interno:
1. Reconstruye polígonos de contorno a partir de las máscaras RLE usando `cv2.findContours`
2. Normaliza las coordenadas [0-1] al formato YOLO-Seg
3. Agrupa anotaciones por frame (múltiples objetos en un mismo `.txt`)
4. Genera `data.yaml` con el vocabulario de clases
5. Sube todos los ficheros a GCS usando **Application Default Credentials** (ADC) — la VM ya tiene la cuenta de servicio configurada, sin claves adicionales
6. Devuelve el recuento de ficheros subidos y una muestra de URIs

**El ciclo completo**: Anotar → Propagar → Revisar → Exportar a GCS → Plataforma de entrenamiento lee desde GCS → entrena modelo. **Sin intervención manual en la transferencia de datos.**

---

### 4.4 Problema: Falta de Visibilidad del Progreso por Vídeo

**Situación:** No había una vista centralizada que mostrara cuántos frames estaban anotados, cuántas anotaciones aprobadas, o el porcentaje de cobertura de un vídeo. Los supervisores no podían saber el estado del dataset sin consultar la BD directamente.

**Solución MENTAT — VideoPage con estadísticas en tiempo real:**

```
📊 Progreso de anotación
████████████████████░░░░  73% frames anotados

Frames totales    Anotados    Total anots    Aprobadas    Propagadas
     263             192          384           312           288
```

El endpoint `GET /projects/{pid}/videos/{vid}/stats` computa en tiempo real:
- `total_frames`, `annotated_frames`, `coverage_pct`
- `total_annotations`, `approved_annotations`, `propagated_annotations`

---

### 4.5 Problema: Ambigüedad en la Segmentación de Objetos Complejos

**Situación:** En entornos industriales, algunos objetos tienen bordes poco definidos, reflejos o solapamientos parciales. Con un único clic, SAM 2 a veces genera la máscara de la región más grande en lugar del objeto específico de interés.

**Solución MENTAT — Multi-Mask Output:**

En lugar de recibir una única máscara, el operario puede activar el modo **🎯 3 opciones**:
- SAM 2 devuelve 3 máscaras candidatas con scores de confianza (ej: 94%, 78%, 61%)
- Las 3 opciones se superponen en el canvas en colores distintos (teal, naranja, rosa)
- El operario elige la más precisa con un clic

Este mecanismo aprovecha `multimask_output=True` de SAM 2, una capacidad del modelo que estaba disponible pero sin exposición en la UX.

---

### 4.6 Problema: Múltiples Instancias del Mismo Objeto

**Situación:** En vídeos con varias piezas del mismo tipo en escena, propagar "pieza A" y luego "pieza B" con el mismo label causaba que la segunda propagación sobreescribiera las anotaciones de la primera (búsqueda por `(frame_id, label)`).

**Solución MENTAT — `source_annotation_id`:**

Cada anotación propagada registra el ID de la anotación manual que la originó. La propagación busca existentes por `(frame_id, source_annotation_id)` en lugar de por label. Dos instancias del mismo label conviven en el mismo frame sin interferencia, cada una trazable hasta su anotación de origen.

---

## 5. Nombre del Producto

### 5.1 Denominación Actual

El sistema se denomina internamente **MENTAT**, en referencia a los analistas humanos de la saga literaria *Dune* de Frank Herbert: humanos entrenados para procesar información y asistir en la toma de decisiones a una velocidad y precisión fuera del alcance de la cognición ordinaria. La analogía es deliberada: MENTAT no reemplaza al experto, le amplifica.

### 5.2 Alternativas de Denominación Sugeridas

| Nombre | Significado | Valoración |
|--------|-------------|------------|
| **MENTAT** | Nombre actual, distintivo, carga semántica precisa | ★★★★☆ |
| **PRAXIS** | Del griego: acción guiada por el conocimiento | ★★★★☆ |
| **ARGUS** | Gigante de múltiples ojos — vigilancia total del vídeo | ★★★★☆ |
| **SEGVID** | SEGmentation VIDeo Annotator | ★★★☆☆ |
| **VETA** | Video Efficient Training Annotator | ★★★☆☆ |

La denominación **MENTAT** se mantiene como nombre de desarrollo. Para comunicación comercial o externa se recomendaría **PRAXIS** o **ARGUS** por mayor inmediatez de comprensión.

---

## 6. Visión General del Sistema

MENTAT es una aplicación web full-stack con los siguientes actores y flujos principales:

```
┌─────────────────────────────────────────────────────────────────┐
│                          OPERARIO                               │
│  (experto de dominio con conocimiento del objeto a etiquetar)   │
└────────────────────────────┬────────────────────────────────────┘
                             │  Interfaz web
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MENTAT Frontend                            │
│  React SPA · Canvas interactivo · VideoPage · Panel de revisión │
└────────────────────────────┬────────────────────────────────────┘
                             │  REST API
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MENTAT Backend                             │
│  FastAPI · SQLAlchemy · Celery Worker                           │
│                                                                 │
│   ┌─────────────────┐      ┌──────────────────────────────┐    │
│   │  SAM 2 Service  │      │   Propagation Task (Celery)  │    │
│   │  (GPU T4)       │      │   (GPU T4 — async)           │    │
│   └─────────────────┘      └──────────────────────────────┘    │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Export Service  (YOLO-Det · YOLO-Seg · COCO · GCS)    │   │
│   └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
 ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────────┐
 │   PostgreSQL    │ │  Sistema de     │ │  Google Cloud        │
 │   (Metadatos)   │ │  Ficheros JPEG  │ │  Storage (GCS)       │
 └─────────────────┘ └─────────────────┘ └──────────────────────┘
```

### 6.1 Propiedades Clave del Sistema

- **Semi-automático**: El operario indica qué y dónde; el sistema decide la forma exacta (máscara de píxeles)
- **No destructivo**: Las anotaciones originales nunca se sobreescriben automáticamente sin revisión humana
- **Trazable**: Cada anotación registra si fue creada manualmente o propagada, y cuál es su anotación origen
- **Vocabulario controlado**: El registro de etiquetas por proyecto garantiza consistencia entre sesiones y operarios
- **Pipeline cerrado**: Desde el vídeo bruto hasta el dataset en GCS listo para entrenamiento, sin pasos manuales

---

## 7. Arquitectura de Alto Nivel

```
                    ┌──────────────────┐
                    │     Nginx        │  :80 (reverse proxy)
                    └────────┬─────────┘
                             │
              ┌──────────────┴───────────────┐
              ▼                              ▼
   ┌──────────────────┐           ┌──────────────────┐
   │   Frontend       │           │   Backend API    │
   │   (Vite/React)   │           │   (FastAPI)      │
   │   :5173          │           │   :8000          │
   └──────────────────┘           └────────┬─────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
               ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
               │  PostgreSQL  │  │    Redis     │  │  Celery      │
               │  :5432       │  │  :6379       │  │  Worker      │
               │  (BBDD)      │  │  (Broker)    │  │  (GPU tasks) │
               └──────────────┘  └──────────────┘  └──────────────┘
```

Todos los servicios corren en contenedores Docker orquestados con **Docker Compose** sobre una única instancia de VM en Google Cloud Platform.

---

## 8. Stack Tecnológico

### 8.1 Backend

| Componente | Tecnología | Versión | Justificación |
|-----------|-----------|---------|---------------|
| Framework web | FastAPI | 0.111 | Alto rendimiento, tipado, async nativo, OpenAPI automático |
| ORM | SQLAlchemy | 2.0 | ORM maduro, soporte async, migraciones con Alembic |
| Base de datos | PostgreSQL | 15 | ACID, soporte JSON, ampliamente soportado |
| Cola de tareas | Celery | 5.4 | Estándar de facto para tareas asíncronas en Python |
| Broker de mensajes | Redis | 7 | Bajo overhead, alta velocidad, perfecto para cola de tasks |
| Modelo de IA | SAM 2 | 1.0 | Estado del arte en segmentación zero-shot (Meta AI) |
| Framework ML | PyTorch | 2.x (CUDA 11.8) | Backend de SAM 2, soporte GPU nativo |
| Procesado de imagen | OpenCV + Pillow | — | Extracción de frames, contornos, manipulación de imágenes |
| Cloud storage | google-cloud-storage | 2.17.0 | SDK oficial GCS con soporte ADC |
| Migración BD | Alembic | 1.13 | Migraciones versionadas con SQLAlchemy |
| Servidor ASGI | Uvicorn | 0.30 | Servidor de producción para FastAPI |

### 8.2 Frontend

| Componente | Tecnología | Versión | Justificación |
|-----------|-----------|---------|---------------|
| Framework UI | React | 18 | Ecosistema maduro, composición por componentes |
| Bundler | Vite | 5 | Build ultrarrápido, HMR en desarrollo |
| Estado global | Zustand | — | Ligero, sin boilerplate, orientado a hooks |
| Canvas 2D/GPU | Konva.js | — | Canvas declarativo sobre HTML5 Canvas con soporte React |
| Enrutado | React Router | 6 | Estándar para SPA en React |
| HTTP Client | Axios | — | Interceptores, cancelación, manejo de errores centralizado |

### 8.3 Infraestructura

| Componente | Tecnología | Detalle |
|-----------|-----------|---------|
| Plataforma cloud | Google Cloud Platform | Compute Engine |
| Tipo de instancia | n1-standard-4 | 4 vCPU, 15 GB RAM |
| GPU | NVIDIA Tesla T4 | 16 GB VRAM — inferencia SAM 2 |
| Sistema operativo | Ubuntu 20.04 LTS | — |
| Contenedores | Docker + Docker Compose | Orquestación local |
| Proxy inverso | Nginx Alpine | Gestión de rutas y CORS |
| Almacenamiento primario | Disco persistente GCP | Frames JPEG + BD |
| Almacenamiento de datasets | Google Cloud Storage | Destino final del export |

---

## 9. Arquitectura Backend

### 9.1 Estructura de Directorios

```
backend/
├── app/
│   ├── api/
│   │   ├── annotations.py   # Segmentación, propagación, aprobación masiva (+ auto-registro labels)
│   │   ├── projects.py      # CRUD proyectos + etiquetas por proyecto + stats de vídeo
│   │   ├── videos.py        # Upload, extracción de frames, eliminación de frames
│   │   ├── jobs.py          # Estado y progreso de jobs asíncronos
│   │   └── export.py        # Exportación local (ZIP) y a GCS
│   ├── models/
│   │   ├── annotation.py    # Anotación con source_annotation_id (self-ref FK)
│   │   ├── frame.py
│   │   ├── video.py
│   │   ├── project.py
│   │   ├── project_label.py # Registro de etiquetas por proyecto (NUEVO v3)
│   │   └── job.py
│   ├── schemas/
│   │   ├── annotation.py    # Incluye MaskProposal, SaveMaskRequest, BulkApproveRequest
│   │   ├── project_label.py # ProjectLabelCreate/Response, GCSExportRequest (NUEVO v3)
│   │   ├── video.py
│   │   └── job.py
│   ├── services/
│   │   ├── sam2_service.py      # segment_frame() + segment_frame_options() (multi-mask)
│   │   ├── export_service.py    # YOLO-Det, YOLO-Seg, COCO + GCS upload (ACTUALIZADO v3)
│   │   └── video_service.py     # Extracción de frames con OpenCV
│   ├── tasks/
│   │   ├── celery_app.py
│   │   └── propagation.py       # Propagación con source_annotation_id + skip source frame
│   ├── database.py
│   └── main.py
├── alembic/
│   └── versions/
│       ├── 001_initial_schema.py          # Tablas base
│       ├── 002_source_annotation_id.py    # FK self-referencial en annotations
│       └── 003_project_labels.py          # Tabla project_labels (NUEVO v3)
├── requirements.txt
└── Dockerfile
```

### 9.2 Endpoints Principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/annotations/segment` | Segmenta un objeto (SAM 2 one-click) |
| `POST` | `/annotations/segment-options` | 3 máscaras candidatas multi-mask, no se guardan |
| `POST` | `/annotations/save-mask` | Guarda la máscara elegida de las candidatas |
| `POST` | `/annotations/propagate` | Lanza propagación asíncrona (GPU) |
| `POST` | `/annotations/approve-bulk` | Aprueba anotaciones en lote + auto-registra labels |
| `GET` | `/annotations/frame/{id}` | Anotaciones de un frame |
| `PUT` | `/annotations/{id}` | Actualiza label, aprobación |
| `DELETE` | `/annotations/{id}` | Elimina anotación |
| `GET` | `/projects` | Lista proyectos |
| `POST` | `/projects` | Crea proyecto |
| `GET` | `/projects/{id}/labels` | Etiquetas confirmadas del proyecto |
| `POST` | `/projects/{id}/labels` | Añade etiqueta manualmente |
| `DELETE` | `/projects/{id}/labels/{name}` | Elimina etiqueta del registro |
| `GET` | `/projects/{pid}/videos/{vid}/stats` | Estadísticas de anotación del vídeo |
| `DELETE` | `/projects/{pid}/videos/{vid}/frames/{fid}` | Elimina frame + anotaciones + JPEG |
| `GET` | `/jobs/{id}` | Estado y progreso del job |
| `POST` | `/projects/{id}/export` | Exporta dataset como ZIP descargable |
| `POST` | `/projects/{id}/export/gcs` | Exporta dataset y sube directamente a GCS |

### 9.3 Auto-Registro de Etiquetas al Aprobar

El endpoint `POST /annotations/approve-bulk` realiza dos operaciones en secuencia:

```python
# 1. Marcar anotaciones como aprobadas (bulk UPDATE)
db.query(Annotation).filter(
    Annotation.id.in_(data.annotation_ids)
).update({"is_approved": True}, synchronize_session=False)

# 2. Extraer labels únicas y registrarlas en project_labels
for ann in approved_anns:
    frame → video → project_id
    INSERT INTO project_labels (project_id, label_name)
    ON CONFLICT (project_id, label_name) DO NOTHING
```

Esto garantiza que el registro de etiquetas crece orgánicamente conforme el operario valida anotaciones, sin trabajo adicional.

### 9.4 Patrón de Comunicación Asíncrona (Propagación)

```
Frontend          Backend API         Redis Broker        Celery Worker
   │                   │                   │                    │
   │── POST /propagate ▶│                   │                    │
   │                   │── Job(running) ───▶│                    │
   │                   │── task.delay() ────────────────────────▶│
   │◀── 202 + job_id ──│                   │                    │
   │                   │                   │       propagate_mask() (GPU)
   │── GET /jobs/{id} ─▶│ ◀── progress% ───────────────────────│
   │◀── {progress: 45%}│                   │                    │
   │── GET /jobs/{id} ─▶│ ◀── success ─────────────────────────│
   │◀── {status: success}                                        │
```

---

## 10. Arquitectura Frontend

### 10.1 Estructura de Directorios

```
frontend/src/
├── api/
│   └── client.js           # Todas las llamadas REST centralizadas (Axios)
│                           # Incluye: getProjectLabels, addProjectLabel,
│                           #          deleteProjectLabel, getVideoStats,
│                           #          exportToGCS, exportDataset
├── components/
│   ├── AnnotationCanvas.jsx        # Canvas interactivo Konva
│   └── AnnotationCanvas.module.css
├── pages/
│   ├── ProjectsPage.jsx            # Lista y creación de proyectos
│   ├── ProjectDetailPage.jsx       # Detalle de proyecto, upload de vídeo
│   ├── VideoPage.jsx               # Hub del vídeo (NUEVO v3)
│   ├── AnnotatePage.jsx            # Interfaz de anotación (multi-mask, zoom, filmstrip)
│   ├── PropagationPage.jsx         # Revisión y aprobación de propagaciones
│   └── *.module.css
├── store/
│   └── useStore.js                 # Estado global Zustand
│                                   # Incluye: projectLabels, setProjectLabels
└── utils/
    └── colors.js                   # Paleta de 12 colores sólidos por label (hash → índice)
```

### 10.2 Jerarquía de Navegación (v3)

```
/ → /projects
  └── /projects/:projectId
        └── /projects/:projectId/videos/:videoId          ← VideoPage (HUB)
              ├── /projects/:projectId/videos/:videoId/annotate/:frameId
              └── /projects/:projectId/videos/:videoId/propagation
```

La `VideoPage` actúa como punto central de control para cada vídeo, desde donde se accede a todas las acciones y se visualiza el estado del dataset.

### 10.3 VideoPage — Funcionalidades

La `VideoPage` es la página hub introducida en v3. Centraliza:

```
┌────────────────────────────────────────────────────────┐
│  📊 Progreso de anotación                              │
│  ████████████████████░░░░ 73% frames anotados          │
│  263 frames · 192 anotados · 384 total · 312 aprobadas │
├────────────────────────────────────────────────────────┤
│  ⚡ Acciones                                            │
│  [✏️ Anotar]  [🔍 Revisar propagación]  [☁️ Exportar]  │
│                                                        │
│  ┌── Panel de exportación (expandible) ─────────────┐  │
│  │  Formato: YOLO-Seg / YOLO-Det / COCO             │  │
│  │  Bucket GCS: ________________                    │  │
│  │  Prefijo GCS: ________________                   │  │
│  │  ☑ Solo anotaciones aprobadas                   │  │
│  │  [☁️ Subir a GCS]  [💾 Descargar ZIP]            │  │
│  └──────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────┤
│  🏷️ Etiquetas del proyecto                             │
│  [● pieza ✕]  [● operario ✕]  [● herramienta ✕]       │
│  [_____________] [+ Añadir]                            │
└────────────────────────────────────────────────────────┘
```

### 10.4 Estado Global Zustand

```javascript
{
  currentProject,       // Proyecto activo
  currentVideo,         // Vídeo activo
  currentFrame,         // Frame actual
  annotations,          // Anotaciones del frame activo
  activeLabel,          // Etiqueta para la próxima segmentación
  labelHistory,         // Labels usadas en sesión (chips de selección rápida)
  projectLabels,        // Etiquetas confirmadas del proyecto (desde BD) [NUEVO v3]
  selectedAnnotationId, // Sincroniza canvas ↔ panel de anotaciones
  activeJob,            // Job de propagación activo
}
```

### 10.5 AnnotationCanvas — Funcionamiento Interno

El canvas opera sobre **Konva.js** (modo *uncontrolled*) y gestiona:

**Sistema de coordenadas con zoom:**
```
absX = (pointerX - stage.x()) / stage.scaleX() / baseScale
absY = (pointerY - stage.y()) / stage.scaleY() / baseScale
```
El stage se manipula directamente (`stage.scale()`, `stage.x()`, `stage.batchDraw()`) sin pasar por estado React, para evitar re-renders innecesarios durante el zoom.

**Detección de máscara bajo el cursor (modo Seleccionar):**
Se itera sobre los canvases decodificados en orden inverso. Para cada uno: `ctx.getImageData(mx, my, 1, 1).data[3] > 0` → la máscara contiene el punto.

**Modos de interacción:**
| Modo | Acción | Resultado |
|------|--------|-----------|
| Anotar | Clic izquierdo | SAM 2 → máscara (punto positivo) |
| Anotar | Clic derecho | SAM 2 → máscara refinada (punto negativo) |
| 🎯 3 opciones | Clic izquierdo | SAM 2 multi-mask → 3 candidatos superpuestos |
| Seleccionar | Clic sobre máscara | Identifica y resalta en panel |
| Zoom | Rueda del ratón | Zoom centrado en cursor |
| Pan | Arrastrar con zoom > 1 | Desplaza el encuadre |

---

## 11. Integración con SAM 2

### 11.1 ¿Qué es SAM 2?

**SAM 2** (Segment Anything Model 2, Meta AI Research, 2024) es un modelo de visión artificial capaz de segmentar objetos arbitrarios en imágenes y vídeos a partir de indicaciones mínimas del usuario, sin necesidad de entrenamiento específico para cada tipo de objeto.

Características clave para MENTAT:
- **Zero-shot**: No requiere fine-tuning por categoría de objeto
- **Prompt-based**: Acepta puntos positivos/negativos
- **Video-aware**: Memory bank para rastrear objetos a lo largo de frames
- **Multi-mask**: Genera hasta 3 propuestas con scores de confianza

### 11.2 Configuración e Inicialización

SAM 2 se carga una única vez en GPU al arrancar (patrón Singleton):

```python
_predictor: SAM2ImagePredictor | None = None

def _get_predictor() -> SAM2ImagePredictor:
    global _predictor
    if _predictor is None:
        model = build_sam2(CONFIG_FILE, CHECKPOINT_PATH, device="cuda")
        _predictor = SAM2ImagePredictor(model)
    return _predictor
```

Checkpoint: `sam2_hiera_large.pt`. Carga inicial: ~10-15 segundos en T4. Inferencia: < 1 segundo por frame.

### 11.3 Modos de Inferencia

#### A) Segmentación Single-Click
```
Entrada:  frame_path, point_x, point_y, point_label (1/0)
Proceso:  predictor.set_image() → predictor.predict(multimask_output=False)
Salida:   mask_rle JSON + bbox normalizado [x, y, w, h]
Latencia: ~500ms en T4
```

#### B) Multi-Mask (3 candidatos)
```
Entrada:  Misma que A
Proceso:  predictor.predict(multimask_output=True) → 3 máscaras + scores
Salida:   [{mask_rle, bbox, score}] ordenado por score desc
Uso:      Objetos ambiguos, bordes complejos, fondos similares al objeto
```

#### C) Propagación en Vídeo
```
Entrada:  init_frame_index, init_mask_rle
Proceso:  SAM2VideoPredictor → propaga frame a frame
          Cada frame: genera máscara + bbox → guarda en BD
          Salta el frame fuente (no duplica la anotación manual)
Salida:   N anotaciones propagadas en BD con source_annotation_id
Latencia: 0.5-2s/frame en T4 (263 frames ≈ 4 minutos)
```

### 11.4 Representación de Máscaras: RLE

Las máscaras binarias se almacenan como RLE (Run-Length Encoding) serializado como JSON:

```json
{
  "rle":   [125, 430, 12, 890, ...],
  "start": 0,
  "shape": [720, 1280]
}
```

Ventajas: compresión típica de 200:1 vs imagen sin comprimir; transferencia por REST sin overhead; decodificación en cliente en < 5ms por máscara.

---

## 12. Modelo de Datos

### 12.1 Diagrama Entidad-Relación (v3)

```
┌─────────────┐         ┌───────────────┐
│   Project   │ 1 ─── n │  ProjectLabel │  (NUEVO v3)
│─────────────│         │───────────────│
│ id          │         │ id            │
│ name        │         │ project_id FK │
│ description │         │ label_name    │
│ created_at  │         │ created_at    │
└──────┬──────┘         │ UNIQUE(pid,   │
       │ 1              │  label_name)  │
       │                └───────────────┘
       │ n
┌──────┴──────┐
│    Video    │
│─────────────│
│ id          │
│ project_id  │
│ original_   │
│  name       │
│ fps         │
│ total_frames│
│ width/height│
│ status      │
└──────┬──────┘
       │ 1
       │ n
┌──────┴──────┐          ┌───────────────┐
│    Frame    │ 1 ─── n  │  Annotation   │
│─────────────│          │───────────────│
│ id          │          │ id            │
│ video_id    │          │ frame_id FK   │
│ frame_index │          │ label         │
│ file_path   │          │ mask_rle      │
└─────────────┘          │ bbox_x/y/w/h  │
                         │ is_propagated │
                         │ is_approved   │
                         │ source_ann_id ──┐ (self-ref FK)
                         └────────────────┘
                                ▲
                                └── source_annotation_id → id

┌───────────────┐
│      Job      │
│───────────────│
│ id            │
│ celery_task_id│
│ job_type      │
│ status        │
│ video_id FK   │
│ annotation_id │
│ progress      │
│ error_message │
└───────────────┘
```

### 12.2 Tabla `project_labels` (nueva en v3)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | integer PK | Identificador único |
| `project_id` | integer FK → projects.id | Proyecto al que pertenece |
| `label_name` | varchar(255) | Nombre de la etiqueta confirmada |
| `created_at` | datetime | Fecha de primera confirmación |
| `UNIQUE` | (project_id, label_name) | No-duplicidad garantizada a nivel BD |

### 12.3 Tabla `annotations` — Campos Clave

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | integer PK | Identificador único |
| `frame_id` | integer FK | Frame al que pertenece |
| `label` | varchar(255) | Categoría del objeto |
| `mask_rle` | text | Máscara RLE serializada como JSON |
| `bbox_x/y/w/h` | float | Bounding box normalizado [0-1] |
| `is_propagated` | boolean | `true` si fue generada por propagación |
| `is_approved` | boolean | `true` si fue revisada y aprobada |
| `source_annotation_id` | integer FK (self) | Anotación manual que originó esta propagada |

---

## 13. Flujos de Trabajo Principales

### 13.1 Flujo Completo v3 (con VideoPage)

```
OPERARIO                                SISTEMA
   │                                      │
   │─── Sube vídeo ───────────────────────▶│
   │                                      │── Extrae frames JPEG (OpenCV)
   │◀─── Vídeo READY ──────────────────────│
   │                                      │
   │─── Click "Ver →" en ProjectDetailPage ▶│
   │◀─── VideoPage con stats + labels ─────│
   │                                      │
   │─── Click "✏️ Anotar" ────────────────▶│
   │◀─── AnnotatePage (frame 0) ───────────│
   │                                      │
   │─── Escribe label "pieza" ────────────▶│ (chips de labels del proyecto)
   │─── Clic sobre objeto ────────────────▶│
   │                                      │── SAM 2 → máscara
   │◀─── Máscara visible en canvas ────────│
   │                                      │
   │─── [opcional] 🎯 3 opciones ─────────▶│
   │                                      │── SAM 2 multi-mask → 3 candidatos
   │◀─── 3 máscaras superpuestas ──────────│
   │─── Elige la mejor ───────────────────▶│
   │                                      │── Guarda máscara elegida en BD
   │                                      │
   │─── Clic "Propagar" ──────────────────▶│
   │                                      │── Celery: propagación GPU
   │◀─── Progreso en tiempo real ──────────│ (polling 2s)
   │◀─── Redirige a PropagationPage ───────│
   │                                      │
   │─── Revisa frame a frame ─────────────▶│
   │─── "✓ Aprobar todo el vídeo" ────────▶│
   │                                      │── approve-bulk → aprueba N anotaciones
   │                                      │── Auto-registra "pieza" en project_labels
   │◀─── VideoPage actualizada ────────────│
   │                                      │
   │─── ☁️ Exportar → Subir a GCS ────────▶│
   │                                      │── rle_to_polygon() → YOLO-Seg
   │                                      │── upload_to_gcs() (ADC)
   │◀─── {files_uploaded: 528, bucket: "mi-bucket"} │
```

### 13.2 Flujo Multi-Instancia (mismo label)

1. **Frame 10 — Pieza A**: clic → propaga desde frame 10. `source_annotation_id = ann_A.id`
2. **Frame 50 — Pieza B**: clic → propaga desde frame 50. `source_annotation_id = ann_B.id`
3. En PropagationPage, ambas instancias coexisten por frame sin interferencia

### 13.3 Flujo de Revisión Multi-Mask

1. Activa modo **🎯 3 opciones**
2. Clic sobre el objeto → `POST /segment-options` → 3 propuestas sin guardar
3. Canvas muestra 3 máscaras en teal, naranja, rosa con su score
4. Operario elige → `POST /save-mask` → guarda la elegida

---

## 14. Exportación de Datasets

### 14.1 Formatos Soportados

| Formato | Descripción | Caso de uso |
|---------|-------------|-------------|
| **YOLO Segmentation** | Polígonos de contorno normalizados [0-1] | Training de modelos de segmentación de instancia (YOLOv8-seg, YOLOv11) |
| **YOLO Detection** | Bounding boxes normalizadas `cx cy w h` | Training de modelos de detección rápida |
| **COCO JSON** | Estándar abierto con segmentación y bbox | Compatibilidad con frameworks como Detectron2, MMDetection |

### 14.2 Exportación YOLO Segmentation — Pipeline Técnico

La conversión de máscara RLE → polígono YOLO-Seg es el paso técnico más crítico del pipeline de exportación:

```python
# 1. Decodificar RLE → numpy mask binaria
mask = np.zeros(width * height, dtype=np.uint8)
for count in rle["rle"]:
    if val == 1: mask[idx:idx+count] = 1
    idx += count; val = 1 - val
mask = mask.reshape(height, width)

# 2. Encontrar contornos (OpenCV)
contours, _ = cv2.findContours(
    mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
)
largest = max(contours, key=cv2.contourArea)

# 3. Simplificar polígono (Ramer-Douglas-Peucker)
epsilon = 0.002 * cv2.arcLength(largest, True)
approx = cv2.approxPolyDP(largest, epsilon, True)

# 4. Normalizar coordenadas [0-1]
flat = [x/width, y/height for x, y in approx.reshape(-1, 2)]
```

Formato de salida (`.txt` por frame):
```
# <class_id> <x1> <y1> <x2> <y2> ... (puntos normalizados)
0 0.234 0.145 0.289 0.134 0.312 0.156 ...
1 0.512 0.334 0.578 0.298 0.601 0.345 ...
```

Múltiples objetos en el mismo frame → múltiples líneas en el mismo `.txt`.

### 14.3 Estructura del Dataset Exportado

```
dataset_seg/
├── data.yaml               # Configuración YOLO (nc, names, train/val paths)
├── images/
│   ├── train/
│   │   ├── frame_42_000000.jpg
│   │   └── frame_42_000002.jpg
│   └── val/
│       └── frame_42_000001.jpg
└── labels/
    ├── train/
    │   ├── frame_42_000000.txt
    │   └── frame_42_000002.txt
    └── val/
        └── frame_42_000001.txt
```

División train/val: aleatoria, configurable (por defecto 80/20).

### 14.4 Exportación a Google Cloud Storage

**Autenticación:** Application Default Credentials (ADC). La VM de GCP tiene una cuenta de servicio con rol `Storage Object Admin` sobre el bucket destino. No se requieren claves adicionales ni configuración manual.

```python
from google.cloud import storage

client = storage.Client()   # ADC automático en GCP VM
bucket = client.bucket(bucket_name)

for local_path in files:
    blob = bucket.blob(f"{gcs_prefix}/{relative_path}")
    blob.upload_from_filename(local_path)
```

**Endpoint:**
```
POST /projects/{project_id}/export/gcs
Body: {
  "bucket_name": "mi-bucket-expai",
  "gcs_prefix":  "datasets/v1/video-42",
  "format":       "yolo_seg",
  "train_split":  0.8,
  "approved_only": true,
  "video_id":     42        // null = todo el proyecto
}
Response: {
  "format": "yolo_seg",
  "bucket": "mi-bucket-expai",
  "gcs_prefix": "datasets/v1/video-42",
  "files_uploaded": 528,
  "uris_sample": ["gs://mi-bucket-expai/datasets/v1/video-42/images/train/..."]
}
```

---

## 15. Infraestructura y Despliegue

### 15.1 Configuración de la VM

| Parámetro | Valor |
|-----------|-------|
| Proveedor | Google Cloud Platform |
| Región | asia-east1-c |
| Nombre instancia | mentat-489120 |
| IP externa | 104.155.234.0 |
| vCPUs | 4 |
| RAM | 15 GB |
| GPU | NVIDIA Tesla T4 (16 GB VRAM) |
| SO | Ubuntu 20.04 LTS |

### 15.2 Docker Compose — Servicios

```yaml
services:
  db:        PostgreSQL 15-alpine    # Metadatos, anotaciones, etiquetas
  redis:     Redis 7-alpine          # Broker Celery
  backend:   mentat-backend          # FastAPI + SAM 2 (GPU)
  worker:    mentat-worker           # Celery worker (GPU) — misma imagen
  frontend:  mentat-frontend         # Vite dev server
  nginx:     nginx-alpine            # Reverse proxy :80
```

El backend ejecuta `alembic upgrade head` en cada arranque, aplicando automáticamente las migraciones pendientes.

### 15.3 Ciclo de Despliegue

```bash
# Encender VM
gcloud compute instances start mentat-489120 --zone=asia-east1-c

# SSH
ssh -i ~/.ssh/google_compute_engine Alexis@104.155.234.0

# Levantar servicios
cd /home/Alexis/mentat/MENTAT && docker compose up -d

# Verificar estado
docker compose ps

# Copiar fichero modificado (desde Windows local)
scp -i ~/.ssh/google_compute_engine archivo.py Alexis@104.155.234.0:/ruta/destino/

# Apagar VM al terminar
gcloud compute instances stop mentat-489120 --zone=asia-east1-c
```

### 15.4 Gestión de Costes

| Modo | Coste estimado |
|------|---------------|
| VM activa con T4 | ~$0.35–0.45 USD/hora |
| VM detenida | ~$0.04 USD/GB/mes (solo disco) |
| GCS almacenamiento | ~$0.02 USD/GB/mes |

---

## 16. Seguridad y Privacidad

### 16.1 Estado Actual

| Área | Estado | Nota |
|------|--------|------|
| Autenticación | ⚠️ No implementada | Acceso controlado por red/IP |
| Autorización | ⚠️ No implementada | Todos los usuarios ven todos los proyectos |
| HTTPS | ⚠️ HTTP | Requiere TLS para exposición pública |
| Inyección SQL | ✅ Protegido | SQLAlchemy con queries parametrizadas |
| Validación de entrada | ✅ Implementada | Pydantic en todos los endpoints |
| Inferencia ML | ✅ On-premise | SAM 2 corre localmente, sin APIs externas |
| Datos en GCS | ✅ IAM GCP | Acceso controlado por cuenta de servicio |

### 16.2 Datos Procesados

- **Vídeos industriales**: Propiedad del cliente. No salen de la VM excepto cuando se exportan explícitamente a un bucket GCS controlado por la organización.
- **Inferencia SAM 2**: Completamente local. Cero llamadas a APIs de ML externas.
- **Datasets exportados a GCS**: En un bucket propiedad de la organización, acceso por IAM.

---

## 17. Capacidades Actuales

### 17.1 Funcionalidades Implementadas (v3 — Marzo 2026)

**Gestión:**
- [x] Proyectos con nombre y descripción
- [x] Upload de vídeos (.mp4, .avi, .mov, .mkv)
- [x] Extracción automática de frames JPEG
- [x] Registro de etiquetas por proyecto (auto-poblado + manual) *(v3)*
- [x] Estadísticas de progreso por vídeo (coverage, aprobadas, propagadas) *(v3)*
- [x] VideoPage hub centralizado *(v3)*

**Anotación:**
- [x] Segmentación con un clic (SAM 2)
- [x] Punto negativo con clic derecho
- [x] Multi-mask output (3 candidatos con scores)
- [x] Zoom y pan en el canvas
- [x] Filmstrip horizontal de navegación
- [x] Historial de labels + chips del proyecto como atajos *(v3)*
- [x] Modo seleccionar: clic en máscara → resalta en panel
- [x] Multi-instancia: mismo label, propagaciones independientes

**Propagación:**
- [x] Propagación automática a todos los frames del vídeo
- [x] Propagación desde frame arbitrario
- [x] Propagación de múltiples anotaciones (secuencial)
- [x] Progreso en tiempo real (polling Celery)
- [x] Evita duplicados en el frame fuente

**Revisión y aprobación:**
- [x] Aprobación individual y por frame
- [x] Aprobación masiva de todo el vídeo en 1 llamada *(v2)*
- [x] Auto-registro de labels al aprobar *(v3)*
- [x] Eliminación de anotaciones y frames completos

**Exportación:**
- [x] YOLO Detection (ZIP descargable)
- [x] YOLO Segmentation — polígonos desde RLE vía OpenCV *(v3)*
- [x] COCO JSON con segmentación *(v3)*
- [x] Exportación directa a Google Cloud Storage *(v3)*
- [x] Filtro por vídeo individual o proyecto completo *(v3)*
- [x] Filtro solo anotaciones aprobadas *(v3)*
- [x] División train/val configurable

---

## 18. Limitaciones Conocidas

| Limitación | Descripción | Prioridad |
|-----------|-------------|-----------|
| Sin autenticación | Sistema abierto en red | Alta (antes de producción) |
| GPU exclusiva | SAM 2 no escala horizontalmente; un job bloquea el siguiente | Media |
| Propagación solo hacia adelante | Del frame inicial al último, no hacia frames anteriores | Media |
| Sin versionado de anotaciones | No hay historial de cambios ni rollback | Media |
| Máscara no editable | No se puede dibujar correcciones sobre la máscara | Media |
| Sin colaboración multi-usuario | Diseño mono-usuario actual | Baja (roadmap) |

---

## 19. Hoja de Ruta

### Fase 3 — Corto Plazo (próximos sprints)

| Funcionalidad | Descripción |
|--------------|-------------|
| **Autenticación básica** | Login usuario/contraseña, roles admin/anotador/revisor |
| **Propagación hacia atrás** | Propagar también a frames anteriores al frame inicial |
| **Box prompt** | Dibujar rectángulo como prompt en lugar de punto |
| **Corrección de máscara** | Herramienta de pincel para añadir/quitar píxeles a la máscara |
| **Dashboard de proyecto** | % completado global, distribución de labels, tiempo por vídeo |

### Fase 4 — Medio Plazo

| Funcionalidad | Descripción |
|--------------|-------------|
| **HTTPS + dominio** | TLS y despliegue accesible desde internet (con auth) |
| **API pública documentada** | Integración MENTAT como servicio en pipelines MLOps |
| **Multi-usuario y asignación** | Equipos, tareas asignadas, revisión cruzada |
| **Historial de anotaciones** | Registro de modificaciones y autoría |
| **Notificaciones** | Alertas cuando una propagación termina (email / webhook) |

### Fase 5 — Largo Plazo

| Funcionalidad | Descripción |
|--------------|-------------|
| **Active Learning** | El sistema identifica qué frames necesitan revisión prioritaria |
| **Fine-tune asistido** | Usar anotaciones aprobadas para fine-tune de modelo propio |
| **Integración MLflow/DVC** | Trazabilidad completa dataset → experimento → modelo |
| **Modelo propio ligero** | SAM 2 fine-tuneado para objetos industriales específicos del dominio |

---

## 20. Glosario

| Término | Definición |
|---------|-----------|
| **ADC** | Application Default Credentials: mecanismo de Google Cloud para autenticación automática usando la cuenta de servicio de la VM |
| **Anotación** | Registro que asocia máscara + label + bbox a un frame concreto |
| **Bounding Box** | Rectángulo mínimo contenedor del objeto segmentado, normalizado [0-1] |
| **Celery** | Framework Python para ejecución de tareas asíncronas en workers independientes |
| **COCO** | Common Objects in Context: estándar de dataset para visión artificial con soporte de segmentación |
| **Frame** | Imagen estática extraída de un vídeo en un instante temporal |
| **GCS** | Google Cloud Storage: almacenamiento de objetos de Google Cloud, destino de los datasets exportados |
| **GPU** | Unidad de procesamiento gráfico; necesaria para inferencia de SAM 2 a velocidad práctica |
| **Job** | Tarea asíncrona de larga duración (propagación) con seguimiento de estado y progreso |
| **Label** | Categoría semántica del objeto (ej: "pieza", "operario") |
| **Máscara** | Imagen binaria donde los píxeles a 1 indican la región del objeto segmentado |
| **Multi-mask** | Capacidad de SAM 2 de generar 3 propuestas de máscara con distintos niveles de detalle y confianza |
| **Pre-labeling** | Generación automática de etiquetas preliminares para revisión humana posterior |
| **ProjectLabel** | Tabla BD que registra el vocabulario de etiquetas confirmadas de un proyecto |
| **Propagación** | Extensión automática de una máscara desde un frame inicial a todos los frames del vídeo |
| **RLE** | Run-Length Encoding: compresión de máscaras binarias por secuencias de conteos alternos 0/1 |
| **SAM 2** | Segment Anything Model 2 (Meta AI, 2024): modelo de segmentación zero-shot para imágenes y vídeo |
| **source_annotation_id** | FK self-referencial que vincula cada anotación propagada con su anotación manual de origen |
| **VideoPage** | Página hub de MENTAT (v3) que centraliza estadísticas, etiquetas y acciones de un vídeo |
| **YOLO-Det** | Formato YOLO Detection: `<class> cx cy w h` normalizados para entrenamiento de detectores |
| **YOLO-Seg** | Formato YOLO Segmentation: `<class> x1 y1 x2 y2 ...` (polígono) para entrenamiento de segmentadores de instancia |
| **Zero-shot** | Capacidad de un modelo de operar sobre clases no vistas durante su entrenamiento |
| **Zustand** | Librería de estado global para React, alternativa ligera a Redux |

---

*Fin del documento.*

---

> **CLASIFICACIÓN: PRIVADO Y CONFIDENCIAL**
> Versión 2.0 — Marzo 2026
> Elaborado por el equipo de desarrollo de MENTAT
