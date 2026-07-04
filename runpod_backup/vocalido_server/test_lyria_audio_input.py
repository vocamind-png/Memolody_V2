import os
from google import genai
import soundfile as sf
import numpy as np

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    with open(".env") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                api_key = line.split("=")[1].strip().strip('"').strip("'")

client = genai.Client(api_key=api_key)

# Generate a 2-second sine wave (dummy vocal)
sr = 44100
t = np.linspace(0, 2, 2*sr)
y = 0.5 * np.sin(2*np.pi*440*t)
sf.write("dummy_vocal.wav", y, sr)

with open("dummy_vocal.wav", "rb") as f:
    audio_bytes = f.read()

try:
    response = client.models.generate_content(
        model='lyria-3-pro-preview',
        contents=[
            "Please add a backing track to this vocal melody. Make it pop.",
            genai.types.Part.from_bytes(data=audio_bytes, mime_type="audio/wav")
        ]
    )
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
