import onnxruntime as ort
import os

model_path = "/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Nishiren/Nishiren Diffsinger v2.0/dsmain/acoustic.onnx"
print("Acoustic Model Inputs:")
sess = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
for i in sess.get_inputs():
    print(f"Name: {i.name}, Shape: {i.shape}, Type: {i.type}")
