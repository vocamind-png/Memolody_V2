import os
import json
import time
from google import genai
from google.genai import types
from pydantic import BaseModel
from gemini_engine import parse_chord_to_pitches, midi_to_step_alter_octave, ArrangementResponse, GENAI_AVAILABLE, client

def generate_arrangement_choir(payload: dict) -> dict:
    """
    Choir (SATB) mock using Gemini AI.
    Generates vocal arrangements (Soprano, Alto, Tenor, Bass).
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
        "Apply advanced music theory suitable for choral music: secondary dominants, passing chords, and suspensions where appropriate. "
    )
    if is_simple_mode:
        theory_instruction = (
            "You MUST use simple, diatonic, basic pop/classical chords. Do NOT use overly complex jazz chords or weird suspensions. Keep the harmony very simple and pleasant. "
        )
    
    system_instruction = (
        "You are a master choral composer and professional arranger. "
        "The user wants an SATB choir (Soprano, Alto, Tenor, Bass) chord progression for their melody. "
        "Analyze the ABC Notation melody notes and the requested key. "
        "You MUST generate a highly musical and contextually appropriate chord progression. "
        f"{theory_instruction}"
        "First, write a 'harmonic_analysis' explaining your thought process. "
        f"Then, return the final 'chords' array containing EXACTLY {total_measures} chords (one chord per measure). "
        "If some measures have no melody notes, generate an appropriate chord to maintain the progression. "
        "Return the result as a structured JSON object."
    )
    
    user_prompt = f"Key: {key}\nTempo: {bpm} BPM\nPrompt: {prompt}\n{melody_context}\nGenerate a beautiful choral chord progression."

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
            print(f"[Choir] JSON parse error: {e}, text: {response.text}")
            chords = []
            
        if not chords or len(chords) == 0:
            chords = ["C", "G", "Am", "F"]
            
        # Pad or truncate chords to match total_measures
        while len(chords) < total_measures:
            chords.append(chords[len(chords) % len(chords)])
        chords = chords[:total_measures]
        
    except Exception as e:
        print(f"[Choir] Error in generate_arrangement: {e}")
        chords = ["C", "G", "Am", "F"]
        while len(chords) < total_measures:
            chords.append(chords[len(chords) % len(chords)])
        chords = chords[:total_measures]
        
    print(f"[Choir] Generated SATB chords: {chords}")
    
    # Build track states
    soprano_track = {
        "id": f"track-soprano-{int(time.time()*1000)}",
        "name": "Soprano",
        "instrument": "vocal", "mode": "instrument", "lyricMode": "Lyric", "pluginId": "svs-vocal",
        "isMuted": False, "isSolo": False, "volume": 0.8, "pan": 0,
        "_generatedNotes": []
    }
    alto_track = {
        "id": f"track-alto-{int(time.time()*1000)}",
        "name": "Alto",
        "instrument": "vocal", "mode": "instrument", "lyricMode": "Lyric", "pluginId": "svs-vocal",
        "isMuted": False, "isSolo": False, "volume": 0.75, "pan": 0,
        "_generatedNotes": []
    }
    tenor_track = {
        "id": f"track-tenor-{int(time.time()*1000)}",
        "name": "Tenor",
        "instrument": "vocal", "mode": "instrument", "lyricMode": "Lyric", "pluginId": "svs-vocal",
        "isMuted": False, "isSolo": False, "volume": 0.8, "pan": 0,
        "_generatedNotes": []
    }
    bass_track = {
        "id": f"track-bass-{int(time.time()*1000)}",
        "name": "Bass",
        "instrument": "vocal", "mode": "instrument", "lyricMode": "Lyric", "pluginId": "svs-vocal",
        "isMuted": False, "isSolo": False, "volume": 0.85, "pan": 0,
        "_generatedNotes": []
    }
    
    # Generate notes measure by measure
    for m in range(total_measures):
        measure_start_time = m * beats_per_measure
        chord_name = chords[m % len(chords)]
        chord_pitches = parse_chord_to_pitches(chord_name, octave=4)
        
        # SATB Voicing rules (simplified)
        # chord_pitches has [root, third, fifth] in octave 4 (e.g., C4, E4, G4)
        root_midi = chord_pitches[0]
        third_midi = chord_pitches[1]
        fifth_midi = chord_pitches[2]
        
        # Bass: Root note, octave 2 or 3 (Whole Note)
        bass_midi = root_midi - 24 # Octave 2
        b_step, b_alt, b_oct = midi_to_step_alter_octave(bass_midi)
        bass_track["_generatedNotes"].append({
            "trackId": bass_track["id"],
            "step": b_step, "alter": b_alt, "octave": b_oct, "midi": bass_midi,
            "duration": beats_per_measure,
            "startTime": measure_start_time,
            "measure": str(m + 1),
            "lyric": "Ah"
        })
        
        # Tenor: Root note, octave 3 (Half Notes)
        tenor_midi = root_midi - 12 # Octave 3
        t_step, t_alt, t_oct = midi_to_step_alter_octave(tenor_midi)
        for b in range(0, beats_per_measure, 2):
            tenor_track["_generatedNotes"].append({
                "trackId": tenor_track["id"],
                "step": t_step, "alter": t_alt, "octave": t_oct, "midi": tenor_midi,
                "duration": 2,
                "startTime": measure_start_time + b,
                "measure": str(m + 1),
                "lyric": "Ah"
            })
        
        # Alto: Third note, octave 3 or 4 (Quarter Notes Arpeggio)
        alto_midi = third_midi - 12
        a_step, a_alt, a_oct = midi_to_step_alter_octave(alto_midi)
        a_step2, a_alt2, a_oct2 = midi_to_step_alter_octave(fifth_midi - 12)
        for b in range(beats_per_measure):
            # Alternate between third and fifth for movement
            is_fifth = b % 2 != 0
            cur_midi = (fifth_midi - 12) if is_fifth else alto_midi
            cur_step, cur_alt, cur_oct = (a_step2, a_alt2, a_oct2) if is_fifth else (a_step, a_alt, a_oct)
            alto_track["_generatedNotes"].append({
                "trackId": alto_track["id"],
                "step": cur_step, "alter": cur_alt, "octave": cur_oct, "midi": cur_midi,
                "duration": 1,
                "startTime": measure_start_time + b,
                "measure": str(m + 1),
                "lyric": "Ah"
            })
        
        # Soprano: Fifth note, octave 4 (Half Notes)
        soprano_midi = fifth_midi
        s_step, s_alt, s_oct = midi_to_step_alter_octave(soprano_midi)
        for b in range(0, beats_per_measure, 2):
            soprano_track["_generatedNotes"].append({
                "trackId": soprano_track["id"],
                "step": s_step, "alter": s_alt, "octave": s_oct, "midi": soprano_midi,
                "duration": 2,
                "startTime": measure_start_time + b,
                "measure": str(m + 1),
                "lyric": "Ah"
            })
                
    return {
        "style": "choir",
        "bpm": bpm,
        "chords": chords,
        "tracks": [soprano_track, alto_track, tenor_track, bass_track]
    }
