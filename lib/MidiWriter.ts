
import { ParsedNote } from '../types';

/**
 * [NEURAL MIDI GENERATOR V1.0]
 * A lightweight utility to convert ParsedNote sequences into a Standard MIDI File (SMF) Type 0.
 */
export class MidiWriter {
  private static writeVarInt(value: number): number[] {
    let buffer = [value & 0x7F];
    while ((value >>= 7) > 0) {
      buffer.push((value & 0x7F) | 0x80);
    }
    return buffer.reverse();
  }

  private static stringToBytes(str: string): number[] {
    return Array.from(str).map(c => c.charCodeAt(0));
  }

  public static generateMidiBlob(notes: ParsedNote[], bpm: number = 120): Blob {
    const ticksPerBeat = 128;
    const header = [
      ...this.stringToBytes('MThd'),
      0, 0, 0, 6, // Length
      0, 0,       // Format 0
      0, 1,       // 1 track
      (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF
    ];

    let trackData: number[] = [];
    
    // Set Tempo: Meta Event 0xFF 0x51 0x03 (microsec per quarter note)
    const microsecPerBeat = Math.round(60000000 / bpm);
    trackData.push(0x00, 0xFF, 0x51, 0x03, 
      (microsecPerBeat >> 16) & 0xFF, 
      (microsecPerBeat >> 8) & 0xFF, 
      microsecPerBeat & 0xFF
    );

    // Sort notes by start time
    const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime);
    const events: { time: number, type: number, pitch: number, velocity: number }[] = [];

    sortedNotes.forEach(n => {
      const stepIdx = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(n.step.toUpperCase());
      const pitch = (n.octave + 1) * 12 + (stepIdx === -1 ? 0 : stepIdx) + n.alter;
      
      events.push({ time: n.startTime * ticksPerBeat, type: 0x90, pitch, velocity: 80 });
      events.push({ time: (n.startTime + n.duration) * ticksPerBeat, type: 0x80, pitch, velocity: 0 });
    });

    events.sort((a, b) => a.time - b.time);

    let lastTime = 0;
    events.forEach(e => {
      const deltaTime = Math.max(0, Math.round(e.time - lastTime));
      trackData.push(...this.writeVarInt(deltaTime));
      trackData.push(e.type, e.pitch, e.velocity);
      lastTime = e.time;
    });

    // End of Track
    trackData.push(0x00, 0xFF, 0x2F, 0x00);

    const trackHeader = [
      ...this.stringToBytes('MTrk'),
      (trackData.length >> 24) & 0xFF,
      (trackData.length >> 16) & 0xFF,
      (trackData.length >> 8) & 0xFF,
      trackData.length & 0xFF
    ];

    const fullFile = new Uint8Array([...header, ...trackHeader, ...trackData]);
    return new Blob([fullFile], { type: 'audio/midi' });
  }
}
