import { IMemolodyPlugin, PluginStatus } from '../core/types';

export interface AcestepConfig {
  modelId: string;
  renderSteps: number;
  gpuEnabled: boolean;
  guidanceScale: number;
}

/**
 * ACE-Step 1.5 Plugin: Open-source AI Music & Vocal Generation
 * 
 * Powered by StepFun and ACE Studio foundation models.
 * Capable of full song generation and vocal-to-instrumental conversion.
 */
export class AcestepPlugin implements IMemolodyPlugin {
  id = 'acestep-1.5';
  name = 'ACE-Step 1.5';
  version = '1.5.0';
  description = 'Open-source AI music foundation model for song and vocal generation.';
  status: PluginStatus = 'idle';

  private apiEndpoint: string = 'http://localhost:8001/v1/generation';
  
  public config: AcestepConfig = {
    modelId: 'acestep-1.5-base',
    renderSteps: 50,
    gpuEnabled: true,
    guidanceScale: 7.5
  };

  constructor(endpoint?: string) {
    if (endpoint) this.apiEndpoint = endpoint;
    console.log('[ACE-Step] Plugin Initialized. Endpoint:', this.apiEndpoint);
  }

  async init(): Promise<void> {
    this.status = 'loading';
    try {
      // Simulate connection check
      await new Promise(resolve => setTimeout(resolve, 500));
      this.status = 'ready';
    } catch (e) {
      this.status = 'error';
    }
  }

  async execute(data: { prompt: string, lyrics?: string[], duration?: number, params?: any }): Promise<string> {
    if (this.status !== 'ready') {
      throw new Error('ACE-Step: Engine not ready. Make sure the local server is running.');
    }

    this.status = 'processing';
    console.log('[ACE-Step] 🚀 Generating with prompt:', data.prompt);

    try {
      const payload = {
        prompt: data.prompt,
        lyrics: data.lyrics || [],
        duration: data.duration || 30,
        params: { ...this.config, ...data.params }
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`ACE-Step API Error (${response.status}): ${err}`);
      }

      const json = await response.json();
      const audioUrl = json.audio_url as string;
      console.log('[ACE-Step] ✅ Generation complete:', audioUrl);

      this.status = 'ready';
      return audioUrl;
    } catch (e) {
      this.status = 'error';
      console.error('[ACE-Step] Generation Failed:', e);
      throw e;
    }
  }

  updateConfig(newConfig: Partial<AcestepConfig>) {
    this.config = { ...this.config, ...newConfig };
  }
}
