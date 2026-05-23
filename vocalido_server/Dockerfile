# Use RunPod PyTorch base image which has CUDA 11.8 installed
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    libsndfile1 ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements files
COPY requirements.txt requirements_diffsinger.txt ./

# Install python dependencies including runpod SDK
RUN pip install --no-cache-dir -r requirements.txt -r requirements_diffsinger.txt runpod

# IMPORTANT: Uninstall CPU onnxruntime and install GPU version for CUDA acceleration
RUN pip uninstall -y onnxruntime && pip install onnxruntime-gpu

# Copy all server code into the image
COPY . /app/

# The handler is the entrypoint for RunPod Serverless
CMD ["python", "-u", "/app/runpod_handler.py"]
