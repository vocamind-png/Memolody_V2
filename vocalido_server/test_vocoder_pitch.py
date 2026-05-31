import onnxruntime as ort
import numpy as np
import librosa

sess = ort.InferenceSession("/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsvocoder/aidolgan.onnx")
frames = 200
mel = np.zeros((1, frames, 128), dtype=np.float32)
f0 = np.ones((1, frames), dtype=np.float32) * 337.5
out = sess.run(["waveform"], {"mel": mel, "f0": f0})[0].squeeze()

import soundfile as sf
sf.write("test_vocoder.wav", out, 44100)

y, sr = librosa.load("test_vocoder.wav", sr=None)
f0_det, voiced_flag, _ = librosa.pyin(y, fmin=200, fmax=500)
valid_f0 = f0_det[voiced_flag]
if len(valid_f0) > 0:
    print("Detected pitch:", np.median(valid_f0))
else:
    print("No pitch detected")
