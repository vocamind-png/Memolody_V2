"""
Vocalido Voice Studio — backend processor
Handles: sample library, timbre transform, synthesis preview
"""
import numpy as np
import soundfile as sf
import librosa
import io, os, json, base64
from pathlib import Path
from scipy import signal

# ── Sample directory: use permanent project-relative path ─────────────────────
# Priority: 1) female voicebank, 2) male voicebank, 3) any voicebank subdir
_BASE_DIR = Path(__file__).parent / "voicebanks"
_CANDIDATE_DIRS = [
    _BASE_DIR / "female" / "ophelia_en_test",
    _BASE_DIR / "male",
    _BASE_DIR / "female",
    _BASE_DIR,
]

def _find_sample_dir() -> Path:
    """Find the first directory that contains .wav files"""
    for d in _CANDIDATE_DIRS:
        if d.exists() and any(d.glob("*.wav")):
            return d
    # Fallback: create default path so the user knows where to put samples
    default = _BASE_DIR / "female" / "ophelia_en_test"
    default.mkdir(parents=True, exist_ok=True)
    print(f"[Studio] ⚠️  No WAV samples found. Put your voice samples (.wav) in:\n         {default}")
    return default

SAMPLE_DIR = _find_sample_dir()
SR = 44100

# ── Load sample library ────────────────────────────────────────────────
def load_library():
    """Load all WAV samples from the sample directory.
    Re-evaluates SAMPLE_DIR each call in case files were added after startup.
    """
    global SAMPLE_DIR
    SAMPLE_DIR = _find_sample_dir()  # re-scan in case files were added
    lib = {}
    if not SAMPLE_DIR.exists():
        print("[Studio] ⚠️  Sample directory does not exist — sampler unavailable.")
        return lib
    wav_files = list(SAMPLE_DIR.glob("*.wav"))
    if not wav_files:
        print(f"[Studio] ⚠️  No .wav files in {SAMPLE_DIR} — sampler unavailable.")
        return lib
    for f in sorted(wav_files):
        name = f.stem  # e.g. "A4", "Cs4", "Bb3"
        try:
            audio, sr = sf.read(str(f))
            if audio.ndim > 1:
                audio = audio[:, 0]
            if sr != SR:
                audio = librosa.resample(audio, orig_sr=sr, target_sr=SR)
            # Parse MIDI note from filename
            note_name = name.replace('s', '#')  # Cs4 → C#4
            try:
                midi = librosa_note_to_midi(note_name)
                lib[midi] = {'audio': audio, 'name': note_name, 'file': str(f)}
            except Exception as e:
                # If it's not a note name (like "singeria_render"), just skip it silently
                # print(f"[Studio] Skip {f}: Not a valid note name")
                continue
        except Exception as e:
            print(f"[Studio] Skip {f}: {e}")
    print(f"[Studio] Loaded {len(lib)} samples: MIDI {min(lib.keys()) if lib else '?'}-{max(lib.keys()) if lib else '?'}")
    return lib

def librosa_note_to_midi(name):
    """Convert note name like 'A4', 'C#4', 'Bb3' to MIDI number"""
    try:
        return librosa.note_to_midi(name)
    except:
        # Manual fallback
        note_map = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
        n = name[0].upper()
        rest = name[1:]
        acc = 0
        if rest.startswith('#') or rest.startswith('s'):
            acc = 1; rest = rest[1:]
        elif rest.startswith('b'):
            acc = -1; rest = rest[1:]
        octave = int(rest) if rest else 4
        return note_map[n] + acc + (octave + 1) * 12

# ── Timbre processing ──────────────────────────────────────────────────
def apply_timbre(audio, sr, params):
    """
    Apply timbre transformation to audio segment.
    params: {
        pitch_shift: float (-12 to +12 semitones)
        formant_shift: float (-6 to +6) — changes vocal character
        breathiness: float (0.0 to 1.0)
        vibrato_rate: float (0 to 8 Hz)
        vibrato_depth: float (0.0 to 0.5 semitones)
        reverb: float (0.0 to 1.0)
        warmth: float (-1.0 to +1.0)
        brightness: float (-1.0 to +1.0)
        speed: float (0.5 to 2.0)
    }
    """
    audio = audio.copy().astype(np.float32)

    # 1. Speed (time-stretch without pitch change)
    speed = float(params.get('speed', 1.0))
    if abs(speed - 1.0) > 0.02:
        audio = librosa.effects.time_stretch(audio, rate=speed)

    # 2. Formant shift (simulate different vocal tract)
    #    Stretch time → changes formants → pitch-compensate
    formant = float(params.get('formant_shift', 0.0))
    if abs(formant) > 0.1:
        factor = 2.0 ** (formant / 12.0)
        audio_fmt = librosa.effects.time_stretch(audio, rate=factor)
        compensate = -formant
        audio = librosa.effects.pitch_shift(audio_fmt, sr=sr, n_steps=compensate)
        audio = librosa.util.fix_length(audio, size=len(audio_fmt))

    # 3. Pitch shift
    pitch = float(params.get('pitch_shift', 0.0))
    if abs(pitch) > 0.05:
        audio = librosa.effects.pitch_shift(audio, sr=sr, n_steps=pitch)

    # 4. Vibrato (LFO on pitch)
    vib_rate = float(params.get('vibrato_rate', 0.0))
    vib_depth = float(params.get('vibrato_depth', 0.0))
    if vib_rate > 0.1 and vib_depth > 0.001:
        t = np.arange(len(audio)) / sr
        lfo = np.sin(2 * np.pi * vib_rate * t) * vib_depth
        # Apply as time-varying pitch shift (approximation)
        audio = _apply_vibrato(audio, sr, lfo)

    # 5. EQ — Warmth (low shelf) + Brightness (high shelf)
    warmth = float(params.get('warmth', 0.0))
    brightness = float(params.get('brightness', 0.0))
    if abs(warmth) > 0.05:
        sos = signal.butter(2, 300 / (sr/2), btype='low', output='sos')
        low_band = signal.sosfilt(sos, audio)
        audio = audio + low_band * warmth * 0.5
    if abs(brightness) > 0.05:
        sos = signal.butter(2, 4000 / (sr/2), btype='high', output='sos')
        hi_band = signal.sosfilt(sos, audio)
        audio = audio + hi_band * brightness * 0.5

    # 6. Breathiness (add shaped noise)
    breathiness = float(params.get('breathiness', 0.0))
    if breathiness > 0.01:
        noise = np.random.randn(len(audio)).astype(np.float32)
        # Shape noise to match signal envelope
        env = np.abs(librosa.effects.preemphasis(audio))
        env = np.convolve(env, np.ones(int(sr*0.02))/(sr*0.02), mode='same')
        noise = noise * env * breathiness * 0.4
        audio = audio + noise

    # 7. Simple reverb (comb + allpass approximation)
    reverb = float(params.get('reverb', 0.0))
    if reverb > 0.01:
        audio = _apply_reverb(audio, sr, reverb)

    # Normalize
    peak = np.max(np.abs(audio))
    if peak > 0.001:
        audio = audio / peak * 0.85

    return audio.astype(np.float32)

def _apply_vibrato(audio, sr, lfo_semitones):
    """Apply vibrato using phase vocoder approximation"""
    try:
        # Simplified: use short segments with slight pitch shift
        seg_len = int(sr * 0.02)
        out = np.zeros_like(audio)
        for i in range(0, len(audio), seg_len):
            seg = audio[i:i+seg_len]
            if len(seg) < 10: break
            shift = float(lfo_semitones[min(i, len(lfo_semitones)-1)])
            if abs(shift) > 0.05:
                seg = librosa.effects.pitch_shift(seg, sr=sr, n_steps=shift)
            out[i:i+len(seg)] = seg[:len(out[i:i+seg_len])]
        return out
    except:
        return audio

def _apply_reverb(audio, sr, amount):
    """Simple Schroeder reverb"""
    delays = [int(sr * d) for d in [0.030, 0.037, 0.041, 0.043]]
    out = audio.copy()
    for d in delays:
        if d >= len(audio): continue
        padded = np.pad(audio, (d, 0))[:len(audio)]
        out = out + padded * amount * 0.3
    return out

# ── Synthesis: note → audio ────────────────────────────────────────────
def synthesize_note(midi_note, duration_sec, library, params):
    """Find best sample for midi_note and apply timbre"""
    if not library:
        return np.zeros(int(SR * duration_sec), dtype=np.float32)

    # Find nearest available sample
    available = sorted(library.keys())
    nearest = min(available, key=lambda m: abs(m - midi_note))
    sample = library[nearest]['audio'].copy()

    # Pitch-correct if needed (sample → target note)
    semitone_diff = midi_note - nearest
    if abs(semitone_diff) > 0.1:
        sample = librosa.effects.pitch_shift(sample, sr=SR, n_steps=float(semitone_diff))

    # Trim or loop to match duration
    target_len = int(SR * duration_sec)
    if len(sample) < target_len:
        # Loop with proper crossfade to avoid clicks
        xfade = min(int(SR * 0.05), len(sample) // 4)  # 50ms crossfade
        out = np.zeros(target_len, dtype=np.float32)
        pos = 0
        while pos < target_len:
            chunk_len = min(len(sample), target_len - pos)
            chunk = sample[:chunk_len].copy()
            # Crossfade at loop boundary
            if pos > 0 and xfade > 0:
                fade_len = min(xfade, chunk_len, target_len - pos)
                fade_in = np.linspace(0, 1, fade_len)
                fade_out = np.linspace(1, 0, fade_len)
                # Blend: fade out end of previous, fade in start of new
                out[pos:pos+fade_len] *= fade_out
                chunk[:fade_len] *= fade_in
            out[pos:pos+chunk_len] += chunk[:chunk_len]
            pos += len(sample) - xfade  # overlap by xfade amount
        sample = out[:target_len]
    else:
        sample = sample[:target_len]

    # Apply fade in/out
    fade = min(int(SR * 0.015), len(sample)//4)
    if fade > 0:
        sample[:fade] *= np.linspace(0, 1, fade)
        sample[-fade:] *= np.linspace(1, 0, fade)

    # Apply timbre
    return apply_timbre(sample, SR, params)

def synthesize_phrase(notes, library, params):
    """
    Synthesize a phrase of notes with temporal placement.
    notes: [{'midi': int, 'duration': float, 'startTime': float, 'lyric': str}, ...]
    """
    if not notes:
        return np.zeros(SR, dtype=np.float32)

    bpm = float(params.get('bpm', 120.0))
    BEAT_SEC = 60.0 / bpm
    
    # 1. Determine total length
    # If notes have startTime, use time-based placement. Otherwise use concatenation.
    use_timing = any('startTime' in n for n in notes)
    
    if use_timing:
        max_time = max((n.get('startTime', 0) + n.get('duration', 0.5)) for n in notes)
        total_samples = int((max_time * BEAT_SEC + 1.0) * SR)
        out = np.zeros(total_samples, dtype=np.float32)
        
        for note in notes:
            midi = note.get('midi') or note.get('pitch') or 60
            dur_beats = note.get('duration', 0.5)
            start_beats = note.get('startTime', 0)
            
            dur_sec = dur_beats * BEAT_SEC
            start_sec = start_beats * BEAT_SEC
            
            seg = synthesize_note(midi, dur_sec, library, params)
            
            start_idx = int(start_sec * SR)
            end_idx = min(start_idx + len(seg), len(out))
            if start_idx < len(out):
                out[start_idx:end_idx] += seg[:end_idx-start_idx]
    else:
        # Backward compatibility: Simple concatenation
        crossfade = int(SR * 0.025)
        segments = []
        for note in notes:
            midi = note.get('midi') or note.get('pitch') or 60
            dur = note.get('duration', 0.75)
            # For phrase preview, we use fixed duration if not specified
            seg = synthesize_note(midi, dur, library, params)
            segments.append(seg)
            
        total = sum(len(s) for s in segments) - crossfade * max(0, len(segments)-1)
        out = np.zeros(max(total, SR), dtype=np.float32)
        pos = 0
        for i, seg in enumerate(segments):
            end = pos + len(seg)
            out[pos:end] += seg
            pos += len(seg) - crossfade

    # Normalize to avoid clipping after summation
    px = np.max(np.abs(out))
    if px > 0.001:
        out = (out / px * 0.88).astype(np.float32)
    return out

def audio_to_base64_wav(audio, sr=SR):
    """Convert numpy audio to base64 WAV string"""
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format='WAV', subtype='PCM_16')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')

# ── Global library ─────────────────────────────────────────────────────
_library = None

def get_library():
    global _library
    if _library is None:
        _library = load_library()
    return _library
