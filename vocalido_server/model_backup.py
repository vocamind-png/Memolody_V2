#!/usr/bin/env python3
"""
🛡️ Vocalido Model Backup & Restore System
===========================================
ป้องกันการสูญหายของ model files เมื่อ RunPod restart

Usage:
    python3 model_backup.py backup    # Backup ไฟล์ขึ้น GCS
    python3 model_backup.py restore   # Restore ไฟล์จาก GCS (ถ้าหาย)
    python3 model_backup.py check     # เช็คว่าไฟล์ครบหรือไม่
"""

import os
import sys
import json
import hashlib

# ──────────────────────────────────────────────────────
# CONFIG — ไฟล์สำคัญทั้งหมดที่ต้อง backup
# ──────────────────────────────────────────────────────

GCS_BUCKET = "memolody-model-backups"
GCS_KEY_PATH = "/workspace/gcs-key.json"
GCS_PREFIX = "vocalido-models"  # folder ใน GCS bucket

# รายการไฟล์ที่ต้อง backup (path บน RunPod → GCS key)
CRITICAL_FILES = {
    # Nico voice model
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/acoustic.onnx": "nico/acoustic.onnx",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/vocoder.onnx": "nico/vocoder.onnx",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/dsconfig.yaml": "nico/dsconfig.yaml",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/phonemes.txt": "nico/phonemes.txt",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/dictionary.txt": "nico/dictionary.txt",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/dictionary-en.txt": "nico/dictionary-en.txt",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/nico_vocos_v1.phonemes.json": "nico/nico_vocos_v1.phonemes.json",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/nico_vocos_v1.languages.json": "nico/nico_vocos_v1.languages.json",
    
    # Lotte V voice model (all files in dsmain + dsvocoder + dsdur + dspitch)
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/acoustic.onnx": "lotte_v/dsmain/acoustic.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/linguistic.onnx": "lotte_v/dsmain/linguistic.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/dictionary.txt": "lotte_v/dsmain/dictionary.txt",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/phonemes.txt": "lotte_v/dsmain/phonemes.txt",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsvocoder/aidolgan.onnx": "lotte_v/dsvocoder/aidolgan.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsdur/dur.onnx": "lotte_v/dsdur/dur.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dspitch/pitch.onnx": "lotte_v/dspitch/pitch.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dspitch/linguistic.onnx": "lotte_v/dspitch/linguistic.onnx",
    
    # Nico training checkpoint (latest)
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/model_ckpt_steps_160000.ckpt": "nico_training/model_ckpt_steps_160000.ckpt",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/config.yaml": "nico_training/config.yaml",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/dictionary-en.txt": "nico_training/dictionary-en.txt",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/spk_map.json": "nico_training/spk_map.json",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/lang_map.json": "nico_training/lang_map.json",
    
    # Nico exported model (original)
    "/workspace/diffsinger_training/nico_voicebank/nico_vocos_v1.nico.onnx": "nico_exported/nico_vocos_v1.nico.onnx",
    "/workspace/diffsinger_training/nico_voicebank/dsconfig.yaml": "nico_exported/dsconfig.yaml",
    "/workspace/diffsinger_training/nico_voicebank/nico_vocos_v1.phonemes.json": "nico_exported/nico_vocos_v1.phonemes.json",
    "/workspace/diffsinger_training/nico_voicebank/nico_vocos_v1.languages.json": "nico_exported/nico_vocos_v1.languages.json",
    "/workspace/diffsinger_training/nico_voicebank/dictionary-en.txt": "nico_exported/dictionary-en.txt",
    
    # GCS service account key (critical!)
    "/workspace/gcs-key.json": "config/gcs-key.json",
}

# Speaker embed files (auto-discovered)
EMBED_BASE = "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/embeds/acoustic"

def get_gcs_client():
    from google.cloud import storage
    client = storage.Client.from_service_account_json(GCS_KEY_PATH)
    return client

def ensure_bucket(client):
    """Create bucket if it doesn't exist."""
    try:
        bucket = client.get_bucket(GCS_BUCKET)
        print(f"✅ Bucket '{GCS_BUCKET}' exists")
        return bucket
    except Exception:
        print(f"📦 Creating bucket '{GCS_BUCKET}'...")
        bucket = client.create_bucket(GCS_BUCKET, location="asia-southeast1")
        print(f"✅ Bucket '{GCS_BUCKET}' created")
        return bucket

def file_md5(path):
    """Calculate MD5 of a file."""
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()

def discover_embed_files():
    """Auto-discover .emb files for Lotte V."""
    extra = {}
    if os.path.exists(EMBED_BASE):
        for f in os.listdir(EMBED_BASE):
            if f.endswith('.emb'):
                local_path = os.path.join(EMBED_BASE, f)
                gcs_key = f"lotte_v/dsmain/embeds/acoustic/{f}"
                extra[local_path] = gcs_key
    return extra

def get_all_files():
    """Get all files including auto-discovered ones."""
    all_files = dict(CRITICAL_FILES)
    all_files.update(discover_embed_files())
    return all_files

def cmd_backup():
    """Backup all critical files to GCS."""
    print("=" * 60)
    print("🔒 VOCALIDO MODEL BACKUP")
    print("=" * 60)
    
    client = get_gcs_client()
    bucket = ensure_bucket(client)
    all_files = get_all_files()
    
    uploaded = 0
    skipped = 0
    missing = 0
    
    for local_path, gcs_key in sorted(all_files.items()):
        gcs_path = f"{GCS_PREFIX}/{gcs_key}"
        
        if not os.path.exists(local_path):
            print(f"  ⚠️  MISSING: {os.path.basename(local_path)}")
            missing += 1
            continue
        
        size_mb = os.path.getsize(local_path) / (1024 * 1024)
        
        # Check if already uploaded with same hash
        blob = bucket.blob(gcs_path)
        if blob.exists():
            # Check size match (fast check)
            blob.reload()
            if blob.size == os.path.getsize(local_path):
                print(f"  ✓ Already backed up: {gcs_key} ({size_mb:.1f}MB)")
                skipped += 1
                continue
        
        print(f"  📤 Uploading: {gcs_key} ({size_mb:.1f}MB)...")
        blob.upload_from_filename(local_path)
        uploaded += 1
        print(f"     ✅ Done!")
    
    print()
    print(f"📊 Summary: {uploaded} uploaded, {skipped} already backed up, {missing} missing locally")
    print("=" * 60)

def cmd_restore():
    """Restore missing files from GCS."""
    print("=" * 60)
    print("🔄 VOCALIDO MODEL RESTORE")
    print("=" * 60)
    
    client = get_gcs_client()
    
    try:
        bucket = client.get_bucket(GCS_BUCKET)
    except Exception as e:
        print(f"❌ Bucket '{GCS_BUCKET}' not found! Run 'backup' first.")
        return False
    
    all_files = get_all_files()
    restored = 0
    already_ok = 0
    failed = 0
    
    for local_path, gcs_key in sorted(all_files.items()):
        gcs_path = f"{GCS_PREFIX}/{gcs_key}"
        
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            already_ok += 1
            continue
        
        # File is missing — try to restore
        blob = bucket.blob(gcs_path)
        if not blob.exists():
            print(f"  ⚠️  Not in backup: {gcs_key}")
            failed += 1
            continue
        
        # Create directory
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        
        blob.reload()
        size_mb = blob.size / (1024 * 1024)
        print(f"  📥 Restoring: {gcs_key} ({size_mb:.1f}MB)...")
        blob.download_to_filename(local_path)
        restored += 1
        print(f"     ✅ Restored to {local_path}")
    
    print()
    print(f"📊 Summary: {restored} restored, {already_ok} already present, {failed} not in backup")
    print("=" * 60)
    return failed == 0

def cmd_check():
    """Check if all critical files exist."""
    print("=" * 60)
    print("🔍 VOCALIDO MODEL FILE CHECK")
    print("=" * 60)
    
    all_files = get_all_files()
    ok = 0
    missing = 0
    
    for local_path, gcs_key in sorted(all_files.items()):
        if os.path.exists(local_path):
            size_mb = os.path.getsize(local_path) / (1024 * 1024)
            print(f"  ✅ {gcs_key} ({size_mb:.1f}MB)")
            ok += 1
        else:
            print(f"  ❌ MISSING: {gcs_key}")
            print(f"     Expected at: {local_path}")
            missing += 1
    
    print()
    print(f"📊 Summary: {ok} OK, {missing} MISSING")
    if missing > 0:
        print("⚠️  Run 'python3 model_backup.py restore' to restore missing files")
    else:
        print("🎉 All files are present!")
    print("=" * 60)
    return missing == 0

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    cmd = sys.argv[1].lower()
    if cmd == "backup":
        cmd_backup()
    elif cmd == "restore":
        cmd_restore()
    elif cmd == "check":
        cmd_check()
    else:
        print(f"Unknown command: {cmd}")
        print("Use: backup, restore, or check")
        sys.exit(1)
