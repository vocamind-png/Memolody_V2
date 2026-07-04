import os
model_dir = "/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain"
search_roots = [model_dir, os.path.dirname(model_dir)]
for sroot in search_roots:
    for root, dirs, files in os.walk(sroot):
        if "linguistic.onnx" in files:
            print("Found linguistic.onnx at:", os.path.join(root, "linguistic.onnx"))
