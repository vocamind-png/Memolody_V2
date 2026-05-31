with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "r") as f:
    code = f.read()

old = """        ph_dur = np.array(upd, dtype=np.int64)
        n_frames = int(ph_dur.sum())"""
new = """        ph_dur = np.array(upd, dtype=np.int64)
        n_frames = int(ph_dur.sum())
        print(f"[DEBUG] word_dur_fr={word_dur_fr}, sum={sum(word_dur_fr)}")"""
code = code.replace(old, new)

with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "w") as f:
    f.write(code)
