#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Vocalido Chinese DiffSinger — Full Training Script
# RunPod: paste one line to run:
#   bash <(gsutil cat gs://vocalido-master-corpus-v1/training/scripts/train_chinese.sh)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GCS_BUCKET="vocalido-master-corpus-v1"
WORK_DIR="/workspace"
DS_DIR="$WORK_DIR/DiffSinger"
M4_DIR="$WORK_DIR/m4singer"
DATA_DIR="$WORK_DIR/vocalido_chinese_data"
GCS_KEY="/tmp/gcs_key.json"

log() { echo -e "\n\033[1;36m▶ $1\033[0m"; }
ok()  { echo -e "\033[1;32m✅ $1\033[0m"; }
err() { echo -e "\033[1;31m❌ $1\033[0m"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 1/8: Writing GCS credentials"
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "${GCS_KEY_JSON:-}" ]; then
  echo "$GCS_KEY_JSON" > "$GCS_KEY"
elif [ -f "/workspace/DiffSinger_Workspace/gcs_runpod_key.json" ]; then
  cp "/workspace/DiffSinger_Workspace/gcs_runpod_key.json" "$GCS_KEY"
else
  echo "WARNING: GCS key not found in GCS_KEY_JSON or /workspace/DiffSinger_Workspace/gcs_runpod_key.json"
fi
export GOOGLE_APPLICATION_CREDENTIALS="$GCS_KEY"
ok "GCS key setup finished"

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 2/8: Install dependencies"
# ─────────────────────────────────────────────────────────────────────────────
pip install -q google-cloud-storage huggingface_hub \
    librosa soundfile scipy PyYAML 2>/dev/null
apt-get install -qq -y libsndfile1 ffmpeg git 2>/dev/null || true
ok "Dependencies installed"

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 3/8: Clone DiffSinger"
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -d "$DS_DIR" ]; then
    git clone --depth 1 https://github.com/openvpi/DiffSinger.git "$DS_DIR"
fi
pip install -q -r "$DS_DIR/requirements.txt" 2>/dev/null || true
ok "DiffSinger ready at $DS_DIR"

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 4/8: Download base_model from GCS (public URL)"
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$DS_DIR/checkpoints/base_model"
BASE_CKPT="$DS_DIR/checkpoints/base_model/base_model.ckpt"
BASE_URL="https://storage.googleapis.com/vocalido-master-corpus-v1/diffsinger/checkpoints/base_model/base_model.ckpt"

if [ ! -f "$BASE_CKPT" ]; then
    echo "Downloading base_model (~850MB)..."
    wget -q --show-progress -O "$BASE_CKPT" "$BASE_URL" || \
        curl -L --progress-bar -o "$BASE_CKPT" "$BASE_URL"
fi
ok "base_model ready ($(du -sh $BASE_CKPT | cut -f1))"

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 5/8: Download training data from GCS"
# ─────────────────────────────────────────────────────────────────────────────
DATA_DIR="$WORK_DIR/vocalido_chinese_data"
mkdir -p "$DATA_DIR/wavs"

# Download wavs + transcriptions from GCS (already there, no login needed)
python3 - << PYEOF
from google.cloud import storage
import os
from pathlib import Path

gcs    = storage.Client.from_service_account_json('/tmp/gcs_key.json')
bucket = gcs.bucket('vocalido-master-corpus-v1')
dest   = Path('$DATA_DIR')

# Download transcriptions.csv
print('Downloading transcriptions.csv...')
bucket.blob('diffsinger/data/vocalido/transcriptions.csv').download_to_filename(
    str(dest / 'transcriptions.csv'))

# Download all wav files
print('Downloading wav files...')
blobs = list(gcs.list_blobs('vocalido-master-corpus-v1', prefix='diffsinger/data/vocalido/wavs/'))
print(f'Found {len(blobs)} wav files')
for i, blob in enumerate(blobs):
    fname = Path(blob.name).name
    if not fname.endswith('.wav'): continue
    out = dest / 'wavs' / fname
    if not out.exists():
        blob.download_to_filename(str(out))
    if i % 20 == 0:
        print(f'  [{i}/{len(blobs)}] {fname}')

print(f'Done! {len(list((dest/"wavs").glob("*.wav")))} wav files ready')
PYEOF
ok "Training data ready from GCS"

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 6/8: Preprocess + Binarize"
# ─────────────────────────────────────────────────────────────────────────────
python3 - << PYEOF
import csv, os, librosa, soundfile as sf
from pathlib import Path

PROC = Path('$DATA_DIR')
(PROC / 'wavs').mkdir(parents=True, exist_ok=True)
records, SR = [], 44100

wavs = sorted(Path('$M4_DIR').rglob('*.wav'))[:600]
print(f'Processing {len(wavs)} files...')
for i, w in enumerate(wavs):
    try:
        a, _ = librosa.load(str(w), sr=SR, mono=True)
        dur = len(a) / SR
        if dur < 0.5 or dur > 15: continue
        name = f'zh_{i:05d}'
        sf.write(str(PROC / 'wavs' / f'{name}.wav'), a, SR, subtype='PCM_24')
        lp = w.with_suffix('.txt')
        label = lp.read_text(encoding='utf-8').strip() if lp.exists() else 'SP'
        records.append({'name':name,'ph_seq':label,
            'ph_dur':str(round(dur/max(1,len(label.split())),4)),
            'note_seq':'C4','note_dur':str(round(dur,4)),'note_slur':'0'})
    except: continue

with open(PROC / 'transcriptions.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, ['name','ph_seq','ph_dur','note_seq','note_dur','note_slur'])
    w.writeheader(); w.writerows(records)
print(f'Done: {len(records)} files')
PYEOF

# Write config
python3 - << PYEOF
import yaml
cfg = {
    'base_config':'configs/acoustic/base.yaml',
    'finetune_ckpt_path':'checkpoints/base_model/base_model.ckpt',
    'finetune_ignored_params':[],
    'finetune_strict_shapes':False,
    'raw_data_dir':'$DATA_DIR',
    'binary_data_dir':'data/binary/vocalido_chinese',
    'dictionary':'dictionaries/opencpop-extension.txt',
    'audio_sample_rate':44100,'hop_size':512,'num_mels':128,
    'fmin':40,'fmax':16000,
    'max_updates':60000,'val_check_interval':2000,'num_ckpt_keep':3,
    'lr':0.0002,'batch_size':16,'num_workers':4,
    'use_spk_id':False,'use_shallow_diffusion':True,
    'K_step':1000,'K_step_infer':20,'exp_name':'vocalido_chinese',
}
with open('$DS_DIR/configs/vocalido_chinese.yaml','w') as f:
    yaml.dump(cfg, f)
print('Config written')
PYEOF

cd "$DS_DIR"
PYTHONPATH=. python data_gen/tts/bin/binarize.py \
    --config configs/vocalido_chinese.yaml
ok "Dataset binarized"

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 7/8: TRAIN (60,000 steps ~4-6h)"
# ─────────────────────────────────────────────────────────────────────────────
cd "$DS_DIR"
PYTHONPATH=. python tasks/run.py \
    --config configs/vocalido_chinese.yaml \
    --exp_name vocalido_chinese \
    --reset 2>&1 | tee /tmp/train_zh.log

# ─────────────────────────────────────────────────────────────────────────────
log "STEP 8/8: Upload checkpoint → GCS"
# ─────────────────────────────────────────────────────────────────────────────
python3 - << PYEOF
import glob, os
from google.cloud import storage

ckpts = sorted(glob.glob('$DS_DIR/checkpoints/vocalido_chinese/*.ckpt'))
if not ckpts:
    print('❌ No checkpoints found! Check /tmp/train_zh.log')
    exit(1)

best = ckpts[-1]
name = os.path.basename(best)
gcs = storage.Client.from_service_account_json('/tmp/gcs_key.json')
bucket = gcs.bucket('vocalido-master-corpus-v1')

print(f'Uploading {name}...')
bucket.blob(f'checkpoints/chinese/{name}').upload_from_filename(best)
bucket.blob('checkpoints/chinese/config.yaml').upload_from_filename(
    '$DS_DIR/configs/vocalido_chinese.yaml')

print(f'✅ Uploaded! Download to Mac:')
print(f'gsutil cp gs://vocalido-master-corpus-v1/checkpoints/chinese/{name} \\')
print(f'  vocalido_server/training/DiffSinger/checkpoints/vocalido_chinese/')
PYEOF

echo ""
echo "════════════════════════════════════════════════════"
echo "  ✅ Chinese DiffSinger Training Complete!"
echo "════════════════════════════════════════════════════"
