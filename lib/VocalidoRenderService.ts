import * as Tone from 'tone';
import { musicEngine } from './MusicEngine';
import { clientSvsEngine, ClientSvsEngineProxy } from './ClientSvsEngine';
import { AudioBlobCache } from './AudioBlobCache';
import { getChromaticSolfege } from './SolfegeLogic';
import { ParsedNote, TrackState, Song, LyricMode } from '../types';

// ── ONE-TIME CACHE BUST FOR TRACK COUNT FIX (v17) ───────────────────────────
if (typeof window !== 'undefined') {
  const BUST_KEY = 'vocalido_cache_bust_v20_interval_coloring_fix';
  if (!localStorage.getItem(BUST_KEY)) {
    console.log('[Vocalido] ⚡ Cache bust v16: Force server-side (Vocalido) rendering as default...');
    try {
      // Always default to server-side Vocalido (RunPod GPU) — never auto-set browser-ai
      // User can still manually switch to Browser-AI from settings if needed
      localStorage.setItem('vocalido_svs_engine', 'vocalido');
      localStorage.setItem('vocalido_svs_steps', '10');
      localStorage.setItem('vocalido_active_engine', 'lotte_v_ai_dol');

      // 2. Clear all active render keys, tracks state, and history entries from localStorage safely
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('memo_render_history_') || 
          key.startsWith('active_render_key_') ||
          key.startsWith('tracks_state_')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

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
  const port = window.location.port;
  const isLocalIp = 
    hostname === 'localhost' || 
    hostname === '127.0.0.1' || 
    hostname.endsWith('.local') ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);
    
  if (isLocalIp) {
    // When running on Vite dev server (port 3100), use relative paths
    // so requests go through Vite's proxy → avoids CORS issues
    if (port === '3100') {
      return ''; // relative paths → Vite proxy handles forwarding to :5001
    }
    return hostname === 'localhost' ? `http://127.0.0.1:5001` : `http://${hostname}:5001`;
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
  if (path.startsWith('blob:') || path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const customBackend = getCustomBackendUrl();
  if (customBackend) {
    let cleanPath = path;
    if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
    if (cleanPath.startsWith('/vocalido/')) cleanPath = cleanPath.substring('/vocalido'.length);
    return `${customBackend}${cleanPath}`;
  }

  // Use relative paths — Vercel rewrites in vercel.json proxy /studio/* to RunPod
  return path;
};

// For server-side synthesis, route through Vercel /studio/* proxy.
// Async endpoints (/studio/preview-async, /studio/job/*) return in <1s
// so they safely fit within Vercel's 10s timeout and gain CORS headers.
const getDirectServerUrl = (path: string) => {
  let cleanPath = path;
  if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
  // Use relative path → routed through Vercel → RunPod proxy
  return cleanPath;
};

export const svsFetch = (url: string, options?: RequestInit) => {
  const headers = new Headers(options?.headers || {});
  headers.set('serveo-skip-browser-warning', 'true');
  headers.set('bypass-tunnel-reminder', 'true');
  return fetch(url, { ...options, headers });
};

/**
 * Submit a render to /studio/preview-async → get job_id → poll /studio/job/{id}
 * until status === 'done' or 'error'. This bypasses ALL proxy timeouts.
 * 
 * FALLBACK: If /studio/preview-async returns 404 (endpoint not available on
 * local servers), falls back to synchronous /studio/preview.
 */
const serverFetchWithAsyncPolling = async (
  payload: object,
  signal: AbortSignal,
  onProgress?: (msg: string) => void
): Promise<any> => {
  const asyncUrl = getDirectServerUrl('/studio/preview-async');
  const syncUrl = getDirectServerUrl('/studio/preview');
  const pollBase = getDirectServerUrl('/studio/job/');

  // 1. Try async endpoint first
  let submitRes: Response;
  try {
    submitRes = await svsFetch(asyncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });
  } catch (networkErr) {
    // Network error — fall through to sync fallback
    console.warn('[AsyncJob] Async endpoint network error, falling back to sync:', networkErr);
    submitRes = { ok: false, status: 0 } as Response;
  }

  // If async endpoint doesn't exist (404/405) or server error, fallback to sync
  if (!submitRes.ok) {
    const statusCode = submitRes.status;
    if (statusCode === 404 || statusCode === 405 || statusCode === 0) {
      console.log(`[AsyncJob] Async endpoint returned ${statusCode}, falling back to synchronous /studio/preview`);
      onProgress?.('Rendering on server (sync mode)...');

      const syncRes = await svsFetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      });

      if (!syncRes.ok) {
        const txt = await syncRes.text().catch(() => String(syncRes.status));
        throw new Error(`[SyncFallback] Server returned ${syncRes.status}: ${txt}`);
      }

      const data = await syncRes.json();
      console.log('[AsyncJob] Sync fallback succeeded:', Object.keys(data));
      return data;
    }

    // Other error — throw
    const txt = await submitRes.text().catch(() => String(submitRes.status));
    throw new Error(`[AsyncJob] Submit failed ${submitRes.status}: ${txt}`);
  }

  const { job_id } = await submitRes.json();
  if (!job_id) throw new Error('[AsyncJob] No job_id returned from server');

  onProgress?.(`Job queued (${job_id.slice(0, 6)}…), waiting for GPU...`);

  // 2. Poll until done (max 10 min)
  const startedAt = Date.now();
  while (Date.now() - startedAt < 600_000) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise(r => setTimeout(r, 3000));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const pollRes = await svsFetch(`${pollBase}${job_id}`, { signal });
    if (!pollRes.ok) continue;
    const data = await pollRes.json();

    if (data.status === 'done') return data;
    if (data.status === 'error') throw new Error(`[AsyncJob] Server error: ${data.error}`);
    // status is 'pending' or 'running' — keep polling

    onProgress?.(`GPU rendering... (${Math.round((Date.now() - startedAt) / 1000)}s)`);
  }
  throw new Error('[AsyncJob] Timeout waiting for render job');
};

const fixAudioUrl = (u: string) => {
  if (typeof u !== 'string') return u;
  if (u.startsWith('blob:') || u.startsWith('data:')) return u;
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
    
    // On localhost: use relative path so Vite dev server proxies it to the correct backend (Cloud VM or Local VM based on .env)
    if (isLocal && path.startsWith('/vocalido/voicebanks/')) {
      return path;
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
    svsEngine: 'vocalido' | 'browser-ai';
    svsSteps: number;
    svsTimingFeel: number;
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
      svsEngine,
      svsSteps,
      svsTimingFeel,
      currentBpm,
      voiceEngines,
      isMetronomeOn,
      userId
    } = params;

    let activeSvsEngine = svsEngine;
    if (activeSvsEngine === 'browser-ai' && typeof navigator !== 'undefined') {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        console.log('[VocalidoRenderService] 📱 Mobile device detected. Forcing Server-side rendering (vocalido) instead of WebGPU/Browser-AI.');
        activeSvsEngine = 'vocalido';
      }
    }

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
    }, 900000); // 15 min timeout for large orchestra scores on CPU
    this.timeoutId = timeoutId;

    const vocalIds = tracks.filter(t => t.mode === 'vocal').map(t => t.id);
    const noteCount = parsedData.notes.filter(n => vocalIds.includes(n.trackId)).length;
    const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
    let estimatedDuration = 10;
    
    const selectedVoice = voiceEngines.find(v => v.id === trackEngineId);

    if (activeSvsEngine === 'browser-ai') {
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
        simulatedProgress = (elapsed / estimatedDuration) * 85;
      } else {
        const extra = elapsed - estimatedDuration;
        // Slow curve approaching 95% maximum while waiting for server response
        simulatedProgress = 85 + (10 * (1 - Math.exp(-extra / 45)));
      }
      this.progress = Math.min(96, simulatedProgress);
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
      
      const vocalTrackIds = tracks.map(t => t.id);
      
      // ─── DEBUG: Show all tracks with modes and note counts ───
      const allNoteTrackIds = [...new Set(parsedData.notes.map(n => n.trackId))];
      console.log('[VocalidoRenderService] 📋 All tracks received:', tracks.map(t => `${t.id} (${t.mode})`));
      console.log('[VocalidoRenderService] 📋 Vocal track IDs:', vocalTrackIds);
      console.log('[VocalidoRenderService] 📋 Unique trackIds in parsedData.notes:', allNoteTrackIds);
      allNoteTrackIds.forEach(tid => {
        const count = parsedData.notes.filter(n => n.trackId === tid).length;
        const isVocal = vocalTrackIds.includes(tid);
        console.log(`[VocalidoRenderService]   → ${tid}: ${count} notes ${isVocal ? '✅ INCLUDED' : '❌ EXCLUDED'}`);
      });
      // ─── END DEBUG ───
      
      let sourceNotes = parsedData.notes.filter(n => {
        const tid = n.trackId || (tracks[0]?.id);
        return vocalTrackIds.includes(tid);
      });
      console.log(`[VocalidoRenderService] 📊 sourceNotes after filter: ${sourceNotes.length} / ${parsedData.notes.length} total`);
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
            songFifths,
            transposeSemitones
          );
          
          if (activeLyricMode === 'Lyric') {
            lyric = n.solfege || 'ah';
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
          lyric,
          trackId: n.trackId || (tracks[0]?.id || 'P1'),
          staff: n.staff ?? 1,
          voice: n.voice ?? 1
        };
      });

      // Build per-track summary for debug
      const trackSummary = allNoteTrackIds.map(tid => {
        const count = parsedData.notes.filter(n => n.trackId === tid).length;
        const isVocal = vocalTrackIds.includes(tid);
        return `${tid}: ${count} notes ${isVocal ? '✅' : '❌'}`;
      }).join(' | ');
      
      console.log(`[VocalidoRenderService] SVS rendering initialization... bpm=${currentBpm}, vocalTracks=${vocalTrackIds.length} (${vocalTrackIds.join(', ')}), sourceNotes=${sourceNotes.length}, notesToSynthesize=${notesToSynthesize.length}`);
      console.log(`[VocalidoRenderService] Track summary: ${trackSummary}`);
      // Show first 5 notes to verify pitch data correctness
      console.log('[VocalidoRenderService] 🎵 Sample notes (first 5):', notesToSynthesize.slice(0, 5).map(n => 
        `midi=${n.midi} lyric=${n.lyric} t=${n.startTime?.toFixed(2)} dur=${n.duration?.toFixed(2)}`
      ).join(' | '));
      
      // Show debug info on the render card so user can see without console
      this.statusText = `Preparing ${notesToSynthesize.length} notes from ${vocalTrackIds.length} tracks... [${trackSummary}]`;
      this.notify();

      await musicEngine.ensureInitialized();
      const xmlBpm = (parsedData.metadata as any)?.bpm;
      const actualBpm = currentBpm || xmlBpm || 120;
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
      
      const vocalTrackIdsStr = [...vocalTrackIds].sort().join(',');

      const cached = renderHistory.find(h => {
        if (!h.audioUrl) return false;
        if (h.audioUrl.startsWith('blob:') && !(h as any).isActiveBlob) return false;

        const hEng = (h.engineId || 'default').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const tEng = targetEngine.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const hVoice = (h.voiceName || 'Auto').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const tVoice = targetVoice.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        const hLyric = mapToLyricMode(h.lyricMode || 'British Fixed Doh');
        const tLyric = mapToLyricMode(activeLyricMode);
        
        const hTimingFeel = typeof h.timingFeel === 'number' ? h.timingFeel : 50;
        const hTracks = (h as any).vocalTracks || 'P1';
        const hTranspose = typeof h.transpose === 'number' ? h.transpose : 0;
        
        return h.bpmPercent === bpmPct && 
               h.songKey === songKey && 
               hTranspose === transpose &&
               hLyric === tLyric &&
               hTimingFeel === svsTimingFeel &&
               hTracks === vocalTrackIdsStr &&
               (hEng === tEng || hVoice === tEng || hEng === tVoice || hVoice === tVoice) &&
               h.version === 3;
      });

      const cachedKey = cached ? `${cached.bpmPercent}_${cached.songKey}_${cached.engineId || 'default'}_${cached.lyricMode || ''}_${cached.voiceName || 'Auto'}_tf${cached.timingFeel ?? 50}_tp${cached.transpose ?? 0}_tr${(cached as any).vocalTracks || 'P1'}_v2` : null;
      if (cached) {
        console.log(`[VocalidoRenderService] [MemoCache] ✅ Found cached render ${cached.label} — skipping SVS render`);
        const renderBpm = Math.round(((origBpm * cached.bpmPercent) / 100) * 10) / 10;
        const fixedUrl = fixAudioUrl(cached.audioUrl);
        const cacheBusted = fixedUrl.startsWith('blob:') ? fixedUrl
          : (fixedUrl.includes('?t=') ? fixedUrl.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixedUrl}?t=${Date.now()}`);
        const stemsWithBust = (cached.savedStemUrls || []).map((sUrl: string) => {
          const fixed = fixAudioUrl(sUrl);
          return fixed.startsWith('blob:') ? fixed
            : (fixed.includes('?t=') ? fixed.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixed}?t=${Date.now()}`);
        });

        const cachedVocalTracks = cached.vocalTracks ? cached.vocalTracks.split(',') : [primaryTrackId];
        // Set track mode to vocal so Play button works correctly
        const updatedTracks = tracks.map((t: any) => {
          if (cachedVocalTracks.includes(t.id)) return { ...t, mode: 'vocal' } as TrackState;
          return t;
        });
        localStorage.setItem(`tracks_state_${song.id}`, JSON.stringify(updatedTracks));

        // Load song FIRST so initSampler creates proper track channels
        // Then add vocal layer AFTER so it doesn't get overwritten by initSampler
        const livePlaying = wasPlaying || musicEngine.transportState === 'started';
        const livePos = savedPos;

        await musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
        
        // Load layer AFTER loadSong
        const cachedStemsByTrack = cached.stemsByTrack || {};
        for (const tid of cachedVocalTracks) {
          const rawTrackStems = cachedStemsByTrack[tid] || [];
          const trackStems = rawTrackStems.map((sUrl: string) => {
            const fixed = fixAudioUrl(sUrl);
            return fixed.startsWith('blob:') ? fixed
              : (fixed.includes('?t=') ? fixed.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixed}?t=${Date.now()}`);
          });
          let trackAudioUrl = "";
          let stemsToPass: string[] = [];
          
          if (trackStems.length > 0) {
            trackAudioUrl = trackStems[0];
            stemsToPass = trackStems.length > 1 ? trackStems : [];
          } else if (tid === primaryTrackId) {
            trackAudioUrl = cacheBusted;
            stemsToPass = stemsWithBust; // fallback
          }
          
          if (trackAudioUrl) {
            await musicEngine.addVocalLayer(tid, trackAudioUrl, stemsToPass, renderBpm);
          }
        }
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
      // ─── Polyphony: split into monophonic sub-tracks and assign stereo panning ───
      const beatSec = 60.0 / actualBpm;
      const primaryVocalTrackId = vocalTrackIds[0];
      
      interface VoiceLine {
        notes: typeof notesToSynthesize;
        pan: number; // -1.0 to 1.0
        label: string;
        trackId: string;
      }
      const voiceLines: VoiceLine[] = [];
      
      const trackGroups: Record<string, typeof notesToSynthesize> = {};
      for (const n of notesToSynthesize) {
        if (!n.trackId) n.trackId = primaryVocalTrackId; // fallback
        if (!trackGroups[n.trackId]) trackGroups[n.trackId] = [];
        trackGroups[n.trackId].push(n);
      }
      
      // ─── Polyphony: split into monophonic voice lines by track ───
      // MusicEngine has already split the polyphonic score into clean monophonic tracks.
      // We map each selected vocal track directly 1-to-1 to its own voice line.
      for (const tid of vocalTrackIds) {
        const trNotes = trackGroups[tid] || [];
        if (trNotes.length === 0) continue;
        const sortedNotes = [...trNotes].sort((a, b) => a.startTime - b.startTime);
        voiceLines.push({
          notes: sortedNotes,
          pan: 0,
          label: '',
          trackId: tid
        });
      }

      voiceLines.forEach((vl, idx) => {
        let pan = 0;
        let label = '';
        const total = voiceLines.length;
        
        if (total === 1) {
           pan = 0; label = 'Melody (C)';
        } else if (total === 2) {
           pan = idx === 0 ? -0.5 : 0.5;
           label = idx === 0 ? 'Top (L)' : 'Bottom (R)';
        } else if (total === 3) {
           pan = idx === 0 ? -0.8 : idx === 1 ? 0 : 0.8;
           label = idx === 0 ? 'Top (L)' : idx === 1 ? 'Mid (C)' : 'Bottom (R)';
        } else if (total === 4) {
           pan = idx === 0 ? -1 : idx === 1 ? -0.4 : idx === 2 ? 0.4 : 1;
           label = idx === 0 ? 'Soprano' : idx === 1 ? 'Alto' : idx === 2 ? 'Tenor' : 'Bass';
        } else {
           pan = -1 + (idx * (2 / (total - 1)));
           label = `Voice ${idx + 1}`;
        }
        vl.pan = pan;
        vl.label = label;
      });

      
      const isPolyphonic = voiceLines.length > 1;
      // Compute maxVertical for display (the maximum number of simultaneous notes found in the score)
      let maxSimultaneousVoices = voiceLines.length;
      console.log(`[VocalidoRenderService] 🎹 Note analysis: ${voiceLines.length} monophonic voice lines detected ${isPolyphonic ? '(POLYPHONIC)' : '(single voice)'}, max simultaneous: ${maxSimultaneousVoices}`);
      voiceLines.forEach((vl, i) => console.log(`[VocalidoRenderService]   Voice ${i + 1} [${vl.label} | Pan: ${vl.pan}]: ${vl.notes.length} notes`));
      if (isPolyphonic) {
        this.statusText = `🎹 ${voiceLines.length} voice lines detected (max ${maxSimultaneousVoices} simultaneous). Rendering...`;
        this.notify();
      }
      // ─── End polyphony detection ───

      let result: any = null;

      let svsPortamento = 120;
      let svsVibratoStart = 100;
      let svsVibratoDepth = 0;
      let svsVibratoSpeed = 4.8;
      let svsTimingFeel = 50;
      let svsPitchBlend = 0.0;

      try {
        const storedPortamento = localStorage.getItem('vocalido_portamento');
        if (storedPortamento !== null) svsPortamento = Number(storedPortamento);

        const storedVibStart = localStorage.getItem('vocalido_vibrato_start');
        if (storedVibStart !== null) svsVibratoStart = Number(storedVibStart);

        const storedVibDepth = localStorage.getItem('vocalido_vibrato_depth');
        if (storedVibDepth !== null) svsVibratoDepth = Number(storedVibDepth);

        const storedVibSpeed = localStorage.getItem('vocalido_vibrato_speed');
        if (storedVibSpeed !== null) svsVibratoSpeed = Number(storedVibSpeed);

        const storedTiming = localStorage.getItem('vocalido_svs_timing_feel');
        if (storedTiming !== null) svsTimingFeel = Number(storedTiming);
        
        const storedPitchBlend = localStorage.getItem('vocalido_pitch_blend');
        if (storedPitchBlend !== null) svsPitchBlend = Number(storedPitchBlend);
      } catch (e) {}

      // activeSvsEngine is already set above (line ~391) with mobile override applied

      const synthParams = { 
        singer: activeVoiceName, 
        bpm: actualBpm, 
        transpose: 0, // Notes are already transposed prior to this, avoid double transpose 
        voice: trackEngineId, 
        return_stems: true, 
        collapse_chords: collapseChords, 
        steps: svsSteps, 
        timing_feel: svsTimingFeel,
        portamento: svsPortamento,
        vibrato_start: svsVibratoStart,
        vibrato_depth: svsVibratoDepth,
        vibrato_speed: svsVibratoSpeed,
        pitch_blend: svsPitchBlend
      };
      let usedRunPod = false;
      let useDirectBlobUrl = false;
      let mainAudioBlob: Blob | null = null;
      let stemBlobs: Blob[] = [];
      let polyStemUrls: string[] = [];

      if (activeSvsEngine === 'browser-ai') {
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
          // Neural sub-models for full DiffSinger pipeline
          linguistic: selectedVoice.model_files.linguistic ? getVoiceModelUrl(selectedVoice.model_files.linguistic) : undefined,
          dur: selectedVoice.model_files.dur ? getVoiceModelUrl(selectedVoice.model_files.dur) : undefined,
          pitch: selectedVoice.model_files.pitch ? getVoiceModelUrl(selectedVoice.model_files.pitch) : undefined,
          pitchLinguistic: selectedVoice.model_files.pitchLinguistic ? getVoiceModelUrl(selectedVoice.model_files.pitchLinguistic) : undefined,
        };

        // Pre-load the main voice once (for single-voice or progress reporting)
        await clientSvsEngine.loadVoice(selectedVoice.id, modelFiles, (prog) => {
          this.statusText = prog.message;
          this.progress = Math.min(40, prog.progress * 0.4);
          this.notify();
        });

        if (isPolyphonic && voiceLines.length > 1) {
          console.log(`[VocalidoRenderService] [Browser-AI] 🎹 Polyphony: ${voiceLines.length} voice lines — spawning parallel workers...`);
          const audioBlobs: Blob[] = [];
          const renderedPan: number[] = [];

          // Spawn one Worker proxy per voice line for true parallel rendering
          const perVoiceWorkers = voiceLines.map(() => new ClientSvsEngineProxy());

          // Load voice model into each worker in parallel, then synthesize
          const voiceResults = await Promise.all(voiceLines.map(async (vl, vIdx) => {
            const workerProxy = perVoiceWorkers[vIdx];
            try {
              // Each worker loads its own copy of the voice model
              await workerProxy.loadVoice(selectedVoice.id, modelFiles, (prog) => {
                // Only report progress from voice 0 to avoid spamming
                if (vIdx === 0) {
                  this.progress = Math.min(50, prog.progress * 0.5);
                  this.notify();
                }
              });

              this.statusText = `Generating ${vl.label}... (${vl.notes.length} notes) [Parallel]`;
              this.notify();

              const wavBlob = await workerProxy.synthesize(vl.notes, {
                bpm: actualBpm,
                formant_shift: 0,
                speed: 1.0,
                breathiness: 0,
                vocal_mode: 'root',
                steps: svsSteps,
                timing_feel: svsTimingFeel,
                portamento: svsPortamento,
                vibrato_start: svsVibratoStart,
                vibrato_depth: svsVibratoDepth,
                vibrato_speed: svsVibratoSpeed,
              });

              console.log(`[VocalidoRenderService] [Browser-AI] ✅ Voice ${vIdx + 1} (${vl.label}) ready: ${(wavBlob.size / 1024).toFixed(0)} KB`);
              return { blob: wavBlob, pan: vl.pan };
            } catch (voiceErr: any) {
              console.warn(`[VocalidoRenderService] [Browser-AI] ❌ Voice ${vIdx + 1} (${vl.label}) failed:`, voiceErr);
              return null;
            }
          }));

          // Terminate all per-voice workers to free GPU/WASM memory
          perVoiceWorkers.forEach((w, i) => {
            try { (w as any).worker?.terminate(); } catch (e) {}
          });

          // Collect successful results in order
          for (const res of voiceResults) {
            if (res) {
              audioBlobs.push(res.blob);
              renderedPan.push(res.pan);
            }
          }
          console.log(`[VocalidoRenderService] [Browser-AI] 🎯 Parallel done: ${audioBlobs.length}/${voiceLines.length} voices OK`);


          if (audioBlobs.length === 0) {
            throw new Error('All voice lines failed to render');
          }

          // Mix all voice audio blobs together using AudioContext
          this.statusText = `Mixing ${audioBlobs.length} voice lines (Stereo)...`;
          this.notify();

          const decodeCtx = new AudioContext();
          const decodedBuffers: AudioBuffer[] = [];
          const decodedPans: number[] = [];
          for (let bIdx = 0; bIdx < audioBlobs.length; bIdx++) {
            const blob = audioBlobs[bIdx];
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
              decodedBuffers.push(decoded);
              decodedPans.push(renderedPan[bIdx]);
            } catch (decErr) {
              console.warn(`[VocalidoRenderService] [Browser-AI] ❌ Failed to decode voice ${bIdx + 1} audio:`, decErr);
            }
          }
          decodeCtx.close().catch(() => {});

          if (decodedBuffers.length === 0) {
            throw new Error('Failed to decode any voice audio');
          }

          // Mix: Stereo mix based on pan values
          const sampleRate = decodedBuffers[0].sampleRate;
          let maxLen = 0;
          for (const buf of decodedBuffers) {
            if (buf.length > maxLen) maxLen = buf.length;
          }

          const mixedL = new Float32Array(maxLen);
          const mixedR = new Float32Array(maxLen);

          for (let vIdx = 0; vIdx < decodedBuffers.length; vIdx++) {
            const buf = decodedBuffers[vIdx];
            const pan = decodedPans[vIdx] ?? 0;

            const angle = ((pan + 1) / 2) * (Math.PI / 2);
            const gainL = Math.cos(angle);
            const gainR = Math.sin(angle);

            if (buf.numberOfChannels === 1) {
              const ch = buf.getChannelData(0);
              for (let i = 0; i < ch.length; i++) {
                mixedL[i] += ch[i] * gainL;
                mixedR[i] += ch[i] * gainR;
              }
            } else if (buf.numberOfChannels >= 2) {
              const chL = buf.getChannelData(0);
              const chR = buf.getChannelData(1);
              for (let i = 0; i < chL.length; i++) {
                mixedL[i] += chL[i] * gainL;
                mixedR[i] += chR[i] * gainR;
              }
            }
          }

          // Normalize Stereo Mix
          let peak = 0;
          for (let i = 0; i < maxLen; i++) {
            const absL = Math.abs(mixedL[i]);
            const absR = Math.abs(mixedR[i]);
            if (absL > peak) peak = absL;
            if (absR > peak) peak = absR;
          }
          if (peak > 0.001) {
            for (let i = 0; i < maxLen; i++) {
              mixedL[i] = (mixedL[i] / peak) * 0.92;
              mixedR[i] = (mixedR[i] / peak) * 0.92;
            }
          }

          // Encode to Stereo WAV blob
          const wavHeader = new ArrayBuffer(44);
          const view = new DataView(wavHeader);
          const numSamples = maxLen;
          const numChannels = 2;
          const byteRate = sampleRate * numChannels * 2;
          view.setUint32(0, 0x52494646, false); // "RIFF"
          view.setUint32(4, 36 + numSamples * numChannels * 2, true);
          view.setUint32(8, 0x57415645, false); // "WAVE"
          view.setUint32(12, 0x666d7420, false); // "fmt "
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true); // PCM
          view.setUint16(22, numChannels, true); // stereo
          view.setUint32(24, sampleRate, true);
          view.setUint32(28, byteRate, true);
          view.setUint16(32, numChannels * 2, true);
          view.setUint16(34, 16, true);
          view.setUint32(36, 0x64617461, false); // "data"
          view.setUint32(40, numSamples * numChannels * 2, true);

          const pcm = new Int16Array(numSamples * numChannels);
          for (let i = 0; i < numSamples; i++) {
            let sL = Math.max(-1, Math.min(1, mixedL[i]));
            let sR = Math.max(-1, Math.min(1, mixedR[i]));
            pcm[i * 2] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;
            pcm[i * 2 + 1] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
          }

          const mixedBlob = new Blob([wavHeader, pcm.buffer], { type: 'audio/wav' });
          const mixedUrl = URL.createObjectURL(mixedBlob);

          const voiceStemUrls: string[] = [];
          for (const blob of audioBlobs) {
            voiceStemUrls.push(URL.createObjectURL(blob));
            stemBlobs.push(blob);
          }

          polyStemUrls = voiceStemUrls;
          result = {
            audio_url: mixedUrl,
            audio_b64: null,
            saved_url: null,
            engine: 'browser_ai_polyphony',
            stems_b64: [],
            mime_type: 'audio/wav'
          };
          useDirectBlobUrl = true;
          mainAudioBlob = mixedBlob;

        } else {
          this.statusText = `Generating vocals... (${notesToSynthesize.length} notes)`;
          this.notify();

          const wavBlob = await clientSvsEngine.synthesize(notesToSynthesize, {
            bpm: actualBpm,
            formant_shift: 0,
            speed: 1.0,
            breathiness: 0,
            vocal_mode: 'root',
            steps: svsSteps,
            timing_feel: svsTimingFeel,
            portamento: svsPortamento,
            vibrato_start: svsVibratoStart,
            vibrato_depth: svsVibratoDepth,
            vibrato_speed: svsVibratoSpeed,
          });

          const localBlobUrl = URL.createObjectURL(wavBlob);
          result = {
            audio_url: localBlobUrl,
            engine: 'browser_ai_webgpu',
            stems_b64: []
          };
          useDirectBlobUrl = true;
          mainAudioBlob = wavBlob;
        }
      } else {
        // server-side vocalido SVS engine
        if (isPolyphonic && voiceLines.length > 1) {
          // ─── Multi-pass polyphony: render each voice line separately, then stereo mix ───
          console.log(`[VocalidoRenderService] 🎹 Multi-pass polyphony: rendering ${voiceLines.length} voice lines via server...`);

          const targetUrl = getDirectServerUrl('/studio/preview');
          const audioBlobs: Blob[] = [];
          const renderedPan: number[] = [];

          // ── CONCURRENCY MANAGER (Future-proof for Multi-GPU) ──
          // Adjust this value when upgrading server hardware to multiple GPUs
          // or larger VRAM capacity that supports parallel DiffSinger inference.
          const MAX_CONCURRENT_VOICES = 8;

          console.log(`[VocalidoRenderService] 🎶 Server render: ${voiceLines.length} voices (Concurrency limit: ${MAX_CONCURRENT_VOICES})`);

          const renderOneVoice = async (vl: typeof voiceLines[0], vIdx: number): Promise<{ blob: Blob; pan: number } | null> => {
            const noteHash = vl.notes.slice(0, 8).map((n: any) => n.midi).join('-');
            const vlSongId = `${song.id}_vl${vIdx}_bpm${Math.round(actualBpm)}_${noteHash}`;
            const vlParams = { ...synthParams, collapse_chords: false, voice_line: vIdx };
            const payload = {
              notes: vl.notes,
              song_id: vlSongId,
              song_key: songKey,
              bpm_pct: bpmPct,
              lyric_mode: activeLyricMode,
              is_public: true,
              owner_id: userId || '',
              params: vlParams
            };

            try {
              console.log(`[VocalidoRenderService] 📤 Voice ${vIdx + 1}/${voiceLines.length} (${vl.label}) → ${vl.notes.length} notes`);
              this.statusText = `Rendering voice ${vIdx + 1}/${voiceLines.length} (${vl.label}) on GPU...`;
              this.notify();

              const data = await serverFetchWithAsyncPolling(
                payload,
                controller.signal,
                (msg) => {
                  this.statusText = `Voice ${vIdx + 1}/${voiceLines.length}: ${msg}`;
                  this.notify();
                }
              );

              console.log(`[VocalidoRenderService] 📥 Voice ${vIdx + 1} engine=${data.engine}`);
              if (data.error) {
                console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} server error: ${data.error}`);
                return null;
              }

              let audioBlob: Blob | null = null;
              if (data.audio_b64) {
                const binary = atob(data.audio_b64);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                audioBlob = new Blob([array], { type: data.mime_type || 'audio/mpeg' });
              } else if (data.audio_url || data.saved_url) {
                const audioUrl = fixAudioUrl(data.saved_url || data.audio_url);
                const audioResp = await svsFetch(audioUrl, { signal: controller.signal });
                if (audioResp.ok) {
                  audioBlob = await audioResp.blob();
                } else {
                  console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} audio fetch ${audioResp.status} for ${audioUrl}`);
                }
              }

              if (audioBlob && audioBlob.size > 0) {
                console.log(`[VocalidoRenderService] ✅ Voice ${vIdx + 1} (${vl.label}) ready: ${(audioBlob.size / 1024).toFixed(0)} KB`);
                return { blob: audioBlob, pan: vl.pan };
              } else {
                console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} got 0KB audio`);
              }
            } catch (voiceErr: any) {
              if (voiceErr.name === 'AbortError') throw voiceErr;
              console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} exception:`, voiceErr);
            }
            return null;
          };

          // Run voices with concurrency limits
          const results = new Array(voiceLines.length).fill(null);
          let currentVoiceIdx = 0;

          const renderWorker = async () => {
            while (currentVoiceIdx < voiceLines.length) {
              if (controller.signal.aborted) break;
              const vIdx = currentVoiceIdx++;
              results[vIdx] = await renderOneVoice(voiceLines[vIdx], vIdx);
            }
          };

          // Spawn up to MAX_CONCURRENT_VOICES workers
          const workers = Array.from({ length: Math.min(MAX_CONCURRENT_VOICES, voiceLines.length) }, () => renderWorker());
          await Promise.all(workers);

          for (const res of results) {
            if (res) {
              audioBlobs.push(res.blob);
              renderedPan.push(res.pan);
            }
          }

          console.log(`[VocalidoRenderService] 🎯 Render pool done: ${audioBlobs.length}/${voiceLines.length} voices OK`);

          if (audioBlobs.length === 0) {
            throw new Error('All voice lines failed to render');
          }

          // Mix all voice audio blobs together using AudioContext
          this.statusText = `Mixing ${audioBlobs.length} voice lines (Stereo)...`;
          this.notify();
          
          // Use a standard AudioContext for reliable decoding (OfflineAudioContext with 1 sample is not suitable)
          const decodeCtx = new AudioContext();
          const decodedBuffers: AudioBuffer[] = [];
          const decodedPans: number[] = [];
          for (let bIdx = 0; bIdx < audioBlobs.length; bIdx++) {
            const blob = audioBlobs[bIdx];
            try {
              const arrayBuffer = await blob.arrayBuffer();
              console.log(`[VocalidoRenderService] 🔊 Decoding voice ${bIdx + 1}: ${(blob.size/1024).toFixed(0)}KB, type=${blob.type}`);
              const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
              decodedBuffers.push(decoded);
              decodedPans.push(renderedPan[bIdx]);
              console.log(`[VocalidoRenderService] ✅ Decoded voice ${bIdx + 1}: ${decoded.length} samples @ ${decoded.sampleRate}Hz, ${decoded.numberOfChannels}ch`);
            } catch (decErr) {
              console.warn(`[VocalidoRenderService] ❌ Failed to decode voice ${bIdx + 1} audio:`, decErr);
            }
          }
          // Close decode context to free resources
          decodeCtx.close().catch(() => {});
          
          if (decodedBuffers.length === 0) {
            throw new Error('Failed to decode any voice audio');
          }
          
          // Mix: Stereo mix based on pan values
          const sampleRate = decodedBuffers[0].sampleRate;
          let maxLen = 0;
          for (const buf of decodedBuffers) {
            if (buf.length > maxLen) maxLen = buf.length;
          }
          
          const mixedL = new Float32Array(maxLen);
          const mixedR = new Float32Array(maxLen);
          
          for (let vIdx = 0; vIdx < decodedBuffers.length; vIdx++) {
            const buf = decodedBuffers[vIdx];
            const pan = decodedPans[vIdx] ?? 0;
            
            // Equal power panning: angle from 0 (Left) to PI/2 (Right)
            const angle = ((pan + 1) / 2) * (Math.PI / 2);
            const gainL = Math.cos(angle);
            const gainR = Math.sin(angle);
            
            if (buf.numberOfChannels === 1) {
              const ch = buf.getChannelData(0);
              for (let i = 0; i < ch.length; i++) {
                mixedL[i] += ch[i] * gainL;
                mixedR[i] += ch[i] * gainR;
              }
            } else if (buf.numberOfChannels >= 2) {
              const chL = buf.getChannelData(0);
              const chR = buf.getChannelData(1);
              for (let i = 0; i < chL.length; i++) {
                mixedL[i] += chL[i] * gainL;
                mixedR[i] += chR[i] * gainR;
              }
            }
          }
          
          // Normalize Stereo Mix
          let peak = 0;
          for (let i = 0; i < maxLen; i++) {
            const absL = Math.abs(mixedL[i]);
            const absR = Math.abs(mixedR[i]);
            if (absL > peak) peak = absL;
            if (absR > peak) peak = absR;
          }
          if (peak > 0.001) {
            for (let i = 0; i < maxLen; i++) {
              mixedL[i] = (mixedL[i] / peak) * 0.92;
              mixedR[i] = (mixedR[i] / peak) * 0.92;
            }
          }
          
          // Encode to Stereo WAV blob
          const wavHeader = new ArrayBuffer(44);
          const view = new DataView(wavHeader);
          const numSamples = maxLen;
          const numChannels = 2;
          const byteRate = sampleRate * numChannels * 2;
          view.setUint32(0, 0x52494646, false); // "RIFF"
          view.setUint32(4, 36 + numSamples * numChannels * 2, true);
          view.setUint32(8, 0x57415645, false); // "WAVE"
          view.setUint32(12, 0x666d7420, false); // "fmt "
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true); // PCM
          view.setUint16(22, numChannels, true); // stereo
          view.setUint32(24, sampleRate, true);
          view.setUint32(28, byteRate, true);
          view.setUint16(32, numChannels * 2, true); // block align
          view.setUint16(34, 16, true); // bits per sample
          view.setUint32(36, 0x64617461, false); // "data"
          view.setUint32(40, numSamples * numChannels * 2, true);
          
          const pcm = new Int16Array(numSamples * numChannels);
          for (let i = 0; i < numSamples; i++) {
            let sL = Math.max(-1, Math.min(1, mixedL[i]));
            let sR = Math.max(-1, Math.min(1, mixedR[i]));
            pcm[i * 2] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;
            pcm[i * 2 + 1] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
          }
          
          const mixedBlob = new Blob([wavHeader, pcm.buffer], { type: 'audio/wav' });
          const mixedUrl = URL.createObjectURL(mixedBlob);
          
          console.log(`[VocalidoRenderService] 🎹 Polyphony mix complete: ${decodedBuffers.length} voices, ${(mixedBlob.size / 1024).toFixed(0)} KB (STEREO)`);
          
          // Create individual voice stem URLs for Solo/Mute functionality
          const voiceStemUrls: string[] = [];
          for (const blob of audioBlobs) {
            voiceStemUrls.push(URL.createObjectURL(blob));
            stemBlobs.push(blob);
          }
          console.log(`[VocalidoRenderService] 🎵 Created ${voiceStemUrls.length} stem URLs for Solo/Mute: ${voiceLines.map(vl => vl.label).join(', ')}`);
          
          // Store at outer scope so they're available when processing the result
          polyStemUrls = voiceStemUrls;
          result = {
            audio_url: mixedUrl,
            audio_b64: null,
            saved_url: null,
            engine: 'vocalido_polyphony',
            stems_b64: [],
            mime_type: 'audio/wav'
          };
          useDirectBlobUrl = true;
          mainAudioBlob = mixedBlob;
        } else {
          // Single voice (no polyphony) — standard server request
          this.statusText = 'Sending synthesis request to server...';
          this.notify();

          // Include a note-content hash in song_id to prevent stale server cache
          const noteHash = notesToSynthesize.slice(0, 8).map((n: any) => n.midi).join('-');
          const cacheKey = `${song.id}_bpm${Math.round(actualBpm)}_${noteHash}_${activeLyricMode}`;

          const payload = {
            notes: notesToSynthesize,
            song_id: cacheKey,
            song_key: songKey,
            bpm_pct: bpmPct,
            lyric_mode: activeLyricMode,
            is_public: true,
            owner_id: userId || '',
            params: synthParams
          };

          // ─── DIAGNOSTIC: Log note data being sent ───
          const midiValues = notesToSynthesize.slice(0, 10).map((n: any) => n.midi || n.pitch);
          const lyrics = notesToSynthesize.slice(0, 10).map((n: any) => n.lyric);
          console.log(`[VocalidoRenderService] 📤 Single voice render: ${notesToSynthesize.length} notes`);
          console.log(`[VocalidoRenderService] 📊 First 10 MIDI: [${midiValues.join(', ')}]`);
          console.log(`[VocalidoRenderService] 📊 First 10 Lyrics: [${lyrics.join(', ')}]`);
          console.log(`[VocalidoRenderService] 📊 BPM: ${synthParams.bpm}, Voice: ${synthParams.voice || synthParams.singer}, collapse_chords: ${synthParams.collapse_chords}`);

          console.log(`[VocalidoRenderService] 📡 Using async job polling (bypasses proxy timeouts)`);
          
          try {
            // Use async polling: submit → poll every 3s → get result when done
            const data = await serverFetchWithAsyncPolling(
              payload,
              controller.signal,
              (msg) => {
                this.statusText = msg;
                this.notify();
              }
            );
            console.log(`[VocalidoRenderService] 📥 Server response: engine=${data.engine}, cached=${data.cached}, notes=${data.notes}, saved_url=${data.saved_url || 'N/A'}`);
            if (data.error) {
              throw new Error(data.error);
            }
            result = data;
        } catch (fetchErr: any) {
          console.error('[VocalidoRenderService] Server synthesis failed:', fetchErr);
          throw fetchErr;
        }
        } // end single-voice else
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
          console.log('[VocalidoRenderService] 🔄 Decoding base64 audio...', result.audio_b64.length, 'chars');
          try {
            const mime = result.mime_type || 'audio/wav';
            const base64Str = result.audio_b64.startsWith('data:') ? result.audio_b64 : `data:${mime};base64,${result.audio_b64}`;
            const res = await fetch(base64Str);
            const blob = await res.blob();
            url = URL.createObjectURL(blob);
            useDirectBlobUrl = true;
            mainAudioBlob = blob;
            console.log('[VocalidoRenderService] ✅ Audio blob created:', blob.size, 'bytes, url:', url);
          } catch (e) {
            console.error('[VocalidoRenderService] Base64 decode error:', e);
            throw new Error('Failed to decode audio base64');
          }
        } else {
          throw new Error("Invalid synthesis response: no audio data");
        }
        
        let stemUrls: string[] = [];
        if (result.stems_b64 && result.stems_b64.length > 1) {
          stemUrls = await Promise.all(result.stems_b64.map(async (b64: string) => {
            const mime = result.mime_type || 'audio/wav';
            const base64Str = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
            const res = await fetch(base64Str);
            const blob = await res.blob();
            useDirectBlobUrl = true;
            stemBlobs.push(blob);
            return URL.createObjectURL(blob);
          }));
        }
        // Use polyphonic voice stems if available (from multi-pass rendering)
        if (polyStemUrls.length > 0 && stemUrls.length === 0) {
          stemUrls = polyStemUrls;
          console.log(`[VocalidoRenderService] 🎵 Using ${polyStemUrls.length} polyphonic voice stems for Solo/Mute`);
        }
        
        const finalUrl = useDirectBlobUrl ? url : fixAudioUrl(result.saved_url || url);
        const finalStemUrls = useDirectBlobUrl ? stemUrls : (result.saved_stem_urls || stemUrls || []).map((sUrl: string) => fixAudioUrl(sUrl));

        const cacheBustedUrl = useDirectBlobUrl ? url : (finalUrl.includes('?t=')
          ? finalUrl.replace(/\?t=\d+/, `?t=${Date.now()}`)
          : `${finalUrl}?t=${Date.now()}`);
          
        const stemsWithBust = useDirectBlobUrl ? stemUrls : finalStemUrls.map((sUrl: string) => {
          return sUrl.includes('?t=') ? sUrl.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${sUrl}?t=${Date.now()}`;
        });
        
        const stemsByTrack: Record<string, string[]> = {};
        
        // If polyphony is OFF or chords are collapsed, we have a single merged audio line representing ALL selected tracks.
        if (voiceLines.length === 1 && vocalTrackIds.length > 0) {
          for (const tid of vocalTrackIds) {
            stemsByTrack[tid] = stemsWithBust.length > 0 ? stemsWithBust : [cacheBustedUrl];
          }
        } else {
          // Polyphonic mode: map each generated stem to its correct voice line track.
          // This allows each split UI track (_V1, _V2...) to have its own audio for proper Solo/Mute.
          for (let i = 0; i < voiceLines.length; i++) {
            const vTrackId = voiceLines[i].trackId;
            if (i < stemsWithBust.length) {
              if (!stemsByTrack[vTrackId]) stemsByTrack[vTrackId] = [];
              stemsByTrack[vTrackId].push(stemsWithBust[i]);
            }
          }
          console.log(`[VocalidoRenderService] 🎵 Polyphonic stemsByTrack mapped individually for ${voiceLines.length} tracks`);
        }
        
        this.progress = 90;
        this.statusText = 'Saving audio cache...';
        this.notify();
        cleanup();
        console.log('[VocalidoRenderService] ✅ Server finished. Progress 90% — caching result...');

        const filenameFromUrl = result.saved_url ? result.saved_url.split('/').pop() || '' : '';
        const voiceNameForHist = activeVoiceName || 'Auto';
        const storedVoiceName = collapseChords ? voiceNameForHist : `${voiceNameForHist}poly`;
        const storedEngineId = collapseChords ? (trackEngineId || 'default') : `${trackEngineId || 'default'}poly`;
        const shortVoice = voiceNameForHist !== 'Auto' ? ` · ${voiceNameForHist.split(/[\s_]/)[0]}${collapseChords ? '' : ' (poly)'}` : '';
        const newLabel = result.label || `${songKey} ${bpmPct}%${shortVoice}`;
        const newEntryKey = `${bpmPct}_${songKey}_${storedEngineId}_${activeLyricMode}_${storedVoiceName}_tf${svsTimingFeel}_tp${transpose}_tr${vocalTrackIdsStr}_v2`;
        
        console.log('[VocalidoRenderService] 💾 Saving render to local cache...');
        saveRenderToLocalCache(
          song.id,
          newEntryKey,
          mainAudioBlob || url,
          stemBlobs.length > 0 ? stemBlobs : stemUrls
        );
        console.log('[VocalidoRenderService] ✅ Saved to local cache');

        let history: any[] = [];
        try {
          const histStr = localStorage.getItem(`memo_render_history_${song.id}`);
          if (histStr) history = JSON.parse(histStr) || [];
        } catch (e) {}

        const filtered = history.filter(h => {
          const hLyric = mapToLyricMode(h.lyricMode || 'British Fixed Doh');
          const tLyric = mapToLyricMode(activeLyricMode);
          const hTimingFeel = typeof h.timingFeel === 'number' ? h.timingFeel : 50;
          const hTranspose = typeof h.transpose === 'number' ? h.transpose : 0;
          return !(
            h.bpmPercent === bpmPct && 
            h.songKey === songKey && 
            hTranspose === transpose &&
            hLyric === tLyric &&
            hTimingFeel === svsTimingFeel &&
            (h.engineId || 'default') === storedEngineId &&
            (h.voiceName || 'Auto') === storedVoiceName
          );
        });

        const newHistory = [{
          bpmPercent: bpmPct,
          songKey: songKey,
          transpose: transpose,
          absoluteBpm: currentBpm,
          audioUrl: cacheBustedUrl,
          label: newLabel,
          filename: filenameFromUrl,
          lyricMode: activeLyricMode,
          engineId: storedEngineId,
          voiceName: storedVoiceName,
          savedStemUrls: stemsWithBust,
          renderedAt: new Date().toISOString(),
          isActiveBlob: useDirectBlobUrl,
          timingFeel: svsTimingFeel,
          vocalTracks: vocalTrackIdsStr,
          stemsByTrack: stemsByTrack,
          // ── Project Snapshot: capture all settings at render time ──
          tracksSnapshot: tracks.map(t => ({
            id: t.id, name: t.name, instrument: t.instrument,
            mode: t.mode, volume: t.volume, pan: t.pan, muted: t.muted,
          })),
          svsEngine: activeSvsEngine,
          svsSteps: svsSteps,
          collapseChords: collapseChords,
          isMetronomeOn: isMetronomeOn,
          version: 3
        }, ...filtered].slice(0, 12);

        localStorage.setItem(`memo_render_history_${song.id}`, JSON.stringify(newHistory));
        localStorage.setItem(`active_render_key_${song.id}`, newEntryKey);
        this.activeRenderKey = newEntryKey;

        const updatedTracks = tracks.map((t: any) => {
          // Set ALL rendered tracks to vocal mode so their piano synth is muted and UI updates
          if (vocalTrackIds.includes(t.id)) return { ...t, mode: 'vocal' } as TrackState;
          return t;
        });
        localStorage.setItem(`tracks_state_${song.id}`, JSON.stringify(updatedTracks));

        try {
          const activeSongId = localStorage.getItem('memo_selected_song_id');
          if (activeSongId === song.id || !activeSongId) {
            const livePlaying = wasPlaying || musicEngine.transportState === 'started';
            const livePos = savedPos;

            this.progress = 95;
            this.statusText = 'Decoding audio layer...';
            this.notify();

            console.log('[VocalidoRenderService] 🎵 Loading song into musicEngine...');
            // loadSong FIRST — creates Part/Sampler channels
            await musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
            console.log('[VocalidoRenderService] ✅ musicEngine.loadSong done');
            
            // addVocalLayer AFTER — so initSampler doesn't overwrite the vocal layer
            const isPolyMode = polyStemUrls.length > 0;
            for (const tid of vocalTrackIds) {
              const trackStems = stemsByTrack[tid] || [];
              let trackAudioUrl = "";
              let stemsToPass: string[] = [];
              
              if (isPolyMode) {
                // If it has specific stems assigned to it, use them
                if (trackStems.length > 0) {
                  trackAudioUrl = trackStems[0]; // first stem as main audio
                  stemsToPass = trackStems;
                } else if (tid === primaryVocalTrackId && trackStems.length === 0 && stemsWithBust.length === 0) {
                  // Fallback
                  trackAudioUrl = cacheBustedUrl;
                  stemsToPass = [cacheBustedUrl];
                }
                console.log(`[VocalidoRenderService] 🎤 Poly mode track ${tid}: main=${trackAudioUrl ? 'YES' : 'NO'}, stems=${stemsToPass.length}`);
              } else {
                trackAudioUrl = trackStems.length > 0 ? trackStems[0] : cacheBustedUrl;
                stemsToPass = trackStems.length > 0 ? trackStems : [cacheBustedUrl];
              }
              
              if (trackAudioUrl) {
                console.log(`[VocalidoRenderService] 🎤 Adding vocal layer for track ${tid}: main=${trackAudioUrl.substring(0, 60)}..., stems=${stemsToPass.length}`);
                await musicEngine.addVocalLayer(tid, trackAudioUrl, stemsToPass, actualBpm);
                console.log(`[VocalidoRenderService] ✅ Vocal layer added for ${tid}`);
              }
            }
            
            for (const tid of vocalTrackIds) {
              // For polyphonic mode: assign its individual stem url so we get proper separation.
              // Fall back to cacheBustedUrl only if individual stems are not available.
              const tAudioUrl = ((stemsByTrack[tid] || []).length > 0)
                ? (stemsByTrack[tid] || [])[0]
                : (tid === primaryVocalTrackId ? cacheBustedUrl : "");
              if (tAudioUrl) {
                let audioEl = musicEngine.vocalAudioElements.get(tid);
                if (!audioEl) {
                  audioEl = new Audio();
                  audioEl.crossOrigin = 'anonymous';
                  audioEl.preservesPitch = true;
                  musicEngine.vocalAudioElements.set(tid, audioEl);
                }
                audioEl.src = tAudioUrl;
                audioEl.load();
              }
            }

            musicEngine.setTransportSeconds(livePos);
            if (livePlaying) {
              await musicEngine.start();
            }
          } else {
            console.log(`[VocalidoRenderService] 🎵 Render for ${song.id} finished, but user is currently on ${activeSongId}. Skipping musicEngine load.`);
          }
        } catch (loadErr) {
          console.error('[VocalidoRenderService] Error loading rendered audio into musicEngine:', loadErr);
        }

        try {
          localStorage.removeItem('vocalido_rendering_active_song');
        } catch (e) {}

        this.progress = 100;
        this.statusText = 'Done!';
        this.notify();
        
        // Small delay to let user see 100% before closing
        setTimeout(() => {
          this.isRendering = false;
          this.notify();
        }, 300);

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
        this.isRendering = false;
        this.notify();
        return;
      }
      console.error('[VocalidoRenderService] Synthesis Error:', err);
      const errDetail = `${err.name || 'Error'}: ${err.message || 'Unknown'} | URL: ${err.url || 'N/A'}`;
      this.error = errDetail;
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
    this.error = null;
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

  public async renderWithLyria(abcData: string, prompt: string): Promise<string> {
    try {
      const backendUrl = getCustomBackendUrl() || 'http://localhost:5001';
      const response = await svsFetch(`${backendUrl}/api/ai/lyria-render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abc: abcData, prompt })
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to render with Lyria');
      }
      
      return data.data.url;
    } catch (err: any) {
      console.error('[Lyria Render Error]', err);
      throw err;
    }
  }
}

export const vocalidoRenderService = new VocalidoRenderService();
