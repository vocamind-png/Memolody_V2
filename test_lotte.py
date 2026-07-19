import sys
import os
sys.path.append(os.path.abspath('vocalido_server'))
from ds_onnx_engine import DiffSingerONNXEngine

# Initialize Lotte V
lotte_ckpt = "english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0"
engine = DiffSingerONNXEngine(lotte_ckpt)

if engine.is_ready:
    print("Engine is ready!")
    notes = [
        {"pitch": 60, "duration": 1.0, "startTime": 0.0, "lyric": "la"}
    ]
    audio = engine.synthesize_phrase(notes, {'bpm': 120})
    if audio is None:
        print("Audio is None!")
    else:
        print("Audio synthesized successfully! Length:", len(audio))
else:
    print("Engine failed to initialize.")
