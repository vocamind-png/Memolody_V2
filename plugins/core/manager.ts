import { IMemolodyPlugin } from './types';

/**
 * Plugin Manager: Host for all plugins in Memolody V2
 * 
 * Provides a central point for registering and accessing plugins.
 */
export class PluginManager {
  private static instance: PluginManager;
  private plugins: Map<string, IMemolodyPlugin> = new Map();

  private constructor() {}

  /**
   * Singleton instance accessor
   */
  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * Registers a plugin with the system
   */
  public register(plugin: IMemolodyPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin with ID ${plugin.id} is already registered.`);
      return;
    }
    this.plugins.set(plugin.id, plugin);
    console.log(`Plugin '${plugin.name}' (v${plugin.version}) registered.`);
  }

  /**
   * Unregisters a plugin from the system
   */
  public unregister(pluginId: string): void {
    if (this.plugins.has(pluginId)) {
      this.plugins.delete(pluginId);
      console.log(`Plugin with ID ${pluginId} unregistered.`);
    }
  }

  /**
   * Retrieves a plugin by its ID
   */
  public getPlugin<T extends IMemolodyPlugin>(pluginId: string): T | undefined {
    return this.plugins.get(pluginId) as T | undefined;
  }

  /**
   * List all registered plugins
   */
  public listPlugins(): IMemolodyPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Initializes all registered plugins
   */
  public async initAll(): Promise<void> {
    console.log('Plugin Manager: Initializing all plugins...');
    const promises = Array.from(this.plugins.values()).map(p => p.init());
    await Promise.allSettled(promises);
    console.log('Plugin Manager: Initialization complete.');
  }
}
