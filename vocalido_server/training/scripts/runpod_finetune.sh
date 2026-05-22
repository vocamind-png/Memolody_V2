#!/bin/bash
# =============================================================================
# RunPod: Vocalido V2 Fine-Tuning Script
# Run this script inside RunPod terminal (Ubuntu + NVIDIA GPU)
# Pulls dataset from GCS → binarize → fine-tune from base_model.ckpt
# =============================================================================

set -e  # Exit on error
echo "🚀 Starting Vocalido V2 Fine-Tuning on RunPod"
echo "=============================================="

# ── 1. Install gcloud CLI (if not present) ────────────────────────────────────
if ! command -v gsutil &> /dev/null; then
    echo "📦 Installing gcloud CLI..."
    curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts
    source ~/.bashrc
    export PATH="$HOME/google-cloud-sdk/bin:$PATH"
fi

# ── 2. Authenticate GCS (one-time setup — paste service account key here) ────
# Option A: Use JSON key file (recommended for RunPod)
# gcloud auth activate-service-account --key-file=/workspace/gcs-key.json

# Option B: Use application default credentials (if already set up)
# gcloud auth application-default login

echo "🔑 Checking GCS access..."
gsutil ls gs://vocalido-master-corpus-v1/ || {
    echo "❌ GCS access failed. Please authenticate:"
    echo "   gcloud auth login"
    exit 1
}

# ── 3. Setup workspace ────────────────────────────────────────────────────────
WORKSPACE="/workspace/DiffSinger"
echo "📁 Setting up workspace at $WORKSPACE"
mkdir -p $WORKSPACE
cd $WORKSPACE

# ── 4. Clone DiffSinger (if not present) ──────────────────────────────────────
if [ ! -d "$WORKSPACE/.git" ]; then
    echo "📥 Cloning DiffSinger (OpenVPI)..."
    git clone https://github.com/openvpi/DiffSinger.git .
fi

# ── 5. Install Python Dependencies ────────────────────────────────────────────
echo "📦 Installing dependencies..."
pip install -q -r requirements.txt
pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cu121 2>/dev/null || true

# ── 6. Download Dataset from GCS → local ─────────────────────────────────────
echo "📥 Downloading corrected dataset from GCS..."
mkdir -p data
gsutil -m cp -r gs://vocalido-master-corpus-v1/diffsinger/data/vocalido data/

echo "✅ Dataset downloaded:"
ls data/vocalido/

# ── 7. Download Checkpoints from GCS ─────────────────────────────────────────
echo "📥 Downloading checkpoints from GCS..."
mkdir -p checkpoints/base_model
mkdir -p checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02
mkdir -p checkpoints/rmvpe
mkdir -p checkpoints/vr

# Base model for fine-tuning
gsutil -m cp -r "gs://vocalido-master-corpus-v1/diffsinger/checkpoints/base_model/base_model.ckpt" \
    checkpoints/base_model/ 2>/dev/null || \
    echo "⚠️  base_model not in GCS — will need to upload manually"

# Vocoder (NSF-HifiGAN)
gsutil -m cp -r \
    "gs://vocalido-master-corpus-v1/diffsinger/checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02/" \
    checkpoints/ 2>/dev/null || \
    echo "⚠️  Vocoder not in GCS — check manually"

echo "✅ Checkpoints ready"

# ── 8. Copy config.yaml ───────────────────────────────────────────────────────
echo "📝 Downloading training config..."
gsutil cp gs://vocalido-master-corpus-v1/diffsinger/data/vocalido/../../../config_vocalido_v2.yaml \
    config_vocalido_v2.yaml 2>/dev/null || cat > config_vocalido_v2.yaml << 'YAML'
# Auto-generated Vocalido V2 training config
K_step: 400
K_step_infer: 400
audio_num_mel_bins: 128
audio_sample_rate: 44100
binarization_args:
  num_workers: 4
  shuffle: true
binarizer_cls: preprocessing.acoustic_binarizer.AcousticBinarizer
binary_data_dir: data/vocalido_v2_bin
datasets:
- language: en
  raw_data_dir: data/vocalido
  speaker: vocalido
  spk_id: 0
  test_prefixes:
  - song_01
dictionaries:
  en: dictionaries/english.txt
finetune_ckpt_path: checkpoints/base_model/base_model.ckpt
finetune_enabled: true
finetune_ignored_params:
- model.fs2.encoder.embed_tokens
- model.fs2.txt_embed
- model.fs2.spk_embed
finetune_strict_shapes: true
hop_size: 512
lr_scheduler_args:
  gamma: 0.75
  scheduler_cls: torch.optim.lr_scheduler.StepLR
  step_size: 10000
max_batch_frames: 50000
max_batch_size: 8
max_updates: 80000
num_ckpt_keep: 5
optimizer_args:
  beta1: 0.9
  beta2: 0.98
  lr: 0.0003
  optimizer_cls: torch.optim.AdamW
  weight_decay: 0
pe: parselmouth
pe_ckpt: checkpoints/rmvpe/model.pt
permanent_ckpt_interval: 10000
permanent_ckpt_start: 40000
pl_trainer_accelerator: gpu
pl_trainer_devices: auto
pl_trainer_precision: 16-mixed
task_cls: training.acoustic_task.AcousticTask
use_shallow_diffusion: true
val_check_interval: 200
vocoder: NsfHifiGAN
vocoder_ckpt: checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02/model.ckpt
work_dir: checkpoints/vocalido_v2
YAML

echo "✅ Config ready: config_vocalido_v2.yaml"

# ── 9. Binarize Dataset ───────────────────────────────────────────────────────
echo ""
echo "⚙️  Step 1/2: Binarizing dataset..."
echo "     (Converting WAV + TextGrid → .bin files for training)"
echo "     This takes ~5 minutes..."
echo ""

python run.py --config config_vocalido_v2.yaml --stage binarize

echo "✅ Binarization complete!"
echo ""

# ── 10. Start Fine-Tuning ─────────────────────────────────────────────────────
echo "🎤 Step 2/2: Starting Fine-Tuning from base_model.ckpt..."
echo "     Target: 40,000 steps (est. 3-5 hours on A100)"
echo "     Checkpoints saved every 1,000 steps"
echo ""

python run.py --config config_vocalido_v2.yaml --stage train

echo ""
echo "✅ Training complete!"
echo "   Checkpoint: checkpoints/vocalido_v2/"
echo ""

# ── 11. Upload Trained Model back to GCS ──────────────────────────────────────
echo "📤 Uploading trained checkpoint to GCS..."
gsutil -m cp -r checkpoints/vocalido_v2/ \
    gs://vocalido-master-corpus-v1/output/vocalido_v2/

echo ""
echo "🎉 All done! Your model is at:"
echo "   gs://vocalido-master-corpus-v1/output/vocalido_v2/"
echo ""
echo "📥 To download back to Mac:"
echo "   gsutil -m cp -r gs://vocalido-master-corpus-v1/output/vocalido_v2/ \\"
echo "     /Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/training/DiffSinger/checkpoints/"
