import os
import requests

bucket_url = "https://storage.googleapis.com/memolody-vault/voicebanks/Lotte_V_AI_dol/Hoshino%20Hanami%20~AIdol~%20for%20DiffSinger%20v1.0"
files = [
    "dsdur/dur.onnx",
    "dsmain/acoustic.onnx",
    "dsmain/dictionary.txt",
    "dsmain/linguistic.onnx",
    "dsmain/phonemes.txt",
    "dsmain/embeds/acoustic/Fragrance.emb",
    "dsmain/embeds/acoustic/Nectar.emb",
    "dsmain/embeds/acoustic/Root.emb",
    "dspitch/linguistic.onnx",
    "dspitch/pitch.onnx",
    "dsvocoder/aidolgan.onnx"
]

# Use absolute path to avoid CWD issues when running from different directories
this_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(this_dir)

# CRITICAL: The server scans 'english_voicebanks/' at the PROJECT ROOT
# (one level above vocalido_server/), NOT inside vocalido_server/.
base_dir = os.path.join(project_root, "english_voicebanks", "Lotte_V_AI_dol")
os.makedirs(base_dir, exist_ok=True)

print(f"📥 Downloading Lotte V AI model to {base_dir}...")
print(f"   (project root: {project_root})")

for f in files:
    url = f"{bucket_url}/{f.replace(' ', '%20')}"
    dest = os.path.join(base_dir, f)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.exists(dest):
        print(f"Downloading {f}...")
        resp = requests.get(url, timeout=120)
        if resp.status_code == 200:
            with open(dest, "wb") as out:
                out.write(resp.content)
            print(f"✅ Saved {f} ({len(resp.content)} bytes)")
        else:
            print(f"❌ Failed to download {f}: HTTP {resp.status_code}")
    else:
        print(f"⏭️  Already exists: {f}")

# Verify the key file exists
acoustic_path = os.path.join(base_dir, "dsmain", "acoustic.onnx")
if os.path.exists(acoustic_path):
    size_mb = os.path.getsize(acoustic_path) / (1024*1024)
    print(f"✅ Verified: acoustic.onnx exists ({size_mb:.1f} MB)")
else:
    print(f"❌ ERROR: acoustic.onnx NOT found at {acoustic_path}")

print("✨ Done downloading Lotte V models.")
