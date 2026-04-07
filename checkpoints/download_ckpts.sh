#!/bin/bash
# Descarga los checkpoints de SAM 2 desde Meta
# Ejecutar desde la raiz del proyecto: bash checkpoints/download_ckpts.sh

set -e

CHECKPOINTS_DIR="$(dirname "$0")"
BASE_URL="https://dl.fbaipublicfiles.com/segment_anything_2/072824"

echo "Descargando checkpoints de SAM 2..."

# sam2_hiera_base_plus (recomendado para T4 - 8 GB VRAM)
wget -P "$CHECKPOINTS_DIR" "${BASE_URL}/sam2_hiera_base_plus.pt"

# Descomenta las siguientes lineas para descargar variantes adicionales:
# wget -P "$CHECKPOINTS_DIR" "${BASE_URL}/sam2_hiera_tiny.pt"
# wget -P "$CHECKPOINTS_DIR" "${BASE_URL}/sam2_hiera_small.pt"
# wget -P "$CHECKPOINTS_DIR" "${BASE_URL}/sam2_hiera_large.pt"

echo "Checkpoints descargados en $CHECKPOINTS_DIR"
