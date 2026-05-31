import requests

res = requests.post("http://127.0.0.1:5001/studio/preview", json={
    "notes": [
        {"midi": 64, "duration": 0.5, "startTime": 0, "lyric": "Me"},
        {"midi": 65, "duration": 0.5, "startTime": 0.5, "lyric": "Fah"},
        {"midi": 67, "duration": 0.5, "startTime": 1.0, "lyric": "Soh"}
    ],
    "params": {"voice": "lotte_v_ai_dol", "pitch_shift": 0.0}
})
