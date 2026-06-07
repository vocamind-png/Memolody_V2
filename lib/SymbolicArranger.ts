import { ParsedNote, TrackState } from '../types';
import { getChromaticSolfege } from './SolfegeLogic';

export interface ArrangementConfig {
  key: string;
  bpm: number;
  timeSignature: { beats: number; beatType: number };
  style?: string; // e.g., 'pop', 'jazz', 'rock', 'classical', 'lofi', 'edm', 'rnb', 'acoustic', 'bossanova', 'funk', 'cinematic', 'kpop'
  chordSource?: 'ai' | 'original';
  prompt?: string;
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
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const promptStr = (config.prompt || '').toLowerCase();
    const is4PartChorus = promptStr.includes('4') || promptStr.includes('four') || promptStr.includes('สี่') || promptStr.includes('chorus') || promptStr.includes('คอรัส') || promptStr.includes('ประสาน');
    const isAcoustic = config.style === 'acoustic' || promptStr.includes('acoustic');
    const isRock = config.style === 'rock' || promptStr.includes('rock');

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
        volume: -5,
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

  private static generateRhythmSection(melody: ParsedNote[], config: ArrangementConfig): TrackState[] {
    const bassId = `track-bass-${Date.now()}`;
    const chordId = `track-chord-${Date.now()}`;
    const drumId = `track-drum-${Date.now()}`;

    const bassNotes: ParsedNote[] = [];
    const chordNotes: ParsedNote[] = [];
    const drumNotes: ParsedNote[] = [];

    let currentMeasure = '';
    const beatsPerMeasure = config.timeSignature.beats;

    melody.forEach(note => {
      if (note.measure && note.measure !== currentMeasure) {
        currentMeasure = note.measure;
        
        // --- BASS ---
        const bassSolfege = getChromaticSolfege(note.step, note.alter || 0, config.key, 'Ju Solfege Movable Doh');
        // Play root note on beat 1
        bassNotes.push({
          trackId: bassId,
          step: note.step,
          octave: Math.max(1, note.octave - 2), // 2 octaves below
          alter: note.alter || 0,
          duration: beatsPerMeasure, // Hold for the whole measure
          startTime: note.startTime,
          solfege: bassSolfege,
          staff: 2,
          voice: 1,
          measure: currentMeasure
        });

        // --- CHORD (Piano) ---
        // Simple triad (Root, 3rd, 5th)
        const stepIndex = this.SCALE_STEPS.indexOf(note.step);
        if (stepIndex !== -1) {
          const triad = [0, 2, 4];
          triad.forEach((interval, idx) => {
            let chordStepIndex = (stepIndex + interval) % 7;
            let chordOctave = note.octave - 1; // 1 octave below melody
            if ((stepIndex + interval) >= 7) chordOctave++;
            
            const chordStep = this.SCALE_STEPS[chordStepIndex];
            const solfege = getChromaticSolfege(chordStep, note.alter || 0, config.key, 'Ju Solfege Movable Doh');

            // Play on beat 1, or arpeggiate depending on style
            // Here we play a block chord
            chordNotes.push({
              trackId: chordId,
              step: chordStep,
              octave: chordOctave,
              alter: note.alter || 0, // Simplified
              duration: beatsPerMeasure,
              startTime: note.startTime,
              solfege: solfege,
              staff: 1,
              voice: idx + 1,
              measure: currentMeasure
            });
          });
        }

        // --- DRUMS ---
        // Basic Pop/Rock Beat (Kick on 1 & 3, Snare on 2 & 4)
        for (let b = 0; b < beatsPerMeasure; b++) {
          const isKick = b % 2 === 0;
          drumNotes.push({
            trackId: drumId,
            step: isKick ? 'C' : 'D', // Using C2 for Kick, D2 for Snare
            octave: 2,
            alter: 0,
            duration: 1,
            startTime: note.startTime + b,
            solfege: '',
            staff: 1,
            voice: 1,
            measure: currentMeasure
          });
          // Hi-hats on every beat
          drumNotes.push({
            trackId: drumId,
            step: 'F#', // F#2 for closed hi-hat
            octave: 2,
            alter: 1,
            duration: 0.5,
            startTime: note.startTime + b,
            solfege: '',
            staff: 1,
            voice: 2,
            measure: currentMeasure
          });
          drumNotes.push({
            trackId: drumId,
            step: 'F',
            octave: 2,
            alter: 1,
            duration: 0.5,
            startTime: note.startTime + b + 0.5,
            solfege: '',
            staff: 1,
            voice: 2,
            measure: currentMeasure
          });
        }
      }
    });

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

    return [bassTrack, chordTrack, drumTrack];
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
    const harmonyNotes: ParsedNote[] = [];
    melody.forEach(note => {
      if (!note.step) return;
      const stepIndex = this.SCALE_STEPS.indexOf(note.step);
      if (stepIndex === -1) return;
      let shiftedIndex = (stepIndex + stepShift) % 7;
      if (shiftedIndex < 0) shiftedIndex += 7;
      let octaveShift = Math.floor((stepIndex + stepShift) / 7);
      const solfege = getChromaticSolfege(this.SCALE_STEPS[shiftedIndex], note.alter || 0, config.key, 'Ju Solfege Movable Doh');
      harmonyNotes.push({
        ...note,
        trackId,
        step: this.SCALE_STEPS[shiftedIndex],
        octave: note.octave + octaveShift,
        solfege: solfege,
        voice: voiceIndex
      });
    });
    return harmonyNotes;
  }
}
