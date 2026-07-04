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
ZH_VOICE = "zh-CN-XiaoxiaoNeural"   # Chinese female

# Phonetic map for English solfège lyrics to pronounce correctly in edge-tts
SOLFEGE_MAP = {
    'do': 'doh',
    're': 'ray',
    'mi': 'mee',
    'me': 'mee',
    'fa': 'fah',
    'sol': 'soh',
    'so': 'soh',
    'la': 'lah',
    'ti': 'tee',
    'si': 'see'
}


def _detect_language(text: str) -> str:
    """Simple language detection"""
    thai_chars = sum(1 for c in text if '\u0E00' <= c <= '\u0E7F')
    if thai_chars > len(text) * 0.2:
        return 'th'
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    if chinese_chars > len(text) * 0.2:
        return 'zh'
    return 'en'


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
    
    def get_val(obj, key, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        val = getattr(obj, key, None)
        if val is None and hasattr(obj, 'get'):
            try:
                val = obj.get(key, None)
            except Exception:
                pass
        return val if val is not None else default

    # Calculate total duration directly from seconds
    max_time = max((get_val(n, 'startTime', 0) + get_val(n, 'duration', 0.5)) for n in notes)
    total_samples = int((max_time + 1.0) * SR)
    output = np.zeros(total_samples, dtype=np.float32)
    
    # Group consecutive notes with lyrics into phrases for more natural TTS
    # For now, synthesize each note individually
    loop = asyncio.new_event_loop()
    
    for note in notes:
        midi = get_val(note, 'midi') or get_val(note, 'pitch') or 60
        dur_sec = float(get_val(note, 'duration', 0.5))
        start_sec = float(get_val(note, 'startTime', 0))
        lyric = get_val(note, 'lyric', '').strip()
        
        if not lyric or lyric in ('-', '~', '_', 'rest', ''):
            continue
            
        target_samples = int(dur_sec * SR)
        target_hz = _midi_to_hz(midi)
        
        try:
            # Detect language and select voice
            lang = _detect_language(lyric)
            if lang == 'th':
                voice = TH_VOICE
                tts_lyric = lyric
            elif lang == 'zh':
                voice = ZH_VOICE
                tts_lyric = lyric
            else:
                voice = EN_VOICE
                lyric_clean = lyric.lower().strip()
                pc = int(midi) % 12
                
                # Check for Kodaly single-letter abbreviations
                if lyric_clean == 'd':
                    phonetic = 'doh'
                elif lyric_clean == 'r':
                    phonetic = 'ray'
                elif lyric_clean == 'm':
                    phonetic = 'mee'
                elif lyric_clean == 'f':
                    phonetic = 'fah'
                elif lyric_clean == 's':
                    phonetic = 'soh'
                elif lyric_clean == 'l':
                    phonetic = 'lah'
                elif lyric_clean == 't':
                    phonetic = 'tee'
                # Disambiguate 'me' (E natural vs E flat)
                elif lyric_clean == 'me':
                    phonetic = 'mee' if pc == 4 else 'may'
                # Sharp Chromatic syllables
                elif lyric_clean == 'di':
                    phonetic = 'dee'
                elif lyric_clean == 'ri':
                    phonetic = 'ree'
                elif lyric_clean == 'fi':
                    phonetic = 'fee'
                elif lyric_clean == 'si':
                    phonetic = 'see'
                elif lyric_clean == 'li':
                    phonetic = 'lee'
                # Flat Chromatic syllables (American)
                elif lyric_clean == 'ra':
                    phonetic = 'rah'
                elif lyric_clean == 'se':
                    phonetic = 'say'
                elif lyric_clean == 'le':
                    phonetic = 'lay'
                elif lyric_clean == 'te':
                    phonetic = 'tay'
                # Flat Chromatic syllables (British)
                elif lyric_clean == 'raw':
                    phonetic = 'rah'
                elif lyric_clean == 'maw':
                    phonetic = 'mah'
                elif lyric_clean == 'saw':
                    phonetic = 'say' if pc == 6 else 'saw'
                elif lyric_clean == 'law':
                    phonetic = 'lay' if pc == 8 else 'law'
                elif lyric_clean == 'taw':
                    phonetic = 'tay' if pc == 10 else 'taw'
                # Flat Chromatic syllables (Ju)
                elif lyric_clean == 'ru':
                    phonetic = 'roo'
                elif lyric_clean == 'mu':
                    phonetic = 'moo'
                elif lyric_clean == 'su':
                    phonetic = 'soo'
                elif lyric_clean == 'lu':
                    phonetic = 'loo'
                elif lyric_clean == 'tu':
                    phonetic = 'too'
                # Standard Solfege Syllables
                elif lyric_clean in ('do', 'doh'):
                    phonetic = 'doh'
                elif lyric_clean in ('re', 'ray'):
                    phonetic = 'ray'
                elif lyric_clean in ('mi', 'mee'):
                    phonetic = 'mee'
                elif lyric_clean in ('fa', 'fah'):
                    phonetic = 'fah'
                elif lyric_clean in ('sol', 'soh', 'so'):
                    phonetic = 'soh'
                elif lyric_clean in ('la', 'lah'):
                    phonetic = 'lah'
                elif lyric_clean in ('ti', 'tee'):
                    phonetic = 'tee'
                else:
                    phonetic = lyric
                tts_lyric = phonetic
            
            # Generate speech for the lyric
            speech = loop.run_until_complete(_tts_to_audio(tts_lyric, voice))
            
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
