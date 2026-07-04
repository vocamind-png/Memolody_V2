import os
import tempfile
import base64
import numpy as np
import librosa
import soundfile as sf
from typing import Dict, Tuple

def separate_stems(audio_file_path: str) -> Dict[str, str]:
    """
    Separates audio into vocals and accompaniment using Demucs.
    Returns a dict with paths to the separated stems.
    """
    print(f"[Lyria Pipeline] Separating stems for {audio_file_path} using Demucs...")
    try:
        import demucs.api
        
        # Initialize Demucs API (using htdemucs_mmi or htdemucs)
        separator = demucs.api.Separator(model="htdemucs", segment=2)
        
        # Create output directory
        out_dir = tempfile.mkdtemp(prefix="demucs_out_")
        
        # Separate
        origin, separated = separator.separate_audio_file(audio_file_path)
        
        # The 'separated' object is a dict of stems (vocals, drums, bass, other)
        # We'll save them as wav files
        stem_paths = {}
        for stem_name, stem_tensor in separated.items():
            # stem_tensor shape is (channels, length)
            # Demucs output is usually 44100 Hz
            out_path = os.path.join(out_dir, f"{stem_name}.wav")
            # Convert PyTorch tensor to numpy array (transpose for soundfile)
            audio_np = stem_tensor.cpu().numpy().T
            sf.write(out_path, audio_np, separator.samplerate)
            stem_paths[stem_name] = out_path
            print(f"[Lyria Pipeline] Saved stem {stem_name} to {out_path}")
            
        return stem_paths
        
    except Exception as e:
        print(f"[Lyria Pipeline] Error in stem separation: {e}")
        import traceback
        traceback.print_exc()
        raise

def audio_to_midi(audio_file_path: str) -> str:
    """
    Converts a single audio stem (e.g. vocals or other) into a MIDI file using Spotify's basic-pitch.
    Returns the path to the generated MIDI file.
    """
    print(f"[Lyria Pipeline] Converting {audio_file_path} to MIDI using basic-pitch...")
    try:
        from basic_pitch.inference import predict_and_save
        
        out_dir = tempfile.mkdtemp(prefix="midi_out_")
        out_path = os.path.join(out_dir, "extracted.mid")
        
        # predict_and_save takes lists of paths
        predict_and_save(
            audio_path_list=[audio_file_path],
            output_directory=out_dir,
            save_midi=True,
            sonify_midi=False,
            save_model_outputs=False,
            save_notes=False
        )
        
        # basic-pitch appends _basic_pitch to the output filename automatically
        base_name = os.path.splitext(os.path.basename(audio_file_path))[0]
        actual_out_path = os.path.join(out_dir, f"{base_name}_basic_pitch.mid")
        
        if os.path.exists(actual_out_path):
            print(f"[Lyria Pipeline] Saved MIDI to {actual_out_path}")
            return actual_out_path
        else:
            raise FileNotFoundError("Basic-pitch did not generate a MIDI file.")
            
    except Exception as e:
        print(f"[Lyria Pipeline] Error in audio-to-midi: {e}")
        import traceback
        traceback.print_exc()
        raise

def midi_to_musicxml(midi_file_path: str) -> str:
    """
    Converts a MIDI file to MusicXML using music21.
    """
    print(f"[Lyria Pipeline] Converting {midi_file_path} to MusicXML...")
    try:
        import music21
        out_path = midi_file_path.replace(".mid", ".musicxml")
        
        # Parse MIDI
        parsed = music21.converter.parse(midi_file_path)
        
        # Quantize to simplify the score
        parsed = parsed.quantize([4, 8, 16], processOffsets=True, processDurations=True)
        
        # Write to MusicXML
        parsed.write("musicxml", out_path)
        
        return out_path
    except Exception as e:
        print(f"[Lyria Pipeline] Error in midi-to-xml: {e}")
        import traceback
        traceback.print_exc()
        raise

def pipeline_base64_audio_to_midi_stems(audio_b64: str, mode: str = "2stems") -> Dict[str, Dict[str, str]]:
    """
    Full pipeline:
    1. Decode base64 MP3 to temp file
    2. Separate into Vocals / Other (or Vocals/Drums/Bass/Other based on mode)
    3. Convert each stem to MIDI
    4. Convert MIDI to MusicXML
    5. Return Base64 encoded MIDI and XML files
    """
    try:
        audio_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_mp3 = tmp.name
            
        stems = separate_stems(tmp_mp3)
        
        results = {}
        for stem_name, stem_path in stems.items():
            if mode == "2stems" and stem_name not in ['vocals', 'other']:
                continue
                
            midi_path = audio_to_midi(stem_path)
            xml_path = midi_to_musicxml(midi_path)
            
            with open(midi_path, "rb") as f_mid:
                midi_b64 = base64.b64encode(f_mid.read()).decode('utf-8')
                
            with open(xml_path, "rb") as f_xml:
                xml_b64 = base64.b64encode(f_xml.read()).decode('utf-8')
                
            results[stem_name] = {
                "midi": midi_b64,
                "xml": xml_b64
            }
                    
        return results
        
    except Exception as e:
        print(f"[Lyria Pipeline] Pipeline error: {e}")
        raise
