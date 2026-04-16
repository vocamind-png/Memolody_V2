/**
 * Base status for all plugins in Memolody V2
 */
export type PluginStatus = 'idle' | 'loading' | 'ready' | 'processing' | 'error';

/**
 * Common interface for all plugins
 */
export interface IMemolodyPlugin {
  id: string;          // e.g., 'vocalido-synthesis'
  name: string;        // Human readable name: 'Vocalido AI'
  version: string;     // Semantic version: '1.0.0'
  description: string; // Brief explanation of what the plugin does
  status: PluginStatus;
  
  /**
   * Called to initialize the plugin (e.g., connect to server, load models)
   */
  init(): Promise<void>;
  
  /**
   * Main execution method for the plugin's primary function
   */
  execute(data: any): Promise<any>;
}
