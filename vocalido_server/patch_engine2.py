with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if '"spk_embed": sk_o' in line:
        # Add languages to acou_inputs
        lines.insert(i+1, '                "languages": np.zeros((1, tok_t.shape[1]), dtype=np.int64),\n')
        break

with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "w") as f:
    f.writelines(lines)
