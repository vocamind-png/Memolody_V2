"""
Vocalido Lyrics SVS Engine — Text-to-Singing Voice Synthesis
Converts lyrics + notes into singing audio using TTS + pitch/time manipulation.
"""
import asyncio
import numpy as np
import librosa
import soundfile as sf
import io, os, base64, tempfile
import edge_tts

SR = 44100

# Voice settings
TH_VOICE = "th-TH-PremwadeeNeural"  # Thai female
EN_VOICE = "en-US-AriaNeural"       # English female


def _detect_language(text: str) -> str:
    """Simple language detection"""
    thai_chars = sum(1 for c in text if '\u0E00' <= c <= '\u0E7F')
    return 'th' if thai_chars > len(text) * 0.3 else 'en'


async def _tts_to_audio(text: str, voice: str, rate: str = "+0%") -> np.ndarray:
    """Generate speech audio from text using edge-tts"""
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        tmp_path = f.name
    try:
        await communicate.save(tmp_path)
        audio, sr = librosa.load(tmp_path, sr=SR, mono=True)
        return audio
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def _estimate_speech_pitch(audio: np.ndarray) -> float:
    """Estimate the fundamental frequency of speech"""
    f0, voiced, _ = librosa.pyin(
        audio, fmin=80, fmax=600, sr=SR,
        frame_length=2048
    )
    valid = f0[~np.isnan(f0)]
    if len(valid) > 0:
        return float(np.median(valid))
    return 200.0  # default female speaking range


def synthesize_lyrics_phrase(notes: list, params: dict = None) -> np.ndarray:
    """
    Synthesize a full phrase with lyrics.
    Each note: {midi, duration (beats), startTime (beats), lyric}
    """
    params = params or {}
    bpm = float(params.get('bpm', 120.0))
    beat_sec = 60.0 / bpm
    
    if not notes:
        return np.zeros(SR, dtype=np.float32)
    
    # Calculate total duration
    max_time = max((n.get('startTime', 0) + n.get('duration', 0.5)) for n in notes)
    total_samples = int((max_time * beat_sec + 1.0) * SR)
    output = np.zeros(total_samples, dtype=np.float32)
    
    # Group consecutive notes with lyrics into phrases for more natural TTS
    # For now, synthesize each note individually
    loop = asyncio.new_event_loop()
    
    for note in notes:
        midi = note.get('midi') or note.get('pitch') or 60
        dur_beats = note.get('duration', 0.5)
        start_beats = note.get('startTime', 0)
        lyric = note.get('lyric', '').strip()
        
        if not lyric or lyric in ('-', '~', '_', 'rest', ''):
            continue
        
        dur_sec = dur_beats * beat_sec
        start_sec = start_beats * beat_sec
        target_samples = int(dur_sec * SR)
        target_hz = _midi_to_hz(midi)
        
        try:
            # Detect language and select voice
            lang = _detect_language(lyric)
            voice = TH_VOICE if lang == 'th' else EN_VOICE
            
            # Generate speech for the lyric
            speech = loop.run_until_complete(_tts_to_audio(lyric, voice))
            
            if len(speech) < 100:
                continue
            
            # Trim silence from edges
            trimmed, _ = librosa.effects.trim(speech, top_db=25)
            if len(trimmed) < 100:
                trimmed = speech
            
            # Estimate speech pitch
            speech_hz = _estimate_speech_pitch(trimmed)
            
            # Calculate how many semitones to shift
            semitones = 12 * np.log2(target_hz / speech_hz)
            
            # Pitch-shift to target note
            pitched = librosa.effects.pitch_shift(
                trimmed, sr=SR, n_steps=float(semitones)
            )
            
            # Time-stretch to match note duration
            if len(pitched) != target_samples and target_samples > 0:
                stretch_rate = len(pitched) / target_samples
                if 0.25 < stretch_rate < 4.0:  # reasonable range
                    pitched = librosa.effects.time_stretch(pitched, rate=stretch_rate)
            
            # Trim or pad to exact length
            if len(pitched) > target_samples:
                pitched = pitched[:target_samples]
            elif len(pitched) < target_samples:
                pitched = np.pad(pitched, (0, target_samples - len(pitched)))
            
            # Apply envelope
            fade = min(int(0.01 * SR), target_samples // 4)
            if fade > 0:
                pitched[:fade] *= np.linspace(0, 1, fade)
                pitched[-fade:] *= np.linspace(1, 0, fade)
            
            # Normalize segment
            peak = np.max(np.abs(pitched))
            if peak > 0.001:
                pitched = pitched / peak * 0.85
            
            # Place in output
            start_idx = int(start_sec * SR)
            end_idx = min(start_idx + len(pitched), len(output))
            if start_idx < len(output):
                output[start_idx:end_idx] += pitched[:end_idx - start_idx]
                
        except Exception as e:
            print(f"[Lyrics SVS] Error on '{lyric}': {e}")
            continue
    
    loop.close()
    
    # Final normalization
    peak = np.max(np.abs(output))
    if peak > 0.001:
        output = (output / peak * 0.88).astype(np.float32)
    
    return output


def audio_to_base64_wav(audio: np.ndarray) -> str:
    """Convert numpy audio to base64 WAV string"""
    buf = io.BytesIO()
    sf.write(buf, audio, SR, format='WAV', subtype='PCM_16')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


# Quick test
if __name__ == '__main__':
    notes = [
        {'midi': 60, 'duration': 1.0, 'startTime': 0, 'lyric': 'Do'},
        {'midi': 62, 'duration': 1.0, 'startTime': 1, 'lyric': 'Re'},
        {'midi': 64, 'duration': 1.0, 'startTime': 2, 'lyric': 'Mi'},
        {'midi': 65, 'duration': 1.0, 'startTime': 3, 'lyric': 'Fa'},
        {'midi': 67, 'duration': 1.0, 'startTime': 4, 'lyric': 'Sol'},
    ]
    print("Synthesizing Do Re Mi Fa Sol...")
    audio = synthesize_lyrics_phrase(notes, {'bpm': 120})
    sf.write('/tmp/lyrics_svs_test.wav', audio, SR)
    print(f"✅ Saved /tmp/lyrics_svs_test.wav ({len(audio)/SR:.2f}s)")
