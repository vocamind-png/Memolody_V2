/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  SongGradingEngine — ABRSM-Inspired Song Difficulty Classifier     ║
 * ║  เครื่องมือจัดระดับความยากของเพลง (Grade 1–8 + Diploma)              ║
 * ║                                                                    ║
 * ║  Analyzes 8 musical features with weighted scoring:                ║
 * ║  วิเคราะห์ 8 มิติทางดนตรี โดยใช้น้ำหนักถ่วง:                        ║
 * ║  1. Pitch Range (15%)      — ช่วงเสียงทั้งหมด                       ║
 * ║  2. Rhythmic Complexity (20%) — ความซับซ้อนของจังหวะ                 ║
 * ║  3. Note Density (15%)     — ความหนาแน่นของโน้ตต่อห้อง               ║
 * ║  4. Interval Complexity (15%) — ความยากของช่วงเสียงระหว่างโน้ต       ║
 * ║  5. Accidental Frequency (10%) — ความถี่ของ ♯/♭                     ║
 * ║  6. Key Complexity (10%)   — ความยากของบันไดเสียง                    ║
 * ║  7. Polyphonic Complexity (10%) — จำนวนแนวเสียงซ้อนกัน              ║
 * ║  8. Tempo (5%)             — ความเร็วจังหวะ BPM                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { ParsedNote } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Output Interface — ผลลัพธ์การจัดเกรด
// ─────────────────────────────────────────────────────────────────────────────
export interface GradingResult {
  /** ABRSM-style grade label (เช่น 'Grade 1' ... 'Grade 8', 'Diploma') */
  grade: string;
  /** Composite numeric score from 0-100 (คะแนนรวม 0-100) */
  numericScore: number;
  /** Confidence level 0.0-1.0 (ความมั่นใจ — ต่ำถ้าข้อมูลน้อย) */
  confidence: number;
  /** Per-feature breakdown scores (คะแนนแยกตามมิติแต่ละด้าน) */
  breakdown: {
    /** ช่วงเสียง — semitone range across all notes */
    pitchRange: number;
    /** ความซับซ้อนจังหวะ — unique duration types + shortest note bonus */
    rhythmicComplexity: number;
    /** ความหนาแน่น — average notes per measure */
    noteDensity: number;
    /** ช่วงเสียงยาก — % of leaps ≥ perfect 5th (7 semitones) */
    intervalComplexity: number;
    /** ♯/♭ — % of notes with accidentals */
    accidentalFrequency: number;
    /** ความยากบันไดเสียง — based on number of sharps/flats */
    keyComplexity: number;
    /** ความซับซ้อนเสียงประสาน — unique voice/staff combinations */
    polyphonicComplexity: number;
    /** ความเร็ว BPM */
    tempo: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step name → semitone index lookup table
// ตาราง step → semitone สำหรับแปลง note เป็น MIDI number
// ─────────────────────────────────────────────────────────────────────────────
const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature weight constants (ค่าน้ำหนักแต่ละมิติ — รวมเป็น 1.0)
// ─────────────────────────────────────────────────────────────────────────────
const WEIGHTS = {
  pitchRange: 0.15,
  rhythmicComplexity: 0.20,
  noteDensity: 0.15,
  intervalComplexity: 0.15,
  accidentalFrequency: 0.10,
  keyComplexity: 0.10,
  polyphonicComplexity: 0.10,
  tempo: 0.05,
} as const;

/**
 * SongGradingEngine
 * 
 * Static utility class for classifying song difficulty.
 * ไม่ต้อง instantiate — ใช้ static method เรียกได้เลย
 * 
 * Usage:
 *   const result = SongGradingEngine.gradeSong(parsedNotes, { bpm: 120, fifths: -2 });
 *   console.log(result.grade); // 'Grade 3'
 */
export class SongGradingEngine {
  // ═══════════════════════════════════════════════════════════════════════════
  // Main public method — จุดเริ่มต้นการจัดเกรด
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze an array of parsed notes and return an ABRSM-style difficulty grade.
   * วิเคราะห์โน้ตที่ parse แล้วและจัดเกรดความยาก
   *
   * @param notes   — Array of ParsedNote from MusicEngine (โน้ตที่ parse จาก MusicXML)
   * @param metadata — Optional song-level info: bpm, fifths (key signature), key name
   * @returns GradingResult with grade, score, confidence, and feature breakdown
   */
  static gradeSong(
    notes: ParsedNote[],
    metadata: { bpm?: number; fifths?: number; key?: string } = {}
  ): GradingResult {
    // ── Handle edge case: empty or missing notes ──────────────────────
    // กรณีไม่มีโน้ตเลย — ให้ผลลัพธ์ต่ำสุด Grade 1 พร้อม confidence ต่ำ
    if (!notes || notes.length === 0) {
      return {
        grade: 'Grade 1',
        numericScore: 0,
        confidence: 0.1,
        breakdown: {
          pitchRange: 0,
          rhythmicComplexity: 0,
          noteDensity: 0,
          intervalComplexity: 0,
          accidentalFrequency: 0,
          keyComplexity: this.scoreKeyComplexity(metadata.fifths ?? 0),
          polyphonicComplexity: 0,
          tempo: this.scoreTempoComplexity(metadata.bpm ?? 120),
        },
      };
    }

    // ── Resolve metadata defaults ──────────────────────────────────────
    // ค่า default: bpm=120 (ถ้าไม่ระบุ), fifths=0 (C major)
    const bpm = metadata.bpm ?? 120;
    const fifths = metadata.fifths ?? 0;
    const hasTempo = metadata.bpm !== undefined && metadata.bpm !== null;

    // ── Compute MIDI numbers for all notes ────────────────────────────
    // แปลงทุกโน้ตเป็น MIDI number เพื่อคำนวณ pitch range และ intervals
    const midiNumbers = notes.map((n) => this.noteToMidi(n));

    // ── 1. Pitch Range Score (ช่วงเสียง) ──────────────────────────────
    const pitchRange = this.scorePitchRange(midiNumbers);

    // ── 2. Rhythmic Complexity Score (ความซับซ้อนจังหวะ) ───────────────
    const rhythmicComplexity = this.scoreRhythmicComplexity(notes);

    // ── 3. Note Density Score (ความหนาแน่นโน้ต) ──────────────────────
    const noteDensity = this.scoreNoteDensity(notes);

    // ── 4. Interval Complexity Score (ช่วงเสียงระหว่างโน้ต) ─────────────
    const intervalComplexity = this.scoreIntervalComplexity(notes, midiNumbers);

    // ── 5. Accidental Frequency Score (ความถี่ ♯/♭) ───────────────────
    const accidentalFrequency = this.scoreAccidentalFrequency(notes);

    // ── 6. Key Complexity Score (ความยากบันไดเสียง) ─────────────────────
    const keyComplexity = this.scoreKeyComplexity(fifths);

    // ── 7. Polyphonic Complexity Score (ความซับซ้อนเสียงซ้อน) ──────────
    const polyphonicComplexity = this.scorePolyphonicComplexity(notes);

    // ── 8. Tempo Score (ความเร็ว) ──────────────────────────────────────
    const tempo = this.scoreTempoComplexity(bpm);

    // ── Build the breakdown object ────────────────────────────────────
    const breakdown = {
      pitchRange,
      rhythmicComplexity,
      noteDensity,
      intervalComplexity,
      accidentalFrequency,
      keyComplexity,
      polyphonicComplexity,
      tempo,
    };

    // ── Compute weighted final score (คะแนนรวมถ่วงน้ำหนัก) ────────────
    const numericScore = Math.round(
      breakdown.pitchRange * WEIGHTS.pitchRange +
      breakdown.rhythmicComplexity * WEIGHTS.rhythmicComplexity +
      breakdown.noteDensity * WEIGHTS.noteDensity +
      breakdown.intervalComplexity * WEIGHTS.intervalComplexity +
      breakdown.accidentalFrequency * WEIGHTS.accidentalFrequency +
      breakdown.keyComplexity * WEIGHTS.keyComplexity +
      breakdown.polyphonicComplexity * WEIGHTS.polyphonicComplexity +
      breakdown.tempo * WEIGHTS.tempo
    );

    // ── Compute confidence (ความมั่นใจ) ──────────────────────────────
    // เริ่มที่ 0.9 แล้วลดตามเงื่อนไข
    let confidence = 0.9;

    // ลดถ้าโน้ตน้อยกว่า 20 ตัว (ข้อมูลไม่เพียงพอ)
    if (notes.length < 20) {
      confidence -= 0.1;
    }

    // ลดถ้ามีน้อยกว่า 2 ห้องเพลง (อาจเป็นเพลงสั้นเกินไป)
    const uniqueMeasures = new Set(notes.map((n) => n.measure).filter(Boolean));
    if (uniqueMeasures.size < 2) {
      confidence -= 0.1;
    }

    // ลดเล็กน้อยถ้าไม่มีข้อมูล tempo (ใช้ default 120 BPM)
    if (!hasTempo) {
      confidence -= 0.05;
    }

    // Clamp confidence ให้อยู่ในช่วง 0.0 - 1.0
    confidence = Math.max(0.0, Math.min(1.0, confidence));

    // ── Map score to grade label ──────────────────────────────────────
    const grade = this.gradeToLabel(numericScore);

    return {
      grade,
      numericScore,
      confidence,
      breakdown,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Grade-to-Label mapper — แปลงคะแนนเป็นชื่อเกรด
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a numeric score (0-100) to an ABRSM-style grade label.
   * แปลงคะแนน 0-100 เป็น label เกรด เช่น 'Grade 1', 'Grade 5', 'Diploma'
   *
   * Grade boundaries (เกณฑ์แบ่งเกรด):
   *   0-12  → Grade 1 (เริ่มต้น, เพลงง่ายมาก)
   *   13-22 → Grade 2
   *   23-32 → Grade 3
   *   33-42 → Grade 4
   *   43-54 → Grade 5
   *   55-66 → Grade 6
   *   67-78 → Grade 7
   *   79-89 → Grade 8
   *   90-100→ Diploma (ระดับวิชาชีพ)
   */
  static gradeToLabel(score: number): string {
    // Clamp score ให้อยู่ในช่วง 0-100
    const s = Math.max(0, Math.min(100, Math.round(score)));

    if (s <= 12) return 'Grade 1';
    if (s <= 22) return 'Grade 2';
    if (s <= 32) return 'Grade 3';
    if (s <= 42) return 'Grade 4';
    if (s <= 54) return 'Grade 5';
    if (s <= 66) return 'Grade 6';
    if (s <= 78) return 'Grade 7';
    if (s <= 89) return 'Grade 8';
    return 'Diploma';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers — ฟังก์ชันย่อยสำหรับคำนวณคะแนนแต่ละมิติ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a ParsedNote to its MIDI number.
   * แปลง ParsedNote เป็น MIDI number (0-127)
   * 
   * Formula: (octave * 12) + stepSemitone + alter
   * เช่น C4 = (4*12) + 0 + 0 = 48
   *      F#5 = (5*12) + 5 + 1 = 66
   */
  private static noteToMidi(note: ParsedNote): number {
    const stepIndex = STEP_TO_SEMITONE[note.step.toUpperCase()] ?? 0;
    return note.octave * 12 + stepIndex + (note.alter || 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 1: Pitch Range (ช่วงเสียง) — Weight: 15%
  // วัดจากช่วงห่างระหว่างโน้ตสูงสุดกับต่ำสุดในหน่วย semitone
  // เพลงง่ายจะอยู่ในช่วงแคบ (< 1 octave), เพลงยากมีช่วงกว้าง (3+ octaves)
  // ─────────────────────────────────────────────────────────────────────────
  private static scorePitchRange(midiNumbers: number[]): number {
    if (midiNumbers.length === 0) return 0;

    // Use loop instead of Math.min(...arr) to prevent stack overflow on songs with 65k+ notes
    let minMidi = Infinity, maxMidi = -Infinity;
    for (const m of midiNumbers) {
      if (m < minMidi) minMidi = m;
      if (m > maxMidi) maxMidi = m;
    }
    const range = maxMidi - minMidi;

    // Semitone range → difficulty score mapping
    // ช่วงเสียงยิ่งกว้าง ยิ่งยาก
    if (range <= 8) return 0;     // ≤ major 6th — ง่ายมาก (beginner)
    if (range <= 12) return 20;   // ≤ 1 octave
    if (range <= 16) return 35;   // ≤ 1 octave + P4
    if (range <= 20) return 50;   // ≤ 1 octave + m6
    if (range <= 24) return 65;   // ≤ 2 octaves
    if (range <= 30) return 75;   // ≤ 2.5 octaves
    if (range <= 36) return 85;   // ≤ 3 octaves
    return 100;                   // > 3 octaves — concert-level range
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 2: Rhythmic Complexity (ความซับซ้อนจังหวะ) — Weight: 20%
  // วัดจากจำนวน unique duration values ที่ใช้ในเพลง
  // เพลงง่ายใช้แค่ 1-2 แบบ (เช่น quarter + half)
  // เพลงยากใช้หลายแบบรวมถึง sixteenth notes
  // ─────────────────────────────────────────────────────────────────────────
  private static scoreRhythmicComplexity(notes: ParsedNote[]): number {
    if (notes.length === 0) return 0;

    // Collect unique durations (รวบรวม duration ที่ไม่ซ้ำ)
    const uniqueDurations = new Set(notes.map((n) => n.duration));
    const count = uniqueDurations.size;

    // Find shortest duration (หาโน้ตที่สั้นที่สุด)
    const shortest = Math.min(...Array.from(uniqueDurations));

    // Base score from unique duration count
    // ยิ่งใช้หลายแบบ ยิ่งซับซ้อน
    let score: number;
    if (count <= 2) score = 10;
    else if (count === 3) score = 25;
    else if (count === 4) score = 40;
    else if (count === 5) score = 55;
    else if (count === 6) score = 70;
    else score = 85; // 7+ unique durations

    // Bonus for sixteenth notes or shorter (โบนัสถ้ามีโน้ตสั้นกว่า 1/4 beat)
    // ซึ่งบ่งบอกว่ามีจังหวะเร็วมาก
    if (shortest < 0.25) {
      score = Math.min(100, score + 15);
    }

    return score;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 3: Note Density (ความหนาแน่นโน้ต) — Weight: 15%
  // วัดจากจำนวนโน้ตเฉลี่ยต่อห้องเพลง
  // เพลงง่ายมีโน้ตน้อยต่อห้อง, เพลงยากมีหลายโน้ตซ้อนกัน
  // ─────────────────────────────────────────────────────────────────────────
  private static scoreNoteDensity(notes: ParsedNote[]): number {
    if (notes.length === 0) return 0;

    // Count unique measures (นับจำนวนห้องเพลงที่ไม่ซ้ำ)
    const measures = new Set(notes.map((n) => n.measure).filter(Boolean));
    const measureCount = Math.max(1, measures.size); // ป้องกันหารด้วย 0

    // Average notes per measure (โน้ตเฉลี่ยต่อห้อง)
    const avgNotesPerMeasure = notes.length / measureCount;

    if (avgNotesPerMeasure < 2) return 10;
    if (avgNotesPerMeasure < 4) return 25;
    if (avgNotesPerMeasure < 6) return 40;
    if (avgNotesPerMeasure < 8) return 55;
    if (avgNotesPerMeasure < 12) return 70;
    if (avgNotesPerMeasure < 16) return 85;
    return 100; // 16+ notes per measure — very dense
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 4: Interval Complexity (ช่วงเสียงระหว่างโน้ต) — Weight: 15%
  // วัดจากสัดส่วนของ intervals ที่กว้าง ≥ 7 semitones (perfect 5th)
  // ถ้าเพลงมีการกระโดดเสียงบ่อย ย่อมเล่นยากกว่า
  // ─────────────────────────────────────────────────────────────────────────
  private static scoreIntervalComplexity(
    notes: ParsedNote[],
    midiNumbers: number[]
  ): number {
    if (notes.length < 2) return 0;

    // Group notes by trackId, then sort by startTime within each group
    // จัดกลุ่มตาม track แล้วเรียงตามเวลา เพื่อคำนวณ intervals ตามลำดับจริง
    const trackGroups: Record<string, { midi: number; startTime: number }[]> = {};
    notes.forEach((note, i) => {
      const trackId = note.trackId || '__default__';
      if (!trackGroups[trackId]) {
        trackGroups[trackId] = [];
      }
      trackGroups[trackId].push({ midi: midiNumbers[i], startTime: note.startTime });
    });

    let totalIntervals = 0;
    let largeIntervals = 0; // intervals ≥ 7 semitones (perfect 5th)

    // For each track, sort by startTime and compute consecutive intervals
    // คำนวณ interval ทีละคู่ ภายใน track เดียวกัน
    for (const trackId of Object.keys(trackGroups)) {
      const sorted = trackGroups[trackId].sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < sorted.length; i++) {
        const interval = Math.abs(sorted[i].midi - sorted[i - 1].midi);
        totalIntervals++;
        if (interval >= 7) {
          largeIntervals++;
        }
      }
    }

    if (totalIntervals === 0) return 0;

    // Percentage of large leaps (สัดส่วนของการกระโดดไกล)
    const pct = (largeIntervals / totalIntervals) * 100;

    if (pct < 5) return 10;
    if (pct < 10) return 25;
    if (pct < 20) return 45;
    if (pct < 30) return 60;
    if (pct < 40) return 75;
    return 90; // 40%+ large leaps — very challenging
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 5: Accidental Frequency (ความถี่ ♯/♭) — Weight: 10%
  // วัดจากสัดส่วนของโน้ตที่มี accidentals (alter ≠ 0)
  // เพลงง่ายมักอยู่ใน C major ไม่มี ♯/♭
  // ─────────────────────────────────────────────────────────────────────────
  private static scoreAccidentalFrequency(notes: ParsedNote[]): number {
    if (notes.length === 0) return 0;

    // Count notes with accidentals (นับโน้ตที่มี ♯ หรือ ♭)
    const accidentalCount = notes.filter((n) => n.alter !== 0 && n.alter !== undefined).length;
    const pct = (accidentalCount / notes.length) * 100;

    if (pct < 2) return 10;
    if (pct < 5) return 25;
    if (pct < 10) return 45;
    if (pct < 20) return 65;
    if (pct < 30) return 80;
    return 95; // 30%+ accidentals — chromatic or atonal passage
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 6: Key Complexity (ความยากบันไดเสียง) — Weight: 10%
  // วัดจาก abs(fifths) ซึ่งบอกจำนวน ♯/♭ ใน key signature
  // C major (0) ง่ายที่สุด, F# major (6) ยากมาก
  // ─────────────────────────────────────────────────────────────────────────
  private static scoreKeyComplexity(fifths: number): number {
    const absFifths = Math.abs(fifths);

    if (absFifths === 0) return 5;    // C major / A minor — ง่ายที่สุด
    if (absFifths === 1) return 15;   // G/F major — ♯/♭ ตัวเดียว
    if (absFifths === 2) return 30;   // D/Bb major
    if (absFifths === 3) return 45;   // A/Eb major
    if (absFifths === 4) return 60;   // E/Ab major
    if (absFifths === 5) return 75;   // B/Db major
    return 90;                        // F#/Gb major — 6-7 ♯/♭
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 7: Polyphonic Complexity (ความซับซ้อนเสียงซ้อน) — Weight: 10%
  // วัดจากจำนวน unique voice/staff combinations ทั้งหมด
  // เพลง 1 แนวเสียง = ง่าย, 4+ แนว = ยากมาก (เช่น fugue)
  // ─────────────────────────────────────────────────────────────────────────
  private static scorePolyphonicComplexity(notes: ParsedNote[]): number {
    if (notes.length === 0) return 0;

    // Count unique combinations of (trackId, staff, voice)
    // นับ unique voice/staff combinations ทุก track
    const voiceSet = new Set<string>();
    for (const note of notes) {
      const key = `${note.trackId}:${note.staff ?? 1}:${note.voice ?? 1}`;
      voiceSet.add(key);
    }

    const voiceCount = voiceSet.size;

    if (voiceCount <= 1) return 5;    // Monophonic — แนวเดียว
    if (voiceCount === 2) return 30;  // Duet / treble+bass
    if (voiceCount === 3) return 55;  // Trio
    if (voiceCount === 4) return 75;  // Quartet / SATB
    return 95;                        // 5+ voices — full polyphony
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Feature 8: Tempo (ความเร็ว) — Weight: 5%
  // วัดจาก BPM — เร็วมากหรือช้ามากจะยากกว่ากลาง
  // ─────────────────────────────────────────────────────────────────────────
  private static scoreTempoComplexity(bpm: number): number {
    if (bpm < 60) return 15;        // Grave/Largo — ช้ามากต้องคุม
    if (bpm < 80) return 25;        // Adagio/Andante
    if (bpm < 100) return 35;       // Andante/Moderato
    if (bpm < 120) return 50;       // Moderato/Allegretto
    if (bpm < 140) return 65;       // Allegro
    if (bpm < 160) return 80;       // Vivace
    return 95;                      // Presto — เร็วมาก
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Utility: Extract lightweight notes from raw XML document
  // สกัดโน้ตแบบเบาจาก xmlDoc เพื่อใช้ pre-grade ตอน parse metadata
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract ParsedNote[] from a raw MusicXML Document for lightweight grading.
   * ใช้ตอน parseMusicXMLMetadata เพื่อให้ auto-grade ได้โดยไม่ต้องรอ MusicEngine
   *
   * This is a simplified extraction — not as thorough as MusicEngine's parser,
   * but sufficient for accurate difficulty grading.
   * การสกัดนี้เป็นแบบย่อ ไม่ละเอียดเท่า MusicEngine แต่เพียงพอสำหรับจัดเกรด
   */
  static extractNotesFromXmlDoc(xmlDoc: Document): ParsedNote[] {
    const notes: ParsedNote[] = [];
    const parts = xmlDoc.querySelectorAll('part');

    parts.forEach((part, partIdx) => {
      const partId = part.getAttribute('id') || `P${partIdx + 1}`;
      const measures = part.querySelectorAll('measure');
      let divisions = 1; // default divisions (จำนวน division ต่อ quarter note)
      let currentTime = 0; // absolute time in beats (ตำแหน่ง beat สัมบูรณ์)

      measures.forEach((measure) => {
        const measureNumber = measure.getAttribute('number') || '1';

        // Update divisions if present in this measure
        // อัพเดท divisions ถ้ามีใน attribute ของห้องนี้
        const divNode = measure.querySelector('attributes divisions');
        if (divNode) {
          const val = parseInt(divNode.textContent || '1');
          if (!isNaN(val) && val > 0) divisions = val;
        }

        // Process all child elements in order
        // ประมวลผล element ลูกตามลำดับ
        const children = Array.from(measure.children);
        let prevNoteStart = currentTime;

        for (const child of children) {
          if (child.tagName === 'note') {
            const isRest = child.querySelector('rest') !== null;
            const isChord = child.querySelector('chord') !== null;
            const isGrace = child.querySelector('grace') !== null;
            const pitch = child.querySelector('pitch');

            // Read raw duration in divisions
            const rawDuration = isGrace
              ? 0
              : parseInt(child.querySelector('duration')?.textContent || '0');
            // Convert to beats: rawDuration / divisions
            const durationInBeats = divisions > 0 ? rawDuration / divisions : 0;

            // For chords, use the same start time as previous note
            // สำหรับ chord ใช้เวลาเริ่มเดียวกับโน้ตก่อนหน้า
            const startTime = isChord ? prevNoteStart : currentTime;

            if (pitch && !isRest) {
              const step = pitch.querySelector('step')?.textContent?.trim() || 'C';
              const octave = parseInt(pitch.querySelector('octave')?.textContent || '4');
              const alterText = pitch.querySelector('alter')?.textContent;
              const alter = alterText ? Math.round(parseFloat(alterText)) : 0;

              // Read staff and voice info (อ่านข้อมูล staff/voice)
              const staffEl = child.querySelector('staff');
              const voiceEl = child.querySelector('voice');
              const staff = staffEl ? parseInt(staffEl.textContent || '1') : undefined;
              const voice = voiceEl ? parseInt(voiceEl.textContent || '1') : undefined;

              notes.push({
                trackId: partId,
                step: step.toUpperCase(),
                octave,
                alter,
                duration: durationInBeats,
                startTime,
                solfege: '', // ไม่ต้องการ solfege สำหรับ grading
                staff,
                voice,
                measure: measureNumber,
              });
            }

            // Advance time only for non-chord notes
            // เลื่อนเวลาเฉพาะโน้ตที่ไม่ใช่ chord
            if (!isChord) {
              prevNoteStart = currentTime;
              currentTime += durationInBeats;
            }
          } else if (child.tagName === 'backup') {
            // <backup> moves time backward (ย้อนเวลากลับ)
            const dur = parseInt(child.querySelector('duration')?.textContent || '0');
            const backupBeats = divisions > 0 ? dur / divisions : 0;
            currentTime = Math.max(0, currentTime - backupBeats);
          } else if (child.tagName === 'forward') {
            // <forward> moves time forward (เลื่อนเวลาไปข้างหน้า)
            const dur = parseInt(child.querySelector('duration')?.textContent || '0');
            const forwardBeats = divisions > 0 ? dur / divisions : 0;
            currentTime += forwardBeats;
          }
        }
      });
    });

    return notes;
  }
}
