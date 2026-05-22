#!/usr/bin/env python3
"""
fix_and_rebuild_dataset.py
===========================
Re-builds the DiffSinger training dataset from the corrected .lab files.

Steps:
  1. Read WAV files + corrected .lab labels
  2. Map word labels → ARPAbet phonemes (using g2p_en + SOLFEGE_MAP)
  3. Run MFA-lite forced alignment using librosa (since MFA needs conda)
     OR use simple uniform duration allocation (fast, good enough for fine-tuning)
  4. Write TextGrid files
  5. Write transcriptions.csv compatible with DiffSinger binarizer
"""
import os, sys, re, csv, json
import numpy as np

WAVS_DIR = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/training/DiffSinger/data/vocalido/wavs"
TEXTGRID_DIR = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/training/DiffSinger/data/vocalido/textgrids"
CSV_PATH = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/training/DiffSinger/data/vocalido/transcriptions.csv"
DICT_PATH = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/training/DiffSinger/dictionaries/english.txt"
SR = 44100

os.makedirs(TEXTGRID_DIR, exist_ok=True)

# ── Phoneme Dictionary ─────────────────────────────────────────────────────────
# ARPAbet phonemes supported by english.txt
VALID_PHONEMES = {
    "a", "aa", "ae", "ah", "ao", "aw", "ay",
    "b", "ch", "d", "dh", "eh", "er", "ey",
    "f", "g", "hh", "ih", "iy", "jh", "k",
    "l", "m", "n", "ng", "ow", "oy", "p",
    "r", "s", "sh", "t", "th", "uh", "uw",
    "v", "w", "y", "z", "zh", "SP", "AP"
}

# ── Solfège Word Map → Phoneme strings ─────────────────────────────────────────
SOLFEGE_MAP = {
    # Standard Solfège
    "do":  "d ow", "doh": "d ow",
    "re":  "r ey", "ray": "r ey",
    "mi":  "m iy", "mee": "m iy", "me": "m iy",
    "fa":  "f ae", "fah": "f ae",
    "sol": "s ow l", "soh": "s ow",
    "la":  "l ah", "lah": "l ah",
    "ti":  "t iy", "tee": "t iy", "si": "s iy",
    # British Flats (Curwen)
    "taw": "t ao", "law": "l ao", "saw": "s ao",
    "maw": "m ao", "raw": "r ao",
    # Chromatic (American) sharps  
    "di":  "d iy", "dee": "d iy",
    "ri":  "r iy", "ree": "r iy",
    "fi":  "f iy", "fee": "f iy",
    "si":  "s iy", "see": "s iy",
    "li":  "l iy", "lee": "l iy",
    # Plain vowels
    "ah":  "ah",
    "oh":  "ow",
    "ee":  "iy",
    "iy":  "iy",
    "ow":  "ow",
    "eh":  "eh",
    "uw":  "uw",
    # Common words
    "pan": "p ae n",
    "sol": "s ow l",
}

def word_to_phonemes(word):
    """Convert a word to list of ARPAbet phonemes."""
    w = word.lower().strip()
    
    # Direct Solfège/vowel map
    if w in SOLFEGE_MAP:
        phones = SOLFEGE_MAP[w].split()
        return [p for p in phones if p in VALID_PHONEMES]
    
    # Try g2p_en
    try:
        from g2p_en import G2p
        g2p = G2p()
        tokens = g2p(w)
        phones = []
        for t in tokens:
            if t == ' ':
                continue
            base = re.sub(r'[012]$', '', t).lower()
            if base in VALID_PHONEMES:
                phones.append(base)
        if phones:
            return phones
    except Exception as e:
        print(f"  ⚠️  G2P error for '{w}': {e}")
    
    return ["ah"]  # fallback

def get_wav_duration(wav_path):
    """Get WAV duration in seconds."""
    import wave
    try:
        with wave.open(wav_path, 'rb') as wf:
            return wf.getnframes() / wf.getframerate()
    except:
        return 2.0

def build_textgrid(wav_name, words, phonemes_per_word, duration):
    """Create a Praat TextGrid file with word and phone tiers."""
    # Simple uniform duration allocation
    # Leading SP: 0.03s
    # Trailing SP: 0.03s  
    # Each phoneme gets equal share of remaining duration
    
    sp_dur = 0.03
    total_ph = sum(len(ph) for ph in phonemes_per_word)
    available = duration - (2 * sp_dur)
    ph_dur = max(0.05, available / total_ph) if total_ph > 0 else 0.1
    
    # Build intervals
    word_intervals = []
    phone_intervals = []
    
    t = 0.0
    # Leading SP
    word_intervals.append((0.0, sp_dur, ""))
    phone_intervals.append((0.0, sp_dur, "SP"))
    t = sp_dur
    
    for w_idx, (word, phones) in enumerate(zip(words, phonemes_per_word)):
        w_start = t
        for ph in phones:
            ph_end = min(t + ph_dur, duration - sp_dur)
            phone_intervals.append((t, ph_end, ph))
            t = ph_end
        word_intervals.append((w_start, t, word))
        
        # Small gap between words
        if w_idx < len(words) - 1 and t + 0.01 < duration - sp_dur:
            gap_end = min(t + 0.01, duration - sp_dur)
            word_intervals.append((t, gap_end, ""))
            phone_intervals.append((t, gap_end, "SP"))
            t = gap_end
    
    # Trailing SP
    if t < duration:
        word_intervals.append((t, duration, ""))
        phone_intervals.append((t, duration, "SP"))
    
    # Write TextGrid
    lines = [
        'File type = "ooTextFile"',
        'Object class = "TextGrid"',
        '',
        f'xmin = 0 ',
        f'xmax = {duration:.6f} ',
        'tiers? <exists> ',
        'size = 2 ',
        'item []: ',
        '    item [1]:',
        '        class = "IntervalTier" ',
        '        name = "words" ',
        '        xmin = 0 ',
        f'        xmax = {duration:.6f} ',
        f'        intervals: size = {len(word_intervals)} ',
    ]
    for i, (xmin, xmax, text) in enumerate(word_intervals, 1):
        lines += [
            f'        intervals [{i}]:',
            f'            xmin = {xmin:.6f} ',
            f'            xmax = {xmax:.6f} ',
            f'            text = "{text}" ',
        ]
    lines += [
        '    item [2]:',
        '        class = "IntervalTier" ',
        '        name = "phones" ',
        '        xmin = 0 ',
        f'        xmax = {duration:.6f} ',
        f'        intervals: size = {len(phone_intervals)} ',
    ]
    for i, (xmin, xmax, text) in enumerate(phone_intervals, 1):
        lines += [
            f'        intervals [{i}]:',
            f'            xmin = {xmin:.6f} ',
            f'            xmax = {xmax:.6f} ',
            f'            text = "{text}" ',
        ]
    
    return '\n'.join(lines)

def build_transcription_row(wav_name, words, phonemes_per_word, duration):
    """Build a row for transcriptions.csv."""
    sp_dur = 0.03
    total_ph = sum(len(ph) for ph in phonemes_per_word)
    available = duration - (2 * sp_dur)
    ph_dur = max(0.05, available / total_ph) if total_ph > 0 else 0.1
    
    ph_seq_list = ["SP"]
    ph_dur_list = [sp_dur]
    
    for w_idx, phones in enumerate(phonemes_per_word):
        for ph in phones:
            ph_seq_list.append(ph)
            ph_dur_list.append(ph_dur)
        if w_idx < len(phonemes_per_word) - 1:
            ph_seq_list.append("SP")
            ph_dur_list.append(0.01)
    
    ph_seq_list.append("SP")
    ph_dur_list.append(sp_dur)
    
    # Normalize to match total duration
    total = sum(ph_dur_list)
    scale = duration / total
    ph_dur_list = [round(d * scale, 4) for d in ph_dur_list]
    
    ph_seq = " ".join(ph_seq_list)
    ph_dur = " ".join(str(d) for d in ph_dur_list)
    
    return wav_name, ph_seq, ph_dur

# ── Main ────────────────────────────────────────────────────────────────────────
print("🔍 Scanning WAV + .lab files...")

wav_files = sorted([f for f in os.listdir(WAVS_DIR) if f.endswith('.wav')])
rows = []
errors = []

for wav_file in wav_files:
    wav_name = wav_file.replace('.wav', '')
    wav_path = os.path.join(WAVS_DIR, wav_file)
    lab_path = os.path.join(WAVS_DIR, wav_name + '.lab')
    
    if not os.path.exists(lab_path):
        print(f"  ⚠️  No .lab for {wav_file}, skipping")
        continue
    
    with open(lab_path) as f:
        label_text = f.read().strip()
    
    words = label_text.split()
    if not words:
        words = ["ah"]
    
    # Convert words → phonemes
    phonemes_per_word = [word_to_phonemes(w) for w in words]
    
    # Get duration
    duration = get_wav_duration(wav_path)
    if duration < 0.3:
        duration = 2.0
    
    # Build TextGrid
    tg_content = build_textgrid(wav_name, words, phonemes_per_word, duration)
    tg_path = os.path.join(TEXTGRID_DIR, wav_name + '.TextGrid')
    with open(tg_path, 'w') as f:
        f.write(tg_content)
    
    # Build transcription row
    row_name, ph_seq, ph_dur = build_transcription_row(wav_name, words, phonemes_per_word, duration)
    rows.append((row_name, ph_seq, ph_dur))
    
    all_phones = [p for phs in phonemes_per_word for p in phs]
    print(f"  ✅ {wav_name}: [{label_text}] → {all_phones}")

# Write transcriptions.csv
print(f"\n📝 Writing transcriptions.csv ({len(rows)} rows)...")
with open(CSV_PATH, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['name', 'ph_seq', 'ph_dur'])
    for row in rows:
        writer.writerow(row)

print(f"\n✅ Done! {len(rows)} samples ready.")
print(f"   TextGrids: {TEXTGRID_DIR}")
print(f"   CSV: {CSV_PATH}")
print(f"\n🚀 Next: Upload to RunPod and run binarizer + training!")
