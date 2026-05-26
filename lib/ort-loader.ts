/**
 * ESM wrapper for ONNX Runtime Web.
 * 
 * ort.min.js declares: var ort = (()=>{...})();
 * In a new Function() scope, `var ort` creates a LOCAL variable,
 * not a global. We fix this by wrapping the script to explicitly
 * assign to globalThis.ort after execution.
 */

let ortInstance: any = null;

export async function loadOrt(): Promise<any> {
  if (ortInstance) return ortInstance;
  
  // Check if already loaded globally (e.g., from <script> tag on main thread)
  if (typeof globalThis !== 'undefined' && (globalThis as any).ort) {
    ortInstance = (globalThis as any).ort;
    return ortInstance;
  }
  
  const baseUrl = (typeof self !== 'undefined' && self.location && self.location.origin)
    ? self.location.origin
    : '';
  const scriptUrl = `${baseUrl}/ort/ort.min.js`;
  
  console.log(`[ort-loader] Fetching ONNX Runtime from ${scriptUrl}...`);
  
  const response = await fetch(scriptUrl);
  if (!response.ok) {
    throw new Error(`[ort-loader] Failed to fetch ort.min.js: HTTP ${response.status}`);
  }
  const scriptText = await response.text();
  
  // ort.min.js uses: var ort = (()=>{...})();
  // Inside new Function(), `var ort` is LOCAL, not global.
  // Fix: append a line that copies the local `ort` to globalThis.
  const wrappedScript = scriptText + '\n;if(typeof ort!=="undefined"){globalThis.ort=ort;}';
  
  const fn = new Function(wrappedScript);
  fn();
  
  if ((globalThis as any).ort) {
    ortInstance = (globalThis as any).ort;
    console.log(`[ort-loader] ✅ ONNX Runtime v${ortInstance.env?.versions?.ort || '?'} loaded successfully`);
    return ortInstance;
  }
  
  throw new Error('[ort-loader] ort.min.js executed but globalThis.ort is not defined');
}
