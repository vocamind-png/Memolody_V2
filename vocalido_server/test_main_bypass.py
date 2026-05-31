import requests
import json
import librosa
import numpy as np
import os

# Send request
res = requests.post("http://127.0.0.1:5001/studio/preview", json={
    "notes": [
        {"midi": 64, "duration": 0.5, "startTime": 0, "lyric": "Me"},
        {"midi": 65, "duration": 0.5, "startTime": 0.5, "lyric": "Fah"},
        {"midi": 67, "duration": 0.5, "startTime": 1.0, "lyric": "Soh"}
    ],
    "params": {"voice": "lotte_v_ai_dol", "pitch_shift": 0.0}
})
data = res.json()
url = data.get("saved_url")
filename = url.split("/")[-1]
filepath = os.path.join("renders", filename)

y, sr = librosa.load(filepath)
f0, voiced_flag, _ = librosa.pyin(y, fmin=200, fmax=500)
valid_f0 = f0[voiced_flag]
if len(valid_f0) > 0:
    midis = librosa.hz_to_midi(valid_f0)
    print(f"Bypassed MIDI: {np.median(midis):.2f}")
