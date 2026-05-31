import re

with open('lib/MusicEngine.ts', 'r') as f:
    content = f.read()

debug_log = """
        console.log(`[MusicEngine Debug] trackId=${trackId}, diffSemitones=${diffSemitones}, shifter_exists=${!!shifter}, isMuted=${player.mute}, offset=${offsetInAudio}`);
"""

# inject debug log inside the forEach
content = re.sub(
    r"(if \(diffSemitones !== 0 && shifter\) \{)",
    debug_log.strip() + r"\n        \1",
    content
)

with open('lib/MusicEngine.ts', 'w') as f:
    f.write(content)

