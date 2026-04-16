import io
import base64
import os
import numpy as np
import soundfile as sf
from pydub import AudioSegment

SR = 44100
FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg"

def audio_to_base64_wav(audio, sr=SR):
    """Convert numpy audio to base64 WAV string"""
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format='WAV', subtype='PCM_16')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')

def audio_to_base64_mp3(audio, sr=SR, bitrate="128k"):
    """Convert numpy audio to base64 MP3 string using pydub"""
    try:
        # 1. Convert float32 to int16
        # Clamp to avoid wrap-around distortion
        audio_clamped = np.clip(audio, -1.0, 1.0)
        audio_int16 = (audio_clamped * 32767).astype(np.int16)
        
        # 2. Create pydub AudioSegment
        seg = AudioSegment(
            audio_int16.tobytes(), 
            frame_rate=sr,
            sample_width=2, 
            channels=1
        )
        
        # 3. Export to MP3 in memory
        buf = io.BytesIO()
        if os.path.exists(FFMPEG_PATH):
            AudioSegment.converter = FFMPEG_PATH
            
        seg.export(buf, format="mp3", bitrate=bitrate)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode('utf-8'), "audio/mpeg"
    except Exception as e:
        print(f"[Audio Utils] ❌ MP3 conversion failed: {e}")
        # Fallback to WAV if MP3 fails
        return audio_to_base64_wav(audio, sr), "audio/wav"

def save_audio_as_mp3(audio, filepath, sr=SR, bitrate="128k"):
    """Save numpy audio to MP3 file using pydub"""
    try:
        audio_clamped = np.clip(audio, -1.0, 1.0)
        audio_int16 = (audio_clamped * 32767).astype(np.int16)
        
        seg = AudioSegment(
            audio_int16.tobytes(), 
            frame_rate=sr,
            sample_width=2, 
            channels=1
        )
        
        if os.path.exists(FFMPEG_PATH):
            AudioSegment.converter = FFMPEG_PATH
            
        seg.export(filepath, format="mp3", bitrate=bitrate)
        return True
    except Exception as e:
        print(f"[Audio Utils] ❌ Save MP3 failed: {e}")
        return False
