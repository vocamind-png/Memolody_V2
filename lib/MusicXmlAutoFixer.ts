/**
 * [SCORELENS] MusicXML Auto-Fixer — Automatic Error Correction Engine
 * ====================================================================
 * Takes validation errors from MusicXmlValidator and attempts automatic repairs.
 * 
 * Fixable issues:
 *   - Duration gaps → fill with rests
 *   - Duration overflow → trim last note
 *   - Orphan ties → remove unmatched tie start/stop
 *   - Missing divisions → add default
 *   - Missing time signature → add 4/4 default
 *   - Missing tempo → add 120 BPM default
 *   - Empty measures → add whole rest
 *   - Out-of-range octave → clamp to valid range
 *   - Out-of-range alter → clamp to ±2
 *   - Out-of-range fifths → clamp to ±7
 *   - Original lyrics → strip (Memolody focuses on melody/solfege, not lyrics)
 *   - Beaming → auto-group eighth/16th notes per time signature rules
 */

import { ValidationError, ValidationReport } from './MusicXmlValidator';

// ─── Types ────────────────────────────────────────────────────────────────

export interface FixResult {
  /** The corrected MusicXML string */
  xml: string;
  /** Number of fixes applied */
  fixCount: number;
  /** Human-readable log of all fixes */
  fixLog: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getTextContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function getIntContent(el: Element | null, fallback: number): number {
  const txt = getTextContent(el);
  const n = parseInt(txt, 10);
  return isNaN(n) ? fallback : n;
}

/** Create a rest note element with the given duration */
function createRestElement(xmlDoc: Document, duration: number, divisions: number): Element {
  const note = xmlDoc.createElement('note');

  const rest = xmlDoc.createElement('rest');
  note.appendChild(rest);

  const durEl = xmlDoc.createElement('duration');
  durEl.textContent = duration.toString();
  note.appendChild(durEl);

  // Determine rest type based on duration relative to divisions
  const quarterDuration = divisions;
  let typeName = 'quarter';
  if (duration >= quarterDuration * 4) typeName = 'whole';
  else if (duration >= quarterDuration * 2) typeName = 'half';
  else if (duration >= quarterDuration) typeName = 'quarter';
  else if (duration >= quarterDuration / 2) typeName = 'eighth';
  else if (duration >= quarterDuration / 4) typeName = '16th';
  else typeName = '32nd';

  const typeEl = xmlDoc.createElement('type');
  typeEl.textContent = typeName;
  note.appendChild(typeEl);

  return note;
}

// ─── Fix: Duration Gaps (fill with rests) ─────────────────────────────────

function fixDurationGaps(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;
  const parts = xmlDoc.querySelectorAll('part');

  parts.forEach((part) => {
    let divisions = 1;
    let beats = 4;
    let beatType = 4;

    const measures = part.querySelectorAll('measure');
    measures.forEach((measure) => {
      const measureNum = measure.getAttribute('number') || '?';

      // Update from attributes
      const divEl = measure.querySelector('attributes divisions');
      if (divEl) divisions = getIntContent(divEl, divisions);

      const beatsEl = measure.querySelector('attributes time beats');
      if (beatsEl) beats = getIntContent(beatsEl, beats);

      const btEl = measure.querySelector('attributes time beat-type');
      if (btEl) beatType = getIntContent(btEl, beatType);

      const expectedDuration = (beats * divisions * 4) / beatType;

      // ── Per-voice duration tracking ──────────────────────────────
      // Track total duration for each staff+voice combination.
      // This correctly handles multi-voice measures with backup/forward
      // by summing notes per voice independently.
      const voiceDurations = new Map<string, number>();

      Array.from(measure.children).forEach((child) => {
        if (child.tagName !== 'note') return;
        if (child.querySelector('chord')) return; // chord notes share time

        const voice = getTextContent(child.querySelector('voice')) || '1';
        const staff = getTextContent(child.querySelector('staff')) || '1';
        const key = `${staff}-${voice}`;
        const dur = getIntContent(child.querySelector('duration'), 0);
        voiceDurations.set(key, (voiceDurations.get(key) ?? 0) + dur);
      });

      // Use voice 1 of staff 1 as the reference voice (treble melody)
      // Fall back to '1-' (no explicit staff tag) or the first key found.
      const refDuration =
        voiceDurations.get('1-1') ??
        voiceDurations.get('1-') ??
        (voiceDurations.size > 0 ? Array.from(voiceDurations.values())[0] : 0);

      // If the measure is already metrically complete — do nothing.
      const tolerance = Math.max(1, Math.round(expectedDuration * 0.03)); // 3% rounding buffer
      if (Math.abs(refDuration - expectedDuration) <= tolerance) return;

      const gap = expectedDuration - refDuration;

      if (gap > tolerance && gap <= expectedDuration) {
        // Measure is genuinely short — fill with a rest
        const restEl = createRestElement(xmlDoc, Math.round(gap), divisions);
        measure.appendChild(restEl);
        fixCount++;
        fixLog.push(`ห้อง ${measureNum}: เพิ่ม rest (duration=${Math.round(gap)}) เพื่อให้ครบห้อง (เติมจาก ${refDuration}/${expectedDuration})`);
      } else if (gap < -tolerance && Math.abs(gap) < expectedDuration) {
        // Overflow: trim the last note of voice 1
        const notes = measure.querySelectorAll('note');
        for (let i = notes.length - 1; i >= 0; i--) {
          const note = notes[i];
          if (note.querySelector('chord')) continue;
          const noteVoice = getTextContent(note.querySelector('voice')) || '1';
          const noteStaff = getTextContent(note.querySelector('staff')) || '1';
          if (noteStaff !== '1' || noteVoice !== '1') continue; // only fix voice 1
          const durEl = note.querySelector('duration');
          if (durEl) {
            const curDur = getIntContent(durEl, 0);
            const newDur = curDur + gap; // gap is negative
            if (newDur > 0) {
              durEl.textContent = newDur.toString();
              fixCount++;
              fixLog.push(`ห้อง ${measureNum}: ลด duration โน้ตสุดท้าย voice 1 จาก ${curDur} → ${newDur}`);
              break;
            }
          }
        }
      }
    });
  });

  return fixCount;
}


// ─── Fix: Orphan Ties ─────────────────────────────────────────────────────

function fixOrphanTies(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;

  // First pass: collect all tie starts and stops
  const tieStarts = new Map<string, Element[]>(); // pitchKey → [tie elements]
  const tieStops = new Map<string, Element[]>();

  const allNotes = xmlDoc.querySelectorAll('note');
  allNotes.forEach((note) => {
    const pitch = note.querySelector('pitch');
    if (!pitch) return;

    const step = getTextContent(pitch.querySelector('step'));
    const octave = getTextContent(pitch.querySelector('octave'));
    const alter = getTextContent(pitch.querySelector('alter')) || '0';
    const pitchKey = `${step}-${octave}-${alter}`;

    const ties = note.querySelectorAll('tie');
    ties.forEach((tie) => {
      const type = tie.getAttribute('type');
      if (type === 'start') {
        if (!tieStarts.has(pitchKey)) tieStarts.set(pitchKey, []);
        tieStarts.get(pitchKey)!.push(tie);
      } else if (type === 'stop') {
        if (!tieStops.has(pitchKey)) tieStops.set(pitchKey, []);
        tieStops.get(pitchKey)!.push(tie);
      }
    });
  });

  // Remove orphan tie starts (no matching stop)
  tieStarts.forEach((ties, pitchKey) => {
    const stops = tieStops.get(pitchKey) || [];
    // If more starts than stops, remove excess starts (from the end)
    const excess = ties.length - stops.length;
    if (excess > 0) {
      for (let i = ties.length - 1; i >= ties.length - excess; i--) {
        ties[i].parentElement?.removeChild(ties[i]);
        fixCount++;
        fixLog.push(`ลบ orphan tie start: ${pitchKey}`);
      }
    }
  });

  // Remove orphan tie stops (no matching start)
  tieStops.forEach((ties, pitchKey) => {
    const starts = tieStarts.get(pitchKey) || [];
    const excess = ties.length - starts.length;
    if (excess > 0) {
      for (let i = ties.length - 1; i >= ties.length - excess; i--) {
        ties[i].parentElement?.removeChild(ties[i]);
        fixCount++;
        fixLog.push(`ลบ orphan tie stop: ${pitchKey}`);
      }
    }
  });

  return fixCount;
}

// ─── Fix: Missing Defaults ────────────────────────────────────────────────

function fixMissingDefaults(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;

  // Fix missing divisions
  const divisions = xmlDoc.querySelector('divisions');
  if (!divisions) {
    const attributes = xmlDoc.querySelector('measure attributes');
    if (attributes) {
      const divEl = xmlDoc.createElement('divisions');
      divEl.textContent = '1';
      attributes.insertBefore(divEl, attributes.firstChild);
      fixCount++;
      fixLog.push('เพิ่ม <divisions>1</divisions> เป็นค่าเริ่มต้น');
    }
  }

  // Fix missing time signature
  const timeSig = xmlDoc.querySelector('time');
  const beats = xmlDoc.querySelector('beats');
  if (!timeSig && !beats) {
    const attributes = xmlDoc.querySelector('measure attributes');
    if (attributes) {
      const timeEl = xmlDoc.createElement('time');
      const beatsEl = xmlDoc.createElement('beats');
      beatsEl.textContent = '4';
      const btEl = xmlDoc.createElement('beat-type');
      btEl.textContent = '4';
      timeEl.appendChild(beatsEl);
      timeEl.appendChild(btEl);
      attributes.appendChild(timeEl);
      fixCount++;
      fixLog.push('เพิ่ม time signature 4/4 เป็นค่าเริ่มต้น');
    }
  }

  return fixCount;
}

// ─── Fix: Empty Measures ──────────────────────────────────────────────────

function fixEmptyMeasures(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;
  let divisions = 1;
  let beats = 4;
  let beatType = 4;

  const measures = xmlDoc.querySelectorAll('measure');
  measures.forEach((measure) => {
    const measureNum = measure.getAttribute('number') || '?';

    const divEl = measure.querySelector('attributes divisions');
    if (divEl) divisions = getIntContent(divEl, divisions);

    const beatsEl = measure.querySelector('attributes time beats');
    if (beatsEl) beats = getIntContent(beatsEl, beats);

    const btEl = measure.querySelector('attributes time beat-type');
    if (btEl) beatType = getIntContent(btEl, beatType);

    const notes = measure.querySelectorAll('note');
    if (notes.length === 0) {
      // Add a whole rest
      const wholeDuration = (beats * divisions * 4) / beatType;
      const restEl = createRestElement(xmlDoc, wholeDuration, divisions);
      measure.appendChild(restEl);
      fixCount++;
      fixLog.push(`ห้อง ${measureNum}: เพิ่ม whole rest ในห้องว่าง`);
    }
  });

  return fixCount;
}

// ─── Fix: Out-of-range values ─────────────────────────────────────────────

function fixOutOfRangeValues(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;

  // Fix octave out of range
  const pitches = xmlDoc.querySelectorAll('pitch');
  pitches.forEach((pitch) => {
    const octaveEl = pitch.querySelector('octave');
    if (octaveEl) {
      const octave = getIntContent(octaveEl, 4);
      if (octave < 0) {
        octaveEl.textContent = '0';
        fixCount++;
        fixLog.push(`แก้ octave จาก ${octave} เป็น 0`);
      } else if (octave > 8) {
        octaveEl.textContent = '8';
        fixCount++;
        fixLog.push(`แก้ octave จาก ${octave} เป็น 8`);
      }
    }

    // Fix alter out of range
    const alterEl = pitch.querySelector('alter');
    if (alterEl) {
      const alter = getIntContent(alterEl, 0);
      if (alter < -2) {
        alterEl.textContent = '-2';
        fixCount++;
        fixLog.push(`แก้ alter จาก ${alter} เป็น -2`);
      } else if (alter > 2) {
        alterEl.textContent = '2';
        fixCount++;
        fixLog.push(`แก้ alter จาก ${alter} เป็น 2`);
      }
    }
  });

  // Fix fifths out of range
  const fifthsEls = xmlDoc.querySelectorAll('fifths');
  fifthsEls.forEach((fifthsEl) => {
    const fifths = getIntContent(fifthsEl, 0);
    if (fifths < -7) {
      fifthsEl.textContent = '-7';
      fixCount++;
      fixLog.push(`แก้ key signature fifths จาก ${fifths} เป็น -7`);
    } else if (fifths > 7) {
      fifthsEl.textContent = '7';
      fixCount++;
      fixLog.push(`แก้ key signature fifths จาก ${fifths} เป็น 7`);
    }
  });

  return fixCount;
}

// ─── Fix: Strip Original Lyrics (Memolody = melody-first) ──────────────────

/**
 * Solfege patterns that should be KEPT (not stripped).
 * These are note name labels injected by Memolody's own solfege system.
 */
const SOLFEGE_PATTERNS = /^(Do|Re|Mi|Fa|Sol|La|Si|Ti|Ut|do|re|mi|fa|sol|la|si|ti|ut|โด|เร|มี|ฟา|ซอล|ลา|ที|ซี|C|D|E|F|G|A|B|[1-7]|\d+[#b]?)$/;

function stripOriginalLyrics(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;
  const lyrics = xmlDoc.querySelectorAll('lyric');

  const toRemove: Element[] = [];

  lyrics.forEach((lyric) => {
    const textEl = lyric.querySelector('text');
    const text = getTextContent(textEl);

    // Keep solfege note names (injected by Memolody)
    if (SOLFEGE_PATTERNS.test(text.trim())) {
      return; // This is a note name, keep it
    }

    // This is an original lyric from the score — mark for removal
    toRemove.push(lyric);
  });

  // Remove all marked lyrics
  toRemove.forEach((lyric) => {
    lyric.parentElement?.removeChild(lyric);
    fixCount++;
  });

  if (fixCount > 0) {
    fixLog.push(`ตัดเนื้อเพลงออก ${fixCount} จุด (Memolody เน้นทำนอง/ชื่อโน้ต — ผู้ใช้สามารถเพิ่มเนื้อเพลงทีหลังได้)`);
  }

  return fixCount;
}

// ─── Fix: Missing Tempo ───────────────────────────────────────────────

function fixMissingTempo(xmlDoc: Document, fixLog: string[]): number {
  const soundEl = xmlDoc.querySelector('sound[tempo]');
  const perMinuteEl = xmlDoc.querySelector('per-minute');

  if (soundEl || perMinuteEl) return 0; // Already has tempo

  // Add <sound tempo="120"/> to the first measure
  const firstMeasure = xmlDoc.querySelector('measure');
  if (firstMeasure) {
    const sound = xmlDoc.createElement('sound');
    sound.setAttribute('tempo', '120');
    // Insert after attributes if present, else at beginning
    const attrs = firstMeasure.querySelector('attributes');
    if (attrs && attrs.nextSibling) {
      firstMeasure.insertBefore(sound, attrs.nextSibling);
    } else {
      firstMeasure.insertBefore(sound, firstMeasure.firstChild);
    }
    fixLog.push('เพิ่ม tempo 120 BPM เป็นค่าเริ่มต้น');
    return 1;
  }

  return 0;
}

// ─── Fix: Auto-Beaming (Group eighth/16th notes per time signature) ──────

/**
 * Standard beam grouping rules per time signature.
 * Each entry defines how many divisions per beam group.
 *
 * Rules for Level-1 beam (8th-note level):
 *   4/4 → half-bar groups (beats 1-2, beats 3-4)  — max 4 eighths per group
 *   3/4 → per beat                                — max 2 eighths per group
 *   2/4 → per beat                                — max 2 eighths per group
 *   6/8 → 3+3 dotted-quarter groups
 *   2/2 → per half-note beat
 *   3/8 → whole bar
 *   9/8 → 3+3+3
 *   12/8 → 3+3+3+3
 *
 * Rules for Level-2 beam (16th-note level):
 *   Always break at EVERY beat boundary (use getBeatBoundaries).
 *   Max 4 sixteenth notes per beat.
 *
 * NEVER beam across barlines.
 */
function getBeamGroupBoundaries(beats: number, beatType: number, divisions: number): number[] {
  const quarterDuration = divisions;
  let groupSizes: number[] = [];

  if (beatType === 4) {
    if (beats === 4) {
      // 4/4: half-bar groups (2 beats each) — up to 4 eighths per group
      groupSizes = [quarterDuration * 2, quarterDuration * 2];
    } else if (beats === 2) {
      // 2/4: whole-bar groups (2 beats total) — up to 4 eighths per group
      groupSizes = [quarterDuration * 2];
    } else {
      // 3/4, others: per beat
      for (let i = 0; i < beats; i++) groupSizes.push(quarterDuration);
    }
  } else if (beatType === 8) {
    const eighthDuration = quarterDuration / 2;
    if (beats === 6)  groupSizes = [eighthDuration * 3, eighthDuration * 3];
    else if (beats === 3)  groupSizes = [eighthDuration * 3];
    else if (beats === 9)  groupSizes = [eighthDuration * 3, eighthDuration * 3, eighthDuration * 3];
    else if (beats === 12) groupSizes = [eighthDuration * 3, eighthDuration * 3, eighthDuration * 3, eighthDuration * 3];
    else { for (let i = 0; i < beats; i++) groupSizes.push(eighthDuration); }
  } else if (beatType === 2) {
    for (let i = 0; i < beats; i++) groupSizes.push(quarterDuration * 2);
  } else {
    const beatDuration = (quarterDuration * 4) / beatType;
    for (let i = 0; i < beats; i++) groupSizes.push(beatDuration);
  }

  const boundaries: number[] = [];
  let cumulative = 0;
  for (const size of groupSizes) { cumulative += size; boundaries.push(cumulative); }
  return boundaries;
}

/**
 * Per-beat boundaries — used for Level-2 (16th-note) beam grouping.
 * 16th notes ALWAYS break at every beat boundary regardless of time signature.
 *   4/4 → [16, 32, 48, 64]  (1 beat = 1 quarter = 4 sixteenth notes)
 *   3/4 → [16, 32, 48]
 *   2/4 → [16, 32]
 *   6/8 → [12, 24]          (1 dotted-quarter beat = 3 eighths = 6 sixteenth notes)
 */
function getBeatBoundaries(beats: number, beatType: number, divisions: number): number[] {
  const quarterDuration = divisions;
  const boundaries: number[] = [];

  if (beatType === 8) {
    // Compound meter: beat = dotted quarter = 3 eighths = 6 sixteenths
    const compoundBeatDur = quarterDuration * 3 / 2; // dotted quarter
    const numBeats = Math.round(beats / 3);
    for (let i = 1; i <= numBeats; i++) boundaries.push(compoundBeatDur * i);
  } else {
    // Simple meter: beat = 4/beatType quarter-notes
    const beatDur = (quarterDuration * 4) / beatType;
    for (let i = 1; i <= beats; i++) boundaries.push(beatDur * i);
  }

  return boundaries;
}

/** Note types that should be beamed (eighth and shorter) */
const BEAMABLE_TYPES = new Set(['eighth', '16th', '32nd', '64th', '128th']);

// ─── Fix: Missing Note Types (infer from duration + divisions) ─────────────

/**
 * Oemer sometimes outputs notes with <duration> but no <type>.
 * Without <type>, beaming and visual rendering break completely.
 * This function infers the type from the duration/divisions ratio.
 */
function fixMissingNoteTypes(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;
  const parts = xmlDoc.querySelectorAll('part');

  parts.forEach(part => {
    let divisions = 1;
    part.querySelectorAll('measure').forEach(measure => {
      const divEl = measure.querySelector('attributes divisions');
      if (divEl) divisions = Math.max(1, getIntContent(divEl, divisions));

      measure.querySelectorAll('note').forEach(note => {
        // Skip if type already set
        if (note.querySelector('type')) return;

        const duration = getIntContent(note.querySelector('duration'), 0);
        if (duration <= 0) return;

        // Infer type from duration relative to divisions (quarter = 1 division)
        const ratio = duration / divisions;
        let inferredType = '';
        if (ratio >= 4)       inferredType = 'whole';
        else if (ratio >= 3)  inferredType = 'half'; // dotted half
        else if (ratio >= 2)  inferredType = 'half';
        else if (ratio >= 1.5) inferredType = 'quarter'; // dotted quarter
        else if (ratio >= 1)  inferredType = 'quarter';
        else if (ratio >= 0.75) inferredType = 'eighth'; // dotted eighth
        else if (ratio >= 0.5) inferredType = 'eighth';
        else if (ratio >= 0.25) inferredType = '16th';
        else if (ratio >= 0.125) inferredType = '32nd';
        else inferredType = '64th';

        // Insert <type> after <duration>
        const durationEl = note.querySelector('duration');
        if (durationEl) {
          const typeEl = xmlDoc.createElement('type');
          typeEl.textContent = inferredType;
          durationEl.parentNode?.insertBefore(typeEl, durationEl.nextSibling);
          fixCount++;
        }
      });
    });
  });

  if (fixCount > 0) {
    fixLog.push(`อนุมานชนิดโน้ต (type) จาก duration สำหรับ ${fixCount} โน้ต (แก้ beaming)`);
  }
  return fixCount;
}

export function fixBeaming(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;
  const parts = xmlDoc.querySelectorAll('part');

  parts.forEach((part) => {
    let divisions = 1;
    let beats = 4;
    let beatType = 4;

    const measures = part.querySelectorAll('measure');
    measures.forEach((measure) => {
      // Update divisions/time signature from attributes
      const divEl = measure.querySelector('attributes divisions');
      if (divEl) divisions = getIntContent(divEl, divisions);
      const beatsEl = measure.querySelector('attributes time beats');
      if (beatsEl) beats = getIntContent(beatsEl, beats);
      const btEl = measure.querySelector('attributes time beat-type');
      if (btEl) beatType = getIntContent(btEl, beatType);

      // ── Level-1 boundaries: 8th-note beam groups (per time sig) ──
      const boundaries = getBeamGroupBoundaries(beats, beatType, divisions);
      // ── Level-2 boundaries: 16th-note beam groups (always per beat) ──
      const beatBoundaries = getBeatBoundaries(beats, beatType, divisions);

      const getGroupIdx = (pos: number, bounds: number[]): number => {
        for (let g = 0; g < bounds.length; g++) {
          if (pos < bounds[g]) return g;
        }
        return bounds.length - 1;
      };

      // Track beam groups per staff-voice
      const currentGroups: Record<string, Element[]> = {};
      const lastL1Idx: Record<string, number> = {};
      const lastL2Idx: Record<string, number> = {};

      let currentPosition = 0;
      const children = Array.from(measure.children);
      let activeStaff = '1';

      for (const child of children) {
        if (child.tagName === 'attributes') {
          const clef = child.querySelector('clef');
          if (clef) { const s = clef.getAttribute('number'); if (s) activeStaff = s; }
        }

        if (child.tagName === 'note') {
          const isChord = child.querySelector('chord') !== null;
          const isRest = child.querySelector('rest') !== null;
          const duration = getIntContent(child.querySelector('duration'), 0);
          const noteType = getTextContent(child.querySelector('type'));
          const isBeamable = BEAMABLE_TYPES.has(noteType);
          const is16th = ['16th', '32nd', '64th'].includes(noteType);

          // Staff detection (robust fallback)
          let staff = getTextContent(child.querySelector('staff'));
          if (!staff) {
            const voice = getTextContent(child.querySelector('voice'));
            if (voice === '5' || voice === '6') {
              staff = '2';
            } else {
              const pitchEl = child.querySelector('pitch');
              if (pitchEl) {
                const step = getTextContent(pitchEl.querySelector('step'));
                const octave = getIntContent(pitchEl.querySelector('octave'), 4);
                staff = (octave < 4 || (octave === 4 && step === 'B' && getTextContent(pitchEl.querySelector('alter')) === '-1'))
                  ? '2' : activeStaff;
              } else { staff = activeStaff; }
            }
          }

          const voice = getTextContent(child.querySelector('voice')) || '1';
          const key = `${staff}-${voice}`;

          const l1Idx = getGroupIdx(currentPosition, boundaries);
          const l2Idx = getGroupIdx(currentPosition, beatBoundaries);

          if (isBeamable && !isRest && !isChord) {
            // Determine if we need to break the current group:
            // For 8th notes: break at level-1 (half-bar) boundaries
            // For 16th notes: also break at level-2 (per-beat) boundaries
            const l1Changed = lastL1Idx[key] !== undefined && lastL1Idx[key] !== l1Idx;
            const l2Changed = is16th && lastL2Idx[key] !== undefined && lastL2Idx[key] !== l2Idx;
            const needsNewGroup = !currentGroups[key] || l1Changed || l2Changed;

            if (needsNewGroup) {
              if (currentGroups[key]) {
                applyBeamingToGroup(xmlDoc, currentGroups[key]);
                fixCount++;
              }
              currentGroups[key] = [child];
            } else {
              currentGroups[key].push(child);
            }
            lastL1Idx[key] = l1Idx;
            lastL2Idx[key] = l2Idx;
          } else {
            if (!isChord && currentGroups[key]) {
              applyBeamingToGroup(xmlDoc, currentGroups[key]);
              fixCount++;
              delete currentGroups[key];
              delete lastL1Idx[key];
              delete lastL2Idx[key];
            }
          }

          if (!isChord) currentPosition += duration;

        } else if (child.tagName === 'forward') {
          currentPosition += getIntContent(child.querySelector('duration'), 0);
          Object.keys(currentGroups).forEach(k => {
            applyBeamingToGroup(xmlDoc, currentGroups[k]); fixCount++;
            delete currentGroups[k]; delete lastL1Idx[k]; delete lastL2Idx[k];
          });
        } else if (child.tagName === 'backup') {
          currentPosition -= getIntContent(child.querySelector('duration'), 0);
          Object.keys(currentGroups).forEach(k => {
            applyBeamingToGroup(xmlDoc, currentGroups[k]); fixCount++;
            delete currentGroups[k]; delete lastL1Idx[k]; delete lastL2Idx[k];
          });
        }
      }

      // Finalize remaining groups at end of measure
      Object.keys(currentGroups).forEach(k => {
        applyBeamingToGroup(xmlDoc, currentGroups[k]);
        fixCount++;
      });
    });
  });

  if (fixCount > 0) {
    fixLog.push(`ปรับปรุง Beaming ใหม่ใน ${fixCount} จุด (Level-1: half-bar, Level-2: per-beat, Hooks: ✅)`);
  }

  return fixCount;
}


/**
 * Apply MusicXML beam tags to a sequence of notes.
 *
 * Level-1 beam: always begin/continue/end across the whole group.
 * Level-2 beam (16th): uses hook notation for isolated 16ths between 8th notes.
 *   - Run of consecutive 16ths → begin/continue/end within the run.
 *   - Single 16th preceded by an 8th → 'backward hook'.
 *   - Single 16th followed by an 8th → 'forward hook'.
 * Level-3 beam (32nd): same logic applied within runs of 32nd notes.
 */
function applyBeamingToGroup(xmlDoc: Document, group: Element[]) {
  if (group.length < 2) {
    group.forEach(note => note.querySelectorAll('beam').forEach(b => b.parentElement?.removeChild(b)));
    return;
  }

  // Pre-compute note types for the whole group
  const types = group.map(n => getTextContent(n.querySelector('type')));

  // Helper: find consecutive runs of a min type level within the group
  // Returns array of [startIdx, endIdx] (inclusive) for each run
  function getRuns(minType: string): [number, number][] {
    const isTarget = (t: string) =>
      minType === '16th' ? ['16th','32nd','64th'].includes(t) :
      minType === '32nd' ? ['32nd','64th'].includes(t) : false;
    const runs: [number, number][] = [];
    let start = -1;
    for (let i = 0; i <= types.length; i++) {
      const inRun = i < types.length && isTarget(types[i]);
      if (inRun && start === -1) start = i;
      else if (!inRun && start !== -1) { runs.push([start, i - 1]); start = -1; }
    }
    return runs;
  }

  const runs16 = getRuns('16th');
  const runs32 = getRuns('32nd');

  group.forEach((note, i) => {
    // Clear existing beams
    note.querySelectorAll('beam').forEach(b => b.parentElement?.removeChild(b));

    const insertBeam = (el: Element) => {
      note.appendChild(el);
    };

    // ── Level 1 (eighth beam — spans whole group) ──
    const beam1 = xmlDoc.createElement('beam');
    beam1.setAttribute('number', '1');
    beam1.textContent = i === 0 ? 'begin' : i === group.length - 1 ? 'end' : 'continue';
    insertBeam(beam1);

    // ── Level 2 (16th beam — per run, with hooks for isolated notes) ──
    const noteType = types[i];
    if (noteType === '16th' || noteType === '32nd' || noteType === '64th') {
      const run = runs16.find(([s, e]) => i >= s && i <= e);
      const beam2 = xmlDoc.createElement('beam');
      beam2.setAttribute('number', '2');

      if (!run) {
        // Safety fallback — should not happen, but guard against it
        beam2.textContent = i === 0 ? 'begin' : i === group.length - 1 ? 'end' : 'continue';
      } else {
        const [rs, re] = run;
        const runLen = re - rs + 1;
        const posInRun = i - rs;

        if (runLen === 1) {
          // Isolated 16th — decide hook direction
          const prevIs8th = i > 0 && types[i - 1] === 'eighth';
          const nextIs8th = i < types.length - 1 && types[i + 1] === 'eighth';
          if (prevIs8th && !nextIs8th) beam2.textContent = 'backward hook';
          else if (nextIs8th && !prevIs8th) beam2.textContent = 'forward hook';
          else beam2.textContent = prevIs8th ? 'backward hook' : 'forward hook';
        } else {
          beam2.textContent = posInRun === 0 ? 'begin' : posInRun === runLen - 1 ? 'end' : 'continue';
        }
      }
      beam1.parentNode?.insertBefore(beam2, beam1.nextSibling);

      // ── Level 3 (32nd beam) ──
      if (noteType === '32nd' || noteType === '64th') {
        const run3 = runs32.find(([s, e]) => i >= s && i <= e);
        const beam3 = xmlDoc.createElement('beam');
        beam3.setAttribute('number', '3');

        if (!run3) {
          beam3.textContent = i === 0 ? 'begin' : i === group.length - 1 ? 'end' : 'continue';
        } else {
          const [rs3, re3] = run3;
          const runLen3 = re3 - rs3 + 1;
          const posInRun3 = i - rs3;
          if (runLen3 === 1) {
            const prevIs16 = i > 0 && types[i - 1] === '16th';
            beam3.textContent = prevIs16 ? 'backward hook' : 'forward hook';
          } else {
            beam3.textContent = posInRun3 === 0 ? 'begin' : posInRun3 === runLen3 - 1 ? 'end' : 'continue';
          }
        }
        beam2.parentNode?.insertBefore(beam3, beam2.nextSibling);
      }
    }

  });
}

// ─── Fix: Clean Metadata Titles ───────────────────────────────────────────

function fixMetadataTitles(xmlDoc: Document, fixLog: string[]): number {
  const workTitle = xmlDoc.querySelector('work-title');
  const moveTitle = xmlDoc.querySelector('movement-title');
  const creditWords = xmlDoc.querySelectorAll('credit-words');

  let titleFound = false;
  let cleanedTitle = '';

  // Function to clean a title string
  const clean = (t: string) => {
    return t.replace(/PAGE-\d+(_ENHANCED)?/gi, '')
            .replace(/\.png|\.jpg|\.pdf/gi, '')
            .replace(/_/g, ' ')
            .trim();
  };

  [workTitle, moveTitle].forEach(el => {
    if (el) {
      const original = getTextContent(el);
      const cleaned = clean(original);
      if (cleaned !== original) {
        el.textContent = cleaned;
        if (cleaned) {
          cleanedTitle = cleaned;
          titleFound = true;
        }
      } else if (cleaned) {
        cleanedTitle = cleaned;
        titleFound = true;
      }
    }
  });

  // If title is still missing or generic, try to find it in credit-words (usually top of page)
  if (!cleanedTitle || cleanedTitle.length < 3) {
    creditWords.forEach(cw => {
      const text = getTextContent(cw);
      // Heuristic: titles are usually long, centered, and near top
      if (text.length > 3 && !text.includes('Transcribed') && !text.includes('ScoreLens')) {
        const potential = clean(text);
        if (potential.length > 3 && !titleFound) {
          // Create work-title if missing
          let work = xmlDoc.querySelector('work');
          if (!work) {
            work = xmlDoc.createElement('work');
            xmlDoc.documentElement.insertBefore(work, xmlDoc.documentElement.firstChild);
          }
          let wt = work.querySelector('work-title');
          if (!wt) {
            wt = xmlDoc.createElement('work-title');
            work.appendChild(wt);
          }
          wt.textContent = potential;
          cleanedTitle = potential;
          titleFound = true;
          fixLog.push(`ตั้งชื่อเพลงใหม่จากข้อความในโน้ต: "${potential}"`);
        }
      }
    });
  }

  if (titleFound && cleanedTitle) {
    fixLog.push(`ล้างชื่อเพลงให้สะอาด: "${cleanedTitle}"`);
    return 1;
  }

  return 0;
}


// ─── Fix: Time Signature Auto-Correction (Aggressive Vote-Based Analysis) ──

function fixTimeSignature(xmlDoc: Document, fixLog: string[]): number {
  const parts = xmlDoc.querySelectorAll('part');
  let fixCount = 0;

  parts.forEach(part => {
    const measures = part.querySelectorAll('measure');
    if (measures.length < 2) return;

    let divisions = 1;
    const quarterBeatsPerMeasure: number[] = [];

    // Scan ALL measures and collect their note content in quarter-beat units
    measures.forEach(measure => {
      const divEl = measure.querySelector('attributes divisions');
      if (divEl) divisions = Math.max(1, getIntContent(divEl, divisions));

      // ⭐ KEY FIX: Count per-voice separately, then use MAX voice duration.
      // Old approach summed ALL voices: piano 2 voices × 3 beats = 6 beats → wrong!
      // New approach: max voice = 3 beats → correctly detects 3/4.
      const voiceDurs: Record<string, number> = {};
      measure.querySelectorAll('note').forEach(note => {
        if (note.querySelector('rest')) return;
        if (note.querySelector('chord')) return;
        const voice = getTextContent(note.querySelector('voice')) || '1';
        const dur = getIntContent(note.querySelector('duration'), 0);
        voiceDurs[voice] = (voiceDurs[voice] || 0) + dur;
      });
      const maxVoiceDur = Object.values(voiceDurs).reduce((m, v) => Math.max(m, v), 0);
      if (maxVoiceDur > 0 && divisions > 0) {
        quarterBeatsPerMeasure.push(maxVoiceDur / divisions);
      }
    });

    if (quarterBeatsPerMeasure.length < 2) return;

    // Vote: round each measure length to nearest 0.5 quarter beats
    const voteCounts: Record<string, number> = {};
    quarterBeatsPerMeasure.forEach(q => {
      const rounded = (Math.round(q * 2) / 2).toFixed(1);
      voteCounts[rounded] = (voteCounts[rounded] || 0) + 1;
    });

    // Find winner
    const winnerKey = Object.keys(voteCounts).reduce((a, b) =>
      voteCounts[a] > voteCounts[b] ? a : b
    );
    const commonQuarters = parseFloat(winnerKey);
    const confidence = voteCounts[winnerKey] / quarterBeatsPerMeasure.length;

    // 🔍 DIAGNOSTIC LOG
    console.log(`[fixTimeSig] votes=${JSON.stringify(voteCounts)} winner=${winnerKey}q confidence=${(confidence*100).toFixed(0)}%`);
    console.log(`[fixTimeSig] sample beats: [${quarterBeatsPerMeasure.slice(0,8).map(v=>v.toFixed(2)).join(', ')}]`);

    // Only fix if confidence >= 50%
    if (confidence < 0.5) {
      console.log(`[fixTimeSig] LOW confidence — skipping fix`);
      return;
    }

    // Map quarter-beat count → time signature
    let detectedBeats = 0;
    let detectedBeatType = 4;
    if (Math.abs(commonQuarters - 2) <= 0.3)        { detectedBeats = 2; detectedBeatType = 4; } // 2/4
    else if (Math.abs(commonQuarters - 3) <= 0.3)   { detectedBeats = 3; detectedBeatType = 4; } // 3/4
    else if (Math.abs(commonQuarters - 4) <= 0.3)   { detectedBeats = 4; detectedBeatType = 4; } // 4/4
    else if (Math.abs(commonQuarters - 1.5) <= 0.3) { detectedBeats = 3; detectedBeatType = 8; } // 3/8
    else if (Math.abs(commonQuarters - 2) <= 0.3)   { detectedBeats = 6; detectedBeatType = 8; } // 6/8

    if (detectedBeats === 0) return;

    // Get current stated time signature
    const allTimeEls = Array.from(part.querySelectorAll('attributes time'));
    if (allTimeEls.length === 0) return;

    const firstBeatsEl = allTimeEls[0].querySelector('beats');
    const firstBeatTypeEl = allTimeEls[0].querySelector('beat-type');
    if (!firstBeatsEl || !firstBeatTypeEl) return;

    const currentBeats = getIntContent(firstBeatsEl, 4);
    const currentBeatType = getIntContent(firstBeatTypeEl, 4);

    // Apply fix if different
    if (currentBeats !== detectedBeats || currentBeatType !== detectedBeatType) {
      allTimeEls.forEach(timeEl => {
        const bEl = timeEl.querySelector('beats');
        const btEl = timeEl.querySelector('beat-type');
        if (bEl) bEl.textContent = String(detectedBeats);
        if (btEl) btEl.textContent = String(detectedBeatType);
      });
      fixCount++;
      fixLog.push(
        `แก้ Time Signature จาก ${currentBeats}/${currentBeatType} เป็น ${detectedBeats}/${detectedBeatType} ` +
        `(วิเคราะห์จาก ${voteCounts[winnerKey]}/${quarterBeatsPerMeasure.length} ห้อง, ความแม่นยำ ${Math.round(confidence * 100)}%)`
      );
    }
  });

  return fixCount;
}

// ─── Main Auto-Fixer ──────────────────────────────────────────────────────

/**
 * Attempt automatic fixes on a MusicXML string based on validation errors.
 * Returns the corrected XML and a log of changes.
 */
export function autoFixMusicXml(
  xmlString: string,
  _errors?: ValidationError[]
): FixResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse errors
  if (xmlDoc.querySelector('parsererror')) {
    return { xml: xmlString, fixCount: 0, fixLog: ['XML parse error — ไม่สามารถแก้ไขได้'] };
  }

  const fixLog: string[] = [];
  let totalFixes = 0;

  // Apply fixes in order of priority
  console.log('[AutoFixer] Starting auto-fix...');

  // 1. Fix missing defaults first (divisions, time sig placeholders)
  totalFixes += fixMissingDefaults(xmlDoc, fixLog);

  // 2. Fix missing tempo
  totalFixes += fixMissingTempo(xmlDoc, fixLog);

  // 3. Fix out-of-range values
  totalFixes += fixOutOfRangeValues(xmlDoc, fixLog);

  // 4. Fix orphan ties
  totalFixes += fixOrphanTies(xmlDoc, fixLog);

  // 5. ⭐ CRITICAL: Auto-correct Time Signature FIRST — before any duration/rest processing
  //    Oemer defaults to 4/4 — if we run fixDurationGaps with 4/4, it adds phantom rests!
  totalFixes += fixTimeSignature(xmlDoc, fixLog);

  // 6. Fix empty measures (uses now-correct time sig)
  totalFixes += fixEmptyMeasures(xmlDoc, fixLog);

  // 7. Fix duration gaps — add/trim rests based on CORRECT time sig (not Oemer's 4/4)
  totalFixes += fixDurationGaps(xmlDoc, fixLog);

  // 8. Strip original lyrics
  totalFixes += stripOriginalLyrics(xmlDoc, fixLog);

  // 9. Infer missing note types from duration (MUST be before beaming)
  totalFixes += fixMissingNoteTypes(xmlDoc, fixLog);

  // 10. Auto-beam eighth/16th notes according to correct time signature rules
  // DISABLED: Malformed beams cause OSMD to silently fail to render.
  // totalFixes += fixBeaming(xmlDoc, fixLog);

  // 11. Clean metadata titles
  totalFixes += fixMetadataTitles(xmlDoc, fixLog);

  // 12. Fix accidental visibility (♯/♭ signs)
  totalFixes += fixAccidentalVisibility(xmlDoc, fixLog);

  // 13. Fix missing alters by key signature
  totalFixes += fixMissingAltersByKeySignature(xmlDoc, fixLog);

  console.log(`[AutoFixer] Applied ${totalFixes} fixes`);
  fixLog.forEach(log => console.log(`  → ${log}`));

  // Serialize back to string
  const serializer = new XMLSerializer();
  let fixedXml = serializer.serializeToString(xmlDoc).replace(/ xmlns="[^"]*"/g, '');

  // Ensure XML declaration
  if (!fixedXml.startsWith('<?xml')) {
    fixedXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + fixedXml;
  }

  // Clean up empty xmlns
  fixedXml = fixedXml.replace(/ xmlns=""/g, '');

  return {
    xml: fixedXml,
    fixCount: totalFixes,
    fixLog,
  };
}

// ─── Fix: Accidental Visibility ───────────────────────────────────────────

function fixAccidentalVisibility(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;
  const notes = xmlDoc.querySelectorAll('note');

  notes.forEach((note) => {
    const pitch = note.querySelector('pitch');
    if (!pitch) return;

    const alterEl = pitch.querySelector('alter');
    if (alterEl) {
      const alter = parseInt(alterEl.textContent || '0');
      if (alter !== 0) {
        // Check if accidental tag already exists
        let accEl = note.querySelector('accidental');
        if (!accEl) {
          accEl = xmlDoc.createElement('accidental');
          accEl.textContent = alter === 1 ? 'sharp' : alter === -1 ? 'flat' : alter === 2 ? 'double-sharp' : alter === -2 ? 'flat-flat' : 'natural';
          
          // Insert after pitch
          pitch.parentNode?.insertBefore(accEl, pitch.nextSibling);
          fixCount++;
        }
      }
    }
  });

  if (fixCount > 0) {
    fixLog.push(`เพิ่มป้ายสัญลักษณ์ Accidental (♯/♭) ให้ชัดเจน ${fixCount} จุด`);
  }
  return fixCount;
}

// ─── Fix: Missing Alters By Key Signature ─────────────────────────────────

function fixMissingAltersByKeySignature(xmlDoc: Document, fixLog: string[]): number {
  let fixCount = 0;
  const parts = xmlDoc.querySelectorAll('part');
  
  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

  const globalFifthsNode = xmlDoc.querySelector('fifths');
  const globalFifths = globalFifthsNode ? parseInt(globalFifthsNode.textContent || '0') : 0;

  parts.forEach(part => {
    let currentFifths = globalFifths;
    
    part.querySelectorAll('measure').forEach(measure => {
      // Update key signature
      const fifthsNode = measure.querySelector('key fifths');
      if (fifthsNode) {
        currentFifths = parseInt(fifthsNode.textContent || '0');
      }

      // If no sharps or flats, skip alter enforcement
      if (currentFifths === 0) return;

      measure.querySelectorAll('note').forEach(note => {
        const pitch = note.querySelector('pitch');
        if (!pitch) return;
        
        const stepNode = pitch.querySelector('step');
        if (!stepNode) return;
        const step = stepNode.textContent || '';
        
        
        const alterNode = pitch.querySelector('alter');
        const accidentalNode = note.querySelector('accidental');
        
        // If there is an accidental but no alter, inject the alter based on the accidental
        if (!alterNode && accidentalNode) {
          const accText = accidentalNode.textContent?.toLowerCase() || '';
          let accAlter = 0;
          if (accText === 'sharp') accAlter = 1;
          else if (accText === 'flat') accAlter = -1;
          else if (accText === 'double-sharp') accAlter = 2;
          else if (accText === 'flat-flat') accAlter = -2;
          
          if (accAlter !== 0 || accText === 'natural') {
            const newAlter = xmlDoc.createElement('alter');
            newAlter.textContent = accAlter.toString();
            pitch.insertBefore(newAlter, stepNode.nextSibling);
            fixCount++;
          }
          return; // Skip key signature inference since explicit accidental is present
        }

        // If there's an explicit alter, don't overwrite it
        if (alterNode) return;

        // Determine expected alter from key signature
        let expectedAlter = 0;
        if (currentFifths > 0) {
          for (let i = 0; i < currentFifths && i < 7; i++) {
            if (SHARP_ORDER[i] === step) expectedAlter = 1;
          }
        } else if (currentFifths < 0) {
          const numFlats = Math.abs(currentFifths);
          for (let i = 0; i < numFlats && i < 7; i++) {
            if (FLAT_ORDER[i] === step) expectedAlter = -1;
          }
        }

        if (expectedAlter !== 0) {
          const newAlter = xmlDoc.createElement('alter');
          newAlter.textContent = expectedAlter.toString();
          // Insert alter after step (and before octave if present)
          pitch.insertBefore(newAlter, stepNode.nextSibling);
          fixCount++;
        }
      });
    });
  });

  if (fixCount > 0) {
    fixLog.push(`เติมค่า alter (♯/♭) ให้โน้ตที่ขาดหายไปตาม Key Signature จำนวน ${fixCount} จุด`);
  }

  return fixCount;
}
