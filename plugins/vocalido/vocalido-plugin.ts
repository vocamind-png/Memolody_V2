import { IMemolodyPlugin, PluginStatus } from '../core/types';
import { telemetry } from '../../lib/Telemetry';

export interface VocalidoConfig {
  singerId: string;
  renderSteps: number;
  vocoder: string;
  gpuEnabled: boolean;
  cloudProject: string; // Vocamind Cloud Project ID
}

/**
 * Vocalido Plugin: High-fidelity AI Singing Voice Synthesis (Vocamind Cloud Edition)
 * 
 * Powered by OpenUtau core and Vocamind's Google Cloud Infrastructure.
 * Specialized for Multi-Nomenclature Solfege Singing (Note Names).
 */
export class VocalidoPlugin implements IMemolodyPlugin {
  id = 'vocalido-svs';
  name = 'Vocalido Cloud';
  version = '2.1.0';
  description = 'Studio-quality AI SVS specialized for musical note nomenclature singing.';
  status: PluginStatus = 'idle';

  // --- MANDATORY: POINT TO LOCAL BACKEND FOR DEVELOPMENT ---
  private cloudEndpoint: string = '/studio/synthesis';
  
  public config: VocalidoConfig = {
    singerId: 'vocamind-premium-01',
    renderSteps: 512,
    vocoder: 'nsf-hifigan',
    gpuEnabled: true,
    cloudProject: 'vocamind-svs-cloud'
  };

  private availableSingers: { id: string, name: string }[] = [
    { id: 'vocamind-premium-01', name: 'Nimo Premium (Female)' },
    { id: 'vocamind-premium-02', name: 'Zol Premium (Male)' }
  ];

  constructor(endpoint?: string) {
    if (endpoint) this.cloudEndpoint = endpoint;
    console.log('[Vocalido] Plugin Initialized. Endpoint:', this.cloudEndpoint);
  }

  async init(): Promise<void> {
    this.status = 'loading';
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      this.status = 'ready';
    } catch (e) {
      this.status = 'error';
    }
  }

  async execute(data: { lyrics: string[], notes: any[], lyricMode?: string, songKey?: string, params?: any }): Promise<string> {
    if (this.status !== 'ready') {
      throw new Error('Vocalido: Cloud engine not ready.');
    }

    this.status = 'processing';
    const renderStartTime = Date.now();
    
    // Check if RunPod config is available in Vite environment
    const runpodUrl = import.meta.env.VITE_RUNPOD_API_URL;
    const runpodKey = import.meta.env.VITE_RUNPOD_API_KEY;

    try {
      const notesWithLyrics = data.notes.map((n, idx) => {
        const lyricMode = (data.lyricMode as any) || 'Movable Do';
        const generatedLyric = this.generatePhoneticLyric(n, lyricMode, data.songKey || 'C');
        
        return {
          midi: this.noteToMidi(n.step, n.octave, n.alter),
          duration: n.duration,
          startTime: n.startTime,
          lyric: data.lyrics[idx] || generatedLyric
        };
      });

      if (runpodUrl && runpodKey) {
        console.log('[Vocalido] 🚀 Sending Request to RunPod Serverless Endpoint');
        const payload = {
          input: {
            notes: notesWithLyrics,
            params: data.params || {}
          }
        };

        const response = await fetch(runpodUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${runpodKey}`
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`RunPod API Error (${response.status}): ${err}`);
        }

        const json = await response.json();
        
        if (json.status !== "COMPLETED") {
             throw new Error("RunPod synthesis failed: " + JSON.stringify(json));
        }

        const b64 = json.output.audio_b64;
        if (!b64) {
          throw new Error("RunPod returned empty audio.");
        }

        // Convert base64 to Blob URL
        const binaryString = window.atob(b64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "audio/wav" });
        const audioUrl = URL.createObjectURL(blob);
        
        const durationSec = (Date.now() - renderStartTime) / 1000;
        telemetry.track('vocalido_render', { renderSeconds: durationSec, provider: 'runpod' });
        
        console.log('[Vocalido] ✅ Audio ready from RunPod Serverless');
        this.status = 'ready';
        return audioUrl;

      } else {
        console.log('[Vocalido] 🚀 Sending Request to Local/Legacy Endpoint:', this.cloudEndpoint);
        const payload = {
          notes: notesWithLyrics,
          params: data.params || {}
        };

        const response = await fetch(this.cloudEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Cloud API Error (${response.status}): ${err}`);
        }

        const json = await response.json();
        const audioUrl = json.audio_url as string;
        
        const durationSec = (Date.now() - renderStartTime) / 1000;
        telemetry.track('vocalido_render', { renderSeconds: durationSec, provider: 'legacy' });
        
        console.log('[Vocalido] ✅ Audio ready at:', audioUrl);

        this.status = 'ready';
        return audioUrl;
      }
    } catch (e) {
      this.status = 'error';
      console.error('[Vocalido] Synthesis Failed:', e);
      throw e;
    }
  }

  private generatePhoneticLyric(n: any, mode: string, songKey: string): string {
    const absPitch = (n.step.toUpperCase()) + (n.alter === 1 ? '#' : n.alter === -1 ? 'b' : '');
    const pitchToSyllable: Record<string, string> = {
      'C': 'Do', 'C#': 'Di', 'Db': 'Ra', 'D': 'Re', 'D#': 'Ri', 'Eb': 'Me', 
      'E': 'Mi', 'F': 'Fa', 'F#': 'Fi', 'Gb': 'Se', 'G': 'So', 'G#': 'Si', 
      'Ab': 'Le', 'A': 'La', 'A#': 'Li', 'Bb': 'Te', 'B': 'Ti'
    };

    const alphabetSyllables: Record<string, string> = {
      'C': 'See', 'C#': 'See Sharp', 'Db': 'Dee Flat', 'D': 'Dee', 'D#': 'Dee Sharp', 
      'Eb': 'Eee Flat', 'E': 'Eee', 'F': 'Ef', 'F#': 'Ef Sharp', 'Gb': 'Gee Flat', 
      'G': 'Gee', 'G#': 'Gee Sharp', 'Ab': 'Ay Flat', 'A': 'Ay', 'A#': 'Ay Sharp', 
      'Bb': 'Bee Flat', 'B': 'Bee'
    };

    const sargamSyllables = ['Sa', 'Re', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni'];

    switch(mode) {
      case 'Alphabet':
        return alphabetSyllables[absPitch] || 'La';
      case 'Fixed Do':
        return pitchToSyllable[absPitch] || 'Do';
      case 'Indian': {
        const keyBaseMidi = this.noteToMidi(songKey.replace(/[#b]/g, ''), 4, songKey.includes('#') ? 1 : songKey.includes('b') ? -1 : 0);
        const noteMidi = this.noteToMidi(n.step, n.octave, n.alter);
        const scaleDeg = (noteMidi - keyBaseMidi) % 12;
        const degToIdx: Record<number, number> = { 0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6 };
        return sargamSyllables[degToIdx[scaleDeg] % 7] || 'Sa';
      }
      default:
        return pitchToSyllable[absPitch] || 'La';
    }
  }

  private noteToMidi(step: string, octave: number, alter: number): number {
    const stepIdx = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(step.toUpperCase());
    return (octave + 1) * 12 + (stepIdx === -1 ? 0 : stepIdx) + (alter || 0);
  }

  updateConfig(newConfig: Partial<VocalidoConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  getSingers() {
    return this.availableSingers;
  }
}
