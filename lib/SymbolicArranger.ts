import { ParsedNote, TrackState } from '../types';
import { getChromaticSolfege } from './SolfegeLogic';

export interface ArrangementConfig {
  key: string;
  bpm: number;
  timeSignature: { beats: number; beatType: number };
  style?: string; // e.g., 'auto', 'pop', 'jazz', 'rock', 'classical', 'lofi', 'edm', 'rnb', 'acoustic', 'bossanova', 'funk', 'cinematic', 'kpop'
  chordSource?: 'ai' | 'original';
  prompt?: string;
  instruments?: string[];
  is4PartChorus?: boolean;
  chordProgression?: string;
  aiChords?: { name: string; measure: number; beat: number }[];
}

export class SymbolicArranger {
  private static readonly SCALE_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  
  /**
   * Generates a full arrangement based on a lead melody.
   */
  public static async generateArrangement(
    leadMelody: ParsedNote[],
    config: ArrangementConfig
  ): Promise<TrackState[]> {
    console.log(`[SymbolicArranger] Generating arrangement for ${leadMelody.length} notes in ${config.key}`);
    
    // Simulate AI thinking time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const promptStr = (config.prompt || '').toLowerCase();
    const is4PartChorus = config.is4PartChorus !== undefined ? config.is4PartChorus : (promptStr.includes('4') || promptStr.includes('four') || promptStr.includes('สี่') || promptStr.includes('chorus') || promptStr.includes('คอรัส') || promptStr.includes('ประสาน'));

    let tracks: TrackState[] = [];

    // 1. Generate Rhythm Section (Bass, Piano/Guitar, Drums)
    const rhythmTracks = this.generateRhythmSection(leadMelody, config);
    tracks.push(...rhythmTracks);

    // 2. Generate Chorus (SATB)
    if (is4PartChorus) {
      const chorusTracks = this.generateSATBChorus(leadMelody, config);
      tracks.push(...chorusTracks);
    } else {
      // Basic Harmony
      const harmonyTrackId = `track-harmony-${Date.now()}`;
      const harmonyNotes = this.generateHarmonyShift(leadMelody, config, harmonyTrackId, 2, 2);
      const harmonyTrack: TrackState = {
        id: harmonyTrackId,
        name: `AI Harmony (${config.style || 'pop'})`,
        isMuted: false,
        isSolo: false,
        lyricMode: 'Ju Solfege Movable Doh',
        volume: 0.8,
        pan: 0.3,
        mode: 'vocal',
        instrument: 'vocal',
        effects: []
      };
      (harmonyTrack as any)._generatedNotes = harmonyNotes;
      tracks.push(harmonyTrack);
    }
    
    return tracks;
  }

  private static parseChord(chordName: string): string[] {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let root = chordName.charAt(0).toUpperCase();
    if (chordName.length > 1 && (chordName[1] === '#' || chordName[1] === 'b')) {
      root += chordName[1];
    }
    const flatToSharp: any = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'};
    if (flatToSharp[root]) root = flatToSharp[root];

    let rootIdx = notes.indexOf(root);
    if (rootIdx === -1) rootIdx = 0;

    const isMinor = chordName.includes('m') && !chordName.includes('maj');
    const thirdIdx = (rootIdx + (isMinor ? 3 : 4)) % 12;
    const fifthIdx = (rootIdx + 7) % 12;

    return [notes[rootIdx], notes[thirdIdx], notes[fifthIdx]];
  }

  private static generateRhythmSection(melody: ParsedNote[], config: ArrangementConfig): TrackState[] {
    const bassId = `track-bass-${Date.now()}`;
    const chordId = `track-chord-${Date.now()}`;
    const drumId = `track-drum-${Date.now()}`;

    const bassNotes: ParsedNote[] = [];
    const chordNotes: ParsedNote[] = [];
    const drumNotes: ParsedNote[] = [];

    const beatsPerMeasure = config.timeSignature.beats;
    let totalBeats = 16;
    if (melody.length > 0) {
      totalBeats = melody.reduce((max, note) => Math.max(max, (note.startTime || 0) + (note.duration || 0)), 0);
    }
    const totalMeasures = Math.max(4, Math.ceil(totalBeats / beatsPerMeasure));

    // Use AI's chord progression or default to a basic I V vi IV progression in C
    const progStr = config.chordProgression || "C G Am F";
    const chords = progStr.split(/\s+/).filter(c => c.length > 0);

    for (let m = 1; m <= totalMeasures; m++) {
      const currentMeasure = String(m);
      const measureStartTime = (m - 1) * beatsPerMeasure;
      
      let chordName = 'C';
      if (config.aiChords && config.aiChords.length > 0) {
        // Find the most recent chord up to this measure
        const activeChord = config.aiChords.slice().reverse().find(c => c.measure <= m) || config.aiChords[0];
        chordName = activeChord.name;
      } else {
        chordName = chords[(m - 1) % chords.length];
      }
      
      const chordPitches = this.parseChord(chordName);
      
      const style = (config.style || 'pop').toLowerCase();
      
      // BASS (Root note, 2 octaves below)
      const bassRoot = chordPitches[0];
      
      // Dynamic Bass Pattern
      if (style.includes('rock') || style.includes('pop')) {
        // 8th note driving bass
        for (let b = 0; b < beatsPerMeasure * 2; b++) {
          bassNotes.push({
            trackId: bassId, step: bassRoot.replace('#', ''), octave: 2, alter: bassRoot.includes('#') ? 1 : 0,
            duration: 0.5, startTime: measureStartTime + (b * 0.5), solfege: '', staff: 2, voice: 1, measure: currentMeasure
          });
        }
      } else {
        // Standard whole note bass
        bassNotes.push({
          trackId: bassId, step: bassRoot.replace('#', ''), octave: 2, alter: bassRoot.includes('#') ? 1 : 0,
          duration: beatsPerMeasure, startTime: measureStartTime, solfege: '', staff: 2, voice: 1, measure: currentMeasure
        });
      }

      // PIANO / GUITAR (Chords, 1 octave below)
      if (style.includes('acoustic') || style.includes('pop')) {
        // Syncopated comping (Beat 1, Beat 2.5, Beat 4)
        const offsets = [0, 1.5, 3];
        offsets.forEach(off => {
          if (off < beatsPerMeasure) {
            chordPitches.forEach((pitch, idx) => {
              chordNotes.push({
                trackId: chordId, step: pitch.replace('#', ''), octave: 3, alter: pitch.includes('#') ? 1 : 0,
                duration: 1, startTime: measureStartTime + off, solfege: '', staff: 1, voice: idx + 1, measure: currentMeasure
              });
            });
          }
        });
      } else {
        // Whole note chords
        chordPitches.forEach((pitch, idx) => {
          chordNotes.push({
            trackId: chordId, step: pitch.replace('#', ''), octave: 3, alter: pitch.includes('#') ? 1 : 0,
            duration: beatsPerMeasure, startTime: measureStartTime, solfege: '', staff: 1, voice: idx + 1, measure: currentMeasure
          });
        });
      }

      // DRUMS (Dynamic Patterns)
      for (let b = 0; b < beatsPerMeasure; b++) {
        const beatStart = measureStartTime + b;
        const isKick = b === 0 || b === 2; // Kick on 1 and 3
        const isSnare = b === 1 || b === 3; // Snare on 2 and 4
        
        if (isKick) {
          drumNotes.push({ trackId: drumId, step: 'C', octave: 2, alter: 0, duration: 1, startTime: beatStart, solfege: '', staff: 1, voice: 1, measure: currentMeasure });
        }
        if (isSnare) {
          drumNotes.push({ trackId: drumId, step: 'D', octave: 2, alter: 0, duration: 1, startTime: beatStart, solfege: '', staff: 1, voice: 1, measure: currentMeasure });
        }

        // Hi-hat (8th notes)
        drumNotes.push({ trackId: drumId, step: 'F', octave: 2, alter: 1, duration: 0.5, startTime: beatStart, solfege: '', staff: 1, voice: 2, measure: currentMeasure });
        drumNotes.push({ trackId: drumId, step: 'F', octave: 2, alter: 1, duration: 0.5, startTime: beatStart + 0.5, solfege: '', staff: 1, voice: 2, measure: currentMeasure });
      }
    }

    const bassTrack: TrackState = {
      id: bassId, name: `AI Bass (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Close', volume: 0.85, pan: 0, mode: 'instrument', instrument: 'bass', effects: []
    };
    const chordTrack: TrackState = {
      id: chordId, name: `AI Keys (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Close', volume: 0.75, pan: -0.3, mode: 'instrument', instrument: 'piano', effects: []
    };
    const drumTrack: TrackState = {
      id: drumId, name: `AI Drums (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Close', volume: 0.85, pan: 0, mode: 'instrument', instrument: 'drums', effects: []
    };

    (bassTrack as any)._generatedNotes = bassNotes;
    (chordTrack as any)._generatedNotes = chordNotes;
    (drumTrack as any)._generatedNotes = drumNotes;

    let res = [];
    const instruments = config.instruments || ['bass', 'piano', 'drums'];
    if (instruments.includes('bass')) res.push(bassTrack);
    if (instruments.includes('piano') || instruments.includes('guitar') || instruments.includes('strings')) res.push(chordTrack);
    if (instruments.includes('drums')) res.push(drumTrack);

    return res;
  }

  private static generateSATBChorus(leadMelody: ParsedNote[], config: ArrangementConfig): TrackState[] {
    const s2Id = `track-s2-${Date.now()}`;
    const altoId = `track-alto-${Date.now()}`;
    const tenorId = `track-tenor-${Date.now()}`;

    const s2Notes = this.generateHarmonyShift(leadMelody, config, s2Id, 2, 2);
    const altoNotes = this.generateHarmonyShift(leadMelody, config, altoId, -2, 3);
    const tenorNotes = this.generateHarmonyShift(leadMelody, config, tenorId, -4, 4);

    const s2Track: TrackState = { id: s2Id, name: `AI Soprano 2 (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: 0.8, pan: 0.4, mode: 'instrument', instrument: 'strings', effects: [] };
    const altoTrack: TrackState = { id: altoId, name: `AI Alto (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: 0.8, pan: -0.4, mode: 'instrument', instrument: 'strings', effects: [] };
    const tenorTrack: TrackState = { id: tenorId, name: `AI Tenor (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: 0.75, pan: 0.2, mode: 'instrument', instrument: 'synth', effects: [] };

    (s2Track as any)._generatedNotes = s2Notes;
    (altoTrack as any)._generatedNotes = altoNotes;
    (tenorTrack as any)._generatedNotes = tenorNotes;

    return [s2Track, altoTrack, tenorTrack];
  }
  
  private static generateHarmonyShift(melody: ParsedNote[], config: ArrangementConfig, trackId: string, stepShift: number, voiceIndex: number): ParsedNote[] {
    const progStr = config.chordProgression || "C G Am F";
    const chords = progStr.split(/\s+/).filter(c => c.length > 0);
    const beatsPerMeasure = config.timeSignature?.beats || 4;

    const harmonyNotes: ParsedNote[] = [];
    melody.forEach(note => {
      if (!note.step) return;
      const stepIndex = this.SCALE_STEPS.indexOf(note.step);
      if (stepIndex === -1) return;

      // 1. Determine current chord based on measure or startTime
      let mIndex = 0;
      if (note.measure && !isNaN(parseInt(note.measure))) {
         mIndex = parseInt(note.measure) - 1;
      } else if (note.startTime !== undefined) {
         mIndex = Math.floor(note.startTime / beatsPerMeasure);
      }
      mIndex = Math.max(0, mIndex);
      const chordName = chords[mIndex % chords.length];
      const chordPitches = this.parseChord(chordName);

      // 2. Find target index using ideal parallel shift
      let targetIndex = stepIndex + stepShift;
      
      // 3. Snap targetIndex to the nearest chord tone
      let bestIndex = targetIndex;
      let minDiff = 999;
      
      for (let offset = -2; offset <= 2; offset++) {
         let checkIndex = targetIndex + offset;
         let wrappedCheckIndex = ((checkIndex % 7) + 7) % 7;
         let letter = this.SCALE_STEPS[wrappedCheckIndex];
         
         let isChordTone = chordPitches.some(cp => cp.charAt(0) === letter);
         
         if (isChordTone) {
            let diff = Math.abs(offset);
            if (diff < minDiff) {
               minDiff = diff;
               bestIndex = checkIndex;
            }
         }
      }
      
      let shiftedIndex = ((bestIndex % 7) + 7) % 7;
      let octaveShift = Math.floor(bestIndex / 7);
      
      // Determine alter based on chord pitch
      let finalAlter = note.alter || 0;
      let matchedChordPitch = chordPitches.find(cp => cp.charAt(0) === this.SCALE_STEPS[shiftedIndex]);
      if (matchedChordPitch) {
         if (matchedChordPitch.includes('#')) finalAlter = 1;
         else if (matchedChordPitch.includes('b')) finalAlter = -1;
         else finalAlter = 0;
      }

      const solfege = getChromaticSolfege(this.SCALE_STEPS[shiftedIndex], finalAlter, config.key, 'Ju Solfege Movable Doh');

      harmonyNotes.push({
        ...note,
        trackId,
        step: this.SCALE_STEPS[shiftedIndex],
        alter: finalAlter,
        octave: note.octave + octaveShift,
        solfege: solfege,
        voice: voiceIndex
      });
    });
    return harmonyNotes;
  }
}
