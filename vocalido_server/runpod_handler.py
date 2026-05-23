import os
import io
import base64
import soundfile as sf
import numpy as np

try:
    import runpod
except ImportError:
    print("Warning: runpod package not found. (Safe to ignore if not running on RunPod)")
    runpod = None

from ds_onnx_engine import DiffSingerONNXEngine

# 1. Initialize Engine Globally (Cold Start optimization)
# In RunPod, we will mount the network volume to /runpod-volume
# The user will upload their voicebanks into /runpod-volume/english_voicebanks/Lotte_V_AI_dol
MODEL_DIR = os.environ.get("MODEL_DIR", "/runpod-volume/english_voicebanks/Lotte_V_AI_dol")

print(f"[RunPod Handler] Initializing DiffSinger engine from {MODEL_DIR}...")
engine = DiffSingerONNXEngine(MODEL_DIR, language='en')

def numpy_to_base64_wav(audio_np, sr=44100):
    buffer = io.BytesIO()
    sf.write(buffer, audio_np, sr, format='WAV')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

def handler(job):
    job_input = job.get('input', {})
    
    notes = job_input.get('notes', [])
    params = job_input.get('params', {})
    
    # We always return stems if requested, but our engine right now just mixes it if we just use synthesize_phrase
    return_stems = str(params.get("return_stems", "false")).lower() == "true"
    
    if not engine.is_ready:
        return {"error": f"Engine failed to initialize from {MODEL_DIR}. Ensure the Network Volume is mounted correctly and files exist."}
        
    try:
        print(f"[RunPod Handler] Processing job with {len(notes)} notes...")
        # 2. Run Synthesis (returns tuple if return_stems is True)
        result = engine.synthesize_phrase(notes, params)
        
        if result is None:
            return {"error": "Synthesis returned None (possibly empty track or failure)"}
            
        audio_b64 = None
        stems_b64 = []
        
        if return_stems and isinstance(result, tuple):
            main_audio, stems_audio = result
            audio_b64 = numpy_to_base64_wav(main_audio, engine.sr)
            stems_b64 = [numpy_to_base64_wav(s, engine.sr) for s in stems_audio]
        else:
            # Result could be a tuple if engine logic forces it, ensure we grab the first element
            if isinstance(result, tuple):
                audio = result[0]
            else:
                audio = result
            audio_b64 = numpy_to_base64_wav(audio, engine.sr)
            
        print("[RunPod Handler] Synthesis complete. Returning base64 audio.")
        # 3. Return Base64 results directly back to RunPod caller
        audio_len = len(result[0] if isinstance(result, tuple) else result)
        
        return {
            "audio_b64": audio_b64,
            "mime_type": "audio/wav",
            "stems_b64": stems_b64,
            "duration": float(audio_len) / engine.sr,
            "engine": "diffsinger_onnx_runpod"
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

if __name__ == "__main__":
    if runpod is not None:
        print("[RunPod Handler] Starting RunPod Serverless worker...")
        runpod.serverless.start({"handler": handler})
    else:
        print("[RunPod Handler] `runpod` package missing. Cannot start serverless worker.")
