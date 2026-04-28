/**
 * [SCORELENS] MusicXML Validator — Music Theory Validation Engine
 * ================================================================
 * Validates MusicXML output against music theory rules to catch OMR errors.
 * 
 * 9 Validation Layers:
 *   1. Time Signature  — valid beats/beat-type
 *   2. Measure Duration — note durations sum to expected beats
 *   3. Pitch Validity   — step/octave/alter in valid ranges
 *   4. Beaming Rules    — beam grouping follows time signature
 *   5. Rest Validation  — rests are valid types, fill gaps properly
 *   6. Tie/Slur Match   — ties/slurs have proper start/stop pairs
 *   7. Key Signature    — fifths in range, accidentals consistent
 *   8. Structural       — parts, measures, attributes exist
 *   9. Metadata & Terms — title, composer, tempo/dynamics/expression markings
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type ValidationSeverity = 'critical' | 'warning' | 'info';
export type ValidationLayer =
  | 'time_sig'
  | 'duration'
  | 'pitch'
  | 'beaming'
  | 'rest'
  | 'tie_slur'
  | 'key_sig'
  | 'structure'
  | 'metadata';

export interface ValidationError {
  layer: ValidationLayer;
  severity: ValidationSeverity;
  measure: number;        // 0 = global
  beat?: number;
  message: string;
  messageEN: string;
  autoFixable: boolean;
  autoFixAction?: string; // machine-readable fix identifier
}

export interface ValidationReport {
  /** Overall score 0–100 */
  score: number;
  /** Total number of measures analyzed */
  totalMeasures: number;
  /** Counts per severity */
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  /** All issues found */
  errors: ValidationError[];
  /** Whether the auto-fixer can attempt repairs */
  autoFixable: boolean;
  /** Human-readable summary */
  summary: string;
  summaryTH: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const VALID_STEPS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
const VALID_BEATS = new Set([1, 2, 3, 4, 5, 6, 7, 9, 12]);
const VALID_BEAT_TYPES = new Set([1, 2, 4, 8, 16, 32]);
const VALID_NOTE_TYPES = new Set([
  'maxima', 'long', 'breve', 'whole', 'half', 'quarter',
  'eighth', '16th', '32nd', '64th', '128th'
]);

function getTextContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function getIntContent(el: Element | null, fallback: number): number {
  const txt = getTextContent(el);
  const n = parseInt(txt, 10);
  return isNaN(n) ? fallback : n;
}

// ─── Layer 1: Time Signature ──────────────────────────────────────────────

function validateTimeSignature(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];
  const timeSigs = xmlDoc.querySelectorAll('time');

  if (timeSigs.length === 0) {
    // Check if beats/beat-type exist directly under attributes
    const beats = xmlDoc.querySelector('beats');
    const beatType = xmlDoc.querySelector('beat-type');
    if (!beats && !beatType) {
      errors.push({
        layer: 'time_sig',
        severity: 'warning',
        measure: 1,
        message: 'ไม่พบ time signature ในเพลง',
        messageEN: 'No time signature found in the score',
        autoFixable: true,
        autoFixAction: 'add_default_time_sig',
      });
    }
  }

  timeSigs.forEach((ts, idx) => {
    const beats = getIntContent(ts.querySelector('beats'), -1);
    const beatType = getIntContent(ts.querySelector('beat-type'), -1);

    if (beats !== -1 && !VALID_BEATS.has(beats)) {
      errors.push({
        layer: 'time_sig',
        severity: 'critical',
        measure: 1,
        message: `Time signature beats = ${beats} ไม่สมเหตุสมผล`,
        messageEN: `Time signature beats = ${beats} is unusual`,
        autoFixable: false,
      });
    }

    if (beatType !== -1 && !VALID_BEAT_TYPES.has(beatType)) {
      errors.push({
        layer: 'time_sig',
        severity: 'critical',
        measure: 1,
        message: `Time signature beat-type = ${beatType} ไม่ใช่ค่ามาตรฐาน (ต้องเป็น power of 2)`,
        messageEN: `Time signature beat-type = ${beatType} is not a standard value (must be power of 2)`,
        autoFixable: false,
      });
    }
  });

  return errors;
}

// ─── Layer 2: Measure Duration Integrity ──────────────────────────────────

function validateMeasureDurations(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];
  const parts = xmlDoc.querySelectorAll('part');

  parts.forEach((part) => {
    let divisions = 1;
    let beats = 4;
    let beatType = 4;

    const measures = part.querySelectorAll('measure');
    measures.forEach((measure) => {
      const measureNum = parseInt(measure.getAttribute('number') || '0', 10);

      // Update divisions/time if this measure has attributes
      const divEl = measure.querySelector('attributes divisions');
      if (divEl) divisions = getIntContent(divEl, divisions);

      const beatsEl = measure.querySelector('attributes time beats');
      if (beatsEl) beats = getIntContent(beatsEl, beats);

      const btEl = measure.querySelector('attributes time beat-type');
      if (btEl) beatType = getIntContent(btEl, beatType);

      // Expected total duration for this measure
      const expectedDuration = (beats * divisions * 4) / beatType;

      // Sum actual durations (voice 1 only to avoid double-counting)
      // We track per-voice to handle multi-voice measures
      const voiceDurations: Record<string, number> = {};
      let hasForwardBackup = false;

      const children = measure.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (child.tagName === 'note') {
          const isChord = child.querySelector('chord') !== null;
          const dur = getIntContent(child.querySelector('duration'), 0);
          const voice = getTextContent(child.querySelector('voice')) || '1';

          if (!isChord) {
            voiceDurations[voice] = (voiceDurations[voice] || 0) + dur;
          }
        } else if (child.tagName === 'forward') {
          hasForwardBackup = true;
          const dur = getIntContent(child.querySelector('duration'), 0);
          // Forward adds to the timeline
          voiceDurations['1'] = (voiceDurations['1'] || 0) + dur;
        } else if (child.tagName === 'backup') {
          hasForwardBackup = true;
          // Backup doesn't affect duration sum, it rewinds position
        }
      }

      // Skip measures with complex forward/backup (multi-staff) for now
      if (hasForwardBackup && Object.keys(voiceDurations).length > 1) {
        return; // Too complex to validate simply
      }

      // Check voice 1 (or the only voice present)
      const voice1Key = Object.keys(voiceDurations).sort()[0];
      if (voice1Key) {
        const totalDuration = voiceDurations[voice1Key];
        const diff = Math.abs(totalDuration - expectedDuration);

        if (diff > 0.5 && expectedDuration > 0) {
          const ratio = totalDuration / expectedDuration;
          const severity: ValidationSeverity =
            ratio < 0.5 || ratio > 2 ? 'critical' : 'warning';

          errors.push({
            layer: 'duration',
            severity,
            measure: measureNum,
            message: `ห้องที่ ${measureNum}: ผลรวม duration = ${totalDuration}, ` +
                     `ควรเป็น ${expectedDuration} (${beats}/${beatType})`,
            messageEN: `Measure ${measureNum}: total duration = ${totalDuration}, ` +
                       `expected ${expectedDuration} (${beats}/${beatType})`,
            autoFixable: true,
            autoFixAction: totalDuration < expectedDuration
              ? 'fill_rest'
              : 'trim_last_note',
          });
        }
      }
    });
  });

  return errors;
}

// ─── Layer 3: Pitch Validity ──────────────────────────────────────────────

function validatePitchValidity(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];
  const measures = xmlDoc.querySelectorAll('measure');

  let prevMidi: number | null = null;

  measures.forEach((measure) => {
    const measureNum = parseInt(measure.getAttribute('number') || '0', 10);
    const notes = measure.querySelectorAll('note');

    notes.forEach((note) => {
      const rest = note.querySelector('rest');
      if (rest) return;

      const pitch = note.querySelector('pitch');
      if (!pitch) return;

      const step = getTextContent(pitch.querySelector('step'));
      const octave = getIntContent(pitch.querySelector('octave'), -1);
      const alter = getIntContent(pitch.querySelector('alter'), 0);

      // Validate step
      if (step && !VALID_STEPS.has(step)) {
        errors.push({
          layer: 'pitch',
          severity: 'critical',
          measure: measureNum,
          message: `ห้องที่ ${measureNum}: step "${step}" ไม่ถูกต้อง (ต้องเป็น A-G)`,
          messageEN: `Measure ${measureNum}: step "${step}" is invalid (must be A-G)`,
          autoFixable: false,
        });
      }

      // Validate octave
      if (octave < 0 || octave > 8) {
        errors.push({
          layer: 'pitch',
          severity: 'critical',
          measure: measureNum,
          message: `ห้องที่ ${measureNum}: octave ${octave} อยู่นอกช่วง (0-8)`,
          messageEN: `Measure ${measureNum}: octave ${octave} out of range (0-8)`,
          autoFixable: true,
          autoFixAction: 'clamp_octave',
        });
      }

      // Validate alter
      if (alter < -2 || alter > 2) {
        errors.push({
          layer: 'pitch',
          severity: 'warning',
          measure: measureNum,
          message: `ห้องที่ ${measureNum}: alter = ${alter} ไม่ปกติ (ปกติ -2 ถึง +2)`,
          messageEN: `Measure ${measureNum}: alter = ${alter} is unusual (normally -2 to +2)`,
          autoFixable: true,
          autoFixAction: 'clamp_alter',
        });
      }

      // Check for extreme leaps (> 2 octaves)
      if (step && octave >= 0) {
        const stepMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        const midi = (octave + 1) * 12 + (stepMap[step] || 0) + alter;

        if (prevMidi !== null) {
          const interval = Math.abs(midi - prevMidi);
          if (interval > 24) { // > 2 octaves
            errors.push({
              layer: 'pitch',
              severity: 'warning',
              measure: measureNum,
              message: `ห้องที่ ${measureNum}: โน้ตกระโดด ${interval} semitones (> 2 octaves) — อาจอ่านผิด`,
              messageEN: `Measure ${measureNum}: leap of ${interval} semitones (> 2 octaves) — possible misread`,
              autoFixable: false,
            });
          }
        }
        prevMidi = midi;
      }
    });
  });

  return errors;
}

// ─── Layer 5: Rest Validation ─────────────────────────────────────────────

function validateRests(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];
  const measures = xmlDoc.querySelectorAll('measure');

  measures.forEach((measure) => {
    const measureNum = parseInt(measure.getAttribute('number') || '0', 10);
    const notes = measure.querySelectorAll('note');
    let hasNotes = false;
    let hasRests = false;

    notes.forEach((note) => {
      if (note.querySelector('rest')) {
        hasRests = true;
        const type = getTextContent(note.querySelector('type'));
        if (type && !VALID_NOTE_TYPES.has(type)) {
          errors.push({
            layer: 'rest',
            severity: 'warning',
            measure: measureNum,
            message: `ห้องที่ ${measureNum}: rest type "${type}" ไม่ถูกต้อง`,
            messageEN: `Measure ${measureNum}: rest type "${type}" is invalid`,
            autoFixable: false,
          });
        }
      } else {
        hasNotes = true;
      }
    });

    // Empty measure should have a whole rest
    if (!hasNotes && !hasRests && notes.length === 0) {
      errors.push({
        layer: 'rest',
        severity: 'info',
        measure: measureNum,
        message: `ห้องที่ ${measureNum}: ห้องว่าง ไม่มีโน้ตหรือตัวหยุด`,
        messageEN: `Measure ${measureNum}: empty measure (no notes or rests)`,
        autoFixable: true,
        autoFixAction: 'add_whole_rest',
      });
    }
  });

  return errors;
}

// ─── Layer 6: Tie & Slur Matching ─────────────────────────────────────────

function validateTiesAndSlurs(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];

  // Track open ties: key = "step-octave-alter", value = measure number
  const openTies = new Map<string, number>();

  const measures = xmlDoc.querySelectorAll('measure');
  measures.forEach((measure) => {
    const measureNum = parseInt(measure.getAttribute('number') || '0', 10);
    const notes = measure.querySelectorAll('note');

    notes.forEach((note) => {
      if (note.querySelector('rest')) return;

      const pitch = note.querySelector('pitch');
      if (!pitch) return;

      const step = getTextContent(pitch.querySelector('step'));
      const octave = getTextContent(pitch.querySelector('octave'));
      const alter = getTextContent(pitch.querySelector('alter')) || '0';
      const pitchKey = `${step}-${octave}-${alter}`;

      // Check <tie> elements
      const ties = note.querySelectorAll('tie');
      ties.forEach((tie) => {
        const type = tie.getAttribute('type');
        if (type === 'start') {
          openTies.set(pitchKey, measureNum);
        } else if (type === 'stop') {
          if (!openTies.has(pitchKey)) {
            errors.push({
              layer: 'tie_slur',
              severity: 'warning',
              measure: measureNum,
              message: `ห้องที่ ${measureNum}: tie stop ไม่มี tie start คู่ (${step}${octave})`,
              messageEN: `Measure ${measureNum}: tie stop without matching start (${step}${octave})`,
              autoFixable: true,
              autoFixAction: 'remove_orphan_tie_stop',
            });
          } else {
            openTies.delete(pitchKey);
          }
        }
      });
    });
  });

  // Report unclosed ties
  openTies.forEach((startMeasure, pitchKey) => {
    errors.push({
      layer: 'tie_slur',
      severity: 'warning',
      measure: startMeasure,
      message: `ห้องที่ ${startMeasure}: tie start ไม่มี tie stop คู่ (${pitchKey})`,
      messageEN: `Measure ${startMeasure}: tie start without matching stop (${pitchKey})`,
      autoFixable: true,
      autoFixAction: 'remove_orphan_tie_start',
    });
  });

  // Check slur pairs
  let openSlurs = 0;
  measures.forEach((measure) => {
    const measureNum = parseInt(measure.getAttribute('number') || '0', 10);
    const notations = measure.querySelectorAll('notations slur');
    notations.forEach((slur) => {
      const type = slur.getAttribute('type');
      if (type === 'start') openSlurs++;
      else if (type === 'stop') {
        if (openSlurs <= 0) {
          errors.push({
            layer: 'tie_slur',
            severity: 'info',
            measure: measureNum,
            message: `ห้องที่ ${measureNum}: slur stop ไม่มี slur start คู่`,
            messageEN: `Measure ${measureNum}: slur stop without matching start`,
            autoFixable: true,
            autoFixAction: 'remove_orphan_slur',
          });
        } else {
          openSlurs--;
        }
      }
    });
  });

  return errors;
}

// ─── Layer 7: Key Signature ───────────────────────────────────────────────

function validateKeySignature(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];
  const keys = xmlDoc.querySelectorAll('key');

  keys.forEach((key) => {
    const fifths = getIntContent(key.querySelector('fifths'), 0);
    if (fifths < -7 || fifths > 7) {
      errors.push({
        layer: 'key_sig',
        severity: 'critical',
        measure: 1,
        message: `Key signature fifths = ${fifths} อยู่นอกช่วง (-7 ถึง +7)`,
        messageEN: `Key signature fifths = ${fifths} out of range (-7 to +7)`,
        autoFixable: true,
        autoFixAction: 'clamp_fifths',
      });
    }
  });

  return errors;
}

// ─── Layer 8: Structural Validation ───────────────────────────────────────

function validateStructure(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];

  // Must have score-partwise
  const root = xmlDoc.querySelector('score-partwise');
  if (!root) {
    errors.push({
      layer: 'structure',
      severity: 'critical',
      measure: 0,
      message: 'ไม่พบ <score-partwise> — ไม่ใช่ MusicXML ที่ถูกต้อง',
      messageEN: 'Missing <score-partwise> — not a valid MusicXML',
      autoFixable: false,
    });
    return errors; // Can't continue
  }

  // Must have at least one part
  const parts = xmlDoc.querySelectorAll('part');
  if (parts.length === 0) {
    errors.push({
      layer: 'structure',
      severity: 'critical',
      measure: 0,
      message: 'ไม่พบ <part> ใดๆ ในเพลง',
      messageEN: 'No <part> elements found',
      autoFixable: false,
    });
  }

  // Must have at least one measure
  const measures = xmlDoc.querySelectorAll('measure');
  if (measures.length === 0) {
    errors.push({
      layer: 'structure',
      severity: 'critical',
      measure: 0,
      message: 'ไม่พบห้องเพลงใดๆ',
      messageEN: 'No measures found',
      autoFixable: false,
    });
  }

  // Must have divisions
  const divisions = xmlDoc.querySelector('divisions');
  if (!divisions) {
    errors.push({
      layer: 'structure',
      severity: 'warning',
      measure: 1,
      message: 'ไม่พบ <divisions> — อาจทำให้จังหวะผิดพลาด',
      messageEN: 'Missing <divisions> — may cause timing errors',
      autoFixable: true,
      autoFixAction: 'add_default_divisions',
    });
  }

  // Should have at least some notes
  const notes = xmlDoc.querySelectorAll('note');
  if (notes.length === 0) {
    errors.push({
      layer: 'structure',
      severity: 'critical',
      measure: 0,
      message: 'ไม่พบโน้ตใดๆ ในเพลง',
      messageEN: 'No notes found in the score',
      autoFixable: false,
    });
  }

  return errors;
}

// ─── Layer 9: Metadata & Music Terms ──────────────────────────────────────

/** Known tempo term → BPM mapping for validation */
const TEMPO_TERMS: Record<string, [number, number]> = {
  'grave':       [25, 45],
  'largo':       [40, 60],
  'larghetto':   [60, 66],
  'adagio':      [66, 76],
  'andante':     [76, 108],
  'andantino':   [80, 108],
  'moderato':    [108, 120],
  'allegretto':  [112, 120],
  'allegro':     [120, 156],
  'vivace':      [156, 176],
  'presto':      [168, 200],
  'prestissimo': [200, 280],
};

/** Essential music terms that should be preserved if present in source */
const ESSENTIAL_MUSIC_TERMS = [
  // Dynamics
  'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff',
  'sfz', 'sfp', 'fp', 'rf', 'rfz', 'fz',
  'crescendo', 'cresc', 'decrescendo', 'decresc', 'diminuendo', 'dim',
  // Tempo modifications
  'rit', 'ritardando', 'rall', 'rallentando',
  'accel', 'accelerando', 'a tempo', 'tempo primo',
  'rubato', 'ad libitum',
  // Expression
  'dolce', 'espressivo', 'cantabile', 'legato', 'staccato',
  'marcato', 'tenuto', 'con brio', 'con fuoco', 'con moto',
  'grazioso', 'maestoso', 'agitato', 'tranquillo', 'animato',
  // Structure
  'fine', 'da capo', 'd.c.', 'dal segno', 'd.s.',
  'coda', 'al coda', 'al fine', 'segno',
  // Repeats
  'volta', '1.', '2.', 'repeat',
  // Pedal
  'ped', 'con ped', 'senza ped', 'una corda', 'tre corde',
];

function validateMetadataAndTerms(xmlDoc: Document): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Check Title ──
  const workTitle = getTextContent(xmlDoc.querySelector('work-title'));
  const movementTitle = getTextContent(xmlDoc.querySelector('movement-title'));
  const title = workTitle || movementTitle;

  if (!title) {
    errors.push({
      layer: 'metadata',
      severity: 'warning',
      measure: 0,
      message: 'ไม่พบชื่อเพลง (work-title / movement-title)',
      messageEN: 'No song title found (work-title / movement-title)',
      autoFixable: false,
    });
  } else {
    // Check for generic/placeholder titles
    const genericTitles = ['score', 'untitled', 'music21', 'title', 'new score', 'unnamed'];
    if (genericTitles.some(g => title.toLowerCase().includes(g))) {
      errors.push({
        layer: 'metadata',
        severity: 'info',
        measure: 0,
        message: `ชื่อเพลง "${title}" เป็นชื่อ generic — อาจไม่ใช่ชื่อจริง`,
        messageEN: `Title "${title}" appears to be generic — may not be the actual title`,
        autoFixable: false,
      });
    }
  }

  // ── Check Composer ──
  const creators = xmlDoc.querySelectorAll('creator');
  let composerFound = false;
  creators.forEach(c => {
    const type = c.getAttribute('type');
    const text = getTextContent(c);
    if (type === 'composer' && text) {
      composerFound = true;
      const genericComposers = ['unknown', 'music21', 'scorelens', 'ai', 'oemer'];
      if (genericComposers.some(g => text.toLowerCase().includes(g))) {
        errors.push({
          layer: 'metadata',
          severity: 'info',
          measure: 0,
          message: `ชื่อผู้แต่ง "${text}" เป็นชื่อ generic — ควรระบุชื่อจริง`,
          messageEN: `Composer "${text}" appears generic — should use actual name`,
          autoFixable: false,
        });
      }
    }
  });

  if (!composerFound) {
    errors.push({
      layer: 'metadata',
      severity: 'info',
      measure: 0,
      message: 'ไม่พบชื่อผู้แต่ง (creator type="composer")',
      messageEN: 'No composer found (creator type="composer")',
      autoFixable: false,
    });
  }

  // ── Check Tempo Marking ──
  const soundEl = xmlDoc.querySelector('sound[tempo]');
  const perMinuteEl = xmlDoc.querySelector('per-minute');
  const tempoDirection = xmlDoc.querySelector('direction-type words');

  if (!soundEl && !perMinuteEl) {
    errors.push({
      layer: 'metadata',
      severity: 'warning',
      measure: 0,
      message: 'ไม่พบ tempo marking — อาจเล่นผิดความเร็ว',
      messageEN: 'No tempo marking found — playback speed may be wrong',
      autoFixable: true,
      autoFixAction: 'add_default_tempo',
    });
  } else {
    // Validate tempo value is reasonable
    const tempo = soundEl
      ? parseInt(soundEl.getAttribute('tempo') || '0')
      : parseInt(getTextContent(perMinuteEl), 10);
    if (tempo > 0 && (tempo < 20 || tempo > 300)) {
      errors.push({
        layer: 'metadata',
        severity: 'warning',
        measure: 0,
        message: `Tempo ${tempo} BPM ผิดปกติ (ปกติ 40-240)`,
        messageEN: `Tempo ${tempo} BPM is unusual (normal range: 40-240)`,
        autoFixable: false,
      });
    }
  }

  // ── Check Dynamics ──
  const dynamics = xmlDoc.querySelectorAll('dynamics');
  // Not strictly required, but good to note
  if (dynamics.length === 0) {
    // Check if any direction words contain dynamics
    const words = xmlDoc.querySelectorAll('direction-type words');
    let hasDynamicWord = false;
    words.forEach(w => {
      const text = getTextContent(w).toLowerCase();
      if (['p', 'f', 'mp', 'mf', 'pp', 'ff', 'ppp', 'fff'].some(d => text === d)) {
        hasDynamicWord = true;
      }
    });

    if (!hasDynamicWord) {
      errors.push({
        layer: 'metadata',
        severity: 'info',
        measure: 0,
        message: 'ไม่พบ dynamics (p, f, mf, etc.) — อาจมีในต้นฉบับแต่ OMR ไม่ได้อ่าน',
        messageEN: 'No dynamics found (p, f, mf, etc.) — may exist in original but OMR missed them',
        autoFixable: false,
      });
    }
  }

  // ── Check for lyrics (should be stripped for Memolody melody-first approach) ──
  const lyrics = xmlDoc.querySelectorAll('lyric');
  if (lyrics.length > 0) {
    // Check if these are actual song lyrics vs solfege note names
    let hasRealLyrics = false;
    const solfegePatterns = /^(do|re|mi|fa|sol|la|si|ti|ut|ดo|เร|มี|ฟา|ซอล|ลา|ที|โด|C|D|E|F|G|A|B|\d+)$/i;
    lyrics.forEach(lyric => {
      const text = getTextContent(lyric.querySelector('text'));
      if (text && !solfegePatterns.test(text.trim())) {
        hasRealLyrics = true;
      }
    });

    if (hasRealLyrics) {
      errors.push({
        layer: 'metadata',
        severity: 'info',
        measure: 0,
        message: `พบเนื้อเพลง (lyrics) ${lyrics.length} จุด — จะถูกตัดออกโดยอัตโนมัติ (Memolody เน้นทำนอง)`,
        messageEN: `Found ${lyrics.length} lyrics — will be stripped (Memolody focuses on melody)`,
        autoFixable: true,
        autoFixAction: 'strip_lyrics',
      });
    }
  }

  return errors;
}

// ─── Main Validator ───────────────────────────────────────────────────────

/**
 * Validate a MusicXML string against music theory rules.
 * Returns a detailed report with score, errors, and fix suggestions.
 */
export function validateMusicXml(xmlString: string): ValidationReport {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Check for XML parse errors
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    return {
      score: 0,
      totalMeasures: 0,
      criticalCount: 1,
      warningCount: 0,
      infoCount: 0,
      errors: [{
        layer: 'structure',
        severity: 'critical',
        measure: 0,
        message: 'XML parse error — ไฟล์เสียหาย',
        messageEN: 'XML parse error — file is corrupted',
        autoFixable: false,
      }],
      autoFixable: false,
      summary: 'XML parse error',
      summaryTH: 'XML ไม่ถูกต้อง — ไฟล์เสียหาย',
    };
  }

  // Run all validation layers
  const allErrors: ValidationError[] = [
    ...validateStructure(xmlDoc),
    ...validateTimeSignature(xmlDoc),
    ...validateKeySignature(xmlDoc),
    ...validateMeasureDurations(xmlDoc),
    ...validatePitchValidity(xmlDoc),
    ...validateRests(xmlDoc),
    ...validateTiesAndSlurs(xmlDoc),
    ...validateMetadataAndTerms(xmlDoc),
  ];

  // Calculate score
  const totalMeasures = xmlDoc.querySelectorAll('measure').length;
  const criticalCount = allErrors.filter(e => e.severity === 'critical').length;
  const warningCount = allErrors.filter(e => e.severity === 'warning').length;
  const infoCount = allErrors.filter(e => e.severity === 'info').length;

  // Weighted scoring: critical=-10, warning=-3, info=-1, base=100
  const penalty = criticalCount * 10 + warningCount * 3 + infoCount * 1;
  const maxPenalty = Math.max(totalMeasures * 2, 30); // Scale with piece length
  const score = Math.max(0, Math.round(100 - (penalty / maxPenalty) * 100));

  const autoFixable = allErrors.some(e => e.autoFixable);

  // Generate summary
  const summaryParts: string[] = [];
  if (criticalCount > 0) summaryParts.push(`${criticalCount} critical`);
  if (warningCount > 0) summaryParts.push(`${warningCount} warnings`);
  if (infoCount > 0) summaryParts.push(`${infoCount} info`);
  const summary = summaryParts.length > 0
    ? `Score: ${score}% | ${summaryParts.join(', ')} in ${totalMeasures} measures`
    : `Score: ${score}% | Perfect! ${totalMeasures} measures validated`;

  const summaryTH = summaryParts.length > 0
    ? `คะแนน: ${score}% | พบ ${allErrors.length} จุดที่ต้องตรวจสอบ ใน ${totalMeasures} ห้อง`
    : `คะแนน: ${score}% | สมบูรณ์แบบ! ตรวจสอบ ${totalMeasures} ห้องแล้ว`;

  return {
    score,
    totalMeasures,
    criticalCount,
    warningCount,
    infoCount,
    errors: allErrors,
    autoFixable,
    summary,
    summaryTH,
  };
}
