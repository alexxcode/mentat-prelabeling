# Usa la imagen de Deep Learning de GCP que ya incluye CUDA 11.8 y Python 3.10
# En desarrollo local sin GPU, cambiar por: python:3.10-slim
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

WORKDIR /app

# Evita preguntas interactivas durante apt (ej. tzdata)
ENV DEBIAN_FRONTEND=noninteractive

# Dependencias del sistema para OpenCV y FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Instalar SAM 2
RUN pip install --no-cache-dir \
    git+https://github.com/facebookresearch/sam2.git

# Instalar dependencias del proyecto
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
