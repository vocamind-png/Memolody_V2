import os, glob, subprocess, time
from pathlib import Path

def run_cmd(cmd):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

# 1. Wait for download
print("Waiting for M4Singer download to finish...")
while True:
    res = subprocess.run(["pgrep", "-f", "snapshot_download"], stdout=subprocess.PIPE)
    if not res.stdout.strip():
        break
    time.sleep(30)
print("Download finished!")

# 2. Process TextGrid to transcriptions.csv
print("Processing dataset...")
subprocess.run(["pip", "install", "--break-system-packages", "tgt"], check=True)
import tgt
import csv
import librosa
import soundfile as sf

DATA_DIR = Path("/workspace/m4singer_public")
PROC_DIR = Path("/workspace/DiffSinger/data/raw/m4singer")
WAV_OUT = PROC_DIR / "wavs"
WAV_OUT.mkdir(parents=True, exist_ok=True)

records = []
wavs = sorted(DATA_DIR.rglob("*.wav"))

print(f"Found {len(wavs)} wav files. Processing first 1000 for fast training...")
for wav_path in wavs[:1000]:
    try:
        tg_path = wav_path.parent.parent / "TextGrid" / (wav_path.stem + ".TextGrid")
        if not tg_path.exists(): continue
        
        # Load audio
        y, sr = librosa.load(str(wav_path), sr=44100, mono=True)
        sf.write(str(WAV_OUT / f"{wav_path.stem}.wav"), y, sr, subtype='PCM_24')
        
        # Parse TextGrid
        tg = tgt.io.read_textgrid(str(tg_path))
        phones = tg.get_tier_by_name("phones")
        
        ph_seq = []
        ph_dur = []
        for interval in phones:
            p = interval.text.strip()
            if not p: p = 'SP'
            ph_seq.append(p)
            ph_dur.append(str(round(interval.end_time - interval.start_time, 3)))
        
        # Simple dummy notes for acoustic training (only needs phonemes)
        note_seq = ' '.join(['C4'] * len(ph_seq))
        note_dur = ' '.join(ph_dur)
        note_slur = ' '.join(['0'] * len(ph_seq))
        
        records.append({
            'name': wav_path.stem,
            'ph_seq': ' '.join(ph_seq),
            'ph_dur': ' '.join(ph_dur),
            'note_seq': note_seq,
            'note_dur': note_dur,
            'note_slur': note_slur
        })
    except Exception as e:
        print(f"Error on {wav_path.name}: {e}")

with open(PROC_DIR / "transcriptions.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=['name', 'ph_seq', 'ph_dur', 'note_seq', 'note_dur', 'note_slur'])
    writer.writeheader()
    writer.writerows(records)

print(f"Prepared {len(records)} files!")

# 3. Create Config
import yaml
cfg = {
    'base_config': 'configs/acoustic/base.yaml',
    'finetune_ckpt_path': 'checkpoints/base_model/base_model.ckpt',
    'finetune_ignored_params': [],
    'finetune_strict_shapes': False,
    'raw_data_dir': str(PROC_DIR),
    'binary_data_dir': 'data/binary/vocalido_jianpu',
    'dictionary': 'dictionaries/opencpop-extension.txt',
    'audio_sample_rate': 44100,
    'hop_size': 512,
    'num_mels': 128,
    'fmin': 40,
    'fmax': 16000,
    'max_updates': 160000,
    'val_check_interval': 2000,
    'num_ckpt_keep': 3,
    'lr': 0.0001,
    'batch_size': 16,
    'num_workers': 4,
    'use_spk_id': False,
    'use_shallow_diffusion': True,
    'K_step': 1000,
    'K_step_infer': 20,
    'exp_name': 'vocalido_jianpu',
}
with open("/workspace/DiffSinger/configs/vocalido_jianpu.yaml", "w") as f:
    yaml.dump(cfg, f)

# 4. Binarize & Train
os.chdir("/workspace/DiffSinger")
run_cmd("pip install tgt")
run_cmd("PYTHONPATH=. python data_gen/tts/bin/binarize.py --config configs/vocalido_jianpu.yaml")
print("Binarize complete!")

print("Starting Training (will run for ~120k steps)...")
run_cmd("PYTHONPATH=. python tasks/run.py --config configs/vocalido_jianpu.yaml --exp_name vocalido_jianpu --reset")

# 5. Upload to GCS
print("Training finished! Uploading to GCS...")
from google.cloud import storage
ckpts = sorted(glob.glob('/workspace/DiffSinger/checkpoints/vocalido_jianpu/*.ckpt'))
if ckpts:
    best = ckpts[-1]
    name = os.path.basename(best)
    gcs = storage.Client.from_service_account_json('/workspace/DiffSinger_Workspace/gcs_runpod_key.json')
    bucket = gcs.bucket('vocalido-master-corpus-v1')
    bucket.blob(f'output/vocalido_jianpu/{name}').upload_from_filename(best)
    print(f"Uploaded {name} to GCS successfully!")
else:
    print("No checkpoints found to upload!")
