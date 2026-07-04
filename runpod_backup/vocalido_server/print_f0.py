import numpy as np
with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'voc_inputs = {"mel": mel, "f0": pp_final}' in line:
        lines.insert(i, '            print(f"[DEBUG] pp_final passed to vocoder: median={np.median(pp_final[pp_final>0]):.2f} Hz, max={np.max(pp_final):.2f} Hz")\n')
        break

with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "w") as f:
    f.writelines(lines)
