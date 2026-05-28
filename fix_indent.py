with open('vocalido_server/ds_engine.py', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "lyric = str(n.get(\"lyric\")" in line:
        print(f"Found at {i}: {repr(line)}")
        # It should have 12 spaces.
        if line.startswith(" " * 24):
            lines[i] = line[12:]
        elif line.startswith(" " * 16):
            lines[i] = line[4:]
        
        # fix the rest of the block up to "note_ranges.append"
        j = i + 1
        while j < len(lines):
            if "note_ranges.append" in lines[j]:
                if lines[j].startswith(" " * 24):
                    lines[j] = lines[j][12:]
                elif lines[j].startswith(" " * 16):
                    lines[j] = lines[j][4:]
                break
            
            if lines[j].startswith(" " * 24):
                lines[j] = lines[j][12:]
            elif lines[j].startswith(" " * 16):
                lines[j] = lines[j][4:]
            elif lines[j].startswith(" " * 28):
                lines[j] = lines[j][12:]
            elif lines[j].startswith(" " * 20):
                lines[j] = lines[j][4:]
            j += 1
        break

with open('vocalido_server/ds_engine.py', 'w') as f:
    f.writelines(lines)
