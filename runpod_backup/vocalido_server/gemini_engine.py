import os
import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import List, Optional
from dotenv import load_dotenv

# Load environment variables (like GEMINI_API_KEY) from parent .env
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(env_path)

# Initialize Gemini Client
try:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment.")
    client = genai.Client(api_key=api_key)
    GENAI_AVAILABLE = True
    print("[Gemini] ✅ Google GenAI client initialized successfully.")
except Exception as e:
    print(f"[Gemini] ⚠️ Failed to initialize Google GenAI client: {e}")
    GENAI_AVAILABLE = False

class InstrumentTrack(BaseModel):
    instrument: str = Field(description="Instrument name: 'bass', 'piano', or 'drums'")
    notes_compact: List[str] = Field(description="List of notes in compact format 'midi_pitch:start_beat:duration_beats'. Example: ['36:0.0:1.0', '48:1.5:0.5']")

class MeasurePattern(BaseModel):
    chord: str = Field(description="The chord for this measure, e.g., 'Cmaj7'")
    piano_rhythm: str = Field(description="Must be one of: 'block_whole', 'block_syncopated', 'arpeggio_up', 'arpeggio_down', 'offbeats', 'driving_8ths'")
    bass_rhythm: str = Field(description="Must be one of: 'whole_note', 'half_notes', 'driving_8ths', 'syncopated_pop', 'walking'")
    drum_groove: str = Field(description="Must be one of: 'none', 'hihat_only', 'standard_rock', 'four_on_the_floor', 'half_time', 'syncopated_funk', 'jazz_swing'")

class ArrangementResponse(BaseModel):
    style: str = Field(description="The applied musical style")
    bpm: int = Field(description="The suggested BPM for this arrangement")
    harmonic_analysis: str = Field(description="Step-by-step reasoning for the chosen chord progression, applying professional music theory (e.g. secondary dominants, extended chords).")
    patterns: List[MeasurePattern] = Field(description="Measure-by-measure detailed arrangement dynamics. Must have exactly total_measures items.")
    tracks: List[InstrumentTrack] = Field(description="Generated individual tracks for specific melodies, counterpoints, or SATB vocal harmonies requested in the brief.")

def generate_arrangement(prompt: str, style: str, key: str, bpm: int, num_sections: int = 1, lead_melody: list = None, is_simple_mode: bool = False) -> dict:
    if not GENAI_AVAILABLE:
        return {"error": "Gemini API is not configured or available. Please check GEMINI_API_KEY."}
        
    melody_context = "No specific melody provided."
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
            # Calculate duration in terms of quarter notes (assuming start/dur are in beats)
            # In ABC, L:1/4 means a quarter note is the default unit (1).
            abc_dur = max(1, round(dur))
            abc_note = note_name
            if abc_dur > 1:
                abc_note += str(abc_dur)
            elif abc_dur < 1:
                abc_note += "/2" # approximation for eighth notes
                
            measure_groups[m].append(abc_note)
            
        abc_lines = []
        for m in sorted(measure_groups.keys()):
            abc_lines.append(f"| " + " ".join(measure_groups[m]))
        
        melody_context = "Lead Melody in ABC Notation format:\n```abc\n" + abc_str + "\n".join(abc_lines) + "\n|]\n```\n"

    beats_per_measure = 4 # Default 4/4
    total_beats = 16
    if lead_melody:
        total_beats = max((n.get("startTime", 0) + n.get("duration", 0)) for n in lead_melody)
    total_measures = max(4, int((total_beats + beats_per_measure - 1) // beats_per_measure))

    theory_instruction = (
        "Do not just use basic triads. Apply advanced music theory when appropriate: secondary dominants, passing chords, "
        "extended chords (maj7, m9), and inversions to create emotional depth. "
        "CRITICAL: Distinguish between 'Chord Tones' (notes falling on downbeats with long duration) and 'Passing Tones' (short notes connecting chord tones). "
        "Choose chords that strongly harmonize with the downbeat 'Chord Tones' in the melody. "
    )
    if is_simple_mode:
        theory_instruction = (
            "You MUST use simple, diatonic, basic pop chords. Do NOT use overly complex jazz chords, extended chords (9ths, 11ths), or weird passing chords unless absolutely necessary. Keep the harmony very simple, familiar, and pleasant to the general public. "
            "CRITICAL: Distinguish between 'Chord Tones' (notes falling on downbeats with long duration) and 'Passing Tones' (short notes connecting chord tones). "
            "Choose chords that perfectly match the downbeat 'Chord Tones' in the melody. "
        )

    system_instruction = (
        "You are 'Nimo', an elite Agentic AI Arranger and professional Music Producer. "
        "Your task is to analyze the user's brief, style, key, tempo, and the provided Lead Melody in ABC Notation. "
        f"{theory_instruction}"
        "First, write a 'harmonic_analysis' explaining your thought process for the chords and arrangement. "
        f"CRITICAL: You MUST output a `patterns` array containing exactly {total_measures} items (one for each measure from measure 1 to {total_measures}). Do not skip any measure. "
        "Use the patterns to build structural dynamics (e.g. use 'none' or 'whole_note' in intros, build up to 'driving_8ths' in choruses). "
        "Our Pattern Engine will automatically handle standard Drums, Bass, Piano, and SATB Vocal Choirs based on your `patterns` array. "
        "Therefore, DO NOT generate 'bass', 'piano', 'drums', 'soprano', 'alto', 'tenor', 'bass', or 'choir' tracks. "
        "INSTEAD, ONLY if the user asks for specific melodic solos (e.g., 'Violin solo', 'Guitar solo'), generate those tracks in the `tracks` array and write their notes in `notes_compact` using the format `pitch:start_beat:duration` (e.g. `36:0.0:1.0`). "
    )
    
    user_prompt = (
        f"Brief: {prompt}\n"
        f"Style: {style}\n"
        f"Key: {key}\n"
        f"Tempo: {bpm} BPM\n"
        f"Number of sections needed: {num_sections}\n\n"
        f"{melody_context}\n\n"
        "Please carefully analyze the melody notes above (paying special attention to downbeats and note durations) and generate the absolute optimal chord progression and rhythmic arrangement that harmonizes beautifully and perfectly fits the melody."
    )

    try:
        # Use gemini-3.5-flash for "Agentic AI" logic
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=ArrangementResponse,
                temperature=0.2, # Low temp for logical arrangement
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"[Gemini] Error in generate_arrangement: {e}")
        return {"error": str(e)}

def generate_lyrics(prompt: str, melody_xml: str) -> dict:
    if not GENAI_AVAILABLE:
        return {"error": "Gemini API is not configured or available. Please check GEMINI_API_KEY."}
        
    system_instruction = (
        "You are an elite, award-winning lyricist. Your task is to write lyrics that perfectly match the emotion, theme, and rhythm described by the user. "
        "Be extremely creative, use beautiful metaphors, and ensure the lyrics are emotionally resonant."
    )
    
    user_prompt = (
        f"Theme / Brief:\n{prompt}\n\n"
        f"Melody Structure (Optional XML representation):\n{melody_xml}\n\n"
        "Write the full lyrics. Do not return JSON, just return the raw text of the lyrics with clear verse/chorus sections."
    )

    try:
        # Use gemini-3.5-flash for "Creative AI"
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.9, # High temp for creativity
            ),
        )
        return {"lyrics": response.text}
    except Exception as e:
        print(f"[Gemini] Error in generate_lyrics: {e}")
        return {"error": str(e)}

def parse_chord_to_pitches(chord_name: str, octave: int = 3) -> list:
    """Parse basic chord names to MIDI pitch values."""
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    flat_to_sharp = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'}
    
    # Extract root
    root = chord_name[0].upper()
    if len(chord_name) > 1 and chord_name[1] in ('#', 'b'):
        root += chord_name[1]
    
    if root in flat_to_sharp:
        root = flat_to_sharp[root]
        
    try:
        root_idx = notes.index(root)
    except ValueError:
        root_idx = 0
        
    is_minor = 'm' in chord_name and 'maj' not in chord_name.lower()
    is_dim = 'dim' in chord_name.lower()
    
    third_idx = (root_idx + (3 if is_minor or is_dim else 4)) % 12
    fifth_idx = (root_idx + (6 if is_dim else 7)) % 12
    
    pitches = [
        root_idx + (octave * 12) + 12, # MIDI offset (C3 = 48)
        third_idx + (octave * 12) + 12,
        fifth_idx + (octave * 12) + 12
    ]
    
    # 7th chords
    if '7' in chord_name:
        if 'maj7' in chord_name.lower():
            pitches.append((root_idx + 11) % 12 + (octave * 12) + 12)
        elif is_dim:
            pitches.append((root_idx + 9) % 12 + (octave * 12) + 12)
        else:
            pitches.append((root_idx + 10) % 12 + (octave * 12) + 12)
            
    # Fix inversions (make sure pitches are strictly ascending)
    for i in range(1, len(pitches)):
        while pitches[i] <= pitches[i-1]:
            pitches[i] += 12
            
    return pitches

def find_closest_inversion(target_pitches: list, previous_pitches: list) -> list:
    """Finds the chord inversion that minimizes movement from the previous chord."""
    if not previous_pitches:
        return target_pitches
        
    prev_center = sum(previous_pitches) / len(previous_pitches)
    
    # Generate all sensible inversions (from -1 octave to +1 octave)
    best_inversion = target_pitches
    min_dist = float('inf')
    
    # We will try shifting each note of the target pitches up or down by octaves
    # A simple approach: for each note class in the target chord, find the octave that puts it closest to prev_center
    new_pitches = []
    for pitch in target_pitches:
        pitch_class = pitch % 12
        # Find the octave that puts this pitch class closest to prev_center
        # The closest pitch to prev_center with a given pitch_class is:
        octave_guess = int(round((prev_center - pitch_class) / 12.0))
        closest_pitch = pitch_class + (octave_guess * 12)
        new_pitches.append(closest_pitch)
        
    new_pitches.sort()
    
    # Ensure it's not too clustered or spread out (simple heuristic)
    for i in range(1, len(new_pitches)):
        if new_pitches[i] <= new_pitches[i-1]:
            new_pitches[i] += 12
            
    return new_pitches

def humanize_val(val: float, jitter: float = 0.02) -> float:
    import random
    """Add a slight random jitter to a value to humanize timing."""
    return val + random.uniform(-jitter, jitter)

def midi_to_step_alter_octave(midi_pitch: int) -> tuple:
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    note_name = notes[midi_pitch % 12]
    step = note_name[0]
    alter = 1 if '#' in note_name else 0
    octave = (midi_pitch // 12) - 1
    return step, alter, octave

def generate_pattern_tracks(patterns: list, beats_per_measure: int, style: str, prompt: str) -> list:
    import time
    
    bass_track = {
        "id": f"track-bass-{int(time.time()*1000)}", "name": "AI Bass", "instrument": "bass", "mode": "instrument",
        "isMuted": False, "isSolo": False, "volume": 0.85, "pan": 0, "_generatedNotes": []
    }
    piano_track = {
        "id": f"track-piano-{int(time.time()*1000)}", "name": "AI Keys", "instrument": "piano", "mode": "instrument",
        "isMuted": False, "isSolo": False, "volume": 0.75, "pan": 0, "_generatedNotes": []
    }
    drums_track = {
        "id": f"track-drums-{int(time.time()*1000)}", "name": "AI Drums", "instrument": "drums", "mode": "instrument",
        "isMuted": False, "isSolo": False, "volume": 0.9, "pan": 0, "_generatedNotes": []
    }
    
    # Initialize SATB tracks if needed
    needs_satb = any(keyword in prompt.lower() for keyword in ["satb", "choir", "ประสานเสียง", "soprano", "chorus"])
    satb_tracks = {}
    if needs_satb:
        for voice, pan_val in [("Soprano", -30), ("Alto", -10), ("Tenor", 10), ("Bass", 30)]:
            satb_tracks[voice] = {
                "id": f"track-{voice.lower()}-{int(time.time()*1000)}", "name": f"AI {voice}", "instrument": voice.lower(), "mode": "vocal",
                "isMuted": False, "isSolo": False, "volume": 0.8, "pan": pan_val, "_generatedNotes": []
            }
    
    def add_note(track, midi_pitch, start, dur, measure, lyric="", humanize=True):
        step, alt, oct = midi_to_step_alter_octave(midi_pitch)
        # Apply humanization
        h_start = humanize_val(start, 0.015) if humanize else start
        h_dur = max(0.1, humanize_val(dur, 0.01)) if humanize else dur
        track["_generatedNotes"].append({
            "trackId": track["id"], "step": step, "alter": alt, "octave": oct, "midi": midi_pitch,
            "duration": h_dur, "startTime": h_start, "measure": str(measure), "lyric": lyric
        })

    prev_chord_pitches = []

    for measure_idx, pat in enumerate(patterns):
        base_beat = measure_idx * beats_per_measure
        m_str = measure_idx + 1
        
        # Fallback if old 'chords' format is passed instead of dict patterns
        if isinstance(pat, str):
            chord_name = pat
            p_rhythm = 'block_syncopated'
            b_rhythm = 'syncopated_pop'
            d_groove = 'standard_rock'
        else:
            chord_name = pat.get('chord', '')
            p_rhythm = pat.get('piano_rhythm', 'block_syncopated')
            b_rhythm = pat.get('bass_rhythm', 'syncopated_pop')
            d_groove = pat.get('drum_groove', 'standard_rock')
            
        primary_chord = chord_name.split('-')[0].split('/')[0].strip()
        if primary_chord == "" or primary_chord.lower() in ("none", "n/a", "rest", "n.c."):
            continue
            
        chord_pitches = parse_chord_to_pitches(primary_chord, octave=4)
        root = chord_pitches[0]
        
        # Voice Leading for piano track
        vl_pitches = find_closest_inversion(chord_pitches, prev_chord_pitches)
        prev_chord_pitches = vl_pitches
        
        # --- BASS PATTERNS ---
        bass_pitch = (root % 12) + 36 # Bass stays in octave 2 (36 = C2)
        if b_rhythm == 'whole_note':
            add_note(bass_track, bass_pitch, base_beat, 3.8, m_str)
        elif b_rhythm == 'half_notes':
            add_note(bass_track, bass_pitch, base_beat, 1.8, m_str)
            add_note(bass_track, bass_pitch, base_beat + 2, 1.8, m_str)
        elif b_rhythm == 'driving_8ths':
            for b in range(8):
                add_note(bass_track, bass_pitch, base_beat + (b * 0.5), 0.3, m_str)
        elif b_rhythm == 'walking':
            third = chord_pitches[1] - 24
            fifth = chord_pitches[2] - 24
            add_note(bass_track, bass_pitch, base_beat, 0.9, m_str)
            add_note(bass_track, third, base_beat + 1, 0.9, m_str)
            add_note(bass_track, fifth, base_beat + 2, 0.9, m_str)
            add_note(bass_track, root - 23, base_beat + 3, 0.9, m_str) # chromatic approach
        else: # syncopated_pop
            add_note(bass_track, bass_pitch, base_beat, 1.4, m_str)
            add_note(bass_track, bass_pitch, base_beat + 1.5, 0.9, m_str)
            add_note(bass_track, bass_pitch, base_beat + 3.0, 0.9, m_str)
            
        # --- DRUM PATTERNS ---
        if d_groove == 'none':
            pass
        elif d_groove == 'hihat_only':
            for b in range(8):
                add_note(drums_track, 42, base_beat + (b * 0.5), 0.25, m_str)
        elif d_groove == 'four_on_the_floor':
            for b in range(4):
                add_note(drums_track, 36, base_beat + b, 0.5, m_str) # Kick
                add_note(drums_track, 42, base_beat + b + 0.5, 0.25, m_str) # Off-beat hi-hat
            add_note(drums_track, 38, base_beat + 1, 0.5, m_str) # Snare
            add_note(drums_track, 38, base_beat + 3, 0.5, m_str) # Snare
        elif d_groove == 'half_time':
            add_note(drums_track, 36, base_beat, 0.5, m_str)
            add_note(drums_track, 38, base_beat + 2, 0.5, m_str) # Snare on 3
            for b in range(8):
                add_note(drums_track, 42, base_beat + (b * 0.5), 0.25, m_str)
        elif d_groove == 'syncopated_funk':
            add_note(drums_track, 36, base_beat, 0.5, m_str)
            add_note(drums_track, 36, base_beat + 1.5, 0.5, m_str)
            add_note(drums_track, 36, base_beat + 2.5, 0.5, m_str)
            add_note(drums_track, 38, base_beat + 1, 0.5, m_str)
            add_note(drums_track, 38, base_beat + 3, 0.5, m_str)
            for b in range(16):
                vol = 0.3 if b % 2 != 0 else 0.5
                add_note(drums_track, 42, base_beat + (b * 0.25), 0.15, m_str)
        elif d_groove == 'jazz_swing':
            add_note(drums_track, 51, base_beat, 0.5, m_str) # Ride
            add_note(drums_track, 51, base_beat + 1, 0.5, m_str)
            add_note(drums_track, 51, base_beat + 1.66, 0.33, m_str) # Swing
            add_note(drums_track, 51, base_beat + 2, 0.5, m_str)
            add_note(drums_track, 51, base_beat + 3, 0.5, m_str)
            add_note(drums_track, 51, base_beat + 3.66, 0.33, m_str)
            add_note(drums_track, 37, base_beat + 1, 0.5, m_str) # Cross stick
        else: # standard_rock
            for b in range(4):
                if b in (0, 2): add_note(drums_track, 36, base_beat + b, 0.5, m_str) # Kick
                if b in (1, 3): add_note(drums_track, 38, base_beat + b, 0.5, m_str) # Snare
            for b in range(8):
                add_note(drums_track, 42, base_beat + (b * 0.5), 0.25, m_str)
            if measure_idx % 4 == 0:
                add_note(drums_track, 49, base_beat, 1.0, m_str) # Crash
                
        # --- PIANO/KEYS PATTERNS --- (Using Voice-Led Pitches)
        if p_rhythm == 'block_whole':
            for p in vl_pitches:
                add_note(piano_track, p, base_beat, 3.8, m_str)
        elif p_rhythm == 'arpeggio_up':
            arp_pitches = [vl_pitches[0], vl_pitches[1] if len(vl_pitches)>1 else vl_pitches[0]+4, 
                           vl_pitches[2] if len(vl_pitches)>2 else vl_pitches[0]+7, vl_pitches[0] + 12]
            if len(vl_pitches) > 3: arp_pitches[3] = vl_pitches[3]
            for i, p in enumerate(arp_pitches):
                add_note(piano_track, p, base_beat + (i * 0.5), 1.0, m_str)
                add_note(piano_track, p, base_beat + 2 + (i * 0.5), 1.0, m_str)
        elif p_rhythm == 'arpeggio_down':
            arp_pitches = [vl_pitches[2] if len(vl_pitches)>2 else vl_pitches[0]+7, 
                           vl_pitches[1] if len(vl_pitches)>1 else vl_pitches[0]+4, 
                           vl_pitches[0], vl_pitches[0] - 12]
            for i, p in enumerate(arp_pitches):
                add_note(piano_track, p, base_beat + (i * 0.5), 1.0, m_str)
                add_note(piano_track, p, base_beat + 2 + (i * 0.5), 1.0, m_str)
        elif p_rhythm == 'offbeats':
            for offset in [0.5, 1.5, 2.5, 3.5]:
                for p in vl_pitches:
                    add_note(piano_track, p, base_beat + offset, 0.4, m_str)
        elif p_rhythm == 'driving_8ths':
            for b in range(8):
                for p in vl_pitches:
                    add_note(piano_track, p, base_beat + (b * 0.5), 0.3, m_str)
        else: # block_syncopated
            for offset in [0.0, 1.5, 2.5]:
                for p in vl_pitches:
                    add_note(piano_track, p, base_beat + offset, 0.8, m_str)
                    
        # --- SATB CHOIR GENERATION (Algorithmic Voice Led) ---
        if needs_satb:
            # We map voices to the inverted chord from highest to lowest
            # Sort vl_pitches so we know [0] is lowest, [n] is highest
            s_pitches = sorted(vl_pitches)
            
            bass_vocal_p = s_pitches[0] if len(s_pitches) > 0 else root
            tenor_p = s_pitches[1] if len(s_pitches) > 1 else root + 4
            alto_p = s_pitches[2] if len(s_pitches) > 2 else root + 7
            soprano_p = s_pitches[-1] + 12 # Soprano takes the highest note up an octave
            
            # Simple phrasing based on the drum groove
            rhythm = [0.0] if d_groove in ('none', 'half_time') else [0.0, 2.0]
            dur = 3.8 if d_groove in ('none', 'half_time') else 1.8
            
            for offset in rhythm:
                add_note(satb_tracks["Soprano"], soprano_p, base_beat + offset, dur, m_str, "La", humanize=True)
                add_note(satb_tracks["Alto"], alto_p, base_beat + offset, dur, m_str, "La", humanize=True)
                add_note(satb_tracks["Tenor"], tenor_p, base_beat + offset, dur, m_str, "La", humanize=True)
                add_note(satb_tracks["Bass"], bass_vocal_p, base_beat + offset, dur, m_str, "La", humanize=True)
                
    result_tracks = [drums_track, bass_track, piano_track]
    if needs_satb:
        result_tracks.extend([satb_tracks["Soprano"], satb_tracks["Alto"], satb_tracks["Tenor"], satb_tracks["Bass"]])
        
    return result_tracks

def generate_arrangement_with_midi(payload: dict) -> dict:
    import time
    
    config = payload.get("config", {})
    prompt = config.get("prompt", "")
    style = config.get("style", "Pop")
    key = config.get("key", "C")
    bpm = config.get("bpm", 120)
    num_sections = config.get("num_sections", 1)
    lead_melody = payload.get("leadMelody", [])
    
    is_simple_mode = config.get("is_simple_mode", False)
    
    # 1. Get arrangement from Gemini
    gemini_res = generate_arrangement(prompt, style, key, bpm, num_sections, lead_melody, is_simple_mode)
    if "error" in gemini_res:
        return gemini_res
        
    beats_per_measure = 4 # Default 4/4
    
    # 2. Add Pattern Engine Tracks (Bass, Drums, Piano, SATB Choir)
    patterns = gemini_res.get("patterns", gemini_res.get("chords", []))
    final_tracks = generate_pattern_tracks(patterns, beats_per_measure, style, prompt)
    
    # 3. Build track states from Gemini tracks (if Gemini generated custom melodies)
    ai_tracks = gemini_res.get("tracks", [])
    
    for ai_t in ai_tracks:
        inst_name = ai_t.get("instrument", "unknown").lower()
        
        is_vocal = inst_name in ("soprano", "alto", "tenor", "bass", "choir", "vocal", "vocals")
        
        # Setup defaults
        mode = "vocal" if is_vocal else "instrument"
        volume = 0.8
        pan = 0
        display_name = f"AI {inst_name.capitalize()}"
        
        if inst_name == "bass":
            volume = 0.85
        elif inst_name == "piano" or inst_name == "keys":
            volume = 0.75
            inst_name = "piano"
        elif inst_name == "drums":
            volume = 0.9
            
        track_state = {
            "id": f"track-{inst_name}-{int(time.time()*1000)}",
            "name": display_name,
            "instrument": inst_name, "mode": mode,
            "isMuted": False, "isSolo": False, "volume": volume, "pan": pan,
            "_generatedNotes": []
        }
        
        for n_str in ai_t.get("notes_compact", []):
            try:
                parts = n_str.split(":")
                if len(parts) != 3: continue
                midi_pitch = int(float(parts[0]))
                start_beat = float(parts[1])
                duration_beats = float(parts[2])
            except Exception:
                continue
                
            step, alt, oct = midi_to_step_alter_octave(midi_pitch)
            measure_idx = int(start_beat // beats_per_measure) + 1
            
            # Default lyric for vocal tracks
            lyric = "La" if is_vocal else ""
            
            track_state["_generatedNotes"].append({
                "trackId": track_state["id"],
                "step": step, "alter": alt, "octave": oct, "midi": midi_pitch,
                "duration": duration_beats,
                "startTime": start_beat,
                "measure": str(measure_idx),
                "lyric": lyric
            })
            
        final_tracks.append(track_state)
    
    return {
        "style": gemini_res.get("style", style),
        "bpm": gemini_res.get("bpm", bpm),
        "harmonic_analysis": gemini_res.get("harmonic_analysis", ""),
        "tracks": final_tracks
    }
