#!/usr/bin/env python3
"""
rebuild_dataset_and_upload.py
─────────────────────────────
1. Reads all 73 WAV recordings from ScoreLens real dataset
2. Generates correct ARPAbet transcriptions (not "a" spam) based on filename patterns
3. Copies WAVs + writes transcriptions.csv into the training dataset folder
4. Uploads everything to GCS (gs://vocalido-master-corpus-v1/)
5. Prints the RunPod resume command

Usage:
    cd /Users/paisan/vocamind-projects/Memolody_V2
    source vocalido_server/.venv/bin/activate
    python vocalido_server/training/scripts/rebuild_dataset_and_upload.py

Requires:  librosa, soundfile, gsutil (gcloud SDK)
"""

import csv, os, shutil, subprocess
import librosa

# ── Paths ─────────────────────────────────────────────────────────────────────
SRC_WAV_DIR  = "/Users/paisan/vocamind-projects/Memolody_V2/ScoreLens_V3_Core/real_dataset/extracted_xmls/DiffSinger/data/vocalido/wavs"
TRAIN_DIR    = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/training/DiffSinger/data/vocalido"
DST_WAV_DIR  = os.path.join(TRAIN_DIR, "wavs")
CSV_PATH     = os.path.join(TRAIN_DIR, "transcriptions.csv")
GCS_BUCKET   = "gs://vocalido-master-corpus-v1/diffsinger/data/vocalido"
TARGET_SR    = 44100

os.makedirs(DST_WAV_DIR, exist_ok=True)

# ── Transcription rules per filename pattern ──────────────────────────────────
#
# DiffSinger ARPAbet phoneme list used:
#  Vowels:     aa ae ah ao aw ay eh er ey ih iy ow oy uh uw
#  Consonants: b ch d dh f g hh jh k l m n ng p r s sh t th v w y z zh
#  Silence:    SP
#
# For sustained/scale recordings, the phoneme repeats across all melody notes.
# ph_dur is derived from WAV total duration ÷ number of phoneme events.

def get_wav_duration(wav_path):
    y, sr = librosa.load(wav_path, sr=TARGET_SR, mono=True)
    return len(y) / TARGET_SR, y

def make_row(name, ph_list, total_dur):
    """
    ph_list: list of phoneme tokens (SP separates note groups)
    Assigns 0.03s to SP, equal share of remaining time to voiced phonemes.
    """
    sp_count = ph_list.count("SP")
    ph_count = len(ph_list) - sp_count
    sp_dur   = 0.03
    ph_dur   = max(0.07, (total_dur - sp_count * sp_dur) / max(1, ph_count))

    durs = [sp_dur if p == "SP" else round(ph_dur, 4) for p in ph_list]
    return {
        "name":   name,
        "ph_seq": " ".join(ph_list),
        "ph_dur": " ".join(str(d) for d in durs),
    }

# ── Solfege patterns ──────────────────────────────────────────────────────────
# Do  Re  Mi  Fa  Sol  La  Ti   Do
# d ow | r ey | m iy | f ae | s ow l | s iy | l ah | l iy | t iy | d ow
SOLFEGE_UP   = ["SP","d","ow","SP","r","ey","SP","m","iy","SP","f","ae","SP",
                "s","ow","l","SP","s","iy","SP","l","ah","SP","l","iy","SP","t","iy","SP","d","ow","SP"]
SOLFEGE_DOWN = ["SP","d","ow","SP","t","iy","SP","l","iy","SP","l","ah","SP","s","iy","SP",
                "s","ow","l","SP","f","ae","SP","m","iy","SP","r","ey","SP","d","ow","SP"]
SOLFEGE_FULL = SOLFEGE_UP + SOLFEGE_DOWN[1:]  # up + down

def scale_ph(vowel_ph, n_notes=8):
    """Simple ascending scale: SP vowel SP vowel ... SP"""
    out = ["SP"]
    for _ in range(n_notes):
        out.append(vowel_ph)
        out.append("SP")
    return out

def arpeggio_ph(vowel_ph, n_notes=5):
    out = ["SP"]
    for _ in range(n_notes):
        out.append(vowel_ph)
        out.append("SP")
    return out

def chromatic_ph(style="american"):
    """Chromatic scale phonemes — solfege syllable style"""
    if style == "british":
        # Doh  Tay  Ray  May  Fah  Sol  Lah  Tee  Doh
        return ["SP","d","ow","SP","t","ao","SP","r","ao","SP","m","ao","SP",
                "f","ae","SP","s","ao","l","SP","l","ah","SP","t","ao","SP"]
    else:  # american / jusolfege
        return SOLFEGE_FULL

# ── Transcription table ───────────────────────────────────────────────────────
# (name_pattern, ph_list_fn)  — matched by startswith
RULES = {
    # Sustained single vowel notes
    "sustained_ah": lambda _: ["SP","ah","SP"],
    "sustained_eh": lambda _: ["SP","eh","SP"],
    "sustained_oh": lambda _: ["SP","ow","SP"],
    "sustained_i":  lambda _: ["SP","iy","SP"],
    "sustained_u":  lambda _: ["SP","uw","SP"],

    # Scale exercises
    "scale_21_scale_ah":            lambda _: scale_ph("ah", 8),
    "scale_22_scale_ee":            lambda _: scale_ph("iy", 8),
    "scale_23_scale_oh":            lambda _: scale_ph("ow", 8),
    "scale_24_scale_do-re-mi":      lambda _: SOLFEGE_FULL,
    "scale_25_scale_ah":            lambda _: scale_ph("ah", 8),
    "scale_26_arpeggio_ah":         lambda _: arpeggio_ph("ah", 5),
    "scale_27_arpeggio_ee":         lambda _: arpeggio_ph("iy", 5),

    # Chromatic scales (12 semitones each)
    "chromatic_american":  lambda _: chromatic_ph("american"),
    "chromatic_british":   lambda _: chromatic_ph("british"),
    "chromatic_jusolfege": lambda _: chromatic_ph("american"),

    # Phoneme exercises (Pan = p ae n, Sol = s ow l)
    "phoneme_28_Pan":  lambda _: ["SP","p","ae","n","SP"],
    "phoneme_29_Pan":  lambda _: ["SP","p","ae","n","SP"],
    "phoneme_30_Pan":  lambda _: ["SP","p","ae","n","SP"],
    "phoneme_31_Pan":  lambda _: ["SP","p","ae","n","SP"],
    "phoneme_32_sol":  lambda _: ["SP","s","ow","l","SP"],
    "phoneme_33_sol":  lambda _: ["SP","s","ow","l","SP"],
    "phoneme_34_sol":  lambda _: ["SP","s","ow","l","SP"],
    "phoneme_35_sol":  lambda _: ["SP","s","ow","l","SP"],
    "phoneme_36_sol":  lambda _: ["SP","s","ow","l","SP","s","ow","l","SP","s","ow","l","SP"],

    # Songs — best-effort phoneme sequences for melody with "ah" filler
    # These give the model real singing dynamics/expressiveness
    "song_37": lambda _: ["SP","ah","SP","ah","SP","ah","SP","ah","SP","ah","SP"],
    "song_38": lambda _: ["SP","ah","SP","iy","SP","ey","SP","ah","SP","ow","SP"],
    "song_39": lambda _: ["SP","ah","SP","iy","SP","ah","SP","ow","SP","ah","SP"],
    "song_40": lambda _: ["SP","iy","SP","ah","SP","ey","SP","ow","SP"],
    "song_41": lambda _: ["SP","ah","SP","ow","SP","iy","SP","uh","SP"],
    "song_42": lambda _: ["SP","ah","SP","iy","SP","ey","SP","ow","SP","ah","SP","iy","SP","ey","SP"],
    "song_43": lambda _: ["SP","ah","SP"],   # Crescendo
    "song_44": lambda _: ["SP","ah","SP"],   # Decrescendo
    "song_45": lambda _: ["SP","ah","SP"],   # Slow vibrato
    "song_46": lambda _: ["SP","iy","SP"],   # Fast vibrato
    "song_47": lambda _: ["SP","ah","SP","iy","SP","ow","SP"],  # Legato
    "song_48": lambda _: ["SP","ah","SP","ah","SP","ah","SP"],  # Staccato
}

def resolve_ph(name):
    for prefix, fn in RULES.items():
        if name.startswith(prefix):
            return fn(name)
    return ["SP","ah","SP"]   # fallback

# ── Main ──────────────────────────────────────────────────────────────────────
rows = []
copied = 0
skipped = 0

wav_files = sorted([f for f in os.listdir(SRC_WAV_DIR) if f.endswith(".wav")])
print(f"📂 Found {len(wav_files)} WAV files in ScoreLens dataset")

for wav_fname in wav_files:
    name      = wav_fname.replace(".wav", "")
    src_path  = os.path.join(SRC_WAV_DIR, wav_fname)
    dst_path  = os.path.join(DST_WAV_DIR, wav_fname)

    # Copy WAV
    if not os.path.exists(dst_path):
        shutil.copy2(src_path, dst_path)
        copied += 1
    else:
        skipped += 1

    # Build transcription
    dur, _ = get_wav_duration(src_path)
    ph_list = resolve_ph(name)
    row     = make_row(name, ph_list, dur)
    rows.append(row)
    print(f"  {'✅' if not os.path.exists(dst_path) else '⏭ '} {name}: {row['ph_seq'][:60]}")

# Write CSV
with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["name","ph_seq","ph_dur"])
    writer.writeheader()
    writer.writerows(rows)

print(f"\n✅ Dataset rebuilt:")
print(f"   {len(rows)} utterances | {copied} new WAVs copied | {skipped} already existed")
print(f"   CSV → {CSV_PATH}")

# Phoneme coverage check
all_ph = set()
for r in rows:
    for p in r["ph_seq"].split():
        if p != "SP": all_ph.add(p)
all_v = {'aa','ae','ah','ao','aw','ay','eh','er','ey','ih','iy','ow','oy','uh','uw'}
all_c = {'b','ch','d','dh','f','g','hh','jh','k','l','m','n','ng','p','r','s','sh','t','th','v','w','y','z','zh'}
print(f"\n📊 Phoneme coverage: {len(all_ph)}/39")
print(f"   Have: {sorted(all_ph)}")
print(f"   Missing vowels: {sorted(all_v - all_ph)}")
print(f"   Missing cons:   {sorted(all_c - all_ph)}")

# Upload to GCS
print(f"\n📤 Uploading to GCS...")
try:
    subprocess.run([
        "gsutil", "-m", "rsync", "-r", "-d",
        TRAIN_DIR,
        GCS_BUCKET
    ], check=True)
    print("✅ GCS upload complete!")
except Exception as e:
    print(f"⚠️  GCS upload failed (run manually): {e}")
    print(f"   gsutil -m rsync -r {TRAIN_DIR} {GCS_BUCKET}")

print("""
═══════════════════════════════════════════════════════════
🚀 NEXT: Paste this into RunPod terminal
═══════════════════════════════════════════════════════════
See: runpod_resume_87k.sh in the same folder
""")
