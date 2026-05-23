import os
import io
import base64
import sys
import time
import soundfile as sf
import numpy as np

try:
    import runpod
except ImportError:
    print("Warning: runpod package not found. (Safe to ignore if not running on RunPod)")
    runpod = None

# ── Lazy Engine Initialization ──────────────────────────────────────────────
# We lazy-load the engine so the worker can report READY immediately,
# and then initialise when the first job arrives.
# ── Model Directory Discovery ───────────────────────────────────────────────
# Priority: 1) ENV override  2) RunPod network volume  3) Embedded in Docker image
_MODEL_SEARCH_PATHS = [
    os.environ.get("MODEL_DIR", ""),
    "/runpod-volume/english_voicebanks/Lotte_V_AI_dol",
    "/app/checkpoints/Lotte_V_AI_dol",
    "/app/checkpoints/tiger_v106",
    "/app/checkpoints/vocalido_v3",
    "/app/checkpoints/vocalido_v1",
]

MODEL_DIR = None
for _p in _MODEL_SEARCH_PATHS:
    if _p and os.path.exists(_p):
        # Verify it actually has model files
        _has_onnx = any(f.endswith('.onnx') for r, d, fs in os.walk(_p) for f in fs)
        if _has_onnx:
            MODEL_DIR = _p
            break

if not MODEL_DIR:
    MODEL_DIR = os.environ.get("MODEL_DIR", "/runpod-volume/english_voicebanks/Lotte_V_AI_dol")
    print(f"[RunPod Handler] ⚠️ No model directory with ONNX files found! Falling back to: {MODEL_DIR}")
else:
    print(f"[RunPod Handler] ✅ Found model at: {MODEL_DIR}")
engine = None
engine_error = None

def _get_engine():
    """Lazy-init the DiffSinger engine on first request."""
    global engine, engine_error
    if engine is not None:
        return engine
    if engine_error is not None:
        return None  # already failed once
    
    print(f"[RunPod Handler] Initializing DiffSinger engine from {MODEL_DIR}...")
    
    # Check if model directory exists
    if not os.path.exists(MODEL_DIR):
        engine_error = f"Model directory not found: {MODEL_DIR}"
        # List what IS available for debugging
        for probe in ["/runpod-volume", "/app", "/workspace"]:
            if os.path.exists(probe):
                try:
                    contents = os.listdir(probe)
                    print(f"[RunPod Handler] {probe}/ contains: {contents[:20]}")
                except:
                    pass
        print(f"[RunPod Handler] ❌ {engine_error}")
        return None
    
    # List model directory contents for debugging
    try:
        print(f"[RunPod Handler] Model dir contents: {os.listdir(MODEL_DIR)}")
        for root, dirs, files in os.walk(MODEL_DIR):
            level = root.replace(MODEL_DIR, '').count(os.sep)
            if level < 3:
                indent = ' ' * 2 * level
                print(f"[RunPod Handler]   {indent}{os.path.basename(root)}/")
                for f in files[:10]:
                    print(f"[RunPod Handler]   {indent}  {f}")
    except Exception as e:
        print(f"[RunPod Handler] Error listing model dir: {e}")
    
    try:
        from ds_onnx_engine import DiffSingerONNXEngine
        engine = DiffSingerONNXEngine(MODEL_DIR, language='en')
        if not engine.is_ready:
            engine_error = f"Engine loaded but not ready (missing ONNX files in {MODEL_DIR})"
            engine = None
            print(f"[RunPod Handler] ❌ {engine_error}")
            return None
        print(f"[RunPod Handler] ✅ Engine ready! SR={engine.sr}")
        return engine
    except Exception as e:
        engine_error = f"Engine init failed: {e}"
        print(f"[RunPod Handler] ❌ {engine_error}")
        import traceback
        traceback.print_exc()
        return None


def numpy_to_base64_wav(audio_np, sr=44100):
    buffer = io.BytesIO()
    sf.write(buffer, audio_np, sr, format='WAV')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def handler(job):
    job_input = job.get('input', {})
    
    notes = job_input.get('notes', [])
    params = job_input.get('params', {})
    return_stems = str(params.get("return_stems", "false")).lower() == "true"
    
    # Lazy-init the engine
    eng = _get_engine()
    if eng is None:
        return {
            "error": engine_error or "Engine not available",
            "model_dir": MODEL_DIR,
            "model_dir_exists": os.path.exists(MODEL_DIR),
        }
    
    try:
        print(f"[RunPod Handler] Processing job with {len(notes)} notes...")
        result = eng.synthesize_phrase(notes, params)
        
        if result is None:
            return {"error": "Synthesis returned None (possibly empty track or failure)"}
            
        audio_b64 = None
        stems_b64 = []
        
        if return_stems and isinstance(result, tuple):
            main_audio, stems_audio = result
            audio_b64 = numpy_to_base64_wav(main_audio, eng.sr)
            stems_b64 = [numpy_to_base64_wav(s, eng.sr) for s in stems_audio]
        else:
            if isinstance(result, tuple):
                audio = result[0]
            else:
                audio = result
            audio_b64 = numpy_to_base64_wav(audio, eng.sr)
            
        print("[RunPod Handler] Synthesis complete. Returning base64 audio.")
        audio_len = len(result[0] if isinstance(result, tuple) else result)
        
        return {
            "audio_b64": audio_b64,
            "mime_type": "audio/wav",
            "stems_b64": stems_b64,
            "duration": float(audio_len) / eng.sr,
            "engine": "diffsinger_onnx_runpod"
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


if __name__ == "__main__":
    if runpod is not None:
        print(f"[RunPod Handler] Starting RunPod Serverless worker...")
        print(f"[RunPod Handler] MODEL_DIR = {MODEL_DIR}")
        print(f"[RunPod Handler] MODEL_DIR exists = {os.path.exists(MODEL_DIR)}")
        # List volumes for debugging
        for probe in ["/runpod-volume", "/app", "/workspace"]:
            if os.path.exists(probe):
                try:
                    print(f"[RunPod Handler] {probe}/ = {os.listdir(probe)[:15]}")
                except:
                    pass
        runpod.serverless.start({"handler": handler})
    else:
        print("[RunPod Handler] `runpod` package missing. Cannot start serverless worker.")
