import onnxruntime as ort
so = ort.SessionOptions()
sess = ort.InferenceSession('/workspace/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/acoustic.onnx', sess_options=so, providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
print("Actual Providers:", sess.get_providers())
