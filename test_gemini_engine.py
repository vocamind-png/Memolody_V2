import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), 'vocalido_server'))
from vocalido_server.gemini_engine import generate_arrangement_with_midi

payload = {
    "engine": "gemini",
    "leadMelody": [
        {"step": "C", "alter": 0, "octave": 4, "startTime": 0, "duration": 1},
        {"step": "D", "alter": 0, "octave": 4, "startTime": 1, "duration": 1},
        {"step": "E", "alter": 0, "octave": 4, "startTime": 2, "duration": 2}
    ],
    "config": {
        "prompt": "Happy pop song",
        "style": "Pop",
        "key": "C",
        "bpm": 120,
        "num_sections": 1,
        "is_simple_mode": True
    }
}

try:
    print("Testing generate_arrangement_with_midi...")
    result = generate_arrangement_with_midi(payload)
    
    if "error" in result:
        print("Error:", result["error"])
    else:
        print("Success!")
        print("Style:", result.get("style"))
        print("BPM:", result.get("bpm"))
        print("Harmonic Analysis:", result.get("harmonic_analysis"))
        
        for track in result.get("tracks", []):
            notes = track.get("_generatedNotes", [])
            print(f"Track: {track['name']} ({track['instrument']}) - {len(notes)} notes generated.")
            if notes:
                print(f"  First note: {notes[0]}")
except Exception as e:
    print(f"Exception: {e}")
