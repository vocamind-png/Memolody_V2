import re

with open('vocalido_server/ds_engine.py', 'r') as f:
    content = f.read()

correct_block = """            else:
                timing_feel = float(params.get("timing_feel", 50.0)) if params else 50.0
                
                # Base consonant duration in frames (approx 15ms at 0 feel, up to 35ms at 100 feel)
                base_cons_sec = 0.015 + 0.020 * (timing_feel / 100.0)
                base_cons_fr = max(1, round(base_cons_sec * frame_hz))
                
                zh_vowels = {
                    "a", "ai", "an", "ang", "ao",
                    "e", "ei", "en", "eng", "er",
                    "i", "i0", "ia", "ian", "iang", "iao", "ie",
                    "in", "ing", "iong", "ir", "iu",
                    "o", "ong", "ou",
                    "u", "ua", "uai", "uan", "uang", "ui", "un", "uo",
                    "v", "van", "ve", "vn",
                }
                en_vowels = {"ah","ow","iy","ey","aa","ao","er","uh","uw","ae"}
                vowel_set = zh_vowels if self.language == "zh" else en_vowels
                vowel_idx = next(
                    (i for i, p in enumerate(phonemes)
                     if p in vowel_set or (p and p[0] in "aeiouAEIOU")),
                    p_len - 1
                )
                
                # We revert to Strict Piano Mode (No Borrowing from previous notes)
                # Borrowing cuts off previous notes prematurely, ruining the rhythm of fast passages!
                
                # 1. Calculate ideal duration for each consonant
                cons_fr_list = []
                for i in range(p_len):
                    if i == vowel_idx:
                        cons_fr_list.append(0)
                        continue
                    p = phonemes[i]
                    if p in ["s", "sh", "ch", "f", "h", "z", "v", "th", "dh"]:
                        c_fr = max(2, int(base_cons_fr * 1.5)) # Fricatives need more time to be audible (~30-40ms)
                    elif p in ["m", "n", "l", "r", "w", "y", "ng"]:
                        c_fr = max(1, int(base_cons_fr * 1.2)) # Liquids/Nasals medium time (~20-30ms)
                    else:
                        c_fr = base_cons_fr # Plosives/Stops are fast (~15-20ms)
                    cons_fr_list.append(c_fr)
                
                total_cons_fr = sum(cons_fr_list)
                
                # Vowel gets whatever is left from the note duration
                # Ensure the vowel has at least 1 frame
                if total_cons_fr >= dur_fr:
                    # Scale down consonants if the note is too short
                    scale = max(0.1, (dur_fr - 1) / total_cons_fr)
                    cons_fr_list = [int(c * scale) for c in cons_fr_list]
                    total_cons_fr = sum(cons_fr_list)
                
                vowel_fr = max(1, dur_fr - total_cons_fr)
                
                # Timing feel explicitly shifts the note onset slightly
                # < 50 = early (rushed), > 50 = late (lazy)
                # Max shift is 20ms (2 frames) to avoid breaking rhythm
                shift_fr = int(round((timing_feel - 50.0) / 25.0)) # -2 to +2 frames
                
                for i, p in enumerate(phonemes):
                    d_fr = vowel_fr if i == vowel_idx else cons_fr_list[i]
                    if d_fr < 1 and i != vowel_idx:
                        d_fr = 1
                    ph_seq.append(p)
                    ph_dur_frames.append(d_fr)
                    ph_hz.append(hz)
                    if i == vowel_idx:
                        last_vowel_abs_idx = len(ph_dur_frames) - 1
                
                # Strict piano-like timing: absolute timeline advances exactly by dur_fr
                # We do NOT steal from previous notes.
                current_fr += dur_fr"""

start_str = '            else:\n                timing_feel = float(params.get("timing_feel", 50.0))'
end_str = '                current_fr += dur_fr'

start_idx = content.find('            else:\n                timing_feel = float(params.get("timing_feel", 50.0))')
end_idx = content.find('                current_fr += dur_fr', start_idx) + len('                current_fr += dur_fr')

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + correct_block + content[end_idx:]
    with open('vocalido_server/ds_engine.py', 'w') as f:
        f.write(new_content)
    print("Fixed timing!")
else:
    print("Could not find block")
