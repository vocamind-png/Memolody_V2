with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "r") as f:
    code = f.read()

old = """            pdt_float = self.sess_dur.run(["ph_dur"], dur_inputs)[0][0]"""
new = """            pdt_float = self.sess_dur.run(["ph_dur"], dur_inputs)[0][0]
            print(f"[DEBUG] len(word_div)={len(word_div)}, len(note_dur_fr)={len(note_dur_fr)}")"""
code = code.replace(old, new)

with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "w") as f:
    f.write(code)
