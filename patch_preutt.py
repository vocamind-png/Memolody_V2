import os

filepath = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py"
with open(filepath, "r") as f:
    content = f.read()

old_block = """
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
                    if p in ["s", "sh", "f", "h", "z", "v", "th", "dh"]:
                        c_fr = max(3, int(base_cons_fr * 2.0)) # Fricatives
                    elif p in ["ch", "t", "k", "p", "ts", "th"]:
                        c_fr = max(2, int(base_cons_fr * 2.0)) # Aspirated stops & affricates
                    elif p in ["m", "n", "l", "r", "w", "y", "ng"]:
                        c_fr = max(2, int(base_cons_fr * 1.5)) # Liquids/Nasals
                    else:
                        c_fr = max(1, int(base_cons_fr * 1.2)) # Voiced Plosives (b, d, g)
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
                        upd.append(cons_fr_list[i])
                tok_idx += wdiv
"""

new_block = """
        last_vowel_upd_idx = -1

        for wdur, wdiv in zip(word_dur_fr, word_div):
            if wdiv <= 1:
                upd.append(wdur)
                last_vowel_upd_idx = len(upd) - 1
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
                    if p in ["s", "sh", "f", "h", "z", "v", "th", "dh"]:
                        c_fr = max(3, int(base_cons_fr * 2.0)) # Fricatives
                    elif p in ["ch", "t", "k", "p", "ts", "th"]:
                        c_fr = max(2, int(base_cons_fr * 2.0)) # Aspirated stops
                    elif p in ["m", "n", "l", "r", "w", "y", "ng"]:
                        c_fr = max(2, int(base_cons_fr * 1.5)) # Liquids
                    else:
                        c_fr = max(1, int(base_cons_fr * 1.2)) # Voiced Plosives
                    cons_fr_list.append(c_fr)
                
                total_cons_fr = sum(cons_fr_list)
                
                # --- PRE-UTTERANCE: Consonants steal time from previous note/silence ---
                stolen = 0
                if total_cons_fr > 0 and last_vowel_upd_idx != -1:
                    max_steal = min(total_cons_fr, max(0, upd[last_vowel_upd_idx] - 2))
                    stolen = max_steal
                    upd[last_vowel_upd_idx] -= stolen
                
                # Fallback if we couldn't steal enough
                remaining_cons_fr = total_cons_fr - stolen
                if remaining_cons_fr >= wdur:
                    scale = max(0.1, (wdur - 1) / remaining_cons_fr)
                    cons_fr_list = [int(c * scale) for c in cons_fr_list]
                    remaining_cons_fr = sum(cons_fr_list)
                
                v_fr = max(1, wdur - remaining_cons_fr)
                
                for i in range(wdiv):
                    if i == vowel_local_idx:
                        upd.append(v_fr)
                        last_vowel_upd_idx = len(upd) - 1
                        vowel_indices_abs.append(tok_idx + i)
                    else:
                        upd.append(cons_fr_list[i])
                tok_idx += wdiv
"""

if old_block.strip() in content:
    content = content.replace(old_block.strip(), new_block.strip())
    with open(filepath, "w") as f:
        f.write(content)
    print("Patched successfully.")
else:
    print("Old block not found!")
