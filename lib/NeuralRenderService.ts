import { TrackState, ParsedNote } from '../types';

/**
 * NeuralRenderService
 * 
 * Simulates sending symbolic MIDI/MusicXML data to a Neural Audio Synthesis backend 
 * (like DiffSinger, Ace Studio, or MIDI-DDSP) and returning a high-fidelity audio stem.
 */
export class NeuralRenderService {
  /**
   * Renders a symbolic track into a high-fidelity audio URL.
   * In a real implementation, this would POST the notes/MusicXML to a Python/GPU backend.
   */
  static async renderTrack(track: TrackState, notes: ParsedNote[]): Promise<string> {
    console.log(`[NeuralRender] Starting render for track ${track.id} (${track.name}) [Mode: ${track.mode}]`);
    
    try {
      // 1. Generate MIDI Blob for the track notes
      const { MidiWriter } = await import('./MidiWriter');
      const midiBlob = MidiWriter.generateMidiBlob(notes, 120); // Default to 120, ideally passed from song metadata
      
      const formData = new FormData();
      formData.append('midi_file', midiBlob, `${track.id}.mid`);

      if (track.mode === 'vocal') {
        // Send to Vocalido Engine (DiffSinger)
        const response = await fetch('/vocalido/v1/render_vocal', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Vocalido server failed');
        const audioBlob = await response.blob();
        return URL.createObjectURL(audioBlob);

      } else {
        // Send to Maestro Synth Server
        let instrumentPreset = '0,0'; // Default Piano
        if (track.instrument === 'bass') instrumentPreset = '0,33';
        if (track.instrument === 'drums') instrumentPreset = '128,0';
        
        formData.append('instrument_preset', instrumentPreset);
        
        const response = await fetch('http://localhost:8001/render_midi', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Maestro server failed');
        const audioBlob = await response.blob();
        return URL.createObjectURL(audioBlob);
      }
    } catch (e) {
      console.error(`[NeuralRender] Render failed for ${track.id}:`, e);
      // Fallback to mock if servers are offline
      console.warn('[NeuralRender] Falling back to mock audio...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (track.mode === 'vocal') return '/mock_audio/vocal_stem.wav';
      return track.instrument === 'bass' ? '/mock_audio/bass_stem.wav' : '/mock_audio/piano_stem.wav';
    }
  }

  /**
   * Batch renders multiple tracks.
   */
  static async renderArrangement(tracks: TrackState[], allNotes: Record<string, ParsedNote[]>): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};
    
    // Render in parallel
    const promises = tracks.map(async (track) => {
      const notes = allNotes[track.id] || [];
      urls[track.id] = await this.renderTrack(track, notes);
    });
    
    await Promise.all(promises);
    console.log('[NeuralRender] Arrangement rendering complete.');
    return urls;
  }
}
