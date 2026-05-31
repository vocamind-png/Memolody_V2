with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if '"speedup": pe' in line:
        # Add languages
        lines.insert(i+1, '            "languages": np.zeros((1, tok_t.shape[1]), dtype=np.int64),\n')
        break

for i, line in enumerate(lines):
    if '"f0": pp_final,' in line and "acou_inputs = {" in lines[i-4]:
        # Change to pp.copy() which is raw MIDI/LogF0
        lines[i] = '                "f0": pp.copy(),\n'

with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "w") as f:
    f.writelines(lines)
