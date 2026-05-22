#!/usr/bin/env python3
import os, subprocess, json, csv, shutil, re, sys
from huggingface_hub import snapshot_download

# --- Clean Up ---
print("--- 1. Clean Up ---")
os.system("rm -rf /workspace/gtsinger_en /workspace/DiffSinger/data/raw/vocalido_gtsinger_en /workspace/DiffSinger/checkpoints/vocalido_gtsinger_en")

# --- Download ---
print("--- 2. Downloading EN-Alto-1 ---")
if not os.environ.get("HF_TOKEN"):
    print("WARNING: HF_TOKEN environment variable is not set.")
os.environ["HF_TOKEN"] = os.environ.get("HF_TOKEN", "")
try:
    path = snapshot_download(
        repo_id="AaronZ345/GTSinger",
        repo_type="dataset",
        local_dir="/workspace/gtsinger_en",
        token=os.environ["HF_TOKEN"],
        allow_patterns=["English/EN-Alto-1/**"],
    )
except Exception as e:
    print(f"Download Error: {e}")

# --- Extract ---
print("--- 3. Extracting Data ---")
import pathlib
GT_DIR = pathlib.Path("/workspace/gtsinger_en")
DS_DATA = pathlib.Path("/workspace/DiffSinger/data/raw/vocalido_gtsinger_en")
DS_WAV = DS_DATA / "wavs"
DS_WAV.mkdir(parents=True, exist_ok=True)

json_files = list(GT_DIR.rglob("*.json"))
print(f"Found {len(json_files)} JSON files")

rows = []
for jf in json_files:
    wav_file = jf.with_suffix(".wav")
    if not wav_file.exists(): continue
    try:
        with open(jf, "r") as f: data = json.load(f)
        ph_seq, ph_dur = [], []
        for item in data:
            for p, s, e in zip(item.get("ph", []), item.get("ph_start", []), item.get("ph_end", [])):
                p = p.strip("<>")
                p_clean = "SP" if p.upper() == "SP" else ("AP" if p.upper() == "AP" else re.sub(r'\d', '', p).lower())
                dur = max(round(float(e) - float(s), 4), 0.01)
                ph_seq.append(p_clean)
                ph_dur.append(str(dur))
        if not ph_seq: continue
        name = f"gtsinger_{len(rows):04d}"
        shutil.copy2(wav_file, DS_WAV / f"{name}.wav")
        rows.append({"name": name, "ph_seq": " ".join(ph_seq), "ph_dur": " ".join(ph_dur), "speaker": "vocalido"})
    except Exception as e:
        print(f"Error {jf}: {e}")

print(f"Extracted {len(rows)} audio files.")
if len(rows) == 0:
    sys.exit(1)

with open(DS_DATA / "transcriptions.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["name", "ph_seq", "ph_dur", "speaker"])
    w.writeheader()
    w.writerows(rows)

# --- Config ---
print("--- 4. Setup Config ---")
CKPT_OUT = pathlib.Path("/workspace/DiffSinger/checkpoints/vocalido_gtsinger_en")
CKPT_OUT.mkdir(parents=True, exist_ok=True)
with open(CKPT_OUT / "spk_map.json", "w") as f: json.dump({"vocalido": 0}, f)

cfg = {
    "base_config": "configs/acoustic.yaml",
    "exp_name": "vocalido_gtsinger_en",
    "work_dir": str(CKPT_OUT),
    "datasets": [{"speaker": "vocalido", "language": "english", "raw_data_dir": str(DS_DATA), "spk_id": 0}],
    "binary_data_dir": "data/binary/vocalido_gtsinger_en",
    "dict_dir": "dictionaries",
    "dictionaries": {"english": "english.txt"},
    "singers": [{"name": "vocalido", "type": "utterance"}],
    "test_prefixes": [rows[0]["name"], rows[1]["name"], rows[2]["name"]],
    "audio_sample_rate": 44100,
    "hop_size": 512,
    "win_size": 2048,
    "fft_size": 2048,
    "num_mels": 128,
    "mel_vmin": -14.0,
    "mel_vmax": 4.0,
    "max_updates": 160000,
    "permanent_ckpt_start": 80000,
    "permanent_ckpt_interval": 40000,
    "val_check_interval": 2000,
    "num_ckpt_keep": 3,
    "max_batch_frames": 50000,
    "max_batch_size": 64,
    "lr": 0.0001,
    "val_with_vocoder": False,
    "vocoder": "NsfHifiGAN",
    "vocoder_ckpt": "checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02/model.ckpt",
}
import yaml
with open("/workspace/DiffSinger/configs/vocalido_gtsinger_en.yaml", "w") as f: yaml.safe_dump(cfg, f)

# Make sure english dictionary is there
os.system("cp /workspace/DiffSinger_Workspace/dictionaries/english.txt /workspace/DiffSinger/dictionaries/english.txt")
os.system("cp /workspace/DiffSinger_Workspace/dictionaries/english.txt /workspace/DiffSinger/english.txt")

# --- Binarize & Train ---
print("--- 5. Binarize ---")
os.chdir("/workspace/DiffSinger")
subprocess.run("PYTHONPATH=. python scripts/binarize.py --config configs/vocalido_gtsinger_en.yaml", shell=True)

print("--- 6. Train ---")
print("Starting training in background...")
subprocess.run("nohup PYTHONPATH=. python scripts/train.py --config configs/vocalido_gtsinger_en.yaml --exp_name vocalido_gtsinger_en --reset > /workspace/train_run.log 2>&1 &", shell=True)
print("✅ Done! Training script triggered.")
