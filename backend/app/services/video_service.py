import os
import cv2
from typing import Tuple


def extract_frames_sync(
    video_path: str,
    output_dir: str,
    frame_interval: int = 1,
) -> Tuple[dict, list]:
    """
    Extrae frames de un video usando OpenCV.

    Args:
        video_path: ruta al archivo de video
        output_dir: directorio donde guardar los frames como JPEG
        frame_interval: extraer 1 de cada N frames (1 = todos)

    Returns:
        metadata: dict con fps, duration_seconds, total_frames, width, height
        frame_paths: lista ordenada de rutas absolutas a los frames extraidos
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir el video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames_raw = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_seconds = total_frames_raw / fps if fps > 0 else 0.0

    os.makedirs(output_dir, exist_ok=True)

    frame_paths = []
    frame_number = 0
    saved_index = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_number % frame_interval == 0:
            filename = f"frame_{saved_index:06d}.jpg"
            path = os.path.join(output_dir, filename)
            cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            frame_paths.append(path)
            saved_index += 1

        frame_number += 1

    cap.release()

    metadata = {
        "fps": fps,
        "duration_seconds": duration_seconds,
        "total_frames": len(frame_paths),
        "width": width,
        "height": height,
    }

    return metadata, frame_paths
