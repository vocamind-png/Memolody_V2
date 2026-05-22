#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
# RUN_ON_SPHERON.sh — ScoreLens V3 Training
# รันครั้งเดียวบน Spheron Ubuntu 22.04 LTS + RTX 5090
# ══════════════════════════════════════════════════════════════════════
set -e
WORK="$HOME/scorelens"
mkdir -p "$WORK"
cd "$WORK"

echo ""
echo "=== ScoreLens V3 — Spheron RTX 5090 Training ==="
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'checking...')"
echo ""

# ── 1. System packages ────────────────────────────────────────────────
echo "[1/6] System packages..."
apt-get update -qq
apt-get install -y -qq python3-pip python3-dev git unzip curl

# ── 2. Node.js (for Verovio rendering) ───────────────────────────────
echo "[2/6] Node.js + Verovio..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
npm install -g verovio sharp 2>/dev/null || npm install verovio sharp

# ── 3. Python + PyTorch with CUDA ────────────────────────────────────
echo "[3/6] PyTorch + CUDA + dependencies..."
pip install -q --upgrade pip
pip install -q \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu121

pip install -q \
    opencv-python-headless \
    numpy \
    Pillow \
    pypdfium2

# Verify GPU
python3 -c "import torch; print(f'  PyTorch {torch.__version__} | CUDA: {torch.cuda.is_available()} | GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"none\"}')"

# ── 4. Unpack files ───────────────────────────────────────────────────
echo "[4/6] Unpacking files..."
unzip -q scorelens_code.zip -d .
unzip -q xml_300.zip -d .

# Place best.pt (weights from last Spheron run)
mkdir -p ScoreLens_V3_Core/3_detector/weights
cp best.pt ScoreLens_V3_Core/3_detector/weights/best.pt
echo "  Weights loaded: $(du -sh ScoreLens_V3_Core/3_detector/weights/best.pt | cut -f1)"

# ── 5. Render XMLs → PNG + Ground Truth ──────────────────────────────
echo "[5/6] Rendering 300 real XMLs → PNG..."
cd ScoreLens_V3_Core
node 1_generator/render.js \
    --input  "../xml_sample" \
    --output "1_generator/dataset/real_rendered"

echo "  Rendered: $(find 1_generator/dataset/real_rendered/png -name '*.png' 2>/dev/null | wc -l) images"

# ── 6. Train — resume from best.pt ───────────────────────────────────
echo "[6/6] Training — resume from round4 weights..."
python3 3_detector/train.py \
    --gt      "1_generator/dataset/real_rendered/ground_truth.json" \
    --epochs  300 \
    --batch   8 \
    --device  cuda \
    --resume  "3_detector/weights/best.pt"

echo ""
echo "================================================"
echo "  Training Complete!"
echo "  Download weights back to Mac:"
echo "  scp root@\$(curl -s ifconfig.me):$WORK/ScoreLens_V3_Core/3_detector/weights/best.pt ."
echo "================================================"

set -e
WORK="$HOME/scorelens"
mkdir -p "$WORK"
cd "$WORK"

echo "🔧 [1/5] Install system packages..."
apt-get update -qq && apt-get install -y -qq unzip nodejs npm 2>/dev/null

echo "🔧 [2/5] Install Python packages..."
pip install -q opencv-python-headless numpy Pillow pypdfium2

echo "🔧 [3/5] Install Node packages (Verovio for rendering)..."
npm install -g verovio sharp 2>/dev/null || npm install verovio sharp

echo "📂 [4/5] Unpack files..."
unzip -q scorelens_code.zip -d .
unzip -q xml_300.zip -d .

# Place weights
mkdir -p ScoreLens_V3_Core/3_detector/weights
cp best.pt ScoreLens_V3_Core/3_detector/weights/best.pt

echo "🎨 Rendering XMLs → PNG..."
cd ScoreLens_V3_Core
node 1_generator/render.js \
    --input  "../xml_sample" \
    --output "1_generator/dataset/real_rendered"

echo "🚀 [5/5] Training — resume from best.pt..."
python 3_detector/train.py \
    --gt      "1_generator/dataset/real_rendered/ground_truth.json" \
    --epochs  300 \
    --batch   8 \
    --device  cuda \
    --resume  "3_detector/weights/best.pt"

echo ""
echo "✅ Training complete!"
echo "📥 Download weights:"
echo "   scp root@\$(hostname):$WORK/ScoreLens_V3_Core/3_detector/weights/best.pt ."
