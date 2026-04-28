#!/usr/bin/env python3
"""Training script that runs inside Vertex AI container"""
import os, sys, subprocess, shutil, time, json

def log(msg):
    print(msg, flush=True)

def save_progress(phase_id, pct, detail, running=True):
    import json, time, os
    BUCKET = "gs://vocalido-master-corpus-v1"
    data = {"phase": phase_id, "pct": pct, "detail": detail, "running": running, "time": time.time()}
    with open("vocalido_progress.json", "w") as f: json.dump(data, f)
    os.system(f"gsutil cp vocalido_progress.json {BUCKET}/vocalido_progress.json > /dev/null 2>&1")

def run_with_retry(fn, retries=3):
    for i in range(retries):
        if fn() == 0: return
        time.sleep(2)
    raise RuntimeError("Failed after retries")

BUCKET = "gs://vocalido-master-corpus-v1"
DS_DIR = "/content/DiffSinger/data/vocalido"

def main():
    log("🎤 Vocalido DiffSinger Training — Vertex AI")
    save_progress("preparing", 0, "Starting...", True)

    # 1. Install DiffSinger
    run_with_retry(lambda: os.system(
        "git clone https://github.com/openvpi/DiffSinger.git /content/DiffSinger -q "
        "&& pip install -q -r /content/DiffSinger/requirements.txt"
    ))
    save_progress("preparing", 15, "DiffSinger installed", True)

    # 2. Download dataset from GCS (FAST — same Google network)
    os.makedirs(f"{DS_DIR}/wavs", exist_ok=True)
    run_with_retry(lambda: os.system(
        f"gsutil -m cp -r {BUCKET}/diffsinger/wavs/ {DS_DIR}/"
    ))
    n_wav = len([f for f in os.listdir(f"{DS_DIR}/wavs") if f.endswith(".wav")])
    assert n_wav > 0, f"No WAV files downloaded! Check {BUCKET}/diffsinger/"
    log(f"✅ Dataset: {n_wav} WAV files")
    save_progress("preparing", 30, f"{n_wav} WAVs downloaded from GCS", True)

    # 3. MFA Alignment
    os.system("conda install -c conda-forge montreal-forced-aligner -y -q > /dev/null 2>&1")
    run_with_retry(lambda: os.system(
        f"mfa align {DS_DIR}/wavs english_mfa english_mfa {DS_DIR}/textgrids --clean -j 4"
    ))
    save_progress("align", 100, "Alignment done", True)

    # 4. Config + Preprocess
    import yaml, torch
    vram = torch.cuda.get_device_properties(0).total_memory / 1e9
    config = {
        "raw_data_dir": DS_DIR, "binary_data_dir": f"{DS_DIR}_bin",
        "max_batch_size": 128 if vram > 30 else 32, # A100 has huge VRAM
        "max_updates": 60000, # Target steps as requested
        "num_ckpt_keep": 5,
        "lr": 0.0004,
    }
    os.makedirs("/content/DiffSinger/usr/configs", exist_ok=True)
    with open("/content/DiffSinger/usr/configs/vocalido.yaml", "w") as f:
        yaml.dump(config, f)
    os.system("cd /content/DiffSinger && python scripts/binarize.py --config usr/configs/vocalido.yaml")
    save_progress("preprocess", 100, "Binarization done", True)

    # 5. TRAIN with safeguards
    import threading
    def training_monitor():
        """Background thread watching for stall/budget issues"""
        start_time = time.time()
        while True:
            time.sleep(30)
            if time.time() - start_time > 43200: # 12 HOURS (43200s) SAFETY KILL SWITCH
                print("🛑 12-HOUR TIMEOUT REACHED! Auto-killing job to safeguard budget.")
                os._exit(1)
            save_progress("training", -1, "heartbeat", True)  # triggers safety checks

    t = threading.Thread(target=training_monitor, daemon=True)
    t.start()

    os.system("cd /content/DiffSinger && python scripts/train.py "
              "--config usr/configs/vocalido.yaml --exp_name vocalido_v1 --reset")
    save_progress("training", 100, "Training done!", True)

    # 6. Export ONNX + Upload to GCS
    ONNX = "/content/vocalido_onnx"
    os.makedirs(ONNX, exist_ok=True)
    os.system(f"cd /content/DiffSinger && python scripts/export.py --exp_name vocalido_v1 --out {ONNX}")
    os.system(f"gsutil -m cp -r {ONNX}/ {BUCKET}/output/onnx/")
    n = len(os.listdir(ONNX))
    log(f"✅ Exported {n} ONNX models → GCS")
    save_progress("done", 100, f"{n} ONNX models in GCS!", False)

if __name__ == "__main__":
    main()
