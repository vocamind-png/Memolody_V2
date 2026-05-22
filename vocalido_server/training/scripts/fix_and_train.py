import os
import csv
import subprocess
import yaml

DATA_DIR = "/workspace/DiffSinger/data/raw/vocalido_gtsinger_en"
CSV_PATH = os.path.join(DATA_DIR, "transcriptions.csv")

# Fix transcriptions.csv
print("Fixing transcriptions.csv phoneme casing...")
rows = []
with open(CSV_PATH, "r") as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Convert phonemes to lowercase, except SP and AP
        new_ph = []
        for p in row['ph_seq'].split():
            if p in ["SP", "AP", "sp", "ap"]:
                new_ph.append("SP" if p.upper() == "SP" else "AP")
            else:
                new_ph.append(p.lower())
        row['ph_seq'] = " ".join(new_ph)
        rows.append(row)

with open(CSV_PATH, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "ph_seq", "ph_dur", "spk_name"])
    writer.writeheader()
    writer.writerows(rows)
print(f"Fixed {len(rows)} rows.")

os.chdir("/workspace/DiffSinger")
print("\n--- Running Binarize ---")
r_bin = subprocess.run("PYTHONPATH=. python scripts/binarize.py --config configs/vocalido_gtsinger_en.yaml", shell=True, capture_output=True, text=True)
print(r_bin.stdout)
if r_bin.returncode != 0:
    print(r_bin.stderr)
    print("❌ Binarize Failed")
    exit(1)

print("\n--- Starting Train ---")
# Start train in background and capture first few lines
subprocess.run("nohup PYTHONPATH=. python scripts/train.py --config configs/vocalido_gtsinger_en.yaml --exp_name vocalido_gtsinger_en --reset > /workspace/train_run.log 2>&1 &", shell=True)
print("✅ Training launched in background. Check /workspace/train_run.log")
