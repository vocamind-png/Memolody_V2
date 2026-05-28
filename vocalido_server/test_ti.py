import os
import sys
sys.path.append('/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server')
from ds_onnx_engine import DiffSingerONNXEngine

engine = DiffSingerONNXEngine('/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/voicebanks/vocalido_master', language='en')
print("ti:", engine.lyric_to_phonemes_en("ti"))
print("ที:", engine.lyric_to_phonemes_en("ที"))
