import requests
import json

payload = {
    "notes": [
        {"midi": 64, "duration": 0.5, "startTime": 0, "lyric": "Me"},
        {"midi": 65, "duration": 0.5, "startTime": 0.5, "lyric": "Fah"},
        {"midi": 67, "duration": 0.5, "startTime": 1.0, "lyric": "Soh"}
    ],
    "params": {
        "voice": "lotte_v_ai_dol"
    }
}

try:
    res = requests.post("http://127.0.0.1:5001/studio/preview", json=payload)
    print("Status:", res.status_code)
    print("Headers:", res.headers)
    if res.status_code == 200:
        with open("test_out.wav", "wb") as f:
            f.write(res.content)
        print("Saved to test_out.wav")
except Exception as e:
    print("Error:", e)
