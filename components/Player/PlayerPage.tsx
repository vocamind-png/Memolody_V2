
import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
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
import type { LoopPreset } from './LoopMatrixModal';
const LoopMatrixModal = lazy(() => import('./LoopMatrixModal'));
import PluginBrowserModal from './PluginBrowserModal';
import FXPluginModal from './FXPluginModal';
const MemoPractice = lazy(() => import('./MemoPractice'));
const ChordPage = lazy(() => import('../Chord/ChordPage'));
const AudioEngineSettings = lazy(() => import('../Settings/AudioEngineSettings'));
import { musicEngine } from '../../lib/MusicEngine';
import { getChromaticSolfege } from '../../lib/SolfegeLogic';
import { Song, TrackState, EffectInstance, LyricMode, SongFolder } from '../../types';
import { songStorage } from '../../lib/SongStorage';
import { nimoBrain } from '../../lib/NimoBrain';
import { useAuth } from '../../lib/useAuth';
import { clientSvsEngine } from '../../lib/ClientSvsEngine';
import { AudioBlobCache } from '../../lib/AudioBlobCache';
import { vocalidoRenderService } from '../../lib/VocalidoRenderService';

export type PlayerCardType = 'score' | 'pianoroll' | 'trackview' | 'memochord' | 'practice' | 'vocalido';

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

const restoreCachedBlobs = async (songId: string, history: any[]): Promise<any[]> => {
  try {
    const updatedHistory = await Promise.all(history.map(async (entry) => {
      const tfStr = entry.timingFeel !== undefined ? `_tf${entry.timingFeel}` : '';
      const v2Str = entry.version >= 2 ? '_v2' : '';
      const entryKey = `${entry.bpmPercent}_${entry.songKey}_${entry.engineId || 'default'}_${entry.lyricMode || ''}_${entry.voiceName || 'Auto'}${tfStr}${v2Str}`;
      const cacheKey = `vocal_render_${songId}_${entryKey}`;
      
      const mainBlob = await AudioBlobCache.get(cacheKey);
      let updatedAudioUrl = entry.audioUrl;
      if (mainBlob) {
        updatedAudioUrl = URL.createObjectURL(mainBlob);
        (entry as any).isActiveBlob = true;
        console.log(`[AudioBlobCache] Restored main cached render for ${entryKey}`);
      }

      let updatedStemUrls = entry.savedStemUrls || [];
      if (updatedStemUrls.length > 0) {
        const restoredStems = await Promise.all(updatedStemUrls.map(async (sUrl: string, idx: number) => {
          const stemBlob = await AudioBlobCache.get(`${cacheKey}_stem_${idx}`);
          if (stemBlob) {
            console.log(`[AudioBlobCache] Restored stem ${idx} for ${entryKey}`);
            return URL.createObjectURL(stemBlob);
          }
          return sUrl;
        }));
        updatedStemUrls = restoredStems;
      }

      // Also update stemsByTrack to use the fresh blob URLs from IndexedDB
      let updatedStemsByTrack = entry.stemsByTrack || {};
      if (updatedStemUrls.length > 0 && Object.keys(updatedStemsByTrack).length > 0) {
        updatedStemsByTrack = { ...updatedStemsByTrack };
        for (const tid of Object.keys(updatedStemsByTrack)) {
          const trackStems = updatedStemsByTrack[tid];
          if (Array.isArray(trackStems)) {
            updatedStemsByTrack[tid] = trackStems.map((oldUrl: string) => {
              // Find the exact stem index from the original saved URLs array
              const stemIdx = (entry.savedStemUrls || []).indexOf(oldUrl);
              return stemIdx >= 0 && stemIdx < updatedStemUrls.length ? updatedStemUrls[stemIdx] : oldUrl;
            });
          }
        }
        console.log(`[AudioBlobCache] Updated stemsByTrack with ${updatedStemUrls.length} restored URLs`);
      }

      return {
        ...entry,
        audioUrl: updatedAudioUrl,
        savedStemUrls: updatedStemUrls,
        stemsByTrack: updatedStemsByTrack
      };
    }));
    return updatedHistory;
  } catch (e) {
    console.warn('[AudioBlobCache] Failed to restore cached blobs:', e);
    return history;
  }
};

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
  if (path.startsWith('blob:') || path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
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

// ── RunPod Serverless SVS is disabled. Pure on-device rendering only. ──────

const fixAudioUrl = (u: string) => {
  if (typeof u !== 'string') return u;
  if (u.startsWith('blob:') || u.startsWith('data:')) return u;
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

const getVoiceModelUrl = (path: string) => {
  // If we are on production Vercel (no custom backend URL and hostname is not local),
  // return the relative path directly so it uses Vercel same-origin edge rewrites (avoiding CORS/COEP blocks).
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
    const hasCustom = !!getCustomBackendUrl();
    if (!isLocal && !hasCustom && path.startsWith('/vocalido/voicebanks/')) {
      return path;
    }
  }
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

const PlayerPage: React.FC<{
  song: Song | null; musicXml?: string | null; layoutBundle?: any | null; tracks: TrackState[]; setTracks: any;
  viewMode: any; setViewMode: any; isPreviewMode?: boolean;
  loopPresets: LoopPreset[]; setLoopPresets: any;
  performanceMode?: boolean;
  vocalidoAutoRender?: boolean;
  autoPlay?: boolean;           // ← auto-start playback after OMR import
  onAutoPlayConsumed?: () => void; // ← clears the flag in App.tsx
  onSongUpdate?: (updatedSong: Song) => void;
  onNavigate?: (view: any) => void;
}> = ({ song, musicXml, layoutBundle, tracks, setTracks, viewMode = 'score', setViewMode, loopPresets, setLoopPresets, performanceMode, vocalidoAutoRender, autoPlay, onAutoPlayConsumed, onSongUpdate, onNavigate }) => {
  const { authUser } = useAuth();
  const isFree = (() => {
    const storedTier = typeof window !== 'undefined' ? localStorage.getItem('mock_membership_tier') : null;
    if (storedTier && storedTier !== 'free') return false;
    if (!authUser) return true;
    return authUser.membershipTier === 'free';
  })();
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
      if (typeof window !== 'undefined') {
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        const lowCores = (navigator.hardwareConcurrency || 4) <= 4;
        const lowMemory = ((navigator as any).deviceMemory || 8) <= 4;
        if (isMobile || lowCores || lowMemory) {
          console.log('[PlayerPage] 📱 Mobile or low-end device detected, forcing Server-side (vocalido) rendering');
          localStorage.setItem('vocalido_svs_engine', 'vocalido');
          return 'vocalido';
        }
      }
      const saved = localStorage.getItem('vocalido_svs_engine');
      if (saved === 'vocalido' || saved === 'browser-ai') {
        return saved;
      }
    } catch (e) {}
    return 'vocalido';
  });


  const handleSvsEngineChange = (engine: 'vocalido' | 'browser-ai') => {
    setSvsEngine(engine);
    try {
      localStorage.setItem('vocalido_svs_engine', engine);
    } catch (e) {}
  };

  const [svsSteps, setSvsSteps] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vocalido_svs_steps');
      if (saved) {
        const val = parseInt(saved, 10);
        if ([6, 10, 20, 40].includes(val)) return val;
      }
    } catch (e) {}
    
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isLocalIp = 
        hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname.endsWith('.local') ||
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile && !isLocalIp) {
        return 20; // Default to HD (20 steps) on mobile for good quality
      }
    }
    return 40; // Default to Studio (40 steps) on desktop/local
  });

  const handleSvsStepsChange = (steps: number) => {
    setSvsSteps(steps);
    try {
      localStorage.setItem('vocalido_svs_steps', steps.toString());
    } catch (e) {}
  };

  const [svsTimingFeel, setSvsTimingFeel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vocalido_svs_timing_feel');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val <= 100) return val;
      }
    } catch (e) {}
    return 50; // Default to 50% (Balanced)
  });

  const handleSvsTimingFeelChange = (val: number) => {
    setSvsTimingFeel(val);
    try {
      localStorage.setItem('vocalido_svs_timing_feel', val.toString());
    } catch (e) {}
  };

  const [svsPortamento, setSvsPortamento] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vocalido_portamento');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val <= 300) return val;
      }
    } catch (e) {}
    return 120; // Default 120ms
  });

  const handleSvsPortamentoChange = (val: number) => {
    setSvsPortamento(val);
    try { localStorage.setItem('vocalido_portamento', val.toString()); } catch (e) {}
  };

  const [zoomLevel, setZoomLevel] = useState(1.0);

  const [svsVibratoStart, setSvsVibratoStart] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vocalido_vibrato_start');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val <= 1000) return val;
      }
    } catch (e) {}
    return 100; // Default 100ms delay
  });

  const handleSvsVibratoStartChange = (val: number) => {
    setSvsVibratoStart(val);
    try { localStorage.setItem('vocalido_vibrato_start', val.toString()); } catch (e) {}
  };

  const [svsVibratoDepth, setSvsVibratoDepth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vocalido_vibrato_depth');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val <= 100) return val;
      }
    } catch (e) {}
    return 0; // Default 0 (Off)
  });

  const handleSvsVibratoDepthChange = (val: number) => {
    setSvsVibratoDepth(val);
    try { localStorage.setItem('vocalido_vibrato_depth', val.toString()); } catch (e) {}
  };

  const [svsVibratoSpeed, setSvsVibratoSpeed] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vocalido_vibrato_speed');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 1.0 && val <= 8.0) return val;
      }
    } catch (e) {}
    return 4.8; // Default 4.8 Hz
  });

  const handleSvsVibratoSpeedChange = (val: number) => {
    setSvsVibratoSpeed(val);
    try { localStorage.setItem('vocalido_vibrato_speed', val.toString()); } catch (e) {}
  };

  // Keep the user's preferred SVS engine (migrates legacy states).
  useEffect(() => {
    try {
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
  const [renderedTranspose, setRenderedTranspose] = useState(0);
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

  const [showRenderPrompt, setShowRenderPrompt] = useState(false);
  const [modalSelectedTracks, setModalSelectedTracks] = useState<string[]>([]);
  const [showAdvancedRenderSettings, setShowAdvancedRenderSettings] = useState(false);
  const hasPromptedRenderRef = useRef(false);

  useEffect(() => {
    if (showRenderPrompt && tracks.length > 0) {
      setModalSelectedTracks([tracks[0].id]);
    }
  }, [showRenderPrompt, tracks]);

  useEffect(() => {
    setShowRenderPrompt(false);
    hasPromptedRenderRef.current = false;
  }, [song?.id]);

  // Subscribe to background rendering service updates
  useEffect(() => {
    const handleStateChange = (state: any) => {
      if (state.activeSongId === song?.id || !state.activeSongId) {
        setIsRenderingVocal(state.isRendering);
        setRenderProgress(state.progress);
        setRenderTimer(state.timer);
        setRenderStatusText(state.statusText);
        setRenderError(state.error);
        if (state.activeRenderKey) {
          setActiveRenderKey(state.activeRenderKey);
        }
      }
    };
    vocalidoRenderService.subscribe(handleStateChange);
    return () => {
      vocalidoRenderService.unsubscribe(handleStateChange);
    };
  }, [song?.id]);

  // Synchronize component states when rendering completes
  const prevIsRenderingRef = useRef(false);
  useEffect(() => {
    if (prevIsRenderingRef.current && !isRenderingVocal) {
      // Synthesis finished
      const activeKey = vocalidoRenderService.activeRenderKey || localStorage.getItem(`active_render_key_${song?.id}`);
      if (activeKey && !renderError) {
        try {
          setActiveRenderKey(activeKey);
          setRenderedTranspose(transpose);
          
          const localHist = localStorage.getItem(`memo_render_history_${song?.id}`);
          if (localHist) {
            const parsed = JSON.parse(localHist);
            if (Array.isArray(parsed)) {
              const mapped = parsed.map((h: any) => ({
                ...h,
                lyricMode: mapToLyricMode(h.lyricMode),
              }));
              restoreCachedBlobs(song!.id, mapped).then(setRenderHistory);
            }
          }
          
          const savedTracks = localStorage.getItem(`tracks_state_${song?.id}`);
          if (savedTracks) {
            setTracks(JSON.parse(savedTracks));
          }
          
          setActiveCard('score');
          
          // Update availableStems so the ◆ Stem Solo buttons appear if needed
          const newAvailableStems: Record<string, number> = {};
          // Check all vocal tracks that have audio elements loaded (public API)
          musicEngine.vocalAudioElements.forEach((_, tid) => {
            const count = musicEngine.getAvailableStems(tid);
            if (count > 0) newAvailableStems[tid] = count;
          });
          if (Object.keys(newAvailableStems).length > 0) {
            setAvailableStems(newAvailableStems);
            setSoloedStems({});
          }
        } catch (e) {
          console.warn('[PlayerPage] Failed to sync completed render state:', e);
        }
      }
    }
    prevIsRenderingRef.current = isRenderingVocal;
  }, [isRenderingVocal, renderError, song?.id, setTracks]);

  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [modelLoadStatus, setModelLoadStatus] = useState('');
  const [hideLoadBanner, setHideLoadBanner] = useState(false);
  const [isServerOnline, setIsServerOnline] = useState(false);

  // Safety watchdog: Force reset isAudioLoading to false if it remains true for more than 15 seconds
  useEffect(() => {
    if (!isAudioLoading) return;
    const timeoutId = setTimeout(() => {
      setIsAudioLoading(prev => {
        if (prev) {
          console.warn("[PlayerPage] ⚠️ Global watchdog: force-resetting isAudioLoading after 15s");
          return false;
        }
        return prev;
      });
    }, 15000);
    return () => clearTimeout(timeoutId);
  }, [isAudioLoading]);

  // Safety watchdog: Force reset isRenderingVocal to false if it remains true for more than 5 minutes
  useEffect(() => {
    if (!isRenderingVocal) return;
    const timeoutId = setTimeout(() => {
      setIsRenderingVocal(prev => {
        if (prev) {
          console.warn("[PlayerPage] ⚠️ Global watchdog: force-resetting isRenderingVocal after 300s");
          return false;
        }
        return prev;
      });
    }, 300000);
    return () => clearTimeout(timeoutId);
  }, [isRenderingVocal]);

  // Debug Log Catcher State removed

  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    let logQueue: { type: string; message: string }[] = [];
    let isSending = false;
    let hasServerFailed = false;
    let flushTimeout: NodeJS.Timeout | null = null;

    const flushLogs = () => {
      if (isSending || logQueue.length === 0 || hasServerFailed) return;
      isSending = true;
      const batchToSend = [...logQueue];
      logQueue = [];



      svsFetch(getFetchUrl('/studio/api/client-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: batchToSend })
      })
      .catch(err => {
        hasServerFailed = true; // Stop trying to send logs if the server is offline
      })
      .finally(() => {
        isSending = false;
        if (logQueue.length > 0 && !hasServerFailed) {
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
    
    // Dispatch event to trigger connection check
    window.dispatchEvent(new Event('vocalido_backend_url_changed'));
  };
  // SVS Engine: Vocalido only (ACE-Step removed)
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const [pluginBrowserTarget, setPluginBrowserTarget] = useState<{ trackId: string; slotIndex: number } | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<{ trackId: string; slotIndex: number; plugin: EffectInstance } | null>(null);
  const [synthProgress, setSynthProgress] = useState<{songId: string, progress: number, status: string} | null>(null);

  // Voice Engines State
  const [voiceEngines, setVoiceEngines] = useState<{id: string, name: string, type: string, lang: string, model_files?: any}[]>([]);
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

    const selectedVoice = voiceEngines.find(v => v.id === activeEngineId);
    if (!selectedVoice || !selectedVoice.model_files) {
      return;
    }

    let active = true;
    const preloadModel = async () => {
      try {
        setIsModelLoading(true);
        setHideLoadBanner(false); // Reset dismissal on model change
        setModelLoadStatus('⚡ Loading AI Engine...');
        setModelLoadProgress(0);

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

        await clientSvsEngine.loadVoice(selectedVoice.id, modelFiles, (prog) => {
          if (active) {
            setModelLoadStatus(prog.message);
            setModelLoadProgress(prog.progress);
            if (prog.stage === 'ready') {
              setIsModelLoading(false);
              if (!hasPromptedRenderRef.current) {
                hasPromptedRenderRef.current = true;
                // Only prompt for songs that have never been rendered before
                const songIdForHist = song?.id || '_unsaved_';
                const histStr = localStorage.getItem(`memo_render_history_${songIdForHist}`);
                const hasExistingRender = histStr ? (JSON.parse(histStr) || []).length > 0 : false;
                if (!hasExistingRender) {
                  setModalSelectedTracks(tracks.map(t => t.id));
                  setShowRenderPrompt(true);
                }
              }
              // Auto-hide banner faster if everything was from cache
              const stats = clientSvsEngine.lastLoadStats;
              if (stats.downloaded === 0 && stats.cached > 0) {
                setTimeout(() => setHideLoadBanner(true), 1200);
              }
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
  }, [activeEngineId, voiceEngines, svsEngine]);

  // Show prompt if using vocalido server, server is online, and song has never been rendered before
  useEffect(() => {
    const songId = song?.id || '_unsaved_';
    if (svsEngine === 'vocalido' && isServerOnline) {
      if (!hasPromptedRenderRef.current) {
        hasPromptedRenderRef.current = true;
        const histStr = localStorage.getItem(`memo_render_history_${songId}`);
        const hasExistingRender = histStr ? (JSON.parse(histStr) || []).length > 0 : false;
        if (!hasExistingRender) {
          const timer = setTimeout(() => {
            setModalSelectedTracks(tracks.map(t => t.id));
            setShowRenderPrompt(true);
          }, 1000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [svsEngine, isServerOnline, song?.id]);

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
  // ── Guard: prevent saving empty [] to localStorage before restore completes ──
  const isHistoryRestoredRef = useRef(false);
  // ── Persist render history to localStorage whenever it changes (song-specific) ──
  useEffect(() => {
    const songId = song?.id || '_unsaved_';
    // Only save after history has been restored (prevents wiping existing data on mount)
    if (!isHistoryRestoredRef.current) return;
    try {
      localStorage.setItem(`memo_render_history_${songId}`, JSON.stringify(renderHistory));
    } catch (e) {}
  }, [renderHistory, song?.id]);

  // Vocalido Setup modal
  const [showVocalidoSetup, setShowVocalidoSetup] = useState(false);
  const [cacheClearedText, setCacheClearedText] = useState(false);
  const [showStemControls, setShowStemControls] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('memo_show_stem_controls');
      if (stored === 'false') {
        localStorage.setItem('memo_show_stem_controls', 'true');
      }
      return true;
    } catch (e) {
      return true;
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
      return val === 'true'; // default is false (Auto Polyphony)
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('vocalido_collapse_chords', collapseChords ? 'true' : 'false');
    } catch (e) {}
  }, [collapseChords]);
  // Per-track vocal: muted tracks use piano
  const [mutedVocalTracks, setMutedVocalTracks] = useState<Set<string>>(new Set());
  const [soloedTracks, setSoloedTracks] = useState<Set<string>>(new Set());
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
    console.log("[PlayerPage] ▶️ handleTogglePlay ENTERED. isAudioLoading:", isAudioLoading);
    if (isAudioLoading) {
      console.warn("[PlayerPage] ⛔ handleTogglePlay BLOCKED by isAudioLoading=true");
      return;
    }
    
    // 🔊 CRITICAL: Start/Resume Tone.js context SYNCHRONOUSLY in user gesture
    try {
      const context = Tone.getContext();
      console.log("[PlayerPage] AudioContext state BEFORE resume:", context.state);
      if (context.state !== 'running') {
        Tone.start();
        context.resume();
      }
      
      // Unlock all active vocal audio elements synchronously inside the user gesture
      if (tracks) {
        tracks.forEach(t => {
          musicEngine.unlockVocalAudio(t.id);
        });
      }
    } catch (err) {
      console.warn("[PlayerPage] Direct context resume/unlock failed:", err);
    }

    const tState = musicEngine.transportState;
    console.log("[PlayerPage] Transport state:", tState, "| isSongLoaded:", musicEngine.isSongLoaded, "| lastLoadedNotes:", musicEngine.lastLoadedNotes.length, "| parsedData.notes:", parsedData.notes.length);

    // 1. If playing, pause immediately (fully synchronous)
    if (tState === 'started') {
      console.log("[PlayerPage] ⏸ Pausing playback...");
      musicEngine.pause();
      setIsPlaying(false);
      setIsAudioLoading(false);
      return;
    }

    // 2. If paused, resume immediately (fully synchronous)
    if (tState === 'paused') {
      const currentPos = musicEngine.transportSeconds;
      if (currentPos >= totalDurationSeconds - 0.2) {
        console.log("[PlayerPage] Near end of song, resetting to 0 before play");
        musicEngine.setTransportSeconds(0);
        musicEngine.currentMeasure = '';
        musicEngine.currentNoteTime = 0;
      }

      console.log("[PlayerPage] ▶️ Resuming playback synchronously...");
      musicEngine.resume();
      setIsPlaying(true);
      setIsAudioLoading(false);
      return;
    }

    // 3. Guard: no notes to play
    if (!parsedData.notes || parsedData.notes.length === 0) {
      console.error("[PlayerPage] ❌ Cannot play: parsedData.notes is EMPTY! musicXml length:", musicXml?.length || 0);
      return;
    }

    // 4. Build updated track list — if tracks are empty, generate them inline (race condition fix)
    let effectiveTracks = tracks;
    if (effectiveTracks.length === 0 && parsedData.partNames && Object.keys(parsedData.partNames).length > 0) {
      console.warn("[PlayerPage] ⚠️ tracks state is EMPTY! Auto-generating tracks inline from parsedData.partNames...");
      const partIds = Object.keys(parsedData.partNames);
      effectiveTracks = partIds.map((id, index) => ({
        id,
        name: parsedData.partNames[id] || `Track ${index + 1}`,
        volume: 0.8,
        pan: 0,
        isMuted: false,
        isSolo: false,
        mode: 'instrument' as 'instrument' | 'vocal',
        instrument: 'Piano',
        lyricMode: 'British Fixed Doh' as any,
        engineId: activeEngineId,
        effects: Array(6).fill(null),
        pluginSettings: undefined
      }));
      // Also update the state so future clicks don't need this fallback
      setTracks(effectiveTracks as any);
    }

    const updatedTracks = effectiveTracks.map(t => ({
      ...t,
      mode: (mutedVocalTracks.has(t.id) ? 'instrument' : t.mode) as 'instrument' | 'vocal'
    }));
    
    console.log("[PlayerPage] updatedTracks:", updatedTracks.length, updatedTracks.map(t => `${t.id}:${t.mode}`).join(', '));
    musicEngine.setBpm(currentBpm);

    // 5. If song is already loaded, start immediately (sync path)
    if (musicEngine.isSongLoaded && musicEngine.lastLoadedNotes.length > 0) {
      console.log("[PlayerPage] ▶️ Song already loaded. Starting immediately...");
      musicEngine.updateTrackStates(updatedTracks);
      musicEngine.start();
      setIsPlaying(true);
      setIsAudioLoading(false);
      console.log("[PlayerPage] ✅ Started (cached path). Transport:", musicEngine.transportState);
      return;
    }

    // 6. Async path: load then start
    console.log("[PlayerPage] 📥 Song not loaded yet. Entering async load path...");
    setIsAudioLoading(true);

    const safetyTimeoutId = setTimeout(() => {
      console.warn("[PlayerPage] ⚠️ Safety timeout (15s): force-resetting isAudioLoading");
      setIsAudioLoading(false);
    }, 15000);

    try {
      // Step A: Ensure AudioContext is running
      try {
        console.log("[PlayerPage] Step A: Resuming AudioContext...");
        await Promise.race([
          Promise.all([
            Tone.start(),
            Tone.getContext().state !== 'running' ? Tone.getContext().resume() : Promise.resolve()
          ]),
          new Promise((resolve) => setTimeout(resolve, 2000))
        ]);
        console.log("[PlayerPage] Step A done. AudioContext state:", Tone.getContext().state);
      } catch (audioCtxError) {
        console.warn("[PlayerPage] Step A failed (non-fatal):", audioCtxError);
      }
      
      // Step B: Set volume
      musicEngine.setMasterVolume(masterVolume);

      // Step C: Load song
      console.log("[PlayerPage] Step C: Loading song...", { notes: allPlayableNotes.length, tracks: updatedTracks.length, transpose, isMetronomeOn });
      await musicEngine.loadSong(allPlayableNotes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn);
      console.log("[PlayerPage] Step C done. isSongLoaded:", musicEngine.isSongLoaded, "currentPart exists:", !!musicEngine.isSongLoaded);

      // Step D: Start playback
      console.log("[PlayerPage] Step D: Starting MusicEngine...");
      musicEngine.start();
      console.log("[PlayerPage] Step D done. Transport state:", musicEngine.transportState);
      
      setIsPlaying(true);
      console.log("[PlayerPage] ✅ Playback started successfully!");
    } catch (e) {
      console.error("[PlayerPage] ❌ Playback Start Failed:", e);
    } finally {
      clearTimeout(safetyTimeoutId);
      setIsAudioLoading(false);
      console.log("[PlayerPage] 🏁 handleTogglePlay finished. isPlaying will be:", musicEngine.transportState === 'started');
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

  const allPlayableNotes = useMemo(() => {
    let combined = [...(parsedData?.notes || [])];
    if (tracks && tracks.length > 0) {
      tracks.forEach(t => {
        if ((t as any)._generatedNotes) {
          combined = combined.concat((t as any)._generatedNotes);
        }
      });
    }
    return combined;
  }, [parsedData?.notes, tracks]);

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
    if (song?.id && activeRenderKey) {
      try {
        localStorage.setItem(`active_render_key_${song.id}`, activeRenderKey);
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
    isHistoryRestoredRef.current = false; // reset guard before restoring
    const songId = song?.id || '_unsaved_';
    try {
      const localHist = localStorage.getItem(`memo_render_history_${songId}`);
      if (localHist) {
        const parsed = JSON.parse(localHist);
        if (Array.isArray(parsed)) {
          const mapped = parsed.map((h: any) => ({
            ...h,
            lyricMode: mapToLyricMode(h.lyricMode),
          }));
          restoreCachedBlobs(songId, mapped).then((restored) => {
            setRenderHistory(restored);
            isHistoryRestoredRef.current = true;
          });
        } else {
          setRenderHistory([]);
          isHistoryRestoredRef.current = true;
        }
      } else {
        setRenderHistory([]);
        isHistoryRestoredRef.current = true;
      }
    } catch (e) {
      setRenderHistory([]);
      isHistoryRestoredRef.current = true;
    }

    if (song?.id) {
      svsFetch(getFetchUrl(`/studio/renders/${encodeURIComponent(song.id)}?owner_id=${encodeURIComponent(authUser?.id || '')}`))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && Array.isArray(data.renders)) {
            if (data.renders.length > 0) {
              const mapped = data.renders.map((r: any) => ({
                bpmPercent: r.bpm_pct,
                songKey: r.song_key || 'C',
                audioUrl: fixAudioUrl(r.url),
                label: r.label,
                filename: r.filename,
                lyricMode: mapToLyricMode(r.lyric_mode),
                engineId: r.engine_id,
                voiceName: r.engine_id || 'Auto',
                savedStemUrls: (r.saved_stem_urls || []).map((sUrl: string) => fixAudioUrl(sUrl)),
              }));
              restoreCachedBlobs(song.id, mapped).then((restored) => {
                setRenderHistory(restored);
                isHistoryRestoredRef.current = true;
              });
            } else {
              setRenderHistory([]);
              isHistoryRestoredRef.current = true;
            }
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id]);

  // Handle automatic track role assignment once notes are parsed
  useEffect(() => {
    if (!parsedData.notes.length || tracks.length > 0) return;

    const songId = song?.id || '_unsaved_';
    const partIds = parsedData.partNames ? Object.keys(parsedData.partNames) : [];
    let currentPartNames = parsedData.partNames || {};
    
    // If we have no partIds but we have notes, create a default track
    if (partIds.length === 0 && parsedData.notes.length > 0) {
      partIds.push('P1');
      currentPartNames = { ...currentPartNames, 'P1': 'Part 1' };
    }

    if (partIds.length > 0) {
      // Try to load saved tracks from localStorage
      let restoredTracks: TrackState[] = [];
      try {
        const saved = localStorage.getItem(`tracks_state_${songId}`);
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
        name: currentPartNames[id] || `Track ${index + 1}`,
        volume: 1.0,
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
  }, [parsedData.notes.length, parsedData.partNames, setTracks, activeVoiceName, activeLyricMode, tracks.length, song?.id]);

  // Save tracks to localStorage whenever they change
  useEffect(() => {
    if (song?.id && tracks.length > 0) {
      try {
        localStorage.setItem(`tracks_state_${song.id}`, JSON.stringify(tracks));
      } catch (e) {}
    }
  }, [tracks, song?.id]);

  // ── RESUME INTERRUPTED RENDER: Restore rendering state after reload/wake ──
  useEffect(() => {
    if (!iframeLoaded) return;
    if (!musicXml || !song?.id || activeLyricMode === 'Close') return;
    if (!parsedData.notes.length) return;
    if (tracks.length === 0) return;
    
    try {
      const activeRenderingSong = localStorage.getItem('vocalido_rendering_active_song');
      if (activeRenderingSong === song.id && !vocalidoRenderService.getState().isRendering) {
        // Clear it first to prevent infinite loop
        localStorage.removeItem('vocalido_rendering_active_song');
        console.log(`[Vocalido] 🔄 Interrupted render detected for song "${song.id}". Resuming rendering...`);
        // Use a timeout to ensure audio context and other elements have settled
        setTimeout(() => {
          triggerVocalSynthesis();
        }, 300);
      }
    } catch (e) {}
  }, [iframeLoaded, song?.id, musicXml, activeLyricMode, parsedData.notes.length, tracks.length]);

  // Clear active rendering song once synthesis finishes
  useEffect(() => {
    if (!isRenderingVocal) {
      try {
        localStorage.removeItem('vocalido_rendering_active_song');
      } catch (e) {}
    }
  }, [isRenderingVocal]);

  // Auto-restore active render on load
  useEffect(() => {
    if (!song?.id || renderHistory.length === 0 || tracks.length === 0) return;
    
    // Guard to ensure we only try to restore once per song load
    if (autoRestoredRef.current === song.id) return;

    const savedKey = localStorage.getItem(`active_render_key_${song.id}`);
    if (!savedKey) return;

    const cached = renderHistory.find(h => {
      const tfStr = h.timingFeel !== undefined ? `_tf${h.timingFeel}` : '';
      const v2Str = h.version >= 2 ? '_v2' : '';
      return `${h.bpmPercent}_${h.songKey}_${h.engineId||'default'}_${h.lyricMode||''}_${h.voiceName||'Auto'}${tfStr}${v2Str}` === savedKey;
    });

    if (cached) {
      autoRestoredRef.current = song.id;
      console.log(`[PlayerPage] 🎤 Auto-restoring saved render ${cached.label}`);
      
      const fixedUrl = fixAudioUrl(cached.audioUrl);
      const stemsWithBust = (cached.savedStemUrls || []).map((sUrl: string) => fixAudioUrl(sUrl));
      const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';

      const origBpm = (parsedData?.metadata as any)?.bpm || song?.bpm || 120;
      const renderBpm = Math.round(((origBpm * cached.bpmPercent) / 100) * 10) / 10;
      
      const origKey = parsedData?.metadata?.key || song?.key || 'C';
      const targetKey = cached.songKey || origKey;
      const tVal = getTransposeDiff(origKey, targetKey);

      // Check if vocal layer is already loaded in musicEngine
      const hasVocalLoaded = musicEngine.hasVocalLayer(primaryTrackId);
      
      if (hasVocalLoaded && musicEngine.isSongLoaded) {
        console.log('[PlayerPage] Vocal layer already loaded in MusicEngine. Skipping reload.');
        setActiveRenderKey(savedKey);
        setTranspose(tVal);
        setRenderedTranspose(tVal);
        if (cached.engineId) setActiveEngineId(cached.engineId);
        if (cached.voiceName && cached.voiceName !== 'Auto') {
          setStoredSinger(cached.voiceName);
        }
        const vocalTracksArr = cached.vocalTracks ? cached.vocalTracks.split(',') : [primaryTrackId];
        const updatedTracks = tracks.map((t: any) => 
          vocalTracksArr.includes(t.id) ? { ...t, mode: 'vocal' } as TrackState : t
        );
        setTracks(updatedTracks);
        return;
      }

      // Load vocal layer in background
      setIsAudioLoading(true);
      
      const vocalTracksArr = cached.vocalTracks ? cached.vocalTracks.split(',') : [primaryTrackId];
      
      const allStemsByTrack = cached.stemsByTrack || {};
      
      Promise.all(vocalTracksArr.map(async (tid: string) => {
        let trackAudioUrl = "";
        let stemsToPass: string[] = [];

        if (tid === primaryTrackId) {
          // Primary track: always use the stereo mix blob as main audio.
          // Sub-stems (S1/S2/S3...) from savedStemUrls for ◆ Solo buttons.
          trackAudioUrl = fixedUrl;
          stemsToPass = stemsWithBust;
        } else {
          // Non-primary vocal tracks in polyphonic mode:
          // Try stemsByTrack mapping first, then fall back to savedStemUrls by index.
          const trackStems = allStemsByTrack[tid]
            ? allStemsByTrack[tid].map((s: string) => fixAudioUrl(s))
            : [];
          if (trackStems.length > 0) {
            trackAudioUrl = trackStems[0];
          } else {
            // Legacy fallback: assign stem by track order index
            const idx = vocalTracksArr.indexOf(tid);
            if (idx > 0 && idx < stemsWithBust.length) {
              trackAudioUrl = stemsWithBust[idx];
            }
          }
        }
        
        if (trackAudioUrl) {
          await musicEngine.addVocalLayer(tid, trackAudioUrl, stemsToPass, renderBpm);
          
          let audioEl = musicEngine.vocalAudioElements.get(tid);
          if (!audioEl) {
            audioEl = new Audio();
            audioEl.crossOrigin = 'anonymous';
            audioEl.preservesPitch = true;
            musicEngine.vocalAudioElements.set(tid, audioEl);
          }
          audioEl.src = trackAudioUrl;
          audioEl.load();
        }
      }))
        .then(() => {
          // Update availableStems — only for the primary track which has sub-stems loaded
          const stemCount = musicEngine.getAvailableStems(primaryTrackId);
          setAvailableStems(stemCount > 0 ? { [primaryTrackId]: stemCount } : {});
          setSoloedStems({});
          setActiveRenderKey(savedKey);
          setTranspose(tVal);
          setRenderedTranspose(tVal);
          
          if (cached.engineId) setActiveEngineId(cached.engineId);
          if (cached.voiceName && cached.voiceName !== 'Auto') {
            setStoredSinger(cached.voiceName);
          }
          
          // Re-load the song with vocal tracks enabled
          const vocalTracksArr = cached.vocalTracks ? cached.vocalTracks.split(',') : [primaryTrackId];
          const updatedTracks = tracks.map((t: any) => 
            vocalTracksArr.includes(t.id) ? { ...t, mode: 'vocal' } as TrackState : t
          );
          setTracks(updatedTracks);
          
          return musicEngine.loadSong(allPlayableNotes, updatedTracks, tVal, parsedData.timeSignature, isMetronomeOn);
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
    
    // NOTE: We REMOVED 'transpose' from currentKey and dependencies here.
    // Changing transpose will instantly pitch-shift via SoundTouchJS instead of forcing a re-render.
    const currentKey = `${song.id}_${activeLyricMode}_${activeEngineId}_${activeVoiceName}`;
    if (currentKey === lastRenderedKeyRef.current) return;
    
    console.log(`[Vocalido] 🚀 Auto-Render triggered: ${activeLyricMode} (${parsedData.notes.length} notes)`);
    lastRenderedKeyRef.current = currentKey;
    
    // Use a microtask to avoid stale closure issues
    autoRenderRef.current = true;
  }, [vocalidoAutoRender, iframeLoaded, song?.id, musicXml, activeLyricMode, activeVoiceName, activeEngineId, currentBpm, parsedData.notes.length, tracks.length, tracksRep]);
  
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
      musicEngine.stopAndClear();
      setIsPlaying(false);
    };
  }, []);

  // Load engines and stored active engine
  // Load engines and stored active engine
  useEffect(() => {
    let active = true;
    const fetchEngines = async (manualCheck = false) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second quick connection check
        const res = await svsFetch(getFetchUrl('/vocalido/studio/voices'), {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Not OK');
        const data = await res.json();
        if (active && data && data.voices) {
          setIsServerOnline(true);
          setVoiceEngines(data.voices);
          
          // Auto-select SVS rendering mode: prioritize server-side vocalido when local server is online
          const isMobileOrLowEnd = typeof window !== 'undefined' && (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 4) <= 4 || ((navigator as any).deviceMemory || 8) <= 4);
          
          const savedSvsEngine = localStorage.getItem('vocalido_svs_engine');
          if (!savedSvsEngine || manualCheck || isMobileOrLowEnd) {
            setSvsEngine('vocalido');
            localStorage.setItem('vocalido_svs_engine', 'vocalido');
          } else {
            setSvsEngine(savedSvsEngine as 'vocalido' | 'browser-ai');
          }

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
          // Stay on 'vocalido' — do NOT auto-fallback to browser-ai.
          // User will see the server is offline and can manually switch if needed.
          // This prevents unintentionally slow browser-side rendering.
          const savedEngine = localStorage.getItem('vocalido_svs_engine');
          if (savedEngine === 'browser-ai') {
            setSvsEngine('browser-ai'); // respect explicit user preference
          }
          // Otherwise keep current mode (vocalido) so user is aware server is down
          
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
              },
              linguistic: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsmain/linguistic.onnx',
              dur: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dsdur/dur.onnx',
              pitch: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dspitch/pitch.onnx',
              pitchLinguistic: '/vocalido/voicebanks/Lotte_V_AI_dol/Hoshino Hanami ~AIdol~ for DiffSinger v1.0/dspitch/linguistic.onnx'
            }
          }]);
          setActiveEngineId('lotte_v_ai_dol');
          setTracks((prev: any) => prev.map((t: any) => {
            if (t.mode === 'vocal' && (t.engineId === 'default' || !t.engineId)) {
              return { ...t, engineId: 'lotte_v_ai_dol' };
            }
            return t;
          }));
        }
      }
    };
    fetchEngines();

    const handleBackendChange = () => {
      fetchEngines(true);
    };
    window.addEventListener('vocalido_backend_url_changed', handleBackendChange);

    try {
      const storedEngine = localStorage.getItem('vocalido_active_engine');
      if (storedEngine) setActiveEngineId(storedEngine);
    } catch (e) {}

    return () => {
      active = false;
      window.removeEventListener('vocalido_backend_url_changed', handleBackendChange);
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
        pitch: Math.max(24, Math.min(108, (n.octave + 1) * 12 + (stepMap[(n.step || 'C').toUpperCase()] || 0) + (n.alter || 0) + transpose)),
        duration: n.duration,
        startTime: n.startTime,
        lyric: n.solfege || 'La'
      }));
      const notesMessage = { type: 'UPDATE_NOTES', notes: notesForStudio, bpm: currentBpm };

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
      const hasAnySolo = tracks.some(tr => tr.isSolo) || soloedTracks.size > 0;

      // Determine if the solo context is "vocal-only" — i.e., all soloed tracks are vocal.
      // In this case, instrument tracks (piano) should NOT be muted so they remain audible as accompaniment.
      const soloedTrackModes = tracks
        .filter(tr => tr.isSolo || soloedTracks.has(tr.id))
        .map(tr => tr.mode);
      const isSoloVocalOnly = soloedTrackModes.length > 0 && soloedTrackModes.every(m => m === 'vocal');

      const updatedTracks = tracks.map(t => {
        const isVocalMuted = t.isMuted || mutedVocalTracks.has(t.id);
        const isTrackSoloed = t.isSolo || soloedTracks.has(t.id);
        // When soloing vocal tracks, instrument tracks stay audible (piano reference).
        // Only mute non-soloed vocal tracks.
        const isMutedBySolo = hasAnySolo && !isTrackSoloed &&
          !(isSoloVocalOnly && t.mode === 'instrument');
        
        return {
          ...t,
          isMuted: isVocalMuted || isMutedBySolo,
          isSolo: isTrackSoloed,
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
  }, [tracks, mutedVocalTracks, soloedTracks]);

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
        .then(() => musicEngine.loadSong(allPlayableNotes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn))
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

  // Sync vocal pitch shifter diff
  useEffect(() => {
    tracks.forEach(t => {
      if (t.mode === 'vocal') {
        musicEngine.setVocalTranspose(t.id, transpose - renderedTranspose);
      }
    });
  }, [transpose, renderedTranspose, tracks]);

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
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'Enter' || e.code === 'Return') {
        e.preventDefault();
        musicEngine.pause();
        setIsPlaying(false);
        musicEngine.setTransportSeconds(0);
        setCurrentTime(0);
      } else if (e.metaKey || e.ctrlKey) {
        if (e.code === 'ArrowUp' || e.code === 'ArrowRight') {
          e.preventDefault();
          setZoomLevel(prev => Math.min(prev * 1.2, 5.0)); // Zoom In
        } else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') {
          e.preventDefault();
          setZoomLevel(prev => Math.max(prev / 1.2, 0.2)); // Zoom Out
        } else if (e.code === 'KeyS') {
          e.preventDefault();
          console.log("Save Project shortcut pressed");
        } else if (e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) console.log("Redo shortcut pressed");
          else console.log("Undo shortcut pressed");
        }
      } else if (e.altKey && e.code === 'KeyR') {
        e.preventDefault();
        triggerVocalSynthesis(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentBpm, tracks, song]); // Added dependencies to capture latest state for handlePlayPause

  const cancelVocalSynthesis = () => {
    vocalidoRenderService.cancelRender();
  };

  const handleClearCache = async () => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('memo_render_history_') || key.startsWith('active_render_key_'))) {
          localStorage.removeItem(key);
          i--;
        }
      }
      await AudioBlobCache.clearAllVocalRenders();
      setRenderHistory([]);
      setActiveRenderKey(null);
      setCacheClearedText(true);
      setTimeout(() => setCacheClearedText(false), 2000);
    } catch (e) {
      console.error('Failed to clear cache:', e);
    }
  };

  const triggerVocalSynthesis = async (forceRender: boolean = false, selectedTrackIds?: string[], overrideLyricMode?: string) => {
    console.log('[PlayerPage] 🎤 triggerVocalSynthesis called:', { 
      isRenderingVocal, isModelLoading, hasMusicXml: !!musicXml, 
      noteCount: parsedData.notes.length, trackCount: tracks.length,
      selectedTrackIds, forceRender 
    });
    
    // If UI thinks we're rendering but service disagrees, force-reset stale state
    if (isRenderingVocal && !vocalidoRenderService.getState().isRendering) {
      console.warn('[Vocalido] ⚠️ isRenderingVocal was stale (true), but service says false. Force-resetting.');
      setIsRenderingVocal(false);
      // Continue — don't return
    } else if (isRenderingVocal) { 
      console.warn('[Vocalido] ⛔ Render blocked: already rendering'); 
      return; 
    }
    if (isModelLoading) { console.warn('[Vocalido] ⛔ Render blocked: vocal model is still loading in the background'); return; }
    if (!musicXml) { console.warn('[Vocalido] ⛔ Render blocked: no musicXml'); return; }
    if (!parsedData.notes.length) { console.warn('[Vocalido] ⛔ Render blocked: no notes parsed'); return; }
    if (tracks.length === 0) { console.warn('[Vocalido] ⛔ Render blocked: no tracks'); return; }

    let renderTracks = tracks;
    // Always determine effective track IDs to render
    const effectiveTrackIds = (selectedTrackIds && selectedTrackIds.length > 0)
      ? selectedTrackIds
      : tracks.map(t => t.id); // Default: ALL tracks become vocal

    const prevVocalIds = tracks.filter(t => t.mode === 'vocal').map(t => t.id).sort().join(',');
    const newVocalIds = [...effectiveTrackIds].sort().join(',');

    renderTracks = tracks.map(t => ({
      ...t,
      mode: effectiveTrackIds.includes(t.id) ? 'vocal' : 'instrument'
    })) as typeof tracks;
    setTracks(renderTracks);

    // Removed: Do not clear history on track changes, history supports multiple track sets

    const primaryTrackId = renderTracks.find(t => t.mode === 'vocal')?.id || renderTracks[0]?.id || 'P1';
    let trackEngineId = renderTracks.find(t => t.id === primaryTrackId)?.engineId || activeEngineId;
    if (trackEngineId === 'default' || !voiceEngines.some(v => v.id === trackEngineId)) {
      trackEngineId = activeEngineId;
    }
    if (!voiceEngines.some(v => v.id === trackEngineId) && voiceEngines.length > 0) {
      trackEngineId = voiceEngines[0].id;
    }

    // DEBUG: Check if voiceEngines contain neural model files
    const debugVoice = voiceEngines.find(v => v.id === trackEngineId);
    console.log('[PlayerPage] 🔍 render voice:', trackEngineId, 'model_files keys:', debugVoice?.model_files ? Object.keys(debugVoice.model_files) : 'NO MODEL FILES');
    console.log('[PlayerPage] 🎵 renderTracks vocal IDs:', renderTracks.filter(t => t.mode === 'vocal').map(t => t.id));
    
    // Allow React to paint the UI (closing modal, showing render card) before potential main thread blocking
    const capturedRenderTracks = [...renderTracks]; // Capture to avoid stale closure
    const capturedTrackEngineId = trackEngineId;
    setTimeout(() => {
      try {
        vocalidoRenderService.startRender({
        song: song!,
        parsedData,
        tracks: capturedRenderTracks,
        transpose,
        activeLyricMode: overrideLyricMode || activeLyricMode,
        activeVoiceName,
        trackEngineId: capturedTrackEngineId,
        activeEngineId,
        collapseChords,
        svsEngine,
        svsSteps,
        svsTimingFeel,
        currentBpm,
        voiceEngines,
        isMetronomeOn,
        userId: authUser?.id || ''
        });
      } catch (err) {
        console.error('[PlayerPage] ❌ startRender threw:', err);
        vocalidoRenderService.cancelRender();
      }
    }, 150);
  };

  const closeRenderOverlay = () => {
    vocalidoRenderService.cancelRender();
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
                {(['score', 'pianoroll', 'trackview', 'memochord', 'practice', 'vocalido'] as PlayerCardType[]).map(card => {
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
                              setTimeout(() => triggerVocalSynthesis(true, undefined, mode), 150);
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
            {(() => {
              let dotColor = 'bg-rose-500';
              let shadowColor = 'shadow-[0_0_10px_rgba(239,68,68,0.8)]';
              let pingColor = '';
              let statusTitle = 'SVS Server Offline';

              if (svsEngine === 'browser-ai') {
                dotColor = 'bg-[#00e5ff]';
                shadowColor = 'shadow-[0_0_10px_rgba(0,229,255,0.8)]';
                pingColor = 'bg-[#00e5ff]';
                statusTitle = 'Using On-Device WebGPU Browser SVS (Cyan)';
              } else {
                if (isServerOnline) {
                  dotColor = 'bg-emerald-500';
                  shadowColor = 'shadow-[0_0_10px_rgba(16,185,129,0.8)]';
                  pingColor = 'bg-emerald-500';
                  statusTitle = 'Local SVS Server Online (Vocalido VM - Green)';
                } else {
                  const hasRunpod = import.meta.env.VITE_RUNPOD_API_URL && import.meta.env.VITE_RUNPOD_API_KEY;
                  if (hasRunpod) {
                    dotColor = 'bg-fuchsia-500';
                    shadowColor = 'shadow-[0_0_10px_rgba(217,70,239,0.8)]';
                    pingColor = 'bg-fuchsia-500';
                    statusTitle = 'Local Server Offline (Using RunPod API Fallback - Purple)';
                  } else {
                    dotColor = 'bg-rose-500';
                    shadowColor = 'shadow-[0_0_10px_rgba(239,68,68,0.8)]';
                    statusTitle = 'SVS Server Offline & RunPod Fallback Offline (Red)';
                  }
                }
              }

              return (
                <div className="relative flex items-center justify-center ml-1" title={statusTitle}>
                  <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${dotColor} ${shadowColor}`} />
                  {pingColor && <div className={`absolute w-2.5 h-2.5 ${pingColor} rounded-full animate-ping opacity-40`} />}
                </div>
              );
            })()}
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

        {/* ── LEFT SIDEBAR: ORIGINAL IMAGE COMPARISON REMOVED PER USER REQUEST ── */}

        {/* ── MAIN CONTENT AREA (RIGHT SIDE IN SPLIT VIEW) ── */}
        <div className="flex-1 flex flex-col relative overflow-hidden pointer-events-auto pb-[54px]">
        {renderHistory.length === 0 && activeCard === 'score' && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 z-[3000] flex flex-col items-center pointer-events-auto bg-[#0c0c0e]/95 p-1.5 rounded-lg border border-white/10 backdrop-blur-xl shadow-2xl w-[34px]">
            <button
              onClick={() => { setModalSelectedTracks(tracks.map(t => t.id)); setShowRenderPrompt(true); }}
              className="w-6 h-6 rounded-lg flex flex-col items-center justify-center border font-bold uppercase transition-all bg-zinc-900 border-zinc-800 text-[#00e5ff] hover:text-white hover:border-[#00e5ff] hover:shadow-[0_0_10px_rgba(0,229,255,0.4)] animate-pulse"
              title="Render AI Vocals"
            >
              <Sparkles size={12} className="text-[#00e5ff]" />
              <span className="text-[4px] tracking-tighter leading-none mt-0.5">Render</span>
            </button>
          </div>
        )}
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
                            const vocalTracksArr = h.vocalTracks ? h.vocalTracks.split(',') : [primaryTrackId];
                            
                            await Promise.all(vocalTracksArr.map(async (tid: string) => {
                              let trackAudioUrl = "";
                              let stemsToPass: string[] = [];

                              if (tid === primaryTrackId) {
                                // Primary track: always use the stereo mix blob + savedStemUrls as ◆ sub-stems
                                trackAudioUrl = cacheBusted;
                                stemsToPass = stemsWithBust;
                              } else {
                                // Non-primary: try stemsByTrack mapping, then savedStemUrls by index
                                const trackStems = (h.stemsByTrack && h.stemsByTrack[tid]) ? h.stemsByTrack[tid].map((s: string) => {
                                  const fs = fixAudioUrl(s);
                                  return fs.startsWith('blob:') ? fs : (fs.includes('?t=') ? fs.replace(/\?t=\d+/, `?t=${Date.now()}`) : `${fs}?t=${Date.now()}`);
                                }) : [];
                                if (trackStems.length > 0) {
                                  trackAudioUrl = trackStems[0];
                                } else {
                                  const idx = vocalTracksArr.indexOf(tid);
                                  if (idx > 0 && idx < stemsWithBust.length) {
                                    trackAudioUrl = stemsWithBust[idx];
                                  }
                                }
                              }
                              
                              if (trackAudioUrl) {
                                await musicEngine.addVocalLayer(tid, trackAudioUrl, stemsToPass, targetBpm);
                                
                                let audioEl = musicEngine.vocalAudioElements.get(tid);
                                if (!audioEl) {
                                  audioEl = new Audio();
                                  audioEl.crossOrigin = 'anonymous';
                                  audioEl.preservesPitch = true;
                                  audioEl.preload = 'auto'; // Force buffer for Android
                                  musicEngine.vocalAudioElements.set(tid, audioEl);
                                }
                                audioEl.src = trackAudioUrl;
                                audioEl.load();
                                
                                // Unlock immediately inside the user gesture
                                audioEl.play().then(() => audioEl.pause()).catch(e => console.warn('Main vocal unlock failed:', e));
                              }
                            }));
  
                            // Set the track mode to vocal so UI state reflects it
                            const updatedTracks = tracks.map((t: any) => 
                              vocalTracksArr.includes(t.id) ? { ...t, mode: 'vocal' } as TrackState : t
                            );
                            setTracks(updatedTracks);
  
                            // Update availableStems — only primary track has sub-stems
                            const stemCount = musicEngine.getAvailableStems(primaryTrackId);
                            setAvailableStems(stemCount > 0 ? { [primaryTrackId]: stemCount } : {});
                            setSoloedStems({});
  
                            setActiveRenderKey(hKey);
                            setMemoInfoOpenKey(null);
                            if (h.engineId) setActiveEngineId(h.engineId);
                            if (h.voiceName && h.voiceName !== 'Auto') {
                              setStoredSinger(h.voiceName);
                            } else {
                              setStoredSinger(null);
                            }
  
                            // Load song (5 arguments)
                            await musicEngine.loadSong(allPlayableNotes, updatedTracks, tVal, parsedData.timeSignature, isMetronomeOn);
                            
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
                          if (activeRenderKey === hKey) {
                            setActiveRenderKey(null);
                            // ── Reset playback and clear vocal layer ──
                            musicEngine.pause();
                            setIsPlaying(false);
                            const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
                            musicEngine.clearVocalLayers(primaryTrackId);
                            // Set track mode back to instrument
                            const updatedTracks = tracks.map((t: any) => 
                              t.id === primaryTrackId ? { ...t, mode: 'instrument' } as TrackState : t
                            );
                            setTracks(updatedTracks);
                            // Reload song to apply instrument sampler
                            musicEngine.loadSong(allPlayableNotes, updatedTracks, transpose, parsedData.timeSignature, isMetronomeOn).catch(() => {});
                          }
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
              const staffMatch = track.id.match(/-S(\d+)/);
              const staffIdx = staffMatch ? parseInt(staffMatch[1]) - 1 : 0;
              const baseStaffY = staffYPositions[staffIdx] ?? (baseTop + staffIdx * 100);
              
              const sId = track.id.split('_')[0];
              const tracksInSameStaff = tracks.filter((t: any) => t.id.startsWith(sId));
              const subIndex = tracksInSameStaff.findIndex((t: any) => t.id === track.id);
              const yOffset = subIndex * 14; // offset each track on the same staff (tighter grouping)
              const yPos = baseStaffY + yOffset;

              return (
                <div 
                  key={track.id} 
                  className="absolute left-1 z-50 flex flex-col gap-1 pointer-events-auto"
                  style={{ top: `${yPos - 2}px` }}
                >
                  {/* Layout: [icon] [S1/S2/.../ALL vertical stack] side by side */}
                  <div className="flex flex-row gap-0.5 items-start">
                    
                    {/* Toggle between Vocal and Instrument */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracks((prev: any) => prev.map((t: any) => 
                          t.id === track.id ? { ...t, mode: t.mode === 'vocal' ? 'instrument' : 'vocal' } : t
                        ));
                      }}
                      className={`w-4 h-4 rounded-md flex items-center justify-center transition-all border shadow-lg flex-shrink-0 ${
                        track.mode === 'vocal'
                          ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_10px_rgba(34,211,238,0.4)]'
                          : 'bg-[#1a1a1e] border-zinc-700 text-zinc-400 hover:text-cyan-400 hover:border-cyan-400/60'
                      }`}
                      title={track.mode === 'vocal' ? `Switch "${track.name}" to Instrument` : `Switch "${track.name}" to Vocal`}
                    >
                      {track.mode === 'vocal' ? <Mic2 size={8} /> : <span className="text-[8px]">🎹</span>}
                    </button>

                    {/* Stem Solo buttons — vertical stack to the RIGHT of the icon */}
                    {showStemControls && availableStems[track.id] > 0 && (() => {
                      const stemTrackId = track.id;
                      const stemCount = availableStems[stemTrackId];
                      return (
                        <div className="flex flex-col gap-0.5">
                          {Array.from({ length: stemCount }).map((_, idx) => {
                            const isSoloed = soloedStems[stemTrackId] === idx;
                            return (
                              <button
                                key={idx}
                                onClick={() => handleSoloStem(stemTrackId, isSoloed ? null : idx)}
                                className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shadow-lg ${
                                  isSoloed
                                    ? 'bg-cyan-500 border-cyan-300 text-white shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                                    : 'bg-[#1a1a1e] border-zinc-700 text-zinc-400 hover:text-cyan-300 hover:border-cyan-500/60'
                                }`}
                                title={isSoloed ? `Play all voices` : `Solo voice ${idx + 1}`}
                              >
                                <span className="text-[6px] font-black">S{idx + 1}</span>
                              </button>
                            );
                          })}
                          <button
                            onClick={() => handleSoloStem(stemTrackId, null)}
                            className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shadow-lg ${
                              soloedStems[stemTrackId] === null
                                ? 'bg-rose-600 border-rose-400 text-white shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                                : 'bg-[#1a1a1e] border-zinc-700 text-zinc-400 hover:text-rose-300 hover:border-rose-500/60'
                            }`}
                            title="Play all voices together"
                          >
                            <span className="text-[5.5px] font-black">ALL</span>
                          </button>
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
            renderHistory={renderHistory}
            zoom={zoomLevel}
            transpose={transpose}
            layoutMode={'paginated'}
            isLoupeEnabled={false}
            showLaser={true}
            lyricMode={activeLyricMode}
            soloedTracks={soloedTracks}
            activeLoop={activeLoop}
            performanceMode={performanceMode}
            layoutBundle={layoutBundle}
            isVisible={activeCard === 'score'}
          />
        </div>

        {/* ── [VOCAL MODEL BACKGROUND AUTO-LOAD BANNER - NON-BLOCKING FLOATING CARD] ── */}
        {isModelLoading && !hideLoadBanner && (
          <div className="absolute top-20 right-4 z-[4900] pointer-events-auto animate-in slide-in-from-top-4 duration-300">
            <div className="bg-rose-950/95 border border-rose-500/50 rounded-2xl p-4 flex flex-col items-center gap-2 text-center w-64 backdrop-blur-xl shadow-[0_0_30px_rgba(244,63,94,0.25)]">
              {/* Blinking Red Dot Icon */}
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute" style={{ animationDuration: '2s' }} />
                  <span className="w-2 h-2 rounded-full bg-rose-600 relative" />
                </div>
                <h3 className="text-rose-400 text-[9px] font-black uppercase tracking-wider animate-pulse">
                  INITIALIZING SVS ENGINE
                </h3>
              </div>
              
              <div className="flex flex-col gap-0.5">
                <p className="text-white text-[10px] font-bold tracking-tight">
                  Background Auto-Loading Model...
                </p>
                <p className="text-zinc-400 text-[8px] leading-snug">
                  Downloading neural voice model for client-side rendering.
                </p>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-white/5 border border-white/10 rounded-full h-1 overflow-hidden mt-0.5">
                <div 
                  className="bg-rose-500 h-full transition-all duration-300 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.5)]" 
                  style={{ width: `${modelLoadProgress}%` }}
                />
              </div>
              
              <div className="flex justify-between items-center w-full mt-0.5">
                <span className="text-[7.5px] font-black text-rose-400/80 tracking-wide uppercase truncate max-w-[140px]">
                  {modelLoadStatus}
                </span>
                <span className="text-[8px] font-black text-rose-300 tracking-wider">
                  {modelLoadProgress}%
                </span>
              </div>

              {/* Dismiss Button */}
              <button
                onClick={() => setHideLoadBanner(true)}
                className="w-full py-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-md text-[7.5px] font-black text-zinc-300 hover:text-white uppercase tracking-widest transition-all mt-1"
              >
                Hide / Read Sheet Music
              </button>
            </div>
          </div>
        )}

        {/* ── [SVS READY RENDER PROMPT] ── */}
        {showRenderPrompt && (
          <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/70 backdrop-blur-md pointer-events-auto">
            <div className="relative flex flex-col items-center p-8 bg-zinc-950/95 border border-zinc-800 rounded-3xl w-[320px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300">
              <div className="relative w-28 h-28 flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" style={{ animationDuration: '3s' }} />
                <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 opacity-20 blur-xl animate-pulse" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-[0_0_30px_rgba(6,182,212,0.4)] flex items-center justify-center border border-white/10">
                  <Sparkles size={36} className="text-black animate-pulse" />
                </div>
              </div>
              <h3 className="text-base font-black text-white text-center mb-2 uppercase tracking-widest">Render AI Vocals?</h3>
              <p className="text-[10px] text-zinc-400 text-center mb-4 px-1 leading-relaxed">
                {svsEngine === 'vocalido' ? (
                  <>
                    Would you like to render the AI vocals now using the <span className="text-cyan-400 font-bold">Local SVS Server (Vocalido)</span>?
                  </>
                ) : (
                  <>
                    The voice model is ready on your device. Would you like to render the AI vocals now using <span className="text-cyan-400 font-bold">On-Device (20 Steps HD)</span>?
                  </>
                )}
              </p>

              {/* Track Selection UI */}
              {tracks.length > 1 && (
                <div className="w-full flex flex-col gap-2 mb-6">
                  <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mb-1 border-b border-white/10 pb-1">Select Tracks</span>
                  
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        checked={modalSelectedTracks.length === 1 && modalSelectedTracks[0] === tracks[0].id}
                        onChange={() => setModalSelectedTracks([tracks[0].id])}
                        className="peer sr-only" 
                      />
                      <div className="w-4 h-4 rounded border border-zinc-600 bg-zinc-900 peer-checked:bg-cyan-500 peer-checked:border-cyan-400 transition-all flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-black opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-zinc-300 group-hover:text-white transition-colors">Select Melody only</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        checked={modalSelectedTracks.length === tracks.length}
                        onChange={() => setModalSelectedTracks(tracks.map(t => t.id))}
                        className="peer sr-only" 
                      />
                      <div className="w-4 h-4 rounded border border-zinc-600 bg-zinc-900 peer-checked:bg-cyan-500 peer-checked:border-cyan-400 transition-all flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-black opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-zinc-300 group-hover:text-white transition-colors">Select All Tracks</span>
                  </label>

                  <div className="max-h-24 overflow-y-auto no-scrollbar flex flex-col gap-1.5 mt-1 border border-zinc-800 rounded-lg p-2 bg-black/40">
                    {tracks.map(t => (
                      <label key={t.id} className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input 
                            type="checkbox" 
                            checked={modalSelectedTracks.includes(t.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setModalSelectedTracks(prev => [...prev.filter(id => id !== t.id), t.id]);
                              } else {
                                setModalSelectedTracks(prev => prev.filter(id => id !== t.id));
                              }
                            }}
                            className="peer sr-only" 
                          />
                          <div className="w-3.5 h-3.5 rounded-sm border border-zinc-700 bg-zinc-900 peer-checked:bg-cyan-600 peer-checked:border-cyan-500 transition-all flex items-center justify-center">
                            <svg className="w-2 h-2 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        </div>
                        <span className="text-[9px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors truncate flex-1">{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Advanced Settings (Manual/On-Demand) ── */}
              <div className="w-full mt-4 border-t border-white/10 pt-3">
                <button
                  onClick={() => setShowAdvancedRenderSettings(v => !v)}
                  className="w-full flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-cyan-400 transition-colors"
                >
                  <span>⚙️ Manual Settings</span>
                  <span className={`transition-transform duration-200 ${showAdvancedRenderSettings ? 'rotate-180' : ''}`}>▼</span>
                </button>

                {showAdvancedRenderSettings && (
                  <div className="mt-3 flex flex-col gap-3">

                    {/* Engine Selection */}
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Engine</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleSvsEngineChange('vocalido')}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all border ${
                            svsEngine === 'vocalido'
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                          }`}
                        >
                          🖥️ GPU Server
                        </button>
                        <button
                          onClick={() => handleSvsEngineChange('browser-ai')}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all border ${
                            svsEngine === 'browser-ai'
                              ? 'bg-purple-500/20 border-purple-400 text-purple-400'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                          }`}
                        >
                          💻 Browser AI
                        </button>
                      </div>
                    </div>

                    {/* Quality Steps */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Quality</span>
                        <span className="text-[9px] font-bold text-cyan-400">
                          {svsSteps === 6 ? '6 — Draft' : svsSteps === 10 ? '10 — Fast' : svsSteps === 20 ? '20 — HD' : svsSteps === 40 ? '40 — Studio' : svsSteps === 50 ? '50 — Pro' : `${svsSteps} — Ultra`}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {[6, 10, 20, 40, 50].map(step => (
                          <button
                            key={step}
                            onClick={() => handleSvsStepsChange(step)}
                            className={`flex-1 py-1 rounded text-[8px] font-bold transition-all border ${
                              svsSteps === step
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600'
                            }`}
                          >
                            {step}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Timing Feel */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Timing Feel</span>
                        <span className="text-[9px] font-bold text-cyan-400">
                          {svsTimingFeel < 30 ? 'Strict' : svsTimingFeel < 70 ? 'Balanced' : 'Expressive'} ({svsTimingFeel})
                        </span>
                      </div>
                      <input
                        type="range" min={0} max={100} step={5}
                        value={svsTimingFeel}
                        onChange={e => handleSvsTimingFeelChange(Number(e.target.value))}
                        className="w-full h-1.5 appearance-none bg-zinc-800 rounded-full accent-cyan-400 cursor-pointer"
                      />
                      <div className="flex justify-between text-[7px] text-zinc-600 mt-0.5">
                        <span>Strict</span><span>Balanced</span><span>Expressive</span>
                      </div>
                    </div>

                    {/* Portamento */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Portamento</span>
                        <span className="text-[9px] font-bold text-cyan-400">{svsPortamento}ms</span>
                      </div>
                      <input
                        type="range" min={0} max={300} step={10}
                        value={svsPortamento}
                        onChange={e => handleSvsPortamentoChange(Number(e.target.value))}
                        className="w-full h-1.5 appearance-none bg-zinc-800 rounded-full accent-indigo-400 cursor-pointer"
                      />
                      <div className="flex justify-between text-[7px] text-zinc-600 mt-0.5">
                        <span>None</span><span>Smooth</span><span>Glide</span>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              <button
                onClick={() => { setShowRenderPrompt(false); triggerVocalSynthesis(false, modalSelectedTracks.length > 0 ? modalSelectedTracks : tracks.map(t => t.id)); }}
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-400 to-indigo-500 text-black font-black text-xs uppercase tracking-widest rounded-xl hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-98 transition-all duration-200 mt-3"
              >
                Render Now
              </button>
              <button onClick={() => setShowRenderPrompt(false)} className="w-full mt-2.5 py-3 px-4 bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-xl active:scale-98 transition-all duration-200">
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── [VOCALIDO RENDER OVERLAY] ── */}
        {isRenderingVocal && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center pointer-events-none">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" />
            {/* Card */}
            <div className="relative z-10 w-[340px] max-w-[90vw] p-5 bg-zinc-950/95 border border-zinc-700/80 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-2xl flex items-center gap-4 animate-in zoom-in-95 fade-in duration-300 pointer-events-auto">
              {/* Left side: Circular Progress */}
              <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="50" cy="50" r="44"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    className="text-white/10"
                  />
                  {!renderError && (
                    <circle
                      cx="50" cy="50" r="44"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray="276.5"
                      strokeDashoffset={276.5 - (276.5 * renderProgress) / 100}
                      strokeLinecap="round"
                      fill="transparent"
                      className="text-cyan-400 transition-[stroke-dashoffset] duration-150 linear"
                    />
                  )}
                </svg>
                <span className="text-[13px] font-black text-white tabular-nums drop-shadow-md">
                  {renderError ? "⚠️" : `${Math.round(renderProgress)}%`}
                </span>
              </div>

              {/* Right side: Info and actions */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  AI Voice Synthesis
                </span>
                
                <span className={`text-[13px] font-bold tracking-wide truncate mt-1 ${renderError ? 'text-rose-400' : 'text-cyan-300'}`}>
                  {renderError 
                    ? "Synthesis Failed" 
                    : (renderStatusText || (renderProgress > 95 ? "Finalizing Audio..." : "Rendering vocals..."))
                  }
                </span>

                <div className="text-[9px] text-zinc-500 font-medium tracking-wide mt-0.5 flex gap-1 truncate">
                  <span>{(activeVoiceName || 'Vocalido Soprano').toUpperCase()}</span>
                  <span>•</span>
                  <span>{(activeLyricMode || 'Standard').toUpperCase()}</span>
                  <span>•</span>
                  <span className="tabular-nums text-zinc-400">{renderTimer}s</span>
                </div>

                {/* Actions row */}
                <div className="flex gap-3 mt-3">
                  {renderError ? (
                    <>
                      <button 
                        onClick={() => triggerVocalSynthesis()}
                        className="text-[10px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-widest transition-all"
                      >
                        Try Again
                      </button>
                      <button 
                        onClick={closeRenderOverlay} 
                        className="text-[10px] font-black text-zinc-500 hover:text-zinc-400 uppercase tracking-widest transition-all"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={cancelVocalSynthesis}
                      className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-widest transition-all"
                    >
                      Cancel Synthesis
                    </button>
                  )}
                </div>
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
            <Suspense fallback={<div className="p-4 text-zinc-400">Loading chord page...</div>}><ChordPage song={song} musicXml={musicXml ?? null} /></Suspense>
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
            
            {/* MOCK SPONSOR AD FOR FREE USERS */}
            {isFree && (
              <div className="w-full max-w-[500px] bg-[#0c0c0e]/90 border border-amber-500/20 backdrop-blur-3xl rounded-2xl p-2 px-3 flex items-center justify-between pointer-events-auto shadow-2xl select-none scale-[0.95] sm:scale-100 transition-all mb-0.5">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-500/10 text-amber-500 text-[6.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">AD</span>
                  <p className="text-[7.5px] sm:text-[8px] text-zinc-300 font-bold uppercase tracking-widest leading-tight">
                    Upgrade to <strong className="text-amber-400">PRO</strong> to save songs offline and remove ads!
                  </p>
                </div>
                <button 
                  onClick={() => onNavigate?.('subscription')}
                  className="bg-amber-500 hover:bg-amber-600 text-black text-[7.5px] sm:text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg transition-all active:scale-95 shrink-0 ml-2"
                >
                  Upgrade
                </button>
              </div>
            )}

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

            <div className="w-full max-w-[calc(100vw-8px)] md:max-w-[640px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-full h-[54px] min-[360px]:h-[64px] flex items-center justify-between px-1.5 min-[360px]:px-2.5 sm:px-3 md:px-4 pointer-events-auto relative">
              {/* LEFT GROUP: Mixer Toggle, Volume & SCR vertically stacked */}
              <div className="flex items-center gap-1.5 min-[360px]:gap-2 border-r border-zinc-100 pr-1.5 min-[360px]:pr-2.5 md:pr-3.5">
                <button
                  onClick={() => setShowMixer(!showMixer)}
                  className={`w-8 h-8 min-[380px]:w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all ${
                    showMixer ? 'bg-zinc-100 text-black' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'
                  }`}
                  title="Toggle Mixer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 min-[380px]:w-4 min-[380px]:h-4 sm:w-[18px] sm:h-[18px]" />
                </button>

                {/* Vertical stack for Volume and SCR */}
                <div className="flex flex-col gap-0.5 items-center justify-center">
                  {/* Volume Trigger */}
                  <div className="relative" ref={volumePopupRef}>
                    <button
                      onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                      className={`w-6 h-6 min-[360px]:w-7 h-7 rounded-full flex items-center justify-center transition-all border ${
                        showVolumeSlider
                          ? 'border-cyan-400 bg-cyan-50 text-cyan-600 shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                          : 'border-transparent text-zinc-400 hover:text-cyan-500 hover:bg-zinc-50'
                      }`}
                      title="Volume Control"
                    >
                      {masterVolume === 0 ? (
                        <VolumeX className="w-2.5 h-2.5 min-[360px]:w-3 h-3" />
                      ) : (
                        <Volume2 className={`w-2.5 h-2.5 min-[360px]:w-3 h-3 ${showVolumeSlider ? 'text-cyan-600' : 'text-zinc-400 hover:text-cyan-500'}`} />
                      )}
                    </button>

                    {showVolumeSlider && (
                      <div
                        className="absolute bottom-[36px] left-[-10px] w-12 h-48 bg-[#0c0c0e]/95 backdrop-blur-2xl rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 p-2.5 flex flex-col items-center animate-in slide-in-from-bottom-3 duration-300 z-[9999] select-none touch-none"
                        onPointerDown={(e) => {
                          volumeDragStartYRef.current = e.clientY;
                          volumeDragStartVolRef.current = masterVolume;
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          e.stopPropagation();
                        }}
                        onPointerMove={(e) => {
                          if (volumeDragStartYRef.current === null) return;
                          const deltaY = volumeDragStartYRef.current - e.clientY;
                          const trackHeight = 100;
                          const newVol = Math.max(0, Math.min(1, volumeDragStartVolRef.current + deltaY / trackHeight));
                          setMasterVolume(newVol);
                          musicEngine.setMasterVolume(newVol);
                        }}
                        onPointerUp={() => { volumeDragStartYRef.current = null; }}
                        onPointerCancel={() => { volumeDragStartYRef.current = null; }}
                      >
                        <div className="flex-1 w-2 bg-black rounded-full relative overflow-hidden border border-white/5 shadow-inner cursor-ns-resize">
                          <div
                            className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-cyan-600 via-cyan-400 to-white shadow-[0_0_10px_rgba(0,229,255,0.6)]"
                            style={{ height: `${masterVolume * 100}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-col items-center shrink-0">
                          <div className="bg-black/80 px-1 py-0.5 rounded-lg border border-cyan-500/30 flex items-center justify-center min-w-[24px]">
                            <span className="text-[10px] font-black text-cyan-400 lcd-font tracking-tighter leading-none">{Math.round(masterVolume * 100)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SCR (Score toggle) */}
                  <button
                    onClick={() => setActiveCard(activeCard === 'score' ? 'pianoroll' : 'score')}
                    className={`w-6 h-6 min-[360px]:w-7 h-7 border rounded-full flex flex-col items-center justify-center group active:scale-95 transition-all ${
                      activeCard === 'score' ? 'bg-[#fbfbfb] border-zinc-100 text-zinc-400' : 'bg-cyan-50 border-cyan-100 text-cyan-500'
                    }`}
                    title="Toggle Score View"
                  >
                    <Music className={`w-2.5 h-2.5 min-[360px]:w-3 h-3 ${activeCard === 'score' ? 'text-zinc-400 group-hover:text-zinc-600' : 'text-cyan-500'}`} />
                  </button>
                </div>
              </div>
 
              {/* CENTER GROUP: Narrow LCD Display */}
              <div className="flex-1 flex justify-center px-1">
                <div className="w-[130px] min-[350px]:w-[148px] min-[380px]:w-[168px] sm:w-[215px] md:w-[250px] h-[34px] min-[360px]:h-[40px] bg-[#0c0c0e] rounded-md flex items-center border border-black shadow-inner overflow-hidden">
                  <div className="flex-1 h-full border-r border-white/[0.03] flex items-center justify-center">
                    <KeyTransposeDisplay keySig={parsedData.metadata.key || localSong.key} transpose={transpose} onTransposeChange={setTranspose} />
                  </div>
                  <div className="flex-1 h-full border-r border-white/[0.03] flex items-center justify-center">
                    <BpmDisplay bpm={currentBpm} onBpmChange={(b) => { setCurrentBpm(b); musicEngine.setBpm(b); }} />
                  </div>
                  <div className="flex-1 h-full flex items-center justify-center">
                    <BarBeatPositionDisplay bar={currentBar} beat={currentBeat} onSeek={(bar) => musicEngine.setTransportSeconds((bar - 1) * beatsPerMeasure * 60 / currentBpm)} />
                  </div>
                </div>
              </div>
 
              {/* RIGHT GROUP: Large Back and Play/Pause Controls */}
              <div className="flex items-center gap-1.5 min-[360px]:gap-2 pl-1 min-[360px]:pl-1.5 pr-1.5 min-[360px]:pr-2.5">
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
                  className="w-8 h-8 min-[360px]:w-9 h-9 sm:w-10 sm:h-10 md:w-[44px] md:h-[44px] rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 hover:text-black flex items-center justify-center transition-all active:scale-95"
                >
                  <SkipBack className="w-3.5 h-3.5 min-[360px]:w-4 min-[360px]:h-4 sm:w-[19px] sm:h-[19px]" fill="currentColor" />
                </button>
 
                {/* Play/Pause Button */}
                <div className="relative">
                  <div className={`absolute inset-0 bg-[#00e5ff]/20 blur-md rounded-full transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
                  <button
                    onClick={handleTogglePlay}
                    disabled={isAudioLoading}
                    className="relative w-10 h-10 min-[360px]:w-11 h-11 sm:w-12 sm:h-12 md:w-[54px] md:h-[54px] rounded-full flex items-center justify-center text-white transition-all active:scale-95 bg-[#00e5ff] hover:bg-[#00c8e0] shadow-[0_4px_25px_rgba(0,229,255,0.5)]"
                  >
                    {isAudioLoading ? (
                      <RefreshCw className="animate-spin text-white/50 w-4 h-4 sm:w-5 sm:h-5" />
                    ) : isPlaying ? (
                      <Pause className="w-4 h-4 sm:w-[24px] sm:h-[24px]" fill="white" />
                    ) : (
                      <Play className="w-4 h-4 sm:w-[24px] sm:h-[24px] ml-0.5 sm:ml-1" fill="white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── VOCALIDO SETUP MODAL ── */}
      {showVocalidoSetup && (
        <div className="fixed inset-0 z-[9500] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowVocalidoSetup(false); }}>
          <div className="w-full max-w-md max-h-[90vh] bg-[#0c0c0e] border border-white/10 rounded-[40px] p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
              <h3 className="text-lg font-black uppercase text-white tracking-tighter flex items-center gap-3">
                <Mic2 size={20} className="text-cyan-400" /> Vocalido Setup
              </h3>
              <button onClick={() => setShowVocalidoSetup(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 custom-scrollbar">

              {/* Audio AI Engine Settings integrated here */}
              <Suspense fallback={<div className="p-4 text-zinc-400">Loading settings...</div>}><AudioEngineSettings /></Suspense>

              {/* Custom SVS Backend URL */}
              <div className="flex flex-col gap-1.5 bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                  Custom SVS Backend URL
                </span>
                <span className="text-[8px] text-zinc-500">
                  สำหรับใช้งานบน Vercel/มือถือ ให้กรอก HTTPS Tunnel URL (เช่น Serveo / Localtunnel)
                </span>
                <div className="flex gap-2 mt-1 w-full">
                  <input
                    type="text"
                    value={customBackendUrl}
                    onChange={handleCustomBackendUrlChange}
                    placeholder="https://your-tunnel.serveo.net"
                    className="flex-1 min-w-0 bg-[#0c0c0e] border border-white/10 focus:border-cyan-500 rounded-xl px-3 py-2 text-[10px] text-white focus:outline-none transition-all placeholder:text-zinc-600"
                  />
                  <button
                    onClick={() => {
                      window.dispatchEvent(new Event('vocalido_backend_url_changed'));
                    }}
                    className={`shrink-0 rounded-xl px-4 py-2 text-[10px] font-bold transition-all ${
                      isServerOnline 
                        ? 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 shadow-[0_0_12px_rgba(0,229,255,0.15)]' 
                        : 'bg-[#0c0c0e] text-zinc-400 border border-white/10 hover:border-cyan-500 hover:text-cyan-400'
                    }`}
                  >
                    {isServerOnline ? 'Connected' : 'Connect'}
                  </button>
                </div>
              </div>

              {/* AI Voice Model Selection */}
              <div className="flex flex-col gap-1.5 bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Mic2 size={10} className="text-cyan-400" /> AI Voice Model
                </span>
                <span className="text-[8px] text-zinc-500">
                  เลือกโมเดลเสียงร้อง AI สำหรับเพลงนี้ (เช่น Lotte V, Canary, Tiger)
                </span>
                {voiceEngines.length === 0 ? (
                  <span className="text-[9px] text-zinc-400 italic">กำลังโหลดโมเดลเสียง...</span>
                ) : (
                  <select
                    value={activeEngineId}
                    onChange={handleEngineChange}
                    className="mt-1 w-full bg-[#0c0c0e] border border-white/10 focus:border-cyan-500 rounded-xl px-3 py-2 text-[10px] text-white focus:outline-none transition-all"
                  >
                    {voiceEngines.map((voice) => (
                      <option key={voice.id} value={voice.id} className="bg-[#0c0c0e] text-white text-[10px]">
                        {voice.name} ({voice.lang.toUpperCase()} - {voice.type})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* SVS Rendering Mode */}
              <div className="flex flex-col gap-2 bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                  SVS Rendering Mode
                </span>
                <span className="text-[8px] text-zinc-500">
                  เลือกโหมดการเรนเดอร์เสียงร้อง AI (On-Device เหมาะสำหรับ PC/สเปคสูง, Server-Side เหมาะสำหรับมือถือ/เน็ตช้า)
                </span>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => handleSvsEngineChange('browser-ai')}
                    className={`flex-1 py-2 text-[9px] font-black uppercase rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                      svsEngine === 'browser-ai'
                        ? 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40 shadow-[0_0_12px_rgba(0,229,255,0.15)]'
                        : 'bg-transparent text-zinc-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] shadow-[0_0_6px_rgba(0,229,255,0.6)]" />
                    On-Device (Browser AI)
                  </button>
                  <button
                    disabled={!isServerOnline}
                    onClick={() => handleSvsEngineChange('vocalido')}
                    className={`flex-1 py-2 text-[9px] font-black uppercase rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                      !isServerOnline
                        ? 'bg-[#0c0c0e]/60 text-zinc-600 border-white/5 cursor-not-allowed opacity-50'
                        : svsEngine === 'vocalido'
                        ? 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40 shadow-[0_0_12px_rgba(0,229,255,0.15)]'
                        : 'bg-transparent text-zinc-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      !isServerOnline 
                        ? 'bg-zinc-700 shadow-none' 
                        : svsEngine === 'vocalido' 
                        ? 'bg-[#00e5ff] shadow-[0_0_6px_rgba(0,229,255,0.6)]' 
                        : 'bg-zinc-500 shadow-none'
                    }`} />
                    Server-Side {isServerOnline ? '(Vocalido)' : '(Offline)'}
                  </button>
                </div>
              </div>

              {/* SVS Quality & Speed */}
              <div className="flex flex-col gap-2 bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                  SVS Quality & Speed
                </span>
                <span className="text-[8px] text-zinc-500">
                  Diffusion Steps — ยิ่งสูง เสียงยิ่งใส คมชัด (ไม่กระทบ Playback, เพิ่มเวลา Render เท่านั้น)
                </span>
                <div className="grid grid-cols-4 gap-1.5 mt-1">
                  <button
                    onClick={() => handleSvsStepsChange(6)}
                    className={`py-2 text-[8px] font-black uppercase rounded-xl border transition-all ${
                      svsSteps === 6
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        : 'bg-transparent text-zinc-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    Draft<br/><span className="text-[7px] opacity-60">6 steps</span>
                  </button>
                  <button
                    onClick={() => handleSvsStepsChange(10)}
                    className={`py-2 text-[8px] font-black uppercase rounded-xl border transition-all ${
                      svsSteps === 10
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        : 'bg-transparent text-zinc-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    Fast<br/><span className="text-[7px] opacity-60">10 steps</span>
                  </button>
                  <button
                    onClick={() => handleSvsStepsChange(20)}
                    className={`py-2 text-[8px] font-black uppercase rounded-xl border transition-all ${
                      svsSteps === 20
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        : 'bg-transparent text-zinc-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    HD<br/><span className="text-[7px] opacity-60">20 steps</span>
                  </button>
                  <button
                    onClick={() => handleSvsStepsChange(40)}
                    className={`py-2 text-[8px] font-black uppercase rounded-xl border transition-all ${
                      svsSteps === 40
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                        : 'bg-transparent text-zinc-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    Studio<br/><span className="text-[7px] opacity-60">40 steps</span>
                  </button>
                </div>
              </div>



              {/* Jianpu info */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1">Active Mode: <span className="text-cyan-400">{activeLyricMode}</span></p>
                <p className="text-[9px] text-zinc-500">
                  {activeLyricMode === 'Jianpu' ? '🇨🇳 Using Chinese phoneme engine (Jianpu 简谱)' : '🌐 Using English/Solfège phoneme engine'}
                </p>
              </div>

              {/* Cache Tools */}
              <div className="flex flex-col gap-2 bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
                  Cache Management (จัดการแคชเสียงร้อง)
                </span>
                <span className="text-[8px] text-zinc-500">
                  ล้างข้อมูลเสียงร้องเกรดหยาบ/แหบ เพื่อบังคับสร้างไฟล์เสียงระดับ Studio คุณภาพสูงใหม่
                </span>
                <button
                  onClick={handleClearCache}
                  className={`mt-1 py-2 text-[9px] font-black uppercase rounded-xl border transition-all ${
                    cacheClearedText
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                  }`}
                >
                  {cacheClearedText ? '✓ Cleared! (ล้างแคชเรียบร้อยแล้ว)' : 'Clear Vocal Cache (ล้างแคชเสียงร้อง AI)'}
                </button>
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
                  <button onClick={() => { 
                    setRenderHistory([]); 
                    if (song?.id) { 
                      localStorage.removeItem(`memo_render_history_${song.id}`); 
                      tracks.forEach(t => localStorage.removeItem(`memo_render_history_${song.id}_${t.id}`));
                      AudioBlobCache.deleteSongCache(song.id); 
                    }
                    if (activeRenderKey) {
                      setActiveRenderKey(null);
                      musicEngine.pause();
                      setIsPlaying(false);
                      const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
                      musicEngine.clearVocalLayers(primaryTrackId);
                      const updatedTracks = tracks.map((t: any) => 
                        t.id === primaryTrackId ? { ...t, mode: 'instrument' } as TrackState : t
                      );
                      setTracks(updatedTracks);
                      musicEngine.loadSong(allPlayableNotes, updatedTracks, transpose, parsedData?.timeSignature, isMetronomeOn).catch(() => {});
                    }
                  }}
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
