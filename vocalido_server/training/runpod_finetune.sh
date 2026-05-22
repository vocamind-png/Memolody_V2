#!/bin/bash
set -e

echo "==================================================="
echo "🎤 VOCALIDO GTSINGER - RUNPOD FINE-TUNING SCRIPT 🎤"
echo "==================================================="

# 1. System Setup
echo "[1/6] Installing dependencies..."
apt-get update && apt-get install -y git wget curl unzip sox libsndfile1 jq
pip install tensorboard

# 2. Clone DiffSinger
if [ ! -d "DiffSinger" ]; then
    echo "[2/6] Cloning DiffSinger..."
    git clone https://github.com/openvpi/DiffSinger.git
fi
cd DiffSinger

# 3. Setup Environment
echo "[3/6] Setting up Python environment..."
pip install -r requirements.txt
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# 4. Download User's Base Model from Public GCS
echo "[4/6] Downloading Base Model from GCS..."
mkdir -p checkpoints/0814_base
cd checkpoints/0814_base
if [ ! -f "model_ckpt_steps_160000.ckpt" ]; then
    wget -q --show-progress "https://storage.googleapis.com/vocalido-master-corpus-v1/diffsinger/base_model.ckpt" -O model_ckpt_steps_160000.ckpt
fi
cd ../..

# 5. Download User Dataset from GCS
echo "[5/6] Downloading Dataset from GCS..."
mkdir -p data/raw
wget -q --show-progress "https://storage.googleapis.com/vocalido-master-corpus-v1/diffsinger/vocalido.zip" -O vocalido.zip || true
if [ -f "vocalido.zip" ]; then
    unzip -q vocalido.zip -d data/raw/
    rm vocalido.zip
else
    # Fallback to gsutil if zip is not available (though we made the folder public)
    /google-cloud-sdk/bin/gsutil -m cp -r gs://vocalido-master-corpus-v1/diffsinger/vocalido data/raw/
fi
echo "Dataset downloaded successfully!"

# 6. Setup Config for Finetuning
echo "[6/6] Configuring Fine-Tuning..."
cat <<EOF > data/raw/vocalido/config.yaml
base_config:
  - configs/acoustic.yaml
binarizer_cls: preprocessing.acoustic_binarizer.AcousticBinarizer
binary_data_dir: data/binary/vocalido
datasets:
  - language: english
    raw_data_dir: data/raw/vocalido
    speaker: vocalido
    spk_id: 0
dictionaries:
  english: english.txt
finetune_enabled: true
finetune_ckpt_path: checkpoints/0814_base/model_ckpt_steps_160000.ckpt
finetune_strict_shapes: false
num_ckpt_keep: 3
val_check_interval: 1000
log_interval: 100
max_updates: 20000 # Only 20k steps needed for FT!
ds_workers: 8
batch_size: 16
EOF

echo "==================================================="
echo "✅ SETUP COMPLETE! To start training, run:"
echo "cd DiffSinger"
echo "python scripts/binarize.py --config data/raw/vocalido/config.yaml"
echo "python scripts/train.py --config data/raw/vocalido/config.yaml --exp_name vocalido_ft"
echo "==================================================="
