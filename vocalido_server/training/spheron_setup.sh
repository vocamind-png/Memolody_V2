#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# spheron_setup.sh
# สคริปต์สำหรับ Setup เครื่อง Spheron H200/H100 เพื่อเทรน Vocalido
# ═══════════════════════════════════════════════════════════════════════

set -e

echo "🚀 Starting Vocalido Setup on Spheron..."

# 1. Update system
sudo apt-get update && sudo apt-get install -y git wget curl unzip htop

# 2. Install Miniconda (ถ้ายังไม่มี)
if ! command -v conda &> /dev/null; then
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh
    bash miniconda.sh -b -p $HOME/miniconda
    export PATH="$HOME/miniconda/bin:$PATH"
    echo 'export PATH="$HOME/miniconda/bin:$PATH"' >> ~/.bashrc
fi

# 3. Clone Repository
git clone https://github.com/vocamind-png/Memolody_V2.git
cd Memolody_V2/vocalido_server/training/DiffSinger

# 4. Create Environment
conda create -n vocalido python=3.9 -y
conda run -n vocalido pip install torch torchvision torchaudio
conda run -n vocalido pip install -r requirements.txt
conda run -n vocalido pip install lightning==2.3.3  # เวอร์ชันที่เสถียรที่สุด

echo "✅ Setup Complete!"
echo "👉 ต่อไปให้อัปโหลดไฟล์จาก Mac (vocalido_data.zip, vocalido_ckpt.zip) มาที่นี่"
echo "👉 แล้วรัน: conda run -n vocalido python scripts/train.py --config usr/configs/vocalido.yaml"
