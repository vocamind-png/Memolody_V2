#!/usr/bin/env python3
import json, csv, shutil, os, re, subprocess, sys
from pathlib import Path

WORK = Path("/workspace")
DS_DIR = WORK / "DiffSinger"
GT_DIR = WORK / "gtsinger_en"
EXP_NAME = "vocalido_gtsinger_en"
DS_DATA = DS_DIR / "data" / "raw" / EXP_NAME
DS_WAV = DS_DATA / "wavs"
CKPT_OUT = DS_DIR / "checkpoints" / EXP_NAME

def run(cmd):
    print(f"\n$ {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=str(DS_DIR))
    if r.returncode != 0:
        print(f"❌ FAILED: {cmd}")
        sys.exit(1)

print("=== STEP 1: Process GTSinger Data ===")
DS_WAV.mkdir(parents=True, exist_ok=True)
CKPT_OUT.mkdir(parents=True, exist_ok=True)

json_files = list(GT_DIR.rglob("*.json"))
print(f"Found {len(json_files)} JSON files")

rows = []
for jf in json_files:
    wav_file = jf.with_suffix(".wav")
    if not wav_file.exists():
        continue
        
    try:
        with open(jf, "r") as f:
            data = json.load(f)
            
        ph_seq = []
        ph_dur = []
        
        for item in data:
            phs = item.get("ph", [])
            starts = item.get("ph_start", [])
            ends = item.get("ph_end", [])
            
            for p, s, e in zip(phs, starts, ends):
                # Clean phoneme: <AP> -> AP, AH2 -> AH
                p = p.strip("<>")
                if p not in ["AP", "SP"]:
                    p = re.sub(r'\d', '', p).lower() # Lowercase ARPAbet matches typical OpenVPI english.txt or keep upper?
                    # DiffSinger english.txt usually uses uppercase ARPAbet or lowercase. Let's keep original case but strip digits.
                    # Wait, DiffSinger's english.txt usually uses uppercase for ARPAbet (e.g. AH, T) or lowercase (ah, t).
                    # Actually, OpenVPI uses lowercase for most English phonemes. Let's just strip digits and keep uppercase.
                    p = re.sub(r'\d', '', p).upper()
                
                dur = round(float(e) - float(s), 4)
                if dur <= 0:
                    dur = 0.01 # minimum duration
                
                ph_seq.append(p)
                ph_dur.append(str(dur))
                
        if not ph_seq:
            continue
            
        name = f"gtsinger_{len(rows):04d}"
        
        # Copy WAV
        shutil.copy2(wav_file, DS_WAV / f"{name}.wav")
        
        rows.append({
            "name": name,
            "ph_seq": " ".join(ph_seq),
            "ph_dur": " ".join(ph_dur),
            "spk_name": "vocalido"
        })
    except Exception as e:
        print(f"Error processing {jf}: {e}")

print(f"✅ Extracted {len(rows)} audio files with phoneme annotations.")

if not rows:
    print("❌ No data processed!")
    sys.exit(1)

with open(DS_DATA / "transcriptions.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["name", "ph_seq", "ph_dur", "spk_name"])
    w.writeheader()
    w.writerows(rows)

print("=== STEP 2: Setup Config and Checkpoints ===")
import yaml

with open(CKPT_OUT / "spk_map.json", "w") as f:
    json.dump({"vocalido": 0}, f)

cfg = {
    "base_config": "configs/acoustic.yaml",
    "exp_name": EXP_NAME,
    "work_dir": str(CKPT_OUT),
    "datasets": [
        {
            "speaker": "vocalido",
            "language": "english",
            "raw_data_dir": str(DS_DATA),
            "spk_id": 0
        }
    ],
    "binary_data_dir": f"data/binary/{EXP_NAME}",
    "dict_dir": "dictionaries",
    "dictionaries": [
        {
            "language": "english",
            "dictionary": "english.txt"
        }
    ],
    "singers": [{"name": "vocalido", "type": "utterance"}],
    "test_prefixes": [rows[0]["name"]],
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
    "hnsep": None,
    "use_energy_embed": False,
    "use_breathiness_embed": False,
    "use_tension_embed": False,
    "val_with_vocoder": False,
    "vocoder": "NsfHifiGAN",
    "vocoder_ckpt": "checkpoints/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02/model.ckpt",
}
cfg_path = DS_DIR / "configs" / f"{EXP_NAME}.yaml"
with open(cfg_path, "w") as f:
    yaml.safe_dump(cfg, f)

print("=== STEP 3: Binarize ===")
os.chdir(DS_DIR)
run(f"PYTHONPATH=. python scripts/binarize.py --config configs/{EXP_NAME}.yaml")

print("=== STEP 4: Train ===")
run(f"PYTHONPATH=. python scripts/train.py --config configs/{EXP_NAME}.yaml --exp_name {EXP_NAME} --reset")

print("=== DONE ===")
