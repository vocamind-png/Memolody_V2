import fs from 'fs';
let file = fs.readFileSync('lib/MusicEngine.ts', 'utf8');
file = file.replace(
  'public setVocalTranspose(trackId: string, diffSemitones: number) {',
  'public setVocalTranspose(trackId: string, diffSemitones: number) {\n    console.log(`[MusicEngine] setVocalTranspose: ${trackId} diff=${diffSemitones}`);'
);
file = file.replace(
  'const diffSemitones = this.vocalPitchShiftSemitones.get(trackId) || 0;',
  'const diffSemitones = this.vocalPitchShiftSemitones.get(trackId) || 0;\n      if(diffSemitones!==0) console.log(`[MusicEngine] using shifter! track=${trackId} diff=${diffSemitones}`);'
);
fs.writeFileSync('lib/MusicEngine.ts', file);
