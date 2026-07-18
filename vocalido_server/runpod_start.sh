#!/bin/bash
# This script sets up the environment and starts the Vocalido server on RunPod.
# It includes auto-restore from GCS backup to prevent data loss on restart.

cd /workspace/Memolody_V2/vocalido_server

echo "🚀 Starting Vocalido Server script..."

# 🧹 Cleaning up old processes...
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "python3 main.py" 2>/dev/null
pkill -f "python main.py" 2>/dev/null
fuser -k 8888/tcp 2>/dev/null
fuser -k 8000/tcp 2>/dev/null
sleep 2

echo "📦 Installing CUDA 11.8 libraries required by ONNXRuntime..."
apt-get update -qq
apt-get install -y -qq libcufft-11-8 libcurand-11-8 libcusolver-11-8 libcusparse-11-8 libcublas-11-8 cuda-cudart-11-8
echo "/usr/local/cuda-11.8/targets/x86_64-linux/lib" > /etc/ld.so.conf.d/cuda-11-8.conf
ldconfig

# Force LD_LIBRARY_PATH to include PyTorch's bundled CUDA libraries
export LD_LIBRARY_PATH=$(python -c 'import os, site; print(":".join([os.path.join(p, "nvidia", d, "lib") for p in site.getsitepackages() for d in os.listdir(os.path.join(p, "nvidia")) if os.path.isdir(os.path.join(p, "nvidia", d))]) if os.path.exists(os.path.join(site.getsitepackages()[0], "nvidia")) else "")'):$LD_LIBRARY_PATH

# ──────────────────────────────────────────────────────
# 🛡️ AUTO-RESTORE: Check for missing model files and restore from GCS
# ──────────────────────────────────────────────────────
echo "🛡️ Checking model files..."
if [ -f "/workspace/gcs-key.json" ] && [ -f "model_backup.py" ]; then
    # If any files missing, auto-restore from GCS
    if ! python3 model_backup.py check 2>&1 | grep -q "All files are present"; then
        echo "⚠️  Some model files missing! Auto-restoring from GCS backup..."
        python3 model_backup.py restore
        echo "✅ Auto-restore complete!"
    else
        echo "✅ All model files present."
    fi
else
    echo "⚠️  GCS key or backup script not found. Skipping auto-restore."
    echo "   To enable: ensure /workspace/gcs-key.json and model_backup.py exist."
fi

echo "🌟 Starting Vocalido Server on port 8888..."
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8888 --workers 1 > /workspace/server.log 2>&1 &
sleep 5

echo "✅ Server started! You can now test it in the web app."
tail -10 /workspace/server.log
