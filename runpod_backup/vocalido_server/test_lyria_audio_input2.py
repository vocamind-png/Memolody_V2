import sys
sys.path.append('.')
from lyria_engine import _get_api_key
import soundfile as sf
import numpy as np
from google import genai

api_key = _get_api_key()
client = genai.Client(api_key=api_key)

try:
    response = client.models.generate_content(
        model='lyria-3-pro-preview',
        contents=[
            "Please add a backing track to this vocal melody. Make it pop.",
            genai.types.Part.from_bytes(data=open("dummy_vocal.wav", "rb").read(), mime_type="audio/wav")
        ]
    )
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
