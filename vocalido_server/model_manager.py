import os
import requests
from pathlib import Path

# Base directory where model checkpoints are stored
CHECKPOINTS_DIR = Path(__file__).parent / "checkpoints"

# Mapping of model identifiers to download URLs (replace with real URLs)
MODEL_URLS = {
    "vocalido_v1": "https://my-bucket.s3.amazonaws.com/vocalido_v1.ckpt",
    "light_qwen": "https://my-bucket.s3.amazonaws.com/light_qwen.onnx",
    "light_gemma": "https://my-bucket.s3.amazonaws.com/light_gemma.onnx",
    "vocalido_v1_cloud": ""   # cloud‑only, ไม่ต้องดาวน์โหลด
}


def ensure_checkpoints_dir():
    """Create the checkpoints directory if it does not exist."""
    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)

def download_model(model_name: str) -> str:
    """Download the specified model into the checkpoints directory.

    Returns a status message that can be sent to the client.
    """
    if model_name not in MODEL_URLS:
        return f"❌ Unknown model '{model_name}'."
    url = MODEL_URLS[model_name]
    if not url:
        return f"ℹ️ Model '{model_name}' is cloud‑only; no local download needed."

    target_dir = CHECKPOINTS_DIR / model_name
    target_dir.mkdir(parents=True, exist_ok=True)

    # Determine filename from URL
    filename = url.split('/')[-1]
    target_path = target_dir / filename

    if target_path.is_file():
        return f"✅ Model '{model_name}' already exists at {target_path}."

    try:
        with requests.get(url, stream=True, timeout=30) as r:
            r.raise_for_status()
            total = int(r.headers.get('content-length', 0))
            downloaded = 0
            with open(target_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
        return f"✅ Downloaded '{model_name}' ({downloaded / (1024*1024):.2f} MiB) to {target_path}."
    except Exception as e:
        return f"❌ Failed to download '{model_name}': {e}"
