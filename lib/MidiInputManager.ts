import * as Tone from 'tone';
import { musicEngine } from './MusicEngine';

export type MidiChannelSetting = 'omni' | number; // 'omni' or 1-16

export class MidiInputManager {
  private midiAccess: WebMidi.MIDIAccess | null = null;
  public isSupported: boolean = false;
  public inputs: WebMidi.MIDIInput[] = [];
  
  // Maps a specific MIDI channel (1-16) to a Memolody trackId
  public channelRouting: Map<number, string> = new Map();
  // The default track for Omni mode (usually the currently selected track in UI)
  public activeTrackId: string | null = null;
  // If true, any incoming MIDI channel goes to activeTrackId.
  public omniMode: boolean = true;

  // React subscribers
  private listeners: Set<() => void> = new Set();

  async init() {
    if (typeof navigator !== 'undefined' && navigator.requestMIDIAccess) {
      try {
        this.midiAccess = await navigator.requestMIDIAccess();
        this.isSupported = true;
        this.updateInputs();

        this.midiAccess.onstatechange = (e) => {
          this.updateInputs();
          this.notify();
        };
      } catch (err) {
        console.warn("MIDI Access denied or failed:", err);
      }
    } else {
      console.warn("Web MIDI API not supported in this browser.");
    }
  }

  private updateInputs() {
    if (!this.midiAccess) return;
    this.inputs = Array.from(this.midiAccess.inputs.values());
    
    // Attach listeners to all inputs
    this.inputs.forEach(input => {
      input.onmidimessage = this.handleMidiMessage.bind(this);
    });
  }

  private handleMidiMessage(message: WebMidi.MIDIMessageEvent) {
    if (!message.data) return;
    const [statusByte, data1, data2] = message.data;
    
    // Status byte: 1000nnnn (Note Off), 1001nnnn (Note On)
    const cmd = statusByte >> 4;
    const channel = (statusByte & 0xf) + 1; // 1-16
    
    if (cmd === 9 || cmd === 8) {
      const noteNumber = data1;
      const velocity = data2 / 127;
      const freq = Tone.Frequency(noteNumber, "midi").toFrequency();
      
      // Determine destination track
      let targetTrackId: string | null = null;
      if (this.omniMode) {
        targetTrackId = this.activeTrackId;
      } else {
        targetTrackId = this.channelRouting.get(channel) || null;
      }

      if (targetTrackId) {
        if (cmd === 9 && velocity > 0) { // Note On
          musicEngine.playLiveNote(targetTrackId, freq, velocity);
        } else if (cmd === 8 || (cmd === 9 && velocity === 0)) { // Note Off
          musicEngine.stopLiveNote(targetTrackId, freq);
        }
      }
    }
  }

  public setActiveTrack(trackId: string | null) {
    this.activeTrackId = trackId;
    this.notify();
  }

  public setOmniMode(omni: boolean) {
    this.omniMode = omni;
    this.notify();
  }

  public routeChannel(channel: number, trackId: string) {
    this.channelRouting.set(channel, trackId);
    this.notify();
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }
}

export const midiInputManager = new MidiInputManager();
