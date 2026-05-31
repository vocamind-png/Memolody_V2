with open("vocalido_server/ds_onnx_engine.py", "r") as f:
    content = f.read()

# 1. Fix path resolution
old_path_res = """            search_roots = [model_dir, os.path.dirname(model_dir)]
            for sroot in search_roots:
                for root, dirs, files in os.walk(sroot):
                    if "linguistic.onnx" in files:
                        self.ling_path = os.path.join(root, "linguistic.onnx")
                    if "dur.onnx" in files:
                        self.dur_path = os.path.join(root, "dur.onnx")
                    if "pitch.onnx" in files:
                        self.pitch_path = os.path.join(root, "pitch.onnx")"""

new_path_res = """            search_roots = [model_dir, os.path.dirname(model_dir)]
            for sroot in search_roots:
                for root, dirs, files in os.walk(sroot):
                    if "linguistic.onnx" in files:
                        if not self.ling_path or 'dsmain' in root:
                            self.ling_path = os.path.join(root, "linguistic.onnx")
                    if "dur.onnx" in files:
                        if not self.dur_path or 'dsdur' in root:
                            self.dur_path = os.path.join(root, "dur.onnx")
                    if "pitch.onnx" in files:
                        if not self.pitch_path or 'dspitch' in root:
                            self.pitch_path = os.path.join(root, "pitch.onnx")"""

content = content.replace(old_path_res, new_path_res)

# 2. Add languages tensor to ling_inputs, dur_inputs, pitch_inputs
if 'ling_inputs["languages"] = np.zeros_like(tok_t)' not in content:
    content = content.replace('if "ph_dur" in ling_sess_inputs:', 'if "languages" in ling_sess_inputs:\n                ling_inputs["languages"] = np.zeros_like(tok_t)\n            if "ph_dur" in ling_sess_inputs:')

if 'dur_inputs["languages"] = np.zeros_like(tok_t)' not in content:
    content = content.replace('dur_inputs_filtered = {k: v for k, v in dur_inputs.items() if k in dur_sess_inputs}', 'if "languages" in dur_sess_inputs:\n                dur_inputs["languages"] = np.zeros_like(tok_t)\n            dur_inputs_filtered = {k: v for k, v in dur_inputs.items() if k in dur_sess_inputs}')

if 'pitch_inputs["languages"] = np.zeros_like(tok_t)' not in content:
    content = content.replace('pitch_inputs_filtered = {k: v for k, v in pitch_inputs.items() if k in pitch_sess_inputs}', 'if "languages" in pitch_sess_inputs:\n                pitch_inputs["languages"] = np.zeros_like(tok_t)\n            pitch_inputs_filtered = {k: v for k, v in pitch_inputs.items() if k in pitch_sess_inputs}')

# 3. Restore the Thai parsing fix at the beginning of lyric_to_phonemes_en
thai_fix = """    def lyric_to_phonemes_en(self, lyric: str) -> List[str]:
        if parse_thai_to_arpabet is not None:
            thai_res = parse_thai_to_arpabet(lyric)
            if thai_res:
                print(f"[ONNXEngine] Thai syllable match for '{lyric}': {thai_res}")
                return thai_res"""
if "parse_thai_to_arpabet is not None" not in content:
    content = content.replace("    def lyric_to_phonemes_en(self, lyric: str) -> List[str]:", thai_fix)

# 4. Import parse_thai_to_arpabet
if "parse_thai_to_arpabet" not in content[:500]:
    content = content.replace("_arpabet_to_phoneme, _get_g2p", "_arpabet_to_phoneme, _get_g2p, parse_thai_to_arpabet")
    content = content.replace("    pass", "    parse_thai_to_arpabet = None")

with open("vocalido_server/ds_onnx_engine.py", "w") as f:
    f.write(content)

print("ds_onnx_engine fixed")
