import re

with open('vocalido_server/ds_engine.py', 'r') as f:
    content = f.read()

# I will find the block starting with "lyric = str(n.get("lyric")"
# and ending at "if not ph_seq:"
# and replace it with the correct logic.

correct_block = """            lyric = str(n.get("lyric") or ("a" if self.language == "zh" else "ah"))
            if self.language == "zh":
                phonemes = _lyric_to_phonemes_zh(lyric)
            else:
                phonemes = self.lyric_to_phonemes_en(lyric)

            # Determine absolute timeline coordinates in frames
            note_start_fr = int(round((start + initial_ap_sec) * frame_hz))
            note_end_fr = int(round((start + dur + initial_ap_sec) * frame_hz))

            # Insert silence gap if needed
            if note_start_fr > current_fr:
                gap_fr = note_start_fr - current_fr
                if gap_fr > 0:
                    ph_seq.append("SP")
                    ph_dur_frames.append(gap_fr)
                    ph_hz.append(0.0)
                    current_fr += gap_fr
                    last_vowel_abs_idx = len(ph_dur_frames) - 1

            # Align note start to current_fr to prevent negative duration or overlapping
            actual_start_fr = max(current_fr, note_start_fr)
            dur_fr = max(2, note_end_fr - actual_start_fr)

            p_len = len(phonemes)
            note_start_f = actual_start_fr

            if p_len == 1:
                ph_seq.extend(phonemes)
                ph_dur_frames.append(dur_fr)
                ph_hz.append(hz)
                current_fr += dur_fr
                last_vowel_abs_idx = len(ph_dur_frames) - 1
            else:
                timing_feel = float(params.get("timing_feel", 50.0)) if params else 50.0
                
                # Calculate target consonant duration in seconds (does not scale with dur_fr)
                target_cons_sec = 0.015 + 0.045 * (timing_feel / 100.0)
                target_cons_fr = max(2, round(target_cons_sec * frame_hz))
                
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
                
                # Consonant frame calculation (Strict Piano mode - no borrowing)
                equal_fr = dur_fr // p_len
                cons_fr = min(equal_fr, target_cons_fr)
                cons_fr = max(2, cons_fr)
                total_cons_fr = cons_fr * (p_len - 1)
                vowel_fr = max(1, dur_fr - total_cons_fr)

                for i, p in enumerate(phonemes):
                    d_fr = vowel_fr if i == vowel_idx else cons_fr
                    ph_seq.append(p)
                    ph_dur_frames.append(d_fr)
                    ph_hz.append(hz)
                    if i == vowel_idx:
                        last_vowel_abs_idx = len(ph_dur_frames) - 1
                
                # Strict piano-like timing: note advances exactly by dur_fr
                current_fr += dur_fr
            
            note_end_f = current_fr
            note_ranges.append((note_start_f, note_end_f, hz))"""

# find start and end
start_idx = content.find('lyric = str(n.get("lyric")')
end_idx = content.find('if not ph_seq:', start_idx)

new_content = content[:start_idx] + correct_block + "\n\n        " + content[end_idx:]

with open('vocalido_server/ds_engine.py', 'w') as f:
    f.write(new_content)

print("FIXED ds_engine.py")
