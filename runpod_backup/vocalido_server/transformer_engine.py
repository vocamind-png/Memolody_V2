import os
import tempfile
import music21
from transformers import AutoModelForCausalLM
from anticipation.sample import generate
from anticipation.convert import events_to_midi, midi_to_events

# Cache the model so it doesn't reload on every request
_TRANSFORMER_MODEL = None

def get_transformer_model():
    global _TRANSFORMER_MODEL
    if _TRANSFORMER_MODEL is None:
        print("[Transformer] Loading Anticipatory Music Transformer (small-800k)...")
        # Load small model to save memory/time. Use .to("mps") if on Mac Apple Silicon
        import torch
        device = "cpu"
        if torch.backends.mps.is_available():
            device = "mps"
        elif torch.cuda.is_available():
            device = "cuda"
            
        _TRANSFORMER_MODEL = AutoModelForCausalLM.from_pretrained('stanford-crfm/music-small-800k').to(device)
        print(f"[Transformer] Model loaded successfully on {device}!")
    return _TRANSFORMER_MODEL

def generate_transformer_harmony(original_xml: str, target_length_seconds: int = 30) -> music21.stream.Score:
    """
    Takes original MusicXML, runs it through Anticipatory Music Transformer to generate accompaniment,
    and returns a new music21 Score.
    """
    model = get_transformer_model()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        xml_path = os.path.join(tmpdir, "input.xml")
        midi_path = os.path.join(tmpdir, "input.mid")
        
        # 1. Save XML and convert to MIDI
        with open(xml_path, "w", encoding="utf-8") as f:
            f.write(original_xml)
            
        score = music21.converter.parse(xml_path)
        score.write("midi", fp=midi_path)
        
        # 2. Tokenize MIDI to anticipation events
        events = midi_to_events(midi_path)
        
        # 3. Generate accompaniment
        # The generate function takes inputs and continues/harmonizes them.
        # We set start_time=0 so it treats all events as inputs to harmonize/continue
        print("[Transformer] Generating accompaniment...")
        generated_events = generate(model, start_time=0, end_time=target_length_seconds, inputs=events, top_p=0.98)
        
        # 4. Convert back to MIDI
        out_mid = events_to_midi(generated_events)
        out_midi_path = os.path.join(tmpdir, "output.mid")
        out_mid.save(out_midi_path)
        
        # 5. Parse back to music21 score
        generated_score = music21.converter.parse(out_midi_path)
        
        return generated_score
