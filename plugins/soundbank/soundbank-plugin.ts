import { IMemolodyPlugin, PluginStatus } from '../core/types';

/**
 * Soundbank Plugin: Basic instrument sound generator
 * 
 * This plugin serves as a local fallback or generic instrument soundbank.
 */
export class SoundbankPlugin implements IMemolodyPlugin {
  id = 'local-soundbank';
  name = 'Standard Soundbank';
  version = '1.0.0';
  description = 'General MIDI compatible sounds for accompaniment.';
  status: PluginStatus = 'idle';

  async init(): Promise<void> {
    this.status = 'loading';
    // Simulate loading local soundfonts
    await new Promise(resolve => setTimeout(resolve, 500));
    this.status = 'ready';
    console.log('Soundbank: Local sounds loaded.');
  }

  async execute(data: any): Promise<any> {
    console.log('Soundbank: Playing notes...', data);
    return { status: 'success', message: 'Played locally' };
  }
}
