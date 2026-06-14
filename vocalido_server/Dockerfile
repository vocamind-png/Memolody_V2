FROM pytorch/pytorch:2.2.1-cuda12.1-cudnn8-runtime

# Install system dependencies (ffmpeg is required for pydub)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies (Runpod base image already has pytorch with cuda)
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port 5001 for RunPod HTTP Proxy
ENV PORT=5001
EXPOSE 5001

# RunPod requires a start script or direct command. 
# We'll run the FastAPI server directly. RunPod proxies traffic to the exposed port.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
