import onnxruntime as ort
import numpy as np

sess = ort.InferenceSession('/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/checkpoints/vocalido_ft/vocalido_ft.onnx')

tokens = np.array([[0, 1, 2, 3]], dtype=np.int64)
durations = np.array([[10, 20, 30, 40]], dtype=np.int64)
f0 = np.full((1, 100), 440.0, dtype=np.float32)
depth = np.array(1000.0, dtype=np.float32)
steps = np.array(20, dtype=np.int64)

try:
    outputs = sess.run(None, {
        'tokens': tokens,
        'durations': durations,
        'f0': f0,
        'depth': depth,
        'steps': steps
    })
    mel = outputs[0]
    print(f"Success! Mel shape: {mel.shape}")
except Exception as e:
    print(f"Failed: {e}")
