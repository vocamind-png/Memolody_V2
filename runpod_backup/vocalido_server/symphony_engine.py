import os
import json
import time
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from gemini_engine import parse_chord_to_pitches, midi_to_step_alter_octave, ArrangementResponse, GENAI_AVAILABLE, client

def generate_arrangement_symphony(payload: dict) -> dict:
    """
    SymphonyNet mock using Gemini AI.
    Generates Orchestral arrangements (Violin, Cello, Timpani).
    """
    if not GENAI_AVAILABLE:
        return {"error": "Gemini API client not initialized. Check GEMINI_API_KEY in .env."}
        
    config = payload.get("config", {})
    prompt = config.get("prompt", "")
    key = config.get("key", "C")
    bpm = config.get("bpm", 120)
    num_sections = config.get("num_sections", 1)
    is_simple_mode = config.get("is_simple_mode", False)
    lead_melody = payload.get("leadMelody", [])
    
    melody_context = "No melody provided."
    if lead_melody:
        # Convert lead melody array into a basic ABC-like sequence
        abc_str = f"M:4/4\\nL:1/4\\nK:{key}\\n"
        
        # Group notes by measure
        measure_groups = {}
        for note in lead_melody:
            step = note.get("step", "")
            alter = note.get("alter", 0)
            octave = note.get("octave", 4)
            start = note.get("startTime", 0)
            dur = note.get("duration", 0)
            
            note_name = step
            if alter == 1: note_name += "^" # ABC sharp
            elif alter == -1: note_name += "_" # ABC flat
            note_name += str(octave)
            
            m = int(start // 4) + 1
            if m not in measure_groups:
                measure_groups[m] = []
            
            abc_dur = max(1, round(dur))
            abc_note = note_name
            if abc_dur > 1:
                abc_note += str(abc_dur)
            elif abc_dur < 1:
                abc_note += "/2" 
                
            measure_groups[m].append(abc_note)
            
        abc_lines = []
        for m in sorted(measure_groups.keys()):
            abc_lines.append(f"| " + " ".join(measure_groups[m]))
            
        melody_context = "Lead Melody in ABC Notation format:\n```abc\n" + abc_str + "\n".join(abc_lines) + "\n|]\n```\n"
    beats_per_measure = 4
    total_beats = 16
    if lead_melody:
        total_beats = max((n.get("startTime", 0) + n.get("duration", 0)) for n in lead_melody)
    total_measures = max(4, int((total_beats + beats_per_measure - 1) // beats_per_measure))
    
    theory_instruction = (
        "Apply advanced music theory suitable for classical music: secondary dominants, diminished passing chords, Neapolitan chords, and inversions. "
    )
    if is_simple_mode:
        theory_instruction = (
            "You MUST use simple, diatonic, basic classical chords (like I, IV, V, vi). Do NOT use overly complex jazz chords, diminished passing chords, or weird inversions. Keep the harmony very simple and pleasant. "
        )
    
    system_instruction = (
        "You are a master orchestral composer and professional conductor. "
        "The user wants a classical/symphonic chord progression for their melody. "
        "Analyze the ABC Notation melody notes and the requested key. "
        "You MUST generate a highly musical and contextually appropriate classical chord progression. "
        f"{theory_instruction}"
        "First, write a 'harmonic_analysis' explaining your thought process. "
        f"Then, return the final 'chords' array containing EXACTLY {total_measures} chords (one chord per measure). "
        "If some measures have no melody notes, generate an appropriate chord to maintain the progression. "
        "Return the result as a structured JSON object."
    )
    
    user_prompt = f"Key: {key}\nTempo: {bpm} BPM\nPrompt: {prompt}\n{melody_context}\nGenerate a majestic classical chord progression."

    try:
        # Use gemini-3.1-pro-preview
        response = client.models.generate_content(
            model='gemini-3.1-pro-preview',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=ArrangementResponse,
                temperature=0.2, 
            ),
        )
        
        try:
            result = json.loads(response.text)
            chords = result.get("chords", [])
        except Exception as e:
            print(f"[Symphony] JSON parse error: {e}, text: {response.text}")
            chords = []
            
        if not chords or len(chords) == 0:
            chords = ["C", "G", "Am", "F"]
            
        # Pad or truncate chords to match total_measures
        while len(chords) < total_measures:
            chords.append(chords[len(chords) % len(chords)])
        chords = chords[:total_measures]
        
    except Exception as e:
        print(f"[Symphony] Error in generate_arrangement: {e}")
        chords = ["C", "G", "Am", "F"]
        while len(chords) < total_measures:
            chords.append(chords[len(chords) % len(chords)])
        chords = chords[:total_measures]
        
    print(f"[Symphony] Generated classical chords: {chords}")
    
    # Build track states
    cello_track = {
        "id": f"track-cello-{int(time.time()*1000)}",
        "name": "Cello",
        "instrument": "bass", "mode": "instrument",
        "isMuted": False, "isSolo": False, "volume": 0.85, "pan": 0,
        "_generatedNotes": []
    }
    violin_track = {
        "id": f"track-violin-{int(time.time()*1000)}",
        "name": "Violin Ensemble",
        "instrument": "piano", "mode": "instrument",
        "isMuted": False, "isSolo": False, "volume": 0.75, "pan": 0,
        "_generatedNotes": []
    }
    timpani_track = {
        "id": f"track-timpani-{int(time.time()*1000)}",
        "name": "Timpani",
        "instrument": "drums", "mode": "instrument",
        "isMuted": False, "isSolo": False, "volume": 0.9, "pan": 0,
        "_generatedNotes": []
    }
    
    # Generate notes measure by measure
    for m in range(total_measures):
        measure_start_time = m * beats_per_measure
        chord_name = chords[m % len(chords)]
        chord_pitches = parse_chord_to_pitches(chord_name, octave=4)
        
        # Cello (Bass): Root note, sustained
        cello_midi = chord_pitches[0] - 24
        b_step, b_alt, b_oct = midi_to_step_alter_octave(cello_midi)
        cello_track["_generatedNotes"].append({
            "trackId": cello_track["id"],
            "step": b_step, "alter": b_alt, "octave": b_oct, "midi": cello_midi,
            "duration": beats_per_measure,
            "startTime": measure_start_time,
            "measure": str(m + 1),
            "lyric": ""
        })
        
        # Violin (Chords): 1 octave below generated pitches, sustained
        for idx, pitch in enumerate(chord_pitches):
            c_midi = pitch - 12
            c_step, c_alt, c_oct = midi_to_step_alter_octave(c_midi)
            violin_track["_generatedNotes"].append({
                "trackId": violin_track["id"],
                "step": c_step, "alter": c_alt, "octave": c_oct, "midi": c_midi,
                "duration": beats_per_measure,
                "startTime": measure_start_time,
                "measure": str(m + 1),
                "lyric": ""
            })
            
        # Timpani (Drums): Hit on beat 1 and 3
        for b in range(beats_per_measure):
            if b % 2 == 0:
                beat_start = measure_start_time + b
                d_step = 'C' if b == 0 else 'G' # Root and fifth for timpani
                d_midi = 36 if b == 0 else 43
                timpani_track["_generatedNotes"].append({
                    "trackId": timpani_track["id"],
                    "step": d_step, "alter": 0, "octave": 2, "midi": d_midi,
                    "duration": 1,
                    "startTime": beat_start,
                    "measure": str(m + 1),
                    "lyric": ""
                })
                
    return {
        "style": "orchestral",
        "bpm": bpm,
        "chords": chords,
        "tracks": [cello_track, violin_track, timpani_track]
    }
