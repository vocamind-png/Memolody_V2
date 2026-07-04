import onnxruntime as ort
sess_dur = ort.InferenceSession("/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/dur.onnx")
print("Dur Inputs:", [i.name for i in sess_dur.get_inputs()])
