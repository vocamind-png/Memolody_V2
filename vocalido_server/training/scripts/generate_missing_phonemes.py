#!/usr/bin/env python3
"""
generate_missing_phonemes.py
────────────────────────────
Generates WAV + transcriptions.csv entries for all 22 missing English
phonemes (7 vowels + 15 consonants) using edge-tts, then merges them
into the existing Vocalido dataset so RunPod can re-binarize and train.

Usage:
    cd /Users/paisan/vocamind-projects/Memolody_V2/vocalido_server
    source .venv/bin/activate
    python training/scripts/generate_missing_phonemes.py
"""

import asyncio, csv, os, sys, subprocess, tempfile, shutil
import numpy as np

DATA_DIR   = os.path.join(os.path.dirname(__file__), "../../training/DiffSinger/data/vocalido")
DATA_DIR   = os.path.abspath(DATA_DIR)
WAV_DIR    = os.path.join(DATA_DIR, "wavs")
CSV_PATH   = os.path.join(DATA_DIR, "transcriptions.csv")
TARGET_SR  = 44100

# ── Phoneme exercises: each entry covers one or more missing phonemes ─────────
# Format: (name, text_for_tts, ph_seq_list, note_midi_list)
# Each phoneme in ph_seq gets equal share of the WAV duration
# note_midi: pitch per phoneme group (for singing-style TTS)
PHONEME_EXERCISES = [
    # ── Missing VOWELS ────────────────────────────────────────────────────────
    ("vowel_aa_01", "fa fa fa spa",        ["SP","f","aa","SP","f","aa","SP","s","p","aa","SP"],  62),
    ("vowel_aa_02", "hot pot not",          ["SP","hh","aa","t","SP","p","aa","t","SP","n","aa","t","SP"], 64),
    ("vowel_aw_01", "how now wow",          ["SP","hh","aw","SP","n","aw","SP","w","aw","SP"],    60),
    ("vowel_aw_02", "out loud proud",       ["SP","aw","t","SP","l","aw","d","SP","p","r","aw","d","SP"], 62),
    ("vowel_ay_01", "my sky fly",          ["SP","m","ay","SP","s","k","ay","SP","f","l","ay","SP"], 65),
    ("vowel_ay_02", "time shine bright",   ["SP","t","ay","m","SP","sh","ay","n","SP","b","r","ay","t","SP"], 67),
    ("vowel_er_01", "bird her turn",       ["SP","b","er","d","SP","hh","er","SP","t","er","n","SP"], 60),
    ("vowel_er_02", "learn word early",    ["SP","l","er","n","SP","w","er","d","SP","er","l","iy","SP"], 62),
    ("vowel_ih_01", "bit sit hit",         ["SP","b","ih","t","SP","s","ih","t","SP","hh","ih","t","SP"], 64),
    ("vowel_ih_02", "in it is",            ["SP","ih","n","SP","ih","t","SP","ih","z","SP"],      62),
    ("vowel_oy_01", "boy joy toy",         ["SP","b","oy","SP","jh","oy","SP","t","oy","SP"],    65),
    ("vowel_oy_02", "coin voice choice",   ["SP","k","oy","n","SP","v","oy","s","SP","ch","oy","s","SP"], 63),
    ("vowel_uh_01", "book look good",      ["SP","b","uh","k","SP","l","uh","k","SP","g","uh","d","SP"], 60),
    ("vowel_uh_02", "would could should",  ["SP","w","uh","d","SP","k","uh","d","SP","sh","uh","d","SP"], 62),

    # ── Missing CONSONANTS ────────────────────────────────────────────────────
    ("cons_b_01",  "be bold blue",         ["SP","b","iy","SP","b","ow","l","d","SP","b","l","uw","SP"], 60),
    ("cons_b_02",  "baby bird born",       ["SP","b","ey","b","iy","SP","b","er","d","SP","b","ao","r","n","SP"], 62),
    ("cons_ch_01", "chair child each",     ["SP","ch","eh","r","SP","ch","ay","l","d","SP","iy","ch","SP"], 64),
    ("cons_ch_02", "choose chance beach",  ["SP","ch","uw","z","SP","ch","ae","n","s","SP","b","iy","ch","SP"], 65),
    ("cons_dh_01", "the this then",        ["SP","dh","ah","SP","dh","ih","s","SP","dh","eh","n","SP"], 60),
    ("cons_dh_02", "that those though",    ["SP","dh","ae","t","SP","dh","ow","z","SP","dh","ow","SP"], 62),
    ("cons_g_01",  "go girl give",         ["SP","g","ow","SP","g","er","l","SP","g","ih","v","SP"], 60),
    ("cons_g_02",  "gold green great",     ["SP","g","ow","l","d","SP","g","r","iy","n","SP","g","r","ey","t","SP"], 64),
    ("cons_hh_01", "he her how",           ["SP","hh","iy","SP","hh","er","SP","hh","aw","SP"],   62),
    ("cons_hh_02", "happy heart hello",    ["SP","hh","ae","p","iy","SP","hh","aa","r","t","SP","hh","ah","l","ow","SP"], 60),
    ("cons_jh_01", "joy jump just",        ["SP","jh","oy","SP","jh","ah","m","p","SP","jh","ah","s","t","SP"], 64),
    ("cons_jh_02", "judge gently age",     ["SP","jh","ah","jh","SP","jh","eh","n","t","l","iy","SP","ey","jh","SP"], 62),
    ("cons_k_01",  "key cool kind",        ["SP","k","iy","SP","k","uw","l","SP","k","ay","n","d","SP"], 65),
    ("cons_k_02",  "keep calm sky",        ["SP","k","iy","p","SP","k","aa","m","SP","s","k","ay","SP"], 63),
    ("cons_ng_01", "sing song ring",       ["SP","s","ih","ng","SP","s","ao","ng","SP","r","ih","ng","SP"], 60),
    ("cons_ng_02", "long strong young",    ["SP","l","ao","ng","SP","s","t","r","ao","ng","SP","y","ah","ng","SP"], 62),
    ("cons_sh_01", "she show shine",       ["SP","sh","iy","SP","sh","ow","SP","sh","ay","n","SP"], 64),
    ("cons_sh_02", "wish fish fresh",      ["SP","w","ih","sh","SP","f","ih","sh","SP","f","r","eh","sh","SP"], 65),
    ("cons_th_01", "think three throw",    ["SP","th","ih","ng","k","SP","th","r","iy","SP","th","r","ow","SP"], 60),
    ("cons_th_02", "bath path truth",      ["SP","b","ae","th","SP","p","ae","th","SP","t","r","uw","th","SP"], 62),
    ("cons_v_01",  "very voice love",      ["SP","v","eh","r","iy","SP","v","oy","s","SP","l","ah","v","SP"], 64),
    ("cons_v_02",  "have live move",       ["SP","hh","ae","v","SP","l","ih","v","SP","m","uw","v","SP"], 62),
    ("cons_w_01",  "we way word",          ["SP","w","iy","SP","w","ey","SP","w","er","d","SP"],   65),
    ("cons_w_02",  "want will world",      ["SP","w","aa","n","t","SP","w","ih","l","SP","w","er","l","d","SP"], 63),
    ("cons_y_01",  "you yes year",         ["SP","y","uw","SP","y","eh","s","SP","y","ih","r","SP"], 60),
    ("cons_y_02",  "young yellow beyond",  ["SP","y","ah","ng","SP","y","eh","l","ow","SP","b","iy","aa","n","d","SP"], 62),
    ("cons_z_01",  "zero zoo zone",        ["SP","z","ih","r","ow","SP","z","uw","SP","z","ow","n","SP"], 64),
    ("cons_z_02",  "rose nose these",      ["SP","r","ow","z","SP","n","ow","z","SP","dh","iy","z","SP"], 65),
    ("cons_zh_01", "measure vision beige", ["SP","m","eh","zh","er","SP","v","ih","zh","ah","n","SP","b","ey","zh","SP"], 60),
    ("cons_zh_02", "pleasure usual",       ["SP","p","l","eh","zh","er","SP","y","uw","zh","uw","ah","l","SP"], 62),
]

async def tts_generate(text: str, out_wav: str):
    """Generate WAV via edge-tts (en-US-JennyNeural singing-friendly voice)."""
    import edge_tts
    tts = edge_tts.Communicate(text, voice="en-US-JennyNeural", rate="-30%", pitch="+0Hz")
    mp3_path = out_wav.replace(".wav", ".mp3")
    await tts.save(mp3_path)
    # Convert MP3 → WAV 44100 Hz mono via ffmpeg or librosa
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", mp3_path, "-ar", str(TARGET_SR), "-ac", "1", out_wav],
            check=True, capture_output=True
        )
    except Exception:
        import librosa, soundfile as sf
        audio, sr = librosa.load(mp3_path, sr=TARGET_SR, mono=True)
        sf.write(out_wav, audio, TARGET_SR)
    finally:
        if os.path.exists(mp3_path):
            os.remove(mp3_path)

def make_transcription(name: str, ph_seq: list, wav_path: str) -> dict:
    """Build a transcription row with per-phoneme durations from WAV length."""
    import librosa
    duration, _ = librosa.load(wav_path, sr=TARGET_SR, mono=True)
    total_sec = len(duration) / TARGET_SR

    # Assign durations: SP gets 0.03s, voiced phonemes share the rest equally
    sp_count  = ph_seq.count("SP")
    ph_count  = len(ph_seq) - sp_count
    sp_dur    = 0.03
    ph_dur_each = max(0.08, (total_sec - sp_count * sp_dur) / max(1, ph_count))

    ph_dur_list = [sp_dur if p == "SP" else round(ph_dur_each, 4) for p in ph_seq]
    return {
        "name":   name,
        "ph_seq": " ".join(ph_seq),
        "ph_dur": " ".join(str(d) for d in ph_dur_list),
    }

async def main():
    print(f"📂 Dataset dir: {DATA_DIR}")
    os.makedirs(WAV_DIR, exist_ok=True)

    # Read existing CSV
    existing = {}
    if os.path.exists(CSV_PATH):
        with open(CSV_PATH, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                existing[row["name"]] = row

    new_rows = []
    skipped  = []

    for (name, text, ph_seq, _midi) in PHONEME_EXERCISES:
        wav_path = os.path.join(WAV_DIR, f"{name}.wav")

        if name in existing:
            print(f"  ⏭  {name} already in CSV — skipping")
            skipped.append(name)
            continue

        print(f"  🎤 Generating: {name}  ({text})")
        try:
            await tts_generate(text, wav_path)
            row = make_transcription(name, ph_seq, wav_path)
            new_rows.append(row)
            print(f"     ✅  {row['ph_seq'][:60]}...")
        except Exception as e:
            print(f"     ❌  Failed: {e}")

    # Merge & write CSV
    all_rows = list(existing.values()) + new_rows
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name","ph_seq","ph_dur"])
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\n✅ Done!")
    print(f"   Added {len(new_rows)} new entries")
    print(f"   Skipped {len(skipped)} existing")
    print(f"   Total dataset: {len(all_rows)} utterances")
    print(f"   CSV: {CSV_PATH}")
    print(f"\n📤 Next: upload to GCS and run RunPod resume script")
    print(f"   gsutil -m rsync -r {DATA_DIR} gs://vocalido-master-corpus-v1/diffsinger/data/vocalido")

if __name__ == "__main__":
    asyncio.run(main())
