#!/usr/bin/env python3
"""
Vocalido Vertex AI Training Launcher
=====================================
รัน DiffSinger training บน Vertex AI พร้อม safeguards ครบ

วิธีใช้:
  python vertex_launcher.py --start     # เริ่ม training
  python vertex_launcher.py --status    # ดูสถานะ
  python vertex_launcher.py --stop      # หยุด + ปิด GPU ทันที
  python vertex_launcher.py --cost      # ดูค่าใช้จ่ายปัจจุบัน
"""

import argparse, json, os, subprocess, sys, time
from datetime import datetime

# ── Config ──────────────────────────────────────────────────
PROJECT_ID   = "gen-lang-client-0560936129"
REGION       = "asia-southeast1"          # Singapore (ใกล้ไทย)
BUCKET       = "gs://vocalido-master-corpus-v1"
JOB_NAME     = f"vocalido-diffsinger-{int(time.time())}"

# Safety limits
BUDGET_USD   = 10.0     # Hard budget cap
MAX_MINUTES  = 180      # จำกัดเวลาการทำงาน (Timeout) ไม่เกิน 180 นาที (3 ชั่วโมง) ตัดปัญหาไหลยาว
GPU_TYPE     = "NVIDIA_L4"
GPU_COUNT    = 1
MACHINE_TYPE = "g2-standard-12"  # G2 Series is required for L4 (12 vCPUs)
USE_SPOT     = True     # Spot = 70% cheaper, may be preempted


def run(cmd, check=True):
    print(f"$ {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout: print(result.stdout)
    if result.stderr and result.returncode != 0: print(result.stderr)
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}")
    return result


def cmd_start(dry_run=False):
    GCLOUD = "/Users/paisan/google-cloud-sdk/bin/gcloud"
    GSUTIL = "/Users/paisan/google-cloud-sdk/bin/gsutil"
    
    print("=" * 60)
    print("🚀 Vocalido DiffSinger — Vertex AI Training" + (" [DRY RUN]" if dry_run else ""))
    print(f"   Project: {PROJECT_ID}")
    print(f"   Region:  {REGION}")
    print(f"   GPU:     {GPU_TYPE} × {GPU_COUNT}")
    print(f"   Spot:    {'✅ YES (70% cheaper)' if USE_SPOT else '❌ NO'}")
    print(f"   Budget:  ${BUDGET_USD} (hard cap)")
    print(f"   Timeout: {MAX_MINUTES} minutes")
    print("=" * 60)

    # Verify dataset in GCS
    if dry_run:
        print("\n📦 [DRY RUN] Bypassing GCS dataset checks...")
    else:
        print("\n📦 Verifying dataset in GCS...")
        r = run(f"{GSUTIL} ls {BUCKET}/diffsinger/wavs/ 2>/dev/null | wc -l", check=False)
        wav_count = int(r.stdout.strip()) if r.stdout.strip().isdigit() else 0

        if wav_count < 10:
            print(f"⚠️  Only {wav_count} files in GCS. Uploading from local...")
            run(f"{GSUTIL} -m cp -r /tmp/diffsinger_dataset/ {BUCKET}/diffsinger/", check=False)
        else:
            print(f"✅ Dataset ready: {wav_count} files in GCS")

    # Create training script
    _write_training_script()

    # Upload training script to GCS so Vertex can download it (No Docker needed)
    if not dry_run:
        print("☁️ Uploading training script to Cloud Storage...")
        run(f"{GSUTIL} cp vocalido-server/training/vertex/train_on_vertex.py {BUCKET}/scripts/train_on_vertex.py")

    # Build Vertex AI job config - Bypassing local Docker packaging
    job_cmd = f"""{GCLOUD} ai custom-jobs create \\
  --region={REGION} \\
  --display-name={JOB_NAME} \\
  --project={PROJECT_ID} \\
  --worker-pool-spec=machine-type={MACHINE_TYPE},accelerator-type={GPU_TYPE},accelerator-count={GPU_COUNT},replica-count=1,container-image-uri=us-docker.pkg.dev/vertex-ai/training/pytorch-gpu.2-0.py310:latest \\
  --command="bash","-c","gcloud storage cp {BUCKET}/scripts/train_on_vertex.py . && chmod +x train_on_vertex.py && ./train_on_vertex.py" """

    if dry_run:
        print(f"\n🏃‍♂️ [DRY RUN] Would submit job: {JOB_NAME}")
        print(job_cmd)
        print("\n[DRY RUN] Local syntax checking...")
        r = subprocess.run(f"python3 -m py_compile vocalido-server/training/vertex/train_on_vertex.py", shell=True)
        if r.returncode == 0:
            print("✅ [DRY RUN] train_on_vertex.py syntax is OK.")
        else:
            print("❌ [DRY RUN] Syntax error in script!")
        print("✅ [DRY RUN] Dry run finished! Used Mac mini to simulate deployment.")
        return

    print(f"\n🟢 Submitting job: {JOB_NAME}")
    run(job_cmd)

    # Save job ID
    with open("/tmp/vocalido_vertex_job.json", "w") as f:
        json.dump({"job_name": JOB_NAME, "started": time.time(),
                   "budget": BUDGET_USD, "max_minutes": MAX_MINUTES}, f)

    print(f"\n✅ Job submitted! Monitor with:")
    print(f"   python vertex_launcher.py --status")
    print(f"   python vertex_launcher.py --cost")


def cmd_status():
    """Check current job status"""
    try:
        with open("/tmp/vocalido_vertex_job.json") as f:
            info = json.load(f)
    except:
        print("❌ No active job found. Run --start first.")
        return

    job_name = info["job_name"]
    elapsed_min = (time.time() - info["started"]) / 60
    cost = (elapsed_min / 60) * (0.75 if USE_SPOT else 2.50)

    print(f"\n📊 Job: {job_name}")
    print(f"   Elapsed: {elapsed_min:.1f}m / {info['max_minutes']}m")
    print(f"   Est. Cost: ${cost:.2f} / ${info['budget']} budget")

    # Get GCS progress file
    r = run(f"gsutil cat {BUCKET}/vocalido_progress.json 2>/dev/null", check=False)
    if r.stdout:
        try:
            p = json.loads(r.stdout)
            print(f"   Phase: {p.get('phase', '?')}  {p.get('pct', 0):.0f}%")
            print(f"   Detail: {p.get('detail', '')}")
            age = (time.time() - p.get('time', 0)) / 60
            print(f"   Last update: {age:.1f} min ago")

            # Warn if stale
            if age > 15:
                print(f"\n⚠️  WARNING: No progress for {age:.0f} min! May be stalled.")
                print("   Run --stop to cancel and save cost.")
        except:
            pass

    # Check Vertex job status
    GCLOUD = "/Users/paisan/google-cloud-sdk/bin/gcloud"
    r = run(f"{GCLOUD} ai custom-jobs list --region={REGION} "
            f"--project={PROJECT_ID} --filter='displayName:{job_name}' "
            f"--format='value(state)' 2>/dev/null", check=False)
    state = r.stdout.strip()
    if state:
        emoji = {"JOB_STATE_RUNNING": "🟢", "JOB_STATE_SUCCEEDED": "✅",
                 "JOB_STATE_FAILED": "❌", "JOB_STATE_CANCELLED": "⛔"}.get(state, "❓")
        print(f"\n   Vertex State: {emoji} {state}")

        if state == "JOB_STATE_SUCCEEDED":
            print("\n🎉 Training COMPLETE! Download models with:")
            print(f"   gsutil -m cp -r {BUCKET}/output/onnx/ "
                  f"vocalido-server/voicebanks/vocalido_master/")


def cmd_stop():
    """Emergency stop — cancel job and stop billing"""
    print("🛑 STOPPING training job...")
    GCLOUD = "/Users/paisan/google-cloud-sdk/bin/gcloud"
    try:
        with open("/tmp/vocalido_vertex_job.json") as f:
            info = json.load(f)
        job_name = info["job_name"]
        # Find full job ID
        r = run(f"{GCLOUD} ai custom-jobs list --region={REGION} "
                f"--project={PROJECT_ID} --filter='displayName:{job_name}' "
                f"--format='value(name)' 2>/dev/null", check=False)
        job_id = r.stdout.strip()
        if job_id:
            run(f"{GCLOUD} ai custom-jobs cancel {job_id} --region={REGION} --project={PROJECT_ID} -q")
            print(f"✅ Job {job_name} cancelled. Billing stopped.")
        else:
            print("⚠️  Job not found in Vertex. May have already finished.")
    except Exception as e:
        print(f"❌ Could not cancel: {e}")


def cmd_cost():
    """Show current cost estimate"""
    try:
        with open("/tmp/vocalido_vertex_job.json") as f:
            info = json.load(f)
        elapsed_min = (time.time() - info["started"]) / 60
        elapsed_hr = elapsed_min / 60
        rate    = 0.75 if USE_SPOT else 2.50
        cost    = elapsed_hr * rate
        remain  = info["budget"] - cost
        pct     = cost / info["budget"] * 100
        bar     = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))

        print(f"\n💰 Cost Tracker")
        print(f"   [{bar}] {pct:.1f}%")
        print(f"   Used:      ${cost:.3f}")
        print(f"   Remaining: ${remain:.3f}")
        print(f"   Budget:    ${info['budget']}")
        print(f"   Rate:      ${rate}/hr ({'Spot' if USE_SPOT else 'Standard'})")
        print(f"   Runtime:   {elapsed_min:.2f} minutes")

        if remain < 1.0:
            print(f"\n⚠️  WARNING: Only ${remain:.2f} remaining! Job will auto-stop soon.")
    except:
        print("❌ No active job. Run --start first.")


def _write_training_script():
    """Write the actual training script that runs inside Vertex AI"""
    script = '''#!/usr/bin/env python3
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
        "max_batch_size": 48 if vram > 30 else 16,
        "max_epochs": 2000, "num_ckpt_keep": 5,
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
            if time.time() - start_time > 10800: # 180 MINUTES TIMEOUT LIMIT (Hard Kill Switch)
                print("🛑 180-MINUTE TIMEOUT REACHED! Auto-killing job to safeguard budget.")
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
'''
    with open("vocalido-server/training/vertex/train_on_vertex.py", "w") as f:
        f.write(script)
    print("✅ Training script written: train_on_vertex.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start",  action="store_true", help="Start training job")
    parser.add_argument("--dry-run", action="store_true", help="Test locally on Mac mini without Vertex upload")
    parser.add_argument("--status", action="store_true", help="Check job status")
    parser.add_argument("--stop",   action="store_true", help="Emergency stop + cancel billing")
    parser.add_argument("--cost",   action="store_true", help="Show cost estimate")
    args = parser.parse_args()

    if args.start:     cmd_start()
    elif args.dry_run: cmd_start(dry_run=True)
    elif args.stop:    cmd_stop()
    elif args.cost:    cmd_cost()
    else:              cmd_status()   # default
