"""
Vocalido SVS Server v4.0 — Sample-Based Pitch Shifting Engine
Uses a real singing voice sample + high-quality pitch shifting
Works reliably on Apple Silicon — no ONNX required!
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
import os, time, uvicorn, numpy as np, soundfile as sf
import librosa

# ── Config ────────────────────────────────────────────────────────────────────
VOICE_SOURCE_PATH = "/Users/paisan/Downloads/singeria_render.wav"
VOICE_SOURCE_MIDI = 58.6  # B3 — detected from analysis
SR = 44100
BPM_DEFAULT = 120.0

app = FastAPI(title="Vocalido SVS Engine", version="4.0.0")
os.makedirs("renders", exist_ok=True)
app.mount("/audio", StaticFiles(directory="renders"), name="audio")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Pre-load voice source ─────────────────────────────────────────────────────
print("Loading voice source...")
_voice_raw, _voice_sr = librosa.load(VOICE_SOURCE_PATH, sr=SR, mono=True)

# Extract best 2-second voiced segment for use as base sample
def _extract_base_sample(y, sr, duration=2.0):
    """Find a stable, voiced segment to use as pitch-shift source"""
    f0, voiced, _ = librosa.pyin(
        y[:sr * 60],  # analyze first 60s
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C6'),
        sr=sr
    )
    valid_frames = np.where(~np.isnan(f0) & voiced)[0]
    if len(valid_frames) == 0:
        return y[:int(sr * duration)]
    
    # Find longest run of consecutive voiced frames
    best_start_frame = valid_frames[0]
    hop = 512
    best_start_sample = best_start_frame * hop
    n_samples = int(duration * sr)
    segment = y[best_start_sample:best_start_sample + n_samples]
    if len(segment) < n_samples:
        segment = np.pad(segment, (0, n_samples - len(segment)))
    return segment

print("Extracting base voice sample...")
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
def synthesize_sample_based(notes: List[VocalNote], bpm: float = 120.0) -> np.ndarray:
    """
    For each note:
    1. Pitch-shift base sample to target MIDI note
    2. Time-stretch to match note duration
    3. Apply envelope (attack/release)
    4. Place at correct time position
    """
    BEAT_SEC = 60.0 / bpm
    
    if not notes:
        return np.zeros(int(SR * 2), dtype=np.float32)
    
    total_sec = max((n.startTime + n.duration) * BEAT_SEC for n in notes) + 0.5
    output = np.zeros(int(total_sec * SR), dtype=np.float32)
    
    for note in notes:
        target_midi = float(note.pitch)
        semitones = target_midi - VOICE_SOURCE_MIDI  # how many semitones to shift
        dur_sec = note.duration * BEAT_SEC
        start_sec = note.startTime * BEAT_SEC
        
        # 1. Pitch-shift base sample
        shifted = librosa.effects.pitch_shift(
            _base_sample,
            sr=SR,
            n_steps=semitones,
            bins_per_octave=12
        )
        
        # 2. Time-stretch to match note duration
        target_samples = int(dur_sec * SR)
        if target_samples < 1:
            continue
        
        current_samples = len(shifted)
        if current_samples != target_samples:
            stretch_rate = current_samples / target_samples
            stretched = librosa.effects.time_stretch(shifted, rate=stretch_rate)
        else:
            stretched = shifted
        
        # Trim or pad to exact length
        if len(stretched) > target_samples:
            stretched = stretched[:target_samples]
        elif len(stretched) < target_samples:
            stretched = np.pad(stretched, (0, target_samples - len(stretched)))
        
        # 3. Apply envelope (smooth attack & release)
        attack_ms = min(50, dur_sec * 1000 * 0.1)  # 10% or 50ms max
        release_ms = min(80, dur_sec * 1000 * 0.15)  # 15% or 80ms max
        attack_s = int(attack_ms * SR / 1000)
        release_s = int(release_ms * SR / 1000)
        
        env = np.ones(target_samples, dtype=np.float32)
        if attack_s > 0:
            env[:attack_s] = np.linspace(0.0, 1.0, attack_s)
        if release_s > 0:
            env[-release_s:] = np.linspace(1.0, 0.0, release_s)
        
        stretched = stretched * env
        
        # 4. Mix into output at correct position
        start_idx = int(start_sec * SR)
        end_idx = start_idx + len(stretched)
        
        if end_idx <= len(output):
            output[start_idx:end_idx] += stretched
        else:
            available = len(output) - start_idx
            if available > 0:
                output[start_idx:] += stretched[:available]
    
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


@app.get("/health")
def health():
    return {
        "engine": "Vocalido SVS v4 — Sample Pitch-Shift",
        "voice_source": os.path.basename(VOICE_SOURCE_PATH),
        "source_midi": VOICE_SOURCE_MIDI,
        "status": "online"
    }


# ── Voice Studio API ──────────────────────────────────────────────────────
import sys as _sys
_sys.path.insert(0, os.path.dirname(__file__))
try:
    from voice_studio import get_library, synthesize_phrase, synthesize_note, audio_to_base64_wav, SR as STUDIO_SR
    STUDIO_OK = True
    print("✅ Voice Studio loaded")
except Exception as _e:
    STUDIO_OK = False
    print(f"⚠️  Voice Studio: {_e}")

class StudioPreviewReq(BaseModel):
    phrase: str = "Do Re Mi Fa Sol La Ti Do"
    params: dict = {}

class StudioNoteReq(BaseModel):
    midi: int = 60
    duration: float = 1.0
    params: dict = {}

class StudioSynthesisReq(BaseModel):
    notes: list = []
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
    lib = get_library() if STUDIO_OK else {}
    nnames=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    return {
        "count": len(lib),
        "notes": {midi: {'name':nnames[midi%12]+str(midi//12-1),
                         'duration':float(len(v['audio']))/STUDIO_SR}
                  for midi,v in lib.items()},
        "range_min": min(lib.keys()) if lib else 0,
        "range_max": max(lib.keys()) if lib else 0,
    }

@app.post("/studio/preview")
def studio_preview(req: StudioPreviewReq):
    if not STUDIO_OK:
        return JSONResponse({"error":"Studio unavailable"},status_code=503)
    notes = parse_phrase(req.phrase)
    if not notes:
        return JSONResponse({"error":"No valid notes"},status_code=400)
    audio = synthesize_phrase(notes, get_library(), req.params)
    return {"audio_b64": audio_to_base64_wav(audio),
            "duration": float(len(audio))/STUDIO_SR, "notes": len(notes)}

@app.post("/studio/preview-note")
def studio_preview_note(req: StudioNoteReq):
    if not STUDIO_OK:
        return JSONResponse({"error":"Studio unavailable"},status_code=503)
    audio = synthesize_note(req.midi, req.duration, get_library(), req.params)
    return {"audio_b64": audio_to_base64_wav(audio), "midi": req.midi}

@app.post("/studio/synthesis")
def studio_synthesis(req: StudioSynthesisReq):
    if not STUDIO_OK:
        return JSONResponse({"error":"Studio unavailable"},status_code=503)
    if not req.notes:
        return JSONResponse({"error":"No valid notes"},status_code=400)
    import time
    audio = synthesize_phrase(req.notes, get_library(), req.params)
    outname = f"studio_vocal_{int(time.time()*1000)}.wav"
    outpath = os.path.join("renders", outname)
    os.makedirs("renders", exist_ok=True)
    sf.write(outpath, audio, STUDIO_SR)
    return {"audio_url": f"/vocalido/audio/{outname}"}


if __name__ == "__main__":
    print("=" * 55)
    print("🎤 Vocalido SVS v4.0 — Sample-Based Pitch Shifting")
    print(f"   Voice source: {VOICE_SOURCE_PATH}")
    print("🎙️  Studio: /studio/library | /studio/preview")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=5001)
