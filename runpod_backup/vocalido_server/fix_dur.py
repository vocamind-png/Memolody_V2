with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "r") as f:
    code = f.read()

old_dur = """            pdt = self.sess_dur.run(["ph_dur"], dur_inputs)[0]
            # Convert float durations to int tokens
            pdt = np.round(pdt).astype(np.int64)
            # Ensure minimum duration of 1 frame for voiced phonemes
            pdt = np.maximum(pdt, 1)"""

new_dur = """            pdt_float = self.sess_dur.run(["ph_dur"], dur_inputs)[0][0]
            # Scale predicted durations to exactly match the requested note durations
            pdt_scaled = []
            ph_idx = 0
            for i, word_n_ph in enumerate(word_div):
                ph_slice = pdt_float[ph_idx : ph_idx + word_n_ph]
                target_frames = note_dur_fr[i]
                
                sum_ph = np.sum(ph_slice)
                if sum_ph > 0:
                    scaled = ph_slice * (target_frames / sum_ph)
                else:
                    scaled = np.ones_like(ph_slice) * (target_frames / len(ph_slice))
                
                # Round while preserving sum (simple largest remainder method)
                rounded = np.floor(scaled).astype(np.int64)
                diff = target_frames - np.sum(rounded)
                if diff > 0:
                    # add 1 to the phonemes with largest fractional part
                    fractions = scaled - rounded
                    indices = np.argsort(fractions)[::-1]
                    for j in range(int(diff)):
                        rounded[indices[j % len(indices)]] += 1
                        
                pdt_scaled.extend(rounded.tolist())
                ph_idx += word_n_ph
                
            pdt = np.array(pdt_scaled, dtype=np.int64)[None, :]
            pdt = np.maximum(pdt, 1) # Fallback, though rounding should have handled it"""

code = code.replace(old_dur, new_dur)
with open("/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py", "w") as f:
    f.write(code)
