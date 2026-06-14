import * as Tone from 'tone';
import { musicEngine } from './MusicEngine';
import { clientSvsEngine } from './ClientSvsEngine';
import { AudioBlobCache } from './AudioBlobCache';
import { getChromaticSolfege } from './SolfegeLogic';
import { ParsedNote, TrackState, Song, LyricMode } from '../types';

// ── ONE-TIME CACHE BUST FOR NEW F0 PITCH FIX ─────────────────────────────────
if (typeof window !== 'undefined') {
  const BUST_KEY = 'vocalido_cache_bust_v15_measure_sync';
  if (!localStorage.getItem(BUST_KEY)) {
    console.log('[Vocalido] ⚡ Cache bust v15: Enforce global measure start time alignment and sync...');
    try {
      // Force default SVS engine based on platform: Server-side on localhost/LAN for dev, browser-ai on Vercel
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || 
                      hostname === '127.0.0.1' || 
                      hostname.endsWith('.local') || 
                      !hostname.includes('.') ||
                      /^192\.168\./.test(hostname) ||
                      /^10\./.test(hostname) ||
                      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
      localStorage.setItem('vocalido_svs_engine', isLocal ? 'vocalido' : 'browser-ai');
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
  // If customBackend is empty, use relative paths (Vite proxy will forward)
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
      
      const vocalTrackIds = tracks.filter(t => t.mode === 'vocal').map(t => t.id);
      
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
      
      let sourceNotes = parsedData.notes.filter(n => vocalTrackIds.includes(n.trackId));
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
          trackId: n.trackId
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
        
        return h.bpmPercent === bpmPct && 
               h.songKey === songKey && 
               hLyric === tLyric &&
               hTimingFeel === svsTimingFeel &&
               hTracks === vocalTrackIdsStr &&
               (hEng === tEng || hVoice === tEng || hEng === tVoice || hVoice === tVoice) &&
               h.version === 3;
      });

      const cachedKey = cached ? `${cached.bpmPercent}_${cached.songKey}_${cached.engineId || 'default'}_${cached.lyricMode || ''}_${cached.voiceName || 'Auto'}_tf${cached.timingFeel ?? 50}_tr${(cached as any).vocalTracks || 'P1'}` : null;
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
              : (fixed.includes('?t=') ? fixed.replace(/\\?t=\\d+/, `?t=${Date.now()}`) : `${fixed}?t=${Date.now()}`);
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
      
      for (const tid of vocalTrackIds) {
        const tNotes = trackGroups[tid] || [];
        if (tNotes.length === 0) continue;
        
        // ─── Robust Polyphony Splitting (Greedy Interval Scheduling) ───
        // Sort by startTime asc, then pitch desc (highest first)
        const sorted = [...tNotes].sort((a, b) => {
          const timeDiff = a.startTime - b.startTime;
          if (Math.abs(timeDiff) > 0.005) return timeDiff;
          return (b.midi || b.pitch || 60) - (a.midi || a.pitch || 60);
        });

        const monoTracks: (typeof notesToSynthesize)[] = [];

        for (const note of sorted) {
          let placed = false;
          // Try to place the note in an existing track, prioritizing Track 0 (highest voice)
          for (let k = 0; k < monoTracks.length; k++) {
            const track = monoTracks[k];
            const lastNote = track[track.length - 1];
            // If the note starts after or exactly when the last note ends (with 5ms tolerance)
            if (note.startTime >= lastNote.startTime + lastNote.duration - 0.005) {
              track.push(note);
              placed = true;
              break;
            }
          }
          // If it overlaps with all existing tracks, create a new voice track
          if (!placed) {
            monoTracks.push([note]);
          }
        }

        // Remove any accidentally empty tracks (shouldn't happen, but safe)
        let filledTracks = monoTracks.filter(mt => mt.length > 0);
        // We MUST NOT collapse chords if we actually have multiple distinct voices coming from different SATB parts!
        // Actually, we should just disable collapseChords entirely when generating SATB, 
        // or check if we are in polyphonic mode. 
        // For SATB, we want to hear ALL voices.
        const collapseChords = localStorage.getItem('vocalido_collapse_chords') === 'true'; // Default to FALSE to hear all parts!
        if (collapseChords && filledTracks.length > 0) {
           filledTracks = [filledTracks[0]];
        }
        
        const isPrimary = tid === primaryVocalTrackId;
        
        filledTracks.forEach((mt, idx) => {
          let pan = 0;
          let label = '';
          if (isPrimary && idx === 0) {
            pan = 0;
            label = 'Melody (Center)';
          } else if (isPrimary && idx > 0) {
            pan = idx % 2 === 1 ? -0.3 : 0.3;
            label = `Melody Harmony ${idx}`;
          } else {
            // Chord/Bass tracks panning per user request
            if (filledTracks.length === 1) {
              pan = 1.0;
              label = 'Bass (R)';
            } else if (filledTracks.length === 2) {
              pan = idx === 0 ? -1.0 : 1.0;
              label = idx === 0 ? 'Chord Top (L)' : 'Bass (R)';
            } else if (filledTracks.length === 3) {
              if (idx === 0) { pan = -1.0; label = 'Chord Top (L)'; }
              else if (idx === 1) { pan = 0.5; label = 'Chord Mid (C+R)'; }
              else { pan = 1.0; label = 'Bass (R)'; }
            } else {
              const panValues = [-1.0, -0.5, 0.5, 1.0];
              const labels = ['Chord Top (L)', 'Chord Mid 1 (L+C)', 'Chord Mid 2 (C+R)', 'Bass (R)'];
              pan = panValues[Math.min(idx, 3)];
              label = labels[Math.min(idx, 3)];
            }
          }
          voiceLines.push({ notes: mt, pan, label, trackId: tid });
        });
      }
      
      const isPolyphonic = voiceLines.length > 1;
      console.log(`[VocalidoRenderService] 🎹 Note analysis: ${voiceLines.length} monophonic voice lines detected ${isPolyphonic ? '(POLYPHONIC)' : '(single voice)'}`);
      voiceLines.forEach((vl, i) => console.log(`[VocalidoRenderService]   Voice ${i + 1} [${vl.label} | Pan: ${vl.pan}]: ${vl.notes.length} notes`));
      // ─── End polyphony detection ───

      let result: any = null;

      let svsPortamento = 120;
      let svsVibratoStart = 100;
      let svsVibratoDepth = 0;
      let svsVibratoSpeed = 4.8;
      let timingFeel = svsTimingFeel || 50;

      try {
        const studioState = localStorage.getItem('vocalido_studio_state');
        if (studioState) {
          const parsed = JSON.parse(studioState);
          if (parsed.params) {
            if (parsed.params.portamento !== undefined) svsPortamento = parsed.params.portamento;
            if (parsed.params.vibrato_depth !== undefined) svsVibratoDepth = parsed.params.vibrato_depth;
            if (parsed.params.vibrato_rate !== undefined) svsVibratoSpeed = parsed.params.vibrato_rate;
            if (parsed.params.timing_feel !== undefined) timingFeel = parsed.params.timing_feel;
          }
        }
      } catch (e) {}

      let activeSvsEngine = svsEngine;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile && activeSvsEngine === 'browser-ai') {
        activeSvsEngine = 'vocalido';
      }

      const synthParams = { 
        singer: activeVoiceName, 
        bpm: actualBpm, 
        transpose: 0, // Notes are already transposed prior to this, avoid double transpose 
        voice: trackEngineId, 
        return_stems: true, 
        collapse_chords: collapseChords, 
        steps: svsSteps, 
        timing_feel: timingFeel,
        portamento: svsPortamento,
        vibrato_start: svsVibratoStart,
        vibrato_depth: svsVibratoDepth,
        vibrato_speed: svsVibratoSpeed
      };
      let usedRunPod = false;
      let useDirectBlobUrl = false;
      let mainAudioBlob: Blob | null = null;
      let stemBlobs: Blob[] = [];
      let polyStemUrls: string[] = [];

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

        if (isPolyphonic && voiceLines.length > 1) {
          console.log(`[VocalidoRenderService] [Browser-AI] 🎹 Polyphony detected: rendering ${voiceLines.length} voice lines on-device...`);
          const audioBlobs: Blob[] = [];
          const renderedPan: number[] = [];
          
          for (let vIdx = 0; vIdx < voiceLines.length; vIdx++) {
            const vl = voiceLines[vIdx];
            this.statusText = `Generating ${vl.label}... (${vl.notes.length} notes)`;
            this.notify();
            
            try {
              const wavBlob = await clientSvsEngine.synthesize(vl.notes, {
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
              audioBlobs.push(wavBlob);
              renderedPan.push(vl.pan);
              console.log(`[VocalidoRenderService] [Browser-AI] ✅ Voice ${vIdx + 1} (${vl.label}) blob ready: ${(wavBlob.size / 1024).toFixed(0)} KB`);
            } catch (voiceErr: any) {
              console.warn(`[VocalidoRenderService] [Browser-AI] ❌ Voice ${vIdx + 1} (${vl.label}) failed:`, voiceErr);
              if (voiceErr.message?.includes('timeout') && clientSvsEngine.forceWasm) {
                console.log(`[VocalidoRenderService] Retrying Voice ${vIdx + 1} with CPU/WASM Fallback...`);
                this.statusText = `Retrying ${vl.label} (CPU Fallback)...`;
                this.notify();
                try {
                  // Reload voice to spawn new worker with WASM forced
                  await clientSvsEngine.loadVoice(selectedVoice.id, selectedVoice.files, (p) => {
                    this.progress = Math.min(99.9, p.progress);
                    this.notify();
                  });
                  const retryBlob = await clientSvsEngine.synthesize(vl.notes, {
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
                  audioBlobs.push(retryBlob);
                  renderedPan.push(vl.pan);
                  console.log(`[VocalidoRenderService] [Browser-AI] ✅ Voice ${vIdx + 1} (${vl.label}) retry successful`);
                } catch (retryErr) {
                  console.warn(`[VocalidoRenderService] [Browser-AI] ❌ Retry failed for Voice ${vIdx + 1}:`, retryErr);
                }
              }
            }
          }

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
          
          const targetUrl = getFetchUrl('/studio/preview');
          const audioBlobs: Blob[] = [];
          const renderedPan: number[] = [];
          
          for (let vIdx = 0; vIdx < voiceLines.length; vIdx++) {
            const vl = voiceLines[vIdx];
            this.statusText = `Rendering ${vl.label}... (${vl.notes.length} notes)`;
            this.notify();
            
            // Append voice-line index to song_id so server cache is unique per voice line
            const vlSongId = `${song.id}_vl${vIdx}`;
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
              console.log(`[VocalidoRenderService] 📤 Sending voice ${vIdx + 1} (${vl.label}) → ${vlSongId}, ${vl.notes.length} notes`);
              const response = await svsFetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
              });
              
              console.log(`[VocalidoRenderService] 📥 Voice ${vIdx + 1} HTTP ${response.status}`);
              if (!response.ok) {
                const errText = await response.text();
                console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} (${vl.label}) HTTP error: ${errText}`);
                continue;
              }
              
              const data = await response.json();
              console.log(`[VocalidoRenderService] 📦 Voice ${vIdx + 1} response: engine=${data.engine}, saved_url=${data.saved_url}, audio_b64=${data.audio_b64 ? 'YES' : 'null'}, error=${data.error || 'none'}`);
              if (data.error) {
                console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} (${vl.label}) server error: ${data.error}`);
                continue;
              }
              
              // Decode audio to blob
              let audioBlob: Blob | null = null;
              if (data.audio_b64) {
                const binary = atob(data.audio_b64);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                audioBlob = new Blob([array], { type: data.mime_type || 'audio/mpeg' });
              } else if (data.audio_url || data.saved_url) {
                const audioUrl = fixAudioUrl(data.saved_url || data.audio_url);
                console.log(`[VocalidoRenderService] 🔗 Voice ${vIdx + 1} fetching audio: ${audioUrl}`);
                const audioResp = await fetch(audioUrl, { signal: controller.signal });
                console.log(`[VocalidoRenderService] 🔗 Voice ${vIdx + 1} audio HTTP ${audioResp.status}, type=${audioResp.headers.get('content-type')}`);
                if (audioResp.ok) {
                  audioBlob = await audioResp.blob();
                } else {
                  console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} audio fetch failed: HTTP ${audioResp.status}`);
                }
              } else {
                console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} no audio_b64 and no saved_url/audio_url in response`);
              }
              
              if (audioBlob) {
                audioBlobs.push(audioBlob);
                renderedPan.push(vl.pan);
                console.log(`[VocalidoRenderService] ✅ Voice ${vIdx + 1} (${vl.label}) blob ready: ${(audioBlob.size / 1024).toFixed(0)} KB, type=${audioBlob.type}`);
              } else {
                console.warn(`[VocalidoRenderService] ⚠️ Voice ${vIdx + 1} (${vl.label}) audioBlob is null — skipping`);
              }
            } catch (voiceErr: any) {
              if (voiceErr.name === 'AbortError') throw voiceErr;
              console.warn(`[VocalidoRenderService] ❌ Voice ${vIdx + 1} (${vl.label}) exception:`, voiceErr);
            }
          }
          
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
          // RunPod Fallback — use absolute URL to bypass any proxy issues
          const runpodEnvUrl = import.meta.env.VITE_RUNPOD_API_URL;
          const runpodKey = import.meta.env.VITE_RUNPOD_API_KEY;
          
          // Convert relative proxy URL to absolute RunPod API URL
          let runpodUrl = runpodEnvUrl;
          if (runpodUrl && runpodUrl.startsWith('/api/runpod/')) {
            runpodUrl = 'https://api.runpod.ai/v2/' + runpodUrl.replace('/api/runpod/', '');
          }
          
          if (runpodUrl && runpodKey) {
            console.warn('[VocalidoRenderService] ⚠️ Server synthesis failed. Falling back to RunPod API...', fetchErr);
            console.log('[VocalidoRenderService] RunPod URL:', runpodUrl);
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
              // Build absolute status URL from the base RunPod API URL
              const endpointBase = runpodUrl.replace(/\/(run|runsync)$/, '');
              const statusUrl = `${endpointBase}/status/${jobId}`;
              console.log('[VocalidoRenderService] Polling status at:', statusUrl);
              let attempts = 0;
              const maxAttempts = 120;
              
              while ((status === 'IN_QUEUE' || status === 'IN_PROGRESS') && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
                
                // If it's still in queue after 10 seconds, it's likely waking up a cold GPU
                if (attempts > 5 && status === 'IN_QUEUE') {
                  this.statusText = `Waking up RunPod GPU... (${attempts * 2}s)`;
                } else if (status === 'IN_PROGRESS') {
                  this.statusText = `RunPod GPU processing... (${attempts * 2}s)`;
                } else {
                  this.statusText = `RunPod GPU in queue... (${attempts * 2}s)`;
                }
                
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
        // We must assign this audio to ALL vocalTrackIds so that soloing any of them plays the merged vocal.
        // If we don't, only the primary track gets audio and the others are silently muted in 'vocal' mode.
        if (voiceLines.length === 1 && vocalTrackIds.length > 0) {
          for (const tid of vocalTrackIds) {
            stemsByTrack[tid] = stemsWithBust.length > 0 ? stemsWithBust : [cacheBustedUrl];
          }
        } else {
          // Normal polyphony: map each stem to its corresponding voice line trackId
          let sIdx = 0;
          for (const vl of voiceLines) {
            if (!stemsByTrack[vl.trackId]) stemsByTrack[vl.trackId] = [];
            if (sIdx < stemsWithBust.length) {
              stemsByTrack[vl.trackId].push(stemsWithBust[sIdx]);
            }
            sIdx++;
          }
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
        const newEntryKey = `${bpmPct}_${songKey}_${storedEngineId}_${activeLyricMode}_${storedVoiceName}_tf${svsTimingFeel}_v2`;
        
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
          return !(
            h.bpmPercent === bpmPct && 
            h.songKey === songKey && 
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
            for (const tid of vocalTrackIds) {
              const trackStems = stemsByTrack[tid] || [];
              let trackAudioUrl = "";
              let stemsToPass: string[] = [];
              
              if (trackStems.length > 0) {
                trackAudioUrl = trackStems[0];
                stemsToPass = trackStems.length > 1 ? trackStems : [];
              } else if (tid === primaryTrackId) {
                trackAudioUrl = cacheBustedUrl;
                stemsToPass = stemsByTrack[tid] || [];
              }
              
              if (trackAudioUrl) {
                console.log(`[VocalidoRenderService] 🎤 Adding vocal layer for track ${tid}:`, trackAudioUrl.substring(0, 80));
                await musicEngine.addVocalLayer(tid, trackAudioUrl, stemsToPass, actualBpm);
                console.log(`[VocalidoRenderService] ✅ Vocal layer added for ${tid}`);
              }
            }
            
            for (const tid of vocalTrackIds) {
              const trackStems = stemsByTrack[tid] || [];
              const tAudioUrl = trackStems.length > 0 ? trackStems[0] : (tid === primaryTrackId ? cacheBustedUrl : "");
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
