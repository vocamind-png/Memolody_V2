import json
import os
import argparse
from xml.etree import ElementTree as ET

def parse_musicxml(xml_string):
    """Very basic MusicXML parser to extract notes into ABC-like strings or raw format."""
    try:
        root = ET.fromstring(xml_string)
    except Exception as e:
        return []
    
    notes = []
    # Simplified extraction, focusing on pitch and duration
    for note in root.iter('note'):
        pitch = note.find('pitch')
        rest = note.find('rest')
        duration = note.find('duration')
        
        if pitch is not None:
            step = pitch.find('step').text if pitch.find('step') is not None else ""
            alter = pitch.find('alter').text if pitch.find('alter') is not None else "0"
            octave = pitch.find('octave').text if pitch.find('octave') is not None else "4"
            dur_val = duration.text if duration is not None else "1"
            
            note_str = step
            if alter == "1": note_str += "#"
            elif alter == "-1": note_str += "b"
            note_str += octave
            
            notes.append({"pitch": note_str, "duration": int(dur_val)})
        elif rest is not None:
            dur_val = duration.text if duration is not None else "1"
            notes.append({"pitch": "z", "duration": int(dur_val)})
            
    return notes

def generate_abc_from_notes(notes):
    """Convert extracted notes to a simple ABC notation string."""
    abc = "M:4/4\nL:1/4\nK:C\n"
    for n in notes:
        # Basic mapping to ABC
        # z for rest.
        p = n['pitch']
        if p == "z":
            abc += "z "
        else:
            abc += f"{p} "
    return abc.strip()

def build_dataset(input_json, output_jsonl):
    if not os.path.exists(input_json):
        print(f"Error: Input file {input_json} not found.")
        print("Please export your Memolody database (NIMO-CORE JSON) from the frontend first.")
        return
        
    with open(input_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    songs = []
    if "data" in data and "songs" in data["data"]:
        songs = data["data"]["songs"]
    elif isinstance(data, list):
        songs = data
        
    print(f"Found {len(songs)} songs in the export.")
    
    dataset = []
    for s in songs:
        metadata = s.get("metadata", {})
        xml_data = s.get("xmlData", "")
        
        if not xml_data:
            continue
            
        notes = parse_musicxml(xml_data)
        if not notes:
            continue
            
        abc_notation = generate_abc_from_notes(notes)
        
        # Format for instruction fine-tuning
        prompt = f"Style: {metadata.get('genre', 'Pop')}\nBPM: {metadata.get('bpm', 120)}\nKey: {metadata.get('key', 'C')}\nMelody: {abc_notation}"
        
        dataset.append({
            "instruction": "Generate a professional chord progression for the following melody.",
            "input": prompt,
            "output": "Chords: [...]" # In a real scenario, we would parse user's created chords too
        })
        
    with open(output_jsonl, 'w', encoding='utf-8') as f:
        for item in dataset:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    print(f"Successfully wrote {len(dataset)} examples to {output_jsonl}")
    print("Ready for Fine-Tuning with tools like HuggingFace Transformers or Unsloth!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract Memolody JSON to AI Dataset")
    parser.add_argument("--input", default="nimo-core-export.json", help="Exported JSON from Memolody")
    parser.add_argument("--output", default="memolody_dataset.jsonl", help="Output JSONL file for training")
    args = parser.parse_args()
    
    build_dataset(args.input, args.output)
