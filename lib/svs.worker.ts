/**
 * svs.worker.ts — Web Worker for SVS synthesis (non-blocking).
 * 
 * Runs ONNX Runtime inference in a background thread so the main thread
 * stays responsive. The engine will try WebGPU first (available in
 * Chrome 113+ workers), then automatically fall back to WASM/CPU.
 * 
 * Key fix: Worker type changed from 'classic' → 'module' in the proxy
 * to support ESM imports.
 */
import { ClientSvsEngine } from './ClientSvsEngine';

const engine = new ClientSvsEngine();

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  if (type === 'loadVoice') {
    const { voiceId, files, forceWasm } = payload;
    
    if (forceWasm) {
      engine.forceWasm = true;
    }
    
    // Forward debug info back to main thread (worker console.log is invisible)
    self.postMessage({
      type: 'workerDebug',
      payload: `[Worker] loadVoice: voiceId=${voiceId}, files.linguistic=${!!files.linguistic}, files.dur=${!!files.dur}, files.pitch=${!!files.pitch}, files.pitchLinguistic=${!!files.pitchLinguistic}`
    });
    
    try {
      await engine.loadVoice(voiceId, files, (prog) => {
        self.postMessage({
          type: 'loadProgress',
          payload: prog
        });
      });
      
      self.postMessage({
        type: 'workerDebug',
        payload: `[Worker] loadVoice complete: hasNeuralPipeline=${engine.hasNeuralPipeline}, provider=${engine.actualProvider}`
      });
      
      self.postMessage({
        type: 'loadSuccess',
        payload: { provider: engine.actualProvider, loadStats: engine.lastLoadStats, hasNeuralPipeline: engine.hasNeuralPipeline }
      });
    } catch (err: any) {
      self.postMessage({
        type: 'loadError',
        error: err.message || String(err)
      });
    }
  }
  
  else if (type === 'synthesize') {
    const { notes, params } = payload;
    try {
      const wavBlob = await engine.synthesize(notes, params);
      self.postMessage({
        type: 'synthSuccess',
        payload: wavBlob
      });
    } catch (err: any) {
      self.postMessage({
        type: 'synthError',
        error: err.message || String(err)
      });
    }
  }
};
