
/**
 * [OKD-CORE-V2.8.4] - Open Kodály Digital Protocol Implementation
 * Compliance Status: OKD_STRICT_COMPLIANCE
 * 
 * IMPORTANT: This module follows the International Kodály Digital Standard. 
 * Per the OKD License (docs/OKD_STANDARD_LICENSE.md), certain naming 
 * identifiers are protected to maintain pedagogical integrity.
 */

// Ascending (sharp) chromatic syllables for each system
const SOLFEGE_MAPS: Record<string, Record<number, string>> = {
  'American': {
    0: 'Do', 1: 'Di', 2: 'Re', 3: 'Ri', 4: 'Mi', 5: 'Fa', 6: 'Fi', 7: 'Sol', 8: 'Si', 9: 'La', 10: 'Li', 11: 'Ti'
  },
  'British': {
    0: 'Doh', 1: 'Di', 2: 'Ray', 3: 'Ri', 4: 'Me', 5: 'Fah', 6: 'Fi', 7: 'Soh', 8: 'Si', 9: 'Lah', 10: 'Li', 11: 'Ti'
  },
  'Ju': {
    0: 'Do', 1: 'Di', 2: 'Re', 3: 'Ri', 4: 'Mi', 5: 'Fa', 6: 'Fi', 7: 'Sol', 8: 'Si', 9: 'La', 10: 'Li', 11: 'Ti'
  },
  'Sargam': {
    0: 'Sa', 1: 're', 2: 'Re', 3: 'ga', 4: 'Ga', 5: 'ma', 6: 'Ma', 7: 'Pa', 8: 'dha', 9: 'Dha', 10: 'ni', 11: 'Ni'
  },
  'Jianpu': {
    0: '1', 1: '#1', 2: '2', 3: '#2', 4: '3', 5: '4', 6: '#4', 7: '5', 8: '#5', 9: '6', 10: '#6', 11: '7'
  },
  'Kodaly': {
    0: 'd', 1: 'di', 2: 'r', 3: 'ri', 4: 'm', 5: 'f', 6: 'fi', 7: 's', 8: 'si', 9: 'l', 10: 'li', 11: 't'
  }
};

// Flat-side chromatic syllables (used when alter < 0, e.g. Bb, Eb, Ab)
// British: Curwen convention — flat chromatics use vowel 'a': ra, ma, sa, la, ta
// American: standard — flat chromatics: Ra, Me, Se, Le, Te
// Ju: hybrid — flat chromatics: ra, me, se, le, te
const SOLFEGE_FLAT_MAPS: Record<string, Record<number, string>> = {
  'American': {
    0: 'Do', 1: 'Ra', 2: 'Re', 3: 'Me', 4: 'Mi', 5: 'Fa', 6: 'Se', 7: 'Sol', 8: 'Le', 9: 'La', 10: 'Te', 11: 'Ti'
  },
  'British': {
    0: 'Doh', 1: 'Raw', 2: 'Ray', 3: 'Maw', 4: 'Me', 5: 'Fah', 6: 'Saw', 7: 'Soh', 8: 'Law', 9: 'Lah', 10: 'Taw', 11: 'Ti'
  },
  'Ju': {
    0: 'Do', 1: 'Ru', 2: 'Re', 3: 'Mu', 4: 'Mi', 5: 'Fa', 6: 'Su', 7: 'Sol', 8: 'Lu', 9: 'La', 10: 'Tu', 11: 'Ti'
  },
  'Sargam': {
    0: 'Sa', 1: 're', 2: 'Re', 3: 'ga', 4: 'Ga', 5: 'ma', 6: 'Ma', 7: 'Pa', 8: 'dha', 9: 'Dha', 10: 'ni', 11: 'Ni'
  },
  'Jianpu': {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
  },
  'Kodaly': {
    0: 'd', 1: 'ra', 2: 'r', 3: 'ma', 4: 'm', 5: 'f', 6: 'sa', 7: 's', 8: 'la', 9: 'l', 10: 'ta', 11: 't'
  }
};

const KEY_OFFSETS: Record<string, number> = {
  'C': 0, 'G': 7, 'D': 2, 'A': 9, 'E': 4, 'B': 11, 'F#': 6, 'C#': 1,
  'F': 5, 'Bb': 10, 'Eb': 3, 'Ab': 8, 'Db': 1, 'Gb': 6, 'Cb': 11
};

export const getChromaticSolfege = (
  step: string,
  alter: number,
  key: string,
  mode: string = 'Ju Solfege Movable Doh',
  durationRatio?: number,
  fifths: number = 0
): string => {
  if (mode === 'Close' || mode === 'Lyric') return '';

  // 1. ระบบ Kodaly Rhythm
  if (mode === 'Kodaly Rhythm' && durationRatio !== undefined) {
    if (durationRatio >= 4) return "ta-a-a-a";
    if (durationRatio >= 2) return "ta-ah";
    if (durationRatio >= 1.5) return "ta-i";
    if (durationRatio >= 1) return "ta";
    if (durationRatio >= 0.75) return "ti-i";
    if (durationRatio >= 0.5) return "ti";
    if (durationRatio >= 0.25) return "ti-ka";
    return "ti-ri";
  }

  // 2. คำนวณ Pitch Absolute
  const noteBases: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
  
  // Decide Tonic based on Fixed vs Movable — matches 'Fixed Do', 'Fixed Doh', etc.
  const isFixed = mode.includes('Fixed');
  const tonic = isFixed ? 0 : (KEY_OFFSETS[key] ?? 0);
  
  const abs = (noteBases[step.toUpperCase()] + (alter || 0) + 12) % 12;
  const interval = (abs - tonic + 12) % 12;

  // 3. ปรับชื่อระบบตามโหมด
  let system = 'Ju';
  if (mode.includes('American')) system = 'American';
  else if (mode.includes('British')) system = 'British';
  else if (mode === 'Indian Sargam') system = 'Sargam';
  else if (mode === 'Jianpu') system = 'Jianpu';
  else if (mode === 'Kodaly') system = 'Kodaly';

  // Determine flat vs sharp naming:
  // - If key signature has flats (fifths < 0) → use flat-side names for all notes
  //   UNLESS the note itself has a sharp accidental (alter > 0)
  // - If the note itself has a flat accidental (alter < 0) → always use flat names
  // - Otherwise → use sharp-side names
  const useFlat = (alter < 0) || (fifths < 0 && alter <= 0);
  const map = (useFlat ? SOLFEGE_FLAT_MAPS[system] : SOLFEGE_MAPS[system]) || SOLFEGE_MAPS['Ju'];
  return map[interval] || step;
};
