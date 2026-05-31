import sys
sys.path.append('vocalido_server')
from ds_onnx_engine import DiffSingerONNXEngine
engine = DiffSingerONNXEngine("english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain", language="en")
notes = [{"midi": 60, "duration": 1.0, "lyric": "tu"}]
audio = engine.synthesize_phrase(notes)
print("Audio generated:", type(audio), len(audio) if audio is not None else "None")
