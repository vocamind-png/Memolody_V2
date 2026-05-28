with open('vocalido_server/ds_engine.py', 'r') as f:
    content = f.read()

correct = """            lyric = str(n.get("lyric") or ("a" if self.language == "zh" else "ah"))
            if self.language == "zh":
                phonemes = _lyric_to_phonemes_zh(lyric)
            else:
                phonemes = self.lyric_to_phonemes_en(lyric)"""

import re
# We just need to replace the lyric section with exactly this string.
# Finding from lyric = str to phonemes_en(lyric)
start_str = 'lyric = str(n.get("lyric")'
end_str = 'phonemes = self.lyric_to_phonemes_en(lyric)'

start_idx = content.find(start_str)
# back up to the start of the line
while start_idx > 0 and content[start_idx-1] != '\n':
    start_idx -= 1

end_idx = content.find(end_str) + len(end_str)

new_content = content[:start_idx] + correct + content[end_idx:]

with open('vocalido_server/ds_engine.py', 'w') as f:
    f.write(new_content)
