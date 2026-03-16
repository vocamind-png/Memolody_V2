
/**
 * [OKD-CORE-V2.8.4] - Open Kodály Digital Protocol Implementation
 * Compliance Status: OKD_STRICT_COMPLIANCE
 * 
 * IMPORTANT: This module follows the International Kodály Digital Standard. 
 * Per the OKD License (docs/OKD_STANDARD_LICENSE.md), certain naming 
 * identifiers are protected to maintain pedagogical integrity.
 */

const SOLFEGE_MAP: Record<number, { sharp: string, flat: string, jianpu: string, kodaly: string }> = {
  0: { sharp: 'Doh', flat: 'Doh', jianpu: '1', kodaly: 'd' },
  1: { sharp: 'di', flat: 'ru', jianpu: '#1', kodaly: 'di' },
  2: { sharp: 'Re', flat: 'Re', jianpu: '2', kodaly: 'r' },
  3: { sharp: 'ri', flat: 'mu', jianpu: '#2', kodaly: 'ri' },
  4: { sharp: 'Me', flat: 'Me', jianpu: '3', kodaly: 'm' },
  5: { sharp: 'Fah', flat: 'Fah', jianpu: '4', kodaly: 'f' },
  6: { sharp: 'fi', flat: 'su', jianpu: '#4', kodaly: 'fi' },
  7: { sharp: 'Sol', flat: 'Sol', jianpu: '5', kodaly: 's' },
  8: { sharp: 'si', flat: 'lu', jianpu: '#5', kodaly: 'si' },
  9: { sharp: 'Lah', flat: 'Lah', jianpu: '6', kodaly: 'l' },
  10: { sharp: 'li', flat: 'tu', jianpu: '#6', kodaly: 'li' },
  11: { sharp: 'Ti', flat: 'Ti', jianpu: '7', kodaly: 't' }
};

const KEY_OFFSETS: Record<string, number> = {
  'C': 0, 'G': 7, 'D': 2, 'A': 9, 'E': 4, 'B': 11, 'F#': 6, 'C#': 1,
  'F': 5, 'Bb': 10, 'Eb': 3, 'Ab': 8, 'Db': 1, 'Gb': 6, 'Cb': 11
};

/**
 * [NEURAL SOLFEGE CORE V2.5]
 * คำนวณคำร้องใต้โน้ตตามโหมดที่เลือก
 * @param mode ต้องระบุค่าตามมาตรฐานระบบ (Kodaly | Jianpu | Fixed Do)
 */
export const getChromaticSolfege = (
  step: string,
  alter: number,
  key: string,
  mode: 'Movable Do' | 'Fixed Do' | 'Jianpu' | 'Kodaly' | 'Kodaly Rhythm' = 'Movable Do',
  durationRatio?: number
): string => {
  // 1. ระบบ Kodaly Rhythm (ta, ti, tiri...)
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
  const tonic = (mode === 'Fixed Do') ? 0 : (KEY_OFFSETS[key] ?? 0);
  const abs = (noteBases[step.toUpperCase()] + (alter || 0) + 12) % 12;
  const interval = (abs - tonic + 12) % 12;

  const m = SOLFEGE_MAP[interval];
  if (!m) return step;

  // 3. แยกส่งค่าตามโหมด
  if (mode === 'Jianpu') return m.jianpu;
  if (mode === 'Kodaly') return m.kodaly;

  const isFlatKey = key.includes('b') || key === 'F';
  const useFlat = alter < 0 || (alter === 0 && isFlatKey && [1, 3, 6, 8, 10].includes(interval));

  return useFlat ? m.flat : m.sharp;
};
