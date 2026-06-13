/**
 * ClientSvsEngine.ts
 * Implements client-side browser-based Vocal Synthesis using ONNX Runtime Web.
 * Supports WebGPU with automatic WebAssembly (CPU) fallback.
 * Uses the Cache API to persist the downloaded models (acoustic & vocoder) locally.
 */

declare global {
  interface Window {
    ort: any;
  }
}

// Global reference to ONNX Runtime
const getOrt = () => {
  if (typeof window !== 'undefined' && window.ort) {
    return window.ort;
  }
  if (typeof self !== 'undefined' && (self as any).ort) {
    return (self as any).ort;
  }
  return null;
};

const sendWorkerDebug = (msg: string) => {
  console.log(msg);
  if (typeof self !== 'undefined' && (self as any).postMessage) {
    (self as any).postMessage({
      type: 'workerDebug',
      payload: msg
    });
  }
};

// Solfège Syllable to Phoneme Map
const SOLFEGE_MAP: Record<string, string> = {
  "do":  "d ow",   "doh": "d ow",
  "re":  "r ey",   "ray": "r ey",
  "mi":  "m iy",   "me":  "m iy",
  "fa":  "f aa",   "fah": "f aa",
  "sol": "s ow l", "soh": "s ow",
  "la":  "l aa",   "lah": "l aa",
  "ti":  "t iy",   "si":  "s iy",
  "di":  "d iy",
  "ri":  "r iy",
  "fi":  "f iy",
  "li":  "l iy",
  "ra":  "r aa",
  "se":  "s ey",
  "le":  "l ey",
  "te":  "t ey",
  "raw": "r ao",   "maw": "m ao",
  "saw": "s ao",   "law": "l ao",
  "taw": "t ao",
  "ru":  "r uw",   "mu":  "m uw",
  "su":  "s uw",   "lu":  "l uw",
  "tu":  "t uw",
  "ah":  "aa",     "oh":  "ow",    "ee":  "iy",
  "d": "d ow", "r": "r ey", "m": "m iy",
  "f": "f aa", "s": "s ow l", "l": "l aa", "t": "t iy",
  "ma": "m aa", "sa": "s aa", "ta": "t aa",
  "ga": "g aa", "pa": "p aa", "dha": "dh aa", "ni": "n iy",

  // Jianpu
  "1":   "iy",
  "2":   "er",
  "3":   "s ae n",
  "4":   "s iy",
  "5":   "w uw",
  "6":   "l iy uw",
  "7":   "ch iy",
  "#1":  "sh ae n g iy",
  "#2":  "sh ae n g er",
  "#4":  "sh ae n g s iy",
  "#5":  "sh ae n g w uw",
  "#6":  "sh ae n g l iy",
  "b2":  "j y ae n er",
  "b3":  "j y ae n s ae n",
  "b5":  "j y ae n w uw",
  "b6":  "j y ae n l iy",
  "b7":  "j y ae n ch iy",
};

// Compact Pinyin map for basic Chinese support
const PINYIN_MAP: Record<string, string> = {
  "a": "a", "o": "o", "e": "e", "i": "i", "u": "u", "v": "v",
  "ai": "ai", "ei": "ei", "ui": "ui", "ao": "ao", "ou": "ou", "iu": "iu",
  "ie": "ie", "ve": "ve", "er": "er", "an": "an", "en": "en", "in": "in",
  "un": "un", "vn": "vn", "ang": "ang", "eng": "eng", "ing": "ing", "ong": "ong",
  "ba": "b a", "bo": "b o", "bi": "b i", "bu": "b u",
  "pa": "p a", "po": "p o", "pi": "p i", "pu": "p u",
  "ma": "m a", "mo": "m o", "mi": "m i", "mu": "m u",
  "fa": "f a", "fo": "f o", "fu": "f u",
  "da": "d a", "de": "d e", "di": "d i", "du": "d u",
  "ta": "t a", "te": "t e", "ti": "t i", "tu": "t u",
  "na": "n a", "ne": "n e", "ni": "n i", "nu": "n u",
  "la": "l a", "le": "l e", "li": "l i", "lu": "l u",
  "ga": "g a", "ge": "g e", "gu": "g u",
  "ka": "k a", "ke": "k e", "ku": "k u",
  "ha": "h a", "he": "h e", "hu": "h u",
  "ji": "j i", "ju": "j v", "qi": "q i", "qu": "q v", "xi": "x i", "xu": "x v",
  "yi": "y i", "wu": "w u", "yu": "y v"
};

export interface VoiceModelFiles {
  acoustic: string;
  vocoder: string;
  dictionary?: string;
  phonemes?: string;
  embeds?: Record<string, string>;
  // Neural sub-models for high-quality synthesis
  linguistic?: string;       // linguistic.onnx (dsmain)
  dur?: string;              // dur.onnx (dsdur)
  pitch?: string;            // pitch.onnx (dspitch)
  pitchLinguistic?: string;  // dspitch/linguistic.onnx (separate encoder for pitch)
}

export interface ClientSvsParams {
  bpm?: number;
  formant_shift?: number; // UI maps to -6..6
  speed?: number; // UI maps to 0.5..2.0
  breathiness?: number; // UI maps to 0..100
  vocal_mode?: string; // 'root' | 'fragrance' | 'nectar'
  depth?: number;
  steps?: number;
  warmth?: number; // EQ -1..1
  brightness?: number; // EQ -1..1
  reverb?: number; // 0..1
  timing_feel?: number; // 0..100 (0 = quantized, 100 = lazy/jazz)
  portamento?: number; // Glide time in ms (default 120.0)
  vibrato_start?: number; // Delay before vibrato starts in ms (default 100)
  vibrato_depth?: number; // Depth of vibrato in cents (0 = off)
  vibrato_speed?: number; // Speed of vibrato in Hz (default 4.8)
  vibrato_sync?: boolean; // Sync vibrato speed to BPM (default false)
  pitch_blend?: number; // Blend neural pitch with MIDI pitch (0.0 = MIDI, 1.0 = Neural)
}

export interface NoteData {
  pitch?: number;
  midi?: number;
  duration: number; // beats
  startTime: number; // beats
  lyric: string;
}

export interface SvsEngineProgress {
  stage: 'downloading' | 'initializing' | 'ready' | 'error';
  message: string;
  progress: number; // 0-100 overall
}

export class ClientSvsEngine {
  private acousticSession: any = null;
  private vocoderSession: any = null;
  private linguisticSession: any = null;
  private durSession: any = null;
  private pitchSession: any = null;
  private pitchLinguisticSession: any = null;
  public hasNeuralPipeline = false;
  private dictionaryMap: Record<string, string[]> = {};
  private phonemeToId: Record<string, number> = {};
  private speakerEmbeds: Record<string, Float32Array> = {};
  private defaultEmbed: Float32Array | null = null;
  
  private sr = 44100;
  private maxDepth = 0.6;
  private isLoaded = false;
  private activeVoiceId = '';
  private lastLoadedFiles: VoiceModelFiles | null = null;
  private forceWasm = false;
  private hasWarmedUp = false;
  public actualProvider: 'webgpu' | 'wasm' = 'wasm';
  /** Tracks how many files were loaded from cache vs network in the last loadVoice call */
  public lastLoadStats = { cached: 0, downloaded: 0 };

  constructor() {}

  /**
   * Helper to fetch file via Cache API with progress reporting.
   * Returns { buffer, fromCache } so callers can distinguish cache hits from fresh downloads.
   */
  private async fetchWithCache(url: string, onProgress: (pct: number) => void): Promise<{ buffer: ArrayBuffer; fromCache: boolean }> {
    const cacheName = 'vocalido-models';
    
    try {
      const cache = await caches.open(cacheName);
      const cachedResponse = await cache.match(url);
      
      if (cachedResponse) {
        console.log(`[ClientSvsEngine] ⚡ Cache hit: ${url}`);
        const blob = await cachedResponse.blob();
        onProgress(100);
        return { buffer: await blob.arrayBuffer(), fromCache: true };
      }
    } catch (e) {
      console.warn(`[ClientSvsEngine] Cache API not available/errored:`, e);
    }

    console.log(`[ClientSvsEngine] Starting resilient download from: ${url}`);
    
    let receivedBytes = 0;
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];
    
    let retries = 8;
    let delay = 1000;
    let supportsRange = true;
    let currentUrl = url;
    let fallbackUrl = url;

    if (url.startsWith('https://storage.googleapis.com/memolody-vault/voicebanks/')) {
      fallbackUrl = url.replace('https://storage.googleapis.com/memolody-vault/voicebanks/', '/vocalido/voicebanks/');
    } else if (url.startsWith('/vocalido/voicebanks/')) {
      fallbackUrl = url.replace('/vocalido/voicebanks/', 'https://storage.googleapis.com/memolody-vault/voicebanks/');
    }

    while (totalBytes === 0 || receivedBytes < totalBytes) {
      const controller = new AbortController();
      let lastActiveTime = Date.now();
      
      // Watchdog interval to abort if download stalls for more than 12 seconds
      const watchdog = setInterval(() => {
        if (Date.now() - lastActiveTime > 12000) {
          console.warn(`[ClientSvsEngine] Watchdog: Download stalled for ${currentUrl}. Aborting to retry/resume...`);
          controller.abort();
        }
      }, 3000);

      try {
        const headers: Record<string, string> = {};
        if (receivedBytes > 0 && supportsRange) {
          headers['Range'] = `bytes=${receivedBytes}-`;
        }

        const response = await fetch(currentUrl, {
          headers,
          credentials: 'omit', // Explicitly omit credentials to bypass CORP headers under COEP credentialless
          signal: controller.signal
        });

        if (!response.ok && response.status !== 206) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // If we requested a range but got 200, the server doesn't support Range.
        // We must discard previous chunks and download from scratch.
        if (receivedBytes > 0 && response.status !== 206) {
          console.warn(`[ClientSvsEngine] Server did not support 206 for range. Restarting from byte 0.`);
          receivedBytes = 0;
          chunks.length = 0;
          supportsRange = false;
        }

        if (receivedBytes === 0) {
          const contentLength = response.headers.get('content-length');
          totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          // Fallback if reader is not supported
          const blob = await response.blob();
          const arrayBuf = await blob.arrayBuffer();
          const view = new Uint8Array(arrayBuf);
          chunks.push(view);
          receivedBytes += view.length;
          clearInterval(watchdog);
          break;
        }

        let streamFinished = false;
        let lastProgressTime = 0;
        while (true) {
          lastActiveTime = Date.now(); // Feed the watchdog
          const { done, value } = await reader.read();
          if (done) {
            streamFinished = true;
            break;
          }
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            lastActiveTime = Date.now(); // Feed the watchdog again
            if (totalBytes > 0) {
              const now = Date.now();
              // Throttle progress updates to once every 100ms or on completion
              if (now - lastProgressTime > 100 || receivedBytes === totalBytes) {
                onProgress(Math.round((receivedBytes / totalBytes) * 100));
                lastProgressTime = now;
              }
            }
          }
        }

        clearInterval(watchdog);

        if (streamFinished && (totalBytes === 0 || receivedBytes >= totalBytes)) {
          break; // Successfully downloaded everything!
        } else {
          throw new Error(`Stream closed prematurely. Received ${receivedBytes}/${totalBytes} bytes.`);
        }

      } catch (err: any) {
        clearInterval(watchdog);
        console.warn(`[ClientSvsEngine] Download error/stall on ${currentUrl} at byte ${receivedBytes}: ${err.message || err}`);
        
        retries--;
        if (retries < 0) {
          throw new Error(`Failed to download ${url} after multiple attempts. Last error: ${err.message || err}`);
        }

        // Fast-fail to fallback URL if server returns a 50x error (like 500 Internal Server Error, 502 Bad Gateway)
        const isServerError = err.message && err.message.includes('HTTP 50');
        
        // Switch to fallback URL if retries hit 4, OR if we got a server error
        if ((retries === 4 || isServerError) && currentUrl !== fallbackUrl) {
          console.warn(`[ClientSvsEngine] Switching to fallback URL: ${fallbackUrl}`);
          currentUrl = fallbackUrl;
          receivedBytes = 0;
          chunks.length = 0;
        }

        // Wait with exponential backoff
        console.log(`[ClientSvsEngine] Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(8000, delay * 1.5);
      }
    }

    // Combine chunks into single ArrayBuffer
    const allChunks = new Uint8Array(receivedBytes);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    // Save to Cache API
    try {
      const cache = await caches.open(cacheName);
      const blob = new Blob([allChunks]);
      await cache.put(url, new Response(blob, {
        headers: {
          'Content-Type': url.endsWith('.onnx') ? 'application/octet-stream' : 'text/plain',
          'Content-Length': receivedBytes.toString()
        }
      }));
      console.log(`[ClientSvsEngine] ✅ Stored model in Cache API: ${url}`);
    } catch (e) {
      console.warn(`[ClientSvsEngine] Failed to save downloaded model to Cache API:`, e);
    }

    onProgress(100);
    return { buffer: allChunks.buffer, fromCache: false };
  }

  /**
   * Ensures that ONNX Runtime Web script is loaded in window or worker.
   */
  private async ensureOrtLoaded(): Promise<any> {
    if (typeof document === 'undefined') {
      // Running inside Web Worker context — use ESM-compatible loader
      if (typeof self !== 'undefined' && (self as any).ort) {
        return (self as any).ort;
      }
      // Dynamic import of our ESM wrapper (works in module workers)
      const { loadOrt } = await import('./ort-loader');
      return await loadOrt();
    }

    if (typeof window === 'undefined') {
      throw new Error('ONNX Runtime cannot be loaded: window is undefined');
    }
    if (window.ort) {
      return window.ort;
    }
    console.log('[ClientSvsEngine] ONNX Runtime not found in window. Loading dynamically from /ort/ort.min.js...');
    return new Promise<any>((resolve, reject) => {
      let script = document.querySelector('script[src="/ort/ort.min.js"]') as HTMLScriptElement;
      if (!script) {
        script = document.createElement('script');
        script.src = '/ort/ort.min.js';
        script.defer = true;
        document.head.appendChild(script);
      }
      
      const checkInterval = setInterval(() => {
        if (window.ort) {
          clearInterval(checkInterval);
          console.log('[ClientSvsEngine] ONNX Runtime loaded successfully.');
          resolve(window.ort);
        }
      }, 50);

      // Timeout after 15 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (window.ort) {
          resolve(window.ort);
        } else {
          reject(new Error('Timeout loading ONNX Runtime from /ort/ort.min.js'));
        }
      }, 15000);
    });
  }

  /**
   * Initializes the engine by downloading the ONNX files and starting sessions.
   */
  public async loadVoice(
    voiceId: string,
    files: VoiceModelFiles,
    onProgress: (state: SvsEngineProgress) => void
  ): Promise<void> {
    // Skip re-loading only if we have the same voice AND neural models are
    // already loaded (or the new files don't include them either).
    const newHasNeuralFiles = !!(files.linguistic && files.dur && files.pitch);
    const needsNeuralReload = newHasNeuralFiles && !this.hasNeuralPipeline;
    
    if (this.isLoaded && this.activeVoiceId === voiceId && !this.forceWasm && !needsNeuralReload) {
      this.lastLoadStats = { cached: 1, downloaded: 0 }; // Signal all-cached to UI
      onProgress({ stage: 'ready', message: '⚡ Voice already loaded', progress: 100 });
      return;
    }
    if (needsNeuralReload) {
      console.log('[ClientSvsEngine] 🔄 Neural models now available — reloading voice to activate full pipeline');
    }
    this.lastLoadedFiles = files;

    let ort;
    try {
      ort = await this.ensureOrtLoaded();
    } catch (e: any) {
      onProgress({ stage: 'error', message: `ONNX Error: ${e.message || e}`, progress: 0 });
      throw e;
    }

    // Setup wasm path
    const baseWasmPath = typeof self !== 'undefined' && self.location ? self.location.origin + '/ort/' : '/ort/';
    ort.env.wasm.wasmPaths = baseWasmPath;
    
    // Enable WASM Multi-threading using available CPU logical cores, fallback to 4
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    // Cap threads to a maximum of 4 to prevent CPU thread thrashing and memory overhead
    ort.env.wasm.numThreads = Math.min(4, cores);
    
    // Run ONNX inference in a background Web Worker thread (proxy = true) to prevent UI thread freezing.
    // Disable proxy if we are already inside a Web Worker to avoid nested worker errors on mobile Safari (iOS).
    // Disable proxy if WebGPU is supported and not forced off, as the ONNX WebGPU EP is incompatible with proxy mode.
    const isWorker = typeof document === 'undefined';
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator && !this.forceWasm;
    ort.env.wasm.proxy = !isWorker && !hasWebGPU;
    
    try {
      this.isLoaded = false;
      this.activeVoiceId = voiceId;
      this.speakerEmbeds = {};
      this.defaultEmbed = null;
      this.lastLoadStats = { cached: 0, downloaded: 0 };

      // 1. Download files sequentially for stability on mobile connections
      onProgress({ stage: 'downloading', message: 'Checking cache...', progress: 5 });
      
      let acousticFromCache = false;
      const acousticResult = await this.fetchWithCache(files.acoustic, (p) => {
        // p === 100 instantly on cache hit (before result is assigned)
        if (p === 100) acousticFromCache = true;
        onProgress({
          stage: 'downloading',
          message: acousticFromCache 
            ? `⚡ Loading acoustic model from cache...`
            : `📥 Downloading Acoustic Model: ${p}%`,
          progress: Math.round(10 + p * 0.4) // 10% to 50%
        });
      });
      if (acousticResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;

      let vocoderFromCache = false;
      const vocoderResult = await this.fetchWithCache(files.vocoder, (p) => {
        if (p === 100) vocoderFromCache = true;
        onProgress({
          stage: 'downloading',
          message: vocoderFromCache
            ? `⚡ Loading vocoder from cache...`
            : `📥 Downloading Vocoder Model: ${p}%`,
          progress: Math.round(50 + p * 0.2) // 50% to 70%
        });
      });
      if (vocoderResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
      
      const acousticBuffer = acousticResult.buffer;
      const vocoderBuffer = vocoderResult.buffer;

      // Download dictionary and phonemes with caching
      onProgress({ stage: 'downloading', message: 'Loading text assets...', progress: 75 });
      
      if (files.dictionary) {
        try {
          const dictResult = await this.fetchWithCache(files.dictionary, () => {});
          if (dictResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
          const decoder = new TextDecoder('utf-8');
          const dictText = decoder.decode(dictResult.buffer);
          this.parseDictionary(dictText);
        } catch (e: any) {
          console.warn('[ClientSvsEngine] Dictionary load failed:', e);
        }
      }

      if (files.phonemes) {
        try {
          const phResult = await this.fetchWithCache(files.phonemes, () => {});
          if (phResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
          const decoder = new TextDecoder('utf-8');
          const phText = decoder.decode(phResult.buffer);
          this.parsePhonemes(phText);
        } catch (e: any) {
          console.warn('[ClientSvsEngine] Phonemes load failed:', e);
        }
      }

      // Download embeds with caching if any
      if (files.embeds) {
        const embedKeys = Object.keys(files.embeds);
        for (let i = 0; i < embedKeys.length; i++) {
          const key = embedKeys[i];
          const url = files.embeds[key];
          onProgress({
            stage: 'downloading',
            message: `Downloading speaker profile '${key}'...`,
            progress: Math.round(75 + (i / embedKeys.length) * 10)
          });
          try {
            const embedResult = await this.fetchWithCache(url, () => {});
            if (embedResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
            const embedArr = new Float32Array(embedResult.buffer);
            this.speakerEmbeds[key.toLowerCase()] = embedArr;
            if (!this.defaultEmbed || key.toLowerCase() === 'root') {
              this.defaultEmbed = embedArr;
            }
          } catch (e: any) {
            console.warn(`[ClientSvsEngine] Embed load failed for ${key}:`, e);
          }
        }
      }

      // Download neural sub-models (linguistic, dur, pitch) if available
      console.log('[ClientSvsEngine] 📦 Neural model files received:', {
        linguistic: files.linguistic ? '✅ ' + files.linguistic.substring(0, 60) : '❌ missing',
        dur: files.dur ? '✅ ' + files.dur.substring(0, 60) : '❌ missing',
        pitch: files.pitch ? '✅ ' + files.pitch.substring(0, 60) : '❌ missing',
        pitchLinguistic: files.pitchLinguistic ? '✅ ' + files.pitchLinguistic.substring(0, 60) : '❌ missing',
      });
      let linguisticBuffer: ArrayBuffer | null = null;
      let durBuffer: ArrayBuffer | null = null;
      let pitchBuffer: ArrayBuffer | null = null;
      let pitchLinguisticBuffer: ArrayBuffer | null = null;

      if (files.linguistic) {
        try {
          onProgress({ stage: 'downloading', message: 'Downloading linguistic model...', progress: 78 });
          const lingResult = await this.fetchWithCache(files.linguistic, () => {});
          if (lingResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
          linguisticBuffer = lingResult.buffer;
        } catch (e: any) {
          console.warn('[ClientSvsEngine] Linguistic model download failed:', e);
        }
      }

      if (files.dur) {
        try {
          onProgress({ stage: 'downloading', message: 'Downloading duration model...', progress: 80 });
          const durResult = await this.fetchWithCache(files.dur, () => {});
          if (durResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
          durBuffer = durResult.buffer;
        } catch (e: any) {
          console.warn('[ClientSvsEngine] Duration model download failed:', e);
        }
      }

      if (files.pitch) {
        try {
          onProgress({ stage: 'downloading', message: 'Downloading pitch model...', progress: 82 });
          const pitchResult = await this.fetchWithCache(files.pitch, () => {});
          if (pitchResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
          pitchBuffer = pitchResult.buffer;
        } catch (e: any) {
          throw new Error(`Pitch model download failed: ${e.message || e}`);
        }
      }

      if (files.pitchLinguistic) {
        try {
          onProgress({ stage: 'downloading', message: 'Downloading pitch linguistic model...', progress: 83 });
          const plResult = await this.fetchWithCache(files.pitchLinguistic, () => {});
          if (plResult.fromCache) this.lastLoadStats.cached++; else this.lastLoadStats.downloaded++;
          pitchLinguisticBuffer = plResult.buffer;
        } catch (e: any) {
          console.warn('[ClientSvsEngine] Pitch linguistic model download failed:', e);
        }
      }

      // 2. Initialize sessions
      const allCached = this.lastLoadStats.downloaded === 0;
      console.log(`[ClientSvsEngine] Load stats: ${this.lastLoadStats.cached} cached, ${this.lastLoadStats.downloaded} downloaded`);
      onProgress({ stage: 'initializing', message: allCached ? '⚡ Initializing Neural Engine (cached)...' : 'Initializing Neural Engine...', progress: 85 });

      const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator && !this.forceWasm;
      let sessionOptions = {
        executionProviders: hasWebGPU ? ['webgpu', 'wasm'] : ['wasm'],
      };

      console.log(`[ClientSvsEngine] WebGPU support: ${hasWebGPU} (forceWasm=${this.forceWasm}). Using providers:`, sessionOptions.executionProviders);

      try {
        if (hasWebGPU) {
          console.log('[ClientSvsEngine] Creating Acoustic Inference Session (Attempting preferred execution provider)');
          this.acousticSession = await ort.InferenceSession.create(new Uint8Array(acousticBuffer), sessionOptions);
          
          console.log('[ClientSvsEngine] Creating Vocoder Inference Session (Attempting preferred execution provider)');
          this.vocoderSession = await ort.InferenceSession.create(new Uint8Array(vocoderBuffer), sessionOptions);
          this.actualProvider = 'webgpu';
        } else {
          throw new Error('WebGPU disabled or forced off');
        }
      } catch (gpuErr) {
        console.warn('[ClientSvsEngine] WebGPU initialization failed or disabled, falling back to WebAssembly (WASM):', gpuErr);
        onProgress({ stage: 'initializing', message: 'Optimizing Neural Engine...', progress: 90 });
        
        // Force CPU WebAssembly fallback
        sessionOptions = { executionProviders: ['wasm'] };
        this.actualProvider = 'wasm';
        
        this.acousticSession = await ort.InferenceSession.create(new Uint8Array(acousticBuffer), sessionOptions);
        this.vocoderSession = await ort.InferenceSession.create(new Uint8Array(vocoderBuffer), sessionOptions);
      }

      // Initialize neural sub-model sessions (linguistic, dur, pitch)
      this.linguisticSession = null;
      this.durSession = null;
      this.pitchSession = null;
      this.pitchLinguisticSession = null;
      this.hasNeuralPipeline = false;

      // Optimize sub-models: Try WebGPU if available to offload from the WASM heap,
      // and disable memory patterns/arenas to prevent WASM heap fragmentation and out-of-bounds errors.
      const subModelOptions: any = {
        executionProviders: hasWebGPU ? ['webgpu', 'wasm'] : ['wasm'],
        enableMemPattern: false,
        enableCpuMemArena: false,
        graphOptimizationLevel: 'disabled', // Changed from 'none' to 'disabled'
      };

      // Report buffer status (visible in main thread via progress)
      const bufferStatus = `ling=${linguisticBuffer ? linguisticBuffer.byteLength : 'null'}, dur=${durBuffer ? durBuffer.byteLength : 'null'}, pitch=${pitchBuffer ? pitchBuffer.byteLength : 'null'}, pitchLing=${pitchLinguisticBuffer ? pitchLinguisticBuffer.byteLength : 'null'}`;
      sendWorkerDebug(`[ClientSvsEngine] 📦 Buffer status: ${bufferStatus}`);
      onProgress({ stage: 'initializing', message: `Neural buffers: ${bufferStatus}`, progress: 86 });

      if (linguisticBuffer) {
        try {
          this.linguisticSession = await ort.InferenceSession.create(new Uint8Array(linguisticBuffer), subModelOptions);
          sendWorkerDebug(`[ClientSvsEngine] ✅ Linguistic session loaded. Inputs: ${this.linguisticSession.inputNames.join(', ')}`);
          linguisticBuffer = null; // Free JS memory
          await new Promise(r => setTimeout(r, 20)); // Yield to GC
        } catch (e: any) {
          sendWorkerDebug(`[ClientSvsEngine] ❌ Failed to create linguistic session: ${e.message || e}`);
          onProgress({ stage: 'initializing', message: `❌ Linguistic session FAILED: ${e.message?.substring(0, 80)}`, progress: 87 });
        }
      }

      if (durBuffer) {
        try {
          this.durSession = await ort.InferenceSession.create(new Uint8Array(durBuffer), subModelOptions);
          sendWorkerDebug(`[ClientSvsEngine] ✅ Duration session loaded. Inputs: ${this.durSession.inputNames.join(', ')}`);
          durBuffer = null; // Free JS memory
          await new Promise(r => setTimeout(r, 20)); // Yield to GC
        } catch (e: any) {
          sendWorkerDebug(`[ClientSvsEngine] ❌ Failed to create duration session: ${e.message || e}`);
          onProgress({ stage: 'initializing', message: `❌ Duration session FAILED: ${e.message?.substring(0, 80)}`, progress: 87 });
        }
      }

      if (pitchBuffer) {
        try {
          this.pitchSession = await ort.InferenceSession.create(new Uint8Array(pitchBuffer), subModelOptions);
          sendWorkerDebug(`[ClientSvsEngine] ✅ Pitch session loaded. Inputs: ${this.pitchSession.inputNames.join(', ')}`);
          pitchBuffer = null; // Free JS memory
          await new Promise(r => setTimeout(r, 20)); // Yield to GC
        } catch (e: any) {
          throw new Error(`Failed to create pitch session: ${e.message || e}`);
        }
      }

      if (pitchLinguisticBuffer) {
        try {
          this.pitchLinguisticSession = await ort.InferenceSession.create(new Uint8Array(pitchLinguisticBuffer), subModelOptions);
          sendWorkerDebug(`[ClientSvsEngine] ✅ Pitch linguistic session loaded. Inputs: ${this.pitchLinguisticSession.inputNames.join(', ')}`);
        } catch (e: any) {
          sendWorkerDebug(`[ClientSvsEngine] ❌ Failed to create pitch linguistic session: ${e.message || e}`);
          onProgress({ stage: 'initializing', message: `❌ PitchLinguistic session FAILED: ${e.message?.substring(0, 80)}`, progress: 87 });
        }
      }

      if (this.linguisticSession && this.durSession && this.pitchSession) {
        this.hasNeuralPipeline = true;
        sendWorkerDebug('[ClientSvsEngine] ✅ Full neural pipeline loaded (linguistic + dur + pitch)');
        onProgress({ stage: 'initializing', message: '✅ Neural pipeline ACTIVE!', progress: 88 });
      } else {
        const missing: string[] = [];
        if (!this.linguisticSession) missing.push('linguistic');
        if (!this.durSession) missing.push('dur');
        if (!this.pitchSession) missing.push('pitch');
        const errMsg = `❌ Neural pipeline models missing: ${missing.join(', ')}. Flat-F0 fallback has been disabled.`;
        sendWorkerDebug(`[ClientSvsEngine] ${errMsg}`);
        onProgress({ stage: 'initializing', message: errMsg, progress: 88 });
      }

      console.log('[ClientSvsEngine] Inference Sessions loaded successfully!', {
        acousticInputs: this.acousticSession.inputNames,
        acousticOutputs: this.acousticSession.outputNames,
        vocoderInputs: this.vocoderSession.inputNames,
        vocoderOutputs: this.vocoderSession.outputNames,
      });

      // 3. Warmup Run: Quick acoustic+vocoder warmup only (skip neural pipeline)
      if (!this.hasWarmedUp) {
        try {
          console.log('[ClientSvsEngine] Running warmup inference (acoustic+vocoder only)...');
          onProgress({ stage: 'initializing', message: 'Compiling AI shaders (one-time)...', progress: 95 });
          
          // Minimal warmup: run acoustic+vocoder with tiny dummy tensors
          // Do NOT run full synthesize() which can crash at low steps and trigger forceWasm=true
          const dummyTokens = new ort.Tensor('int64', BigInt64Array.from([2n, 2n]), [1, 2]);
          const dummyDur = new ort.Tensor('int64', BigInt64Array.from([2n, 2n]), [1, 2]);
          const dummyF0 = new ort.Tensor('float32', new Float32Array(4).fill(440), [1, 4]);
          const dummyGender = new ort.Tensor('float32', new Float32Array(4).fill(0), [1, 4]);
          const dummyVel = new ort.Tensor('float32', new Float32Array(4).fill(1), [1, 4]);
          const dummySpk = new ort.Tensor('float32', new Float32Array(4 * 256).fill(0), [1, 4, 256]);
          const dummyDepth = new ort.Tensor('float32', new Float32Array([0.6]), []);
          const dummySteps = new ort.Tensor('int64', BigInt64Array.from([4n]), []);
          
          const warmupInputs: Record<string, any> = {
            tokens: dummyTokens, durations: dummyDur, f0: dummyF0,
            gender: dummyGender, velocity: dummyVel,
            spk_embed: dummySpk, depth: dummyDepth, steps: dummySteps,
          };
          const validInputs: Record<string, any> = {};
          for (const name of (this.acousticSession.inputNames as string[])) {
            if (warmupInputs[name] !== undefined) validInputs[name] = warmupInputs[name];
          }
          await this.acousticSession.run(validInputs);
          console.log('[ClientSvsEngine] ✅ Acoustic warmup OK');
          
          this.hasWarmedUp = true;
          this.isLoaded = true;
          console.log('[ClientSvsEngine] ✅ Warmup completed!');
        } catch (warmupErr) {
          console.warn('[ClientSvsEngine] ⚠️ Warmup failed/skipped:', warmupErr);
          this.hasWarmedUp = true; // Don't retry on failure
          this.isLoaded = true;
        }
      } else {
        console.log('[ClientSvsEngine] ⚡ Skipping warmup (already done this session)');
        this.isLoaded = true;
      }

      const readyMsg = allCached ? '⚡ SVS ready (loaded from cache)' : '✅ SVS ready';
      onProgress({ stage: 'ready', message: readyMsg, progress: 100 });
      
    } catch (err: any) {
      console.error('[ClientSvsEngine] Initialization failed:', err);
      onProgress({ stage: 'error', message: `Load Error: ${err.message || err}`, progress: 0 });
      this.activeVoiceId = '';
      throw err;
    }
  }

  /**
   * Parse phonemes mapping file.
   */
  private parsePhonemes(text: string) {
    this.phonemeToId = {};
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        this.phonemeToId[parts[0]] = parseInt(parts[1], 10);
      } else {
        this.phonemeToId[parts[0]] = i;
      }
    }
    console.log(`[ClientSvsEngine] Parsed ${Object.keys(this.phonemeToId).length} phonemes`);
  }

  /**
   * Parse dictionary word-to-phonemes mapping.
   */
  private parseDictionary(text: string) {
    this.dictionaryMap = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const word = parts[0].toLowerCase();
        this.dictionaryMap[word] = parts.slice(1);
      }
    }
    console.log(`[ClientSvsEngine] Parsed ${Object.keys(this.dictionaryMap).length} dictionary entries`);
  }

  /**
   * Perform synthesis on notes list.
   * Returns a WAV Blob containing the raw PCM audio.
   */
  public async synthesize(
    notes: NoteData[],
    params?: ClientSvsParams
  ): Promise<Blob> {
    if (!this.isLoaded || !this.acousticSession || !this.vocoderSession) {
      throw new Error('SVS Engine is not loaded. Call loadVoice() first.');
    }

    try {
      const bpm = params?.bpm || 120.0;
      const beatSec = 60.0 / bpm;

      // 1. Sort and resolve polyphony by allocating notes to monophonic tracks
      const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime);
      const tracks: Array<{ start: number; dur: number; note: NoteData }[]> = [];
      
      for (const n of sortedNotes) {
        const start = n.startTime * beatSec;
        const dur = Math.max(0.05, n.duration * beatSec);
        let placed = false;
        
        for (const track of tracks) {
          if (track.length === 0) {
            track.push({ start, dur, note: n });
            placed = true;
            break;
          }
          const lastNote = track[track.length - 1];
          const lastEnd = lastNote.start + lastNote.dur;
          if (start >= lastEnd - 0.01) {
            track.push({ start, dur, note: n });
            placed = true;
            break;
          }
        }
        if (!placed) {
          tracks.push([{ start, dur, note: n }]);
        }
      }

      console.log(`[ClientSvsEngine] Synthesizing ${tracks.length} tracks...`);

      // 2. Synthesize each track sequentially
      const trackAudios: Float32Array[] = [];
      for (let tIdx = 0; tIdx < tracks.length; tIdx++) {
        // Yield to event loop to allow UI progress updates
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const track = tracks[tIdx];
        console.log(`[ClientSvsEngine] 🎵 Synthesizing polyphony track ${tIdx + 1}/${tracks.length} (${track.length} notes)...`);
        const audio = await this.synthesizeTrack(track, params);
        if (!audio) {
          throw new Error(`Inference returned empty audio for track ${tIdx}`);
        }
        trackAudios.push(audio);
      }

      if (trackAudios.length === 0) {
        throw new Error('No audio was synthesized from note list');
      }

      // 3. Mix tracks together
      let maxLen = 0;
      for (const audio of trackAudios) {
        if (audio.length > maxLen) maxLen = audio.length;
      }

      const mixedAudio = new Float32Array(maxLen);
      for (const audio of trackAudios) {
        for (let i = 0; i < audio.length; i++) {
          mixedAudio[i] += audio[i];
        }
      }

      // Normalize mixed audio
      let peak = 0;
      for (let i = 0; i < mixedAudio.length; i++) {
        const absVal = Math.abs(mixedAudio[i]);
        if (absVal > peak) peak = absVal;
      }
      if (peak > 0.001) {
        for (let i = 0; i < mixedAudio.length; i++) {
          mixedAudio[i] = (mixedAudio[i] / peak) * 0.95;
        }
      }

      // Check for NaN or absolute silence (common on buggy WebGPU drivers returning zeros/NaN)
      let hasNaN = false;
      let allZeros = true;
      for (let i = 0; i < mixedAudio.length; i++) {
        if (isNaN(mixedAudio[i])) {
          hasNaN = true;
        }
        if (mixedAudio[i] !== 0) {
          allZeros = false;
        }
      }

      if (hasNaN || allZeros || mixedAudio.length === 0) {
        console.warn(`[ClientSvsEngine] ⚠️ Synthesized audio is invalid (hasNaN=${hasNaN}, allZeros=${allZeros}, len=${mixedAudio.length}).`);
        if (this.actualProvider === 'webgpu' && this.lastLoadedFiles) {
          console.warn('[ClientSvsEngine] 🔄 WebGPU returned silent or NaN audio! Forcing CPU (WASM) fallback and retrying...');
          this.forceWasm = true;
          this.actualProvider = 'wasm';
          
          // Reload sessions using CPU/WASM (with a dummy progress reporter)
          await this.loadVoice(this.activeVoiceId, this.lastLoadedFiles, () => {});
          
          // Retry synthesis recursively (now under WASM)
          return await this.synthesize(notes, params);
        }
      }

      // 4. Encode as WAV Blob
      console.log(`[ClientSvsEngine] Encoding PCM buffer to WAV: ${mixedAudio.length} samples`);
      const wavBlob = this.encodeWAV(mixedAudio, this.sr);
      return wavBlob;

    } catch (synthErr) {
      if (this.actualProvider === 'webgpu' && this.lastLoadedFiles) {
        console.warn('[ClientSvsEngine] ⚠️ Synthesis failed on WebGPU. Falling back to CPU (WASM) and retrying...', synthErr);
        
        // Force WASM mode
        this.forceWasm = true;
        this.actualProvider = 'wasm';
        
        // Reload sessions using CPU/WASM (with a dummy progress reporter)
        await this.loadVoice(this.activeVoiceId, this.lastLoadedFiles, () => {});
        
        // Retry synthesis recursively (now under WASM)
        return await this.synthesize(notes, params);
      }
      // If it failed under WASM as well, propagate error
      throw synthErr;
    }
  }

  /**
   * Synthesizes a single monophonic track by splitting it into smaller chunks
   * to avoid WebGPU out-of-memory and timeout errors.
   */
  private async synthesizeTrack(
    trackNotes: Array<{ start: number; dur: number; note: NoteData }>,
    params?: ClientSvsParams
  ): Promise<Float32Array | null> {
    if (trackNotes.length === 0) {
      return new Float32Array(0);
    }

    // Sort notes by start time
    const sortedNotes = [...trackNotes].sort((a, b) => a.start - b.start);

    // Group notes into chunks
    const chunks: Array<{ start: number; dur: number; note: NoteData }[]> = [];
    let currentChunk: Array<{ start: number; dur: number; note: NoteData }> = [];

    const MAX_CHUNK_DURATION = 15.0; // seconds
    const MAX_GAP = 2.0; // seconds

    for (const note of sortedNotes) {
      if (currentChunk.length === 0) {
        currentChunk.push(note);
      } else {
        const firstNote = currentChunk[0];
        const lastNote = currentChunk[currentChunk.length - 1];
        const chunkDuration = (note.start + note.dur) - firstNote.start;
        const gap = note.start - (lastNote.start + lastNote.dur);

        if (gap > MAX_GAP || chunkDuration > MAX_CHUNK_DURATION) {
          chunks.push(currentChunk);
          currentChunk = [note];
        } else {
          currentChunk.push(note);
        }
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    console.log(`[ClientSvsEngine] Split track into ${chunks.length} chunks to optimize inference speed and VRAM.`);

    // Determine the total duration of the track in seconds to allocate the track buffer
    const lastNoteOfTrack = sortedNotes[sortedNotes.length - 1];
    const totalTrackDuration = lastNoteOfTrack.start + lastNoteOfTrack.dur + 0.5; // add a little buffer
    const trackAudioBuffer = new Float32Array(Math.ceil(totalTrackDuration * this.sr));

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      const chunkStartSec = chunk[0].start;
      
      // Shift notes in the chunk to be relative to the chunk start
      const shiftedChunkNotes = chunk.map(n => ({
        start: Math.max(0, n.start - chunkStartSec),
        dur: n.dur,
        note: n.note
      }));

      console.log(`[ClientSvsEngine] Synthesizing chunk ${cIdx + 1}/${chunks.length} | notes: ${chunk.length} | start: ${chunkStartSec.toFixed(2)}s`);
      
      // Run the synthesis on this chunk
      const chunkAudio = await this.synthesizeChunk(shiftedChunkNotes, params);
      if (!chunkAudio) {
        console.warn(`[ClientSvsEngine] Chunk ${cIdx + 1}/${chunks.length} synthesis returned null, skipping`);
        continue;
      }

      // Copy chunk audio into the track master buffer
      const startSampleIndex = Math.round(chunkStartSec * this.sr);
      for (let i = 0; i < chunkAudio.length; i++) {
        const targetIndex = startSampleIndex + i;
        if (targetIndex < trackAudioBuffer.length) {
          trackAudioBuffer[targetIndex] += chunkAudio[i];
        }
      }
    }

    return trackAudioBuffer;
  }

  /**
   * Synthesizes a single chunk of notes.
   * If the full neural pipeline is available (linguistic + dur + pitch),
   * it runs the DiffSinger neural pipeline for natural F0 prediction.
   * Otherwise, falls back to flat-F0 synthesis.
   */
  private async synthesizeChunk(
    trackNotes: Array<{ start: number; dur: number; note: NoteData }>,
    params?: ClientSvsParams
  ): Promise<Float32Array | null> {
    console.log(`[ClientSvsEngine] 🧠 synthesizeChunk: hasNeuralPipeline=${this.hasNeuralPipeline}, linguisticSession=${!!this.linguisticSession}, durSession=${!!this.durSession}, pitchSession=${!!this.pitchSession}`);
    if (this.hasNeuralPipeline) {
      try {
        return await this.synthesizeChunkNeural(trackNotes, params);
      } catch (e: any) {
        console.error('[ClientSvsEngine] ❌ Neural pipeline failed:', e);
        throw new Error(`Neural synthesis pipeline failed: ${e.message || e}`);
      }
    }
    throw new Error('Neural pipeline is not active/available. Flat-F0 fallback has been disabled.');
  }

  /**
   * Full DiffSinger neural pipeline: linguistic → dur → pitch → acoustic → vocoder.
   * Faithfully mirrors the Python server's _synthesize_track_neural().
   */
  private async synthesizeChunkNeural(
    trackNotes: Array<{ start: number; dur: number; note: NoteData }>,
    params?: ClientSvsParams
  ): Promise<Float32Array | null> {
    const ort = getOrt();
    const hopSize = 512;
    const frameHz = this.sr / hopSize;
    const SP_ID = this.phonemeToId['SP'] ?? 2;

    // 1. Determine speaker embedding and its dimensionality
    const selectedMode = (params?.vocal_mode || 'root').toLowerCase();
    const spkEmbed = this.speakerEmbeds[selectedMode] || this.defaultEmbed || new Float32Array(256);
    const embedDim = spkEmbed.length;

    // 2. Build word-level and phoneme-level timing sequences
    const allTok: number[] = [];
    const allPhMidi: number[] = [];
    const wordDiv: number[] = [];
    const wordDurFr: number[] = [];
    const noteMidi: number[] = [];
    const noteRest: boolean[] = [];
    const noteDurFr: number[] = [];

    // Initial silence (AP)
    const initialApSec = 0.02;
    const initialApFr = Math.max(1, Math.round(initialApSec * frameHz));

    allTok.push(SP_ID);
    allPhMidi.push(0);
    wordDiv.push(1);
    wordDurFr.push(initialApFr);
    noteMidi.push(0.0);
    noteRest.push(true);
    noteDurFr.push(initialApFr);

    let currentFr = initialApFr;
    let lastVowel = 'a';

    for (let i = 0; i < trackNotes.length; i++) {
      const { start, dur, note } = trackNotes[i];

      const noteStartFr = Math.round((start + initialApSec) * frameHz);
      const noteEndFr = Math.round((start + dur + initialApSec) * frameHz);

      // Insert silence gap if needed
      if (noteStartFr > currentFr) {
        const gapFr = noteStartFr - currentFr;
        if (gapFr > 0) {
          allTok.push(SP_ID);
          allPhMidi.push(0);
          wordDiv.push(1);
          wordDurFr.push(gapFr);
          noteMidi.push(0.0);
          noteRest.push(true);
          noteDurFr.push(gapFr);
          currentFr += gapFr;
        }
      }

      // Align start to currentFr to handle any slight overlap/float precision issues
      const actualStartFr = Math.max(currentFr, noteStartFr);
      const durFr = Math.max(2, noteEndFr - actualStartFr);

      const midi = note.midi ?? note.pitch ?? 60;
      let lyric = (note.lyric || '-').trim();
      if (['', '~', '_'].includes(lyric)) lyric = '-';
      const isRest = lyric.toLowerCase() === 'rest';

      let phonemes: string[];
      if (isRest) {
        phonemes = ['SP'];
      } else if (lyric === '-') {
        if ('-' in this.phonemeToId) {
          phonemes = ['-'];
        } else {
          phonemes = [lastVowel];
        }
      } else {
        phonemes = this.lyricToPhonemes(lyric);
        if (phonemes.length > 0) lastVowel = phonemes[phonemes.length - 1];
      }

      const ids = phonemes.map(p => this.phonemeToId[p] ?? SP_ID);
      if (ids.length === 0) ids.push(SP_ID);

      allTok.push(...ids);
      allPhMidi.push(...ids.map(() => midi));
      wordDiv.push(ids.length);
      wordDurFr.push(durFr);
      noteMidi.push(midi);
      noteRest.push(isRest);
      noteDurFr.push(durFr);

      currentFr += durFr;
    }

    // Final silence
    const finalSpFr = Math.max(2, Math.round(0.4 * frameHz));
    allTok.push(SP_ID);
    allPhMidi.push(0);
    wordDiv.push(1);
    wordDurFr.push(finalSpFr);
    noteMidi.push(0.0);
    noteRest.push(true);
    noteDurFr.push(finalSpFr);

    const nTok = allTok.length;
    const nNotes = noteMidi.length;

    // Pre-compute phoneme-level durations from word-level data based on SVS Timing Feel setting
    const timingFeel = params?.timing_feel ?? 50.0;
    const phDur: number[] = [];
    for (let wi = 0; wi < wordDiv.length; wi++) {
      const wdur = wordDurFr[wi];
      const wdiv = wordDiv[wi];
      if (wdiv <= 1) {
        phDur.push(wdur);
      } else {
        const equalVal = Math.floor(wdur / wdiv);
        const minVal = 1; // Changed from 2 to 1 for faster attack
        let consDur = Math.round(minVal + (equalVal - minVal) * (timingFeel / 100.0));
        if (consDur < minVal) consDur = minVal;
        if (consDur > equalVal) consDur = equalVal;
        
        const totalConsDur = consDur * (wdiv - 1);
        const vowelDur = Math.max(1, wdur - totalConsDur);
        
        for (let k = 0; k < wdiv - 1; k++) {
          phDur.push(consDur);
        }
        phDur.push(vowelDur);
      }
    }

    // Pre-beat Consonant Borrowing: shift consonants earlier to place vowel target on-beat
    let tokStart = 0;
    for (let wi = 0; wi < wordDiv.length; wi++) {
      const wdiv = wordDiv[wi];
      if (wi > 0 && wdiv > 1) {
        let consDurSum = 0;
        for (let k = 0; k < wdiv - 1; k++) {
          consDurSum += phDur[tokStart + k];
        }
        const targetBorrow = Math.round(consDurSum * (1.0 - timingFeel / 100.0));
        const minPrecedingDur = 2; // Reverted back to 2 to prevent choking the preceding vowel (which caused missing notes)
        const availableToBorrow = Math.max(0, phDur[tokStart - 1] - minPrecedingDur);
        const borrowDur = Math.min(targetBorrow, availableToBorrow);
        
        if (borrowDur > 0) {
          phDur[tokStart - 1] -= borrowDur;
          phDur[tokStart + wdiv - 1] += borrowDur;
        }
      }
      tokStart += wdiv;
    }

    const nFrames = phDur.reduce((a, b) => a + b, 0);

    // Build tensors
    const tokT = new ort.Tensor('int64', BigInt64Array.from(allTok.map(BigInt)), [1, nTok]);
    const phMidiT = new ort.Tensor('int64', BigInt64Array.from(allPhMidi.map(BigInt)), [1, nTok]);
    const wdT = new ort.Tensor('int64', BigInt64Array.from(wordDiv.map(BigInt)), [1, nNotes]);
    const wdurT = new ort.Tensor('int64', BigInt64Array.from(wordDurFr.map(BigInt)), [1, nNotes]);
    const nmT = new ort.Tensor('float32', Float32Array.from(noteMidi), [1, nNotes]);
    const nrT = new ort.Tensor('bool', new Uint8Array(noteRest.map(v => v ? 1 : 0)), [1, nNotes]);
    const ndT = new ort.Tensor('int64', BigInt64Array.from(noteDurFr.map(BigInt)), [1, nNotes]);
    const pdT = new ort.Tensor('int64', BigInt64Array.from(phDur.map(BigInt)), [1, nTok]);

    // 3. Run linguistic model
    const lingInputNames: string[] = this.linguisticSession.inputNames;
    let lingInputs: Record<string, any>;
    if (lingInputNames.includes('ph_dur')) {
      lingInputs = { tokens: tokT, ph_dur: pdT };
    } else {
      lingInputs = { tokens: tokT, word_div: wdT, word_dur: wdurT };
    }
    console.log(`[ClientSvsEngine] Running linguistic model: ${nTok} tokens`);
    const lingOutputs = await this.linguisticSession.run(lingInputs);
    const encTensor = lingOutputs.encoder_out || lingOutputs[this.linguisticSession.outputNames[0]];
    const masksTensor = lingOutputs.x_masks || lingOutputs[this.linguisticSession.outputNames[1]];

    // 4. Run duration model
    // Build spk_embed tiled to [1, nTok, embedDim]
    const skTokData = new Float32Array(nTok * embedDim);
    for (let i = 0; i < nTok; i++) {
      skTokData.set(spkEmbed, i * embedDim);
    }
    const skTokTensor = new ort.Tensor('float32', skTokData, [1, nTok, embedDim]);

    const durInputNames: string[] = this.durSession.inputNames;
    const durInputsAll: Record<string, any> = {
      encoder_out: encTensor,
      x_masks: masksTensor,
      ph_midi: phMidiT,
      spk_embed: skTokTensor,
    };
    const durInputsFiltered: Record<string, any> = {};
    for (const name of durInputNames) {
      if (durInputsAll[name] !== undefined) durInputsFiltered[name] = durInputsAll[name];
    }
    console.log(`[ClientSvsEngine] Running duration model`);
    await this.durSession.run(durInputsFiltered);

    // 5. Build F0 guide (MIDI scale per frame)
    const f0MidiList: number[] = [];
    let ti = 0;
    let ni = 0;
    for (let w = 0; w < wordDiv.length; w++) {
      const wdivV = wordDiv[w];
      const nr = ni < noteRest.length ? noteRest[ni] : true;
      const nm = ni < noteMidi.length ? noteMidi[ni] : 0;
      const midiVal = nr ? 0.0 : nm;
      ni++;
      for (let k = 0; k < wdivV; k++) {
        const frames = phDur[ti + k];
        for (let f = 0; f < frames; f++) {
          f0MidiList.push(midiVal);
        }
      }
      ti += wdivV;
    }

    // Pad or truncate to nFrames
    while (f0MidiList.length < nFrames) f0MidiList.push(0.0);
    const f0MidiArr = Float32Array.from(f0MidiList.slice(0, nFrames));
    const f0GuideTensor = new ort.Tensor('float32', f0MidiArr, [1, nFrames]);

    // 6. Run pitch model
    // Use encoder_out from the MAIN linguistic model (matching server Python behavior).
    // The server does NOT use a separate pitch linguistic model — it passes `enc`
    // from the main linguistic directly to the pitch model.
    const pitchEncTensor = encTensor;

    // Build spk_embed tiled to [1, nFrames, embedDim]
    const skFrData = new Float32Array(nFrames * embedDim);
    for (let i = 0; i < nFrames; i++) {
      skFrData.set(spkEmbed, i * embedDim);
    }
    const skFrTensor = new ort.Tensor('float32', skFrData, [1, nFrames, embedDim]);

    const exprTensor = new ort.Tensor('float32', new Float32Array(nFrames).fill(1.0), [1, nFrames]);
    const retakeTensor = new ort.Tensor('bool', new Uint8Array(nFrames).fill(1), [1, nFrames]);
    const stepsVal = params?.steps ?? 20;
    const stepsTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(stepsVal)]), []);

    const pitchInputNames: string[] = this.pitchSession.inputNames;
    const pitchInputsAll: Record<string, any> = {
      encoder_out: pitchEncTensor,
      ph_dur: pdT,
      note_midi: nmT,
      note_rest: nrT,
      note_dur: ndT,
      pitch: f0GuideTensor,
      expr: exprTensor,
      retake: retakeTensor,
      spk_embed: skFrTensor,
      steps: stepsTensor,
    };
    const pitchInputsFiltered: Record<string, any> = {};
    for (const name of pitchInputNames) {
      if (pitchInputsAll[name] !== undefined) pitchInputsFiltered[name] = pitchInputsAll[name];
    }
    console.log(`[ClientSvsEngine] Running pitch model: ${nFrames} frames`);
    const pitchOutputs = await this.pitchSession.run(pitchInputsFiltered);
    const ppTensor = pitchOutputs[this.pitchSession.outputNames[0]];
    const ppData = (ppTensor.data as Float32Array).slice();

    // 7. Convert predicted pitch to Hz
    // Detect scale: log F0, MIDI semitones, or raw Hz
    let voicedSum = 0;
    let voicedCount = 0;
    for (let i = 0; i < ppData.length; i++) {
      if (ppData[i] > 2.0) {
        voicedSum += ppData[i];
        voicedCount++;
      }
    }
    const vMean = voicedCount > 0 ? voicedSum / voicedCount : 0.0;

    const ppFinal = new Float32Array(ppData.length);
    if (vMean > 0.1 && vMean < 10.0) {
      // Log F0 → exp to Hz
      console.log(`[ClientSvsEngine] Pitch output detected as log-F0 (mean=${vMean.toFixed(3)})`);
      for (let i = 0; i < ppData.length; i++) {
        ppFinal[i] = ppData[i] > 0 ? Math.exp(ppData[i]) : 0.0;
      }
    } else if (vMean >= 10.0 && vMean < 100.0) {
      // MIDI semitones → Hz
      console.log(`[ClientSvsEngine] Pitch output detected as MIDI semitones (mean=${vMean.toFixed(3)})`);
      for (let i = 0; i < ppData.length; i++) {
        ppFinal[i] = ppData[i] > 0 ? 440.0 * Math.pow(2.0, (ppData[i] - 69.0) / 12.0) : 0.0;
      }
    } else {
      // Already Hz (or >= 100)
      console.log(`[ClientSvsEngine] Pitch output detected as Hz (mean=${vMean.toFixed(3)})`);
      for (let i = 0; i < ppData.length; i++) {
        ppFinal[i] = ppData[i];
      }
    }

    // ----- HUMANIZED INTONATION BLEND (AUTOTUNE) -----
    // Blend: neural pitch (natural glides) + MIDI ideal pitch
    // 0.0 = perfect MIDI pitch (robot), 1.0 = full neural AI (expressive but might be off-pitch)
    const NEURAL_BLEND = params?.pitch_blend ?? 0.0; // Default to 0.0 (strict autotune) to fix off-pitch issues
    console.log(`[ClientSvsEngine] Applying pitch blend: ${NEURAL_BLEND}`);
    
    for (let i = 0; i < ppFinal.length; i++) {
      if (f0MidiArr[i] > 0.0 && ppFinal[i] > 0.0) {
        const idealHz = 440.0 * Math.pow(2.0, (f0MidiArr[i] - 69.0) / 12.0);
        ppFinal[i] = (1.0 - NEURAL_BLEND) * idealHz + NEURAL_BLEND * ppFinal[i];
      }
    }
    // -------------------------------------------------

    // Apply custom Vibrato to F0
    const vibDepthCents = params?.vibrato_depth ?? 0;
    if (vibDepthCents > 0.1) {
      const vibHz = params?.vibrato_speed ?? 4.8;
      const vibDelayMs = params?.vibrato_start ?? 100.0;
      
      const frameSec = 1.0 / frameHz;
      const vibDelayFrames = Math.floor((vibDelayMs / 1000.0) / frameSec);
      
      let frameIdx = 0;
      let phIdx = 0;
      for (let i = 0; i < wordDiv.length; i++) {
        const wdivV = wordDiv[i];
        let durF = 0;
        for (let k = 0; k < wdivV; k++) {
          if (phIdx + k < phDur.length) {
            durF += phDur[phIdx + k];
          }
        }
        
        if (durF > vibDelayFrames) {
          const vibLen = durF - vibDelayFrames;
          const fadeInN = Math.min(Math.floor(0.10 / frameSec), vibLen);
          
          for (let k = 0; k < vibLen; k++) {
            const t = k * frameSec;
            let centsLfo = vibDepthCents * Math.sin(2 * Math.PI * vibHz * t);
            
            if (k < fadeInN && fadeInN > 0) {
              centsLfo *= (k / fadeInN);
            }
            
            const ratio = Math.pow(2.0, centsLfo / 1200.0);
            
            const idx = frameIdx + vibDelayFrames + k;
            if (idx < ppFinal.length && ppFinal[idx] > 0) {
              ppFinal[idx] *= ratio;
            }
          }
        }
        
        frameIdx += durF;
        phIdx += wdivV;
      }
    }

    // Apply Cosine Legato smoothing (Portamento) on voiced-to-voiced note transitions
    const glideTimeMs = params?.portamento ?? 120.0;
    const glideFrames = Math.round((glideTimeMs / 1000.0) * frameHz);
    const halfGlide = Math.floor(glideFrames / 2);

    for (let i = 1; i < f0MidiArr.length; i++) {
      if (f0MidiArr[i - 1] > 0 && f0MidiArr[i] > 0 && f0MidiArr[i - 1] !== f0MidiArr[i]) {
        // Found transition boundary at index i
        const startIdx = Math.max(0, i - halfGlide);
        const endIdx = Math.min(ppFinal.length - 1, i + halfGlide);
        
        // Ensure all frames in the transition window are voiced
        let allVoiced = true;
        for (let k = startIdx; k <= endIdx; k++) {
          if (ppFinal[k] <= 0 || f0MidiArr[k] <= 0) {
            allVoiced = false;
            break;
          }
        }
        
        if (allVoiced && startIdx < endIdx) {
          const valStart = ppFinal[startIdx];
          const valEnd = ppFinal[endIdx];
          for (let k = startIdx; k <= endIdx; k++) {
            const t = (k - startIdx) / (endIdx - startIdx);
            const factor = (1.0 - Math.cos(Math.PI * t)) / 2.0;
            ppFinal[k] = valStart + (valEnd - valStart) * factor;
          }
        }
      }
    }

    const f0Tensor = new ort.Tensor('float32', ppFinal, [1, nFrames]);

    // 8. Run acoustic model with predicted F0
    const no = nFrames;
    const formantVal = params?.formant_shift ?? 0.0;
    const genderVal = -formantVal / 6.0;
    const speedVal = params?.speed ?? 1.0;
    const depthVal = params?.depth ?? this.maxDepth;

    const acousticInputNames = this.acousticSession.inputNames as string[];
    const acousticInputs: Record<string, any> = {
      tokens: tokT,
      durations: pdT,
      f0: f0Tensor,
    };

    if (acousticInputNames.includes('gender')) {
      acousticInputs.gender = new ort.Tensor('float32', new Float32Array(no).fill(genderVal), [1, no]);
    }
    if (acousticInputNames.includes('velocity')) {
      acousticInputs.velocity = new ort.Tensor('float32', new Float32Array(no).fill(speedVal), [1, no]);
    }
    if (acousticInputNames.includes('languages')) {
      acousticInputs.languages = new ort.Tensor('int64', new BigInt64Array(nTok).fill(0n), [1, nTok]);
    }
    if (acousticInputNames.includes('breathiness')) {
      const breathVal = (params?.breathiness ?? 0.0) / 100.0;
      acousticInputs.breathiness = new ort.Tensor('float32', new Float32Array(no).fill(breathVal), [1, no]);
    }
    if (acousticInputNames.includes('voicing')) {
      acousticInputs.voicing = new ort.Tensor('float32', new Float32Array(no).fill(0), [1, no]);
    }
    if (acousticInputNames.includes('tension')) {
      acousticInputs.tension = new ort.Tensor('float32', new Float32Array(no).fill(0), [1, no]);
    }
    if (acousticInputNames.includes('spk_embed')) {
      const spkData = new Float32Array(no * embedDim);
      for (let i = 0; i < no; i++) {
        spkData.set(spkEmbed, i * embedDim);
      }
      acousticInputs.spk_embed = new ort.Tensor('float32', spkData, [1, no, embedDim]);
    }
    if (acousticInputNames.includes('depth')) {
      acousticInputs.depth = new ort.Tensor('float32', new Float32Array([depthVal]), []);
    }
    if (acousticInputNames.includes('steps')) {
      acousticInputs.steps = stepsTensor;
    }

    console.log(`[ClientSvsEngine] Running acoustic session (neural F0): ${no} frames`);
    const acousticOutputs = await this.acousticSession.run(acousticInputs);
    const melTensor = acousticOutputs.mel || acousticOutputs[this.acousticSession.outputNames[0]];

    // 9. Run vocoder
    console.log(`[ClientSvsEngine] Running vocoder session`);
    const vocOutputs = await this.vocoderSession.run({ mel: melTensor, f0: f0Tensor });
    const waveformTensor = vocOutputs.waveform || vocOutputs[this.vocoderSession.outputNames[0]];
    let audio = (waveformTensor.data as Float32Array).slice();

    // Post-processing
    audio = this.applyPostProcessing(audio, params);
    return audio;
  }

  /**
   * Fallback flat-F0 synthesis (original approach: no neural pitch prediction).
   */
  private async synthesizeChunkFallback(
    trackNotes: Array<{ start: number; dur: number; note: NoteData }>,
    params?: ClientSvsParams
  ): Promise<Float32Array | null> {
    const ort = getOrt();
    const hopSize = 512;
    const frameSec = hopSize / this.sr;
    
    // Minimal initial silence (SP) for clean onset
    const initialSpSec = 0.02;
    const initialSpFrames = Math.max(1, Math.round(initialSpSec / frameSec));
    
    const phList: string[] = ["SP"];
    const phDurFrames: number[] = [initialSpFrames];
    const phF0: number[] = [0.0];
    let lastVowel = 'a';

    // Build timeline of phonemes and frequencies
    for (let i = 0; i < trackNotes.length; i++) {
      const { start, dur, note } = trackNotes[i];
      
      const noteStartFr = Math.round((start + initialSpSec) / frameSec);
      const noteEndFr = Math.round((start + dur + initialSpSec) / frameSec);
      
      const currentFramesTotal = phDurFrames.reduce((a, b) => a + b, 0);
      if (noteStartFr > currentFramesTotal) {
        const silFrames = noteStartFr - currentFramesTotal;
        phList.push("SP");
        phDurFrames.push(silFrames);
        phF0.push(0.0);
      }

      // Convert word to phonemes
      let lyric = (note.lyric || '-').trim();
      if (['', '~', '_'].includes(lyric)) lyric = '-';
      const isRest = lyric.toLowerCase() === 'rest';

      let phonemes: string[];
      if (isRest) {
        phonemes = ['SP'];
      } else if (lyric === '-') {
        if ('-' in this.phonemeToId) {
          phonemes = ['-'];
        } else {
          phonemes = [lastVowel];
        }
      } else {
        phonemes = this.lyricToPhonemes(lyric);
        if (phonemes.length > 0) lastVowel = phonemes[phonemes.length - 1];
      }
      
      const actualStartFr = Math.max(phDurFrames.reduce((a, b) => a + b, 0), noteStartFr);
      let noteFrames = Math.max(2, noteEndFr - actualStartFr);

      // Note frequency from pitch
      const pitch = note.pitch ?? note.midi ?? 60;
      const f0Val = 440.0 * Math.pow(2.0, (pitch - 69.0) / 12.0);

      if (phonemes.length === 1) {
        phList.push(phonemes[0]);
        phDurFrames.push(noteFrames);
        phF0.push(f0Val);
      } else {
        // Distribute phonemes based on SVS Timing Feel setting:
        const timingFeel = params?.timing_feel ?? 50.0;
        const equalVal = Math.floor(noteFrames / phonemes.length);
        const minVal = 1; // Reduced from 2 to 1 for sharper consonant attacks
        let consDur = Math.round(minVal + (equalVal - minVal) * (timingFeel / 100.0));
        if (consDur < minVal) consDur = minVal;
        if (consDur > equalVal) consDur = equalVal;

        const totalConsDur = consDur * (phonemes.length - 1);
        let vowelDur = Math.max(1, noteFrames - totalConsDur);

        // Consonant borrowing from preceding phoneme
        if (phDurFrames.length > 0) {
          const consDurSum = totalConsDur;
          const targetBorrow = Math.round(consDurSum * (1.0 - timingFeel / 100.0));
          const minPrecedingDur = 2;
          const availableToBorrow = Math.max(0, phDurFrames[phDurFrames.length - 1] - minPrecedingDur);
          const borrowDur = Math.min(targetBorrow, availableToBorrow);
          if (borrowDur > 0) {
            phDurFrames[phDurFrames.length - 1] -= borrowDur;
            vowelDur += borrowDur;
          }
        }

        for (let pi = 0; pi < phonemes.length; pi++) {
          phList.push(phonemes[pi]);
          phDurFrames.push(pi < phonemes.length - 1 ? consDur : vowelDur);
          phF0.push(f0Val);
        }
      }
    }

    // Add trailing silence
    phList.push("SP");
    phDurFrames.push(Math.round(0.1 / frameSec));
    phF0.push(0.0);

    // Expand F0 to frame level
    const f0List: number[] = [];
    for (let idx = 0; idx < phDurFrames.length; idx++) {
      const f0 = phF0[idx];
      const duration = phDurFrames[idx];
      for (let f = 0; f < duration; f++) {
        f0List.push(f0);
      }
    }

    const f0Arr = new Float32Array(f0List);

    // Apply Cosine Legato smoothing (Portamento) on voiced-to-voiced note transitions
    const glideTimeMs = params?.portamento ?? 120.0;
    const glideFrames = Math.round((glideTimeMs / 1000.0) / frameSec);
    const halfGlide = Math.floor(glideFrames / 2);

    let frameIdx = 0;
    for (let pi = 0; pi < phDurFrames.length; pi++) {
      const nf = phDurFrames[pi];
      const hz = phF0[pi];
      if (pi > 0 && hz > 0.0 && phF0[pi - 1] > 0.0 && hz !== phF0[pi - 1]) {
        const prevHz = phF0[pi - 1];
        const startIdx = Math.max(0, frameIdx - halfGlide);
        const endIdx = Math.min(f0Arr.length - 1, frameIdx + halfGlide);
        if (startIdx < endIdx) {
          const len = endIdx - startIdx + 1;
          for (let k = startIdx; k <= endIdx; k++) {
            const t = (k - startIdx) / (len - 1);
            const factor = (1.0 - Math.cos(Math.PI * t)) / 2.0;
            f0Arr[k] = prevHz + (hz - prevHz) * factor;
          }
        }
      }
      frameIdx += nf;
    }

    // Apply custom Vibrato to F0
    const vibDepthCents = params?.vibrato_depth ?? 0;
    if (vibDepthCents > 0.1) {
      const vibHz = params?.vibrato_speed ?? 4.8;
      const vibDelayMs = params?.vibrato_start ?? 100.0;
      const vibDelayFrames = Math.floor((vibDelayMs / 1000.0) / frameSec);
      
      let f_idx = 0;
      for (let pi = 0; pi < phDurFrames.length; pi++) {
        const nf = phDurFrames[pi];
        if (phF0[pi] > 0.0 && nf > vibDelayFrames) {
          const vibLen = nf - vibDelayFrames;
          const fadeInN = Math.min(Math.floor(0.10 / frameSec), vibLen);
          for (let k = 0; k < vibLen; k++) {
            const t = k * frameSec;
            let centsLfo = vibDepthCents * Math.sin(2 * Math.PI * vibHz * t);
            if (k < fadeInN && fadeInN > 0) {
              centsLfo *= (k / fadeInN);
            }
            const ratio = Math.pow(2.0, centsLfo / 1200.0);
            const idx = f_idx + vibDelayFrames + k;
            if (idx < f0Arr.length && f0Arr[idx] > 0) {
              f0Arr[idx] *= ratio;
            }
          }
        }
        f_idx += nf;
      }
    }

    const nFrames = f0List.length;

    // Convert phonemes to tokens
    const tokens: number[] = phList.map(p => {
      if (p in this.phonemeToId) {
        return this.phonemeToId[p];
      }
      console.warn(`[ClientSvsEngine] Unknown phoneme '${p}', using 0`);
      return 0;
    });

    // Determine vocal mode speaker embedding
    const selectedMode = (params?.vocal_mode || 'root').toLowerCase();
    const spkEmbed = this.speakerEmbeds[selectedMode] || this.defaultEmbed || new Float32Array(256);

    // Build ONNX Inputs
    const tokensTensor = new ort.Tensor('int64', BigInt64Array.from(tokens.map(BigInt)), [1, tokens.length]);
    const durationsTensor = new ort.Tensor('int64', BigInt64Array.from(phDurFrames.map(BigInt)), [1, phDurFrames.length]);
    const f0Tensor = new ort.Tensor('float32', f0Arr, [1, nFrames]);

    const acousticInputs: Record<string, any> = {
      tokens: tokensTensor,
      durations: durationsTensor,
      f0: f0Tensor,
    };

    const inputNames = this.acousticSession.inputNames as string[];

    if (inputNames.includes('gender')) {
      const formantShift = params?.formant_shift ?? 0.0;
      const genderVal = -formantShift / 6.0; // Scale -6..6 to -1.0..1.0
      acousticInputs.gender = new ort.Tensor('float32', new Float32Array(nFrames).fill(genderVal), [1, nFrames]);
    }

    if (inputNames.includes('velocity')) {
      const speedVal = params?.speed ?? 1.0;
      acousticInputs.velocity = new ort.Tensor('float32', new Float32Array(nFrames).fill(speedVal), [1, nFrames]);
    }

    if (inputNames.includes('languages')) {
      acousticInputs.languages = new ort.Tensor('int64', new BigInt64Array(tokens.length).fill(0n), [1, tokens.length]);
    }

    if (inputNames.includes('breathiness')) {
      const breathVal = (params?.breathiness ?? 0.0) / 100.0;
      acousticInputs.breathiness = new ort.Tensor('float32', new Float32Array(nFrames).fill(breathVal), [1, nFrames]);
    }

    if (inputNames.includes('voicing')) {
      acousticInputs.voicing = new ort.Tensor('float32', new Float32Array(nFrames).fill(0), [1, nFrames]);
    }

    if (inputNames.includes('tension')) {
      acousticInputs.tension = new ort.Tensor('float32', new Float32Array(nFrames).fill(0), [1, nFrames]);
    }

    if (inputNames.includes('spk_embed')) {
      const embedData = new Float32Array(nFrames * 256);
      for (let i = 0; i < nFrames; i++) {
        embedData.set(spkEmbed, i * 256);
      }
      acousticInputs.spk_embed = new ort.Tensor('float32', embedData, [1, nFrames, 256]);
    }

    if (inputNames.includes('depth')) {
      const depthVal = params?.depth ?? this.maxDepth;
      acousticInputs.depth = new ort.Tensor('float32', new Float32Array([depthVal]), []);
    }

    if (inputNames.includes('steps')) {
      const stepsVal = params?.steps ?? 20;
      acousticInputs.steps = new ort.Tensor('int64', new BigInt64Array([BigInt(stepsVal)]), []);
    }

    try {
      console.log(`[ClientSvsEngine] Running acoustic session (flat F0): ${nFrames} frames`);
      const acousticOutputs = await this.acousticSession.run(acousticInputs);
      const melTensor = acousticOutputs.mel || acousticOutputs[this.acousticSession.outputNames[0]];

      console.log(`[ClientSvsEngine] Running vocoder session`);
      const vocInputs = {
        mel: melTensor,
        f0: f0Tensor,
      };

      const vocOutputs = await this.vocoderSession.run(vocInputs);
      const waveformTensor = vocOutputs.waveform || vocOutputs[this.vocoderSession.outputNames[0]];

      let audio = (waveformTensor.data as Float32Array).slice();

      // Post-processing
      audio = this.applyPostProcessing(audio, params);
      return audio;

    } catch (e) {
      console.error('[ClientSvsEngine] Inference chunk error:', e);
      return null;
    }
  }

  /**
   * Shared post-processing: EQ, reverb, and normalization.
   */
  private applyPostProcessing(audio: Float32Array, params?: ClientSvsParams): Float32Array {
    // Apply warmth and brightness EQ
    const warmth = params?.warmth ?? 0.0;
    const brightness = params?.brightness ?? 0.0;

    if (Math.abs(warmth) > 0.05) {
      const lowBand = this.applyBiquadFilter(audio, this.sr, 300, 'lowpass');
      for (let i = 0; i < audio.length; i++) {
        audio[i] += lowBand[i] * warmth * 0.5;
      }
    }

    if (Math.abs(brightness) > 0.05) {
      const hiBand = this.applyBiquadFilter(audio, this.sr, 4000, 'highpass');
      for (let i = 0; i < audio.length; i++) {
        audio[i] += hiBand[i] * brightness * 0.5;
      }
    }

    // Apply simple delay-based reverb
    const reverb = params?.reverb ?? 0.0;
    if (reverb > 0.01) {
      const delays = [0.030, 0.037, 0.041, 0.043].map(d => Math.round(this.sr * d));
      const reverbAudio = new Float32Array(audio);
      for (const d of delays) {
        if (d < audio.length) {
          for (let i = d; i < audio.length; i++) {
            reverbAudio[i] += audio[i - d] * reverb * 0.3;
          }
        }
      }
      audio = reverbAudio;
    }

    // Avoid clipping, but do not boost soft audio to avoid noise floors
    let peak = 0;
    for (let i = 0; i < audio.length; i++) {
      const absVal = Math.abs(audio[i]);
      if (absVal > peak) peak = absVal;
    }
    if (peak > 1.0) {
      for (let i = 0; i < audio.length; i++) {
        audio[i] = (audio[i] / peak) * 0.95;
      }
    }

    return audio;
  }

  /**
   * Helper G2P resolver.
   */
  private lyricToPhonemes(lyric: string): string[] {
    const word = lyric.toLowerCase().trim();
    const cleanWord = word.replace(/[.,?!:;\-\(\)\[\]"']/g, '');

    const thaiMap: Record<string, string> = {
      "โด": "do", "เร": "re", "มี": "mi", "ฟา": "fa", 
      "ซอล": "sol", "โซล": "sol", "ลา": "la", "ที": "ti"
    };

    const resolvedWord = thaiMap[cleanWord] || cleanWord;

    if (this.dictionaryMap[resolvedWord]) {
      return this.dictionaryMap[resolvedWord];
    }

    if (SOLFEGE_MAP[resolvedWord]) {
      return SOLFEGE_MAP[resolvedWord].split(/\s+/);
    }

    if (PINYIN_MAP[resolvedWord]) {
      return PINYIN_MAP[resolvedWord].split(/\s+/);
    }

    return ["ah"];
  }

  /**
   * Simple DSP Biquad filter (for warmth and brightness EQ)
   */
  private applyBiquadFilter(
    audio: Float32Array,
    sr: number,
    freq: number,
    type: 'lowpass' | 'highpass'
  ): Float32Array {
    const out = new Float32Array(audio.length);
    const w0 = (2 * Math.PI * freq) / sr;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / 2; // Q = 0.5

    let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

    if (type === 'lowpass') {
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    } else {
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    }

    const b0_n = b0 / a0;
    const b1_n = b1 / a0;
    const b2_n = b2 / a0;
    const a1_n = a1 / a0;
    const a2_n = a2 / a0;

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < audio.length; i++) {
      const x = audio[i];
      const y = b0_n * x + b1_n * x1 + b2_n * x2 - a1_n * y1 - a2_n * y2;
      out[i] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }

    return out;
  }

  /**
   * Encodes a float32 PCM array into a standard 16-bit linear WAV Blob.
   */
  private encodeWAV(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // raw PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}

/**
 * ClientSvsEngineProxy — Web Worker dispatcher for SVS synthesis.
 *
 * All ONNX inference runs in a Web Worker to avoid blocking the main thread.
 * The worker will attempt WebGPU first (available in Chrome 113+ workers),
 * then fall back to WASM/CPU automatically.
 *
 * Key fix: Worker type changed from 'classic' → 'module' to support ESM imports.
 */
export class ClientSvsEngineProxy {
  private worker: Worker | null = null;
  private activeResolver: ((value: any) => void) | null = null;
  private activeRejecter: ((reason: any) => void) | null = null;
  private activeProgress: ((state: SvsEngineProgress) => void) | null = null;
  public actualProvider: 'webgpu' | 'wasm' = 'wasm';
  public lastLoadStats = { cached: 0, downloaded: 0 };

  private ensureWorker() {
    if (!this.worker && typeof window !== 'undefined') {
      console.log('[ClientSvsEngineProxy] Spawning SVS Background Worker...');
      this.worker = new Worker(
        new URL('./svs.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      this.worker.onerror = (err: ErrorEvent) => {
        console.error('[ClientSvsEngineProxy] Worker execution/load error:', err);
        if (this.activeRejecter) {
          this.activeRejecter(new Error(err.message || 'Background Worker failed to load or compile'));
          this.activeResolver = null;
          this.activeRejecter = null;
        }
      };

      this.worker.onmessage = (e) => {
        const { type, error, payload } = e.data;
        
        if (type === 'workerDebug') {
          console.log('[ClientSvsEngineProxy] 🔧', payload);
        } else if (type === 'loadProgress' && this.activeProgress) {
          this.activeProgress(payload);
        } else if (type === 'loadSuccess') {
          if (payload && payload.provider) {
            this.actualProvider = payload.provider;
          }
          if (payload && payload.loadStats) {
            this.lastLoadStats = payload.loadStats;
          }
          const neuralStatus = payload?.hasNeuralPipeline ? '✅ NEURAL PIPELINE ACTIVE' : '⚠️ FLAT F0 FALLBACK';
          console.log(`[ClientSvsEngineProxy] Voice loaded: provider=${payload?.provider}, ${neuralStatus}`);
          if (this.activeResolver) {
            this.activeResolver(undefined);
            this.activeResolver = null;
            this.activeRejecter = null;
          }
        } else if (type === 'loadError') {
          if (this.activeRejecter) {
            this.activeRejecter(new Error(error || 'Worker loading failed'));
            this.activeResolver = null;
            this.activeRejecter = null;
          }
        } else if (type === 'synthSuccess') {
          if (this.activeResolver) {
            this.activeResolver(payload);
            this.activeResolver = null;
            this.activeRejecter = null;
          }
        } else if (type === 'synthError') {
          if (this.activeRejecter) {
            this.activeRejecter(new Error(error || 'Worker synthesis failed'));
            this.activeResolver = null;
            this.activeRejecter = null;
          }
        }
      };
    }
  }

  public async loadVoice(
    voiceId: string,
    files: VoiceModelFiles,
    onProgress: (state: SvsEngineProgress) => void
  ): Promise<void> {
    console.log('[ClientSvsEngineProxy] Routing SVS voice load to Background Web Worker...');
    this.ensureWorker();
    if (!this.worker) {
      throw new Error('Worker could not be initialized');
    }
    
    this.activeProgress = onProgress;
    return new Promise((resolve, reject) => {
      this.activeResolver = resolve;
      this.activeRejecter = reject;
      this.worker!.postMessage({
        type: 'loadVoice',
        payload: { voiceId, files }
      });
    });
  }

  public async synthesize(
    notes: NoteData[],
    params?: ClientSvsParams
  ): Promise<Blob> {
    console.log('[ClientSvsEngineProxy] Routing SVS synthesis to Background Web Worker...');
    this.ensureWorker();
    if (!this.worker) {
      throw new Error('Worker could not be initialized');
    }
    
    return new Promise((resolve, reject) => {
      this.activeResolver = resolve;
      this.activeRejecter = reject;
      this.worker!.postMessage({
        type: 'synthesize',
        payload: { notes, params }
      });
    });
  }
}

// Single exported instance (Worker-based, non-blocking)
export const clientSvsEngine = new ClientSvsEngineProxy();

