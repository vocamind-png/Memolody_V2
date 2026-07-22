import os
import csv
import librosa
import soundfile as sf
import warnings
from tqdm import tqdm

# Suppress librosa PySoundFile warnings
warnings.filterwarnings("ignore")

DATASET_DIR = "/workspace/diffsinger_training/dataset/nico_sliced/raw"
WAVS_DIR = os.path.join(DATASET_DIR, "wavs")
CSV_PATH = os.path.join(DATASET_DIR, "transcriptions.csv")
OUT_CSV_PATH = os.path.join(DATASET_DIR, "transcriptions_augmented.csv")

def main():
    if not os.path.exists(CSV_PATH):
        print(f"Error: {CSV_PATH} not found.")
        return

    # Read existing transcriptions
    rows = []
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) == 3:
                rows.append(row)

    print(f"Loaded {len(rows)} rows from transcriptions.csv")

    new_rows = []
    
    # Process each file
    for row in tqdm(rows, desc="Processing Audio"):
        name, ph_seq, ph_dur = row
        wav_path = os.path.join(WAVS_DIR, f"{name}.wav")
        
        if not os.path.exists(wav_path):
            print(f"Missing audio: {wav_path}")
            continue

        try:
            # Load audio
            y, sr = librosa.load(wav_path, sr=None)
            
            # Pitch shift +12 semitones
            y_p12 = librosa.effects.pitch_shift(y, sr=sr, n_steps=12)
            name_p12 = f"{name}_p12"
            sf.write(os.path.join(WAVS_DIR, f"{name_p12}.wav"), y_p12, sr)
            new_rows.append([name_p12, ph_seq, ph_dur])
            
            # Pitch shift +24 semitones
            y_p24 = librosa.effects.pitch_shift(y, sr=sr, n_steps=24)
            name_p24 = f"{name}_p24"
            sf.write(os.path.join(WAVS_DIR, f"{name_p24}.wav"), y_p24, sr)
            new_rows.append([name_p24, ph_seq, ph_dur])
            
        except Exception as e:
            print(f"Error processing {name}: {e}")

    # Write augmented CSV
    with open(OUT_CSV_PATH, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)  # Write original
        writer.writerows(new_rows)  # Write augmented

    print(f"Done! Augmented CSV saved to {OUT_CSV_PATH} with {len(rows) + len(new_rows)} total rows.")
    
    # Replace old CSV
    os.rename(CSV_PATH, os.path.join(DATASET_DIR, "transcriptions_backup.csv"))
    os.rename(OUT_CSV_PATH, CSV_PATH)
    print("Replaced transcriptions.csv with augmented version.")

if __name__ == "__main__":
    main()
