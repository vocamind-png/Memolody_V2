import requests
import json
import librosa
import numpy as np
import os

res = requests.post("http://127.0.0.1:5001/studio/preview", json={
    "notes": [
        {"midi": 64, "duration": 0.5, "startTime": 0, "lyric": "Me"}
    ],
    "params": {"voice": "lotte_v_ai_dol", "pitch_shift": 0.0}
})
data = res.json()
url = data.get("saved_url")
filename = url.split("/")[-1]
filepath = os.path.join("renders", filename)

y, sr = librosa.load(filepath)
print(f"Max Amplitude: {np.max(np.abs(y)):.4f}")
print(f"Mean Amplitude: {np.mean(np.abs(y)):.4f}")
