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

# CRITICAL: The server scans 'english_voicebanks/' at the PROJECT ROOT (one level above vocalido_server/)
# NOT 'vocalido_server/voicebanks/'. The model MUST be placed here to be discovered.
project_root = os.path.dirname(os.path.dirname(__file__))
base_dir = os.path.join(project_root, "english_voicebanks", "Lotte_V_AI_dol")
os.makedirs(base_dir, exist_ok=True)

print(f"📥 Downloading Lotte V AI model to {base_dir}...")

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

print("✨ Done downloading Lotte V models.")
