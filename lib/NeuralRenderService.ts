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
   * Renders a track using the Instrumento (MIDI-DDSP) backend.
   */
  static async renderInstrumento(track: TrackState, notes: ParsedNote[]): Promise<string> {
    console.log(`[NeuralRender] Starting Instrumento render for track ${track.id} (${track.instrument})`);
    try {
      const { MidiWriter } = await import('./MidiWriter');
      const midiBlob = MidiWriter.generateMidiBlob(notes, 120);
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(midiBlob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const cleanB64 = base64data.includes(',') ? base64data.split(',')[1] : base64data;
          
          try {
            const runpodUrl = import.meta.env.VITE_RUNPOD_API_URL;
            const runpodKey = import.meta.env.VITE_RUNPOD_API_KEY;
            
            if (runpodUrl && runpodKey) {
              console.log('[NeuralRender] Using RunPod Serverless for Instrumento');
              const runpodPayload = {
                input: {
                  task_type: 'instrumento',
                  midi_base64: cleanB64,
                  instrument_name: track.instrument || 'violin'
                }
              };
              
              const rpResponse = await fetch(runpodUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${runpodKey}`
                },
                body: JSON.stringify(runpodPayload)
              });
              
              if (!rpResponse.ok) throw new Error(`RunPod Error: ${await rpResponse.text()}`);
              
              let rpJson = await rpResponse.json();
              let status = rpJson.status;
              const jobId = rpJson.id;
              
              if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') {
                const statusUrl = runpodUrl.endsWith('/runsync')
                  ? runpodUrl.replace('/runsync', `/status/${jobId}`)
                  : runpodUrl.replace('/run', `/status/${jobId}`);
                
                let attempts = 0;
                while ((status === 'IN_QUEUE' || status === 'IN_PROGRESS') && attempts < 120) {
                  await new Promise(r => setTimeout(r, 2000));
                  attempts++;
                  const pollResponse = await fetch(statusUrl, {
                    headers: { 'Authorization': `Bearer ${runpodKey}` }
                  });
                  if (!pollResponse.ok) throw new Error(`RunPod Status Error`);
                  rpJson = await pollResponse.json();
                  status = rpJson.status;
                }
              }
              
              if (status !== 'COMPLETED') throw new Error(`RunPod failed: ${status}`);
              
              const out = rpJson.output;
              if (out.error) throw new Error(out.error);
              if (out.audio_b64) {
                const byteCharacters = atob(out.audio_b64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: out.mime_type || 'audio/mpeg' });
                resolve(URL.createObjectURL(blob));
                return;
              }
              throw new Error("No audio returned from RunPod");
            }
            
            // Fallback to legacy Colab/RunPod Proxy Prompt
            let colabUrl = localStorage.getItem('instrumento_colab_url');
            if (!colabUrl) {
              colabUrl = prompt('Please enter your Runpod Proxy URL or Google Colab Ngrok URL for Instrumento AI:');
              if (colabUrl) {
                colabUrl = colabUrl.replace(/\/$/, '');
                localStorage.setItem('instrumento_colab_url', colabUrl);
              } else {
                return reject(new Error("Endpoint URL is required to render Instrumento AI."));
              }
            }

            const response = await fetch(`${colabUrl}/api/instrumento/render`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
              },
              body: JSON.stringify({
                midi_base64: base64data,
                instrument_name: track.instrument || 'violin'
              })
            });
            const data = await response.json();
            if (data.success) {
              if (data.audio_base64) {
                const response = await fetch(data.audio_base64);
                const blob = await response.blob();
                resolve(URL.createObjectURL(blob));
              } else {
                resolve(data.data.url);
              }
            } else {
              reject(new Error(data.message));
            }
          } catch (e: any) {
            if (e.message === 'Failed to fetch') localStorage.removeItem('instrumento_colab_url');
            reject(e);
          }
        };
      });
    } catch (e) {
      console.error(`[NeuralRender] Instrumento render failed for ${track.id}:`, e);
      throw e;
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
