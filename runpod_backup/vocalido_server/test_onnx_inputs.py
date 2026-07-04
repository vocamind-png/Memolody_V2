import onnxruntime as ort
sess = ort.InferenceSession("/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/acoustic.onnx")
for i in sess.get_inputs():
    print(f"Input: {i.name}, shape: {i.shape}")
