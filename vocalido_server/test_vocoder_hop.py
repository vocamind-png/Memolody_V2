import onnxruntime as ort
import numpy as np

sess = ort.InferenceSession("/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsvocoder/aidolgan.onnx")
mel = np.zeros((1, 100, 128), dtype=np.float32)
f0 = np.ones((1, 100), dtype=np.float32) * 440.0
out = sess.run(["waveform"], {"mel": mel, "f0": f0})[0]
print("Generated samples for 100 frames:", out.shape[-1])
print("Hop size:", out.shape[-1] / 100)
