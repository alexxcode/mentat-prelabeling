"""
Servicio de integracion con SAM 2 (Segment Anything Model 2 de Meta).

Expone dos funciones principales:
  - segment_frame: genera una mascara puntual en un frame (interactivo)
  - propagate_video: propaga una mascara a lo largo de un video completo

El modelo se carga una sola vez al importar el modulo (singleton).
Requiere PyTorch con CUDA y el paquete sam2 instalado.
"""

import os
import json
import numpy as np
from PIL import Image

# El modelo SAM 2 se carga de forma diferida para no bloquear el arranque
# si los checkpoints no estan disponibles (ej. en entorno de test)
_predictor = None
_video_predictor = None

SAM2_CHECKPOINT = os.environ.get(
    "SAM2_CHECKPOINT", "/app/checkpoints/sam2_hiera_base_plus.pt"
)
SAM2_MODEL = os.environ.get("SAM2_MODEL", "sam2_hiera_base_plus")

# Mapeo de nombre de modelo a archivo de config Hydra dentro del paquete sam2
_MODEL_CONFIG_MAP = {
    "sam2_hiera_tiny":       "sam2_hiera_t.yaml",
    "sam2_hiera_small":      "sam2_hiera_s.yaml",
    "sam2_hiera_base_plus":  "sam2_hiera_b+.yaml",
    "sam2_hiera_large":      "sam2_hiera_l.yaml",
}
_SAM2_CONFIG = _MODEL_CONFIG_MAP.get(SAM2_MODEL, "sam2_hiera_b+.yaml")


def _get_predictor():
    global _predictor
    if _predictor is None:
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        device = "cuda" if torch.cuda.is_available() else "cpu"
        sam2_model = build_sam2(
            config_file=_SAM2_CONFIG,
            ckpt_path=SAM2_CHECKPOINT,
            device=device,
        )
        _predictor = SAM2ImagePredictor(sam2_model)
    return _predictor


def _get_video_predictor():
    global _video_predictor
    if _video_predictor is None:
        import torch
        from sam2.build_sam import build_sam2_video_predictor

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _video_predictor = build_sam2_video_predictor(
            config_file=_SAM2_CONFIG,
            ckpt_path=SAM2_CHECKPOINT,
            device=device,
        )
    return _video_predictor


def _mask_to_rle(mask: np.ndarray) -> str:
    """Convierte mascara binaria 2D a RLE (Run-Length Encoding) serializado como JSON."""
    flat = mask.flatten(order="C").astype(np.uint8)
    rle = []
    count = 1
    for i in range(1, len(flat)):
        if flat[i] == flat[i - 1]:
            count += 1
        else:
            rle.append(count)
            count = 1
    rle.append(count)
    return json.dumps({
        "rle": rle,
        "start": int(flat[0]),
        "shape": list(mask.shape),
    })


def _mask_to_bbox_normalized(mask: np.ndarray) -> tuple[float, float, float, float]:
    """Calcula bounding box normalizado [0-1] a partir de mascara binaria."""
    h, w = mask.shape
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any():
        return 0.0, 0.0, 0.0, 0.0
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    x = cmin / w
    y = rmin / h
    bw = (cmax - cmin) / w
    bh = (rmax - rmin) / h
    return float(x), float(y), float(bw), float(bh)


def segment_frame(
    frame_path: str,
    point_x: int,
    point_y: int,
    point_label: int = 1,
) -> tuple[str, tuple[float, float, float, float]]:
    """
    Genera una mascara de segmentacion para un unico frame.

    Args:
        frame_path: ruta absoluta al JPEG del frame
        point_x, point_y: coordenadas del click del operario (pixeles absolutos)
        point_label: 1 = incluir, 0 = excluir

    Returns:
        mask_rle: mascara serializada como RLE JSON
        bbox: (x, y, w, h) normalizados a [0-1]
    """
    import torch

    predictor = _get_predictor()
    image = np.array(Image.open(frame_path).convert("RGB"))

    with torch.inference_mode():
        predictor.set_image(image)
        masks, scores, _ = predictor.predict(
            point_coords=np.array([[point_x, point_y]]),
            point_labels=np.array([point_label]),
            multimask_output=False,
        )

    best_mask = masks[np.argmax(scores)]
    mask_rle = _mask_to_rle(best_mask)
    bbox = _mask_to_bbox_normalized(best_mask)
    return mask_rle, bbox


def segment_frame_options(
    frame_path: str,
    point_x: int,
    point_y: int,
    point_label: int = 1,
) -> list[dict]:
    """
    Genera 3 mascaras candidatas para un frame usando multimask_output=True.

    Returns:
        Lista de dicts [{mask_rle, bbox, score}] ordenados por score descendente.
    """
    import torch

    predictor = _get_predictor()
    image = np.array(Image.open(frame_path).convert("RGB"))

    with torch.inference_mode():
        predictor.set_image(image)
        masks, scores, _ = predictor.predict(
            point_coords=np.array([[point_x, point_y]]),
            point_labels=np.array([point_label]),
            multimask_output=True,
        )

    results = []
    for i in range(len(masks)):
        results.append({
            "mask_rle": _mask_to_rle(masks[i]),
            "bbox": _mask_to_bbox_normalized(masks[i]),
            "score": float(scores[i]),
        })
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def propagate_video(
    frames_dir: str,
    init_frame_index: int,
    init_mask_rle: str,
    progress_callback=None,
) -> dict[int, tuple[str, tuple[float, float, float, float]]]:
    """
    Propaga una mascara a lo largo de todos los frames de un video.

    Args:
        frames_dir: directorio con los frames JPEG (frame_000000.jpg, ...)
        init_frame_index: indice del frame donde esta la mascara inicial
        init_mask_rle: mascara RLE serializada del frame inicial
        progress_callback: funcion opcional callback(percent: int)

    Returns:
        dict con frame_index -> (mask_rle, bbox)
    """
    import torch
    import tempfile

    video_predictor = _get_video_predictor()

    # Reconstruir mascara inicial desde RLE
    rle_data = json.loads(init_mask_rle)
    shape = rle_data["shape"]
    flat = []
    val = rle_data["start"]
    for count in rle_data["rle"]:
        flat.extend([val] * count)
        val = 1 - val
    init_mask = np.array(flat, dtype=np.uint8).reshape(shape)

    # Listar frames disponibles (orden garantizado)
    frame_files = sorted([
        f for f in os.listdir(frames_dir) if f.endswith(".jpg")
    ])
    total = len(frame_files)

    # SAM2 exige que los JPEG se llamen con nombres puramente numericos
    # (ej. 000000.jpg). Nuestros frames usan "frame_XXXXXX.jpg", por lo que
    # creamos un directorio temporal con symlinks renombrados.
    tmp_ctx = tempfile.TemporaryDirectory()
    tmp_dir = tmp_ctx.name
    for idx, fname in enumerate(frame_files):
        src = os.path.join(frames_dir, fname)
        dst = os.path.join(tmp_dir, f"{idx:06d}.jpg")
        os.symlink(src, dst)

    inference_state = video_predictor.init_state(video_path=tmp_dir)

    # Registrar la mascara inicial en el predictor
    with torch.inference_mode():
        video_predictor.add_new_mask(
            inference_state=inference_state,
            frame_idx=init_frame_index,
            obj_id=1,
            mask=init_mask,
        )

        results: dict[int, tuple[str, tuple[float, float, float, float]]] = {}

        for out_frame_idx, out_obj_ids, out_mask_logits in video_predictor.propagate_in_video(
            inference_state
        ):
            mask = (out_mask_logits[0] > 0.0).squeeze().cpu().numpy()
            mask_rle = _mask_to_rle(mask)
            bbox = _mask_to_bbox_normalized(mask)
            results[out_frame_idx] = (mask_rle, bbox)

            if progress_callback:
                progress_callback(int((out_frame_idx + 1) / total * 100))

        video_predictor.reset_state(inference_state)

    tmp_ctx.cleanup()
    return results
