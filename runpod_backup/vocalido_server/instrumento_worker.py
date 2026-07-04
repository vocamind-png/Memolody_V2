import argparse
import os
import glob
import shutil
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--midi", required=True, help="Path to input MIDI file")
    parser.add_argument("--out", required=True, help="Path to output WAV file")
    args = parser.parse_args()

    try:
        from midi_ddsp import synthesize_midi
    except ImportError:
        print("ERROR: midi-ddsp is not installed in this environment.")
        sys.exit(1)

    output_dir = os.path.dirname(args.out)
    temp_dir = os.path.join(output_dir, "ddsp_temp")
    os.makedirs(temp_dir, exist_ok=True)

    print(f"Synthesizing MIDI: {args.midi} to {temp_dir}")
    try:
        # synthesize_midi generates separate WAV files for each instrument track in the MIDI
        synthesize_midi(args.midi, output_dir=temp_dir)
        
        # Find the generated wav file
        wav_files = glob.glob(os.path.join(temp_dir, "*.wav"))
        if not wav_files:
            print("ERROR: MIDI-DDSP did not generate any output files.")
            sys.exit(1)
            
        # If there are multiple tracks, we just take the first one for this track
        # (Assuming the input MIDI has exactly one track for Instrumento to process)
        target_wav = wav_files[0]
        
        # Move and rename to the requested output path
        shutil.move(target_wav, args.out)
        print(f"Successfully generated: {args.out}")
        
    except Exception as e:
        print(f"ERROR during synthesis: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        # Cleanup
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

if __name__ == "__main__":
    main()
