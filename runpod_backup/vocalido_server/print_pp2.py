import numpy as np
with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'pp_midi = pp * NEURAL_BLEND' in line:
        lines.insert(i, '                print(f"[DEBUG] Raw pp from pitch model: median={np.median(pp[pp>0]):.2f}, max={np.max(pp):.2f}")\n')
        break

with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "w") as f:
    f.writelines(lines)
