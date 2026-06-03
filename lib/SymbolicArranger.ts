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

    if (is4PartChorus) {
      const s2Id = `track-s2-${Date.now()}`;
      const altoId = `track-alto-${Date.now()}`;
      const tenorId = `track-tenor-${Date.now()}`;
      const bassId = `track-bass-${Date.now()}`;
      
      const s2Notes = this.generateHarmonyShift(leadMelody, config, s2Id, 2, 2);
      const altoNotes = this.generateHarmonyShift(leadMelody, config, altoId, -2, 3);
      const tenorNotes = this.generateHarmonyShift(leadMelody, config, tenorId, -4, 4);
      const bassNotes = this.generateBassline(leadMelody, config, bassId);

      const s2Track: TrackState = { id: s2Id, name: `AI Soprano 2 (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: -3, pan: 0.4, mode: 'vocal', instrument: 'vocal', effects: [] };
      const altoTrack: TrackState = { id: altoId, name: `AI Alto (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: -3, pan: -0.4, mode: 'vocal', instrument: 'vocal', effects: [] };
      const tenorTrack: TrackState = { id: tenorId, name: `AI Tenor (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: -4, pan: 0.2, mode: 'vocal', instrument: 'vocal', effects: [] };
      const bassTrack: TrackState = { id: bassId, name: `AI Bass Chorus (${config.style || 'pop'})`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: -2, pan: -0.2, mode: 'vocal', instrument: 'vocal', effects: [] };

      (s2Track as any)._generatedNotes = s2Notes;
      (altoTrack as any)._generatedNotes = altoNotes;
      (tenorTrack as any)._generatedNotes = tenorNotes;
      (bassTrack as any)._generatedNotes = bassNotes;

      return [s2Track, altoTrack, tenorTrack, bassTrack];
    }
    
    const bassTrackId = `track-bass-${Date.now()}`;
    const harmonyTrackId = `track-harmony-${Date.now()}`;
    
    const bassNotes = this.generateBassline(leadMelody, config, bassTrackId);
    const harmonyNotes = this.generateHarmony(leadMelody, config, harmonyTrackId);
    
    const bassTrack: TrackState = {
      id: bassTrackId,
      name: `AI Bass (${config.style || 'pop'})`,
      isMuted: false,
      isSolo: false,
      lyricMode: 'Ju Solfege Movable Doh',
      volume: 0,
      pan: 0,
      mode: 'instrument',
      instrument: 'bass',
      effects: []
    };
    
    const harmonyTrack: TrackState = {
      id: harmonyTrackId,
      name: `AI Harmony (${config.style || 'pop'})`,
      isMuted: false,
      isSolo: false,
      lyricMode: 'Ju Solfege Movable Doh',
      volume: -5,
      pan: 0.3,
      mode: 'instrument', // Changed to instrument so it plays via synth immediately
      instrument: 'piano',
      effects: []
    };
    
    // Store generated notes in a way that MusicEngine can access them, or return them to be wrapped.
    // We attach the raw notes as a temporary custom property so the UI can extract them and pass them to TrackVisualizer
    (bassTrack as any)._generatedNotes = bassNotes;
    (harmonyTrack as any)._generatedNotes = harmonyNotes;
    
    return [bassTrack, harmonyTrack];
  }
  
  private static generateBassline(melody: ParsedNote[], config: ArrangementConfig, trackId: string): ParsedNote[] {
    const bassNotes: ParsedNote[] = [];
    let currentMeasure = '';
    
    // A very simple rule-based bassline: play the root note of the melody at the start of each measure
    melody.forEach(note => {
      if (note.measure && note.measure !== currentMeasure) {
        currentMeasure = note.measure;
        
        const solfege = getChromaticSolfege(note.step, note.alter || 0, config.key, 'Ju Solfege Movable Doh');
        
        bassNotes.push({
          trackId,
          step: note.step,
          octave: Math.max(1, note.octave - 2), // 2 octaves below melody
          alter: note.alter || 0,
          duration: config.timeSignature.beats, // Whole measure duration (approx)
          startTime: note.startTime,
          solfege: solfege,
          staff: 2, // Bass clef
          voice: 1,
          measure: currentMeasure
        });
      }
    });
    
    return bassNotes;
  }
  
  private static generateHarmony(melody: ParsedNote[], config: ArrangementConfig, trackId: string): ParsedNote[] {
    const harmonyNotes: ParsedNote[] = [];
    
    // Simple rule-based harmony: a third above the melody
    melody.forEach(note => {
      if (!note.step) return; // skip rests if any
      
      const stepIndex = this.SCALE_STEPS.indexOf(note.step);
      if (stepIndex === -1) return;
      
      const thirdIndex = (stepIndex + 2) % 7;
      let thirdOctave = note.octave;
      if (thirdIndex < stepIndex) thirdOctave++; // Wraparound
      
      const solfege = getChromaticSolfege(this.SCALE_STEPS[thirdIndex], note.alter || 0, config.key, 'Ju Solfege Movable Doh');
      
      harmonyNotes.push({
        trackId,
        step: this.SCALE_STEPS[thirdIndex],
        octave: thirdOctave,
        alter: note.alter || 0, // Simplified, doesn't properly calculate diatonic thirds
        duration: note.duration,
        startTime: note.startTime,
        solfege: solfege,
        staff: 1, // Treble clef
        voice: 2, // Secondary voice
        measure: note.measure
      });
    });
    
    return harmonyNotes;
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
