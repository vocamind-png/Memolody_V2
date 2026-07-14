#!/usr/bin/env python3
"""
🛡️ Vocalido Model Backup & Restore System
===========================================
ป้องกันการสูญหายของ model files เมื่อ RunPod restart
ใช้ Hugging Face Hub เป็น backup storage (ฟรี, unlimited สำหรับ models)

Setup ครั้งแรก:
    pip install huggingface_hub
    huggingface-cli login  # ใส่ token จาก https://huggingface.co/settings/tokens

Usage:
    python3 model_backup.py backup    # Backup ไฟล์ขึ้น HuggingFace
    python3 model_backup.py restore   # Restore ไฟล์จาก HuggingFace (ถ้าหาย)
    python3 model_backup.py check     # เช็คว่าไฟล์ครบหรือไม่
"""

import os
import sys

# ──────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────
HF_REPO = "vocamind/vocalido-models"  # Hugging Face repo
HF_TOKEN_PATH = "/workspace/.hf_token"  # Optional: store token in file

# รายการไฟล์สำคัญที่ต้อง backup (local path → HF filename)
CRITICAL_FILES = {
    # ── Nico voice model (production) ──
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/acoustic.onnx": "nico/acoustic.onnx",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/vocoder.onnx": "nico/vocoder.onnx",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/dsconfig.yaml": "nico/dsconfig.yaml",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/phonemes.txt": "nico/phonemes.txt",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/dictionary.txt": "nico/dictionary.txt",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/dictionary-en.txt": "nico/dictionary-en.txt",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/nico_vocos_v1.phonemes.json": "nico/nico_vocos_v1.phonemes.json",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/nico_vocos_v1.languages.json": "nico/nico_vocos_v1.languages.json",
    "/workspace/Memolody_V2/vocalido_server/voicebanks/nico/vocoder_vocos.onnx": "nico/vocoder_vocos.onnx",

    # ── Vocos vocoder checkpoint (for re-export) ──
    "/workspace/diffsinger_training/vocos/checkpoints/vocos_44khz.ckpt": "vocos_training/vocos_44khz.ckpt",

    # ── Lotte V voice model ──
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/acoustic.onnx": "lotte_v/dsmain/acoustic.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/linguistic.onnx": "lotte_v/dsmain/linguistic.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/dictionary.txt": "lotte_v/dsmain/dictionary.txt",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/phonemes.txt": "lotte_v/dsmain/phonemes.txt",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsvocoder/aidolgan.onnx": "lotte_v/dsvocoder/aidolgan.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsdur/dur.onnx": "lotte_v/dsdur/dur.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dspitch/pitch.onnx": "lotte_v/dspitch/pitch.onnx",
    "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dspitch/linguistic.onnx": "lotte_v/dspitch/linguistic.onnx",

    # ── Nico training checkpoint (latest only) ──
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/model_ckpt_steps_160000.ckpt": "nico_training/model_ckpt_steps_160000.ckpt",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/config.yaml": "nico_training/config.yaml",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/dictionary-en.txt": "nico_training/dictionary-en.txt",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/spk_map.json": "nico_training/spk_map.json",
    "/workspace/diffsinger_training/DiffSinger/checkpoints/nico_vocos_v1/lang_map.json": "nico_training/lang_map.json",

    # ── Nico original exported model ──
    "/workspace/diffsinger_training/nico_voicebank/nico_vocos_v1.nico.onnx": "nico_exported/nico_vocos_v1.nico.onnx",
    "/workspace/diffsinger_training/nico_voicebank/dsconfig.yaml": "nico_exported/dsconfig.yaml",
    "/workspace/diffsinger_training/nico_voicebank/nico_vocos_v1.phonemes.json": "nico_exported/nico_vocos_v1.phonemes.json",
    "/workspace/diffsinger_training/nico_voicebank/nico_vocos_v1.languages.json": "nico_exported/nico_vocos_v1.languages.json",
    "/workspace/diffsinger_training/nico_voicebank/dictionary-en.txt": "nico_exported/dictionary-en.txt",
}

# Speaker embed directory
EMBED_BASE = "/workspace/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/embeds/acoustic"


def get_hf_token():
    """Get HuggingFace token from file or environment."""
    if os.path.exists(HF_TOKEN_PATH):
        with open(HF_TOKEN_PATH) as f:
            return f.read().strip()
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")


def discover_embed_files():
    """Auto-discover .emb speaker embed files."""
    extra = {}
    if os.path.exists(EMBED_BASE):
        for f in os.listdir(EMBED_BASE):
            if f.endswith('.emb'):
                local_path = os.path.join(EMBED_BASE, f)
                extra[local_path] = f"lotte_v/dsmain/embeds/acoustic/{f}"
    return extra


def get_all_files():
    """Get all files including auto-discovered embeds."""
    all_files = dict(CRITICAL_FILES)
    all_files.update(discover_embed_files())
    return all_files


def cmd_check():
    """Check which critical files exist locally."""
    print("=" * 60)
    print("🔍 VOCALIDO MODEL FILE CHECK")
    print("=" * 60)

    all_files = get_all_files()
    ok = missing = 0

    for local_path, hf_key in sorted(all_files.items(), key=lambda x: x[1]):
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            size_mb = os.path.getsize(local_path) / (1024 * 1024)
            print(f"  ✅ {hf_key} ({size_mb:.1f}MB)")
            ok += 1
        else:
            print(f"  ❌ MISSING: {hf_key}")
            missing += 1

    print()
    print(f"📊 Summary: {ok} OK, {missing} MISSING")
    if missing > 0:
        print("⚠️  Run 'python3 model_backup.py restore' to restore missing files")
    else:
        print("🎉 All files are present!")
    print("=" * 60)
    return missing == 0


def cmd_backup():
    """Upload all critical files to Hugging Face Hub."""
    from huggingface_hub import HfApi, create_repo
    print("=" * 60)
    print("🔒 VOCALIDO MODEL BACKUP → Hugging Face")
    print("=" * 60)

    token = get_hf_token()
    api = HfApi(token=token)

    # Create repo if needed (private)
    try:
        create_repo(HF_REPO, repo_type="model", private=True, token=token, exist_ok=True)
        print(f"✅ Repo '{HF_REPO}' ready")
    except Exception as e:
        print(f"⚠️  Repo creation: {e}")

    all_files = get_all_files()
    uploaded = skipped = missing = 0

    for local_path, hf_path in sorted(all_files.items(), key=lambda x: x[1]):
        if not os.path.exists(local_path):
            print(f"  ⚠️  MISSING locally: {hf_path}")
            missing += 1
            continue

        size_mb = os.path.getsize(local_path) / (1024 * 1024)

        # Check if already uploaded with same size
        try:
            info = api.hf_hub_url(HF_REPO, hf_path, repo_type="model")
            meta = api.get_paths_info(HF_REPO, [hf_path], repo_type="model")
            if meta and len(meta) > 0:
                remote_size = meta[0].size if hasattr(meta[0], 'size') else 0
                if remote_size == os.path.getsize(local_path):
                    print(f"  ✓ Already backed up: {hf_path} ({size_mb:.1f}MB)")
                    skipped += 1
                    continue
        except Exception:
            pass  # File doesn't exist on HF yet

        print(f"  📤 Uploading: {hf_path} ({size_mb:.1f}MB)...")
        try:
            api.upload_file(
                path_or_fileobj=local_path,
                path_in_repo=hf_path,
                repo_id=HF_REPO,
                repo_type="model",
                token=token,
            )
            uploaded += 1
            print(f"     ✅ Done!")
        except Exception as e:
            print(f"     ❌ Failed: {e}")

    print()
    print(f"📊 Summary: {uploaded} uploaded, {skipped} already backed up, {missing} missing locally")
    print("=" * 60)


def cmd_restore():
    """Download missing files from Hugging Face Hub."""
    from huggingface_hub import hf_hub_download, HfApi
    print("=" * 60)
    print("🔄 VOCALIDO MODEL RESTORE ← Hugging Face")
    print("=" * 60)

    token = get_hf_token()
    api = HfApi(token=token)
    all_files = get_all_files()
    restored = already_ok = failed = 0

    for local_path, hf_path in sorted(all_files.items(), key=lambda x: x[1]):
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            already_ok += 1
            continue

        # File missing — download from HF
        print(f"  📥 Restoring: {hf_path}...")
        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            downloaded = hf_hub_download(
                repo_id=HF_REPO,
                filename=hf_path,
                repo_type="model",
                token=token,
                local_dir="/tmp/hf_restore",
            )
            # Copy to correct location
            import shutil
            shutil.copy2(downloaded, local_path)
            size_mb = os.path.getsize(local_path) / (1024 * 1024)
            print(f"     ✅ Restored ({size_mb:.1f}MB)")
            restored += 1
        except Exception as e:
            print(f"     ❌ Failed: {e}")
            failed += 1

    print()
    print(f"📊 Summary: {restored} restored, {already_ok} already present, {failed} failed")
    print("=" * 60)
    return failed == 0


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
        ok = cmd_check()
        sys.exit(0 if ok else 1)
    else:
        print(f"Unknown command: {cmd}")
        print("Use: backup, restore, or check")
        sys.exit(1)
