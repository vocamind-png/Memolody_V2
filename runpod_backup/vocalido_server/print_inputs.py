import onnxruntime as ort
sess = ort.InferenceSession("/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/acoustic.onnx")
inputs = [i.name for i in sess.get_inputs()]
print("Acoustic Inputs:", inputs)

sess_pitch = ort.InferenceSession("/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dspitch/pitch.onnx")
print("Pitch Inputs:", [i.name for i in sess_pitch.get_inputs()])
