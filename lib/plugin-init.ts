import { PluginManager } from '../plugins/core/manager';
import { VocalidoPlugin } from '../plugins/vocalido/vocalido-plugin';
import { SoundbankPlugin } from '../plugins/soundbank/soundbank-plugin';
import { AcestepPlugin } from '../plugins/acestep/acestep-plugin';

/**
 * Initializes the plugin system and registers default plugins.
 */
export const initPlugins = async () => {
  const manager = PluginManager.getInstance();

  // 1. Register Vocalido (SVS Plugin - Vocamind Cloud)
  const vocalido = new VocalidoPlugin('/vocalido/v1/synthesis');
  manager.register(vocalido);

  // 2. Register ACE-Step 1.5 (Open Source Foundation Model)
  const acestep = new AcestepPlugin('http://localhost:8000/v1/generation');
  manager.register(acestep);

  // 3. Register Soundbank (Local Plugin)
  const soundbank = new SoundbankPlugin();
  manager.register(soundbank);

  // 4. Initialize all plugins
  await manager.initAll();

  console.log('Plugin system ready with:', manager.listPlugins().map(p => p.name).join(', '));
};
