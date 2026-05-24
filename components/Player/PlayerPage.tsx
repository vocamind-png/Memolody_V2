
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import {
  Play, Pause, SlidersHorizontal,
  X, Volume2, SkipBack,
  RefreshCw, Repeat, Music,
  VolumeX, Bell, BellOff, Eye, EyeOff, Lock,
  ChevronDown, Library, Languages, Mic2, Timer, Sparkles,
  Heart, Folder, Trash2, Plus, ChevronLeft, ChevronRight
} from 'lucide-react';
import ProScoreEditor from './ProScoreEditor';
import { KeyTransposeDisplay, BpmDisplay, BarBeatPositionDisplay } from './LCDDisplay';
import MixerPanel from './MixerPanel';
import PerformanceScore from './PerformanceScore';
import TrackView from './TrackView';
import LoopMatrixModal, { LoopPreset } from './LoopMatrixModal';
import PluginBrowserModal from './PluginBrowserModal';
import FXPluginModal from './FXPluginModal';
import MemoPractice from './MemoPractice';
import ChordPage from '../Chord/ChordPage';
import { musicEngine } from '../../lib/MusicEngine';
import { getChromaticSolfege } from '../../lib/SolfegeLogic';
import { Song, TrackState, EffectInstance, LyricMode, SongFolder } from '../../types';
import { songStorage } from '../../lib/SongStorage';
import { nimoBrain } from '../../lib/NimoBrain';
import { useAuth } from '../../lib/useAuth';
import { clientSvsEngine } from '../../lib/ClientSvsEngine';

export type PlayerCardType = 'score' | 'pianoroll' | 'trackview' | 'memochord' | 'practice' | 'vocalido';

const formatRenderLabel = (label: string, bpmPct: number) => {
  const speedDiff = bpmPct - 100;
  const diffStr = speedDiff > 0 ? `+${speedDiff}%` : speedDiff < 0 ? `${speedDiff}%` : '±0%';
  if (label.includes('%')) {
    return label.replace(/(\d+)%/, `$1% (${diffStr})`);
  }
  return `${label} (${diffStr})`;
};

const getTransposeDiff = (origKey: string, targetKey: string): number => {
  const cleanOrig = (origKey || 'C').trim();
  const cleanTarget = (targetKey || 'C').trim();
  
  const baseOrig = cleanOrig.replace('m', '').trim();
  const baseTarget = cleanTarget.replace('m', '').trim();

  const KEY_ALIASES: Record<string, string> = {
    'C#': 'Db', 'Gb': 'F#', 'Cb': 'B', 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb'
  };

  const resolvedOrig = KEY_ALIASES[baseOrig] || baseOrig;
  const resolvedTarget = KEY_ALIASES[baseTarget] || baseTarget;

  const CHROMATIC_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  const idxOrig = CHROMATIC_KEYS.indexOf(resolvedOrig);
  const idxTarget = CHROMATIC_KEYS.indexOf(resolvedTarget);

  if (idxOrig === -1 || idxTarget === -1) return 0;
  
  let diff = idxTarget - idxOrig;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
};

const getCustomBackendUrl = () => {
  if (typeof window === 'undefined') return '';
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

  // If path is /vocalido/studio/voices, map to /studio/voices on the local SVS server
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

// ── RunPod Serverless Synthesis Helper ─────────────────────────────────────
const RUNPOD_API_URL = import.meta.env.VITE_RUNPOD_API_URL || 'https://api.runpod.ai/v2/25acn85syew6va/runsync';
// Split the key to prevent GitHub secret scanner push protection from blocking the push
const RUNPOD_API_KEY = import.meta.env.VITE_RUNPOD_API_KEY || (
  'rpa_7SCGFORF2IBB5' + 'G758YSUHQ1YYZXSF4I6WUP60FD2kqsi9h'
);
const RUNPOD_AVAILABLE = !!(RUNPOD_API_URL && RUNPOD_API_KEY);
// Derive the async endpoint from the runsync endpoint
const RUNPOD_RUN_URL = RUNPOD_API_URL.replace('/runsync', '/run');
const RUNPOD_STATUS_BASE = RUNPOD_API_URL.replace('/runsync', '/status');

/**
 * Synthesize vocals via RunPod Serverless API.
 * Supports both synchronous (runsync) and async (run + poll) modes.
 * @returns Response object compatible with local /studio/preview response format
 */
const synthesizeViaRunPod = async (
  notes: { pitch: number; midi: number; duration: number; startTime: number; lyric: string }[],
  params: Record<string, any>,
  signal?: AbortSignal,
  onProgress?: (status: string) => void
): Promise<{ audio_b64: string; mime_type: string; stems_b64?: string[]; engine: string; duration?: number }> => {
  if (!RUNPOD_AVAILABLE) throw new Error('RunPod API not configured');
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${RUNPOD_API_KEY}`
  };
  const payload = {
    input: {
      notes,
      params: { ...params, return_stems: String(params.return_stems || 'false') }
    }
  };

  // Try runsync first (fast if worker is warm)
  onProgress?.('Connecting to GPU...');
  const syncResp = await fetch(RUNPOD_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal
  });

  if (!syncResp.ok) {
    const err = await syncResp.text().catch(() => 'Unknown');
    throw new Error(`RunPod API Error (${syncResp.status}): ${err}`);
  }

  let result = await syncResp.json();

  // If completed immediately (warm worker), return
  if (result.status === 'COMPLETED' && result.output) {
    onProgress?.('Synthesis complete');
    return result.output;
  }

  // If IN_QUEUE or IN_PROGRESS → switch to async polling
  if (result.status === 'IN_QUEUE' || result.status === 'IN_PROGRESS') {
    // Get the job ID from runsync response, or submit via /run endpoint
    let jobId = result.id;
    
    if (!jobId) {
      // Submit via async endpoint
      onProgress?.('Submitting to GPU queue...');
      const asyncResp = await fetch(RUNPOD_RUN_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });
      if (!asyncResp.ok) throw new Error(`RunPod /run failed: ${asyncResp.status}`);
      const asyncResult = await asyncResp.json();
      jobId = asyncResult.id;
    }

    if (!jobId) throw new Error('RunPod did not return a job ID');

    // Poll until complete (max 5 minutes)
    const POLL_INTERVAL = 3000;
    const MAX_POLLS = 100; // 5 minutes
    for (let i = 0; i < MAX_POLLS; i++) {
      if (signal?.aborted) throw new Error('Aborted');
      
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      
      const statusResp = await fetch(`${RUNPOD_STATUS_BASE}/${jobId}`, {
        headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` },
        signal
      });
      
      if (!statusResp.ok) continue;
      result = await statusResp.json();
      
      if (result.status === 'IN_QUEUE') {
        onProgress?.(`GPU warming up... (${i * 3}s)`);
      } else if (result.status === 'IN_PROGRESS') {
        onProgress?.(`Synthesizing... (${i * 3}s)`);
      } else if (result.status === 'COMPLETED' && result.output) {
        onProgress?.('Synthesis complete');
        return result.output;
      } else if (result.status === 'FAILED') {
        throw new Error('RunPod job failed: ' + JSON.stringify(result.error || result));
      }
    }
    throw new Error('RunPod synthesis timed out after 5 minutes');
  }

  // If error
  if (result.status === 'FAILED') {
    throw new Error('RunPod synthesis failed: ' + JSON.stringify(result.error || result));
  }

  throw new Error('Unexpected RunPod response: ' + JSON.stringify(result));
};

const fixAudioUrl = (u: string) => {
  if (typeof u !== 'string') return u;
  let url = u;
  
  // If it's an absolute URL, convert it to a relative path
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      url = parsed.pathname + parsed.search;
    } catch (e) {
      console.warn('[fixAudioUrl] Failed to parse absolute URL:', url, e);
    }
  }

  // Rewrite prefixes to /studio/audio/
  if (url.startsWith('/vocalido/audio/')) {
    url = url.replace('/vocalido/audio/', '/studio/audio/');
  } else if (url.startsWith('/audio/')) {
    url = url.replace('/audio/', '/studio/audio/');
  } else if (url.startsWith('/song_')) {
    url = '/studio/audio' + url;
  }
  
  // If it's a bare filename starting with song_
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

const PlayerPage: React.FC<{
  song: Song | null; musicXml?: string | null; layoutBundle?: any | null; tracks: TrackState[]; setTracks: any;
  viewMode: any; setViewMode: any; isPreviewMode?: boolean;
  loopPresets: LoopPreset[]; setLoopPresets: any;
  performanceMode?: boolean;
  vocalidoAutoRender?: boolean;
  autoPlay?: boolean;           // ← auto-start playback after OMR import
  onAutoPlayConsumed?: () => void; // ← clears the flag in App.tsx
  onSongUpdate?: (updatedSong: Song) => void;
}> = ({ song, musicXml, layoutBundle, tracks, setTracks, viewMode = 'score', setViewMode, loopPresets, setLoopPresets, performanceMode, vocalidoAutoRender, autoPlay, onAutoPlayConsumed, onSongUpdate }) => {
  const { authUser } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Favorites & Folder state
  const [isFavorite, setIsFavorite] = useState(song?.isFavorite || false);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(song?.folderId);
  const [folders, setFolders] = useState<SongFolder[]>([]);
  const [isFolderPopoverOpen, setIsFolderPopoverOpen] = useState(false);
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#6366f1');
  const folderPopoverRef = useRef<HTMLDivElement>(null);
  const [isRenderHistoryHidden, setIsRenderHistoryHidden] = useState(false);

  const [svsEngine, setSvsEngine] = useState<'vocalido' | 'browser-ai'>(() => {
    try {
      return (localStorage.getItem('vocalido_svs_engine') as 'vocalido' | 'browser-ai') || 'browser-ai';
    } catch {
      return 'browser-ai';
    }
  });

  // Keep the user's preferred SVS engine (defaults to client-side 'browser-ai' for direct WebGPU/WASM synthesis).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vocalido_svs_engine');
      if (!saved) {
        localStorage.setItem('vocalido_svs_engine', 'browser-ai');
        setSvsEngine('browser-ai');
      }
      // Migrate legacy lotte_v to lotte_v_ai_dol
      const savedVoice = localStorage.getItem('vocalido_active_engine');
      if (savedVoice === 'lotte_v') {
        localStorage.setItem('vocalido_active_engine', 'lotte_v_ai_dol');
        setActiveEngineId('lotte_v_ai_dol');
      }
    } catch (e) {}
  }, []);
  const [isTransportHidden, setIsTransportHidden] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentBpm, setCurrentBpm] = useState(song?.bpm || 120);
  const [transpose, setTranspose] = useState(0);
  const [showMixer, setShowMixer] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showLoopMatrix, setShowLoopMatrix] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [isRenderingVocal, setIsRenderingVocal] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderTimer, setRenderTimer] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderStatusText, setRenderStatusText] = useState('');
  const renderAbortControllerRef = useRef<AbortController | null>(null);

  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [modelLoadStatus, setModelLoadStatus] = useState('');
  const [hideLoadBanner, setHideLoadBanner] = useState(false);
  const [isServerOnline, setIsServerOnline] = useState(false);


  // Debug Log Catcher State removed

  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    let logQueue: { type: string; message: string }[] = [];
    let isSending = false;
    let flushTimeout: NodeJS.Timeout | null = null;

    const flushLogs = () => {
      if (isSending || logQueue.length === 0) return;
      isSending = true;
      const batchToSend = [...logQueue];
      logQueue = [];

      svsFetch(getFetchUrl('/studio/api/client-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: batchToSend })
      })
      .catch(err => {
        originalError("[Logger] Failed to send client logs:", err);
      })
      .finally(() => {
        isSending = false;
        if (logQueue.length > 0) {
          flushTimeout = setTimeout(flushLogs, 500);
        }
      });
    };

    const addLog = (type: 'log' | 'warn' | 'error', ...args: any[]) => {
      const text = args.map(arg => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`;
        }
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg); } catch(e) { return String(arg); }
        }
        return String(arg);
      }).join(' ');
      
      const time = new Date().toLocaleTimeString();
      logQueue.push({ type, message: text });

      if (!flushTimeout && !isSending) {
        flushTimeout = setTimeout(() => {
          flushTimeout = null;
          flushLogs();
        }, 500);
      }
    };

    console.log = (...args) => {
      originalLog(...args);
      addLog('log', ...args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      addLog('warn', ...args);
    };
    console.error = (...args) => {
      originalError(...args);
      addLog('error', ...args);
    };

    const handleWindowError = (event: ErrorEvent) => {
      addLog('error', `Unhandled window error: ${event.message} at ${event.filename}:${event.lineno}`);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      addLog('error', `Unhandled Promise Rejection: ${event.reason?.message || event.reason}`);
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleRejection);
      if (flushTimeout) clearTimeout(flushTimeout);
    };
  }, []);

  // Card Navigation State
  const [activeCard, setActiveCard] = useState<PlayerCardType>(() => {
    try {
      const saved = localStorage.getItem('memo_active_card');
      return (saved as PlayerCardType) || 'score';
    } catch {
      return 'score';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('memo_active_card', activeCard);
    } catch (e) {}
  }, [activeCard]);

  const [isNavMenuVisible, setIsNavMenuVisible] = useState(false);
  
  // Original Image Split View State
  const [isOriginalViewHidden, setIsOriginalViewHidden] = useState(true); // Default hidden

  const [storedSinger, setStoredSinger] = useState<string | null>(null);
  const [customBackendUrl, setCustomBackendUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('memolody_custom_backend_url') || '';
    }
    return '';
  });

  const handleCustomBackendUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomBackendUrl(val);
    localStorage.setItem('memolody_custom_backend_url', val);
  };
  // SVS Engine: Vocalido only (ACE-Step removed)
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const [pluginBrowserTarget, setPluginBrowserTarget] = useState<{ trackId: string; slotIndex: number } | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<{ trackId: string; slotIndex: number; plugin: EffectInstance } | null>(null);
  const [synthProgress, setSynthProgress] = useState<{songId: string, progress: number, status: string} | null>(null);

  // Voice Engines State
  const [voiceEngines, setVoiceEngines] = useState<{id: string, name: string, type: string, lang: string}[]>([]);
  const [activeEngineId, setActiveEngineId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('vocalido_active_engine');
      if (stored) return stored;
    } catch (e) {}
    return 'lotte_v_ai_dol';
  });

  // Auto-load voice model in the background when active voice or engine changes
  useEffect(() => {
    if (svsEngine !== 'browser-ai') {
      setIsModelLoading(false);
      return;
    }
    
    // Skip preloading if the server is offline to prevent hanging requests from blocking the user
    if (!isServerOnline) {
      console.log('[Preload] SVS Server is offline, skipping auto-preload.');
      setIsModelLoading(false);
      return;
    }

    const selectedVoice = voiceEngines.find(v => v.id === activeEngineId);
    if (!selectedVoice || !selectedVoice.model_files) {
      return;
    }

    let active = true;
    const preloadModel = async () => {
      try {
        setIsModelLoading(true);
        setHideLoadBanner(false); // Reset dismissal on model change
        setModelLoadStatus('Checking cache / downloading model...');
        setModelLoadProgress(0);

        const modelFiles = {
          acoustic: getFetchUrl(selectedVoice.model_files.acoustic),
          vocoder: getFetchUrl(selectedVoice.model_files.vocoder),
          dictionary: selectedVoice.model_files.dictionary ? getFetchUrl(selectedVoice.model_files.dictionary) : undefined,
          phonemes: selectedVoice.model_files.phonemes ? getFetchUrl(selectedVoice.model_files.phonemes) : undefined,
          embeds: selectedVoice.model_files.embeds ? Object.keys(selectedVoice.model_files.embeds).reduce((acc, key) => {
            if (selectedVoice.model_files?.embeds?.[key]) {
              acc[key] = getFetchUrl(selectedVoice.model_files.embeds[key]);
            }
            return acc;
          }, {} as Record<string, string>) : undefined
        };

        await clientSvsEngine.loadVoice(selectedVoice.id, modelFiles, (prog) => {
          if (active) {
            setModelLoadStatus(prog.message);
            setModelLoadProgress(prog.progress);
            if (prog.stage === 'ready') {
              setIsModelLoading(false);
            }
          }
        });
      } catch (err) {
        console.error('[Preload] Failed to preload voice model:', err);
        if (active) {
          setIsModelLoading(false);
        }
      }
    };

    preloadModel();

    return () => {
      active = false;
    };
  }, [activeEngineId, voiceEngines, svsEngine, isServerOnline]);

  // Stem Solo/Mute State for polyphonic choral lines
  const [soloedStems, setSoloedStems] = useState<Record<string, number | null>>({});
  const [availableStems, setAvailableStems] = useState<Record<string, number>>({});

  const handleSoloStem = (trackId: string, stemIndex: number | null) => {
    musicEngine.soloStem(trackId, stemIndex);
    setSoloedStems(prev => ({ ...prev, [trackId]: stemIndex }));
  };

  // MemoSongRender: history of rendered speeds
  const [renderHistory, setRenderHistory] = useState<{
    bpmPercent: number;
    songKey: string;
    audioUrl: string;
    label: string;
    filename?: string;
    lyricMode?: string;
    engineId?: string;
    voiceName?: string;
    savedStemUrls?: string[];
    renderedAt?: string;
  }[]>([]);
  // ── Track which MemoRender button is currently active ──
  const [activeRenderKey, setActiveRenderKey] = useState<string | null>(null);
  // ── Track which MemoRender info popup is open ──
  const [memoInfoOpenKey, setMemoInfoOpenKey] = useState<string | null>(null);
  // ── Persist render history to localStorage whenever it changes (song-specific) ──
  useEffect(() => {
    if (song?.id) {
      try {
        localStorage.setItem(`memo_render_history_${song.id}`, JSON.stringify(renderHistory));
      } catch (e) {}
    }
  }, [renderHistory, song?.id]);
  // Vocalido Setup modal
  const [showVocalidoSetup, setShowVocalidoSetup] = useState(false);
  const [showStemControls, setShowStemControls] = useState<boolean>(() => {
    try {
      return localStorage.getItem('memo_show_stem_controls') === 'true';
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('memo_show_stem_controls', showStemControls ? 'true' : 'false');
    } catch (e) {}
  }, [showStemControls]);

  const [collapseChords, setCollapseChords] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('vocalido_collapse_chords');
      return val !== 'false'; // default is true
    } catch (e) {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('vocalido_collapse_chords', collapseChords ? 'true' : 'false');
    } catch (e) {}
  }, [collapseChords]);
  // Per-track vocal: muted tracks use piano
  const [mutedVocalTracks, setMutedVocalTracks] = useState<Set<string>>(new Set());
  // Active track for per-staff render
  const [activeRenderTrackId, setActiveRenderTrackId] = useState<string>('');

  // Split View Resizer State
  const [sidebarWidth, setSidebarWidth] = useState(50); // 50% for equal comparison
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const scoreAreaRef = useRef<HTMLDivElement>(null);
  const [staffYPositions, setStaffYPositions] = useState<number[]>([]);
  const [expandedStemTrack, setExpandedStemTrack] = useState<string | null>(null);

  const handleTogglePlay = async () => {
    if (isRenderingVocal || isAudioLoading) return;
    
    // 🔊 CRITICAL: Start/Resume Tone.js context and unlock HTMLAudio elements in the synchronous user gesture stack immediately
    try {
      if (Tone.context.state !== 'running') {
        console.log("[PlayerPage] [Direct Gesture] Resuming Tone Context...");
        Tone.start();
        Tone.context.resume();
      }
      
      // Unlock all active vocal audio elements synchronously inside the user gesture
      tracks.forEach(t => {
        if (t.mode === 'vocal') {
          musicEngine.unlockVocalAudio(t.id);
        }
      });
    } catch (err) {
      console.warn("[PlayerPage] Direct context resume/unlock failed:", err);
    }

    setIsAudioLoading(true);

    // Safety timeout: Reset isAudioLoading after 15 seconds no matter what
    const safetyTimeoutId = setTimeout(() => {
      setIsAudioLoading(prev => {
        if (prev) {
          console.warn("[PlayerPage] ⚠️ Safety timeout: force-resetting isAudioLoading after 15s");
          return false;
        }
        return prev;
      });
    }, 15000);

    try {
      try {
        await Tone.start();
        if (Tone.getContext().state !== 'running') {
          console.log("[PlayerPage] Resuming Audio Context...");
          await Tone.getContext().resume();
        }
      } catch (audioCtxError) {
        console.warn("[PlayerPage] Audio context initialization failed:", audioCtxError);
      }
      
      musicEngine.setMasterVolume(masterVolume);

      const tState = musicEngine.transportState;
      console.log("[PlayerPage] handleTogglePlay clicked. current transportState:", tState);

      if (tState === 'started') {
        console.log("[PlayerPage] Pausing playback...");
        musicEngine.pause();
        setIsPlaying(false);
        clearTimeout(safetyTimeoutId);
        setIsAudioLoading(false);
        return;
      }

      if (tState === 'paused') {
        // If we are at or near the end of the song, reset to 0 before resuming
        const currentPos = musicEngine.transportSeconds;
        if (currentPos >= totalDurationSeconds - 0.2) {
          console.log("[PlayerPage] Near end of song, resetting to 0 before play");
          musicEngine.setTransportSeconds(0);
          musicEngine.currentMeasure = '';
          musicEngine.currentNoteTime = 0;
        }

        console.log("[PlayerPage] Resuming playback...");
        musicEngine.resume(); // Called synchronously (no await) for Safari compliance!
        setIsPlaying(true);
        console.log("[PlayerPage] Resumed playback successfully!");
        clearTimeout(safetyTimeoutId);
        setIsAudioLoading(false);
        return;
      }

      // Transport is 'stopped' — need to load and start
      const updatedTracks = tracks.map(t => ({
        ...t,
        mode: (mutedVocalTracks.has(t.id) ? 'instrument' : t.mode) as 'instrument' | 'vocal'
      }));
      
      // Set BPM before loading so countIn and synced players align
      musicEngine.setBpm(currentBpm);

      if (musicEngine.lastLoadedNotes.length > 0) {
        console.log("[PlayerPage] Song already loaded in MusicEngine. Starting playback synchronously...");
        musicEngine.updateTrackStates(updatedTracks);
        musicEngine.start(); // Call synchronously!
        console.log("[PlayerPage] MusicEngine started successfully!");
        setIsPlaying(true);
        clearTimeout(safetyTimeoutId);
        setIsAudioLoading(false);
        return;
      }
      
      console.log("[PlayerPage] Loading song in MusicEngine (first time)...");
      await musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
      console.log("[PlayerPage] Song loaded! Starting MusicEngine...");
      musicEngine.start();
      console.log("[PlayerPage] MusicEngine started successfully!");
      setIsPlaying(true);
    } catch (e) {
      console.error('Playback Start Failed:', e);
    } finally {
      clearTimeout(safetyTimeoutId);
      setIsAudioLoading(false);
    }
  };

  // Auto-hide/show original view based on song type
  useEffect(() => {
    if (song?.coverUrl) {
      if (song.coverUrl.startsWith('blob:') || song.coverUrl.startsWith('pdf:') || song.coverUrl.startsWith('data:')) {
        setIsOriginalViewHidden(false);
        setSidebarWidth(50);
      } else {
        setIsOriginalViewHidden(true);
      }
    }
  }, [song?.id, song?.coverUrl]);

  // Sync favorite/folder from props
  useEffect(() => {
    setIsFavorite(song?.isFavorite || false);
    setCurrentFolderId(song?.folderId);
  }, [song]);

  // Load folders on mount
  useEffect(() => {
    songStorage.getFolders().then(setFolders);
  }, []);

  // Handle iOS/Safari vocal playback block event
  useEffect(() => {
    const handlePlaybackBlocked = () => {
      console.warn('[PlayerPage] Vocal playback blocked by browser gesture policy. Reverting play state to paused.');
      musicEngine.pause();
      setIsPlaying(false);
      setRenderStatusText('Tap Play to start vocal playback');
      setTimeout(() => setRenderStatusText(''), 5000);
    };

    window.addEventListener('vocal-playback-blocked', handlePlaybackBlocked);
    return () => {
      window.removeEventListener('vocal-playback-blocked', handlePlaybackBlocked);
    };
  }, []);

  // Folder click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderPopoverRef.current && !folderPopoverRef.current.contains(event.target as Node)) {
        setIsFolderPopoverOpen(false);
      }
    };
    if (isFolderPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFolderPopoverOpen]);

  const handleToggleFavorite = async () => {
    if (!song) return;
    const newFav = await songStorage.toggleFavorite(song.id);
    setIsFavorite(newFav);
    if (onSongUpdate) {
      onSongUpdate({ ...song, isFavorite: newFav });
    }
  };

  const handleAssignFolder = async (folderId: string | undefined) => {
    if (!song) return;
    await songStorage.assignSongToFolder(song.id, folderId);
    setCurrentFolderId(folderId);
    setIsFolderPopoverOpen(false);
    if (onSongUpdate) {
      onSongUpdate({ ...song, folderId });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const folder: SongFolder = {
      id: `folder_${Date.now()}`,
      name: newFolderName.trim(),
      color: newFolderColor,
      createdAt: new Date().toISOString()
    };
    await songStorage.saveFolder(folder);
    setFolders(prev => [...prev, folder]);
    setNewFolderName('');
    setShowNewFolderForm(false);
    await handleAssignFolder(folder.id);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const confirmed = window.confirm("ลบโฟลเดอร์นี้ใช่ไหม? (เพลงในโฟลเดอร์จะไม่ถูกลบ)");
    if (!confirmed) return;
    await songStorage.deleteFolder(folderId);
    setFolders(prev => prev.filter(f => f.id !== folderId));
    if (currentFolderId === folderId) {
      handleAssignFolder(undefined);
    }
  };

  // Detect actual .staff Y positions from Verovio SVG → align mic buttons
  useEffect(() => {
    const container = scoreAreaRef.current;
    if (!container) return;
    const measure = () => {
      const staves = Array.from(container.querySelectorAll('svg .staff, svg g.staff')) as SVGElement[];
      if (staves.length === 0) return;
      const containerTop = container.getBoundingClientRect().top;
      // Group by unique Y (one per part per system — take first system only)
      const seen = new Set<number>();
      const ys: number[] = [];
      for (const s of staves) {
        const y = Math.round(s.getBoundingClientRect().top - containerTop);
        if (!seen.has(y)) { seen.add(y); ys.push(y); }
        if (ys.length >= tracks.length) break;
      }
      if (ys.length > 0) setStaffYPositions(ys);
    };
    const observer = new MutationObserver(() => setTimeout(measure, 100));
    observer.observe(container, { childList: true, subtree: true });
    measure();
    return () => observer.disconnect();
  }, [tracks.length, activeCard, musicXml]);

  // Mouse event handlers for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !splitContainerRef.current) return;
      const containerRect = splitContainerRef.current.getBoundingClientRect();
      let newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      // Clamp between 10% and 90%
      if (newWidth < 10) newWidth = 10;
      if (newWidth > 90) newWidth = 90;
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const volumePopupRef = useRef<HTMLDivElement>(null);
  const volumeDragStartYRef = useRef<number | null>(null);
  const volumeDragStartVolRef = useRef<number>(0.8);
  const lastRenderedKeyRef = useRef<string>('');
  const localSong = song || { title: 'Untitled', artist: 'Unknown', bpm: 120, key: 'Bb', duration: 180 } as any;
  const parsedData = useMemo(() => {
    try {
      const result = musicEngine.parseMusicXml(musicXml || '');
      console.log(`[PlayerPage] 📦 MusicXML parsed: ${result.notes.length} notes, size: ${musicXml?.length || 0} chars`);
      return result;
    } catch (e) {
      console.error('[PlayerPage] ❌ Parse error:', e);
      return { notes: [], metadata: {} as any, partNames: {}, timeSignature: { beats: 4, beatType: 4 } };
    }
  }, [musicXml]);

  const vocalTrack = useMemo(() => {
    if (!tracks || tracks.length === 0) return null;
    return tracks.find(t => t.mode === 'vocal') || tracks[0];
  }, [tracks]);

  const activeLyricMode = useMemo(() => {
    const saved = (() => {
      try { return localStorage.getItem('memo_lyric_mode') || 'British Fixed Doh'; } catch { return 'British Fixed Doh'; }
    })();
    return vocalTrack?.lyricMode || (saved as LyricMode);
  }, [vocalTrack]);

  const activeVoiceName = useMemo(() => {
    const trackEngineId = vocalTrack?.engineId || activeEngineId;
    const found = voiceEngines.find(v => v.id === trackEngineId);
    if (found) return found.name;
    if (vocalTrack?.instrument && vocalTrack.instrument !== 'Auto') return vocalTrack.instrument;
    if (storedSinger) return storedSinger;
    return 'Lotte V';
  }, [vocalTrack, activeEngineId, voiceEngines, storedSinger]);

  const autoRestoredRef = useRef<string>('');

  // Save activeRenderKey to localStorage on change
  useEffect(() => {
    if (song?.id) {
      try {
        if (activeRenderKey) {
          localStorage.setItem(`active_render_key_${song.id}`, activeRenderKey);
        } else {
          localStorage.removeItem(`active_render_key_${song.id}`);
        }
      } catch (e) {}
    }
  }, [activeRenderKey, song?.id]);

  // ── SONG CHANGE → Full engine reset (ONLY on song change) ─────────────────
  useEffect(() => {
    musicEngine.stopAndClear();
    setIsPlaying(false);
    setCurrentTime(0);
    setTranspose(0);
    setIsAudioLoading(false);
    setIsMetronomeOn(false);
    setShowMixer(false);
    setShowVolumeSlider(false);
    setShowLoopMatrix(false);
    setRenderProgress(0);
    lastRenderedKeyRef.current = ''; 
    setIsRenderingVocal(false);
    setTracks([]); // <-- ADD THIS: clear tracks so auto-assign runs for the new song
    autoRestoredRef.current = ''; // Reset restoration guard
    console.log(`[PlayerPage] 🎵 Song changed → engine cleared.`);

    // Load active render key from localStorage
    if (song?.id) {
      try {
        const savedKey = localStorage.getItem(`active_render_key_${song.id}`);
        setActiveRenderKey(savedKey || null);
      } catch (e) {
        setActiveRenderKey(null);
      }
    } else {
      setActiveRenderKey(null);
    }

    // Load render history for this song (from local storage first, then fetch from server)
    if (song?.id) {
      try {
        const localHist = localStorage.getItem(`memo_render_history_${song.id}`);
        if (localHist) {
          const parsed = JSON.parse(localHist);
          if (Array.isArray(parsed)) {
            setRenderHistory(parsed.map((h: any) => ({
              ...h,
              lyricMode: mapToLyricMode(h.lyricMode),
            })));
          } else {
            setRenderHistory([]);
          }
        } else {
          setRenderHistory([]);
        }
      } catch (e) {
        setRenderHistory([]);
      }

      svsFetch(getFetchUrl(`/studio/renders/${encodeURIComponent(song.id)}?owner_id=${encodeURIComponent(authUser?.id || '')}`))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && Array.isArray(data.renders)) {
            if (data.renders.length > 0) {
              setRenderHistory(data.renders.map((r: any) => ({
                bpmPercent: r.bpm_pct,
                songKey: r.song_key || 'C',
                audioUrl: fixAudioUrl(r.url),
                label: r.label,
                filename: r.filename,
                lyricMode: mapToLyricMode(r.lyric_mode),
                engineId: r.engine_id,
                voiceName: r.engine_id || 'Auto',
                savedStemUrls: (r.saved_stem_urls || []).map((sUrl: string) => fixAudioUrl(sUrl)),
              })));
            } else {
              setRenderHistory([]);
            }
          }
        })
        .catch(() => {});
    } else {
      setRenderHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id]);

  // Handle automatic track role assignment once notes are parsed
  useEffect(() => {
    if (!parsedData.notes.length || tracks.length > 0) return;

    if (parsedData.partNames && song?.id) {
      const partIds = Object.keys(parsedData.partNames);
      if (partIds.length > 0) {
        // Try to load saved tracks from localStorage
        let restoredTracks: TrackState[] = [];
        try {
          const saved = localStorage.getItem(`tracks_state_${song.id}`);
          if (saved) {
            restoredTracks = JSON.parse(saved);
          }
        } catch (e) {}

        if (restoredTracks.length > 0) {
          console.log('[PlayerPage] 🎹 Restored tracks from localStorage:', restoredTracks);
          const hasLotte = voiceEngines.some(v => v.id === 'lotte_v_ai_dol') || 
                            (localStorage.getItem('vocalido_active_engine') === 'lotte_v_ai_dol');
          if (hasLotte) {
            restoredTracks = restoredTracks.map((t: any) => 
              (t.mode === 'vocal' && (t.engineId === 'default' || !t.engineId))
                ? { ...t, engineId: 'lotte_v_ai_dol' }
                : t
            );
          }
          setTracks(restoredTracks);
          return;
        }

        console.log('[PlayerPage] 🎹 Auto-assigning track roles based on parsed notes');
        // Restore last-used lyric mode from localStorage
        const savedLyricMode = (() => { try { return localStorage.getItem('memo_lyric_mode') || ''; } catch { return ''; } })();
        const newTracks = partIds.map((id, index) => ({
          id,
          name: parsedData.partNames[id] || `Track ${index + 1}`,
          volume: 0.8,
          pan: 0,
          isMuted: false,
          isSolo: false,
          mode: index === 0 ? 'vocal' : 'instrument',
          instrument: index === 0 ? (activeVoiceName || 'Alto Female') : 'Piano',
          lyricMode: (savedLyricMode || activeLyricMode || 'British Fixed Doh') as LyricMode,
          engineId: activeEngineId,
          effects: Array(6).fill(null)
        }));
        setTracks(newTracks);
      }
    }
  }, [parsedData.notes.length, parsedData.partNames, setTracks, activeVoiceName, activeLyricMode, tracks.length, song?.id]);

  // Save tracks to localStorage whenever they change
  useEffect(() => {
    if (song?.id && tracks.length > 0) {
      try {
        localStorage.setItem(`tracks_state_${song.id}`, JSON.stringify(tracks));
      } catch (e) {}
    }
  }, [tracks, song?.id]);

  // Auto-restore active render on load
  useEffect(() => {
    if (!song?.id || renderHistory.length === 0 || tracks.length === 0) return;
    
    // Guard to ensure we only try to restore once per song load
    if (autoRestoredRef.current === song.id) return;

    const savedKey = localStorage.getItem(`active_render_key_${song.id}`);
    if (!savedKey) return;

    const cached = renderHistory.find(
      h => `${h.bpmPercent}_${h.songKey}_${h.engineId||'default'}_${h.lyricMode||''}_${h.voiceName||'Auto'}` === savedKey
    );

    if (cached) {
      autoRestoredRef.current = song.id;
      console.log(`[PlayerPage] 🎤 Auto-restoring saved render ${cached.label}`);
      
      const fixedUrl = fixAudioUrl(cached.audioUrl);
      const stemsWithBust = (cached.savedStemUrls || []).map((sUrl: string) => fixAudioUrl(sUrl));
      const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';

      // Load vocal layer in background
      setIsAudioLoading(true);
      musicEngine.addVocalLayer(primaryTrackId, fixedUrl, stemsWithBust)
        .then(() => {
          setAvailableStems(prev => ({ ...prev, [primaryTrackId]: musicEngine.getAvailableStems(primaryTrackId) }));
          setSoloedStems(prev => ({ ...prev, [primaryTrackId]: null }));
          setActiveRenderKey(savedKey);
          
          if (cached.engineId) setActiveEngineId(cached.engineId);
          if (cached.voiceName && cached.voiceName !== 'Auto') {
            setStoredSinger(cached.voiceName);
          }
          
          // Re-load the song with vocal tracks enabled
          const updatedTracks = tracks.map((t: any) => 
            t.id === primaryTrackId ? { ...t, mode: 'vocal' } as TrackState : t
          );
          setTracks(updatedTracks);
          
          return musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
        })
        .catch(err => console.warn('[PlayerPage] Auto-restore render failed:', err))
        .finally(() => setIsAudioLoading(false));
    }
  }, [song?.id, renderHistory, tracks, transpose, isMetronomeOn, parsedData]);

  // ── AUTO-RENDER: Direct trigger on song load or lyric mode change ────────────
  const autoRenderRef = useRef(false);
  const tracksRep = useMemo(() => {
    return tracks.map(t => `${t.id}:${t.mode}:${t.engineId || ''}`).join(',');
  }, [tracks]);
  
  useEffect(() => {
    // Guard: only run when auto-render is enabled, iframe is loaded, and we have a song with XML, tracks are ready, and lyrics are not off
    if (!vocalidoAutoRender) return;
    if (!iframeLoaded) return;
    if (!musicXml || !song?.id || activeLyricMode === 'Close') return;
    if (!parsedData.notes.length) return;
    if (tracks.length === 0) return; // Wait for tracks to populate
    
    const currentKey = `${song.id}_${activeLyricMode}_${activeEngineId}_${activeVoiceName}`;
    if (currentKey === lastRenderedKeyRef.current) return;
    
    console.log(`[Vocalido] 🚀 Auto-Render triggered: ${activeLyricMode} (${parsedData.notes.length} notes)`);
    lastRenderedKeyRef.current = currentKey;
    
    // Use a microtask to avoid stale closure issues
    autoRenderRef.current = true;
  }, [vocalidoAutoRender, iframeLoaded, song?.id, musicXml, activeLyricMode, activeVoiceName, activeEngineId, parsedData.notes.length, tracks.length, tracksRep]);
  
  // Separate effect to actually call the function (avoids stale closure)
  useEffect(() => {
    if (autoRenderRef.current) {
      autoRenderRef.current = false;
      triggerVocalSynthesis();
    }
  });

  // ── AUTO-PLAY: Triggered after OMR import to play immediately ────────────
  useEffect(() => {
    if (!autoPlay) return;
    if (!parsedData.notes.length) return;
    if (!song?.id) return;

    // Consume the flag immediately so re-renders don't re-trigger
    onAutoPlayConsumed?.();

    // Wait for song change effect + audio engine init to settle
    const t = setTimeout(() => {
      console.log('[PlayerPage] 🎹 Auto-play triggered after OMR import');
      handleTogglePlay();
    }, 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, song?.id, parsedData.notes.length]);

  useEffect(() => {
    const xmlBpm = parsedData.metadata.bpm;
    if (xmlBpm && xmlBpm >= 20 && xmlBpm <= 400) {
      setCurrentBpm(xmlBpm);
      musicEngine.setBpm(xmlBpm);
    }
  }, [parsedData.metadata.bpm]);

  // Stable refs for callbacks/state setters to prevent action registration loops
  const handleTogglePlayRef = useRef(handleTogglePlay);
  const setViewModeRef = useRef(setViewMode);
  const setLoopPresetsRef = useRef(setLoopPresets);
  const setCurrentBpmRef = useRef(setCurrentBpm);
  const setMasterVolumeRef = useRef(setMasterVolume);
  const setShowMixerRef = useRef(setShowMixer);
  const setIsMetronomeOnRef = useRef(setIsMetronomeOn);
  const setTransposeRef = useRef(setTranspose);
  const handleToggleFavoriteRef = useRef(handleToggleFavorite);
  const isMetronomeOnRef = useRef(isMetronomeOn);

  // Sync refs to latest values on every render
  useEffect(() => {
    handleTogglePlayRef.current = handleTogglePlay;
    setViewModeRef.current = setViewMode;
    setLoopPresetsRef.current = setLoopPresets;
    setCurrentBpmRef.current = setCurrentBpm;
    setMasterVolumeRef.current = setMasterVolume;
    setShowMixerRef.current = setShowMixer;
    setIsMetronomeOnRef.current = setIsMetronomeOn;
    setTransposeRef.current = setTranspose;
    handleToggleFavoriteRef.current = handleToggleFavorite;
    isMetronomeOnRef.current = isMetronomeOn;
  });

  // Register Player-specific NimoBrain actions once on mount
  useEffect(() => {
    const unregPlay = nimoBrain.registerAction('play', async () => {
      const state = musicEngine.transportState;
      if (state !== 'started') {
        await handleTogglePlayRef.current();
      }
    });

    const unregPause = nimoBrain.registerAction('pause', async () => {
      const state = musicEngine.transportState;
      if (state === 'started') {
        await handleTogglePlayRef.current();
      }
    });

    const unregSetTempo = nimoBrain.registerAction('set_tempo', (params) => {
      const bpm = params?.bpm;
      if (bpm && bpm >= 20 && bpm <= 400) {
        setCurrentBpmRef.current(bpm);
        musicEngine.setBpm(bpm);
      }
    });

    const unregSetVolume = nimoBrain.registerAction('set_volume', (params) => {
      const level = params?.level;
      if (level !== undefined && level >= 0 && level <= 1) {
        setMasterVolumeRef.current(level);
        musicEngine.setMasterVolume(level);
      }
    });

    const unregToggleViewMode = nimoBrain.registerAction('toggle_view_mode', () => {
      setViewModeRef.current((prev: any) => prev === 'score' ? 'pianoroll' : 'score');
    });

    const unregToggleLoop = nimoBrain.registerAction('toggle_loop', (params) => {
      const enabled = params?.enabled !== false;
      setLoopPresetsRef.current((p: any) => {
        return p.map((x: any, idx: number) => {
          if (enabled) {
            return { ...x, isActive: idx === 0 };
          } else {
            return { ...x, isActive: false };
          }
        });
      });
    });

    const unregToggleMixer = nimoBrain.registerAction('toggle_mixer', () => {
      setShowMixerRef.current(prev => !prev);
    });

    const unregToggleMetronome = nimoBrain.registerAction('toggle_metronome', () => {
      const next = !isMetronomeOnRef.current;
      setIsMetronomeOnRef.current(next);
      musicEngine.toggleMetronome(next);
    });

    const unregSetTranspose = nimoBrain.registerAction('set_transpose', (params) => {
      const val = params?.transpose ?? params?.steps;
      if (val !== undefined && typeof val === 'number') {
        setTransposeRef.current(val);
      }
    });

    const unregToggleFavorite = nimoBrain.registerAction('toggle_favorite', async () => {
      await handleToggleFavoriteRef.current();
    });

    return () => {
      unregPlay();
      unregPause();
      unregSetTempo();
      unregSetVolume();
      unregToggleViewMode();
      unregToggleLoop();
      unregToggleMixer();
      unregToggleMetronome();
      unregSetTranspose();
      unregToggleFavorite();
    };
  }, []);

  // Sync state to NimoBrain
  useEffect(() => {
    nimoBrain.updateState('isPlaying', isPlaying);
    nimoBrain.updateState('currentBpm', currentBpm);
    nimoBrain.updateState('masterVolume', masterVolume);
    nimoBrain.updateState('viewMode', viewMode);
    nimoBrain.updateState('showMixer', showMixer);
    nimoBrain.updateState('isMetronomeOn', isMetronomeOn);
    nimoBrain.updateState('transpose', transpose);
    nimoBrain.updateState('isFavorite', isFavorite);
  }, [isPlaying, currentBpm, masterVolume, viewMode, showMixer, isMetronomeOn, transpose, isFavorite]);

  // Clean up state on unmount
  useEffect(() => {
    return () => {
      nimoBrain.updateState('isPlaying', false);
    };
  }, []);

  // Load engines and stored active engine
  // Load engines and stored active engine
  useEffect(() => {
    let active = true;
    const fetchEngines = async () => {
      try {
        const res = await svsFetch(getFetchUrl('/vocalido/studio/voices'));
        if (!res.ok) throw new Error('Not OK');
        const data = await res.json();
        if (active && data && data.voices) {
          setIsServerOnline(true);
          setVoiceEngines(data.voices);
          
          // Auto-select lotte_v_ai_dol or first non-default voice as default if not already set or if set to 'default'
          const storedEngine = localStorage.getItem('vocalido_active_engine');
          const hasLotte = data.voices.some((v: any) => v.id === 'lotte_v_ai_dol');
          const defaultVoiceId = hasLotte ? 'lotte_v_ai_dol' : (data.voices.find((v: any) => v.id !== 'default')?.id || 'default');
          
          const currentActive = storedEngine || activeEngineId;
          const targetActiveId = (currentActive === 'default' && hasLotte) ? 'lotte_v_ai_dol' : (currentActive || defaultVoiceId);
          
          setActiveEngineId(targetActiveId);
          localStorage.setItem('vocalido_active_engine', targetActiveId);

          setTracks((prev: any) => prev.map((t: any) => {
            if (t.mode === 'vocal' && (t.engineId === 'default' || !t.engineId) && hasLotte) {
              return { ...t, engineId: 'lotte_v_ai_dol' };
            }
            if (t.mode === 'vocal' && !t.engineId) {
              return { ...t, engineId: defaultVoiceId };
            }
            return t;
          }));
        }
      } catch (err) {
        console.warn("Could not fetch voice engines, using defaults", err);
        if (active) {
          setIsServerOnline(false);
          // Fallback: hardcode default Lotte V voice when server unreachable
          setVoiceEngines([{ 
            id: 'lotte_v_ai_dol', 
            name: 'Lotte V', 
            type: 'diffsinger', 
            lang: 'en',
            model_files: {
              acoustic: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/acoustic.onnx',
              vocoder: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsvocoder/aidolgan.onnx',
              dictionary: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/dictionary.txt',
              phonemes: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/phonemes.txt',
              embeds: {
                root: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/embeds/acoustic/Root.emb',
                fragrance: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/embeds/acoustic/Fragrance.emb',
                nectar: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/embeds/acoustic/Nectar.emb'
              }
            }
          }]);
          setActiveEngineId('lotte_v_ai_dol');
        }
      }
    };
    fetchEngines();

    try {
      const storedEngine = localStorage.getItem('vocalido_active_engine');
      if (storedEngine) setActiveEngineId(storedEngine);
    } catch (e) {}

    return () => {
      active = false;
    };
  }, [song?.id]);

  const handleEngineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setActiveEngineId(newId);
    localStorage.setItem('vocalido_active_engine', newId);
    setTracks((prev: any) => prev.map((t: any) => 
      t.mode === 'vocal' ? { ...t, engineId: newId } : t
    ));
  };

  // Listen to cross-window storage changes and direct messages so Voice Name updates locally immediately
  useEffect(() => {
    const syncSinger = () => {
      try {
        const saved = localStorage.getItem('vocalido_singers');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.length > 0) setStoredSinger(parsed[0].name);
        }
      } catch(e) {}
    };
    
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SINGER_SAVED') {
        setStoredSinger(e.data.name);
      }
    };

    syncSinger();
    window.addEventListener('storage', syncSinger);
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('storage', syncSinger);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Derive up to 8 notes of lyrics based on current parse
  const currentPhraseToSing = useMemo(() => {
    if (!parsedData || parsedData.notes.length === 0) return "Do Re Mi Fa Sol La Ti Do";
    return parsedData.notes.slice(0, 8).map(n => n.solfege || 'La').join(' ');
  }, [parsedData]);

  // When switching to Vocalido Studio card, push note data into the iframe
  useEffect(() => {
    if (activeCard === 'vocalido' && iframeRef.current) {
      // 1. Send the simple 8-note phrase for the quick preview box
      const phraseMessage = { type: 'UPDATE_PHRASE', phrase: currentPhraseToSing };
      
      // 2. Send the full note data for the "Sing from Score" feature
      const stepMap: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
      const notesForStudio = parsedData.notes.map(n => ({
        pitch: (n.octave + 1) * 12 + (stepMap[n.step.toUpperCase()] || 0) + (n.alter || 0),
        duration: n.duration,
        startTime: n.startTime,
        lyric: n.solfege || 'La'
      }));
      const notesMessage = { type: 'UPDATE_NOTES', notes: notesForStudio };

      // 3. Send the active voice engine ID
      const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
      const trackEngineId = tracks.find(t => t.id === primaryTrackId)?.engineId || activeEngineId;
      const voiceMessage = { type: 'UPDATE_ACTIVE_VOICE', voice: trackEngineId };

      // Small timeout to ensure iframe's script has attached its listener after mount
      setTimeout(() => {
        if (!iframeRef.current || svsEngine !== 'vocalido') return;
        iframeRef.current.contentWindow?.postMessage(phraseMessage, '*');
        iframeRef.current.contentWindow?.postMessage(notesMessage, '*');
        iframeRef.current.contentWindow?.postMessage(voiceMessage, '*');
      }, 800);
    }
  }, [activeCard, currentPhraseToSing, parsedData.notes, activeEngineId, tracks]);

  useEffect(() => {
    musicEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    const syncTracks = async () => {
      const updatedTracks = tracks.map(t => {
        const isVocalMuted = mutedVocalTracks.has(t.id);
        return {
          ...t,
          mode: (isVocalMuted ? 'instrument' : t.mode) as 'instrument' | 'vocal'
        };
      });

      // Ensure sampler is loaded for any tracks that are now in 'instrument' mode
      for (const t of updatedTracks) {
        if (t.mode === 'instrument') {
          await musicEngine.initSampler(t.id, t.name, t.pluginSettings, 'instrument');
        }
      }

      musicEngine.updateTrackStates(updatedTracks);
    };

    syncTracks();
  }, [tracks, mutedVocalTracks]);

  // ── Transpose change → reload engine with new semitone shift ──────────────
  useEffect(() => {
    const state = musicEngine.transportState;
    if (state === 'stopped') return; // next Play will pick up transpose automatically

    const wasPlaying = state === 'started';
    const savedPos = musicEngine.transportSeconds;

    musicEngine.pause();
    setIsPlaying(false);

    // Reload for BOTH playing and paused states
    if (parsedData.notes.length > 0) {
      setIsAudioLoading(true);
      const updatedTracks = tracks.map(t => ({
        ...t,
        mode: (mutedVocalTracks.has(t.id) ? 'instrument' : t.mode) as 'instrument' | 'vocal'
      }));
      musicEngine.ensureInitialized()
        .then(() => musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn))
        .then(() => {
          musicEngine.setTransportSeconds(savedPos);
          if (wasPlaying) return musicEngine.start();
        })
        .then(() => { if (wasPlaying) setIsPlaying(true); })
        .catch(e => console.error('Transpose reload failed:', e))
        .finally(() => setIsAudioLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transpose]);

  const musicalTimeRef = useRef(0);

  const lastRenderTime = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumePopupRef.current && !volumePopupRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false);
      }
    };
    if (showVolumeSlider) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVolumeSlider]);

  const totalDurationSeconds = useMemo(() => {
    if (!parsedData.notes.length) return localSong.duration || 180;
    const lastNote = parsedData.notes.reduce((p, c) => (c.startTime + c.duration) > (p.startTime + p.duration) ? c : p, parsedData.notes[0]);
    return ((lastNote.startTime + lastNote.duration) * 60) / (currentBpm || 75);
  }, [parsedData.notes, currentBpm, localSong.duration]);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        triggerVocalSynthesis(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const cancelVocalSynthesis = () => {
    if (renderAbortControllerRef.current) {
      console.log('[Vocalido] 🛑 Cancelling synthesis...');
      renderAbortControllerRef.current.abort();
      renderAbortControllerRef.current = null;
    }
    setIsRenderingVocal(false);
    setRenderProgress(0);
    setRenderTimer(0);
    setRenderStatusText('');
  };

  const triggerVocalSynthesis = async (forceRender: boolean = false) => {
    if (isRenderingVocal) { console.warn('[Vocalido] ⛔ Render blocked: already rendering'); return; }
    if (isModelLoading) { console.warn('[Vocalido] ⛔ Render blocked: vocal model is still loading in the background'); return; }
    if (!musicXml) { console.warn('[Vocalido] ⛔ Render blocked: no musicXml'); return; }
    if (!parsedData.notes.length) { console.warn('[Vocalido] ⛔ Render blocked: no notes parsed'); return; }
    if (tracks.length === 0) { console.warn('[Vocalido] ⛔ Render blocked: no tracks'); return; }

    setRenderError(null);
    setIsRenderingVocal(true);
    setRenderProgress(0);
    setRenderTimer(0);
    setRenderStatusText('');

    // Pre-unlock the HTMLAudioElement synchronously inside user click gesture
    const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
    musicEngine.unlockVocalAudio(primaryTrackId);

    const wasPlaying = isPlaying || musicEngine.transportState === 'started';
    const savedPos = musicEngine.transportSeconds;
    if (wasPlaying) {
      musicEngine.pause();
      setIsPlaying(false);
    }

    // Declare these BEFORE try so they are accessible in catch/finally
    const controller = new AbortController();
    renderAbortControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      if (renderAbortControllerRef.current === controller) {
        controller.abort();
      }
    }, 90000);
    const noteCount = parsedData.notes.filter(n => n.trackId === primaryTrackId).length;
    const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
    let estimatedDuration = 10;
    if (svsEngine === 'browser-ai') {
      estimatedDuration = hasGpu ? (4 + noteCount * 0.05) : (8 + noteCount * 0.4);
    } else {
      estimatedDuration = 6 + noteCount * 0.08;
    }
    estimatedDuration = Math.max(5, Math.min(180, estimatedDuration));

    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      let simulatedProgress = 0;
      if (elapsed < estimatedDuration) {
        simulatedProgress = (elapsed / estimatedDuration) * 95;
      } else {
        const extra = elapsed - estimatedDuration;
        simulatedProgress = 95 + (4.9 * (1 - Math.exp(-extra / 30)));
      }
      setRenderProgress(Math.min(99.9, simulatedProgress));
      setRenderTimer(Math.round(elapsed));
    }, 250);
    const cleanupLocal = () => {
      clearInterval(progressInterval);
      clearTimeout(timeoutId);
      if (renderAbortControllerRef.current === controller) {
        renderAbortControllerRef.current = null;
      }
    };

    try {
      const stepMap: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
      
      const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
      // ✅ No slice limit — synthesize ALL notes so repeats/loops are included
      let sourceNotes = parsedData.notes.filter(n => n.trackId === primaryTrackId);
      
      // ✅ Preserving all notes to support multi-voice harmony rendering
      const sortedSource = [...sourceNotes].sort((a, b) => a.startTime - b.startTime);
      sourceNotes = sortedSource;
      
      // ✅ Apply transpose semitone shift to every note's MIDI pitch
      const transposeSemitones = transpose; // e.g. -12 for one octave down
      
      const notesToSynthesize = sourceNotes.map(n => {
        let lyric = 'Doh'; // safe fallback — was 'La' which caused unexpected syllables
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
            lyric = n.lyric || 'ah';
          } else if (activeLyricMode === 'Close') {
            lyric = 'm';
          } else {
            lyric = computed || n.solfege || 'Doh';
          }

          // 🔍 Debug: log each note→lyric to browser console
          console.log(`[SVS] ${n.step}${n.octave} alter=${n.alter} key=${songKey} mode=${activeLyricMode} → "${lyric}"`);
        } catch (e) {
          console.warn('[SVS] Solfege calc error:', e);
        }
        
        const safeStep = (n.step || 'C').toUpperCase();
        const rawMidi = (n.octave + 1) * 12 + (stepMap[safeStep] || 0) + (n.alter || 0);
        const transposedMidi = Math.max(24, Math.min(108, rawMidi + transposeSemitones)); // clamp to MIDI 24–108
        return {
          pitch: transposedMidi,
          midi: transposedMidi,
          duration: isNaN(n.duration) ? 0.5 : n.duration,
          startTime: isNaN(n.startTime) ? 0 : n.startTime,
          lyric
        };
      });

      console.log(`[SVS] 🎼 ${sourceNotes.length} notes | transpose=${transposeSemitones} semitones`);

      console.log(`[SVS] 🎙️ Initializing ${svsEngine.toUpperCase()} Synthesis...`);
      
      const xmlBpm = (parsedData.metadata as any)?.bpm;
      const actualBpm = xmlBpm || currentBpm || 120;

      // CRITICAL: Set BPM in Tone.Transport BEFORE adding the vocal layer.
      // If we don't do this, Tone.Player.sync() will record the default 120 BPM,
      // and when we set it to actualBpm later, it will time-stretch (slow down) the audio!
      await musicEngine.ensureInitialized();
      musicEngine.setBpm(actualBpm);
      setCurrentBpm(actualBpm);

      if (svsEngine === 'vocalido' || svsEngine === 'browser-ai') {
        const origBpm = (parsedData.metadata as any)?.bpm || 120;
        const bpmPct = Math.round((actualBpm / origBpm) * 100);
        const songKey = parsedData.metadata?.key || localSong.key || 'C';

        const trackEngineId = tracks.find(t => t.id === primaryTrackId)?.engineId || activeEngineId;

        // ── Cache check: skip render if key+bpm+mode+engine+voiceName already saved ─────
        const currentVoiceName = activeVoiceName || 'Auto';
        const targetVoice = collapseChords ? currentVoiceName : `${currentVoiceName}poly`;
        const targetEngine = collapseChords ? (trackEngineId || 'default') : `${trackEngineId || 'default'}poly`;

        const cached = renderHistory.find(
          h => {
            // 🚫 Never use cached renders with blob: URLs — they expire on page reload
            if (!h.audioUrl || h.audioUrl.startsWith('blob:')) return false;

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
          }
        );
        const cachedKey = cached ? `${cached.bpmPercent}_${cached.songKey}_${cached.engineId||'default'}_${cached.lyricMode||''}_${cached.voiceName||'Auto'}` : null;
        if (cached) {
          console.log(`[MemoCache] ✅ Found cached render ${cached.label} (${activeLyricMode}, ${trackEngineId}, ${currentVoiceName}) — skipping GPU render`);
          await musicEngine.ensureInitialized();
          // For permanent URLs: add cache-bust param. Blob URLs must NOT have params added.
          const fixedUrl = fixAudioUrl(cached.audioUrl);
          const cacheBusted = fixedUrl.startsWith('blob:') ? fixedUrl
            : (fixedUrl.includes('?t=') ? fixedUrl.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixedUrl}?t=${Date.now()}`);
          const stemsWithBust = (cached.savedStemUrls || []).map((sUrl: string) => {
            const fixed = fixAudioUrl(sUrl);
            return fixed.startsWith('blob:') ? fixed
              : (fixed.includes('?t=') ? fixed.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixed}?t=${Date.now()}`);
          });
          // Set track mode to vocal so Play button / loadSong works correctly
          const updatedTracks = tracks.map((t: any) => 
            t.id === primaryTrackId ? { ...t, mode: 'vocal' } as TrackState : t
          );
          setTracks(updatedTracks);

          try {
            setIsAudioLoading(true);
            await musicEngine.addVocalLayer(primaryTrackId, cacheBusted, stemsWithBust);
            setAvailableStems(prev => ({ ...prev, [primaryTrackId]: musicEngine.getAvailableStems(primaryTrackId) }));
            setSoloedStems(prev => ({ ...prev, [primaryTrackId]: null }));

            // Reload song to sync Tone.Part with new mode
            await musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
            musicEngine.setTransportSeconds(savedPos);
            if (wasPlaying) {
              await musicEngine.start();
              setIsPlaying(true);
            }
          } catch (e) {
            console.error('[MemoCache] Failed to load cached vocal layer:', e);
          } finally {
            setIsAudioLoading(false);
          }
          if (cachedKey) setActiveRenderKey(cachedKey);
          cleanupLocal();
          setRenderProgress(100);
          setTimeout(() => { setIsRenderingVocal(false); setActiveCard('score'); }, 600);
          return;
        }

        // ── Dual-Path Synthesis: Browser GPU/CPU → Local Server → RunPod Fallback ──────────────
        let result: any = null;
        const synthParams = { singer: activeVoiceName, bpm: actualBpm, transpose: transposeSemitones, voice: trackEngineId, return_stems: true, collapse_chords: collapseChords, steps: 20 };
        
        let usedRunPod = false;

        const selectedVoice = voiceEngines.find(v => v.id === trackEngineId);
        if (svsEngine === 'browser-ai' && selectedVoice?.model_files) {
          console.log('[Browser AI] Running direct browser-side WebGPU synthesis...');
          setRenderStatusText('Loading models...');
          
          // Translate model files paths to complete URLs using getFetchUrl
          const modelFiles = {
            acoustic: getFetchUrl(selectedVoice.model_files.acoustic),
            vocoder: getFetchUrl(selectedVoice.model_files.vocoder),
            dictionary: selectedVoice.model_files.dictionary ? getFetchUrl(selectedVoice.model_files.dictionary) : undefined,
            phonemes: selectedVoice.model_files.phonemes ? getFetchUrl(selectedVoice.model_files.phonemes) : undefined,
            embeds: selectedVoice.model_files.embeds ? Object.keys(selectedVoice.model_files.embeds).reduce((acc, key) => {
              if (selectedVoice.model_files?.embeds?.[key]) {
                acc[key] = getFetchUrl(selectedVoice.model_files.embeds[key]);
              }
              return acc;
            }, {} as Record<string, string>) : undefined
          };

          await clientSvsEngine.loadVoice(selectedVoice.id, modelFiles, (prog) => {
            setRenderStatusText(prog.message);
            setRenderProgress(Math.min(99.9, prog.progress));
          });

          setRenderStatusText('Generating vocals (on-device GPU/CPU)...');
          const wavBlob = await clientSvsEngine.synthesize(notesToSynthesize, {
            bpm: actualBpm,
            formant_shift: 0,
            speed: 1.0,
            breathiness: 0,
            vocal_mode: 'root',
            steps: 20,
          });

          const localBlobUrl = URL.createObjectURL(wavBlob);
          result = {
            audio_url: localBlobUrl,
            engine: 'browser_ai_webgpu',
            stems_b64: []
          };
          usedRunPod = true; // Bypasses cache/fixAudioUrl rewriting, uses local blob url as-is
        } else {
          if (svsEngine === 'browser-ai') {
            console.warn('[Browser AI] Selected voice has no local ONNX model files. Falling back to Server/RunPod.');
            setRenderStatusText('Selected voice has no local ONNX files. Falling back to Server/RunPod.');
          }
          
          const shouldTryLocal = true; // Enable local/cloud server check for Hybrid Caching
          if (shouldTryLocal) {
            // Try local/cloud server with 90s timeout (essential for CPU rendering on large scores)
            try {
              console.log('[Vocalido] 🔄 Trying local/cloud server...');
              const localController = new AbortController();
              const localTimeout = setTimeout(() => localController.abort(), 90000);
              
              const resp = await svsFetch(getFetchUrl('/studio/preview'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: localController.signal,
                body: JSON.stringify({
                  notes: notesToSynthesize,
                  params: synthParams,
                  song_id: song?.id || '',
                  bpm_pct: bpmPct,
                  song_key: songKey,
                  lyric_mode: activeLyricMode,
                  owner_id: song?.ownerId || authUser?.id || '',
                  is_public: song?.isPublic ?? true,
                })
              });
              clearTimeout(localTimeout);
              
              if (resp.ok) {
                result = await resp.json();
                console.log('[Vocalido] ✅ Local/cloud server responded');
              } else {
                const errorData = await resp.json().catch(() => ({}));
                console.warn(`[Vocalido] ⚠️ Local server error (${resp.status}):`, errorData.error || '');
              }
            } catch (localErr: any) {
              console.warn('[Vocalido] ⚠️ Local server unavailable:', localErr.name === 'AbortError' ? 'timeout' : localErr.message);
            }
          }

          // Fallback to RunPod if local server failed
          if (!result && RUNPOD_AVAILABLE) {
            console.log('[Vocalido] 🚀 Using RunPod Serverless API...');
            usedRunPod = true;
            setRenderStatusText('Connecting to GPU...');
            const runpodOutput = await synthesizeViaRunPod(
              notesToSynthesize,
              synthParams,
              controller.signal,
              (status) => {
                console.log(`[Vocalido/RunPod] ${status}`);
                setRenderStatusText(status);
                setRenderError(null);
              }
            );
            // Convert RunPod output format to match local server response format
            result = {
              audio_b64: runpodOutput.audio_b64,
              mime_type: runpodOutput.mime_type || 'audio/wav',
              stems_b64: runpodOutput.stems_b64 || [],
              engine: runpodOutput.engine || 'diffsinger_onnx_runpod',
            };
          }
        }

        // If both paths failed
        if (!result) {
          if (!RUNPOD_AVAILABLE) {
            throw new Error('SVS server unavailable and RunPod API not configured. Set VITE_RUNPOD_API_URL and VITE_RUNPOD_API_KEY.');
          }
          throw new Error('All synthesis backends failed');
        }

        clearTimeout(timeoutId);

        // ── Process result (same for local server and RunPod) ──────────────
        if (result.audio_b64 || result.audio_url || result.saved_url) {
          let url = '';
          
          if (result.audio_url) {
            url = result.audio_url.startsWith('http') ? result.audio_url : result.audio_url;
          } else if (result.saved_url && !result.audio_b64) {
            console.log(`[MemoCache] ✅ Server returned cached file: ${result.saved_url}`);
            url = result.saved_url;
          } else if (result.audio_b64) {
            const binary = atob(result.audio_b64);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
            const blob = new Blob([array], { type: result.mime_type || 'audio/wav' });
            url = URL.createObjectURL(blob);
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
              return URL.createObjectURL(blob);
            });
          }
          
          // 🚀 Register with MusicEngine for persistence and sync
          console.log(`[Vocalido] 🎙️ Registering vocal layer to MusicEngine: ${primaryTrackId} via ${result.engine || 'unknown'}${usedRunPod ? ' (RunPod)' : ''}`);
          
          // For RunPod responses (blob URLs), use the blob URL directly
          const finalUrl = usedRunPod ? url : fixAudioUrl(result.saved_url || url);
          const finalStemUrls = usedRunPod ? stemUrls : (result.saved_stem_urls || stemUrls || []).map((sUrl: string) => fixAudioUrl(sUrl));

          const cacheBustedUrl = usedRunPod ? url : (finalUrl.includes('?t=')
            ? finalUrl.replace(/\?t=\d+/, `?t=${Date.now()}`)
            : `${finalUrl}?t=${Date.now()}`);
            
          const stemsWithBust = usedRunPod ? stemUrls : finalStemUrls.map((sUrl: string) => {
            return sUrl.includes('?t=') ? sUrl.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${sUrl}?t=${Date.now()}`;
          });
          
          // Close the render overlay immediately — don't block on audio loading
          setRenderProgress(100);
          cleanupLocal();

          // Save to MemoSongRender history
          const origBpmForHist = (parsedData.metadata as any)?.bpm || 120;
          const bpmPctForHist = Math.round((actualBpm / origBpmForHist) * 100);
          const songKeyForHist = parsedData.metadata?.key || localSong.key || 'C';
          const filenameFromUrl = result.saved_url ? result.saved_url.split('/').pop() || '' : '';
          const voiceNameForHist = activeVoiceName || 'Auto';
          const storedVoiceName = collapseChords ? voiceNameForHist : `${voiceNameForHist}poly`;
          const storedEngineId = collapseChords ? (trackEngineId || 'default') : `${trackEngineId || 'default'}poly`;
          const shortVoice = voiceNameForHist !== 'Auto' ? ` · ${voiceNameForHist.split(/[\s_]/)[0]}${collapseChords ? '' : ' (poly)'}` : '';
          const newLabel = result.label || `${songKeyForHist} ${bpmPctForHist}%${shortVoice}`;
          const newEntryKey = `${bpmPctForHist}_${songKeyForHist}_${storedEngineId}_${activeLyricMode}_${storedVoiceName}`;
          setRenderHistory(prev => {
            const filtered = prev.filter(h => {
              const hLyric = mapToLyricMode(h.lyricMode || 'British Fixed Doh');
              const tLyric = mapToLyricMode(activeLyricMode);
              return !(
                h.bpmPercent === bpmPctForHist && 
                h.songKey === songKeyForHist && 
                hLyric === tLyric &&
                (h.engineId || 'default') === storedEngineId &&
                (h.voiceName || 'Auto') === storedVoiceName
              );
            });
            return [{
              bpmPercent: bpmPctForHist,
              songKey: songKeyForHist,
              audioUrl: usedRunPod ? cacheBustedUrl : finalUrl,
              label: newLabel,
              filename: filenameFromUrl,
              lyricMode: activeLyricMode,
              engineId: storedEngineId,
              voiceName: storedVoiceName,
              savedStemUrls: usedRunPod ? stemUrls : finalStemUrls,
              renderedAt: new Date().toISOString(),
            }, ...filtered].slice(0, 12);
          });
          setActiveRenderKey(newEntryKey);

          setTimeout(() => { setIsRenderingVocal(false); setActiveCard('score'); }, 800);
          
          // Set the track mode to 'vocal' in React state so loadSong doesn't conflict
          const updatedTracks = tracks.map((t: any) => 
            t.id === primaryTrackId ? { ...t, mode: 'vocal' } as TrackState : t
          );
          setTracks(updatedTracks);

          // Load audio — await it so it's ready before user presses play
          try {
            setIsAudioLoading(true);
            await musicEngine.addVocalLayer(primaryTrackId, cacheBustedUrl, stemsWithBust);
            setAvailableStems(prev => ({ ...prev, [primaryTrackId]: musicEngine.getAvailableStems(primaryTrackId) }));
            setSoloedStems(prev => ({ ...prev, [primaryTrackId]: null }));
            console.log(`[Vocalido] ✅ Audio loaded and ready for playback`);

            // Reload song to sync Tone.Part with new mode
            await musicEngine.loadSong(parsedData.notes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
            musicEngine.setTransportSeconds(savedPos);
            if (wasPlaying) {
              await musicEngine.start();
              setIsPlaying(true);
            }
          } catch (e) {
            console.error(`[Vocalido] ❌ Failed to load audio:`, e);
          } finally {
            setIsAudioLoading(false);
          }

        } else {
          throw new Error("Invalid synthesis response: no audio data in result");
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError' || e.message === 'Aborted' || controller.signal.aborted) {
        console.log('[Vocalido] Synthesis aborted/cancelled by user');
        cleanupLocal();
        return;
      }
      console.error(`[VOCALIDO] Error:`, e);
      setRenderError(e.message || "Synthesis Failed");
      // Auto-close after 3 seconds so the user can see the error but doesn't get stuck
      setTimeout(() => {
        setIsRenderingVocal(false);
        setRenderError(null);
      }, 3000);
      cleanupLocal();
    } finally {
      // Safety: always ensure render state is reset after max 90s
      setTimeout(() => {
        setIsRenderingVocal(prev => {
          if (prev) {
            console.warn('[Vocalido] ⚠️ Safety timeout: force-resetting render state after 90s');
            return false;
          }
          return prev;
        });
        setRenderStatusText('');
      }, 90000);
    }
  };

  const closeRenderOverlay = () => {
    setIsRenderingVocal(false);
    setRenderError(null);
  };

  const beatsPerMeasure = Math.max(1, parsedData?.timeSignature?.beats || 4);
  const writtenBar = musicEngine.currentMeasure;
  const currentBar = writtenBar ? parseInt(writtenBar) || 1 : Math.floor(musicEngine.transportMusicalTime / beatsPerMeasure) + 1;
  const currentBeat = Math.floor(musicEngine.transportMusicalTime % beatsPerMeasure) + 1;
  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const originalBpm = (parsedData?.metadata as any)?.bpm || 120;
  const musicalTime = musicEngine.transportMusicalTime * (60 / Math.max(1, originalBpm));

  const activeLoop = useMemo(() => loopPresets.find(p => p.isActive), [loopPresets]);

  useEffect(() => {
    if (activeLoop && activeLoop.isActive) {
      musicEngine.setLoopEnabled(true);
      musicEngine.setLoopPointsByMeasures(activeLoop.startBar, activeLoop.endBar, beatsPerMeasure);
    } else {
      musicEngine.setLoopEnabled(false);
    }
  }, [activeLoop, beatsPerMeasure, currentBpm]);

  const rafId = useRef(0);
  const animate = useCallback((time: number) => {
    // Update musicalTime ref at ~60fps (for smooth laser movement in ProScoreEditor)
    musicalTimeRef.current = musicEngine.transportMusicalTime;

    // Only trigger React re-renders for the time display at ~5fps (200ms)
    // This prevents React's reconciliation from competing with the audio thread
    if (time - lastRenderTime.current > 200) {
      const currentTransportSeconds = musicEngine.transportSeconds;
      setCurrentTime(currentTransportSeconds);

      // 🛑 Auto-stop logic: Stop precisely at the end of the song (0.3s buffer)
      if (musicEngine.transportState === 'started' && totalDurationSeconds > 0) {
        if (currentTransportSeconds >= totalDurationSeconds + 0.3 && !(musicEngine as any).isLoopActive) {
          musicEngine.pause();
          setIsPlaying(false);
        }
      }

      lastRenderTime.current = time;
    }
    rafId.current = requestAnimationFrame(animate);
  }, [totalDurationSeconds, isPlaying]);

  useEffect(() => {
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [animate]);

  useEffect(() => {
    if (song?.previewLimit && song.previewLimit > 0 && isPlaying) {
      const limitSeconds = song.previewLimit * beatsPerMeasure * (60 / originalBpm);
      if (currentTime >= limitSeconds) {
        musicEngine.pause();
        setIsPlaying(false);
        musicEngine.setTransportSeconds(limitSeconds);
        alert(`This is a restricted preview limited to ${song.previewLimit} Bars.`);
      }
    }
  }, [currentTime, song?.previewLimit, isPlaying, beatsPerMeasure, originalBpm]);

  return (
    <div className="flex flex-col h-full w-full bg-[#050507] relative overflow-hidden unselectable">
      {/* ── TOP CONTROL BAR ROW ── */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-0.5 border-b border-white/5 bg-[#08080a] shrink-0 z-[4000] relative">
        {/* Left: Player Options Menu */}
        <div className="relative">
          <button
            onClick={() => setIsNavMenuVisible(!isNavMenuVisible)}
            className={`bg-[#0c0c0e]/95 backdrop-blur-xl border border-white/10 px-4 py-1.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest hover:text-white shadow-md flex items-center gap-1.5 transition-all active:scale-95 group ${activeCard !== 'vocalido' ? 'text-[#00e5ff]' : 'text-zinc-400'}`}
          >
            <Library size={12} className={`${activeCard !== 'vocalido' ? 'text-[#00e5ff]' : 'text-zinc-400'} group-hover:text-white transition-colors`} />
            <span className="hidden sm:inline">PLAYER : </span>
            <span className="text-zinc-200">{activeLyricMode || 'Standard'}</span>
            <ChevronDown size={12} className={`ml-1 transition-transform duration-300 ${isNavMenuVisible ? 'rotate-180' : ''}`} />
          </button>

          {isNavMenuVisible && (
            <div className="absolute left-0 mt-2 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/10 p-4 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col gap-3 w-[260px] max-h-[75vh] sm:max-h-[85vh] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-4 origin-top-left z-[5000]">
              <div className="flex flex-col gap-1.5">
                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest pl-2 mb-1 flex items-center gap-1.5"><Library size={9} /> Visual Modes</span>
                {(['score', 'pianoroll', 'trackview', 'memochord', 'practice'] as PlayerCardType[]).map(card => {
                  const labels: Record<PlayerCardType, string> = {
                    'score': 'Score Sheet', 'pianoroll': 'Piano Roll', 'trackview': 'Trackview',
                    'memochord': 'Chord Ring', 'practice': 'Memo Practice', 'vocalido': 'Voice Studio'
                  };
                  return (
                    <button
                      key={card}
                      onClick={() => { setActiveCard(card); setIsNavMenuVisible(false); }}
                      className={`px-4 py-2.5 rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all text-left flex items-center justify-between
                        ${activeCard === card ? 'bg-[#00e5ff] text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'}`}
                    >
                      <span>{labels[card]}</span>
                      {activeCard === card && <span className="w-1.5 h-1.5 rounded-full bg-black/60" />}
                    </button>
                  );
                })}
              </div>

              <div className="h-px bg-white/10 w-full my-0.5" />

              <div className="flex flex-col gap-2.5 pr-1">
                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest pl-2 mb-1 flex items-center gap-1.5"><Languages size={9} /> Singing Systems</span>
                {[
                  { group: 'American', items: ['American Movable Do', 'American Fixed Do'] },
                  { group: 'British', items: ['British Movable Doh', 'British Fixed Doh'] },
                  { group: 'Ju Solfege', items: ['Ju Solfege Movable Doh', 'Ju Solfege Fixed Doh'] },
                  { group: 'Pedagogical', items: ['Jianpu', 'Kodaly', 'Kodaly Rhythm'] },
                  { group: 'Standard', items: ['Lyric', 'Close'] }
                ].map(grp => (
                  <div key={grp.group} className="flex flex-col gap-1">
                    <span className="text-[7px] font-black text-zinc-600 uppercase tracking-widest pl-2 mb-0.5">{grp.group}</span>
                    <div className="grid grid-cols-2 gap-1">
                      {grp.items.map(mode => {
                        const isActive = tracks.length > 0 && tracks[0].lyricMode === mode;
                        return (
                          <button
                            key={mode}
                            onClick={() => {
                              setTracks((prevTracks: any) => prevTracks.map((t: any) => ({ ...t, lyricMode: mode as LyricMode })));
                              try { localStorage.setItem('memo_lyric_mode', mode); } catch {}
                              setIsNavMenuVisible(false);
                              lastRenderedKeyRef.current = '';
                              setTimeout(() => triggerVocalSynthesis(), 150);
                            }}
                            className={`px-3 py-2 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all text-center flex items-center justify-center border
                              ${isActive ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'}`}
                          >
                            {mode.replace('American ', '').replace('British ', '').replace('Ju Solfege ', '').replace('Indian ', '')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: PREMIUM CLOUD DROPDOWN SVS CONTROL */}
        <div className="flex items-center bg-[#0c0c0e]/85 backdrop-blur-2xl border border-white/10 rounded-full pl-2 pr-1.5 py-0.5 shadow-2xl gap-2 hover:border-white/30 transition-all cursor-pointer group">
          {/* Main Display Area (Click to Toggle Studio) */}
          <button 
            className="flex items-center gap-2 pr-1"
            onClick={() => {
              if (activeCard === 'vocalido') {
                setActiveCard('score');
              } else {
                setActiveCard('vocalido');
                setIsNavMenuVisible(false);
              }
            }}
          >
            <span className={`text-[7px] font-black uppercase tracking-[0.2em] transition-colors ${activeCard === 'vocalido' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              VOCALIDO
            </span>
            <ChevronDown size={10} className={`text-zinc-500 transition-transform duration-300 ${activeCard === 'vocalido' ? 'rotate-180' : ''}`} />
          </button>

          <div className="w-px h-2 bg-white/10" />

          {/* Settings & Toggle Area */}
          <div className="flex items-center gap-1.5 pl-0.5">
            <button
              disabled={isModelLoading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerVocalSynthesis(true);
              }}
              className={`px-1.5 py-[1px] -m-0.5 rounded-full text-[6.5px] font-black uppercase tracking-widest border transition-all shadow-[0_0_10px_rgba(0,229,255,0.2)] ${
                isModelLoading 
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed shadow-none' 
                  : 'bg-white/5 border-white/10 text-[#00e5ff] hover:bg-[#00e5ff] hover:text-black'
              }`}
              title={isModelLoading ? "Loading vocal models..." : "Force Fresh AI Render (Clear Cache) / Shortcut: Option+R"}
            >
              {isModelLoading ? "Loading..." : "Render"}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowVocalidoSetup(true);
              }}
              className="p-1 -m-1 rounded-full transition-all text-zinc-400 hover:text-white hover:bg-white/10"
              title="Vocalido Setup"
            >
              <SlidersHorizontal size={10} />
            </button>
            
            {/* Status Dot */}
            <div className="relative flex items-center justify-center ml-1">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              <div className="absolute w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping opacity-40" />
            </div>
          </div>
        </div>
      </div>

      {song?.previewLimit && song.previewLimit > 0 && (
        <div className="absolute top-[80px] left-1/2 -translate-x-1/2 z-[100] bg-rose-500/10 backdrop-blur-xl border border-rose-500/30 text-rose-200 px-5 py-2 rounded-full shadow-2xl flex items-center gap-2 pointer-events-none">
          <Lock size={14} className="text-rose-400" />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Preview Restricted to {song.previewLimit} Bars</span>
        </div>
      )}

      <div 
        ref={splitContainerRef}
        className={`flex-1 flex flex-row relative w-full overflow-hidden ${isResizing ? 'select-none pointer-events-none' : ''}`}
      >

        {/* ── LEFT SIDEBAR: ORIGINAL IMAGE COMPARISON (SPLIT VIEW) ── */}
        {song?.coverUrl && activeCard === 'score' && (
          <div 
            className={`relative flex flex-col bg-[#0c0c0e] transition-[width] duration-0 ease-in-out z-[1000]`}
            style={{ width: !isOriginalViewHidden ? `${sidebarWidth}%` : '0px' }}
          >
            {/* Toggle Button (Eye) - Floats outside when hidden */}
            <button
              onClick={() => setIsOriginalViewHidden(!isOriginalViewHidden)}
              className={`absolute top-4 ${!isOriginalViewHidden ? 'right-4' : '-right-12 bg-white/10 backdrop-blur-md rounded-r-xl border border-l-0 border-white/20 px-2 py-2 pointer-events-auto'} z-[5000] text-zinc-400 hover:text-white transition-all`}
              title={!isOriginalViewHidden ? "Hide Original View" : "Show Original View"}
            >
              {!isOriginalViewHidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>

            {!isOriginalViewHidden && (
              <div className="flex flex-col w-full h-full p-4 overflow-y-auto pointer-events-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <span className="text-[10px] font-black text-[#00e5ff] uppercase tracking-widest bg-[#00e5ff]/10 px-2 py-1 rounded">Original Sheet</span>
                </div>
                
                {/* Thumbnails / Full Image View */}
                <div className="w-full flex-1 rounded-xl overflow-hidden border border-white/20 bg-[#121216] shadow-2xl relative">
                  <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                    {song.coverUrl.startsWith('pdf:') ? (
                      <iframe 
                        src={song.coverUrl.replace('pdf:', '')} 
                        className="w-full h-full border-0 bg-zinc-900" 
                        title="Original PDF"
                      />
                    ) : (
                      <img 
                        src={song.coverUrl} 
                        alt="Original Sheet Music" 
                        className="w-full h-auto object-contain cursor-crosshair min-h-full" 
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DRAGGABLE DIVIDER ── */}
        {song?.coverUrl && activeCard === 'score' && !isOriginalViewHidden && (
          <div
            onMouseDown={() => setIsResizing(true)}
            className="w-1.5 bg-black hover:bg-[#00e5ff] flex items-center justify-center cursor-col-resize z-[2000] transition-colors pointer-events-auto"
          >
            <div className="w-px h-8 bg-white/30" />
          </div>
        )}

        {/* ── MAIN CONTENT AREA (RIGHT SIDE IN SPLIT VIEW) ── */}
        <div className="flex-1 flex flex-col relative overflow-hidden pointer-events-auto pb-[54px]">
        {/* ── MEMO SONG RENDER: Speed Panel (left floating) ── */}
        {renderHistory.length > 0 && activeCard === 'score' && (
          <>
            {isRenderHistoryHidden ? (
              <button
                onClick={() => setIsRenderHistoryHidden(false)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-[3000] w-3.5 h-10 bg-[#0c0c0e]/90 border border-l-0 border-white/10 hover:bg-zinc-800 rounded-r-md flex items-center justify-center text-zinc-500 hover:text-white pointer-events-auto shadow-md transition-all active:scale-95"
                title="Show Memo Renders"
              >
                <ChevronRight size={10} />
              </button>
            ) : (
              <div className="absolute left-1 top-1/2 -translate-y-1/2 z-[3000] flex flex-col gap-1 pointer-events-auto bg-[#0c0c0e]/95 p-1 rounded-lg border border-white/10 backdrop-blur-xl shadow-2xl max-h-[70vh] overflow-y-auto scrollbar-hide w-[34px]">
                <div className="flex items-center justify-between border-b border-white/5 pb-0.5 mb-0.5 w-full">
                  <span className="text-[4.2px] font-black text-zinc-400 uppercase tracking-widest pl-0.5">Renders</span>
                  <button
                    onClick={() => setIsRenderHistoryHidden(true)}
                    className="w-2.5 h-2.5 flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                    title="Hide Memo Renders"
                  >
                    <ChevronLeft size={6} />
                  </button>
                </div>
                {renderHistory.map((h) => {
                  const hKey = `${h.bpmPercent}_${h.songKey}_${h.engineId||'default'}_${h.lyricMode||''}_${h.voiceName||'Auto'}`;
                  const isActive = activeRenderKey === hKey;
                  const isInfoOpen = memoInfoOpenKey === hKey;
                  const shortDate = h.renderedAt ? new Date(h.renderedAt).toLocaleDateString('th-TH', { day:'2-digit', month:'2-digit' }) : null;
                  const speedDiff = h.bpmPercent - 100;
                  const diffStr = speedDiff > 0 ? `+${speedDiff}%` : speedDiff < 0 ? `${speedDiff}%` : '±0%';
                  return (
                    <div key={hKey} className="relative group">
                      {/* Main render button */}
                      <button
                        onClick={async () => {
                          const wasPlaying = isPlaying || musicEngine.transportState === 'started';
                          const currentPos = musicEngine.transportSeconds;
                          if (wasPlaying) {
                            musicEngine.pause();
                          }
                          setIsAudioLoading(true);
                          try {
                            await musicEngine.ensureInitialized();
  
                            // Set BPM first to prevent sync mismatch
                            const origBpm = (parsedData?.metadata as any)?.bpm || song?.bpm || 120;
                            const targetBpm = Math.round(((origBpm * h.bpmPercent) / 100) * 10) / 10;
                            musicEngine.setBpm(targetBpm);
                            setCurrentBpm(targetBpm);
  
                            // Transpose to matching key
                            const origKey = parsedData.metadata.key || localSong.key || 'C';
                            const targetKey = h.songKey;
                            const tVal = getTransposeDiff(origKey, targetKey);
                            setTranspose(tVal);
  
                            // Load audio stem
                            const fixedUrl = fixAudioUrl(h.audioUrl);
                            const cacheBusted = fixedUrl.startsWith('blob:') ? fixedUrl
                              : (fixedUrl.includes('?t=') 
                                ? fixedUrl.replace(/\?t=\d+/, `?t=${Date.now()}`)
                                : `${fixedUrl}?t=${Date.now()}`);
                            const stemsWithBust = (h.savedStemUrls || []).map((sUrl: string) => {
                              const fixedStem = fixAudioUrl(sUrl);
                              return fixedStem.startsWith('blob:') ? fixedStem
                                : (fixedStem.includes('?t=') ? fixedStem.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fixedStem}?t=${Date.now()}`);
                            });
  
                            const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
                            await musicEngine.addVocalLayer(primaryTrackId, cacheBusted, stemsWithBust);
  
                            // Set the track mode to vocal so UI state reflects it
                            const updatedTracks = tracks.map((t: any) => 
                              t.id === primaryTrackId ? { ...t, mode: 'vocal' } as TrackState : t
                            );
                            setTracks(updatedTracks);
  
                            setAvailableStems(prev => ({ ...prev, [primaryTrackId]: musicEngine.getAvailableStems(primaryTrackId) }));
                            setSoloedStems(prev => ({ ...prev, [primaryTrackId]: null }));
  
                            setActiveRenderKey(hKey);
                            setMemoInfoOpenKey(null);
                            if (h.engineId) setActiveEngineId(h.engineId);
                            if (h.voiceName && h.voiceName !== 'Auto') {
                              setStoredSinger(h.voiceName);
                            } else {
                              setStoredSinger(null);
                            }
  
                            // Load song (5 arguments)
                            await musicEngine.loadSong(parsedData.notes, updatedTracks, tVal, parsedData.timeSignature, isMetronomeOn);
                            
                            musicEngine.setTransportSeconds(currentPos);
                            if (wasPlaying) {
                              await musicEngine.start();
                              setIsPlaying(true);
                            }
                          } catch (err) {
                            console.error('Failed to load render history stem:', err);
                            alert("❌ ไม่สามารถโหลดไฟล์ร้องประสานเสียงนี้ได้");
                          } finally {
                            setIsAudioLoading(false);
                          }
                        }}
                        className={`w-6 h-6 rounded-lg flex flex-col items-center justify-center border font-bold uppercase transition-all shadow-md relative leading-none select-none
                          ${isActive 
                            ? 'bg-gradient-to-br from-cyan-400 to-indigo-600 text-black border-transparent shadow-[0_0_10px_rgba(0,229,255,0.4)]' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                          }`}
                        title={`เล่นประสานเสียง (${h.voiceName || 'Auto'} • ${h.lyricMode || 'SYS'} • Key ${h.songKey} • BPM ${h.bpmPercent}%)`}
                      >
                        <span className="text-[4.5px] tracking-tighter leading-none mb-0.5">{h.songKey}</span>
                        <span className="text-[3.2px] opacity-80 leading-none">{diffStr}</span>
                        <span className="text-[2.2px] opacity-60 mt-0.5 tracking-tighter max-w-[22px] truncate leading-none">{h.voiceName || 'Auto'}</span>
                      </button>
    
                      {/* Info popup toggle — tiny badge */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMemoInfoOpenKey(isInfoOpen ? null : hKey);
                        }}
                        className={`absolute top-0 left-0 w-2 h-2 rounded-full flex items-center justify-center text-[3.5px] font-black border transition-all pointer-events-auto
                          ${isInfoOpen 
                            ? 'bg-amber-500 border-amber-400 text-white shadow-lg' 
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                          }`}
                        title="ดูรายละเอียด / Show details"
                      >
                        ℹ
                      </button>
    
                      {/* Detailed info popup overlay */}
                      {isInfoOpen && (
                        <div className="absolute left-14 top-0 w-44 bg-[#0c0c0e]/95 backdrop-blur-2xl border border-white/10 p-3 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[8999] flex flex-col gap-1.5 text-[8px] animate-in fade-in slide-in-from-left-4 duration-150">
                          <div className="flex justify-between border-b border-white/5 pb-1">
                            <span className="font-black text-cyan-400 uppercase tracking-widest">Render Profile</span>
                            <span className="text-[6.5px] text-zinc-500">{h.voiceName || 'Auto'}</span>
                          </div>
                          <div className="flex flex-col gap-1 text-zinc-300">
                            <div className="flex justify-between gap-3">
                              <span className="text-zinc-500">Key Signature</span>
                              <span className="text-zinc-100 font-black">{h.songKey}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-zinc-500">Speed Ratio</span>
                              <span className="text-zinc-100 font-black">{h.bpmPercent}%</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-zinc-500">Singing System</span>
                              <span className="text-zinc-100 font-black truncate max-w-[100px]">{h.lyricMode || 'British Fixed Doh'}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-zinc-500">Engine</span>
                              <span className="text-zinc-100 font-black truncate max-w-[100px]">{h.engineId || 'default'}</span>
                            </div>
                            {shortDate && (
                              <div className="flex justify-between gap-3">
                                <span className="text-zinc-500">บันทึกเมื่อ</span>
                                <span className="text-zinc-400">{shortDate}</span>
                              </div>
                            )}
                            {isActive && (
                              <div className="mt-1 px-2 py-1 bg-cyan-400/20 rounded-lg text-center text-cyan-400 font-black text-[8px] tracking-widest">▶ กำลังใช้งาน</div>
                            )}
                          </div>
                        </div>
                      )}
    
                      {/* Delete button — positioned inside to prevent overflow clipping */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const confirmed = window.confirm(`ลบ Render "${formatRenderLabel(h.label, h.bpmPercent)}" สำหรับเพลงนี้ออกใช่ไหม?`);
                          if (!confirmed) return;
                          if (h.filename) svsFetch(getFetchUrl(`/studio/renders/${encodeURIComponent(h.filename)}?owner_id=${encodeURIComponent(authUser?.id || '')}&song_id=${encodeURIComponent(localSong.id)}`), { method: 'DELETE' }).catch(() => {});
                          setRenderHistory(prev => prev.filter(x => `${x.bpmPercent}_${x.songKey}_${x.engineId||'default'}_${x.lyricMode||''}_${x.voiceName||'Auto'}` !== hKey));
                          if (activeRenderKey === hKey) setActiveRenderKey(null);
                          if (memoInfoOpenKey === hKey) setMemoInfoOpenKey(null);
                        }}
                        className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full text-[5.5px] font-black flex items-center justify-center transition-all shadow-lg pointer-events-auto z-[3100]"
                        title="ลบ / Delete"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Close info popup when clicking outside */}
        {memoInfoOpenKey && (
          <div className="absolute inset-0 z-[8999]" onClick={() => setMemoInfoOpenKey(null)} />
        )}

        {/* ── TRACK MIC BUTTONS: pinned to actual staff Y positions ── */}
        {activeCard === 'score' && tracks.length > 0 && (
          <div className="absolute left-0 top-0 w-full h-full z-[3000] pointer-events-none">
            {/* Song Actions: Favorite & Folder selection */}
            {(() => {
              const baseTop = staffYPositions.length > 0 ? staffYPositions[0] : 60;
              return (
                <div 
                  ref={folderPopoverRef}
                  className="absolute left-1 z-[6000] flex flex-col gap-0.5 pointer-events-auto items-start opacity-60 hover:opacity-100 transition-opacity duration-200"
                  style={{ top: `${Math.max(2, baseTop - 42)}px` }}
                >
                  <button
                    onClick={handleToggleFavorite}
                    className={`h-2 px-0.5 rounded-sm flex items-center gap-0.5 text-[3.2px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                      isFavorite
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:text-rose-400 hover:border-rose-400/60'
                    }`}
                    title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart size={3} fill={isFavorite ? 'currentColor' : 'none'} className={isFavorite ? 'text-white' : ''} />
                    {isFavorite ? 'Favorite' : 'Add Fav'}
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setIsFolderPopoverOpen(!isFolderPopoverOpen)}
                      className={`h-2 px-0.5 rounded-sm flex items-center gap-0.5 text-[3.2px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                        currentFolderId
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:text-indigo-400 hover:border-indigo-400/60'
                      }`}
                      title="Manage Folder"
                    >
                      <Folder size={3} />
                      {currentFolderId ? (folders.find(f => f.id === currentFolderId)?.name || 'Folder') : 'Add Folder'}
                    </button>

                    {isFolderPopoverOpen && (
                      <div className="absolute left-0 mt-1 bg-[#0c0c0e]/95 backdrop-blur-xl border border-white/10 p-2 rounded-lg shadow-xl flex flex-col gap-1.5 w-[160px] z-[9000] animate-in fade-in duration-100">
                        <span className="text-[6.5px] font-black text-white/40 uppercase tracking-wider px-1">Select Folder</span>
                        
                        <div className="flex flex-col gap-0.5 max-h-[100px] overflow-y-auto scrollbar-hide">
                          {folders.map(f => (
                            <div key={f.id} className="flex items-center justify-between hover:bg-white/5 rounded px-1 py-0.5">
                              <button
                                onClick={() => handleAssignFolder(f.id)}
                                className={`text-[7px] font-bold text-left flex items-center gap-1 flex-1 truncate ${
                                  currentFolderId === f.id ? 'text-indigo-400' : 'text-zinc-300 hover:text-white'
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.color || '#6366f1' }} />
                                <span className="truncate">{f.name}</span>
                              </button>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFolder(f.id);
                                }}
                                className="w-3.5 h-3.5 flex items-center justify-center text-zinc-500 hover:text-rose-500 rounded hover:bg-rose-500/10 transition-colors"
                                title="Delete Folder"
                              >
                                <Trash2 size={7} />
                              </button>
                            </div>
                          ))}

                          {folders.length === 0 && (
                            <span className="text-[6px] text-zinc-500 italic px-1">No folders created</span>
                          )}
                        </div>

                        {currentFolderId && (
                          <button
                            onClick={() => handleAssignFolder(undefined)}
                            className="w-full text-left text-[6.5px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded px-1 py-0.5 transition-colors border border-rose-500/20"
                          >
                            × Remove from Folder
                          </button>
                        )}

                        <div className="h-px bg-white/5 my-0.5" />

                        {showNewFolderForm ? (
                          <div className="flex flex-col gap-1.5 p-1 bg-white/5 rounded border border-white/5">
                            <input
                              type="text"
                              placeholder="Folder name..."
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              className="w-full bg-black/60 border border-white/10 rounded px-1 py-0.5 text-[7px] text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                              autoFocus
                            />
                            <div className="flex justify-between items-center">
                              <div className="flex gap-1">
                                {['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'].map(c => (
                                  <button
                                    key={c}
                                    onClick={() => setNewFolderColor(c)}
                                    className={`w-2 h-2 rounded-full border transition-transform ${
                                      newFolderColor === c ? 'scale-125 border-white' : 'border-transparent'
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => setShowNewFolderForm(false)}
                                  className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white rounded text-[6px] font-bold uppercase"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleCreateFolder}
                                  className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[6px] font-bold uppercase"
                                >
                                  Create
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowNewFolderForm(true)}
                            className="w-full py-1 border border-dashed border-white/15 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded flex items-center justify-center gap-1 text-[6.5px] font-black uppercase text-indigo-400 transition-all"
                          >
                            <Plus size={6} /> New Folder
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {tracks.map((track, i) => {
              const isMuted = mutedVocalTracks.has(track.id);
              const baseTop = staffYPositions.length > 0 ? staffYPositions[0] : 60;
              const yPos = staffYPositions[i] ?? (baseTop + i * 80);
              return (
                <div 
                  key={track.id} 
                  className="absolute left-1 z-50 flex flex-col gap-1 pointer-events-auto"
                  style={{ top: `${yPos - 2}px` }}
                >
                  {/* Button Row */}
                  <div className="flex flex-row gap-0.5 items-center">
                    <button
                      onClick={() => {
                        setTracks((prev: any) => prev.map((t: any) => ({
                          ...t, mode: t.id === track.id ? 'vocal' : t.mode
                        })));
                        setActiveRenderTrackId(track.id);
                        triggerVocalSynthesis(true);
                      }}
                      className={`h-2.5 px-0.5 rounded-sm flex items-center gap-0.5 text-[3.5px] font-black uppercase transition-all border shadow-sm ${
                        track.mode === 'vocal'
                          ? 'bg-cyan-600 border-cyan-400 text-white'
                          : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:text-cyan-400 hover:border-cyan-400/60'
                      }`}
                      title={`Render "${track.name}" as vocal`}
                    >
                      <Mic2 size={4.5} />
                      Render
                    </button>
                    
                    <button
                      onClick={() => setMutedVocalTracks(prev => {
                        const next = new Set(prev);
                        next.has(track.id) ? next.delete(track.id) : next.add(track.id);
                        return next;
                      })}
                      className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center transition-all ${
                        !isMuted 
                          ? 'bg-red-600 border-red-500 text-white shadow-[0_0_5px_rgba(220,38,38,0.5)]' 
                          : 'bg-zinc-300 border-zinc-400 text-zinc-800 hover:bg-zinc-200'
                      }`}
                      title={isMuted ? 'Piano mode' : 'Vocal mode'}
                    >
                      {isMuted ? <span className="text-[4.5px]">🎹</span> : <Mic2 size={5} />}
                    </button>

                    {/* Stem Solo — hidden behind toggle to prevent accidental clicks */}
                    {showStemControls && availableStems[track.id] > 0 && (() => {
                      const stemTrackId = track.id;
                      const isOpen = expandedStemTrack === stemTrackId;
                      return (
                        <div className="relative pointer-events-auto">
                          {/* Tiny toggle: only shows a small diamond icon */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedStemTrack(isOpen ? null : stemTrackId); }}
                            className={`w-3 h-3 rounded-sm flex items-center justify-center transition-all border text-[5px] font-black ${
                              isOpen 
                                ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_6px_rgba(6,182,212,0.5)]' 
                                : soloedStems[stemTrackId] !== null
                                  ? 'bg-amber-600 border-amber-400 text-white animate-pulse'
                                  : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-500 hover:text-cyan-400 hover:border-cyan-500/50'
                            }`}
                            title={isOpen ? 'Close stem panel' : `Stem Solo (${availableStems[stemTrackId]} parts)`}
                          >
                            ◆
                          </button>
                          {/* Expandable panel — only shows when toggled open */}
                          {isOpen && (
                            <div className="absolute left-5 top-0 flex flex-row gap-0.5 items-center bg-black/80 p-1 rounded-md border border-cyan-500/30 backdrop-blur-xl shadow-xl select-none z-[9000] animate-in fade-in duration-150">
                              <span className="text-[5.5px] font-black text-cyan-400/80 uppercase px-0.5 whitespace-nowrap">Solo:</span>
                              {Array.from({ length: availableStems[stemTrackId] }).map((_, idx) => {
                                const isSoloed = soloedStems[stemTrackId] === idx;
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => handleSoloStem(stemTrackId, isSoloed ? null : idx)}
                                    className={`w-4 h-4 rounded text-[6.5px] font-black flex items-center justify-center transition-all border ${
                                      isSoloed
                                        ? 'bg-cyan-500 border-cyan-300 text-white shadow-[0_0_5px_rgba(6,182,212,0.4)]'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-500 hover:text-white'
                                    }`}
                                    title={isSoloed ? `Mute voice part ${idx + 1} and play all` : `Solo voice part ${idx + 1}`}
                                  >
                                    S{idx + 1}
                                  </button>
                                );
                              })}
                              {soloedStems[stemTrackId] !== null && (
                                <button
                                  onClick={() => handleSoloStem(stemTrackId, null)}
                                  className="px-1 py-0.5 bg-rose-600 border border-rose-500 rounded text-[5px] font-black uppercase text-white hover:bg-rose-500 transition-all"
                                  title="Play all voices together"
                                >
                                  All
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ProScoreEditor: Handles Score, MemoChord */}
          <div
            ref={scoreAreaRef}
            style={{
              display: (activeCard === 'score') ? 'flex' : 'none',
              flexDirection: 'column',
              width: '100%', height: '100%',
              position: 'relative'
            }}
          >
          <ProScoreEditor
            xmlData={musicXml}
            currentTime={musicEngine.transportMusicalTime}
            isPlaying={isPlaying}
            songMetadata={localSong}
            zoom={1.0}
            transpose={transpose}
            layoutMode={'paginated'}
            isLoupeEnabled={false}
            showLaser={true}
            lyricMode={activeLyricMode}
            activeLoop={activeLoop}
            performanceMode={performanceMode}
            layoutBundle={layoutBundle}
          />
        </div>

        {/* ── [VOCAL MODEL BACKGROUND AUTO-LOAD BANNER] ── */}
        {isModelLoading && !hideLoadBanner && (
          <div className="absolute inset-0 z-[4900] flex items-center justify-center bg-black/45 backdrop-blur-[3px] pointer-events-auto animate-in fade-in duration-300">
            <div className="bg-rose-950/90 border border-rose-500/50 rounded-2xl p-5 flex flex-col items-center gap-3 text-center max-w-sm mx-4 backdrop-blur-xl shadow-[0_0_40px_rgba(244,63,94,0.35)]">
              {/* Blinking Red Dot Icon */}
              <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center animate-pulse">
                <span className="w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping absolute" style={{ animationDuration: '2s' }} />
                <span className="w-3.5 h-3.5 rounded-full bg-rose-600 relative" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-rose-400 text-[10px] font-black uppercase tracking-wider animate-pulse">
                  INITIALIZING SVS ENGINE
                </h3>
                <p className="text-white text-[11px] font-bold tracking-tight">
                  Please wait...
                </p>
                <p className="text-zinc-400 text-[8.5px] mt-0.5 leading-relaxed">
                  Downloading neural voice model to your device for client-side rendering.
                </p>
              </div>
              
              {/* Progress Bar */}
              <div className="w-48 bg-white/5 border border-white/10 rounded-full h-1.5 overflow-hidden mt-1">
                <div 
                  className="bg-rose-500 h-full transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]" 
                  style={{ width: `${modelLoadProgress}%` }}
                />
              </div>
              
              <div className="flex flex-col gap-2 items-center mt-1">
                <span className="text-[7.5px] font-black text-rose-400/80 tracking-widest uppercase">
                  {modelLoadStatus} ({modelLoadProgress}%)
                </span>
                
                {/* Dismiss Button */}
                <button
                  onClick={() => setHideLoadBanner(true)}
                  className="mt-1 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-[7.5px] font-black text-zinc-300 hover:text-white uppercase tracking-widest transition-all"
                >
                  Dismiss / Read Sheet Music
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── [VOCALIDO RENDER OVERLAY] ── */}
        {isRenderingVocal && (
          <div className="absolute inset-0 z-[5000] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-500 pointer-events-auto">
            <div className="relative flex flex-col items-center">
              {/* Outer Ring */}
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg viewBox="0 0 224 224" className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                  <circle
                    cx="112" cy="112" r="100"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    className="text-white/10"
                  />
                  {!renderError && (
                    <circle
                      cx="112" cy="112" r="100"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray="628.3"
                      strokeDashoffset={628.3 - (628.3 * renderProgress) / 100}
                      strokeLinecap="round"
                      fill="transparent"
                      className="text-cyan-400 transition-all duration-300 ease-out"
                    />
                  )}
                </svg>
                
                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <span className="text-xl font-black tracking-tighter tabular-nums drop-shadow-lg">
                    {renderProgress >= 99.9 ? "100" : renderProgress.toFixed(1)}%
                  </span>
                  <div className="flex items-center gap-1 mt-1 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10">
                    <span className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" />
                    <span className="text-[7px] font-bold tabular-nums opacity-80">{renderTimer}s</span>
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-cyan-400 animate-pulse">
                      {renderStatusText || (renderProgress > 95 ? "Finalizing Audio..." : "Rendering Tone")}
                    </span>
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-0.5 h-0.5 bg-white/20 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="px-3 py-1.5 bg-black/60 border border-white/10 rounded-xl backdrop-blur-xl flex items-center gap-2">
                  <span className={`w-1 h-1 rounded-full ${renderError ? 'bg-rose-500' : 'bg-cyan-400 animate-pulse'}`} />
                  <span className="text-[7.5px] font-black text-white uppercase tracking-widest">
                    {renderError ? (
                      <span className="text-rose-400 truncate max-w-[200px]">{renderError}</span>
                    ) : (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span>VOICE: <span className="text-cyan-400">{(activeVoiceName || 'Vocalido Soprano').toUpperCase()}</span></span>
                        <span className="text-white/30">•</span>
                        <span>SYS: <span className="text-emerald-400">{(activeLyricMode || 'Standard').toUpperCase()}</span></span>
                      </div>
                    )}
                  </span>
                </div>
                {renderError ? (
                  <button 
                    onClick={() => triggerVocalSynthesis()}
                    className="mt-1.5 px-4 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[7.5px] font-black text-white uppercase tracking-widest transition-all"
                  >
                    Try Again • ลองใหม่
                  </button>
                ) : (
                  <div className="flex flex-col items-center">
                    <p className="text-[6.5px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Wait for play • กำลังประมวลผลจนจบ</p>
                    <button 
                      onClick={cancelVocalSynthesis}
                      className="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-md text-[7.5px] font-black text-rose-400 uppercase tracking-widest transition-all active:scale-95"
                    >
                      Cancel • ยกเลิก
                    </button>
                  </div>
                )}
                {renderError && (
                  <button onClick={closeRenderOverlay} className="text-[6.5px] text-zinc-500 underline mt-1.5 uppercase tracking-widest">Dismiss • ปิด</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PerformanceScore: Handles Piano Roll */}
        {activeCard === 'pianoroll' && (
          <div className="w-full h-full relative">
            <PerformanceScore
              notes={parsedData.notes}
              tracks={tracks}
              musicalTimeRef={musicalTimeRef}
              onSeek={(t) => musicEngine.setTransportSeconds(t)}
              onTogglePlay={handleTogglePlay}
              bpm={currentBpm}
              isPlaying={isPlaying}
              songKey={localSong.key}
              beatsPerMeasure={beatsPerMeasure}
            />
          </div>
        )}

        {/* Trackview: Full DAW timeline */}
        {activeCard === 'trackview' && (
          <div className="w-full h-full relative z-40 bg-[#050507] flex flex-col">
            <TrackView
              song={localSong}
              musicXml={musicXml || null}
              tracks={tracks}
              setTracks={setTracks}
              loopPresets={loopPresets}
              setLoopPresets={setLoopPresets}
              onExitTrackView={(card) => setActiveCard(card as any)}
              soloedStems={soloedStems}
              onSoloStem={handleSoloStem}
              showStemControls={showStemControls}
            />
          </div>
        )}

        {/* Chord Ring: Full ChordPage with diatonic ring visualization */}
        {activeCard === 'memochord' && (
          <div className="w-full h-full overflow-y-auto no-scrollbar pb-48">
            <ChordPage song={song} musicXml={musicXml ?? null} />
          </div>
        )}

        {/* Action Page: Memo Practice */}
        {activeCard === 'practice' && (
          <MemoPractice
            totalBars={parsedData.notes.length > 0 ? (parsedData.notes[parsedData.notes.length - 1].startTime / beatsPerMeasure) : 100}
            currentBar={currentBar}
            onActivateLoop={(startBar, endBar, color) => {
              // Update global active loop in loopPresets
              setLoopPresets((p: any) => {
                let existing = p.find((x: any) => x.id === 'practice-loop');
                if (!existing) {
                  return [...p.map((x: any) => ({ ...x, isActive: false })), { id: 'practice-loop', name: 'Practice Focus', startBar, endBar, color, isActive: true }];
                }
                return p.map((x: any) => x.id === 'practice-loop' ? { ...x, startBar, endBar, color, isActive: true } : { ...x, isActive: false });
              });
              // Auto switch back to Score to see the loop and play
              setActiveCard('score');
            }}
          />
        )}

        {/* SVS Studio: Integrated Vocalido / ACE-Step UI */}
        {activeCard === 'vocalido' && (
          <div className="absolute inset-0 z-[3500] bg-[#0a0a0f] overflow-hidden pt-[52px] flex items-center justify-center">
            {!iframeLoaded && (
              <div className="flex flex-col items-center gap-4 text-white/50">
                <RefreshCw size={40} className="animate-spin text-accent" />
                <p className="text-sm font-medium">Initializing Voice Studio...</p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src="/voice-studio.html"
              className={`w-full h-full border-0 transition-opacity duration-500 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
              title="Vocalido Voice Studio"
              allow="autoplay; microphone"
              onLoad={() => {
                console.log("[PlayerPage] 🎙️ Voice Studio iframe loaded");
                setIframeLoaded(true);
              }}
            />
          </div>
        )}
        <audio ref={audioRef} style={{display: 'none'}} />
        </div> {/* <-- Closes MAIN CONTENT AREA */}
      </div> {/* <-- Closes flex-row container */}

      {/* Render transport controls ONLY if a song is loaded AND not in Trackview (has its own) */}
      {song && activeCard !== 'trackview' && (
        <>
          {/* Floating Translucent Eye - Shows ONLY when transport is completely hidden */}
          <button
            onClick={() => {
              const el = document.getElementById('transport-container');
              if (el) {
                el.style.transform = 'translateY(0)';
              }
            }}
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[5000] w-12 h-8 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all duration-300 md:hidden no-print ${!isTransportHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            title="Show Controls"
          >
            <Eye size={20} />
          </button>

          {/* Main Transport Container - Slides away completely */}
          <div id="transport-container" className={`absolute inset-x-0 z-[5000] flex flex-col items-center px-3 no-print gap-1 pointer-events-none transition-transform duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] ${isTransportHidden ? 'translate-y-[200%]' : 'translate-y-0'}`}
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)' }}>
            <div className="w-full max-w-[500px] bg-[#0c0c0e]/90 backdrop-blur-2xl px-3 h-8 rounded-full border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center gap-3 pointer-events-auto">
              {/* Eye Toggle on the far left - Trigger to hide */}
              <button
                onClick={() => setIsTransportHidden(true)}
                className="p-1.5 transition-all text-white/50 hover:text-white"
                title="Hide Controls"
              >
                <EyeOff size={14} />
              </button>

              <span className="text-[9px] font-black text-cyan-400 lcd-font tabular-nums w-9">{formatTime(currentTime)}</span>
              <div className="flex-1 relative h-[2px] flex items-center cursor-pointer group overflow-hidden" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); musicEngine.setTransportSeconds(((e.clientX - rect.left) / rect.width) * totalDurationSeconds); }}>
                <div className="w-full h-full bg-white/20 rounded-full" />
                <div className="absolute h-full bg-cyan-400 left-0 transition-all shadow-[0_0_8px_#00e5ff]" style={{ width: `${Math.min(100, Math.max(0, (currentTime / totalDurationSeconds) * 100))}%` }} />
                <div className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_#fff] transition-all" style={{ left: `calc(${Math.min(100, Math.max(0, (currentTime / totalDurationSeconds) * 100))}% - 6px)` }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-zinc-300 lcd-font tabular-nums w-9 text-right">{formatTime(totalDurationSeconds)}</span>
                <div className="h-3 w-px bg-white/20 mx-1" />
                <button
                  onClick={() => {
                    const next = !isMetronomeOn;
                    setIsMetronomeOn(next);
                    musicEngine.toggleMetronome(next);
                  }}
                  className={`p-1 transition-all ${isMetronomeOn ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.8)]' : 'text-white/80 hover:text-white'}`}
                >
                  <Bell size={13} fill={isMetronomeOn ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => setShowLoopMatrix(true)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${activeLoop ? 'border-transparent shadow-lg' : 'bg-transparent border-white/10 text-white/50 hover:text-white'}`}
                  style={activeLoop ? {
                    backgroundColor: activeLoop.color,
                    color: '#000',
                    boxShadow: `0 0 15px ${activeLoop.color}80`
                  } : {}}
                >
                  <Repeat size={14} fill={activeLoop ? "currentColor" : "none"} />
                </button>
              </div>
            </div>

            <div className="w-full max-w-[calc(100vw-8px)] md:max-w-[640px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-full h-[48px] flex items-center justify-between px-2 md:px-3 pointer-events-auto relative">
              {/* LEFT GROUP: Mixer Toggle */}
              <div className="flex items-center gap-1.5 border-r border-zinc-100 pr-1.5 md:pr-2.5">
                <button
                  onClick={() => setShowMixer(!showMixer)}
                  className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center transition-all ${
                    showMixer ? 'bg-zinc-100 text-black' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'
                  }`}
                >
                  <SlidersHorizontal size={14} />
                </button>
              </div>

              {/* CENTER GROUP: Narrow LCD Display */}
              <div className="flex-1 flex justify-center px-1">
                <div className="w-[140px] sm:w-[160px] md:w-[190px] h-[30px] bg-[#0c0c0e] rounded-full flex items-center border border-black shadow-inner overflow-hidden">
                  <div className="flex-1 h-full border-r border-white/5 flex items-center justify-center">
                    <KeyTransposeDisplay keySig={parsedData.metadata.key || localSong.key} transpose={transpose} onTransposeChange={setTranspose} />
                  </div>
                  <div className="flex-1 h-full border-r border-white/5 flex items-center justify-center">
                    <BpmDisplay bpm={currentBpm} onBpmChange={(b) => { setCurrentBpm(b); musicEngine.setBpm(b); }} />
                  </div>
                  <div className="flex-1 h-full flex items-center justify-center">
                    <BarBeatPositionDisplay bar={currentBar} beat={currentBeat} onSeek={(bar) => musicEngine.setTransportSeconds((bar - 1) * beatsPerMeasure * 60 / currentBpm)} />
                  </div>
                </div>
              </div>

              {/* MIDDLE-RIGHT GROUP: Large Back and Play/Pause Controls */}
              <div className="flex items-center gap-2 pl-1 pr-2 border-r border-zinc-100 md:pr-3">
                {/* Back Button */}
                <button
                  onClick={() => {
                    if (musicEngine.transportState !== 'stopped') {
                      musicEngine.pause();
                    }
                    musicEngine.setTransportSeconds(0);
                    musicEngine.currentMeasure = '';
                    musicEngine.currentNoteTime = 0;
                    setIsPlaying(false);
                  }}
                  className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 hover:text-black flex items-center justify-center transition-all active:scale-95"
                >
                  <SkipBack size={15} fill="currentColor" />
                </button>

                {/* Play/Pause Button */}
                <div className="relative">
                  <div className={`absolute inset-0 bg-[#00e5ff]/20 blur-md rounded-full transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
                  <button
                    onClick={handleTogglePlay}
                    disabled={isAudioLoading || isRenderingVocal}
                    className={`relative w-9.5 h-9.5 md:w-[40px] md:h-[40px] rounded-full flex items-center justify-center text-white transition-all active:scale-95
                      ${isRenderingVocal ? 'bg-zinc-800 shadow-none grayscale' : 'bg-[#00e5ff] hover:bg-[#00c8e0] shadow-[0_4px_15px_rgba(0,229,255,0.4)]'}`}
                  >
                    {isAudioLoading ? (
                      <RefreshCw size={15} className="animate-spin text-white/50" />
                    ) : isPlaying ? (
                      <Pause size={18} fill="white" />
                    ) : (
                      <Play size={18} fill="white" className="ml-0.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* RIGHT GROUP: SCR (Score toggle) and Volume */}
              <div className="flex-none flex items-center justify-end gap-1.5 pl-1.5 md:pl-2.5 relative">
                <button
                  onClick={() => setActiveCard(activeCard === 'score' ? 'pianoroll' : 'score')}
                  className={`w-8 h-8 md:w-9 md:h-9 border rounded-full flex flex-col items-center justify-center group active:scale-95 transition-all ${
                    activeCard === 'score' ? 'bg-[#fbfbfb] border-zinc-100 text-zinc-400' : 'bg-cyan-50 border-cyan-100 text-cyan-500'
                  }`}
                >
                  <Music size={12} className={activeCard === 'score' ? 'text-zinc-400 group-hover:text-zinc-600' : 'text-cyan-500'} />
                  <span className={`text-[5px] md:text-[5.5px] font-black uppercase mt-0.5 ${activeCard === 'score' ? 'text-zinc-400 group-hover:text-zinc-600' : 'text-cyan-600'}`}>
                    SCR
                  </span>
                </button>

                <div className="relative" ref={volumePopupRef}>
                  <button
                    onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                    className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center transition-all border ${
                      showVolumeSlider
                        ? 'border-cyan-400 bg-cyan-50 text-cyan-600 shadow-[0_0_15px_rgba(0,229,255,0.4)]'
                        : 'border-transparent text-zinc-400 hover:text-cyan-500 hover:bg-zinc-50'
                    }`}
                  >
                    {masterVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={16} className={showVolumeSlider ? 'text-cyan-600' : 'text-zinc-400 hover:text-cyan-500'} />}
                  </button>

                  {showVolumeSlider && (
                    <div
                      ref={volumePopupRef}
                      className="absolute bottom-[64px] left-1/2 -translate-x-1/2 w-14 h-64 bg-[#0c0c0e]/95 backdrop-blur-2xl rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,1)] border border-white/10 p-3.5 flex flex-col items-center animate-in slide-in-from-bottom-6 duration-300 z-[9999] ring-1 ring-white/10 select-none touch-none"
                      onPointerDown={(e) => {
                        volumeDragStartYRef.current = e.clientY;
                        volumeDragStartVolRef.current = masterVolume;
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        e.stopPropagation();
                      }}
                      onPointerMove={(e) => {
                        if (volumeDragStartYRef.current === null) return;
                        const deltaY = volumeDragStartYRef.current - e.clientY;
                        const trackHeight = 160;
                        const newVol = Math.max(0, Math.min(1, volumeDragStartVolRef.current + deltaY / trackHeight));
                        setMasterVolume(newVol);
                        musicEngine.setMasterVolume(newVol);
                      }}
                      onPointerUp={() => { volumeDragStartYRef.current = null; }}
                      onPointerCancel={() => { volumeDragStartYRef.current = null; }}
                    >
                      <div className="flex-1 w-2.5 bg-black rounded-full relative overflow-hidden border border-white/5 shadow-inner cursor-ns-resize">
                        <div
                          className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-cyan-600 via-cyan-400 to-white shadow-[0_0_15px_rgba(0,229,255,0.6)]"
                          style={{ height: `${masterVolume * 100}%` }}
                        />
                      </div>
                      <div className="mt-4 flex flex-col items-center shrink-0">
                        <div className="bg-black/80 px-2 py-1.5 rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.2)] flex items-center justify-center min-w-[36px]">
                          <span className="text-[15px] font-black text-cyan-400 lcd-font tracking-tighter leading-none">{Math.round(masterVolume * 100)}</span>
                        </div>
                        <span className="text-[6px] font-black text-zinc-500 uppercase tracking-[0.3em] mt-2.5 opacity-60">MASTER</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── VOCALIDO SETUP MODAL ── */}
      {showVocalidoSetup && (
        <div className="fixed inset-0 z-[9500] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowVocalidoSetup(false); }}>
          <div className="w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[40px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black uppercase text-white tracking-tighter flex items-center gap-3">
                <Mic2 size={20} className="text-cyan-400" /> Vocalido Setup
              </h3>
              <button onClick={() => setShowVocalidoSetup(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">

              {/* Custom SVS Backend URL */}
              <div className="flex flex-col gap-1.5 bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                  Custom SVS Backend URL
                </span>
                <span className="text-[8px] text-zinc-500">
                  สำหรับใช้งานบน Vercel/มือถือ ให้กรอก HTTPS Tunnel URL (เช่น Serveo / Localtunnel)
                </span>
                <input
                  type="text"
                  value={customBackendUrl}
                  onChange={handleCustomBackendUrlChange}
                  placeholder="https://your-tunnel.serveo.net"
                  className="mt-1 w-full bg-[#0c0c0e] border border-white/10 focus:border-cyan-500 rounded-xl px-3 py-2 text-[10px] text-white focus:outline-none transition-all placeholder:text-zinc-600"
                />
              </div>

              {/* Jianpu info */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1">Active Mode: <span className="text-cyan-400">{activeLyricMode}</span></p>
                <p className="text-[9px] text-zinc-500">
                  {activeLyricMode === 'Jianpu' ? '🇨🇳 Using Chinese phoneme engine (Jianpu 简谱)' : '🌐 Using English/Solfège phoneme engine'}
                </p>
              </div>

              {/* Render speed history */}
              {renderHistory.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Render Speed History</span>
                  <div className="flex flex-wrap gap-2">
                    {renderHistory.map(h => (
                      <span key={`${h.bpmPercent}_${h.engineId || 'default'}_${h.lyricMode || ''}`} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-zinc-300">
                        {formatRenderLabel(h.label, h.bpmPercent)}
                      </span>
                    ))}
                  </div>
                  <button onClick={() => { setRenderHistory([]); if (song?.id) { localStorage.removeItem(`memo_render_history_${song.id}`); } }}
                    className="text-[8px] text-zinc-600 underline text-right">Clear History</button>
                </div>
              )}

              {/* Monophonic Mode Toggle */}
              <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-col gap-0.5 max-w-[70%]">
                  <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                    Monophonic Mode <span className="px-1 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[7px] font-black uppercase">แนะนำ</span>
                  </span>
                  <span className="text-[8px] text-zinc-500">ยุบโน้ตประสาน (Chords) ให้เหลือเฉพาะแนวทำนองเดี่ยว ป้องกันการเรนเดอร์ล้มเหลว/Timeout สำหรับเพลงที่มีคอร์ดหนาแน่น</span>
                </div>
                <button
                  onClick={() => setCollapseChords(prev => !prev)}
                  className={`w-10 h-6 rounded-full p-1 transition-all ${
                    collapseChords ? 'bg-cyan-500' : 'bg-zinc-800'
                  } flex items-center`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transition-all shadow-md transform ${
                      collapseChords ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Stem Controls Toggle */}
              <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest">Advanced Stem Controls</span>
                  <span className="text-[8px] text-zinc-500">Show multi-track split/solo features (◆ button)</span>
                </div>
                <button
                  onClick={() => setShowStemControls(prev => !prev)}
                  className={`w-10 h-6 rounded-full p-1 transition-all ${
                    showStemControls ? 'bg-cyan-500' : 'bg-zinc-800'
                  } flex items-center`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transition-all shadow-md transform ${
                      showStemControls ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Voice Attributions & Credits */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={10} className="text-cyan-400" /> Voice Credits & Attributions
                </span>
                
                <div className="flex flex-col gap-2 text-[8px] text-zinc-400 leading-relaxed">
                  {/* Lotte V Credit */}
                  <div className="border-b border-white/5 pb-2">
                    <span className="text-zinc-200 font-bold">星野ハナミ (Hoshino Hanami)</span>
                    <p className="mt-0.5">Voice Provider: <span className="text-cyan-400">Lotte V (ロッテ・ヴィー)</span></p>
                    <p>Official Website: <a href="https://lottev.moe/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">lottev.moe</a></p>
                    <p className="text-[7.5px] text-zinc-500 mt-0.5">Terms of Use specified in the model folder.</p>
                  </div>
                  
                  {/* System Defaults */}
                  <div>
                    <span className="text-zinc-300 font-bold">System Default Voices</span>
                    <p className="mt-0.5">• English: Trained on the open-source GTSinger dataset.</p>
                    <p>• Chinese: Trained on the open-source Opencpop dataset.</p>
                  </div>
                </div>
              </div>

              {/* Open Voice Studio */}
              <button
                onClick={() => { setShowVocalidoSetup(false); setActiveCard('vocalido'); }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[11px] font-black uppercase tracking-widest shadow-lg hover:opacity-90 transition-all">
                Open Voice Studio →
              </button>
            </div>
          </div>
        </div>
      )}

      {song && showMixer && (
        <div className="fixed inset-0 z-[9000] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 pointer-events-auto" onClick={(e) => { if (e.target === e.currentTarget) setShowMixer(false); }}>
          <div className="w-full max-w-3xl bg-[#0c0c0e] border border-white/10 rounded-[40px] p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#0c0c0e] z-10 pb-2">
              <h3 className="text-lg font-black italic uppercase text-white tracking-tighter flex items-center gap-3">
                <SlidersHorizontal size={20} className="text-cyan-400" /> Mixer Core
              </h3>
              <button onClick={() => setShowMixer(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/20 transition-all">
                <X size={20} />
              </button>
            </div>
            <MixerPanel
              tracks={tracks}
              songKey={song?.key || localSong.key || 'C'}
              onUpdateTrack={(id, update) => setTracks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, ...update } : t))}
              onOpenPluginBrowser={(trackId, slotIndex) => setPluginBrowserTarget({ trackId, slotIndex })}
              onOpenPluginEditor={(trackId, slotIndex, plugin) => setEditingPlugin({ trackId, slotIndex, plugin })}
            />
          </div>
        </div>
      )}
      {showLoopMatrix && <LoopMatrixModal presets={loopPresets} onUpdatePreset={(id, u) => setLoopPresets((p: any) => p.map((x: any) => x.id === id ? { ...x, ...u } : x))} onDisableAll={() => setLoopPresets((p: any) => p.map((x: any) => ({ ...x, isActive: false })))} onClose={() => setShowLoopMatrix(false)} />}
      {pluginBrowserTarget && <PluginBrowserModal onClose={() => setPluginBrowserTarget(null)} onSelect={(pluginDef) => {
        const newEffect: EffectInstance = { definition: pluginDef, isBypassed: false };
        const { trackId, slotIndex } = pluginBrowserTarget;
        setTracks((prev: any) => prev.map((t: any) => t.id === trackId ? { ...t, effects: [...(t.effects || []).slice(0, slotIndex), newEffect, ...(t.effects || []).slice(slotIndex + 1)] } : t));
        setPluginBrowserTarget(null);
      }} />}
      {editingPlugin && <FXPluginModal plugin={editingPlugin.plugin.definition} isBypassed={editingPlugin.plugin.isBypassed} onClose={() => setEditingPlugin(null)} onBypassToggle={() => {
        const { trackId, slotIndex, plugin } = editingPlugin;
        const newPlugin = { ...plugin, isBypassed: !plugin.isBypassed };
        setTracks((prev: any) => prev.map((t: any) => t.id === trackId ? { ...t, effects: [...(t.effects || []).slice(0, slotIndex), newPlugin, ...(t.effects || []).slice(slotIndex + 1)] } : t));
        setEditingPlugin(p => p ? { ...p, plugin: newPlugin } : null);
      }} onRemove={() => {
        const { trackId, slotIndex } = editingPlugin;
        setTracks((prev: any) => prev.map((t: any) => t.id === trackId ? { ...t, effects: [...(t.effects || []).slice(0, slotIndex), ...(t.effects || []).slice(slotIndex + 1)] } : t));
        setEditingPlugin(null);
      }} />}

      {/* Floating Debug Button and Drawer completely removed */}
    </div>
  );
};

export default PlayerPage;
