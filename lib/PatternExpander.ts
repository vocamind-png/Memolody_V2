import { ParsedNote } from '../types';

export type PatternType = 
  | 'block_chords' | 'arpeggio_8ths' | 'arpeggio_16ths' | 'comping_syncopated'
  | 'walking_quarter' | 'root_8ths' | 'root_fifth_8ths'
  | 'rock_basic' | 'pop_groove' | 'jazz_swing';

export interface ArrangerTrackConfig {
  instrument: string;
  pattern: PatternType;
  octaveOffset: number;
  velocity: number;
}

export interface ExpandedTrack {
  trackName: string;
  instrument: string;
  notes: ParsedNote[];
}

/**
 * Expands high-level chord progressions into thousands of MIDI notes based on predefined musical styles.
 */
export class PatternExpander {
  private static parseChord(chordName: string, rootOctave: number = 4): number[] {
    // Very basic chord parser. Returns array of MIDI pitches.
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flatToSharp: { [key: string]: string } = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    let rootName = chordName.replace(/m|dim|aug|maj7|m7|7/g, '');
    if (flatToSharp[rootName]) {
      rootName = flatToSharp[rootName];
    }
    let rootIdx = notes.indexOf(rootName);
    if (rootIdx === -1) rootIdx = 0; // fallback to C
    
    const rootPitch = rootIdx + (rootOctave + 1) * 12;
    
    // Intervals
    let third = 4; // major
    let fifth = 7; // perfect
    let seventh = -1; // none

    if (chordName.includes('m') && !chordName.includes('maj7')) third = 3;
    if (chordName.includes('dim')) { third = 3; fifth = 6; }
    if (chordName.includes('aug')) { third = 4; fifth = 8; }
    if (chordName.includes('7')) { seventh = 10; } // dominant 7
    if (chordName.includes('maj7')) { seventh = 11; }
    if (chordName.includes('m7')) { third = 3; seventh = 10; }

    const chordPitches = [rootPitch, rootPitch + third, rootPitch + fifth];
    if (seventh > -1) chordPitches.push(rootPitch + seventh);
    
    return chordPitches;
  }

  public static expand(
    chords: { name: string; measure: number; beat: number }[],
    tracksConfig: ArrangerTrackConfig[],
    beatsPerMeasure: number,
    totalMeasures: number
  ): ExpandedTrack[] {
    const result: ExpandedTrack[] = [];

    for (const config of tracksConfig) {
      const notes: ParsedNote[] = [];
      const isDrum = config.instrument === 'drums';

      // Fill measures
      for (let m = 1; m <= totalMeasures; m++) {
        // Find current chord
        let currentChord = chords.find(c => c.measure === m)?.name || 'C';
        if (!currentChord) {
           // fallback to previous measure's chord
           for (let pm = m - 1; pm >= 1; pm--) {
              const pc = chords.find(c => c.measure === pm)?.name;
              if (pc) { currentChord = pc; break; }
           }
        }
        
        const pitches = this.parseChord(currentChord, 4 + config.octaveOffset);
        const rootPitch = pitches[0];

        const measureStartTime = (m - 1) * beatsPerMeasure;

        // Apply Pattern
        if (isDrum) {
          this.applyDrumPattern(notes, config.pattern, measureStartTime, beatsPerMeasure, m.toString());
        } else {
          this.applyMelodicPattern(notes, pitches, rootPitch, config.pattern, measureStartTime, beatsPerMeasure, m.toString());
        }
      }

      result.push({
        trackName: config.instrument.toUpperCase(),
        instrument: config.instrument,
        notes
      });
    }

    return result;
  }

  private static applyMelodicPattern(notes: ParsedNote[], chordPitches: number[], rootPitch: number, pattern: PatternType, measureStartTime: number, beatsPerMeasure: number, m: string) {
    // Add a slight gap between notes to prevent legato droning
    const NOTE_GAP = 0.9;

    if (pattern === 'block_chords') {
      // Whole note block chord
      chordPitches.forEach(p => {
        notes.push(this.createNote(p, measureStartTime, beatsPerMeasure * NOTE_GAP, m.toString()));
      });
    } else if (pattern === 'arpeggio_8ths') {
      for (let b = 0; b < beatsPerMeasure * 2; b++) {
        const p = chordPitches[b % chordPitches.length];
        notes.push(this.createNote(p, measureStartTime + b * 0.5, 0.5 * NOTE_GAP, m.toString()));
      }
    } else if (pattern === 'arpeggio_16ths') {
      for (let b = 0; b < beatsPerMeasure * 4; b++) {
        const p = chordPitches[b % chordPitches.length];
        notes.push(this.createNote(p, measureStartTime + b * 0.25, 0.25 * NOTE_GAP, m.toString()));
      }
    } else if (pattern === 'comping_syncopated') {
      // Beat 1.5 and Beat 3
      chordPitches.forEach(p => {
        notes.push(this.createNote(p, measureStartTime + 0.5, 1 * NOTE_GAP, m.toString()));
        notes.push(this.createNote(p, measureStartTime + 2, 1.5 * NOTE_GAP, m.toString()));
      });
    } else if (pattern === 'walking_quarter') {
      // Root, Third, Fifth, Octave
      const walk = [chordPitches[0], chordPitches[1] || chordPitches[0]+3, chordPitches[2] || chordPitches[0]+7, chordPitches[0]+12];
      for (let b = 0; b < beatsPerMeasure; b++) {
        notes.push(this.createNote(walk[b % walk.length], measureStartTime + b, 1 * NOTE_GAP, m.toString()));
      }
    } else if (pattern === 'root_8ths') {
      for (let b = 0; b < beatsPerMeasure * 2; b++) {
        notes.push(this.createNote(rootPitch, measureStartTime + b * 0.5, 0.5 * NOTE_GAP, m.toString()));
      }
    } else if (pattern === 'root_fifth_8ths') {
      for (let b = 0; b < beatsPerMeasure * 2; b++) {
        const p = (b % 2 === 0) ? rootPitch : (chordPitches[2] || rootPitch + 7) - 12;
        notes.push(this.createNote(p, measureStartTime + b * 0.5, 0.5 * NOTE_GAP, m.toString()));
      }
    } else {
      // Fallback: If AI passes an invalid pattern, do basic comping
      notes.push(this.createNote(rootPitch, measureStartTime, 1 * NOTE_GAP, m.toString()));
      notes.push(this.createNote(chordPitches[1] || rootPitch+4, measureStartTime + 1, 1 * NOTE_GAP, m.toString()));
      notes.push(this.createNote(rootPitch, measureStartTime + 2, 1 * NOTE_GAP, m.toString()));
      notes.push(this.createNote(chordPitches[2] || rootPitch+7, measureStartTime + 3, 1 * NOTE_GAP, m.toString()));
    }
  }

  private static applyDrumPattern(notes: ParsedNote[], pattern: PatternType, measureStartTime: number, beatsPerMeasure: number, m: string) {
    // Basic GM Drum Map: 36 Kick, 38 Snare, 42 Closed Hi-Hat
    const kick = 36;
    const snare = 38;
    const hihat = 42;
    const NOTE_GAP = 0.5; // Short burst for drums


    if (pattern === 'rock_basic') {
      // 8th note hi-hats
      for (let b = 0; b < beatsPerMeasure * 2; b++) {
        notes.push(this.createNote(hihat, measureStartTime + b * 0.5, 0.25 * NOTE_GAP, m));
      }
      // Kick on 1 and 3
      notes.push(this.createNote(kick, measureStartTime + 0, 0.5 * NOTE_GAP, m));
      notes.push(this.createNote(kick, measureStartTime + 2, 0.5 * NOTE_GAP, m));
      // Snare on 2 and 4
      notes.push(this.createNote(snare, measureStartTime + 1, 0.5 * NOTE_GAP, m));
      notes.push(this.createNote(snare, measureStartTime + 3, 0.5 * NOTE_GAP, m));
    } else if (pattern === 'pop_groove') {
      // 16th hi-hats
      for (let b = 0; b < beatsPerMeasure * 4; b++) {
        notes.push(this.createNote(hihat, measureStartTime + b * 0.25, 0.125 * NOTE_GAP, m));
      }
      // Kick on 1, 2.5, 3
      notes.push(this.createNote(kick, measureStartTime + 0, 0.5 * NOTE_GAP, m));
      notes.push(this.createNote(kick, measureStartTime + 1.5, 0.5 * NOTE_GAP, m));
      notes.push(this.createNote(kick, measureStartTime + 2, 0.5 * NOTE_GAP, m));
      // Snare on 2 and 4
      notes.push(this.createNote(snare, measureStartTime + 1, 0.5 * NOTE_GAP, m));
      notes.push(this.createNote(snare, measureStartTime + 3, 0.5 * NOTE_GAP, m));
    } else {
      // Fallback simple beat
      notes.push(this.createNote(kick, measureStartTime + 0, 1 * NOTE_GAP, m));
      notes.push(this.createNote(snare, measureStartTime + 1, 1 * NOTE_GAP, m));
      notes.push(this.createNote(kick, measureStartTime + 2, 1 * NOTE_GAP, m));
      notes.push(this.createNote(snare, measureStartTime + 3, 1 * NOTE_GAP, m));
    }
  }

  private static createNote(pitch: number, startTime: number, duration: number, measure: string): ParsedNote {
    // Basic conversion back to solfege format for the visualizer
    const octave = Math.floor(pitch / 12) - 1;
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const stepStr = notes[pitch % 12];
    const step = stepStr[0];
    const alter = stepStr.includes('#') ? 1 : 0;
    
    return {
      trackId: '', // Filled later
      step,
      octave,
      alter,
      duration,
      startTime,
      measure,
      solfege: `${step}${alter === 1 ? '#' : ''}`
    };
  }
}
