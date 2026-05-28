import re

with open('vocalido_server/ds_engine.py', 'r') as f:
    content = f.read()

correct_block = """            else:
                timing_feel = float(params.get("timing_feel", 50.0)) if params else 50.0
                
                # Base consonant duration in frames (approx 15ms at 0 feel, up to 45ms at 100 feel)
                base_cons_sec = 0.015 + 0.030 * (timing_feel / 100.0)
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
                
                # Consonant Pre-utterance (Borrowing) logic
                # We want the VOWEL to hit exactly on the beat (at note_start_f)
                # To do this, consonants must steal time from the previous phoneme (vowel or rest)
                
                # 1. Calculate ideal duration for each consonant
                cons_fr_list = []
                for i in range(vowel_idx):
                    p = phonemes[i]
                    if p in ["s", "sh", "ch", "f", "h", "z", "v", "th", "dh"]:
                        c_fr = max(3, int(base_cons_fr * 1.5)) # Fricatives need more time to be audible (~40-60ms)
                    elif p in ["m", "n", "l", "r", "w", "y", "ng"]:
                        c_fr = max(2, int(base_cons_fr * 1.2)) # Liquids/Nasals medium time (~30-40ms)
                    else:
                        c_fr = base_cons_fr # Plosives/Stops are fast (~20-30ms)
                    cons_fr_list.append(c_fr)
                
                total_cons_fr = sum(cons_fr_list)
                
                # 2. Check if the previous phoneme has enough time to be stolen from
                # We must leave at least 1 frame for the previous phoneme!
                prev_available_fr = 0
                if last_vowel_abs_idx != -1 and last_vowel_abs_idx < len(ph_dur_frames):
                    prev_available_fr = max(0, ph_dur_frames[last_vowel_abs_idx] - 1)
                
                # Cap the consonant length if there isn't enough room to borrow
                if total_cons_fr > prev_available_fr and prev_available_fr > 0:
                    scale = prev_available_fr / total_cons_fr
                    cons_fr_list = [max(1, int(c * scale)) for c in cons_fr_list]
                    total_cons_fr = sum(cons_fr_list)
                elif prev_available_fr == 0:
                    # If we are at the very beginning of the song with no rest, we can't borrow.
                    # We have to push into the current note's duration.
                    pass
                
                # 3. Apply the borrowing by shrinking the previous phoneme
                if prev_available_fr > 0 and total_cons_fr > 0:
                    ph_dur_frames[last_vowel_abs_idx] -= total_cons_fr
                
                # 4. Append consonants
                for i in range(vowel_idx):
                    ph_seq.append(phonemes[i])
                    ph_dur_frames.append(cons_fr_list[i])
                    # Pitch of consonant should ideally match the note it belongs to, 
                    # but maybe blend with previous if it's borrowed? Let's just use the current note's hz
                    ph_hz.append(hz)
                
                # 5. Append Vowel
                # The vowel gets the full duration of the note, because the consonants were borrowed from the PREVIOUS note!
                # Unless we couldn't borrow, in which case the vowel must shrink.
                if prev_available_fr == 0:
                    vowel_fr = max(1, dur_fr - total_cons_fr)
                else:
                    vowel_fr = max(1, dur_fr)
                    
                ph_seq.append(phonemes[vowel_idx])
                ph_dur_frames.append(vowel_fr)
                ph_hz.append(hz)
                last_vowel_abs_idx = len(ph_dur_frames) - 1
                
                # 6. Append any trailing consonants (codas)
                if vowel_idx < p_len - 1:
                    # Distribute remaining duration of the note to codas
                    # Note: this shrinks the vowel slightly from the end
                    trailing_count = (p_len - 1) - vowel_idx
                    coda_fr_each = base_cons_fr
                    total_coda_fr = coda_fr_each * trailing_count
                    if total_coda_fr >= vowel_fr:
                        coda_fr_each = max(1, (vowel_fr - 1) // trailing_count)
                        total_coda_fr = coda_fr_each * trailing_count
                    
                    ph_dur_frames[last_vowel_abs_idx] -= total_coda_fr
                    for i in range(vowel_idx + 1, p_len):
                        ph_seq.append(phonemes[i])
                        ph_dur_frames.append(coda_fr_each)
                        ph_hz.append(hz)
                
                # Strict piano-like timing: absolute timeline advances exactly by dur_fr
                # The visual note duration remains PERFECT. The consonants just shifted left!
                current_fr += dur_fr"""

start_str = '            else:\n                timing_feel = float(params.get("timing_feel", 50.0))'
end_str = '                # Strict piano-like timing'

start_idx = content.find('            else:\n                timing_feel = float(params.get("timing_feel", 50.0))')
end_idx = content.find('                current_fr += dur_fr', start_idx) + len('                current_fr += dur_fr')

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + correct_block + content[end_idx:]
    with open('vocalido_server/ds_engine.py', 'w') as f:
        f.write(new_content)
    print("Fixed!")
else:
    print("Could not find block")
