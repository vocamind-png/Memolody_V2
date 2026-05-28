with open('vocalido_server/ds_engine.py', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "return Noneow = " in line:
        # replace with 'return None' and delete subsequent garbage
        lines[i] = "        if not ph_seq:\n            return None\n"
        
        # we need to delete lines from i+1 until we hit "def " or a clean unindented line, or just delete a fixed amount
        # Actually, let's just find the next line that is properly part of the original code.
        # After "return None", it was "ph_dur_frames = [int(f) for f in ph_dur_frames]"
        j = i + 1
        while j < len(lines) and "ph_dur_frames = [int(f)" not in lines[j]:
            j += 1
        
        del lines[i+1:j]
        break

with open('vocalido_server/ds_engine.py', 'w') as f:
    f.writelines(lines)
