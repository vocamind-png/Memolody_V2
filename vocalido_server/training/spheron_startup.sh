#!/bin/bash
# =============================================================================
# Vocalido DiffSinger - Spheron GPU Startup Script v3.0
# รองรับ: GH200, H100, A100 บน Ubuntu (CUDA 12.x)
# ใช้กับ: $8.53 budget / GH200 $1.97/hr → ~3h 20min เทรน
# วิธีใช้: bash spheron_startup.sh
# =============================================================================

GCS_BUCKET="gs://vocalido-master-corpus-v1"
EXP_NAME="vocalido_v1"
WORK_DIR="$HOME/DiffSinger"
GCLOUD="$HOME/google-cloud-sdk/bin/gcloud"

# ───── Budget Timer ─────
# หยุดเทรนหลัง 200 นาที เพื่อเหลือเวลา save + download
TRAIN_DURATION_MINUTES=200
TRAIN_DURATION_SECONDS=$((TRAIN_DURATION_MINUTES * 60))

echo "============================================"
echo "  Vocalido Training Setup v3.0 - Starting"
echo "  Budget: ~$8.53 | GH200 $1.97/hr"
echo "  Train Time: ${TRAIN_DURATION_MINUTES} minutes → auto-save & stop"
echo "============================================"

# ─────────────────────────────────────────────
# STEP 1: ติดตั้ง System Dependencies
# ─────────────────────────────────────────────
echo ""
echo "[1/7] ติดตั้ง System Dependencies..."
sudo apt-get update -qq 2>/dev/null || true
sudo apt-get install -y git curl tmux libsndfile1 ffmpeg 2>/dev/null || true
sudo chown -R ubuntu:ubuntu ~/.config 2>/dev/null || true
echo "  ✓ Done"

# ─────────────────────────────────────────────
# STEP 2: ติดตั้ง Google Cloud SDK (ถ้ายังไม่มี)
# ─────────────────────────────────────────────
echo ""
echo "[2/7] ตรวจสอบ Google Cloud SDK..."
if ! command -v gcloud &> /dev/null && [ ! -f "$GCLOUD" ]; then
    echo "  → ติดตั้ง gcloud..."
    curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts > /dev/null 2>&1
fi
source "$HOME/google-cloud-sdk/path.bash.inc" 2>/dev/null || true
GCLOUD="$HOME/google-cloud-sdk/bin/gcloud"
echo "  ✓ gcloud ready: $(gcloud --version 2>/dev/null | head -1)"

# ─────────────────────────────────────────────
# STEP 3: ล็อกอิน Google Cloud
# ─────────────────────────────────────────────
echo ""
echo "[3/7] ล็อกอิน Google Cloud..."
echo "  → กรุณาก๊อป URL ด้านล่างไปเปิดใน Browser แล้ว paste Code กลับมา"
echo ""
mkdir -p ~/.config/gcloud
gcloud auth login --no-launch-browser
echo "  ✓ Authenticated"

# ─────────────────────────────────────────────
# STEP 4: Clone DiffSinger + ติดตั้ง Dependencies
# ─────────────────────────────────────────────
echo ""
echo "[4/7] เตรียม DiffSinger..."
if [ ! -d "$WORK_DIR/.git" ]; then
    git clone https://github.com/openvpi/DiffSinger.git "$WORK_DIR" --quiet
fi
cd "$WORK_DIR"
mkdir -p checkpoints data

echo "  → ตรวจ GPU..."
nvidia-smi | grep -E "Driver|CUDA" || echo "  ⚠ nvidia-smi issue"

echo "  → ติดตั้ง PyTorch (CUDA 12.x)..."
pip install -q --force-reinstall torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu121 2>/dev/null
pip install -q lightning 2>/dev/null
pip install -q -r requirements.txt 2>/dev/null || \
    pip install -q -r requirements.txt --no-deps 2>/dev/null || true
echo "  ✓ Dependencies installed"

GPU_OK=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null)
echo "  → GPU available: $GPU_OK"

# ─────────────────────────────────────────────
# STEP 5: โหลด Data + Checkpoint จาก GCS
# ─────────────────────────────────────────────
echo ""
echo "[5/7] โหลดข้อมูลจาก GCS..."

# Vocoder
echo "  → โหลด Vocoder..."
VOCODER="checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02"
mkdir -p "$VOCODER"
gcloud storage cp -r \
    "$GCS_BUCKET/vocalido_training/DiffSinger/checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02/." \
    "./$VOCODER/" 2>/dev/null || \
gcloud storage cp -r \
    "$GCS_BUCKET/vocalido_training/DiffSinger/checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02" \
    "./checkpoints/" 2>/dev/null || true

# Binary Dataset
echo "  → โหลด Binary Dataset (vocalido_bin)..."
gcloud storage cp -r \
    "$GCS_BUCKET/vocalido_training/DiffSinger/data/vocalido_bin" \
    "./data/" 2>/dev/null || true

# สร้าง Symlink ให้ DiffSinger หาเจอ
mkdir -p data/opencpop
ln -sfn "$WORK_DIR/data/vocalido_bin" "$WORK_DIR/data/opencpop/binary"
echo '{"vocalido": 0}' > data/opencpop/binary/spk_map.json 2>/dev/null || true
echo '{"en": 0}' > data/opencpop/binary/lang_map.json 2>/dev/null || true

# Checkpoint 160,000 steps (847MB) ← ตัวที่ถูกต้อง
echo "  → โหลด Checkpoint 160k steps (847MB)..."
mkdir -p "checkpoints/$EXP_NAME"
gcloud storage cp \
    "$GCS_BUCKET/vocalido_training/DiffSinger/checkpoints/vocalido_v1/model_ckpt_steps_160000.ckpt" \
    "./checkpoints/$EXP_NAME/model_ckpt_steps_160000.ckpt"

echo "  ✓ ข้อมูลทั้งหมดโหลดเรียบร้อย"
ls -lh checkpoints/$EXP_NAME/

# ─────────────────────────────────────────────
# STEP 6: เขียน Config ต้นฉบับ (acoustic.yaml)
# ─────────────────────────────────────────────
echo ""
echo "[6/7] เขียน Config..."
cat > configs/acoustic.yaml << 'YAML_EOF'
base_config:
  - configs/base.yaml
task_cls: training.acoustic_task.AcousticTask
dictionaries: {}
extra_phonemes: []
merged_phoneme_groups: []
datasets: []
vocoder: NsfHifiGAN
vocoder_ckpt: checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02/model.ckpt
audio_sample_rate: 44100
audio_num_mel_bins: 128
hop_size: 512
fft_size: 2048
win_size: 2048
fmin: 40
fmax: 16000
binary_data_dir: 'data/opencpop/binary'
binarizer_cls: preprocessing.acoustic_binarizer.AcousticBinarizer
spec_min: [-12]
spec_max: [0]
mel_vmin: -14.
mel_vmax: 4.
mel_base: 'e'
energy_smooth_width: 0.12
breathiness_smooth_width: 0.12
voicing_smooth_width: 0.12
tension_smooth_width: 0.12
use_lang_id: false
num_lang: 1
use_spk_id: false
num_spk: 1
use_energy_embed: false
use_breathiness_embed: false
use_voicing_embed: false
use_tension_embed: false
use_key_shift_embed: false
use_speed_embed: false
diffusion_type: reflow
time_scale_factor: 1000
timesteps: 1000
max_beta: 0.02
enc_ffn_kernel_size: 3
use_rope: true
rope_interleaved: false
rel_pos: true
sampling_algorithm: euler
sampling_steps: 20
diff_accelerator: ddim
diff_speedup: 10
hidden_size: 256
backbone_type: 'lynxnet'
backbone_args:
  num_channels: 1024
  num_layers: 6
  kernel_size: 31
  dropout_rate: 0.0
  strong_cond: true
main_loss_type: l2
main_loss_log_norm: false
schedule_type: 'linear'
use_shallow_diffusion: true
T_start: 0.4
T_start_infer: 0.4
K_step: 400
K_step_infer: 400
shallow_diffusion_args:
  train_aux_decoder: true
  train_diffusion: true
  val_gt_start: false
  aux_decoder_arch: convnext
  aux_decoder_args:
    num_channels: 512
    num_layers: 6
    kernel_size: 7
    dropout_rate: 0.1
  aux_decoder_grad: 0.1
lambda_aux_mel_loss: 0.2
binarization_args:
  shuffle: true
  num_workers: 0
augmentation_args:
  random_pitch_shifting:
    enabled: false
  fixed_pitch_shifting:
    enabled: false
  random_time_stretching:
    enabled: false
num_sanity_val_steps: 1
optimizer_args:
  lr: 0.0006
lr_scheduler_args:
  step_size: 10000
  gamma: 0.75
max_batch_frames: 50000
max_batch_size: 64
dataset_size_key: 'lengths'
val_with_vocoder: true
val_check_interval: 2000
num_valid_plots: 10
max_updates: 300000
num_ckpt_keep: 5
permanent_ckpt_start: 80000
permanent_ckpt_interval: 20000
finetune_enabled: false
finetune_ckpt_path: null
finetune_ignored_params:
  - model.fs2.encoder.embed_tokens
  - model.fs2.txt_embed
  - model.fs2.spk_embed
finetune_strict_shapes: true
freezing_enabled: false
frozen_params: []
YAML_EOF
echo "  ✓ Config เขียนเรียบร้อย (max_updates: 300000)"

# ─────────────────────────────────────────────
# STEP 7: เริ่มเทรน + Auto-Save + Budget Timer
# ─────────────────────────────────────────────
echo ""
echo "[7/7] เริ่มเทรน..."
echo "  → Training จะหยุดอัตโนมัติใน ${TRAIN_DURATION_MINUTES} นาที"
echo "  → Auto-save to GCS ทุก 30 นาที"
echo ""

# สร้าง Auto-Save Script
cat > /tmp/auto_save.sh << SAVE_EOF
#!/bin/bash
GCS_BUCKET="$GCS_BUCKET"
WORK_DIR="$WORK_DIR"
EXP_NAME="$EXP_NAME"
GCLOUD="$GCLOUD"
INTERVAL=1800  # 30 นาที
COUNT=0
while true; do
    sleep \$INTERVAL
    COUNT=\$((COUNT + 1))
    echo ""
    echo "🔄 [Auto-Save #\$COUNT] Uploading checkpoint to GCS..."
    \$GCLOUD storage cp -r \
        "\$WORK_DIR/checkpoints/\$EXP_NAME/" \
        "\$GCS_BUCKET/vocalido_training/DiffSinger/checkpoints/\$EXP_NAME/" \
        2>/dev/null && echo "✅ Saved to GCS" || echo "⚠ Save failed"
done
SAVE_EOF
chmod +x /tmp/auto_save.sh

# รัน Auto-Save ใน background
/tmp/auto_save.sh &
AUTOSAVE_PID=$!
echo "  → Auto-Save PID: $AUTOSAVE_PID"

# รัน Training ใน tmux พร้อม Budget Timer
tmux new-session -d -s vocalido_train \
    "cd $WORK_DIR && \
     PYTHONPATH=. python3 scripts/train.py \
       --config configs/acoustic.yaml \
       --exp_name $EXP_NAME \
       2>&1 | tee train_log.txt"

echo "  ✓ Training เริ่มแล้วใน tmux session: vocalido_train"
echo ""
echo "════════════════════════════════════════════"
echo "  ⏱ Budget Timer: หยุดใน ${TRAIN_DURATION_MINUTES} นาที"
echo "════════════════════════════════════════════"

# รอจนหมดเวลา แล้ว Final Save
sleep $TRAIN_DURATION_SECONDS

echo ""
echo "⏰ หมดเวลาเทรน! กำลัง Final Save..."

# หยุด Training
tmux send-keys -t vocalido_train C-c 2>/dev/null || true
kill $AUTOSAVE_PID 2>/dev/null || true
sleep 10

# Final Upload Checkpoint
echo "📤 Uploading final checkpoint to GCS..."
$GCLOUD storage cp -r \
    "$WORK_DIR/checkpoints/$EXP_NAME/" \
    "$GCS_BUCKET/vocalido_training/DiffSinger/checkpoints/$EXP_NAME/" \
    2>/dev/null && echo "✅ Final checkpoint saved!" || echo "⚠ Upload failed"

# แสดงผล Step ล่าสุด
LAST_CKPT=$(ls -t "$WORK_DIR/checkpoints/$EXP_NAME/"*.ckpt 2>/dev/null | head -1)
echo ""
echo "════════════════════════════════════════════"
echo "  ✅ เทรนเสร็จ!"
echo "  📁 Checkpoint: $LAST_CKPT"
echo ""
echo "  ⬇️ โหลดลงเครื่อง Mac ให้รันบน Mac:"
echo ""
echo "  gcloud storage cp -r \\"
echo "    $GCS_BUCKET/vocalido_training/DiffSinger/checkpoints/$EXP_NAME/ \\"
echo "    ~/Downloads/vocalido_checkpoints/"
echo ""
echo "  💡 จากนั้น terminate instance ได้เลยครับ!"
echo "════════════════════════════════════════════"

# แสดง log สุดท้าย
tail -20 "$WORK_DIR/train_log.txt" 2>/dev/null || true
