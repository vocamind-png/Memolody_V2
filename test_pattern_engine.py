import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), 'vocalido_server'))
from vocalido_server.gemini_engine import generate_arrangement_with_midi, generate_pattern_tracks

chords = ["Cmaj7", "Am9", "Fmaj7", "G7"]
tracks = generate_pattern_tracks(chords, 4, "Pop", "S A T B")
for t in tracks:
    print(f"Track: {t['name']} - {len(t['_generatedNotes'])} notes generated.")

payload = {
    "engine": "gemini",
    "leadMelody": [],
    "config": {
        "prompt": "สร้างเพลงร้องประสานเสียง 4 แนว S A T B",
        "style": "Pop",
        "key": "C",
        "bpm": 120,
        "num_sections": 1
    }
}
print("Running full AI test...")
res = generate_arrangement_with_midi(payload)
if "error" in res:
    print(f"Error: {res['error']}")
else:
    for t in res.get("tracks", []):
        print(f"Final Track: {t['name']} - {len(t['_generatedNotes'])} notes. Mode: {t['mode']}. Lyric: {t['_generatedNotes'][0]['lyric'] if t['_generatedNotes'] else 'none'}")
