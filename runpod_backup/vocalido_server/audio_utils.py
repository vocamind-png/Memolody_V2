import io
import base64
import os
import numpy as np
import soundfile as sf
from pydub import AudioSegment
import shutil as _shutil

SR = 44100
FFMPEG_PATH = (
    '/usr/bin/ffmpeg' if _shutil.which('/usr/bin/ffmpeg') else
    '/opt/homebrew/bin/ffmpeg' if _shutil.which('/opt/homebrew/bin/ffmpeg') else
    (_shutil.which('ffmpeg') or '/usr/bin/ffmpeg')
)
print('[audio_utils] FFMPEG_PATH:', FFMPEG_PATH)

def audio_to_base64_wav(audio, sr=SR):
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format='WAV', subtype='PCM_16')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')

def audio_to_base64_mp3(audio, sr=SR, bitrate='320k'):
    try:
        audio_clamped = np.clip(audio, -1.0, 1.0)
        audio_int16 = (audio_clamped * 32767).astype(np.int16)
        if audio.ndim == 2:
            ch = audio.shape[1]
            seg = AudioSegment(audio_int16.tobytes(), frame_rate=sr, sample_width=2, channels=ch)
        else:
            seg = AudioSegment(audio_int16.tobytes(), frame_rate=sr, sample_width=2, channels=1)
        buf = io.BytesIO()
        if FFMPEG_PATH:
            AudioSegment.converter = FFMPEG_PATH
        seg.export(buf, format='mp3', bitrate=bitrate)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode('utf-8'), 'audio/mpeg'
    except Exception as e:
        print(f'[Audio Utils] MP3 convert failed: {e}')
        return audio_to_base64_wav(audio, sr), 'audio/wav'

def save_audio_as_mp3(audio, filepath, sr=SR, bitrate='320k'):
    try:
        audio_clamped = np.clip(audio, -1.0, 1.0)
        audio_int16 = (audio_clamped * 32767).astype(np.int16)
        if audio.ndim == 2:
            ch = audio.shape[1]
            seg = AudioSegment(audio_int16.tobytes(), frame_rate=sr, sample_width=2, channels=ch)
        else:
            seg = AudioSegment(audio_int16.tobytes(), frame_rate=sr, sample_width=2, channels=1)
        if FFMPEG_PATH:
            AudioSegment.converter = FFMPEG_PATH
        seg.export(filepath, format='mp3', bitrate=bitrate)
        return True
    except Exception as e:
        print(f'[Audio Utils] Save MP3 failed: {e}')
        return False
