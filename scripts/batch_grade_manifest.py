#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════
Memolody V2 — Batch Grade Manifest Songs
═══════════════════════════════════════════════════════════════

This script downloads the manifest.json from GCS, then for each song:
1. Downloads the MXL file
2. Extracts the MusicXML
3. Parses musical features (pitch range, rhythm complexity, etc.)
4. Assigns a difficulty grade (Grade 1-8, Diploma)
5. Writes a new manifest with grading data

Usage:
    python3 batch_grade_manifest.py [--limit N] [--output OUTPUT_DIR]

Note: This is a LONG-RUNNING batch job (254K songs × MXL download).
      Use --limit for testing. Full run should be on a server.
"""

import json
import os
import sys
import zipfile
import io
import urllib.request
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import time
import math

# ═══════════════════════════════════════════════════════════════
# Grading Algorithm (Python port of SongGradingEngine.ts)
# ═══════════════════════════════════════════════════════════════

STEP_TO_SEMITONE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

WEIGHTS = {
    'pitch_range': 0.15,
    'rhythmic_complexity': 0.20,
    'note_density': 0.15,
    'interval_complexity': 0.15,
    'accidental_frequency': 0.10,
    'key_complexity': 0.10,
    'polyphonic_complexity': 0.10,
    'tempo': 0.05,
}

GRADE_THRESHOLDS = [
    (12, 'Grade 1'), (22, 'Grade 2'), (32, 'Grade 3'), (42, 'Grade 4'),
    (54, 'Grade 5'), (66, 'Grade 6'), (78, 'Grade 7'), (89, 'Grade 8'),
    (100, 'Diploma'),
]

@dataclass
class ParsedNote:
    step: str
    octave: int
    alter: int
    duration: float
    start_time: float
    staff: int = 1
    voice: int = 1
    measure: str = '1'

@dataclass
class GradingResult:
    grade: str
    numeric_score: float
    confidence: float
    breakdown: Dict[str, float]

def note_to_midi(note: ParsedNote) -> int:
    """Convert a ParsedNote to MIDI number."""
    return note.octave * 12 + STEP_TO_SEMITONE.get(note.step, 0) + note.alter

def score_pitch_range(notes: List[ParsedNote]) -> float:
    """ช่วงเสียง — ยิ่งกว้างยิ่งยาก"""
    if len(notes) < 2:
        return 0
    midis = [note_to_midi(n) for n in notes]
    range_st = max(midis) - min(midis)
    if range_st <= 8: return 10
    if range_st <= 12: return 20
    if range_st <= 16: return 35
    if range_st <= 20: return 50
    if range_st <= 24: return 65
    if range_st <= 30: return 75
    if range_st <= 36: return 85
    return 100

def score_rhythmic_complexity(notes: List[ParsedNote]) -> float:
    """ความซับซ้อนจังหวะ — ยิ่งหลากหลายยิ่งยาก"""
    if not notes:
        return 0
    durations = set(n.duration for n in notes)
    unique_count = len(durations)
    shortest = min(durations) if durations else 1.0
    
    if unique_count <= 2: score = 10
    elif unique_count == 3: score = 25
    elif unique_count == 4: score = 40
    elif unique_count == 5: score = 55
    elif unique_count == 6: score = 70
    else: score = 85
    
    if shortest < 0.25:
        score = min(100, score + 15)
    return score

def score_note_density(notes: List[ParsedNote]) -> float:
    """ความหนาแน่นของโน้ต — notes per measure"""
    if not notes:
        return 0
    measures = set(n.measure for n in notes)
    measure_count = max(len(measures), 1)
    density = len(notes) / measure_count
    
    if density < 2: return 10
    if density < 4: return 25
    if density < 6: return 40
    if density < 8: return 55
    if density < 12: return 70
    if density < 16: return 85
    return 100

def score_interval_complexity(notes: List[ParsedNote]) -> float:
    """ความซับซ้อน intervals — สัดส่วนของ interval >= perfect 5th (7 semitones)"""
    if len(notes) < 2:
        return 0
    sorted_notes = sorted(notes, key=lambda n: n.start_time)
    large_intervals = 0
    total_intervals = 0
    for i in range(1, len(sorted_notes)):
        interval = abs(note_to_midi(sorted_notes[i]) - note_to_midi(sorted_notes[i-1]))
        total_intervals += 1
        if interval >= 7:
            large_intervals += 1
    
    if total_intervals == 0:
        return 0
    pct = (large_intervals / total_intervals) * 100
    
    if pct < 5: return 10
    if pct < 10: return 25
    if pct < 20: return 45
    if pct < 30: return 60
    if pct < 40: return 75
    return 90

def score_accidental_frequency(notes: List[ParsedNote]) -> float:
    """ความถี่ของ accidentals — sharps/flats"""
    if not notes:
        return 0
    accidentals = sum(1 for n in notes if n.alter != 0)
    pct = (accidentals / len(notes)) * 100
    
    if pct < 2: return 10
    if pct < 5: return 25
    if pct < 10: return 45
    if pct < 20: return 65
    if pct < 30: return 80
    return 95

def score_key_complexity(fifths: int) -> float:
    """ความซับซ้อนคีย์ — จำนวน sharps/flats"""
    af = abs(fifths)
    if af == 0: return 5
    if af == 1: return 15
    if af == 2: return 30
    if af == 3: return 45
    if af == 4: return 60
    if af == 5: return 75
    return 90

def score_polyphonic_complexity(notes: List[ParsedNote]) -> float:
    """ความซับซ้อนแนวเสียง — จำนวน voices/staves"""
    if not notes:
        return 0
    voices = set((n.staff, n.voice) for n in notes)
    count = len(voices)
    
    if count <= 1: return 5
    if count == 2: return 30
    if count == 3: return 55
    if count == 4: return 75
    return 95

def score_tempo(bpm: int) -> float:
    """ความเร็ว — ยิ่งเร็วยิ่งยาก"""
    if bpm < 60: return 15
    if bpm < 80: return 25
    if bpm < 100: return 35
    if bpm < 120: return 50
    if bpm < 140: return 65
    if bpm < 160: return 80
    return 95

def grade_song(notes: List[ParsedNote], bpm: int = 120, fifths: int = 0) -> GradingResult:
    """
    วิเคราะห์ความยากของเพลงจาก parsed notes
    Returns GradingResult with grade, score, confidence, breakdown
    """
    breakdown = {
        'pitch_range': score_pitch_range(notes),
        'rhythmic_complexity': score_rhythmic_complexity(notes),
        'note_density': score_note_density(notes),
        'interval_complexity': score_interval_complexity(notes),
        'accidental_frequency': score_accidental_frequency(notes),
        'key_complexity': score_key_complexity(fifths),
        'polyphonic_complexity': score_polyphonic_complexity(notes),
        'tempo': score_tempo(bpm),
    }
    
    final_score = sum(breakdown[k] * WEIGHTS[k] for k in WEIGHTS)
    final_score = max(0, min(100, final_score))
    
    # Confidence
    confidence = 0.9
    if len(notes) < 20: confidence -= 0.1
    measures = set(n.measure for n in notes)
    if len(measures) < 2: confidence -= 0.1
    if bpm == 120: confidence -= 0.05  # default BPM = less confident
    confidence = max(0.1, confidence)
    
    # Map to grade
    grade = 'Diploma'
    for threshold, label in GRADE_THRESHOLDS:
        if final_score <= threshold:
            grade = label
            break
    
    return GradingResult(
        grade=grade,
        numeric_score=round(final_score, 1),
        confidence=round(confidence, 2),
        breakdown={k: round(v, 1) for k, v in breakdown.items()}
    )


# ═══════════════════════════════════════════════════════════════
# MusicXML Parser (minimal, for batch processing)
# ═══════════════════════════════════════════════════════════════

def parse_musicxml(xml_content: str) -> Tuple[List[ParsedNote], int, int]:
    """
    Parse MusicXML content and extract notes, BPM, and fifths.
    Returns (notes, bpm, fifths)
    """
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError:
        return [], 120, 0
    
    # Namespace handling
    ns = ''
    if root.tag.startswith('{'):
        ns = root.tag.split('}')[0] + '}'
    
    # BPM
    bpm = 120
    for sound in root.iter(f'{ns}sound'):
        tempo = sound.get('tempo')
        if tempo:
            try: bpm = int(float(tempo))
            except: pass
            break
    
    # Key (fifths)
    fifths = 0
    fifths_elem = root.find(f'.//{ns}fifths')
    if fifths_elem is not None and fifths_elem.text:
        try: fifths = int(fifths_elem.text)
        except: pass
    
    # Divisions
    divisions = 1
    div_elem = root.find(f'.//{ns}divisions')
    if div_elem is not None and div_elem.text:
        try: divisions = int(div_elem.text)
        except: pass
    
    notes = []
    current_time = 0.0
    measure_num = 0
    
    for part in root.iter(f'{ns}part'):
        current_time = 0.0
        measure_num = 0
        
        for measure in part.iter(f'{ns}measure'):
            measure_num += 1
            measure_time = current_time
            
            for elem in measure:
                tag = elem.tag.replace(ns, '')
                
                if tag == 'forward':
                    dur_elem = elem.find(f'{ns}duration')
                    if dur_elem is not None and dur_elem.text:
                        current_time += float(dur_elem.text) / divisions
                
                elif tag == 'backup':
                    dur_elem = elem.find(f'{ns}duration')
                    if dur_elem is not None and dur_elem.text:
                        current_time -= float(dur_elem.text) / divisions
                
                elif tag == 'note':
                    # Skip rests
                    if elem.find(f'{ns}rest') is not None:
                        dur_elem = elem.find(f'{ns}duration')
                        if dur_elem is not None and dur_elem.text:
                            if elem.find(f'{ns}chord') is None:
                                current_time += float(dur_elem.text) / divisions
                        continue
                    
                    pitch_elem = elem.find(f'{ns}pitch')
                    if pitch_elem is None:
                        dur_elem = elem.find(f'{ns}duration')
                        if dur_elem is not None and dur_elem.text:
                            if elem.find(f'{ns}chord') is None:
                                current_time += float(dur_elem.text) / divisions
                        continue
                    
                    step = pitch_elem.findtext(f'{ns}step', 'C')
                    octave = int(pitch_elem.findtext(f'{ns}octave', '4'))
                    alter_text = pitch_elem.findtext(f'{ns}alter', '0')
                    alter = int(float(alter_text)) if alter_text else 0
                    
                    dur_elem = elem.find(f'{ns}duration')
                    duration = float(dur_elem.text) / divisions if dur_elem is not None and dur_elem.text else 1.0
                    
                    staff = int(elem.findtext(f'{ns}staff', '1'))
                    voice = int(elem.findtext(f'{ns}voice', '1'))
                    
                    is_chord = elem.find(f'{ns}chord') is not None
                    
                    notes.append(ParsedNote(
                        step=step,
                        octave=octave,
                        alter=alter,
                        duration=duration,
                        start_time=current_time,
                        staff=staff,
                        voice=voice,
                        measure=str(measure_num)
                    ))
                    
                    if not is_chord:
                        current_time += duration
    
    return notes, bpm, fifths


def extract_xml_from_mxl(mxl_data: bytes) -> Optional[str]:
    """Extract MusicXML content from an MXL (zip) file."""
    try:
        with zipfile.ZipFile(io.BytesIO(mxl_data)) as zf:
            for name in zf.namelist():
                if name.endswith('.xml') and not name.startswith('META-INF'):
                    return zf.read(name).decode('utf-8', errors='replace')
    except (zipfile.BadZipFile, Exception):
        pass
    return None


# ═══════════════════════════════════════════════════════════════
# Main Batch Processing
# ═══════════════════════════════════════════════════════════════

def download_manifest(url: str) -> dict:
    """Download and parse manifest.json."""
    print(f"📥 Downloading manifest from {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Memolody-BatchGrader/1.0'})
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = resp.read()
        print(f"   Downloaded {len(data):,} bytes")
        return json.loads(data)


def download_mxl(url: str, timeout: int = 10) -> Optional[bytes]:
    """Download an MXL file."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Memolody-BatchGrader/1.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception:
        return None


def batch_grade(manifest_url: str, limit: int = 0, output_dir: str = './manifest_output'):
    """
    Main batch grading pipeline.
    Downloads manifest, grades each song, writes updated manifest.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    manifest = download_manifest(manifest_url)
    songs = manifest.get('data', {}).get('songs', [])
    
    if not songs:
        print("❌ No songs found in manifest")
        return
    
    total = len(songs)
    if limit > 0:
        songs = songs[:limit]
        print(f"⚠️  Limited to {limit} songs (out of {total})")
    
    print(f"🎵 Processing {len(songs)} songs...")
    
    graded = 0
    failed = 0
    grade_dist: Dict[str, int] = {}
    start_time = time.time()
    
    for i, song in enumerate(songs):
        xml_url = song.get('xmlData', '')
        song_id = song.get('id', 'unknown')
        
        if not xml_url or not xml_url.startswith('http'):
            song['difficultyGrade'] = 'Unknown'
            failed += 1
            continue
        
        try:
            # Download MXL
            mxl_data = download_mxl(xml_url)
            if not mxl_data:
                song['difficultyGrade'] = 'Unknown'
                failed += 1
                continue
            
            # Extract XML from MXL
            xml_content = extract_xml_from_mxl(mxl_data)
            if not xml_content:
                song['difficultyGrade'] = 'Unknown'
                failed += 1
                continue
            
            # Parse and grade
            notes, bpm, fifths = parse_musicxml(xml_content)
            if not notes:
                song['difficultyGrade'] = 'Unknown'
                failed += 1
                continue
            
            result = grade_song(notes, bpm, fifths)
            song['difficulty'] = result.grade
            song['difficultyGrade'] = result.grade
            
            grade_dist[result.grade] = grade_dist.get(result.grade, 0) + 1
            graded += 1
            
        except Exception as e:
            song['difficultyGrade'] = 'Unknown'
            failed += 1
        
        # Progress
        if (i + 1) % 100 == 0 or (i + 1) == len(songs):
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (len(songs) - i - 1) / rate if rate > 0 else 0
            print(f"   [{i+1}/{len(songs)}] Graded: {graded} | Failed: {failed} | "
                  f"Rate: {rate:.1f}/s | ETA: {eta/60:.1f}m")
    
    # Write graded manifest
    manifest['data']['songs'] = songs
    output_path = os.path.join(output_dir, 'manifest_graded.json')
    with open(output_path, 'w') as f:
        json.dump(manifest, f)
    
    file_size = os.path.getsize(output_path)
    elapsed = time.time() - start_time
    
    print(f"\n{'='*60}")
    print(f"✅ Batch Grading Complete!")
    print(f"   Total: {len(songs)} | Graded: {graded} | Failed: {failed}")
    print(f"   Time: {elapsed:.1f}s ({elapsed/60:.1f}m)")
    print(f"   Output: {output_path} ({file_size/1024/1024:.1f} MB)")
    print(f"\n📊 Grade Distribution:")
    for grade, count in sorted(grade_dist.items()):
        bar = '█' * (count * 40 // max(grade_dist.values()) if grade_dist else 1)
        print(f"   {grade:10s}: {count:6d} {bar}")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Batch grade Memolody songs')
    parser.add_argument('--limit', type=int, default=0, help='Limit number of songs to process (0 = all)')
    parser.add_argument('--output', type=str, default='./manifest_output', help='Output directory')
    parser.add_argument('--url', type=str, 
                       default='https://storage.googleapis.com/memolody-vault/manifest.json',
                       help='Manifest URL')
    args = parser.parse_args()
    
    batch_grade(args.url, args.limit, args.output)
