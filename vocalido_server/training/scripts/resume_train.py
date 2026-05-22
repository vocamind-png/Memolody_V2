import os, glob, subprocess

def run_cmd(cmd):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

os.chdir("/workspace/DiffSinger")

# Binarize
print("=== Starting Binarization ===")
run_cmd("PYTHONPATH=. python scripts/binarize.py --config configs/vocalido_jianpu.yaml")
print("Binarize complete!")

# Train
print("=== Starting Training (will run for ~120k steps) ===")
run_cmd("PYTHONPATH=. python scripts/train.py --config configs/vocalido_jianpu.yaml --exp_name vocalido_jianpu")

# Upload
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
