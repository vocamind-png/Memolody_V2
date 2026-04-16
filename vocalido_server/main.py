"""
Vocalido SVS Server v5.0 — AI Acoustic Model Engine
Uses the trained neural network checkpoint for voice synthesis.
Falls back to sample-based if model not available.
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
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

# ── Config ────────────────────────────────────────────────────────────────────
VOICE_SOURCE_PATH = "/Users/paisan/Downloads/singeria_render.wav"
VOICE_SOURCE_MIDI = 58.6  # B3 — detected from analysis
SR = 44100
BPM_DEFAULT = 120.0

app = FastAPI(title="Vocalido SVS Engine", version="5.1.0")
os.makedirs("renders", exist_ok=True)
os.makedirs("voicebanks", exist_ok=True)
app.mount("/audio", StaticFiles(directory="renders"), name="audio")
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

# ── Training State (in-memory, updated by Colab via /training/update) ─────────
_training_state = {
    "projectPct": 25,       # Overall project % (0–100)
    "trainingPct": 0,       # Current training pipeline % (0–100)
    "status": "preparing",  # preparing | training | exporting | done | error
    "engine": "sampler",    # sampler | diffsinger
    "gpu_active": False,
    "est_cost_usd": 0.0,
    "last_heartbeat": None, # timestamp of last Colab ping
    "phases": {},           # phase_id → {s, p, d}
    "log": []
}

# ── Pre-load voice source ─────────────────────────────────────────────────────
print("Loading voice source...")
_voice_raw, _voice_sr = librosa.load(VOICE_SOURCE_PATH, sr=SR, mono=True)

# Extract best 2-second voiced segment for use as base sample
def _extract_base_sample(y, sr, duration=2.0):
    """Find a stable, voiced segment to use as pitch-shift source"""
    # Analyze up to 5 minutes to find the best part
    analysis_len = min(len(y), sr * 300) 
    f0, voiced, _ = librosa.pyin(
        y[:analysis_len],
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C6'),
        sr=sr
    )
    valid_frames = np.where(~np.isnan(f0) & voiced)[0]
    
    if len(valid_frames) == 0:
        # Fallback to the loudest 2-second segment if pitch detection fails
        hop = 512
        rms = librosa.feature.rms(y=y, hop_length=hop)
        best_frame = np.argmax(rms)
        best_start = max(0, int(best_frame * hop - (sr * duration / 2)))
    else:
        # Find longest run of consecutive voiced frames or just the most stable
        best_start = valid_frames[len(valid_frames)//2] * 512 # Take middle of voiced
    
    n_samples = int(duration * sr)
    segment = y[best_start:best_start + n_samples].copy()
    
    if len(segment) < n_samples:
        segment = np.pad(segment, (0, n_samples - len(segment)))
    
    # Normalize and boost
    peak = np.max(np.abs(segment))
    if peak > 0.001:
        segment = segment / peak * 0.95
        
    return segment

print("Extracting base voice sample (Deep analysis)...")
_base_sample = _extract_base_sample(_voice_raw, SR, duration=2.0)
print(f"✅ Voice source ready! Base sample: {len(_base_sample)/SR:.2f}s at MIDI {VOICE_SOURCE_MIDI:.1f}")


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
        if len(shifted) > 0:
            reps = (target_samples // len(shifted)) + 1
            looped = np.tile(shifted, reps)[:target_samples]
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
    
    # Normalize
    peak = np.max(np.abs(output))
    if peak > 0:
        output = (output / peak * 0.85).astype(np.float32)
    
    return output


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


# ----------------------------------------------------------------------
# Model switch endpoint (used by UI)
# ----------------------------------------------------------------------
from ai_engine import VocalidoAIEngine

# Global engine instance (shared across requests)
engine = VocalidoAIEngine(
    checkpoints_dir=os.path.join(os.path.dirname(__file__), "checkpoints"),
    default_model="vocalido_v1"
)

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
    return {
        "engine": "Vocalido SVS v5 — Sample Pitch-Shift",
        "voice_source": os.path.basename(VOICE_SOURCE_PATH),
        "source_midi": VOICE_SOURCE_MIDI,
        "status": "online"
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

CHECKPOINT_PATH = os.path.join(os.path.dirname(__file__), 'voicebanks', 'vocalido_master', 'acoustic_final.ckpt')

try:
    from ai_engine import VocalidoAIEngine
    # The first arg is the BASE checkpoints directory, not the .ckpt file itself
    CP_DIR = os.path.dirname(os.path.dirname(CHECKPOINT_PATH))
    MD_NAME = os.path.basename(os.path.dirname(CHECKPOINT_PATH))
    _ai_engine = VocalidoAIEngine(CP_DIR, MD_NAME, VOICE_SOURCE_PATH)
    AI_OK = _ai_engine.is_ready
    if AI_OK:
        print("✅ AI Voice Engine loaded (trained model)")
    else:
        print("⚠️  AI Engine: model not ready")
except Exception as _e:
    import traceback; traceback.print_exc()
    AI_OK = False
    _ai_engine = None
    print(f"⚠️  AI Engine failed: {_e}")

# Also load voice_studio as fallback
try:
    from voice_studio import get_library, synthesize_phrase as studio_synthesize_phrase, synthesize_note as studio_synthesize_note, SR as STUDIO_SR
    from audio_utils import audio_to_base64_wav, audio_to_base64_mp3
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

class StudioPreviewReq(BaseModel):
    phrase: str = ""
    notes: list = []
    params: dict = {}

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
        if t in SOL_MAP:
            notes.append({'midi': SOL_MAP[t], 'duration': 0.75})
        else:
            m = re.match(r'^([A-Ga-g])([#sb]?)(\d)$', tok)
            if m:
                nm={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
                n=nm.get(m.group(1).upper(),0)+{'#':1,'s':1,'b':-1}.get(m.group(2),0)
                notes.append({'midi':(int(m.group(3))+1)*12+n,'duration':0.75})
    return notes

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
    
    # Check if lyrics are present
    has_lyrics = any(n.get('lyric') and str(n.get('lyric')).strip() not in ('-', '~', '_', 'rest') for n in notes)
    
    # ── DETERMINING THE BEST ENGINE ──
    # PRIORITY 1: Voice Studio Sampler (Real human samples, very stable)
    # PRIORITY 2: Neural AI Model (Experimental timbre transfer)
    # PRIORITY 3: Lyrics SVS Engine (TTS-based)
    
    audio = None
    engine_name = "unknown"

    # 1. Try Voice Studio (Sampler) - Most reliable human sound
    if STUDIO_OK:
        print(f"[Studio] 🎤 Sampler Synthesis: {len(notes)} notes...")
        lib = get_library()
        if lib:
            try:
                audio = studio_synthesize_phrase(notes, lib, req.params)
                engine_name = "studio_sampler"
            except Exception as e:
                print(f"[Studio] ❌ Synthesis Failed: {e}")
                audio = None
    
    # 2. Try Neural AI Engine - If Sampler not ready or failed
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

    # 3. Try Lyrics TTS Engine (only if specified or as fallback for lyrics)
    if audio is None and LYRICS_OK and has_lyrics:
        print(f"[Lyrics SVS] 🎤 TTS Synthesis: {len(notes)} notes...")
        try:
            v_notes = [VocalNote(
                pitch=int(n.get('pitch', 60) or 60),
                duration=float(n.get('duration', 0.5) or 0.5),
                startTime=float(n.get('startTime',0) or 0),
                lyric=str(n.get('lyric', 'La') or 'La')
            ) for n in notes]
            audio = synthesize_lyrics_phrase(v_notes, req.params)
            engine_name = "lyrics_tts"
        except Exception as e:
            print(f"[Lyrics SVS] ❌ Error: {e}")
            audio = None

    # 4. Final Fallback: Simple Sample-Based Shift
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

    b64, mime = audio_to_base64_mp3(audio)
    return {
        "audio_b64": b64, 
        "mime_type": mime, 
        "duration": float(len(audio)) / SR, 
        "notes": len(notes), 
        "engine": engine_name
    }

@app.post("/studio/preview-note")
def studio_preview_note(req: StudioNoteReq):
    # Use Voice Studio (real voice) as primary
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
    
    from audio_utils import save_audio_as_mp3
    success = save_audio_as_mp3(audio, outpath, sr=STUDIO_SR)
    
    if not success:
        # Fallback to wav if mp3 saving fails
        outname = outname.replace(".mp3", ".wav")
        outpath = outpath.replace(".mp3", ".wav")
        sf.write(outpath, audio, STUDIO_SR)
        
    return {"audio_url": f"/vocalido/audio/{outname}"}

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

if __name__ == "__main__":
    print("=" * 55)
    print("🎤 Vocalido SVS v5.0 — AI Acoustic Model Engine")
    print(f"   Checkpoint: {CHECKPOINT_PATH}")
    print(f"   Voice source: {VOICE_SOURCE_PATH}")
    print(f"   Engine: {'AI Model' if AI_OK else 'Sample-Based Fallback'}")
    print("🎙️  Studio: /studio/library | /studio/preview")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=5001)
