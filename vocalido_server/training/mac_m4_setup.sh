#!/bin/bash
set -e

echo "============================================="
echo "🍏 Vocalido Local Trainer — Apple M4 (MPS)"
echo "============================================="
echo "🚀 เตรียมพร้อมติดตั้งระบบสำหรับเทรนเสียงบน Mac..."

# 1. Install Miniconda if missing
if ! command -v conda &> /dev/null; then
    echo "📦 ไม่พบ Conda... กำลังติดตั้ง Miniconda สำหรับ Apple Silicon..."
    mkdir -p ~/miniconda3
    curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh
    bash Miniconda3-latest-MacOSX-arm64.sh -b -u -p ~/miniconda3
    rm Miniconda3-latest-MacOSX-arm64.sh
    source ~/miniconda3/bin/activate
    conda init zsh
    echo "✅ ติดตั้ง Miniconda สำเร็จ"
else
    echo "✅ พบ Conda ในเครื่องแล้ว"
fi

# 2. Setup Conda Environment for MFA and DiffSinger
echo "🛠️ สร้าง Environment 'vocalido-env'..."
source ~/miniconda3/bin/activate || source ~/opt/miniconda3/bin/activate || true
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main 2>/dev/null || true
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r 2>/dev/null || true
conda create -n vocalido-env python=3.10 -y -q
conda activate vocalido-env

# 3. Install Montreal-Forced-Aligner (MFA)
echo "🗣️ ติดตั้งระบบปรับคีย์เสียง MFA..."
conda install -c conda-forge montreal-forced-aligner -y -q

# 4. Install PyTorch with MPS Support and dependencies
echo "🔥 ติดตั้ง PyTorch (MPS) และ AI Libraries..."
pip install --quiet torch torchvision torchaudio
pip install --quiet tensorboard transformers numpy librosa soundfile pyyaml praat-parselmouth

# 5. Clone DiffSinger
echo "🎤 เตรียมชุดคำสั่ง DiffSinger..."
cd /Users/paisan/vocamind-projects/Memolody_V2/vocalido-server/training
if [ ! -d "DiffSinger" ]; then
    git clone https://github.com/openvpi/DiffSinger.git
fi
cd DiffSinger
pip install --quiet -r requirements.txt

echo "============================================="
echo "🎉 ติดตั้งพื้นฐานสำหรับ Mac M4 เสร็จสมบูรณ์!"
echo "กรุณาเปิด Terminal ใหม่อีกครั้ง หรือพิมพ์คำสั่ง: conda activate vocalido-env"
echo "============================================="
