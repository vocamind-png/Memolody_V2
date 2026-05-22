#!/usr/bin/env python3
"""Upload all vocalido_jianpu checkpoints to GCS bucket using google-cloud-storage."""
import os
from google.cloud import storage
from google.oauth2 import service_account

CKPT_DIR = "/workspace/DiffSinger/checkpoints/vocalido_jianpu"
BUCKET_NAME = "vocalido-master-corpus-v1"
GCS_PREFIX = "training/checkpoints/vocalido_jianpu"
KEY_PATH = "/workspace/DiffSinger_Workspace/gcs_runpod_key.json"

print("=== Authenticating to GCS ===")
credentials = service_account.Credentials.from_service_account_file(KEY_PATH)
client = storage.Client(credentials=credentials)
bucket = client.bucket(BUCKET_NAME)

files_to_upload = [
    "model_ckpt_steps_80000.ckpt",
    "model_ckpt_steps_100000.ckpt",
    "model_ckpt_steps_120000.ckpt",
    "model_ckpt_steps_140000.ckpt",
    "model_ckpt_steps_160000.ckpt",
    "config.yaml",
    "spk_map.json",
    "lang_map.json",
    "dictionary-zh.txt",
]

for fname in files_to_upload:
    local = os.path.join(CKPT_DIR, fname)
    gcs_path = f"{GCS_PREFIX}/{fname}"
    if os.path.exists(local):
        fsize = os.path.getsize(local) / (1024**3)
        print(f"Uploading {fname} ({fsize:.2f} GB)...")
        blob = bucket.blob(gcs_path)
        blob.upload_from_filename(local, timeout=3600)
        print(f"  ✅ Done: gs://{BUCKET_NAME}/{gcs_path}")
    else:
        print(f"  ⚠️  Skipped (not found): {fname}")

print("\n=== All done! Checkpoints uploaded to GCS ===")
print(f"gs://{BUCKET_NAME}/{GCS_PREFIX}/")
