#!/bin/bash
# This script sets up the environment and starts the Vocalido server on RunPod.

cd /workspace/Memolody_V2/vocalido_server

echo "🚀 Updating latest fixes from GitHub..."
curl -sL "https://raw.githubusercontent.com/vocamind-png/Memolody_V2/main/vocalido_server/main.py" > main.py
curl -sL "https://raw.githubusercontent.com/vocamind-png/Memolody_V2/main/vocalido_server/ds_onnx_engine.py" > ds_onnx_engine.py
curl -sL "https://raw.githubusercontent.com/vocamind-png/Memolody_V2/main/vocalido_server/vocalido_engine.py" > vocalido_engine.py

echo "🧹 Cleaning up old processes..."
pkill -f "python main.py" 2>/dev/null
sleep 2

echo "📦 Installing CUDA 11.8 libraries required by ONNXRuntime..."
apt-get update
apt-get install -y libcufft-11-8 libcurand-11-8 libcusolver-11-8 libcusparse-11-8 libcublas-11-8 cuda-cudart-11-8
echo "/usr/local/cuda-11.8/targets/x86_64-linux/lib" > /etc/ld.so.conf.d/cuda-11-8.conf
ldconfig

# Force LD_LIBRARY_PATH to include PyTorch's bundled CUDA libraries
export LD_LIBRARY_PATH=$(python -c 'import os, site; print(":".join([os.path.join(p, "nvidia", d, "lib") for p in site.getsitepackages() for d in os.listdir(os.path.join(p, "nvidia")) if os.path.isdir(os.path.join(p, "nvidia", d))]) if os.path.exists(os.path.join(site.getsitepackages()[0], "nvidia")) else "")'):$LD_LIBRARY_PATH

echo "🌟 Starting Vocalido Server..."
nohup python main.py > /workspace/server.log 2>&1 &
sleep 5

echo "✅ Server started! You can now test it in the web app."
tail -10 /workspace/server.log
