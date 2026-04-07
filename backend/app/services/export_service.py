"""
Servicio de exportacion de datasets.
Soporta:
  - YOLO Detection  (bboxes normalizadas)
  - YOLO Segmentation (poligonos de contorno desde mascaras RLE)
  - COCO JSON
  - Subida directa a Google Cloud Storage
"""

import os
import json
import shutil
import zipfile
import random
import numpy as np
from sqlalchemy.orm import Session

from app.models import Video, Frame, Annotation


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

def _get_all_annotations(
    project_id: int,
    db: Session,
    approved_only: bool,
    video_id: int | None = None,
) -> list[tuple[Frame, Annotation]]:
    """Devuelve todos los pares (frame, annotation) del proyecto (o video)."""
    query = db.query(Video).filter(Video.project_id == project_id)
    if video_id is not None:
        query = query.filter(Video.id == video_id)
    videos = query.all()
    video_ids = [v.id for v in videos]

    frames = db.query(Frame).filter(Frame.video_id.in_(video_ids)).all()
    frame_ids = [f.id for f in frames]
    frame_map = {f.id: f for f in frames}

    q = db.query(Annotation).filter(Annotation.frame_id.in_(frame_ids))
    if approved_only:
        q = q.filter(Annotation.is_approved.is_(True))

    annotations = q.all()
    return [(frame_map[a.frame_id], a) for a in annotations]


def _rle_to_polygon(rle_json: str, width: int, height: int) -> list[list[float]]:
    """
    Convierte una mascara RLE al mayor contorno poligonal normalizado [0,1].
    Devuelve lista de [x1, y1, x2, y2, ...] o [] si falla.
    """
    try:
        import cv2
        rle = json.loads(rle_json)
        total = width * height
        mask = np.zeros(total, dtype=np.uint8)
        val = rle["start"]
        idx = 0
        for count in rle["rle"]:
            if val == 1:
                end = min(idx + count, total)
                mask[idx:end] = 1
            idx += count
            val = 1 - val
        mask = mask.reshape(height, width)

        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not contours:
            return []

        # Elegir el contorno mas grande
        largest = max(contours, key=cv2.contourArea)
        # Simplificar poligono para reducir puntos
        epsilon = 0.002 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)

        points = approx.reshape(-1, 2)
        # Normalizar
        flat = []
        for x, y in points:
            flat.append(round(x / width, 6))
            flat.append(round(y / height, 6))
        return flat
    except Exception:
        return []


# ──────────────────────────────────────────────────────────────────────────────
# Exportadores locales
# ──────────────────────────────────────────────────────────────────────────────

def export_yolo(
    project_id: int,
    db: Session,
    export_dir: str,
    train_split: float = 0.8,
    approved_only: bool = False,
    video_id: int | None = None,
) -> str:
    """
    Genera un dataset en formato YOLO Detection (bboxes).

    Estructura de salida:
        dataset/
        ├── data.yaml
        ├── images/train/ y images/val/
        └── labels/train/ y labels/val/
    """
    pairs = _get_all_annotations(project_id, db, approved_only, video_id)
    if not pairs:
        raise ValueError("No hay anotaciones para exportar")

    labels = sorted(set(a.label for _, a in pairs))
    label_to_idx = {label: idx for idx, label in enumerate(labels)}

    random.shuffle(pairs)
    split_idx = int(len(pairs) * train_split)
    train_pairs = pairs[:split_idx]
    val_pairs = pairs[split_idx:]

    dataset_dir = os.path.join(export_dir, "dataset")
    for split, split_pairs in [("train", train_pairs), ("val", val_pairs)]:
        img_dir = os.path.join(dataset_dir, "images", split)
        lbl_dir = os.path.join(dataset_dir, "labels", split)
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(lbl_dir, exist_ok=True)

        for frame, annotation in split_pairs:
            img_name = f"frame_{frame.video_id}_{frame.frame_index:06d}.jpg"
            shutil.copy2(frame.file_path, os.path.join(img_dir, img_name))

            if annotation.bbox_x is not None:
                class_id = label_to_idx[annotation.label]
                x_center = annotation.bbox_x + annotation.bbox_w / 2
                y_center = annotation.bbox_y + annotation.bbox_h / 2
                lbl_name = img_name.replace(".jpg", ".txt")
                with open(os.path.join(lbl_dir, lbl_name), "a") as f:
                    f.write(
                        f"{class_id} {x_center:.6f} {y_center:.6f} "
                        f"{annotation.bbox_w:.6f} {annotation.bbox_h:.6f}\n"
                    )

    import yaml
    data_yaml = {
        "path": dataset_dir,
        "train": "images/train",
        "val": "images/val",
        "nc": len(labels),
        "names": labels,
    }
    with open(os.path.join(dataset_dir, "data.yaml"), "w") as f:
        yaml.dump(data_yaml, f, default_flow_style=False, allow_unicode=True)

    zip_path = os.path.join(export_dir, f"dataset_yolo_det_{project_id}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(dataset_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                arcname = os.path.relpath(abs_path, export_dir)
                zf.write(abs_path, arcname)

    shutil.rmtree(dataset_dir)
    return zip_path


def export_yolo_seg(
    project_id: int,
    db: Session,
    export_dir: str,
    train_split: float = 0.8,
    approved_only: bool = True,
    video_id: int | None = None,
) -> str:
    """
    Genera un dataset en formato YOLO Segmentation (poligonos de contorno).

    Formato de cada linea en .txt:
        <class_id> <x1> <y1> <x2> <y2> ... (puntos normalizados 0-1)

    Estructura de salida:
        dataset_seg/
        ├── data.yaml
        ├── images/train/ y images/val/
        └── labels/train/ y labels/val/
    """
    pairs = _get_all_annotations(project_id, db, approved_only, video_id)
    if not pairs:
        raise ValueError("No hay anotaciones para exportar")

    # Filtrar solo las que tienen mascara RLE
    pairs = [(f, a) for f, a in pairs if a.mask_rle]
    if not pairs:
        raise ValueError("No hay anotaciones con mascara RLE para exportar")

    labels = sorted(set(a.label for _, a in pairs))
    label_to_idx = {label: idx for idx, label in enumerate(labels)}

    random.shuffle(pairs)
    split_idx = int(len(pairs) * train_split)
    train_pairs = pairs[:split_idx]
    val_pairs = pairs[split_idx:]

    dataset_dir = os.path.join(export_dir, "dataset_seg")

    # Para obtener dimensiones de frame usamos Pillow
    from PIL import Image as PILImage

    for split, split_pairs in [("train", train_pairs), ("val", val_pairs)]:
        img_dir = os.path.join(dataset_dir, "images", split)
        lbl_dir = os.path.join(dataset_dir, "labels", split)
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(lbl_dir, exist_ok=True)

        # Agrupar por frame para acumular varias anotaciones en un mismo .txt
        from collections import defaultdict
        frame_annotations: dict[int, list] = defaultdict(list)
        frame_objects: dict[int, Frame] = {}
        for frame, annotation in split_pairs:
            frame_annotations[frame.id].append(annotation)
            frame_objects[frame.id] = frame

        for frame_id, anns in frame_annotations.items():
            frame = frame_objects[frame_id]
            img_name = f"frame_{frame.video_id}_{frame.frame_index:06d}.jpg"
            img_dst = os.path.join(img_dir, img_name)
            shutil.copy2(frame.file_path, img_dst)

            # Obtener dimensiones reales de la imagen
            with PILImage.open(frame.file_path) as img:
                fw, fh = img.size

            lbl_name = img_name.replace(".jpg", ".txt")
            with open(os.path.join(lbl_dir, lbl_name), "w") as f:
                for ann in anns:
                    poly = _rle_to_polygon(ann.mask_rle, fw, fh)
                    if len(poly) < 6:  # necesitamos al menos 3 puntos
                        continue
                    class_id = label_to_idx[ann.label]
                    pts_str = " ".join(str(v) for v in poly)
                    f.write(f"{class_id} {pts_str}\n")

    import yaml
    data_yaml = {
        "path": dataset_dir,
        "train": "images/train",
        "val": "images/val",
        "nc": len(labels),
        "names": labels,
    }
    with open(os.path.join(dataset_dir, "data.yaml"), "w") as f:
        yaml.dump(data_yaml, f, default_flow_style=False, allow_unicode=True)

    zip_path = os.path.join(export_dir, f"dataset_yolo_seg_{project_id}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(dataset_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                arcname = os.path.relpath(abs_path, export_dir)
                zf.write(abs_path, arcname)

    shutil.rmtree(dataset_dir)
    return zip_path


def export_coco(
    project_id: int,
    db: Session,
    export_dir: str,
    train_split: float = 0.8,
    approved_only: bool = False,
    video_id: int | None = None,
) -> str:
    """
    Genera un dataset en formato COCO JSON.
    """
    pairs = _get_all_annotations(project_id, db, approved_only, video_id)
    if not pairs:
        raise ValueError("No hay anotaciones para exportar")

    labels = sorted(set(a.label for _, a in pairs))
    label_to_idx = {label: idx + 1 for idx, label in enumerate(labels)}

    categories = [
        {"id": label_to_idx[label], "name": label, "supercategory": "object"}
        for label in labels
    ]

    images_list = []
    annotations_list = []
    ann_id = 1

    dataset_dir = os.path.join(export_dir, "coco_dataset")
    img_dir = os.path.join(dataset_dir, "images")
    os.makedirs(img_dir, exist_ok=True)

    seen_frames: dict[int, int] = {}

    for frame, annotation in pairs:
        if frame.id not in seen_frames:
            img_coco_id = len(seen_frames) + 1
            seen_frames[frame.id] = img_coco_id
            img_name = f"frame_{frame.video_id}_{frame.frame_index:06d}.jpg"
            shutil.copy2(frame.file_path, os.path.join(img_dir, img_name))
            images_list.append({
                "id": img_coco_id,
                "file_name": img_name,
                "frame_index": frame.frame_index,
                "video_id": frame.video_id,
            })

        img_id = seen_frames[frame.id]

        if annotation.bbox_x is not None:
            coco_ann = {
                "id": ann_id,
                "image_id": img_id,
                "category_id": label_to_idx[annotation.label],
                "bbox": [
                    annotation.bbox_x,
                    annotation.bbox_y,
                    annotation.bbox_w,
                    annotation.bbox_h,
                ],
                "area": annotation.bbox_w * annotation.bbox_h,
                "iscrowd": 0,
                "segmentation": [],
            }
            # Incluir segmentacion poligonal si hay mascara
            if annotation.mask_rle:
                from PIL import Image as PILImage
                with PILImage.open(frame.file_path) as img:
                    fw, fh = img.size
                poly = _rle_to_polygon(annotation.mask_rle, fw, fh)
                if len(poly) >= 6:
                    # COCO espera coordenadas absolutas en pixels
                    abs_poly = []
                    for i, v in enumerate(poly):
                        abs_poly.append(round(v * (fw if i % 2 == 0 else fh), 2))
                    coco_ann["segmentation"] = [abs_poly]
            annotations_list.append(coco_ann)
            ann_id += 1

    coco_json = {
        "info": {"description": f"MENTAT Export - Project {project_id}"},
        "categories": categories,
        "images": images_list,
        "annotations": annotations_list,
    }

    with open(os.path.join(dataset_dir, "annotations.json"), "w") as f:
        json.dump(coco_json, f, indent=2)

    zip_path = os.path.join(export_dir, f"dataset_coco_{project_id}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(dataset_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                arcname = os.path.relpath(abs_path, export_dir)
                zf.write(abs_path, arcname)

    shutil.rmtree(dataset_dir)
    return zip_path


# ──────────────────────────────────────────────────────────────────────────────
# GCS Upload
# ──────────────────────────────────────────────────────────────────────────────

def upload_to_gcs(
    local_dir: str,
    bucket_name: str,
    gcs_prefix: str,
    progress_callback=None,
    progress_start: int = 50,
    progress_end: int = 100,
) -> list[str]:
    """
    Sube todos los ficheros de local_dir a GCS bajo gcs_prefix/.
    Usa Application Default Credentials (ADC) — funciona automaticamente
    en VMs de GCP con cuenta de servicio con rol Storage Object Admin.

    Devuelve lista de gs:// URIs subidas.
    """
    from google.cloud import storage

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    uploaded = []

    # Recopilar lista de ficheros primero para calcular progreso
    all_files = []
    for root, _, files in os.walk(local_dir):
        for file in files:
            all_files.append(os.path.join(root, file))

    total = len(all_files)
    for i, local_path in enumerate(all_files):
        relative = os.path.relpath(local_path, local_dir)
        blob_name = f"{gcs_prefix}/{relative}".replace("\\", "/")
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(local_path)
        uploaded.append(f"gs://{bucket_name}/{blob_name}")

        if progress_callback and total > 0:
            pct = progress_start + int((i + 1) / total * (progress_end - progress_start))
            progress_callback(pct)

    return uploaded


def export_and_upload_gcs(
    project_id: int,
    db: Session,
    export_dir: str,
    bucket_name: str,
    gcs_prefix: str,
    fmt: str = "yolo_seg",
    train_split: float = 0.8,
    approved_only: bool = True,
    video_id: int | None = None,
    progress_callback=None,
) -> dict:
    """
    Genera el dataset en formato fmt y lo sube directamente a GCS.
    Devuelve { format, gcs_prefix, files_uploaded, bucket }.
    progress_callback(pct: int) se llama con 0-100 durante el proceso.
    """
    dataset_dir = os.path.join(export_dir, f"gcs_export_{project_id}")
    os.makedirs(dataset_dir, exist_ok=True)

    try:
        if progress_callback:
            progress_callback(5)

        if fmt == "yolo_seg":
            _build_yolo_seg_dir(project_id, db, dataset_dir, train_split, approved_only, video_id)
        elif fmt == "yolo_det":
            _build_yolo_det_dir(project_id, db, dataset_dir, train_split, approved_only, video_id)
        elif fmt == "coco":
            _build_coco_dir(project_id, db, dataset_dir, train_split, approved_only, video_id)
        else:
            raise ValueError(f"Formato desconocido: {fmt}")

        if progress_callback:
            progress_callback(40)

        uris = upload_to_gcs(
            dataset_dir,
            bucket_name,
            gcs_prefix,
            progress_callback=progress_callback,
            progress_start=40,
            progress_end=99,
        )

        if progress_callback:
            progress_callback(100)

        return {
            "format": fmt,
            "bucket": bucket_name,
            "gcs_prefix": gcs_prefix,
            "files_uploaded": len(uris),
            "uris_sample": uris[:5],
        }
    finally:
        shutil.rmtree(dataset_dir, ignore_errors=True)


def _build_yolo_seg_dir(project_id, db, out_dir, train_split, approved_only, video_id):
    """Construye estructura YOLO-Seg sin comprimir (para subir a GCS)."""
    pairs = _get_all_annotations(project_id, db, approved_only, video_id)
    pairs = [(f, a) for f, a in pairs if a.mask_rle]
    if not pairs:
        raise ValueError("No hay anotaciones con mascara RLE")

    labels = sorted(set(a.label for _, a in pairs))
    label_to_idx = {label: idx for idx, label in enumerate(labels)}

    random.shuffle(pairs)
    split_idx = int(len(pairs) * train_split)

    from collections import defaultdict
    from PIL import Image as PILImage
    import yaml

    for split, split_pairs in [("train", pairs[:split_idx]), ("val", pairs[split_idx:])]:
        img_dir = os.path.join(out_dir, "images", split)
        lbl_dir = os.path.join(out_dir, "labels", split)
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(lbl_dir, exist_ok=True)

        frame_anns: dict[int, list] = defaultdict(list)
        frame_objs: dict[int, Frame] = {}
        for frame, ann in split_pairs:
            frame_anns[frame.id].append(ann)
            frame_objs[frame.id] = frame

        for fid, anns in frame_anns.items():
            frame = frame_objs[fid]
            img_name = f"frame_{frame.video_id}_{frame.frame_index:06d}.jpg"
            shutil.copy2(frame.file_path, os.path.join(img_dir, img_name))
            with PILImage.open(frame.file_path) as img:
                fw, fh = img.size
            lbl_name = img_name.replace(".jpg", ".txt")
            with open(os.path.join(lbl_dir, lbl_name), "w") as f:
                for ann in anns:
                    poly = _rle_to_polygon(ann.mask_rle, fw, fh)
                    if len(poly) < 6:
                        continue
                    pts_str = " ".join(str(v) for v in poly)
                    f.write(f"{label_to_idx[ann.label]} {pts_str}\n")

    data_yaml = {"path": ".", "train": "images/train", "val": "images/val",
                 "nc": len(labels), "names": labels}
    with open(os.path.join(out_dir, "data.yaml"), "w") as f:
        yaml.dump(data_yaml, f, default_flow_style=False, allow_unicode=True)


def _build_yolo_det_dir(project_id, db, out_dir, train_split, approved_only, video_id):
    """Construye estructura YOLO-Det sin comprimir (para subir a GCS)."""
    pairs = _get_all_annotations(project_id, db, approved_only, video_id)
    if not pairs:
        raise ValueError("No hay anotaciones para exportar")

    labels = sorted(set(a.label for _, a in pairs))
    label_to_idx = {label: idx for idx, label in enumerate(labels)}

    random.shuffle(pairs)
    split_idx = int(len(pairs) * train_split)
    import yaml

    for split, split_pairs in [("train", pairs[:split_idx]), ("val", pairs[split_idx:])]:
        img_dir = os.path.join(out_dir, "images", split)
        lbl_dir = os.path.join(out_dir, "labels", split)
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(lbl_dir, exist_ok=True)

        for frame, ann in split_pairs:
            img_name = f"frame_{frame.video_id}_{frame.frame_index:06d}.jpg"
            shutil.copy2(frame.file_path, os.path.join(img_dir, img_name))
            if ann.bbox_x is not None:
                class_id = label_to_idx[ann.label]
                x_c = ann.bbox_x + ann.bbox_w / 2
                y_c = ann.bbox_y + ann.bbox_h / 2
                lbl_name = img_name.replace(".jpg", ".txt")
                with open(os.path.join(lbl_dir, lbl_name), "a") as f:
                    f.write(f"{class_id} {x_c:.6f} {y_c:.6f} {ann.bbox_w:.6f} {ann.bbox_h:.6f}\n")

    data_yaml = {"path": ".", "train": "images/train", "val": "images/val",
                 "nc": len(labels), "names": labels}
    with open(os.path.join(out_dir, "data.yaml"), "w") as f:
        yaml.dump(data_yaml, f, default_flow_style=False, allow_unicode=True)


def _build_coco_dir(project_id, db, out_dir, train_split, approved_only, video_id):
    """Construye estructura COCO sin comprimir (para subir a GCS)."""
    pairs = _get_all_annotations(project_id, db, approved_only, video_id)
    if not pairs:
        raise ValueError("No hay anotaciones para exportar")

    labels = sorted(set(a.label for _, a in pairs))
    label_to_idx = {label: idx + 1 for idx, label in enumerate(labels)}
    categories = [{"id": label_to_idx[l], "name": l, "supercategory": "object"} for l in labels]

    img_dir = os.path.join(out_dir, "images")
    os.makedirs(img_dir, exist_ok=True)
    images_list, anns_list, ann_id, seen = [], [], 1, {}

    from PIL import Image as PILImage

    for frame, ann in pairs:
        if frame.id not in seen:
            img_id = len(seen) + 1
            seen[frame.id] = img_id
            img_name = f"frame_{frame.video_id}_{frame.frame_index:06d}.jpg"
            shutil.copy2(frame.file_path, os.path.join(img_dir, img_name))
            images_list.append({"id": img_id, "file_name": img_name,
                                 "frame_index": frame.frame_index, "video_id": frame.video_id})

        img_id = seen[frame.id]
        if ann.bbox_x is None:
            continue

        coco_ann = {
            "id": ann_id, "image_id": img_id,
            "category_id": label_to_idx[ann.label],
            "bbox": [ann.bbox_x, ann.bbox_y, ann.bbox_w, ann.bbox_h],
            "area": ann.bbox_w * ann.bbox_h, "iscrowd": 0, "segmentation": [],
        }
        if ann.mask_rle:
            with PILImage.open(frame.file_path) as img:
                fw, fh = img.size
            poly = _rle_to_polygon(ann.mask_rle, fw, fh)
            if len(poly) >= 6:
                abs_poly = [round(v * (fw if i % 2 == 0 else fh), 2) for i, v in enumerate(poly)]
                coco_ann["segmentation"] = [abs_poly]
        anns_list.append(coco_ann)
        ann_id += 1

    with open(os.path.join(out_dir, "annotations.json"), "w") as f:
        json.dump({"info": {"description": f"MENTAT Export - Project {project_id}"},
                   "categories": categories, "images": images_list, "annotations": anns_list},
                  f, indent=2)
