"""
Vocalido SVS Server v5.1 — AI Acoustic Model Engine
Uses the trained neural network checkpoint for voice synthesis.
Falls back to sample-based if model not available.

Engine priority:
  1. Voice Studio Sampler  (real WAV samples + timbre processing)
  2. TIGER DiffSinger v106 (ONNX neural synthesis)
  3. Custom AI model       (trained .ckpt via PyTorch)
  4. Simple Pitch-Shift    (last resort fallback)
"""
import os
import time
import uuid
import base64
import librosa
import numpy as np
import soundfile as sf
try:
    import fitz # PyMuPDF
    FITZ_OK = True
except ImportError:
    print("[Warning] PyMuPDF (fitz) not found. PDF to XML conversion will be disabled.")
    FITZ_OK = False
from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Request, Body
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

# ── Config ────────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))

# Voice source: search multiple locations, never crash if missing
_VOICE_SOURCE_CANDIDATES = [
    os.path.join(_HERE, "voicebanks", "singeria_render.wav"),
    os.path.join(_HERE, "..", "voicebanks", "singeria_render.wav"),
    os.path.expanduser("~/Downloads/singeria_render.wav"),
    os.path.expanduser("~/Downloads/singeria.wav"),
]
VOICE_SOURCE_PATH = next(
    (p for p in _VOICE_SOURCE_CANDIDATES if os.path.isfile(p)), None
)
if VOICE_SOURCE_PATH:
    print(f"[Config] ✅ Voice source found: {VOICE_SOURCE_PATH}")
else:
    print("[Config] ⚠️  Voice source WAV not found — simple fallback will use sine waves.")
    print(f"[Config]    Put 'singeria_render.wav' in: {os.path.join(_HERE, 'voicebanks')}")

VOICE_SOURCE_MIDI = 58.6  # B3 — detected from analysis
SR = 44100
BPM_DEFAULT = 120.0

app = FastAPI(title="Vocalido SVS Engine", version="5.1.0")
os.makedirs("renders", exist_ok=True)
os.makedirs("voicebanks", exist_ok=True)
app.mount("/audio", StaticFiles(directory="renders"), name="audio")
# Mount renders also at /vocalido/audio (frontend uses this prefix)
app.mount("/vocalido/audio", StaticFiles(directory="renders"), name="vocalido_audio")
# Mount renders also at /studio/audio (used when /studio proxy is active)
app.mount("/studio/audio", StaticFiles(directory="renders"), name="studio_audio")
# Use absolute path for static assets relative to this file
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Mount english_voicebanks directory to serve ONNX model files to the client
english_voicebanks_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'english_voicebanks')
if os.path.exists(english_voicebanks_dir):
    app.mount("/vocalido/voicebanks", StaticFiles(directory=english_voicebanks_dir), name="vocalido_voicebanks")
    app.mount("/studio/voicebanks", StaticFiles(directory=english_voicebanks_dir), name="studio_voicebanks")
    app.mount("/voicebanks", StaticFiles(directory=english_voicebanks_dir), name="voicebanks")
# Mount built frontend assets at root paths so index.html references work
os.makedirs(os.path.join(static_dir, "assets"), exist_ok=True)
os.makedirs(os.path.join(static_dir, "images"), exist_ok=True)
app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
app.mount("/images", StaticFiles(directory=os.path.join(static_dir, "images")), name="images")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    error_msg = traceback.format_exc()
    print(f"❌ [Server Error] {error_msg}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "detail": str(exc), "traceback": error_msg},
    )

@app.get("/", response_class=HTMLResponse)
async def read_root():
    index_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/voice-studio.html", response_class=HTMLResponse)
async def read_voice_studio():
    p = os.path.join(os.path.dirname(__file__), "static", "voice-studio.html")
    with open(p, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/{filename}.html", response_class=HTMLResponse)
async def read_html(filename: str):
    """Serve any .html file from static/ directory."""
    p = os.path.join(os.path.dirname(__file__), "static", f"{filename}.html")
    if os.path.isfile(p):
        with open(p, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="Not Found", status_code=404)

@app.get("/{filename}.js")
async def read_js(filename: str):
    """Serve root-level .js files (registerSW.js, sw.js, workbox) from static/."""
    p = os.path.join(os.path.dirname(__file__), "static", f"{filename}.js")
    if os.path.isfile(p):
        with open(p, "rb") as f:
            from fastapi.responses import Response
            return Response(content=f.read(), media_type="application/javascript")
    return JSONResponse({"detail": "Not Found"}, status_code=404)

@app.get("/manifest.webmanifest")
async def read_manifest():
    p = os.path.join(os.path.dirname(__file__), "static", "manifest.webmanifest")
    if os.path.isfile(p):
        with open(p, "r", encoding="utf-8") as f:
            from fastapi.responses import Response
            return Response(content=f.read(), media_type="application/manifest+json")
    return JSONResponse({"detail": "Not Found"}, status_code=404)

@app.get("/song_{filename}")
async def serve_root_song(filename: str):
    path = os.path.join("renders", f"song_{filename}")
    if os.path.isfile(path):
        return FileResponse(path)
    return JSONResponse({"detail": "Not Found"}, status_code=404)


# ── Training State (in-memory, updated by Colab via /training/update) ─────────
_training_state = {
    "projectPct": 100,      # Overall project % (0–100)
    "trainingPct": 100,     # Current training pipeline % (0–100)
    "status": "done",       # preparing | training | exporting | done | error
    "engine": "diffsinger",    # sampler | diffsinger
    "gpu_active": False,
    "est_cost_usd": 0.0,
    "last_heartbeat": None, # timestamp of last Colab ping
    "phases": {},           # phase_id → {s, p, d}
    "log": []
}

# ── Pre-load voice source ─────────────────────────────────────────────────────
def _extract_base_sample(y, sr, duration=2.0):
    """Find a stable, voiced segment to use as pitch-shift source"""
    analysis_len = min(len(y), sr * 5)
    f0, voiced, _ = librosa.pyin(
        y[:analysis_len],
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C6'),
        sr=sr
    )
    valid_frames = np.where(~np.isnan(f0) & voiced)[0]

    if len(valid_frames) == 0:
        hop = 512
        rms = librosa.feature.rms(y=y, hop_length=hop)
        best_frame = np.argmax(rms)
        best_start = max(0, int(best_frame * hop - (sr * duration / 2)))
    else:
        best_start = valid_frames[len(valid_frames)//2] * 512

    n_samples = int(duration * sr)
    segment = y[best_start:best_start + n_samples].copy()
    if len(segment) < n_samples:
        segment = np.pad(segment, (0, n_samples - len(segment)))
    peak = np.max(np.abs(segment))
    if peak > 0.001:
        segment = segment / peak * 0.95
    return segment

# Load voice source — graceful fallback to sine wave if WAV not found
if VOICE_SOURCE_PATH:
    print("Loading voice source...")
    _voice_raw, _voice_sr = librosa.load(VOICE_SOURCE_PATH, sr=SR, mono=True)
    print("Extracting base voice sample (Deep analysis)...")
    _base_sample = _extract_base_sample(_voice_raw, SR, duration=2.0)
    print(f"✅ Voice source ready! Base sample: {len(_base_sample)/SR:.2f}s at MIDI {VOICE_SOURCE_MIDI:.1f}")
else:
    # Generate a sine-wave stand-in so the server still starts
    print("[Fallback] Generating sine-wave base sample (no voice source WAV).")
    _t = np.arange(int(SR * 2.0)) / SR
    _base_sample = (0.5 * np.sin(2 * np.pi * 233.08 * _t)).astype(np.float32)  # A#3


# ── Request Schema ────────────────────────────────────────────────────────────
class VocalNote(BaseModel):
    pitch: int
    duration: float   # beats
    startTime: float  # beats
    lyric: str

class SynthesisRequest(BaseModel):
    project: str
    singer: str
    steps: int
    notes: List[VocalNote]


# ── Sample-based Synthesis ────────────────────────────────────────────────────
# Note cache: computed on-demand (lazy) to avoid slow startup
_note_buffer = {}

def _get_shifted_note(midi: int) -> np.ndarray:
    """Get a pitch-shifted version of base sample for given MIDI note. Cached."""
    if midi not in _note_buffer:
        semitones = float(midi - VOICE_SOURCE_MIDI)
        _note_buffer[midi] = librosa.effects.pitch_shift(_base_sample, sr=SR, n_steps=semitones)
    return _note_buffer[midi]

def synthesize_sample_based(notes, bpm=120.0):
    """Fast sample-based synthesis: pitch-shift + time-stretch per note."""
    BEAT_SEC = 60.0 / bpm
    if not notes:
        return np.zeros(int(SR * 2), dtype=np.float32)
    
    total_sec = max((n.startTime + n.duration) * BEAT_SEC for n in notes) + 0.5
    output = np.zeros(int(total_sec * SR), dtype=np.float32)
    
    for note in notes:
        midi = int(round(note.pitch))
        dur_sec = note.duration * BEAT_SEC
        start_sec = note.startTime * BEAT_SEC
        
        # 1. Get pitch-shifted audio (lazy-cached)
        shifted = _get_shifted_note(midi)
        
        # 2. Slice/loop to match note duration (faster than time_stretch)
        target_samples = int(dur_sec * SR)
        if target_samples < 1:
            continue
        
        # Loop the sample if short, trim if long — much faster than time_stretch
        # Apply crossfading at loop boundaries to prevent harsh clicks and phase distortion
        if len(shifted) > 0:
            if target_samples <= len(shifted):
                looped = shifted[:target_samples].copy()
            else:
                looped = np.zeros(target_samples, dtype=np.float32)
                pos = 0
                fade_len = min(int(0.02 * SR), len(shifted) // 10) # 20ms fade
                fade_in_curve = np.linspace(0.0, 1.0, fade_len)
                fade_out_curve = np.linspace(1.0, 0.0, fade_len)
                
                while pos < target_samples:
                    chunk = shifted.copy()
                    chunk_len = len(chunk)
                    
                    # Apply crossfade at loop boundary
                    if pos > 0 and pos + chunk_len <= target_samples and fade_len > 0:
                        # Fade in the current chunk start
                        chunk[:fade_len] = chunk[:fade_len] * fade_in_curve
                        # Mix with faded out tail of previous data
                        overlap = looped[pos - fade_len : pos]
                        overlap_fade = overlap * fade_out_curve
                        looped[pos - fade_len : pos] = overlap_fade + chunk[:fade_len]
                        
                        # Copy the rest
                        copy_len = min(chunk_len - fade_len, target_samples - pos)
                        looped[pos : pos + copy_len] = chunk[fade_len : fade_len + copy_len]
                        pos += copy_len
                    else:
                        copy_len = min(chunk_len, target_samples - pos)
                        looped[pos : pos + copy_len] = chunk[:copy_len]
                        pos += copy_len
        else:
            looped = np.zeros(target_samples, dtype=np.float32)
        
        # 3. Apply envelope (smooth attack & release)
        attack_s = min(int(0.05 * SR), target_samples // 4)
        release_s = min(int(0.08 * SR), target_samples // 4)
        
        env = np.ones(target_samples, dtype=np.float32)
        if attack_s > 0:
            env[:attack_s] = np.linspace(0.0, 1.0, attack_s)
        if release_s > 0:
            env[-release_s:] = np.linspace(1.0, 0.0, release_s)
        
        looped = looped * env
        
        # 4. Mix into output at correct position
        start_idx = int(start_sec * SR)
        end_idx = start_idx + len(looped)
        
        if end_idx <= len(output):
            output[start_idx:end_idx] += looped
        else:
            available = len(output) - start_idx
            if available > 0:
                output[start_idx:] += looped[:available]
    
    # Normalize with safe headroom to prevent clipping/distortion
    peak = np.max(np.abs(output))
    if peak > 0:
        output = (output / peak * 0.70).astype(np.float32)
    
    return output


# ── Remote Control Endpoints ──────────────────────────────────────────────────
class RemoteCommandRequest(BaseModel):
    passcode: str
    command: str
    params: Optional[dict] = None

# Global memory queue for remote control commands
remote_commands_list = []

@app.post("/api/remote/command")
async def post_remote_command(payload: RemoteCommandRequest):
    cmd_id = str(uuid.uuid4())
    cmd_data = {
        "id": cmd_id,
        "passcode": payload.passcode,
        "command": payload.command,
        "params": payload.params or {},
        "timestamp": time.time()
    }
    remote_commands_list.append(cmd_data)
    print(f"[RemoteControl] Queued remote command: {payload.command} (ID: {cmd_id})")
    return {"status": "ok", "message": "Command queued", "id": cmd_id}

@app.get("/api/remote/commands")
async def get_remote_commands():
    return {"commands": remote_commands_list}

@app.post("/api/remote/clear")
async def clear_remote_commands(command_ids: List[str] = Body(..., embed=True)):
    global remote_commands_list
    original_len = len(remote_commands_list)
    remote_commands_list = [c for c in remote_commands_list if c["id"] not in command_ids]
    cleared_count = original_len - len(remote_commands_list)
    print(f"[RemoteControl] Cleared {cleared_count} commands")
    return {"status": "ok", "cleared": cleared_count}


# ── Synthesis Endpoint ────────────────────────────────────────────────────────
@app.post("/v1/synthesis")
async def synthesize(request: SynthesisRequest):
    print(f"[Vocalido] 🎤 {len(request.notes)} notes: {[n.lyric for n in request.notes]}")
    
    output_path = f"renders/vocal_{int(time.time()*1000)}.wav"
    
    try:
        audio = synthesize_sample_based(request.notes, bpm=BPM_DEFAULT)
        sf.write(output_path, audio, SR)
        fname = os.path.basename(output_path)
        print(f"[Vocalido] ✅ Done → {fname} ({len(audio)/SR:.2f}s)")
        return JSONResponse({"audio_url": f"/vocalido/audio/{fname}"})
    except Exception as e:
        import traceback; traceback.print_exc()
        raise

class HarmonyRequest(BaseModel):
    key: str = "C"
    chord_progression: str = "I IV V I"
    durations: str = "1 1 1 1"
    time_signature: str = "4/4"
    prompt: Optional[str] = ""

def call_gemini_for_harmony(prompt: str, key: str, time_sig: str) -> dict:
    import urllib.request
    import json
    
    # Try to load API key from root .env if not in os.environ
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        api_key = line.strip().split("=", 1)[1].strip('"\'')
                        break
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in .env")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={api_key}"
    
    system_instruction = (
        "You are an expert music arranger. The user will provide a musical brief or prompt. "
        f"The current key is {key} and time signature is {time_sig}. "
        "Generate a suitable chord progression (in Roman numerals like I IV V I, or standard chords like C F G C) "
        "and corresponding duration list (in beats, separated by spaces, like 1 1 1 1). "
        "Return ONLY a JSON object with 'chord_progression' and 'durations' keys. Do not include markdown formatting or extra text."
    )
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.7
        }
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode("utf-8"))
        
    content_text = result["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(content_text)

@app.post("/v1/generate_harmony")
async def generate_harmony(request: HarmonyRequest):
    print(f"[Harmony] 🎵 Generating SATB for: {request.key}: {request.chord_progression}")
    try:
        from harmony_engine import generateChorale
        from fractions import Fraction
        
        chord_progression = request.chord_progression
        durations = request.durations
        key_val = request.key
        
        if request.prompt and request.prompt.strip():
            print(f"[Harmony] 🤖 AI Brief received: {request.prompt}")
            try:
                ai_data = call_gemini_for_harmony(request.prompt, key_val, request.time_signature)
                if "chord_progression" in ai_data:
                    chord_progression = ai_data["chord_progression"]
                if "durations" in ai_data:
                    durations = str(ai_data["durations"])
                print(f"[Harmony] 🤖 AI Output -> Chords: {chord_progression}, Durations: {durations}")
            except Exception as ai_e:
                print(f"[Harmony] ⚠️ AI Generation failed, falling back to manual inputs: {ai_e}")
        
        dur_list = [Fraction(str(x)) for x in durations.split()]
        key_chords = f"{key_val}: {chord_progression}"
        score = generateChorale(key_chords, dur_list, request.time_signature)
        
        # Save to MusicXML string
        xml_path = score.write("musicxml")
        with open(xml_path, "r", encoding="utf-8") as f:
            xml_data = f.read()
            
        return JSONResponse({"status": "ok", "musicxml": xml_data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


# ----------------------------------------------------------------------
# Model switch endpoint (used by UI)
# (VocalidoAIEngine is imported below near line 360 — no duplicate import)
# ----------------------------------------------------------------------

@app.post("/model/set")
def set_model(payload: dict = Body(...)):
    """
    Switch the active AI model.
    Expected JSON: {"model": "<model_name>"}
    Returns: {"ok": True, "model": "<model_name>", "msg": "..."}
    """
    model_name = payload.get("model")
    if not model_name:
        return {"ok": False, "msg": "Missing 'model' field"}
    success = engine.set_active_model(model_name)
    if success:
        return {"ok": True, "model": model_name, "msg": f"Switched to {model_name}"}
    else:
        return {"ok": False, "msg": f"Failed to switch to {model_name}. Check server logs."}

@app.get("/health")
def health():
    import sys as _sys_local
    engines_loaded = list(_ds_engines.keys()) if _ds_engines else []
    lazy_voices = list(_lazy_voice_paths.keys()) if _lazy_voice_paths else []
    voicebanks_dir = english_voicebanks_dir
    voicebanks_exists = os.path.exists(voicebanks_dir)
    voicebanks_contents = os.listdir(voicebanks_dir) if voicebanks_exists else []
    return {
        "engine": "Vocalido SVS v5 — Sample Pitch-Shift",
        "voice_source": os.path.basename(VOICE_SOURCE_PATH) if VOICE_SOURCE_PATH else "None (Fallback Sine)",
        "source_midi": getattr(_sys_local.modules[__name__], 'VOICE_SOURCE_MIDI', 60),
        "status": "online",
        "ds_engine_ok": DS_ENGINE_OK,
        "engines_loaded": engines_loaded,
        "lazy_voices": lazy_voices,
        "english_voicebanks_dir": voicebanks_dir,
        "english_voicebanks_exists": voicebanks_exists,
        "english_voicebanks_contents": voicebanks_contents,
    }

@app.get("/credits/status")
def credits_status():
    """Return current prompt credit status for the user.
    This endpoint is a placeholder; in a full implementation it would
    query the Antigravity quota bridge or other backend service.
    """
    # TODO: Integrate with actual quota bridge when available.
    # For now, return a static example reflecting the typical Ultra plan.
    return {
        "available": 25000,
        "monthly": 25000,
        "used": 0,
        "usedPercentage": 0,
        "remainingPercentage": 100,
        "isUnlimited": false,
        "planQuotaSource": "plan:Ultra",
        "resetTime": null,
        "resetDateFormatted": null,
        "nextResetFormatted": null,
        "_raw": {"monthlyRaw": 25000, "availableRaw": 25000, "usedRaw": 0, "tierAvailable": 25000}
    }


# ── Training API (used by Colab + UI) ────────────────────────────────────────

@app.get("/training/status")
def training_status():
    """UI polls this every 30s to update VocalidoTrainingCard & Dashboard"""
    hb = _training_state.get("last_heartbeat")
    age_sec = (time.time() - hb) if hb else None
    return {
        **_training_state,
        "heartbeat_age_sec": round(age_sec, 1) if age_sec else None,
        "colab_connected": (age_sec is not None and age_sec < 120),
    }


class TrainingUpdateReq(BaseModel):
    status: Optional[str] = None            # preparing | training | exporting | done | error
    projectPct: Optional[float] = None      # 0-100
    trainingPct: Optional[float] = None     # 0-100
    engine: Optional[str] = None            # sampler | diffsinger  
    gpu_active: Optional[bool] = None
    est_cost_usd: Optional[float] = None
    phases: Optional[dict] = None           # {phase_id: {s, p, d}}
    log_line: Optional[str] = None          # single log line to append


@app.post("/training/update")
def training_update(req: TrainingUpdateReq):
    """Called by Colab Notebook to push real-time training progress"""
    _training_state["last_heartbeat"] = time.time()
    if req.status is not None:
        _training_state["status"] = req.status
    if req.projectPct is not None:
        _training_state["projectPct"] = req.projectPct
    if req.trainingPct is not None:
        _training_state["trainingPct"] = req.trainingPct
    if req.engine is not None:
        _training_state["engine"] = req.engine
    if req.gpu_active is not None:
        _training_state["gpu_active"] = req.gpu_active
    if req.est_cost_usd is not None:
        _training_state["est_cost_usd"] = req.est_cost_usd
    if req.phases is not None:
        _training_state["phases"].update(req.phases)
    if req.log_line:
        _training_state["log"].append({"t": time.time(), "msg": req.log_line})
        _training_state["log"] = _training_state["log"][-100:]  # keep last 100
    print(f"[Training] 📡 Colab update: {req.status or 'heartbeat'} — {req.trainingPct or 0:.0f}%")
    return {"ok": True}


@app.post("/training/import-onnx")
async def import_onnx(models: List[UploadFile] = File(...)):
    """Import trained ONNX model files from Colab download"""
    saved = []
    dest_dir = os.path.join(os.path.dirname(__file__), 'voicebanks', 'vocalido_master')
    os.makedirs(dest_dir, exist_ok=True)
    for f in models:
        dest = os.path.join(dest_dir, f.filename)
        content = await f.read()
        with open(dest, 'wb') as out:
            out.write(content)
        saved.append(f.filename)
    # Mark as done in training state
    _training_state["status"] = "done"
    _training_state["projectPct"] = 100
    _training_state["engine"] = "diffsinger"
    print(f"[Training] ✅ Imported {len(saved)} ONNX models: {saved}")
    return {"ok": True, "count": len(saved), "files": saved}


@app.post("/training/set-engine")
async def set_engine(body: dict):
    """Switch between sampler and diffsinger engine"""
    mode = body.get("engine", "sampler")
    _training_state["engine"] = mode
    return {"ok": True, "engine": mode}


# ── AI Engine (trained model) ─────────────────────────────────────────────
import sys as _sys
_sys.path.insert(0, os.path.dirname(__file__))

# English: vocalido_gtsinger_en 100k — trained overnight May 18-19 on GTSinger dataset
# Full English phoneme coverage from professional singing corpus
DS_CKPT_PATH = os.path.join(os.path.dirname(__file__), 'training', 'DiffSinger', 'checkpoints', 'vocalido_gtsinger_en', 'model_ckpt_steps_160000.ckpt')
DS_BASE_CFG_PATH = os.path.join(os.path.dirname(__file__), 'training', 'DiffSinger', 'checkpoints', 'vocalido_gtsinger_en', 'config.yaml')

# Jianpu (Chinese) 160k Checkpoint Path
DS_JIANPU_CKPT_PATH = os.path.join(os.path.dirname(__file__), 'training', 'DiffSinger', 'checkpoints', 'vocalido_jianpu', 'model_ckpt_steps_160000.ckpt')
DS_JIANPU_CFG_PATH  = os.path.join(os.path.dirname(__file__), 'training', 'DiffSinger', 'checkpoints', 'vocalido_jianpu', 'config.yaml')

CHECKPOINT_PATH = os.path.join(os.path.dirname(__file__), 'voicebanks', 'vocalido_master', 'acoustic_final.ckpt')

# Initialize English DiffSinger Engines dynamically
_ds_engines = {}
DS_ENGINE_OK = False
_ds_engine = None

english_voicebanks_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'english_voicebanks')

# Load the default one first (if it exists)
print(f"[DEBUG] Checking for DiffSinger (Default English) model at: {DS_CKPT_PATH}")
if os.path.exists(DS_CKPT_PATH):
    try:
        from ds_engine import DiffSingerEngine
        _ds_engine = DiffSingerEngine(DS_CKPT_PATH)
        DS_ENGINE_OK = _ds_engine.is_ready
        if DS_ENGINE_OK:
            _ds_engines['default'] = _ds_engine
            print(f"✅ DiffSinger Engine (Default English) loaded successfully!")
    except Exception as e:
        import traceback
        print(f"❌ [CRITICAL] Failed to load Default DiffSinger Engine: {e}")
        traceback.print_exc()
else:
    print(f"⚠️  DiffSinger (English) default model NOT found at {DS_CKPT_PATH}")

# Load downloaded voicebanks
# Load downloaded voicebanks
def find_diffsinger_model(directory):
    for root, dirs, files in os.walk(directory):
        ckpt_path = None
        for f in files:
            if f.endswith('.ckpt') or f == 'acoustic.onnx':
                ckpt_path = os.path.join(root, f)
                break
        if ckpt_path:
            if ckpt_path.endswith('.onnx'):
                return ckpt_path, None
            config_path = os.path.join(root, 'config.yaml')
            if not os.path.exists(config_path):
                config_path = os.path.join(root, 'dsdict.yaml')
            if os.path.exists(config_path):
                return ckpt_path, config_path
    return None, None

# Store lazy voice paths for on-demand loading
_lazy_voice_paths = {}  # voice_name -> (ckpt_path, config_path)

if os.path.exists(english_voicebanks_dir):
    for entry in os.listdir(english_voicebanks_dir):
        voice_path = os.path.join(english_voicebanks_dir, entry)
        if os.path.isdir(voice_path):
            voice_name = entry
            ckpt, cfg = find_diffsinger_model(voice_path)
            if ckpt:
                print(f"[DEBUG] 📂 Found {voice_name} model at: {ckpt}")
                if ckpt.endswith('.onnx'):
                    # Load only the first ONNX voice eagerly (Lotte V), rest are lazy
                    onnx_already_loaded = any(
                        hasattr(e, 'acoustic_path') for e in _ds_engines.values()
                    )
                    if not onnx_already_loaded:
                        try:
                            from ds_onnx_engine import DiffSingerONNXEngine
                            # CRITICAL: Pass voice_path (model root dir), NOT os.path.dirname(ckpt)
                            # os.path.dirname(ckpt) = .../dsmain/ but engine needs the parent
                            # that contains dsmain/, dsdur/, dspitch/, dsvocoder/
                            engine = DiffSingerONNXEngine(voice_path, language='en')
                            if engine.is_ready:
                                _ds_engines[voice_name.lower()] = engine
                                print(f"✅ DiffSinger ONNX Engine ({voice_name}) loaded successfully!")
                                DS_ENGINE_OK = True
                        except Exception as e:
                            print(f"❌ Failed to load {voice_name}: {e}")
                    else:
                        _lazy_voice_paths[voice_name.lower()] = (ckpt, cfg)
                        print(f"📋 Registered lazy voice: {voice_name} (will load on first use)")
                else:
                    try:
                        from ds_engine import DiffSingerEngine
                        engine = DiffSingerEngine(ckpt, config_path=cfg, language='en')
                        if engine.is_ready:
                            _ds_engines[voice_name.lower()] = engine
                            print(f"✅ DiffSinger Engine ({voice_name}) loaded successfully!")
                            DS_ENGINE_OK = True
                            if _ds_engine is None:
                                _ds_engine = engine
                    except Exception as e:
                        print(f"❌ Failed to load {voice_name}: {e}")

# Initialize Jianpu (Chinese) DiffSinger Engine
DS_JIANPU_OK = False
_ds_jianpu_engine = None
print(f"[DEBUG] Checking for DiffSinger (Jianpu/Chinese) model at: {DS_JIANPU_CKPT_PATH}")
if os.path.exists(DS_JIANPU_CKPT_PATH):
    print("[DEBUG] 📂 Jianpu model found. Attempting to load...")
    try:
        from ds_engine import DiffSingerEngine
        _ds_jianpu_engine = DiffSingerEngine(DS_JIANPU_CKPT_PATH, config_path=DS_JIANPU_CFG_PATH, language='zh')
        DS_JIANPU_OK = _ds_jianpu_engine.is_ready
        if DS_JIANPU_OK:
            print(f"✅ DiffSinger Jianpu (Chinese 160k) loaded successfully!")
        else:
            print("⚠️  Jianpu Engine: Instance created but is_ready is False.")
    except Exception as e:
        import traceback
        print(f"❌ [CRITICAL] Failed to load Jianpu Engine: {e}")
        traceback.print_exc()
else:
    print(f"⚠️  DiffSinger (Jianpu) model NOT found at {DS_JIANPU_CKPT_PATH}")

try:
    from ai_engine import VocalidoAIEngine
    # The first arg is the BASE checkpoints directory, not the .ckpt file itself
    CP_DIR = os.path.dirname(os.path.dirname(CHECKPOINT_PATH))
    MD_NAME = os.path.basename(os.path.dirname(CHECKPOINT_PATH))
    _ai_engine = VocalidoAIEngine(CP_DIR, MD_NAME, VOICE_SOURCE_PATH)
    AI_OK = False
    _ai_engine = None
    print(f"⚠️  AI Engine disabled temporarily to avoid untrained model Tap noise.")
except Exception as _e:
    AI_OK = False
    _ai_engine = None

# Also load voice_studio as fallback
try:
    from voice_studio import get_library, synthesize_phrase as studio_synthesize_phrase, synthesize_note as studio_synthesize_note, SR as STUDIO_SR
    from audio_utils import audio_to_base64_wav, audio_to_base64_mp3  # absolute import (not a package)
    STUDIO_OK = True
    print("✅ Voice Studio loaded (sampler)")
except Exception as _e:
    STUDIO_OK = False
    print(f"⚠️  Voice Studio: {_e}")

# Lyrics SVS Engine (TTS-based singing)
try:
    from lyrics_engine import synthesize_lyrics_phrase
    LYRICS_OK = True
    print("✅ Lyrics SVS Engine loaded (TTS-based singing)")
except Exception as _e:
    LYRICS_OK = False
    print(f"⚠️  Lyrics Engine: {_e}")

class ClientLogItem(BaseModel):
    type: str
    message: str

class ClientLogReq(BaseModel):
    type: str = ""
    message: str = ""
    logs: list[ClientLogItem] = []

class StudioPreviewReq(BaseModel):
    phrase: str = ""
    notes: list = []
    params: dict = {}
    song_id: str = ""   # ← for permanent per-song save
    bpm_pct: int = 100  # ← e.g. 100, 75, 50
    song_key: str = "C" # ← e.g. "C", "G", "Bb" — included in filename/label
    lyric_mode: str = "default"  # ← e.g. "Jianpu", "Ju Solfege Movable Doh"
    owner_id: Optional[str] = ""  # ← for user-isolation cache
    is_public: bool = True  # ← for user-isolation cache

    # Fix: Coerce null/None owner_id to empty string to prevent 422 errors
    from pydantic import field_validator
    @field_validator('owner_id', mode='before')
    @classmethod
    def coerce_owner_id(cls, v):
        if v is None:
            return ""
        return str(v)

class StudioNoteReq(BaseModel):
    midi: int = 60
    duration: float = 1.0
    params: dict = {}

class StudioSynthesisReq(BaseModel):
    notes: List[dict] = []
    params: dict = {}

SOL_MAP = {'do':60,'re':62,'mi':64,'fa':65,'sol':67,'la':69,'ti':71,
           'do#':61,'re#':63,'fa#':66,'sol#':68,'la#':70}

def parse_phrase(phrase):
    import re
    notes = []
    for tok in phrase.strip().split():
        t = tok.lower()
        duration = 0.75
        if ':' in t:
            parts = t.split(':')
            t = parts[0]
            try:
                duration = float(parts[1])
            except:
                pass
            
        if t in SOL_MAP:
            notes.append({'midi': SOL_MAP[t], 'duration': duration, 'lyric': t})
        else:
            m = re.match(r'^([A-Ga-g])([#sb]?)(\d)$', t)
            if m:
                nm={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
                n=nm.get(m.group(1).upper(),0)+{'#':1,'s':1,'b':-1}.get(m.group(2),0)
                notes.append({'midi':(int(m.group(3))+1)*12+n,'duration':duration, 'lyric': 'la'})
            else:
                # Retain original case for lyrics (e.g. "Ah")
                lyric = tok.split(':')[0] if ':' in tok else tok
                notes.append({'midi': 60, 'duration': duration, 'lyric': lyric})
    return notes

def collapse_to_monophonic(notes: list) -> list:
    if not notes:
        return []
    
    # Sort notes by startTime (ascending), then by pitch/midi (descending)
    def get_pitch(n):
        return float(n.get("midi") or n.get("midi") or 60)
    
    def get_start(n):
        return float(n.get("startTime", 0.0))
        
    sorted_notes = sorted(notes, key=lambda x: (get_start(x), -get_pitch(x)))
    
    monophonic_notes = []
    
    for n in sorted_notes:
        start = get_start(n)
        pitch = get_pitch(n)
        dur = float(n.get("duration", 0.5))
        
        # If there are notes starting at the exact same time (within a very small epsilon, e.g. 0.005 beats),
        # we only keep the first one (which has the highest pitch).
        if monophonic_notes:
            last_n = monophonic_notes[-1]
            last_start = get_start(last_n)
            if abs(start - last_start) < 0.005:
                continue
                
            # If this note starts after the last note's start time, but BEFORE the last note ends:
            last_end = last_start + float(last_n.get("duration", 0.5))
            if start < last_end - 0.005:
                # Overlap! We truncate the last note's duration so it ends exactly where this note starts.
                new_dur = start - last_start
                last_n["duration"] = max(0.01, new_dur)
        
        n_copy = dict(n)
        n_copy["startTime"] = start
        n_copy["duration"] = dur
        n_copy["midi"] = pitch
        monophonic_notes.append(n_copy)
        
    return monophonic_notes

@app.get("/studio/library")
def studio_library():
    info = {
        "count": 37,
        "range_min": 48,
        "range_max": 84,
        "engine": "AI Acoustic Model" if AI_OK else "Sample-Based",
        "notes": {}
    }
    if STUDIO_OK:
        lib = get_library()
        info["count"] = len(lib)
        if lib:
            info["range_min"] = min(lib.keys())
            info["range_max"] = max(lib.keys())
    return info

@app.post("/studio/api/client-log")
def studio_client_log(req: ClientLogReq):
    log_lines = []
    if req.logs:
        for log in req.logs:
            log_lines.append(f"[{log.type.upper()}] {log.message}\n")
    elif req.type and req.message:
        log_lines.append(f"[{req.type.upper()}] {req.message}\n")
        
    if not log_lines:
        return {"status": "ok"}
        
    log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "client_logs.log")
    with open(log_path, "a", encoding="utf-8") as f:
        for log_line in log_lines:
            print(f"🖥️ [CLIENT] {log_line.strip()}")
            f.write(log_line)
    return {"status": "ok"}

@app.post("/studio/preview")
def studio_preview(req: StudioPreviewReq):
    notes = []
    if req.notes and len(req.notes) > 0:
        for n in req.notes:
            notes.append({
                'midi': n.get('pitch') or n.get('midi') or 60,
                'duration': n.get('duration') or 0.5,
                'startTime': n.get('startTime', 0),
                'lyric': n.get('lyric', '')
            })
    elif req.phrase:
        notes = parse_phrase(req.phrase)
    
    if not notes:
        return JSONResponse({"error": "No valid notes"}, status_code=400)

    # Apply monophonic collapsing if requested
    collapse_chords = req.params.get('collapse_chords', True)
    if isinstance(collapse_chords, str):
        collapse_chords = collapse_chords.lower() == 'true'
    
    if collapse_chords:
        notes = collapse_to_monophonic(notes)

    # ── SERVER-SIDE CACHE CHECK ────────────────────────────────────────────────
    # If a rendered file already exists on disk for this exact combination,
    # return it immediately without spending GPU time on re-rendering.
    import re as _re_cache
    if req.song_id:
        _safe_id   = _re_cache.sub(r'[^a-zA-Z0-9_-]', '_', req.song_id)[:60]
        _safe_key  = _re_cache.sub(r'[^a-zA-Z0-9]', '', req.song_key or 'C')[:4]
        _safe_lm   = _re_cache.sub(r'[^a-zA-Z0-9]', '', req.lyric_mode or 'default')[:30]
        _raw_vc    = req.params.get('voice', 'default') or 'default'
        if not collapse_chords:
            _raw_vc = f"{_raw_vc}poly"
        _safe_vc   = _re_cache.sub(r'[^a-zA-Z0-9]', '', _raw_vc)[:20]
        
        _timing_feel = int(req.params.get('timing_feel', 50))
        _is_private = (not req.is_public) and bool(req.owner_id)
        
        # Create a hash of notes to ensure changes to transpose or solfege bust the cache
        import hashlib
        import json
        _notes_str = json.dumps(notes, sort_keys=True).encode('utf-8')
        _notes_hash = hashlib.md5(_notes_str).hexdigest()[:8]
        
        if _is_private:
            _safe_owner = _re_cache.sub(r'[^a-zA-Z0-9_-]', '_', req.owner_id)[:40]
            _cached_name = f"song_{_safe_owner}_{_safe_id}_{_safe_key}_{req.bpm_pct}_{_safe_lm}_{_safe_vc}_tf{_timing_feel}_{_notes_hash}_v3.mp3"
        else:
            _cached_name = f"song_{_safe_id}_{_safe_key}_{req.bpm_pct}_{_safe_lm}_{_safe_vc}_tf{_timing_feel}_{_notes_hash}_v3.mp3"
        _cached_path = os.path.join("renders", _cached_name)
        if os.path.isfile(_cached_path) and os.path.getsize(_cached_path) > 1000:
            print(f"[Cache] ✅ Found existing render on disk: {_cached_name} — skipping GPU synthesis")
            _cached_url = f"/vocalido/audio/{_cached_name}"
            # Also check for existing stems
            _cached_stem_urls = []
            for _si in range(10):  # max 10 stems
                _stem_name = _cached_name.replace('.mp3', f'_stem_{_si}.mp3')
                if os.path.isfile(os.path.join("renders", _stem_name)):
                    _cached_stem_urls.append(f"/vocalido/audio/{_stem_name}")
                else:
                    break
            return {
                "audio_b64": None,
                "mime_type": "audio/mpeg",
                "stems_b64": [],
                "saved_stem_urls": _cached_stem_urls,
                "duration": 0,
                "notes": len(notes),
                "engine": "cached",
                "saved_url": _cached_url,
                "song_id": req.song_id,
                "bpm_pct": req.bpm_pct,
                "song_key": req.song_key,
                "label": f"{req.song_key} / {req.bpm_pct}% / {req.params.get('singer', 'Auto').upper()}",
                "cached": True,
            }

    # Check if lyrics are present
    has_lyrics = any(n.get('lyric') and str(n.get('lyric')).strip() not in ('-', '~', '_', 'rest') for n in notes)
    
    # ── DETERMINING THE BEST ENGINE ──
    # PRIORITY 1: Voice Studio Sampler (Real human samples, very stable)
    # PRIORITY 2: Neural AI Model (Experimental timbre transfer)
    # PRIORITY 3: Lyrics SVS Engine (TTS-based)
    
    audio = None
    engine_name = "unknown"
    requested_voice = req.params.get('voice', 'default') if req.params else 'default'
    import re as _re_main
    is_jianpu_mode = (requested_voice == 'jianpu') or any(
        isinstance(n.get('lyric'), str) and _re_main.match(r"^[#b♯♭]?[1-7]$", n.get('lyric').strip())
        for n in notes
    )
    stems_audio = []

    # ── STRICT MODE ISOLATION ──────────────────────────────────────────────────
    # Jianpu (Chinese) voice is EXCLUSIVELY for Jianpu mode.
    # English engines must NEVER be used in Jianpu mode, and vice versa.

    if is_jianpu_mode:
        # ── JIANPU MODE: Chinese engine only, no English fallback ─────────────
        if DS_JIANPU_OK and _ds_jianpu_engine:
            print(f"[Jianpu] 🎤 Chinese Neural Synthesis (160k): {len(notes)} notes...")
            try:
                return_stems = str(req.params.get("return_stems", "false")).lower() == "true"
                res = _ds_jianpu_engine.synthesize_phrase(notes, req.params)
                if return_stems and isinstance(res, tuple):
                    audio, stems_audio = res
                else:
                    audio = res
                if audio is not None:
                    engine_name = "diffsinger_jianpu_160k"
            except Exception as e:
                print(f"[Jianpu] ❌ Error: {e}")
                audio = None
        if audio is None:
            # Jianpu engine failed or not loaded — return error, do NOT fall back to English
            return JSONResponse(
                status_code=503,
                content={"error": "Chinese (Jianpu) vocal engine is not available. Please check the Jianpu model checkpoint."
                         " English engines will not be used in Jianpu mode."}
            )
    else:
        # ── ENGLISH / SOLFÈGE MODE: English engine only, Jianpu engine BLOCKED ─
        target_voice = requested_voice.lower()
        print(f"[DEBUG] Synthesis request: DS_ENGINE_OK={DS_ENGINE_OK}, voice={requested_voice}")
        
        _target_engine = _ds_engine
        if target_voice in _ds_engines:
            _target_engine = _ds_engines[target_voice]
        elif target_voice in _lazy_voice_paths:
            # Lazy load this voice on first use
            ckpt, cfg = _lazy_voice_paths[target_voice]
            print(f"[LazyLoad] 🔄 Loading voice '{target_voice}' on demand...")
            try:
                from ds_onnx_engine import DiffSingerONNXEngine
                # For ONNX models, ckpt is .../dsmain/acoustic.onnx
                # The engine needs the model root (parent of dsmain/)
                model_root = os.path.dirname(os.path.dirname(ckpt))
                engine = DiffSingerONNXEngine(model_root, language='en')
                if engine.is_ready:
                    _ds_engines[target_voice] = engine
                    _target_engine = engine
                    del _lazy_voice_paths[target_voice]
                    print(f"[LazyLoad] ✅ Voice '{target_voice}' loaded successfully!")
            except Exception as e:
                print(f"[LazyLoad] ❌ Failed to load '{target_voice}': {e}")
        elif _ds_engines:
            _target_engine = list(_ds_engines.values())[-1] # Fallback
            
        if audio is None and _target_engine and _target_engine.is_ready:
            print(f"[DiffSinger] 🎤 English Neural Synthesis ({target_voice}): {len(notes)} notes...")
            print(f"[DEBUG] First 10 MIDI notes received: {[n.get("midi") for n in notes[:10]]}")
            print(f"[DEBUG] First 10 lyrics received: {[n.get("lyric") for n in notes[:10]]}")
            try:
                return_stems = str(req.params.get("return_stems", "false")).lower() == "true"
                res = _target_engine.synthesize_phrase(notes, req.params)
                if return_stems and isinstance(res, tuple):
                    print(f"[DEBUG] Full note payload keys for first note: {list(notes[0].keys()) if notes else []}")
                    audio, stems_audio = res
                else:
                    audio = res
                
                if audio is not None:
                    engine_name = f"diffsinger_{target_voice}"
            except Exception as e:
                print(f"[DiffSinger] ❌ Error: {e}")
                audio = None

        # 1. Try Voice Studio (Sampler) — English only fallback
        if audio is None and STUDIO_OK:
            print(f"[Studio] 🎤 Sampler Synthesis: {len(notes)} notes...")
            lib = get_library()
            if lib:
                try:
                    audio = studio_synthesize_phrase(notes, lib, req.params)
                    engine_name = "studio_sampler"
                except Exception as e:
                    print(f"[Studio] ❌ Synthesis Failed: {e}")
                    audio = None
        
        # 2. Try Neural AI Engine — English only fallback
        if audio is None and AI_OK and _ai_engine and _ai_engine.model:
            print(f"[AI Engine] 🎤 Neural Synthesis: {len(notes)} notes...")
            try:
                audio = _ai_engine.synthesize_phrase(notes, req.params)
                # Integrity check: is it silence or noise?
                if audio is not None and np.max(np.abs(audio)) < 0.01:
                    print("[AI Engine] ⚠️ Output too quiet. Falling back.")
                    audio = None
                else:
                    engine_name = "ai_neural"
            except Exception as e:
                print(f"[AI Engine] ❌ Synthesis Failed: {e}")
                audio = None

        # 3. Try Lyrics TTS Engine (English only — never in Jianpu mode)
        if audio is None and LYRICS_OK and has_lyrics:
            print(f"[Lyrics SVS] 🎤 TTS Synthesis: {len(notes)} notes...")
            try:
                audio = synthesize_lyrics_phrase(notes, req.params)
                engine_name = "lyrics_tts"
            except Exception as e:
                print(f"[Lyrics SVS] ❌ Error: {e}")
                audio = None

        # 4. Final Fallback (English only — never in Jianpu mode)
        if audio is None or np.max(np.abs(audio)) < 0.005:
            print(f"[Fallback] 🎤 Using basic pitch-shift synthesis.")
            v_notes = [VocalNote(
                pitch=int(n.get('pitch', 60) or 60),
                duration=float(n.get('duration', 0.5) or 0.5),
                startTime=float(n.get('startTime',0) or 0),
                lyric=str(n.get('lyric', 'La') or 'La')
            ) for n in notes]
            audio = synthesize_sample_based(v_notes, bpm=req.params.get('bpm', 120))
            engine_name = "simple_fallback"

    # Apply post-processing DSP effects (reverb, warmth, brightness, vibrato, breathiness, speed, pitch_shift)
    # to all engines except 'studio_sampler' (which already ran apply_timbre per-note)
    if audio is not None and engine_name != "studio_sampler":
        try:
            from voice_studio import apply_timbre
            dsp_params = req.params.copy() if req.params else {}
            
            # If it's a DiffSinger engine, formant_shift is already processed inside the acoustic model,
            # so we set it to 0.0 for apply_timbre to prevent double-processing.
            if engine_name.startswith("diffsinger_"):
                dsp_params['formant_shift'] = 0.0
            
            # Read engine sample rate
            engine_sr = SR
            if engine_name.startswith("diffsinger_") and _target_engine:
                engine_sr = getattr(_target_engine, 'sr', SR)
            
            print(f"[DSP Post-Process] 🎛️ Applying timbre effects to {engine_name} output at {engine_sr}Hz...")
            audio = apply_timbre(audio, engine_sr, dsp_params)
            
            if stems_audio:
                stems_audio = [apply_timbre(sa, engine_sr, dsp_params) for sa in stems_audio]
        except Exception as dsp_err:
            print(f"[DSP Post-Process] ⚠️ Failed: {dsp_err}")

    # ── Persist render to disk FIRST (fast) then return URL ──────────────────
    # Skip expensive base64 encoding — client uses saved_url for playback
    import re as _re2
    import time as _time
    os.makedirs("renders", exist_ok=True)
    if req.song_id:
        safe_id  = _re2.sub(r'[^a-zA-Z0-9_-]', '_', req.song_id)[:60]
        safe_key = _re2.sub(r'[^a-zA-Z0-9]', '', req.song_key or 'C')[:4]
        safe_lyric_mode = _re2.sub(r'[^a-zA-Z0-9]', '', req.lyric_mode or 'default')[:30]
        raw_voice = req.params.get('voice', 'default') or 'default'
        if not collapse_chords:
            raw_voice = f"{raw_voice}poly"
        safe_voice = _re2.sub(r'[^a-zA-Z0-9]', '', raw_voice)[:20]
        
        _timing_feel = int(req.params.get('timing_feel', 50))
        is_private = (not req.is_public) and bool(req.owner_id)
        if is_private:
            safe_owner = _re2.sub(r'[^a-zA-Z0-9_-]', '_', req.owner_id)[:40]
            saved_name = f"song_{safe_owner}_{safe_id}_{safe_key}_{req.bpm_pct}_{safe_lyric_mode}_{safe_voice}_tf{_timing_feel}.mp3"
        else:
            saved_name = f"song_{safe_id}_{safe_key}_{req.bpm_pct}_{safe_lyric_mode}_{safe_voice}_tf{_timing_feel}.mp3"
    else:
        saved_name = f"render_{int(_time.time()*1000)}.mp3"
    saved_path = os.path.join("renders", saved_name)
    try:
        from audio_utils import save_audio_as_mp3
        if not save_audio_as_mp3(audio, saved_path, sr=SR):
            saved_name = saved_name.replace('.mp3', '.wav')
            saved_path = saved_path.replace('.mp3', '.wav')
            import soundfile as sf
            sf.write(saved_path, audio, SR)
        saved_url = f"/vocalido/audio/{saved_name}"
        print(f"[studio/preview] 💾 Saved: {saved_name}")
    except Exception as _se:
        print(f"[studio/preview] ⚠️ Save failed: {_se}")
        saved_url = None

    # Save stems to disk (skip base64 — client uses saved_stem_urls)
    saved_stem_urls = []
    if stems_audio:
        for idx, stem in enumerate(stems_audio):
            if stem is not None and saved_url:
                stem_ext = ".wav" if saved_url.endswith(".wav") else ".mp3"
                stem_name = saved_name.replace(stem_ext, f"_stem_{idx}{stem_ext}")
                stem_path = os.path.join("renders", stem_name)
                try:
                    if stem_ext == ".mp3":
                        from audio_utils import save_audio_as_mp3
                        save_audio_as_mp3(stem, stem_path, sr=SR)
                    else:
                        import soundfile as sf
                        sf.write(stem_path, stem, SR)
                    saved_stem_urls.append(f"/vocalido/audio/{stem_name}")
                except Exception as _stem_err:
                    print(f"⚠️ Failed to save stem {idx}: {_stem_err}")

    return {
        "audio_b64": None,
        "mime_type": "audio/mpeg",
        "stems_b64": [],
        "saved_stem_urls": saved_stem_urls,
        "duration": float(len(audio)) / SR,
        "notes": len(notes),
        "engine": engine_name,
        "saved_url": saved_url,
        "song_id": req.song_id,
        "bpm_pct": req.bpm_pct,
        "song_key": req.song_key,
        "label": f"{req.song_key} / {req.bpm_pct}% / {req.params.get('singer', 'Auto').upper()}",
    }

def get_vocal_modes(path):
    if not path:
        return []
    # If path is a file, take its directory
    if os.path.isfile(path):
        model_dir = os.path.dirname(path)
    else:
        model_dir = path
        
    search_dirs = [
        os.path.join(model_dir, "embeds", "acoustic"),
        os.path.join(model_dir, "dsmain", "embeds", "acoustic"),
        model_dir
    ]
    
    for d in search_dirs:
        if os.path.exists(d):
            # Find all .emb files, strip extension, capitalize them nicely
            files = [f[:-4].title() for f in os.listdir(d) if f.endswith('.emb')]
            if files:
                return sorted(files)
    return []

def get_model_files(voice_id):
    if not english_voicebanks_dir or not os.path.exists(english_voicebanks_dir):
        return None
    voice_dir = os.path.join(english_voicebanks_dir, voice_id)
    if not os.path.exists(voice_dir):
        for name in os.listdir(english_voicebanks_dir):
            if name.lower() == voice_id.lower():
                voice_dir = os.path.join(english_voicebanks_dir, name)
                break
    if not os.path.exists(voice_dir):
        return None
    acoustic_path = None
    vocoder_path = None
    dict_path = None
    phonemes_path = None
    ling_path = None          # dsmain/linguistic.onnx
    dur_path = None           # dsdur/dur.onnx
    pitch_path = None         # dspitch/pitch.onnx
    pitch_ling_path = None    # dspitch/linguistic.onnx
    embeds = {}
    for root, dirs, files in os.walk(voice_dir):
        for f in files:
            if f == "acoustic.onnx":
                acoustic_path = os.path.join(root, f)
            elif f == "linguistic.onnx":
                # Distinguish between dsmain/linguistic.onnx and dspitch/linguistic.onnx
                if "pitch" in root.lower() or "dspitch" in os.path.basename(root).lower():
                    pitch_ling_path = os.path.join(root, f)
                elif ling_path is None:
                    ling_path = os.path.join(root, f)
            elif f == "dur.onnx":
                dur_path = os.path.join(root, f)
            elif f == "pitch.onnx":
                pitch_path = os.path.join(root, f)
            elif f == "dictionary.txt":
                dict_path = os.path.join(root, f)
            elif f == "phonemes.txt":
                phonemes_path = os.path.join(root, f)
            elif f.endswith(".onnx") and (f in ["aidolgan.onnx", "vocoder.onnx"] or "vocoder" in root.lower()):
                vocoder_path = os.path.join(root, f)
            elif f.endswith(".emb"):
                name = f[:-4].lower()
                embeds[name] = os.path.join(root, f)
    if acoustic_path and vocoder_path:
        def to_static_url(abs_p):
            if not abs_p:
                return None
            rel = os.path.relpath(abs_p, english_voicebanks_dir)
            return f"/vocalido/voicebanks/{rel.replace(os.sep, '/')}"
        return {
            "acoustic": to_static_url(acoustic_path),
            "vocoder": to_static_url(vocoder_path),
            "dictionary": to_static_url(dict_path),
            "phonemes": to_static_url(phonemes_path),
            "embeds": {k: to_static_url(v) for k, v in embeds.items()},
            # Neural sub-models for full DiffSinger pipeline
            "linguistic": to_static_url(ling_path),
            "dur": to_static_url(dur_path),
            "pitch": to_static_url(pitch_path),
            "pitchLinguistic": to_static_url(pitch_ling_path),
        }
    return None

@app.get("/studio/voices")
def get_voices():
    """Return a list of available AI voices."""
    voices = []
    
    # 1. Default GTSinger
    if _ds_engine and _ds_engine.is_ready:
        voices.append({"id": "default", "name": "Native English (Default)", "type": "DiffSinger", "lang": "en", "vocal_modes": []})
        
    # 2. Dynamic Downloaded Voices (Lotte V, Opencpop, etc.)
    for v_id, engine in _ds_engines.items():
        if v_id != "default" and engine.is_ready:
            name_label = v_id.replace("_", " ").title()
            if "lotte" in v_id.lower() or "ai_dol" in v_id.lower():
                name_label = f"Lotte V Model ({name_label})"
            
            # Find vocal modes
            model_dir = getattr(engine, 'model_dir', None)
            vocal_modes = get_vocal_modes(model_dir) if model_dir else []
            if not vocal_modes:
                vocal_modes = get_vocal_modes(os.path.join(english_voicebanks_dir, v_id))
                
            model_files = get_model_files(v_id)
            voices.append({"id": v_id, "name": name_label, "type": "DiffSinger", "lang": "en", "vocal_modes": vocal_modes, "model_files": model_files})
    
    # 3. Lazy-loadable voices (not yet loaded into memory)
    for v_id in _lazy_voice_paths:
        name_label = v_id.replace("_", " ").title()
        ckpt, cfg = _lazy_voice_paths[v_id]
        vocal_modes = get_vocal_modes(os.path.dirname(ckpt))
        model_files = get_model_files(v_id)
        voices.append({"id": v_id, "name": f"{name_label} ⏳", "type": "DiffSinger", "lang": "en", "vocal_modes": vocal_modes, "model_files": model_files})
            
    # 4. Jianpu Chinese engine
    if DS_JIANPU_OK and _ds_jianpu_engine:
        voices.append({"id": "jianpu", "name": "Chinese Numeral (Jianpu 简谱)", "type": "DiffSinger", "lang": "zh", "vocal_modes": []})
            
    return {"ok": True, "voices": voices}


@app.get("/studio/renders/{song_id}")
def list_renders(song_id: str, owner_id: Optional[str] = None):
    """List all saved renders for a given song_id."""
    import re as _re3
    os.makedirs("renders", exist_ok=True)
    safe_id = _re3.sub(r'[^a-zA-Z0-9_-]', '_', song_id)[:40]
    
    global_prefix = f"song_{safe_id}_"
    private_prefix = None
    if owner_id:
        safe_owner = _re3.sub(r'[^a-zA-Z0-9_-]', '_', owner_id)[:40]
        private_prefix = f"song_{safe_owner}_{safe_id}_"
        
    files = []
    for f in os.listdir("renders"):
        if f.endswith((".mp3", ".wav")) and not "_stem_" in f:
            if f.startswith(global_prefix):
                files.append(f)
            elif private_prefix and f.startswith(private_prefix):
                files.append(f)
    result = []
    for f in sorted(files):
        # Filename formats:
        # New format: song_<id>_<key>_<pct>_<lyric_mode>_<voice>.mp3
        # Old format: song_<id>_<key>_<pct>.mp3
        # Legacy format: song_<id>_bpm<pct>.mp3
        stem_ext = ".wav" if f.endswith(".wav") else ".mp3"
        base_name = f.replace(stem_ext, "")
        parts = base_name.split("_")
        
        voice = "default"
        lyric_mode = "default"
        
        if len(parts) >= 6 and parts[-3].isdigit():
            voice = parts[-1]
            lyric_mode = parts[-2]
            bpm_pct = int(parts[-3])
            key_part = parts[-4]
            label = f"{key_part} {bpm_pct}%"
        else:
            # Fallback to old formats
            m = _re3.search(r'_([A-Za-z0-9]{1,4})_(\d+)(?:_|$)', base_name)
            if m:
                key_part = m.group(1)
                bpm_pct  = int(m.group(2))
                label    = f"{key_part} {bpm_pct}%"
            else:
                m2 = _re3.search(r'_bpm(\d+)', base_name)
                bpm_pct = int(m2.group(1)) if m2 else 0
                key_part = 'C'
                label = f"{bpm_pct}%"
            
        # Find any matching stems on disk
        stems_prefix = f"{base_name}_stem_"
        stem_files = sorted([sf for sf in os.listdir("renders") if sf.startswith(stems_prefix)])
        saved_stem_urls = [f"/vocalido/audio/{sf}" for sf in stem_files]

        result.append({
            "filename": f, 
            "url": f"/vocalido/audio/{f}",
            "bpm_pct": bpm_pct, 
            "song_key": key_part, 
            "lyric_mode": lyric_mode,
            "engine_id": voice,
            "label": label,
            "saved_stem_urls": saved_stem_urls
        })
    return {"renders": result, "song_id": song_id}

@app.delete("/studio/renders/{filename}")
def delete_render(filename: str, owner_id: Optional[str] = None, song_id: Optional[str] = None):
    """Delete a saved render file."""
    import re as _re
    if not _re.match(r'^[a-zA-Z0-9_.-]+$', filename):
        return JSONResponse({"error": "Invalid filename"}, status_code=400)
        
    # Security/caching ownership check:
    # If the file has a private owner format song_{owner_id}_{song_id}_...
    # we verify that the query parameter owner_id matches.
    if filename.startswith("song_") and song_id:
        safe_id = _re.sub(r'[^a-zA-Z0-9_-]', '_', song_id)[:40]
        global_prefix = f"song_{safe_id}_"
        
        # If it doesn't match the global prefix, it must be private.
        if not filename.startswith(global_prefix):
            # Verify if owner_id is provided and if it matches the private prefix.
            private_prefix = None
            if owner_id:
                safe_owner = _re.sub(r'[^a-zA-Z0-9_-]', '_', owner_id)[:40]
                private_prefix = f"song_{safe_owner}_{safe_id}_"
            
            if not private_prefix or not filename.startswith(private_prefix):
                return JSONResponse({"error": "Unauthorized. This render belongs to another user."}, status_code=403)

    fpath = os.path.join("renders", filename)
    if os.path.exists(fpath):
        os.remove(fpath)
        # Also remove stems
        stem_ext = ".wav" if filename.endswith(".wav") else ".mp3"
        base_name = filename.replace(stem_ext, "")
        for sf in os.listdir("renders"):
            if sf.startswith(f"{base_name}_stem_"):
                try:
                    os.remove(os.path.join("renders", sf))
                except Exception:
                    pass
        return {"ok": True, "deleted": filename}
    return JSONResponse({"error": "File not found"}, status_code=404)

@app.post("/studio/preview-note")
def studio_preview_note(req: StudioNoteReq):
    # Check if a specific neural engine is selected/requested in params
    requested_voice = req.params.get("voice", "default").lower() if req.params else "default"
    
    # Check if target_voice maps to one of our loaded or lazy-loadable DiffSinger engines
    _target_engine = None
    target_id = requested_voice
    
    # Resolve 'default' to 'lotte_v_ai_dol'
    if target_id == 'default' or target_id == '':
        target_id = 'lotte_v_ai_dol'
        
    if target_id in _ds_engines:
        _target_engine = _ds_engines[target_id]
    elif target_id in _lazy_voice_paths:
            # Lazy load the voice on note preview
            ckpt, cfg = _lazy_voice_paths[target_id]
            print(f"[LazyLoad-Note] 🔄 Loading voice '{target_id}' on demand...")
            try:
                from ds_onnx_engine import DiffSingerONNXEngine
                engine = DiffSingerONNXEngine(os.path.dirname(ckpt), language='en')
                if engine.is_ready:
                    _ds_engines[target_id] = engine
                    _target_engine = engine
                    del _lazy_voice_paths[target_id]
                    print(f"[LazyLoad-Note] ✅ Loaded successfully for note preview!")
            except Exception as e:
                print(f"[LazyLoad-Note] ❌ Failed to load: {e}")
                
    if _target_engine:
        # Synthesize using DiffSinger ONNX engine (it takes a phrase notes list)
        notes = [{'midi': req.midi, 'duration': req.duration, 'startTime': 0.0, 'lyric': 'ah'}]
        try:
            audio = _target_engine.synthesize_phrase(notes, req.params)
            if audio is not None:
                b64, mime = audio_to_base64_mp3(audio)
                return {"audio_b64": b64, "mime_type": mime, "midi": req.midi, "engine": "diffsinger"}
        except Exception as e:
            print(f"[PreviewNote] DiffSinger synth failed: {e}")

    # Fallback to default sampler or basic AI engine if DiffSinger is not requested/available
    if STUDIO_OK:
        audio = studio_synthesize_note(req.midi, req.duration, get_library(), req.params)
        b64, mime = audio_to_base64_mp3(audio)
        return {"audio_b64": b64, "mime_type": mime, "midi": req.midi, "engine": "studio"}
    elif AI_OK and _ai_engine:
        audio = _ai_engine.synthesize_note(req.midi, req.duration, req.params)
        b64, mime = _ai_engine.audio_to_base64_mp3(audio) # Assuming ai_engine also returns tuple or updated
        return {"audio_b64": b64, "mime_type": mime, "midi": req.midi, "engine": "ai"}
    else:
        return JSONResponse({"error": "No engine available"}, status_code=503)

@app.post("/studio/synthesis")
def studio_synthesis(req: StudioSynthesisReq):
    if not STUDIO_OK:
        return JSONResponse({"error":"Studio unavailable"},status_code=503)
    if not req.notes:
        return JSONResponse({"error":"No valid notes"},status_code=400)
    import time
    audio = studio_synthesize_phrase(req.notes, get_library(), req.params)
    
    # Robust fallback if synthesized audio is near-silent or empty
    if np.max(np.abs(audio)) < 0.001:
        print("[Synthesis] ⚠️ Output silent. Falling back to sample-based.")
        audio = synthesize_sample_based(req.notes, bpm=req.params.get('bpm', 120))

    outname = f"studio_vocal_{int(time.time()*1000)}.mp3"
    outpath = os.path.join("renders", outname)
    os.makedirs("renders", exist_ok=True)
    
    from audio_utils import save_audio_as_mp3  # absolute import
    success = save_audio_as_mp3(audio, outpath, sr=STUDIO_SR)
    
    if not success:
        # Fallback to wav if mp3 saving fails
        outname = outname.replace(".mp3", ".wav")
        outpath = outpath.replace(".mp3", ".wav")
        sf.write(outpath, audio, STUDIO_SR)
        
    return {"audio_url": f"/vocalido/audio/{outname}"}

@app.post("/song/synthesize")
async def song_synthesize(file: UploadFile = File(...), bpm: float = 120.0):
    """Accept a MIDI file, convert notes to the internal format, and synthesize the full song.
    The generated audio is saved to the renders folder and a URL is returned.
    """
    import io, pretty_midi
    midi_bytes = await file.read()
    midi = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
    notes = []
    for instrument in midi.instruments:
        for n in instrument.notes:
            notes.append({
                "midi": n.pitch,
                "duration": n.end - n.start,
                "startTime": n.start,
                "lyric": ""
            })
    notes.sort(key=lambda x: x["startTime"])
    audio = synthesize_sample_based([VocalNote(**note) for note in notes], bpm=bpm)
    outname = f"song_{int(time.time()*1000)}.wav"
    outpath = os.path.join("renders", outname)
    sf.write(outpath, audio, SR)
    return {"audio_url": f"/vocalido/audio/{outname}"}

# ----------------------------------------------------------------------
# XML (MusicXML) synthesis endpoint – parses MusicXML and uses sample‑based engine
# ----------------------------------------------------------------------
@app.post("/xml/synthesize")
async def xml_synthesize(file: UploadFile = File(...), bpm: float = 120.0):
    """Accept a MusicXML file, convert to notes, synthesize, and return audio URL.
    Uses sample‑based pitch‑shift synthesis (no phoneme data required).
    """
    import tempfile, music21
    # Save uploaded XML to a temporary file for music21 to read
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xml")
    content = await file.read()
    tmp.write(content)
    tmp.close()
    try:
        score = music21.converter.parse(tmp.name)
        notes = []
        for n in score.flat.notes:
            if isinstance(n, music21.note.Note):
                notes.append({
                    "midi": n.pitch.midi,
                    "duration": float(n.quarterLength),
                    "startTime": float(n.offset),
                    "lyric": ""
                })
            elif isinstance(n, music21.chord.Chord):
                # Use the highest note of the chord for synthesis (simple fallback)
                notes.append({
                    "midi": max(p.midi for p in n.pitches),
                    "duration": float(n.quarterLength),
                    "startTime": float(n.offset),
                    "lyric": ""
                })
        notes.sort(key=lambda x: x["startTime"])
        audio = synthesize_sample_based([VocalNote(**note) for note in notes], bpm=bpm)
        outname = f"xmlsong_{int(time.time()*1000)}.wav"
        outpath = os.path.join("renders", outname)
        sf.write(outpath, audio, SR)
        return {"audio_url": f"/vocalido/audio/{outname}"}
    finally:
        import os; os.unlink(tmp.name)

@app.post("/pdf/preview")
async def get_pdf_preview(file: UploadFile = File(...)):
    """
    Converts the first page of a PDF to a base64-encoded image for frontend preview.
    Uses PyMuPDF (fitz) for fast rendering.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        if doc.page_count == 0:
            raise HTTPException(status_code=400, detail="PDF is empty")
        
        page = doc[0] # Get first page
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2)) # 2x zoom for better resolution
        img_data = pix.tobytes("jpg")
        
        base64_img = base64.b64encode(img_data).decode('utf-8')
        doc.close()
        
        return {
            "mime": "image/jpeg",
            "data": f"data:image/jpeg;base64,{base64_img}",
            "pages": doc.page_count
        }
    except Exception as e:
        print(f"❌ [PDF Preview Error] {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")


# ── /vocalido/* prefix — frontend calls use this prefix ──────────────────────
# Mirror all routes under /vocalido so that requests like
# POST /vocalido/studio/preview work identically to POST /studio/preview
_vocalido_router = APIRouter(prefix="/vocalido")
_vocalido_router.add_api_route("/studio/voices",       get_voices,          methods=["GET"])
_vocalido_router.add_api_route("/studio/preview",      studio_preview,      methods=["POST"])
_vocalido_router.add_api_route("/studio/api/client-log", studio_client_log, methods=["POST"])
_vocalido_router.add_api_route("/studio/preview-note", studio_preview_note, methods=["POST"])
_vocalido_router.add_api_route("/studio/synthesis",    studio_synthesis,    methods=["POST"])
_vocalido_router.add_api_route("/studio/library",      studio_library,      methods=["GET"])
_vocalido_router.add_api_route("/v1/synthesis",        synthesize,          methods=["POST"])
_vocalido_router.add_api_route("/health",              health,              methods=["GET"])
_vocalido_router.add_api_route("/training/status",     training_status,     methods=["GET"])
_vocalido_router.add_api_route("/training/update",     training_update,     methods=["POST"])
_vocalido_router.add_api_route("/model/set",           set_model,           methods=["POST"])
_vocalido_router.add_api_route("/training/set-engine", set_engine,          methods=["POST"])
app.include_router(_vocalido_router)
print("[Routes] ✅ /vocalido/* prefix routes registered")

# ── Gemini Agentic AI Endpoints ────────────────────────────────────────────────
@app.post("/api/arrange")
async def arrange_music(request: Request):
    try:
        from gemini_engine import generate_arrangement
        data = await request.json()
        result = generate_arrangement(
            prompt=data.get("prompt", ""),
            style=data.get("style", "Pop"),
            key=data.get("key", "C"),
            bpm=int(data.get("bpm", 120)),
            num_sections=len(data.get("sections", [1]))
        )
        if "error" in result:
            return JSONResponse({"success": False, "message": result["error"]}, status_code=500)
        return JSONResponse({"success": True, "message": "Arrangement generated", "data": result})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)

@app.post("/api/lyrics")
async def write_lyrics(request: Request):
    try:
        from gemini_engine import generate_lyrics
        data = await request.json()
        result = generate_lyrics(
            prompt=data.get("prompt", ""),
            melody_xml=data.get("melodyXml", "")
        )
        if "error" in result:
            return JSONResponse({"success": False, "message": result["error"]}, status_code=500)
        return JSONResponse({"success": True, "message": "Lyrics generated", "data": result})
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)

_vocalido_router.add_api_route("/api/arrange", arrange_music, methods=["POST"])
_vocalido_router.add_api_route("/api/lyrics", write_lyrics, methods=["POST"])

if __name__ == "__main__":
    print("=" * 55)
    print("🎤 Vocalido SVS v5.0 — AI Acoustic Model Engine")
    print(f"   Checkpoint: {CHECKPOINT_PATH}")
    print(f"   Voice source: {VOICE_SOURCE_PATH}")
    print(f"   Engine: {'AI Model' if AI_OK else 'Sample-Based Fallback'}")
    print("🎙️  Studio: /studio/library | /studio/preview")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=5001)
