import re

with open('vocalido_server/ds_onnx_engine.py', 'r') as f:
    content = f.read()

correct_block = """        # Calculate target consonant duration in seconds (does not scale with wdur)
        # 0% (Robot) -> 15ms
        # 100% (Human) -> 35ms
        base_cons_sec = 0.015 + 0.020 * (timing_feel / 100.0)
        base_cons_fr = max(1, round(base_cons_sec * frame_hz))
        
        zh_vowels = {
            "a", "ai", "an", "ang", "ao",
            "e", "ei", "en", "eng", "er",
            "i", "i0", "ia", "ian", "iang", "iao", "ie", "in", "ing", "iong", "ir", "iu",
            "o", "ong", "ou",
            "u", "ua", "uai", "uan", "uang", "ui", "un", "uo",
            "v", "van", "ve", "vn",
        }
        en_vowels = {"ah","ow","iy","ey","aa","ao","er","uh","uw","ae"}
        vowel_set = zh_vowels if self.language == 'zh' else en_vowels

        id_to_phoneme = {v: k for k, v in self.phoneme_to_id.items()}
        ph_names = [id_to_phoneme.get(t, f"ID_{t}") for t in all_tok]
        
        upd = []
        tok_idx = 0
        vowel_indices_abs = []
        
        for wdur, wdiv in zip(word_dur_fr, word_div):
            if wdiv <= 1:
                upd.append(wdur)
                vowel_indices_abs.append(tok_idx)
                tok_idx += wdiv
            else:
                word_ph_names = ph_names[tok_idx : tok_idx + wdiv]
                vowel_local_idx = next(
                    (i for i, p in enumerate(word_ph_names)
                     if p in vowel_set or (p and p[0] in "aeiouAEIOU")),
                    wdiv - 1
                )
                
                cons_fr_list = []
                for i in range(wdiv):
                    if i == vowel_local_idx:
                        cons_fr_list.append(0)
                        continue
                    p = word_ph_names[i]
                    if p in ["s", "sh", "ch", "f", "h", "z", "v", "th", "dh"]:
                        c_fr = max(2, int(base_cons_fr * 1.5)) # Fricatives
                    elif p in ["m", "n", "l", "r", "w", "y", "ng"]:
                        c_fr = max(1, int(base_cons_fr * 1.2)) # Liquids
                    else:
                        c_fr = base_cons_fr # Plosives
                    cons_fr_list.append(c_fr)
                
                total_cons_fr = sum(cons_fr_list)
                if total_cons_fr >= wdur:
                    scale = max(0.1, (wdur - 1) / total_cons_fr)
                    cons_fr_list = [int(c * scale) for c in cons_fr_list]
                    total_cons_fr = sum(cons_fr_list)
                
                v_fr = max(1, wdur - total_cons_fr)
                
                for i in range(wdiv):
                    if i == vowel_local_idx:
                        upd.append(v_fr)
                        vowel_indices_abs.append(tok_idx + i)
                    else:
                        d_fr = cons_fr_list[i]
                        if d_fr < 1: d_fr = 1
                        upd.append(d_fr)
                
                tok_idx += wdiv

        ph_dur = np.array(upd, dtype=np.int64)
        
        # REMOVED the broken Consonant Borrowing code here.
        # Strict Piano mode maintains perfect absolute timeline sync.
        
        n_frames = int(ph_dur.sum())"""

start_str = '        # Calculate target consonant duration in seconds (does not scale with wdur)'
end_str = '        n_frames = int(ph_dur.sum())'

start_idx = content.find(start_str)
end_idx = content.find(end_str, start_idx) + len(end_str)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + correct_block + content[end_idx:]
    with open('vocalido_server/ds_onnx_engine.py', 'w') as f:
        f.write(new_content)
    print("Fixed timing logic!")
else:
    print("Could not find block")
