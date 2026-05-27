import * as Tone from 'tone';
import { musicEngine } from './MusicEngine';
import { clientSvsEngine } from './ClientSvsEngine';
import { AudioBlobCache } from './AudioBlobCache';
import { getChromaticSolfege } from './SolfegeLogic';
import { ParsedNote, TrackState, Song, LyricMode } from '../types';

// ── ONE-TIME CACHE BUST FOR NEW F0 PITCH FIX ─────────────────────────────────
if (typeof window !== 'undefined') {
  const BUST_KEY = 'vocalido_cache_bust_v9_force_lotte_v_server_final';
  if (!localStorage.getItem(BUST_KEY)) {
    console.log('[Vocalido] ⚡ Cache bust: Clearing old vocal render history and forcing high-quality server SVS engine (Lotte V)...');
    try {
      // 1. Force default engine selection to Server-Side (Vocalido) and select Lotte V as active
      localStorage.setItem('vocalido_svs_engine', 'vocalido');
      localStorage.setItem('vocalido_svs_steps', '40');
      localStorage.setItem('vocalido_active_engine', 'lotte_v_ai_dol');

      // 2. Clear all active render keys, tracks state, and history entries from localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('memo_render_history_') || 
          key.startsWith('active_render_key_') ||
          key.startsWith('tracks_state_')
        )) {
          localStorage.removeItem(key);
          i--;
        }
      }

      // 3. Clear all cached vocal render audio blobs from IndexedDB
      AudioBlobCache.clearAllVocalRenders().catch(err => {
        console.warn('[Vocalido] AudioBlobCache.clearAllVocalRenders failed:', err);
      });

      localStorage.setItem(BUST_KEY, 'true');
    } catch (e) {
      console.warn('[Vocalido] Cache bust failed:', e);
    }
  }
}

export interface VocalidoRenderState {
  isRendering: boolean;
  progress: number;
  timer: number;
  statusText: string;
  error: string | null;
  activeSongId: string | null;
  activeRenderKey: string | null;
}

export interface ParsedData {
  notes: ParsedNote[];
  metadata: any;
  partNames: Record<string, string>;
  timeSignature: { beats: number; beatType: number };
}

type Listener = (state: VocalidoRenderState) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions (Mirrored from PlayerPage for self-containment)
// ─────────────────────────────────────────────────────────────────────────────

const saveRenderToLocalCache = async (
  songId: string,
  entryKey: string,
  mainBlobOrUrl: Blob | string,
  stemBlobsOrUrls: (Blob | string)[] = []
) => {
  const cacheKey = `vocal_render_${songId}_${entryKey}`;
  try {
    if (mainBlobOrUrl instanceof Blob) {
      await AudioBlobCache.set(cacheKey, mainBlobOrUrl);
      console.log(`[AudioBlobCache] Saved main blob to cache: ${cacheKey}`);
    } else if (typeof mainBlobOrUrl === 'string' && !mainBlobOrUrl.startsWith('blob:') && !mainBlobOrUrl.startsWith('data:')) {
      fetch(mainBlobOrUrl)
        .then(r => r.ok ? r.blob() : null)
        .then(blob => {
          if (blob) AudioBlobCache.set(cacheKey, blob);
        })
        .catch(() => {});
    }

    if (stemBlobsOrUrls.length > 0) {
      await Promise.all(stemBlobsOrUrls.map(async (item, idx) => {
        const stemKey = `${cacheKey}_stem_${idx}`;
        if (item instanceof Blob) {
          await AudioBlobCache.set(stemKey, item);
        } else if (typeof item === 'string' && !item.startsWith('blob:') && !item.startsWith('data:')) {
          fetch(item)
            .then(r => r.ok ? r.blob() : null)
            .then(blob => {
              if (blob) AudioBlobCache.set(stemKey, blob);
            })
            .catch(() => {});
        }
      }));
    }
  } catch (e) {
    console.warn('[AudioBlobCache] Failed to save render to local cache:', e);
  }
};

const getCustomBackendUrl = () => {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  const isLocalIp = 
    hostname === 'localhost' || 
    hostname === '127.0.0.1' || 
    hostname.endsWith('.local') ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);
    
  if (isLocalIp) {
    return `http://${hostname}:5001`;
  }

  const url = localStorage.getItem('memolody_custom_backend_url');
  if (!url) return '';
  let cleanUrl = url.trim();
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  return cleanUrl;
};

const getFetchUrl = (path: string) => {
  const customBackend = getCustomBackendUrl();
  if (!customBackend) return path;

  let cleanPath = path;
  if (!cleanPath.startsWith('/')) {
    cleanPath = '/' + cleanPath;
  }

  if (cleanPath.startsWith('/vocalido/')) {
    cleanPath = cleanPath.substring('/vocalido'.length);
  }

  return `${customBackend}${cleanPath}`;
};

const svsFetch = (url: string, options?: RequestInit) => {
  const headers = new Headers(options?.headers || {});
  headers.set('serveo-skip-browser-warning', 'true');
  headers.set('bypass-tunnel-reminder', 'true');
  return fetch(url, { ...options, headers });
};

const fixAudioUrl = (u: string) => {
  if (typeof u !== 'string') return u;
  let url = u;
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      url = parsed.pathname + parsed.search;
    } catch (e) {
      console.warn('[fixAudioUrl] Failed to parse absolute URL:', url, e);
    }
  }

  if (url.startsWith('/vocalido/audio/')) {
    url = url.replace('/vocalido/audio/', '/studio/audio/');
  } else if (url.startsWith('/audio/')) {
    url = url.replace('/audio/', '/studio/audio/');
  } else if (url.startsWith('/song_')) {
    url = '/studio/audio' + url;
  }
  
  if (!url.startsWith('/studio/audio/')) {
    const filename = url.split('/').pop() || '';
    if (filename.startsWith('song_')) {
      url = `/studio/audio/${filename}`;
    }
  }
  
  const customBackend = getCustomBackendUrl();
  if (customBackend) {
    return `${customBackend}${url}`;
  }
  
  return url;
};

const getVoiceModelUrl = (path: string) => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
    const hasCustom = !!getCustomBackendUrl();
    
    // On localhost: use the local SVS server's static file serving directly
    // (models are served via FastAPI at /vocalido/voicebanks/...)
    if (isLocal && path.startsWith('/vocalido/voicebanks/')) {
      return getFetchUrl(path);
    }
    
    // On production (non-local): return relative path as-is for Vercel/Netlify proxy
    if (!isLocal && !hasCustom && path.startsWith('/vocalido/voicebanks/')) {
      return path;
    }
  }
  // Fallback: try GCS for production deployments without proxy
  if (path.startsWith('/vocalido/voicebanks/')) {
    return encodeURI(path.replace('/vocalido/voicebanks/', 'https://storage.googleapis.com/memolody-vault/voicebanks/'));
  }
  return getFetchUrl(path);
};

const mapToLyricMode = (modeStr: string): LyricMode => {
  const normalized = (modeStr || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  switch (normalized) {
    case 'americanmovabledo': return 'American Movable Do';
    case 'americanfixeddo': return 'American Fixed Do';
    case 'britishmovabledoh': return 'British Movable Doh';
    case 'britishfixeddoh': return 'British Fixed Doh';
    case 'jusolfegemovabledoh': return 'Ju Solfege Movable Doh';
    case 'jusolfegefixeddoh': return 'Ju Solfege Fixed Doh';
    case 'jianpu': return 'Jianpu';
    case 'kodaly': return 'Kodaly';
    case 'kodalyrhythm': return 'Kodaly Rhythm';
    case 'indiansargam': return 'Indian Sargam';
    case 'lyric': return 'Lyric';
    case 'close': return 'Close';
    default: return 'British Fixed Doh';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Service Class Implementation
// ─────────────────────────────────────────────────────────────────────────────

class VocalidoRenderService {
  public isRendering = false;
  public progress = 0;
  public timer = 0;
  public statusText = '';
  public error: string | null = null;
  public activeSongId: string | null = null;
  public activeRenderKey: string | null = null;

  private abortController: AbortController | null = null;
  private progressInterval: any = null;
  private timeoutId: any = null;
  private listeners: Set<Listener> = new Set();

  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    // Call immediately with the current state
    listener(this.getState());
  }

  public unsubscribe(listener: Listener) {
    this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach(l => {
      try {
        l(state);
      } catch (e) {
        console.error('[VocalidoRenderService] Subscriber error:', e);
      }
    });
  }

  public getState(): VocalidoRenderState {
    return {
      isRendering: this.isRendering,
      progress: this.progress,
      timer: this.timer,
      statusText: this.statusText,
      error: this.error,
      activeSongId: this.activeSongId,
      activeRenderKey: this.activeRenderKey,
    };
  }

  public async startRender(params: {
    song: Song;
    parsedData: ParsedData;
    tracks: TrackState[];
    transpose: number;
    activeLyricMode: LyricMode;
    activeVoiceName: string;
    trackEngineId: string;
    activeEngineId: string;
    collapseChords: boolean;
    svsSteps: number;
    currentBpm: number;
    voiceEngines: any[];
    isMetronomeOn: boolean;
    userId: string;
  }) {
    if (this.isRendering) {
      console.warn('[VocalidoRenderService] ⛔ Render blocked: already rendering');
      return;
    }

    const {
      song,
      parsedData,
      tracks,
      transpose,
      activeLyricMode,
      activeVoiceName,
      trackEngineId,
      activeEngineId,
      collapseChords,
      svsSteps,
      currentBpm,
      voiceEngines,
      isMetronomeOn,
      userId
    } = params;

    this.isRendering = true;
    this.progress = 0;
    this.timer = 0;
    this.statusText = '';
    this.error = null;
    this.activeSongId = song.id;
    this.activeRenderKey = null;
    this.notify();

    try {
      localStorage.setItem('vocalido_rendering_active_song', song.id);
    } catch (e) {}

    // Pre-unlock vocal audio element inside the click gesture
    const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
    musicEngine.unlockVocalAudio(primaryTrackId);

    const wasPlaying = musicEngine.transportState === 'started';
    const savedPos = musicEngine.transportSeconds;
    if (wasPlaying) {
      musicEngine.pause();
    }

    const controller = new AbortController();
    this.abortController = controller;

    const timeoutId = setTimeout(() => {
      if (this.abortController === controller) {
        controller.abort();
      }
    }, 90000);
    this.timeoutId = timeoutId;

    const noteCount = parsedData.notes.filter(n => n.trackId === primaryTrackId).length;
    const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
    let estimatedDuration = 10;
    
    const svsEngine = localStorage.getItem('vocalido_svs_engine') || 'vocalido';
    const selectedVoice = voiceEngines.find(v => v.id === trackEngineId);

    if (svsEngine === 'browser-ai') {
      estimatedDuration = hasGpu ? (4 + noteCount * 0.05) : (8 + noteCount * 0.4);
    } else {
      estimatedDuration = 6 + noteCount * 0.08;
    }
    estimatedDuration = Math.max(5, Math.min(180, estimatedDuration));

    const startTime = Date.now();
    this.progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      let simulatedProgress = 0;
      if (elapsed < estimatedDuration) {
        simulatedProgress = (elapsed / estimatedDuration) * 95;
      } else {
        const extra = elapsed - estimatedDuration;
        simulatedProgress = 95 + (4.9 * (1 - Math.exp(-extra / 30)));
      }
      this.progress = Math.min(99.9, simulatedProgress);
      this.timer = Math.round(elapsed);
      this.notify();
    }, 250);

    const cleanup = () => {
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      if (this.abortController === controller) {
        this.abortController = null;
      }
    };

    try {
      const stepMap: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
      
      let sourceNotes = parsedData.notes.filter(n => n.trackId === primaryTrackId);
      const sortedSource = [...sourceNotes].sort((a, b) => a.startTime - b.startTime);
      sourceNotes = sortedSource;
      
      const transposeSemitones = transpose;
      
      const notesToSynthesize = sourceNotes.map(n => {
        let lyric = 'Doh';
        try {
          const songKey = (parsedData.metadata as any)?.key || 'C';
          const songFifths = (parsedData.metadata as any)?.fifths ?? 0;
          const computed = getChromaticSolfege(
            n.step || 'C', 
            n.alter || 0, 
            songKey, 
            activeLyricMode,
            n.duration / ((parsedData.timeSignature as any)?.beats || 4),
            songFifths 
          );
          
          if (activeLyricMode === 'Lyric') {
            lyric = (n as any).lyric || 'ah';
          } else if (activeLyricMode === 'Close') {
            lyric = 'm';
          } else {
            lyric = computed || n.solfege || 'Doh';
          }
        } catch (e) {
          console.warn('[VocalidoRenderService] Solfege calc error:', e);
        }
        
        const safeStep = (n.step || 'C').toUpperCase();
        const rawMidi = (n.octave + 1) * 12 + (stepMap[safeStep] || 0) + (n.alter || 0);
        const transposedMidi = Math.max(24, Math.min(108, rawMidi + transposeSemitones));
        return {
          pitch: transposedMidi,
          midi: transposedMidi,
          duration: isNaN(n.duration) ? 0.5 : n.duration,
          startTime: isNaN(n.startTime) ? 0 : n.startTime,
          lyric
        };
      });

      console.log(`[VocalidoRenderService] SVS rendering initialization... bpm=${currentBpm}, notes=${notesToSynthesize.length}`);

      await musicEngine.ensureInitialized();
      const xmlBpm = (parsedData.metadata as any)?.bpm;
      const actualBpm = xmlBpm || currentBpm || 120;
      musicEngine.setBpm(actualBpm);

      const origBpm = (parsedData.metadata as any)?.bpm || 120;
      const bpmPct = Math.round((actualBpm / origBpm) * 100);
      const songKey = parsedData.metadata?.key || song.key || 'C';

      let renderHistory: any[] = [];
      try {
        const localHist = localStorage.getItem(`memo_render_history_${song.id}`);
        if (localHist) {
          renderHistory = JSON.parse(localHist) || [];
        }
      } catch (e) {}

      const currentVoiceName = activeVoiceName || 'Auto';
      const targetVoice = collapseChords ? currentVoiceName : `${currentVoiceName}poly`;
      const targetEngine = collapseChords ? (trackEngineId || 'default') : `${trackEngineId || 'default'}poly`;

      const cached = renderHistory.find(h => {
        if (!h.audioUrl) return false;
        if (h.audioUrl.startsWith('blob:') && !(h as any).isActiveBlob) return false;

        const hEng = (h.engineId || 'default').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const tEng = targetEngine.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const hVoice = (h.voiceName || 'Auto').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const tVoice = targetVoice.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        const hLyric = mapToLyricMode(h.lyricMode || 'British Fixed Doh');
        const tLyric = mapToLyricMode(activeLyricMode);
        
        return h.bpmPercent === bpmPct && 
               h.songKey === songKey && 
               hLyric === tLyric &&
               (hEng === tEng || hVoice === tEng || hEng === tVoice || hVoice === tVoice);
      });

      const cachedKey = cached ? `${cached.bpmPercent}_${cached.songKey}_${cached.engineId || 'default'}_${cached.lyricMode || ''}_${cached.voiceName || 'Auto'}` : null;
      if (cached) {
        console.log(`[VocalidoRenderService] [MemoCache] ✅ Found cached render ${cached.label} — skipping SVS render`);
        const fixedUrl = fixAudioUrl(cached.audioUrl);
        const cacheBusted = fixedUrl.startsWith('blob:') ? fixedUrl
          : (fixedUrl.includes('?t=') ? fixedUrl.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixedUrl}?t=${Date.now()}`);
        const stemsWithBust = (cached.savedStemUrls || []).map((sUrl: string) => {
          const fixed = fixAudioUrl(sUrl);
          return fixed.startsWith('blob:') ? fixed
            : (fixed.includes('?t=') ? fixed.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixed}?t=${Date.now()}`);
        });

        // Set track mode to vocal so Play button works correctly
        const updatedTracks = tracks.map((t: any) => 
          t.id === primaryTrackId ? { ...t, mode: 'vocal' } as TrackState : t
        );
        localStorage.setItem(`tracks_state_${song.id}`, JSON.stringify(updatedTracks));

        // Load layer
        await musicEngine.addVocalLayer(primaryTrackId, cacheBusted, stemsWithBust);

        const livePlaying = wasPlaying || musicEngine.transportState === 'started';
        const livePos = savedPos;

        await musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
        musicEngine.setTransportSeconds(livePos);
        if (livePlaying) {
          await musicEngine.start();
        }

        if (cachedKey) {
          this.activeRenderKey = cachedKey;
          localStorage.setItem(`active_render_key_${song.id}`, cachedKey);
        }

        cleanup();
        this.progress = 100;
        this.isRendering = false;
        this.notify();
        return;
      }

      let result: any = null;
      const synthParams = { singer: activeVoiceName, bpm: actualBpm, transpose: transposeSemitones, voice: trackEngineId, return_stems: true, collapse_chords: collapseChords, steps: svsSteps };
      
      let usedRunPod = false;
      let useDirectBlobUrl = false;
      let mainAudioBlob: Blob | null = null;
      let stemBlobs: Blob[] = [];

      if (svsEngine === 'browser-ai') {
        if (!selectedVoice?.model_files) {
          throw new Error(`The selected voice "${selectedVoice?.name || 'Unknown'}" does not support browser-side SVS rendering.`);
        }
        this.statusText = 'Loading models...';
        this.notify();

        console.log('[VocalidoRenderService] 🔍 selectedVoice.model_files:', JSON.stringify(Object.keys(selectedVoice.model_files || {})));
        console.log('[VocalidoRenderService] 🔍 neural fields:', {
          linguistic: !!selectedVoice.model_files?.linguistic,
          dur: !!selectedVoice.model_files?.dur,
          pitch: !!selectedVoice.model_files?.pitch,
          pitchLinguistic: !!selectedVoice.model_files?.pitchLinguistic,
        });
        const modelFiles = {
          acoustic: getVoiceModelUrl(selectedVoice.model_files.acoustic),
          vocoder: getVoiceModelUrl(selectedVoice.model_files.vocoder),
          dictionary: selectedVoice.model_files.dictionary ? getVoiceModelUrl(selectedVoice.model_files.dictionary) : undefined,
          phonemes: selectedVoice.model_files.phonemes ? getVoiceModelUrl(selectedVoice.model_files.phonemes) : undefined,
          embeds: selectedVoice.model_files.embeds ? Object.keys(selectedVoice.model_files.embeds).reduce((acc, key) => {
            if (selectedVoice.model_files?.embeds?.[key]) {
              acc[key] = getVoiceModelUrl(selectedVoice.model_files.embeds[key]);
            }
            return acc;
          }, {} as Record<string, string>) : undefined,
          // Neural sub-models for full DiffSinger pipeline (linguistic → dur → pitch → acoustic → vocoder)
          linguistic: selectedVoice.model_files.linguistic ? getVoiceModelUrl(selectedVoice.model_files.linguistic) : undefined,
          dur: selectedVoice.model_files.dur ? getVoiceModelUrl(selectedVoice.model_files.dur) : undefined,
          pitch: selectedVoice.model_files.pitch ? getVoiceModelUrl(selectedVoice.model_files.pitch) : undefined,
          pitchLinguistic: selectedVoice.model_files.pitchLinguistic ? getVoiceModelUrl(selectedVoice.model_files.pitchLinguistic) : undefined,
        };

        await clientSvsEngine.loadVoice(selectedVoice.id, modelFiles, (prog) => {
          this.statusText = prog.message;
          this.progress = Math.min(99.9, prog.progress);
          this.notify();
        });

        this.statusText = 'Generating vocals...';
        this.notify();

        const wavBlob = await clientSvsEngine.synthesize(notesToSynthesize, {
          bpm: actualBpm,
          formant_shift: 0,
          speed: 1.0,
          breathiness: 0,
          vocal_mode: 'root',
          steps: svsSteps,
        });

        const localBlobUrl = URL.createObjectURL(wavBlob);
        result = {
          audio_url: localBlobUrl,
          engine: 'browser_ai_webgpu',
          stems_b64: []
        };
        useDirectBlobUrl = true;
        mainAudioBlob = wavBlob;
      } else {
        // server-side vocalido SVS engine
        this.statusText = 'Sending synthesis request to server...';
        this.notify();

        const payload = {
          notes: notesToSynthesize,
          song_id: song.id,
          song_key: songKey,
          bpm_pct: bpmPct,
          lyric_mode: activeLyricMode,
          is_public: true,
          owner_id: userId || '',
          params: synthParams
        };

        const targetUrl = getFetchUrl('/studio/preview');
        
        let response: Response;
        try {
          response = await svsFetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
          }
          
          const data = await response.json();
          if (data.error) {
            throw new Error(data.error);
          }
          result = data;
        } catch (fetchErr: any) {
          // RunPod Fallback
          const runpodUrl = import.meta.env.VITE_RUNPOD_API_URL;
          const runpodKey = import.meta.env.VITE_RUNPOD_API_KEY;
          
          if (runpodUrl && runpodKey) {
            console.warn('[VocalidoRenderService] ⚠️ Server synthesis failed. Falling back to RunPod API...', fetchErr);
            this.statusText = 'Server offline. Rendering via RunPod GPU...';
            this.notify();
            
            const runpodPayload = {
              input: {
                notes: notesToSynthesize.map(n => ({
                  midi: n.midi || n.pitch || 60,
                  duration: n.duration,
                  startTime: n.startTime,
                  lyric: n.lyric
                })),
                params: synthParams
              }
            };
            
            const rpResponse = await fetch(runpodUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${runpodKey}`
              },
              body: JSON.stringify(runpodPayload),
              signal: controller.signal
            });
            
            if (!rpResponse.ok) {
              const rpErr = await rpResponse.text();
              throw new Error(`RunPod Serverless Error (${rpResponse.status}): ${rpErr}`);
            }
            
            let rpJson = await rpResponse.json();
            let status = rpJson.status;
            const jobId = rpJson.id;

            if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') {
              const statusUrl = runpodUrl.endsWith('/runsync')
                ? runpodUrl.replace('/runsync', `/status/${jobId}`)
                : runpodUrl.replace('/run', `/status/${jobId}`);
              let attempts = 0;
              const maxAttempts = 120;
              
              while ((status === 'IN_QUEUE' || status === 'IN_PROGRESS') && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
                this.statusText = `Starting GPU container... (${attempts * 2}s)`;
                this.notify();
                
                const pollResponse = await fetch(statusUrl, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${runpodKey}`
                  },
                  signal: controller.signal
                });
                
                if (!pollResponse.ok) {
                  throw new Error(`RunPod Status Error (${pollResponse.status})`);
                }
                
                rpJson = await pollResponse.json();
                status = rpJson.status;
              }
            }

            if (status === 'COMPLETED' && rpJson.output) {
              if (rpJson.output.error) {
                throw new Error(rpJson.output.error);
              }
              result = rpJson.output;
              usedRunPod = true;
              useDirectBlobUrl = true;
            } else {
              throw new Error(`RunPod job failed with status: ${status}`);
            }
          } else {
            throw fetchErr;
          }
        }
      }

      if (!result) {
        throw new Error('SVS rendering failed or returned no audio.');
      }

      // ── Process Result ──────────────
      if (result.audio_b64 || result.audio_url || result.saved_url) {
        let url = '';
        
        if (result.audio_url) {
          url = result.audio_url;
          if (url.startsWith('blob:')) {
            useDirectBlobUrl = true;
          }
        } else if (result.saved_url && !result.audio_b64) {
          url = result.saved_url;
        } else if (result.audio_b64) {
          const binary = atob(result.audio_b64);
          const array = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
          const blob = new Blob([array], { type: result.mime_type || 'audio/wav' });
          url = URL.createObjectURL(blob);
          useDirectBlobUrl = true;
          mainAudioBlob = blob;
        } else {
          throw new Error("Invalid synthesis response: no audio data");
        }
        
        let stemUrls: string[] = [];
        if (result.stems_b64 && result.stems_b64.length > 1) {
          stemUrls = result.stems_b64.map((b64: string) => {
            const binary = atob(b64);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
            const blob = new Blob([array], { type: result.mime_type || 'audio/wav' });
            useDirectBlobUrl = true;
            stemBlobs.push(blob);
            return URL.createObjectURL(blob);
          });
        }
        
        const finalUrl = useDirectBlobUrl ? url : fixAudioUrl(result.saved_url || url);
        const finalStemUrls = useDirectBlobUrl ? stemUrls : (result.saved_stem_urls || stemUrls || []).map((sUrl: string) => fixAudioUrl(sUrl));

        const cacheBustedUrl = useDirectBlobUrl ? url : (finalUrl.includes('?t=')
          ? finalUrl.replace(/\?t=\d+/, `?t=${Date.now()}`)
          : `${finalUrl}?t=${Date.now()}`);
          
        const stemsWithBust = useDirectBlobUrl ? stemUrls : finalStemUrls.map((sUrl: string) => {
          return sUrl.includes('?t=') ? sUrl.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${sUrl}?t=${Date.now()}`;
        });
        
        this.progress = 100;
        this.notify();
        cleanup();

        const filenameFromUrl = result.saved_url ? result.saved_url.split('/').pop() || '' : '';
        const voiceNameForHist = activeVoiceName || 'Auto';
        const storedVoiceName = collapseChords ? voiceNameForHist : `${voiceNameForHist}poly`;
        const storedEngineId = collapseChords ? (trackEngineId || 'default') : `${trackEngineId || 'default'}poly`;
        const shortVoice = voiceNameForHist !== 'Auto' ? ` · ${voiceNameForHist.split(/[\s_]/)[0]}${collapseChords ? '' : ' (poly)'}` : '';
        const newLabel = result.label || `${songKey} ${bpmPct}%${shortVoice}`;
        const newEntryKey = `${bpmPct}_${songKey}_${storedEngineId}_${activeLyricMode}_${storedVoiceName}`;
        
        saveRenderToLocalCache(
          song.id,
          newEntryKey,
          mainAudioBlob || url,
          stemBlobs.length > 0 ? stemBlobs : stemUrls
        );

        let history: any[] = [];
        try {
          const histStr = localStorage.getItem(`memo_render_history_${song.id}`);
          if (histStr) history = JSON.parse(histStr) || [];
        } catch (e) {}

        const filtered = history.filter(h => {
          const hLyric = mapToLyricMode(h.lyricMode || 'British Fixed Doh');
          const tLyric = mapToLyricMode(activeLyricMode);
          return !(
            h.bpmPercent === bpmPct && 
            h.songKey === songKey && 
            hLyric === tLyric &&
            (h.engineId || 'default') === storedEngineId &&
            (h.voiceName || 'Auto') === storedVoiceName
          );
        });

        const newHistory = [{
          bpmPercent: bpmPct,
          songKey: songKey,
          audioUrl: useDirectBlobUrl ? cacheBustedUrl : finalUrl,
          label: newLabel,
          filename: filenameFromUrl,
          lyricMode: activeLyricMode,
          engineId: storedEngineId,
          voiceName: storedVoiceName,
          savedStemUrls: useDirectBlobUrl ? stemUrls : finalStemUrls,
          renderedAt: new Date().toISOString(),
          isActiveBlob: useDirectBlobUrl,
        }, ...filtered].slice(0, 12);

        localStorage.setItem(`memo_render_history_${song.id}`, JSON.stringify(newHistory));
        localStorage.setItem(`active_render_key_${song.id}`, newEntryKey);
        this.activeRenderKey = newEntryKey;

        const updatedTracks = tracks.map((t: any) => 
          t.id === primaryTrackId ? { ...t, mode: 'vocal' } as TrackState : t
        );
        localStorage.setItem(`tracks_state_${song.id}`, JSON.stringify(updatedTracks));

        try {
          await musicEngine.addVocalLayer(primaryTrackId, cacheBustedUrl, stemsWithBust);
          
          if (useDirectBlobUrl && cacheBustedUrl.startsWith('blob:')) {
            musicEngine.unlockVocalAudio(primaryTrackId);
            const audioEl = musicEngine.vocalAudioElements.get(primaryTrackId);
            if (audioEl) {
              audioEl.src = cacheBustedUrl;
              audioEl.load();
            }
          }

          const livePlaying = wasPlaying || musicEngine.transportState === 'started';
          const livePos = savedPos;

          await musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
          musicEngine.setTransportSeconds(livePos);
          if (livePlaying) {
            await musicEngine.start();
          }
        } catch (loadErr) {
          console.error('[VocalidoRenderService] Error loading rendered audio into musicEngine:', loadErr);
        }

        try {
          localStorage.removeItem('vocalido_rendering_active_song');
        } catch (e) {}

        this.isRendering = false;
        this.notify();
      } else {
        throw new Error("Invalid synthesis response: no audio data in result");
      }
    } catch (err: any) {
      cleanup();
      try {
        localStorage.removeItem('vocalido_rendering_active_song');
      } catch (e) {}

      if (err.name === 'AbortError' || err.message === 'Aborted' || controller.signal.aborted) {
        console.log('[VocalidoRenderService] Synthesis aborted/cancelled by user');
        return;
      }
      console.error('[VocalidoRenderService] Synthesis Error:', err);
      this.error = err.message || "Synthesis Failed";
      this.isRendering = false;
      this.notify();
    }
  }

  public cancelRender() {
    if (this.abortController) {
      console.log('[VocalidoRenderService] 🛑 Cancelling synthesis in background...');
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isRendering = false;
    this.progress = 0;
    this.timer = 0;
    this.statusText = '';
    this.activeSongId = null;
    this.activeRenderKey = null;
    this.notify();
    
    try {
      localStorage.removeItem('vocalido_rendering_active_song');
    } catch (e) {}
  }
}

export const vocalidoRenderService = new VocalidoRenderService();
