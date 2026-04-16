import numpy as np
import audio_utils
import os

# Create a 1-second 440Hz sine wave
SR = 44100
t = np.linspace(0, 1, SR, endpoint=False)
audio = 0.5 * np.sin(2 * np.pi * 440 * t)

print("Testing audio_to_base64_mp3...")
try:
    b64 = audio_utils.audio_to_base64_mp3(audio, SR)
    print(f"Success! Base64 length: {len(b64)}")
    print(f"Starts with: {b64[:30]}")
    
    # Save a test file to verify pydub/ffmpeg works
    audio_utils.save_audio_as_mp3(audio, "test_render.mp3", SR)
    if os.path.exists("test_render.mp3"):
        size = os.path.getsize("test_render.mp3")
        print(f"File test_render.mp3 created. Size: {size} bytes")
        os.remove("test_render.mp3")
    else:
        print("Failed to create test_render.mp3")
except Exception as e:
    print(f"Error during test: {e}")
