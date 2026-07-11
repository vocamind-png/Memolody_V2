
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Home, User, Music2, Play, Zap, RefreshCcw, Star, Shield, Sparkles, Mic2, Settings } from 'lucide-react';
// Lazy load Nimo - only loads JS bundle when user first clicks NIMO
const FloatingNimo = lazy(() => import('./components/Nimo/FloatingNimo').then(m => ({ default: m.FloatingNimo })));

// Lazy — Tone.js (283KB) only loads when user opens a song
let _musicEngine: typeof import('./lib/MusicEngine')['musicEngine'] | null = null;
const getMusicEngine = async () => {
  if (!_musicEngine) {
    const mod = await import('./lib/MusicEngine');
    _musicEngine = mod.musicEngine;
  }
  return _musicEngine;
};

import { initPlugins } from './lib/plugin-init';
import { telemetry } from './lib/Telemetry';
import { midiInputManager } from './lib/MidiInputManager';
import { songStorage } from './lib/SongStorage';
import { DEMO_SONGS } from './data/demo_songs';
import { SplashLoader } from './components/Home/SplashLoader';
import { CloudSyncService } from './lib/CloudSyncService';
import { Song, TrackState, LyricMode } from './types';
import { LoopPreset } from './components/Player/LoopMatrixModal';
import { useAuth, hasAccess } from './lib/useAuth';
import { nimoBrain } from './lib/NimoBrain';
import AuthForm from './components/Profile/AuthForm';

// ── Lazy-load ALL heavy page components ──
const HomePage = lazy(() => import('./components/Home/HomePage'));
const PlayerPage = lazy(() => import('./components/Player/PlayerPage'));
import { mapPartNameToInstrument } from './lib/instruments';
const VaultPage = lazy(() => import('./components/Vault/VaultPage'));
const StudioPage = lazy(() => import('./components/Studio/StudioPage'));
const ProfilePage = lazy(() => import('./components/Profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage'));
const DistributionPage = lazy(() => import('./components/Distribution/DistributionPage'));
const NimoPage = lazy(() => import('./components/Nimo/NimoPage'));
const BrandingPage = lazy(() => import('./components/Presentation/BrandingPage'));
const AdminPage = lazy(() => import('./components/Admin/AdminPage'));
const PricingPage = lazy(() => import('./components/Subscription/PricingPage'));
// Game moved to Devel/ folder for future standalone app

// ── Error Boundary for lazy-loaded pages ──
interface EBState { hasError: boolean; error?: Error }
interface EBProps { children: React.ReactNode }
class PageErrorBoundary extends React.Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    (this as any).state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(err: Error, errorInfo: any) { 
    console.error('[EB] lazy fail:', err, errorInfo);
    // Auto-reload on chunk load failures (stale cache after deployment)
    if (err.message && (err.message.includes('Failed to fetch dynamically imported module') || 
                        err.message.includes('Loading chunk'))) {
      const reloaded = sessionStorage.getItem('eb_chunk_reload');
      if (!reloaded) {
        sessionStorage.setItem('eb_chunk_reload', '1');
        console.warn('[EB] Stale chunk detected, auto-reloading (cache-busting)...');
        window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
      }
    }
  }
  render(): React.ReactNode {
    if (((this as any).state as EBState).hasError) {
      const err = ((this as any).state as any).error;
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <p className="text-zinc-600 text-[9px] uppercase tracking-widest">Page failed — tap to reload</p>
          <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs w-full max-w-2xl overflow-auto rounded-xl">
            {err ? err.toString() : 'Unknown Error'}
            <br/><br/>
            {err && err.stack ? err.stack.split('\n').map((line: string, i: number) => <div key={i}>{line}</div>) : null}
          </div>
          <button onClick={() => {
              sessionStorage.removeItem('eb_chunk_reload');
              window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
            }}
            className="px-4 py-2 bg-cyan-500 text-black text-[9px] font-black uppercase rounded-xl">
            Reload Force
          </button>
        </div>
      );
    }
    return ((this as any).props as EBProps).children;
  }
}

// ── Minimal loading fallback with auto-recover ──
const PageLoader = () => {
  useEffect(() => {
    // If Suspense spins for >12s it means HMR invalidated the lazy chunk — reload
    const t = setTimeout(() => {
      console.warn('[Memolody] Lazy chunk timeout — reloading...');
      window.location.reload();
    }, 30000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );
};

type ViewId = 'home' | 'library' | 'player' | 'profile' | 'forge' | 'distribution' | 'settings' | 'nimo' | 'presentation' | 'admin' | 'subscription';

const INITIAL_LOOP_PRESETS: LoopPreset[] = [
  { id: 'intro', label: 'Intro', color: '#00e5ff', startBar: 1, endBar: 4, isActive: false },
  { id: 'verse', label: 'Verse', color: '#10b981', startBar: 5, endBar: 12, isActive: false },
  { id: 'chorus', label: 'Chorus', color: '#ffab00', startBar: 13, endBar: 20, isActive: false },
  { id: 'bridge', label: 'Bridge', color: '#ef4444', startBar: 21, endBar: 28, isActive: false },
  { id: 'solo', label: 'Solo', color: '#6366f1', startBar: 29, endBar: 36, isActive: false },
  { id: 'outro', label: 'Outro', color: '#a855f7', startBar: 37, endBar: 44, isActive: false },
  { id: 'custom', label: 'Custom', color: '#ffffff', startBar: 1, endBar: 100, isActive: false },
];

const NAV_ITEMS: { id: ViewId; icon: any; label: string; minRole?: string; isNimo?: boolean }[] = [
  { id: 'home', icon: Home, label: 'HOME' },
  { id: 'player', icon: Play, label: 'PLAYER' },
  { id: 'profile', icon: User, label: 'ME' },
  { id: 'settings', icon: Settings, label: 'SETTINGS' },
  { id: 'admin', icon: Shield, label: 'CORE', minRole: 'admin' },
];

const App: React.FC = () => {
  const { authUser, role, loading: authLoading } = useAuth();
  const isFree = (() => {
    const storedTier = typeof window !== 'undefined' ? localStorage.getItem('mock_membership_tier') : null;
    if (storedTier && storedTier !== 'free') return false; // Upgraded mock tier
    if (!authUser) return true; // Default to free if not logged in
    return authUser.membershipTier === 'free';
  })();
  const isAdmin = hasAccess(role, 'admin');
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasStartedSplash, setHasStartedSplash] = useState(true); // Auto-start, no TAP TO START needed
  const [initProgress, setInitProgress] = useState(0);

  const [initStatus, setInitStatus] = useState('Booting Audio System...');
  const [isNimoOpen, setIsNimoOpen] = useState(false);
  const [nimoMounted, setNimoMounted] = useState(true); // Always mount for sidebar mode
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [uploadedMusicXml, setUploadedMusicXml] = useState<string | null>(null);
  const [selectedLayoutBundle, setSelectedLayoutBundle] = useState<any | null>(null);
  const [userSongs, setUserSongs] = useState<{ metadata: Song, xmlData: string, layoutBundle?: any | null }[]>([]);
  const userSongsRef = React.useRef(userSongs); // ref to avoid stale closure in callbacks
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [playerViewMode, setPlayerViewMode] = useState<'score' | 'pianoroll'>('score');
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = React.useRef(false); // ref to prevent cascade re-renders from isSyncing dep
  const [onlineStatus, setOnlineStatus] = useState<'online' | 'offline'>('online');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  const { bgmUrl, bgmTitle, bgmCover } = React.useMemo(() => {
    try {
      const title = selectedSong ? selectedSong.title.toLowerCase() : '';
      if (title.includes('minuet')) return { bgmUrl: '/audio/minuet_in_g.mp3', bgmTitle: 'Minuet in G (Ambient)', bgmCover: '/images/memolody_hero.png' };
      if (title.includes('bird')) return { bgmUrl: '/audio/bird_choir.mp3', bgmTitle: 'Bird Choir (Ambient)', bgmCover: '/images/memolody_hero.png' };
      if (title.includes('forest')) return { bgmUrl: '/audio/forest_bgm.mp3', bgmTitle: 'Forest (Ambient)', bgmCover: '/images/memolody_hero.png' };
    } catch(e) {}
    return { bgmUrl: '/audio/Where_Dreams_Align.mp3', bgmTitle: 'Where Dreams Align', bgmCover: '/images/memolody_hero.png' };
  }, [selectedSong]);
  const [performanceMode, setPerformanceMode] = useState(() => localStorage.getItem('nimo_perf_mode') === 'true');
  const [uiTheme, setUiTheme] = useState<'v1' | 'v2'>(() => (localStorage.getItem('memo_ui_theme') as 'v1' | 'v2') || 'v2');
  const [nimoPosition, setNimoPosition] = useState<'left' | 'right'>(() => (localStorage.getItem('nimo_position') as 'left' | 'right') || 'left');
  const [layoutMode, setLayoutMode] = useState<'compact' | 'full'>(() => {
    if (typeof window === 'undefined') return 'compact';
    const isDesktop = window.innerWidth >= 1024;
    if (!isDesktop) return 'compact'; // Force compact on mobile devices regardless of saved settings
    
    const autoUpgraded = localStorage.getItem('memo_layout_auto_upgraded');
    let saved = localStorage.getItem('memo_layout_mode') as 'compact' | 'full' | null;

    if (isDesktop && !autoUpgraded) {
      saved = 'full';
      localStorage.setItem('memo_layout_auto_upgraded', 'true');
    }
    
    return saved || 'full';
  });
  const [studioInitialMode, setStudioInitialMode] = useState<'composer' | 'arranger' | 'editor' | 'youtube' | 'pianoroll'>('arranger');
  const [loopPresets, setLoopPresets] = useState<LoopPreset[]>(INITIAL_LOOP_PRESETS);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [autoPlayOnLoad, setAutoPlayOnLoad] = useState(false); // true after OMR import → Player auto-starts
  const [isSongLoading, setIsSongLoading] = useState(false);
  // Settings
  const [preferredLanguage, setPreferredLanguage] = useState<'th' | 'en'>(() => (localStorage.getItem('nimo_lang') as any) || 'en');
  const [userCountry, setUserCountry] = useState(() => localStorage.getItem('nimo_country') || 'Other');
  const [userInstrument, setUserInstrument] = useState<'piano' | 'violin' | 'voice' | 'guitar'>('piano');
  const [vocalidoAutoRender, setVocalidoAutoRender] = useState(() => {
    const saved = localStorage.getItem('vocalido_auto_render');
    if (saved === null) return true; // Default ON
    return saved === 'true';
  });
  const [vocalidoRenderCardStyle, setVocalidoRenderCardStyle] = useState<'compact' | 'large'>(() => {
    return (localStorage.getItem('vocalido_render_card_style') as 'compact' | 'large') || 'compact';
  });
  const [nimoEnabled, setNimoEnabled] = useState(() => localStorage.getItem('nimo_enabled') !== 'false');
  const [nimoVoice, setNimoVoice] = useState<'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man'>(() => (localStorage.getItem('nimo_voice') as any) || 'teen_girl');
  const [nimoModel, setNimoModel] = useState<string>(() => localStorage.getItem('nimo_model') || 'gemini-3.5-flash');

  // Listen for dynamic Nimo voice updates from other components
  useEffect(() => {
    const handleVoiceChange = () => {
      const stored = localStorage.getItem('nimo_voice');
      if (stored) {
        setNimoVoice(stored as any);
      }
    };
    window.addEventListener('nimo_voice_changed', handleVoiceChange);
    return () => window.removeEventListener('nimo_voice_changed', handleVoiceChange);
  }, []);

  // Apply UI Theme class to body
  useEffect(() => {
    document.body.classList.remove('theme-v1', 'theme-v2');
    document.body.classList.add(`theme-${uiTheme}`);
    localStorage.setItem('memo_ui_theme', uiTheme);
  }, [uiTheme]);

  // Remove native HTML splash screen smoothly when React finishes initializing
  useEffect(() => {
    if (!isInitializing) {
      const splash = document.getElementById('native-splash');
      if (splash) {
        splash.style.opacity = '0';
        splash.style.visibility = 'hidden';
        setTimeout(() => {
          if (splash.parentNode) {
            splash.parentNode.removeChild(splash);
          }
        }, 600);
      }
    }
  }, [isInitializing]);

  // Save Nimo Position
  useEffect(() => {
    localStorage.setItem('nimo_position', nimoPosition);
  }, [nimoPosition]);

  // Apply Layout Mode class to #root
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      root.classList.remove('layout-compact', 'layout-full');
      root.classList.add(`layout-${layoutMode}`);
    }
    localStorage.setItem('memo_layout_mode', layoutMode);
  }, [layoutMode]);

  // Listen for window resize to dynamically force compact mode on mobile screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024 && layoutMode !== 'compact') {
        setLayoutMode('compact');
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Run on mount/state update
    return () => window.removeEventListener('resize', handleResize);
  }, [layoutMode]);

  // Save currentView to localStorage on change and sync with History API
  useEffect(() => {
    try {
      localStorage.setItem('memo_current_view', currentView);
    } catch (e) {}
    
    // Support Android Back Button: Push state to browser history when view changes
    if (window.history.state?.view !== currentView) {
      window.history.pushState({ view: currentView }, '');
    }
  }, [currentView]);

  // Handle system Back button (popstate)
  useEffect(() => {
    // Set initial state for history API if none exists
    if (!window.history.state) {
      window.history.replaceState({ view: 'home' }, '');
    }
    
    const handlePopState = (event: PopStateEvent) => {
      const stateView = event.state?.view;
      if (stateView) {
        setCurrentView(stateView as ViewId);
      } else {
        setCurrentView('home');
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Save selectedSong ID to localStorage on change
  useEffect(() => {
    try {
      if (selectedSong) {
        localStorage.setItem('memo_selected_song_id', selectedSong.id);
      } else {
        localStorage.removeItem('memo_selected_song_id');
      }
    } catch (e) {}
  }, [selectedSong]);

  useEffect(() => {
    const startTime = Date.now();
    let hasTransitioned = false;

    const forceTimeout = setTimeout(() => {
      if (!hasTransitioned) {
        hasTransitioned = true;
        console.warn('[App] Initialization took too long (>30s), forcing Home screen entry.');
        setIsInitializing(false);
      }
    }, 30000);

    (async () => {
      try {
        setInitProgress(15);
        setInitStatus('Initializing Local Database');
        await songStorage.init();
        setInitProgress(35);

        // 🚨 AUTO-CLEAR CACHE ON NEW BUILD/REINSTALL
        const APP_VERSION = '2.5.0-build-20260708-0001';
        const savedVersion = localStorage.getItem('memo_app_version');
        if (savedVersion !== APP_VERSION) {
          setInitStatus('Wiping Old Cache');
          console.log(`[App] 🔄 New Build/Reinstall detected: Wiping all cached data (old=${savedVersion}, new=${APP_VERSION})`);
          await songStorage.deleteAllSongs();
          
          // Clear all localStorage keys
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('tracks_state_') ||
              key.startsWith('memo_render_history_') ||
              key.startsWith('active_render_key_') ||
              key.startsWith('memo_render_u') ||
              key.startsWith('memo_selected_song_id') ||
              key.startsWith('memo_current_view') ||
              key.startsWith('memo_active_card')
            )) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));

          // Clear all Cache Storage keys (excluding model files)
          if ('caches' in window) {
            try {
              const names = await caches.keys();
              for (const name of names) {
                if (name.indexOf('vocalido-models') === -1) {
                  await caches.delete(name);
                  console.log('[App] Auto-cleared cache storage:', name);
                }
              }
            } catch (cacheErr) {
              console.warn('[App] Failed to clear cache storage:', cacheErr);
            }
          }

          localStorage.setItem('memo_app_version', APP_VERSION);
          
          // Force clear sessionStorage too so session checks run fresh
          sessionStorage.removeItem('memo_session_active');
        }

        // 🚨 Free Tier Session Wiping: We no longer wipe caches aggressively
        // so that returning users don't lose their local renders and tracks.
        const sessionActive = typeof window !== 'undefined' ? sessionStorage.getItem('memo_session_active') : 'true';
        if (!sessionActive) {
          sessionStorage.setItem('memo_session_active', 'true');
        }

        // Check if forceTimeout has already fired (isInitializing is already false)
        // If it did, we should still perform the updates in background but skip UI progress updates if not needed.
        setInitProgress(45);
        setInitStatus('Configuring Audio Plugins');
        await initPlugins(); // Initialize the Plugin System (including Vocalido)
        setInitProgress(65);

        // Initialize Demo Songs if they are missing
        setInitStatus('Loading Demo Songs');
        let songs = await songStorage.getAllSongs();
        
        // Initialization complete

        setInitProgress(75);

        setInitStatus('Loading Songs Library');
        await songStorage.permanentDeleteSong('demo-vocal-01'); // User specifically requested deletion
        if (songs.length < 50) { // If there are fewer than 50 songs, assume they need a sync from GCS
          if (songs.length === 0) {
            setInitStatus('Downloading Music Library (First Time Setup)...');
            setInitProgress(0);
            
            setIsSyncing(true);
            try {
              await CloudSyncService.syncWithGlobalCloud((percent) => {
                setInitProgress(percent);
                setInitStatus(`Importing Library... ${percent}%`);
              });
              songs = await songStorage.getAllSongs();
            } catch (syncErr: any) {
              console.warn('[App] Initial cloud sync failed:', syncErr?.message || syncErr);
            } finally {
              setIsSyncing(false);
            }
          } else {
            // Already have some songs, let's load UI fast and sync in background
            CloudSyncService.syncWithGlobalCloud().then(async () => {
              const updatedSongs = await songStorage.getAllSongs();
              setUserSongs(updatedSongs);
              userSongsRef.current = updatedSongs;
            }).catch(console.warn);
          }
        }

        // Note: Seeding demo songs is disabled per user request to keep library clean.

        userSongsRef.current = songs;
        setUserSongs(songs);

        // ── Restore saved song or auto-select default ──────────
        if (songs.length > 0) {
          const savedSongId = localStorage.getItem('memo_selected_song_id');
          let initialSong = songs.find(s => String(s.metadata.id) === String(savedSongId));
          
          if (!initialSong) {
            initialSong = songs[songs.length - 1]; // most recent fallback
          }

          if (initialSong) {
            const xml = initialSong.xmlData || '';
            // If we have local XML, set directly (fast path)
            if (xml && xml.includes('<score-partwise')) {
              setSelectedSong(initialSong.metadata);
              setUploadedMusicXml(xml);
              setSelectedLayoutBundle(initialSong.layoutBundle || null);
              console.log(`[App] 🎵 Restored song (local XML): "${initialSong.metadata.title}"`);
            } else {
              // XML is missing or corrupted — use handleSongSelect to trigger cloud fetch
              console.warn(`[App] ⚠️ xmlData empty for "${initialSong.metadata.title}", fetching from cloud...`);
              handleSongSelect(initialSong.metadata, xml, 'studio', false, { main: 'player' });
            }
          }
        } else {
          setCurrentView('home');
        }

        setInitProgress(100);
        setInitStatus('Workspace Ready');

        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, 8000 - elapsed);
        setTimeout(() => {
          if (!hasTransitioned) {
            hasTransitioned = true;
            clearTimeout(forceTimeout);
            setIsInitializing(false);
          }
        }, remainingTime);

        // Background sync runs after 5s to grab updates if we already have songs, otherwise we just synced
        if (songs.length > 0) {
          setTimeout(() => triggerSync(), 5000);
        }
      } catch (e) {
        console.error("Init Error:", e);
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, 8000 - elapsed);
        setTimeout(() => {
          if (!hasTransitioned) {
            hasTransitioned = true;
            clearTimeout(forceTimeout);
            setIsInitializing(false);
          }
        }, remainingTime);
      }
    })();

    const interval = setInterval(async () => {
      const isUp = await CloudSyncService.checkUpdateAvailability();
      setOnlineStatus(isUp ? 'online' : 'offline');
    }, 60000);
    return () => {
      clearTimeout(forceTimeout);
      clearInterval(interval);
    };
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncingRef.current) return; // use ref — not state — to prevent re-render cascade
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const syncResult = await CloudSyncService.syncWithGlobalCloud();
      if (syncResult.total >= 0) {
        const updatedSongs = await songStorage.getAllSongs();
        userSongsRef.current = updatedSongs;
        setUserSongs(updatedSongs);
        console.log(`[GCS Sync] ✅ Successfully synced ${syncResult.total} songs from GCS`);
      }
    } catch (e: any) {
      console.warn('[GCS Sync] Sync failed (non-blocking):', e.message);
      // Don't use alert() — it blocks the entire UI thread
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []); // ← no deps: uses refs to read mutable values safely

  const navigateTo = useCallback((view: ViewId, openNimo?: boolean) => {
    if (openNimo) {
      setNimoMounted(true); // mount Nimo bundle lazily on first use
      setIsNimoOpen(true);
      return;
    }
    if (view === 'player') setPlayerViewMode('score');
    setCurrentView(view);
  }, []);

  const handleToggleDelete = useCallback(async (id: string, isDeleted: boolean) => {
    try {
      await songStorage.updateSongMetadata(id, { isDeleted });
      const updated = await songStorage.getAllSongs();
      userSongsRef.current = updated;
      setUserSongs(updated);
    } catch (err) {
      alert("❌ ไม่สามารถย้ายเพลงได้:\n" + (err instanceof Error ? err.message : String(err)));
    }
  }, []); // ← no deps: reads from ref

  const handleTogglePublic = useCallback(async (id: string, isPublic: boolean) => {
    await songStorage.updateSongMetadata(id, { isPublic });
    const updated = await songStorage.getAllSongs();
    userSongsRef.current = updated;
    setUserSongs(updated);
  }, []);

  const handleBulkTogglePublic = useCallback(async (ids: string[], isPublic: boolean) => {
    await songStorage.bulkUpdateSongsMetadata(ids, { isPublic });
    const updated = await songStorage.getAllSongs();
    userSongsRef.current = updated;
    setUserSongs(updated);
  }, []);

  /** Lightweight local-only refresh — reads IndexedDB directly, no cloud sync guard */
  const handleLocalRefresh = useCallback(async () => {
    try {
      const songs = await songStorage.getAllSongs();
      userSongsRef.current = songs;
      setUserSongs(songs);
      console.log(`[LocalRefresh] ✅ Loaded ${songs.length} songs from IndexedDB`);
    } catch (e) {
      console.error('[LocalRefresh] ❌ Failed:', e);
    }
  }, []);

  const handlePermanentDelete = useCallback(async (id: string) => {
    try {
      // permanentDeleteSong removes from IndexedDB AND clears the tombstone — zero residue
      await songStorage.permanentDeleteSong(id);
      const updated = await songStorage.getAllSongs();
      userSongsRef.current = updated;
      setUserSongs(updated);
      console.log(`[Storage] ✅ Song ${id} permanently deleted from IndexedDB`);
    } catch (err) {
      alert('❌ ไม่สามารถลบเพลงได้:\n' + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const handleBulkPermanentDelete = useCallback(async (ids: string[]) => {
    try {
      // Permanently remove all — no tombstone, no residue in IndexedDB
      await Promise.all(ids.map(id => songStorage.permanentDeleteSong(id)));
      const updated = await songStorage.getAllSongs();
      userSongsRef.current = updated;
      setUserSongs(updated);
      console.log(`[Storage] ✅ ${ids.length} songs permanently deleted from IndexedDB`);
    } catch (err) {
      alert('❌ ไม่สามารถลบเพลงกลุ่มนี้ได้:\n' + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const handleBulkToggleDelete = useCallback(async (ids: string[], isDeleted: boolean) => {
    try {
      await songStorage.bulkUpdateSongsMetadata(ids, { isDeleted });
      const updated = await songStorage.getAllSongs();
      userSongsRef.current = updated;
      setUserSongs(updated);
    } catch (err) {
      alert("❌ ไม่สามารถจัดการเพลงกลุ่มนี้ได้:\n" + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const handleSongUpdate = useCallback((updatedSong: Song) => {
    setSelectedSong(updatedSong);
    const updatedList = userSongsRef.current.map(s => String(s.metadata.id) === String(updatedSong.id) ? { ...s, metadata: updatedSong } : s);
    userSongsRef.current = updatedList;
    setUserSongs(updatedList);
  }, []);

  const handleSongSelect = useCallback(async (
    song: Song, xml?: string,
    mode: 'listen' | 'studio' | 'edit' | 'play' = 'studio',
    fromMarket = false,
    desiredView?: { main: 'player' | 'tracks', player?: 'score' | 'pianoroll' }
  ) => {
    try {
      setIsSongLoading(true);
      if (mode === 'play') {
        setAutoPlayOnLoad(true);
      }
      let finalXml = xml;
      const owned = userSongsRef.current.find(s => String(s.metadata.id) === String(song.id)); // use ref — stable
      if (!finalXml) finalXml = owned?.xmlData || '';
      
      // FALLBACK: If XML is empty or corrupted, and this is a cloud song (has long ID), reconstruct the URL
      if ((!finalXml || !finalXml.includes('<score-partwise')) && !finalXml.startsWith('http') && String(song.id).length > 20) {
         console.warn("[Neural] XML data is missing or corrupted. Attempting cloud recovery...");
         finalXml = `https://storage.googleapis.com/memolody-vault/pdmx-vault/${song.id}.mxl`;
      }

      if (finalXml && finalXml.startsWith('http')) {
        try {
          console.log("[Neural] Fetching remote score:", finalXml);
          const url = finalXml;
          const urlWithoutQuery = url.split('?')[0];
          const isMxl = urlWithoutQuery.endsWith('.mxl');
          
          // Add timeout to prevent infinite loading
          const fetchController = new AbortController();
          const fetchTimeout = setTimeout(() => fetchController.abort(), 15000);
          let resp: Response;
          try {
            resp = await fetch(url, { signal: fetchController.signal });
          } finally {
            clearTimeout(fetchTimeout);
          }
          if (resp.ok) {
            if (isMxl) {
              const blob = await resp.blob();
              const JSZipModule = await import('jszip');
              const JSZip: any = JSZipModule.default || JSZipModule;
              const jszipInstance = new JSZip();
              const zip = await jszipInstance.loadAsync(blob);
              console.log("[Neural] MXL zip loaded. Files:", Object.keys(zip.files));
              let xmlContent = '';
              for (const [name, file] of Object.entries(zip.files)) {
                if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
                  console.log(`[Neural] Extracting XML from: ${name}`);
                  xmlContent = await (file as any).async('string');
                  console.log(`[Neural] Extracted XML length: ${xmlContent.length}`);
                  break;
                }
              }
              if (!xmlContent) {
                 console.error("[Neural] CRITICAL: No XML found in MXL or extraction failed!");
              }
              finalXml = xmlContent || '';
            } else {
              finalXml = await resp.text();
            }
            if (owned && finalXml) {
              await songStorage.saveSong(owned.metadata, finalXml);
            }
          } else {
            throw new Error(`HTTP Error ${resp.status}`);
          }
        } catch (e: any) {
          // Don't show error for abort (user navigated away or switched songs quickly)
          if (e?.name === 'AbortError') {
            console.log('[Neural] Fetch aborted (user navigated away)');
            return;
          }
          console.warn('[Neural] Fetch error:', e);
          const errorMsg = `❌ ไม่สามารถดาวน์โหลดไฟล์เพลงได้: ${e.message || String(e)}`;
          alert(errorMsg);
          console.error(errorMsg);
          return; // Abort selection to prevent crashing PlayerPage
        }
      }



      setSelectedSong(song);
      setUploadedMusicXml(finalXml);
      setSelectedLayoutBundle(owned?.layoutBundle || null);
      
      // Track song play
      try {
        telemetry.track('song_play', { songTitle: song.title, mode });
      } catch (e) {
        console.warn('[App] Telemetry track failed:', e);
      }

      // Lazy-load Tone.js engine only when needed
      const engine = await getMusicEngine();
      engine.pause();
      engine.setTransportSeconds(0);

      let parsed;
      try {
        parsed = engine.parseMusicXml(finalXml);
      } catch (e) {
        console.error('[App] Failed to parse MusicXML:', e);
        parsed = { partNames: { 'P1': 'Track 1' }, trackClefs: {} }; // Safe fallback
      }
      
      let vocalTrackSelected = false;
      const trackIds = Object.keys(parsed.partNames);
      
      const savedLyricMode = (() => {
        try { return localStorage.getItem('memo_lyric_mode') || 'British Fixed Doh'; } catch { return 'British Fixed Doh'; }
      })();

      const newTracks: TrackState[] = trackIds.map((id, index) => {
        const name = parsed.partNames[id] || 'Track';
        const clef = parsed.trackClefs?.[id];
        const low = name.toLowerCase();
        
        // Auto-logic for vocal tracks:
        // 1. If only one track total, it's vocal.
        // 2. Check if part name matches typical vocal names (SATB, voice, vocal, etc.)
        let isVocal = false;
        if (trackIds.length === 1) {
          isVocal = true;
        } else if (/(soprano|alto|tenor|voice|vocal|choir|lead|harmony|melody|singer)/.test(low) || (low.includes('bass') && !low.includes('piano') && !low.includes('double'))) {
          isVocal = true;
        }

        return {
          id, name, isMuted: false, isSolo: false, lyricMode: savedLyricMode as LyricMode, volume: 0.8, pan: 0,
          mode: isVocal ? 'vocal' as const : 'instrument' as const,
          instrument: isVocal ? 'Auto' : (mapPartNameToInstrument(name) || 'acoustic_grand_piano'), 
          effects: Array(6).fill(null)
        };
      });
      setTracks(newTracks);

      if (desiredView) {
        if (desiredView.player) setPlayerViewMode(desiredView.player);
        setCurrentView(desiredView.main as ViewId);
      } else if (mode === 'studio' || mode === 'edit') {
        setCurrentView('forge');
      } else {
        // 'listen' mode → go to Player and auto-play
        setAutoPlayOnLoad(true);
        setCurrentView('player');
        setPlayerViewMode('score');
      }
    } catch (err) {
      console.error('[App] handleSongSelect critical error:', err);
      alert("❌ ไม่สามารถเลือกเพลงได้:\n" + (err instanceof Error ? err.stack || err.message : String(err)));
    } finally {
      setIsSongLoading(false);
    }
  }, []); // ← no deps: reads userSongsRef instead of closing over state

  const handleLanguageChange = (lang: 'th' | 'en') => { setPreferredLanguage(lang); localStorage.setItem('nimo_lang', lang); };
  const handleCountryChange = (c: string) => { setUserCountry(c); localStorage.setItem('nimo_country', c); };
  const handleInstrumentChange = (i: string) => { setUserInstrument(i as any); localStorage.setItem('nimo_instrument', i); };
  const handleTogglePerformanceMode = (v: boolean) => { setPerformanceMode(v); localStorage.setItem('nimo_perf_mode', String(v)); };

  // Synchronize App State to NimoBrain
  useEffect(() => {
    nimoBrain.updateState('currentView', currentView);
    nimoBrain.updateState('selectedSong', selectedSong);
    nimoBrain.updateState('preferredLanguage', preferredLanguage);
    nimoBrain.updateState('userInstrument', userInstrument);
    nimoBrain.updateState('songLibrary', {
      totalSongs: userSongs.length,
      sampleSongs: userSongs.slice(0, 50).map(s => ({
        id: s.metadata.id,
        title: s.metadata.title,
        artist: s.metadata.artist,
        category: s.metadata.category
      }))
    });
  }, [currentView, selectedSong, preferredLanguage, userInstrument, userSongs]);

  // Start remote polling (disabled by default to prevent console errors when backend is offline)
  useEffect(() => {
    if (localStorage.getItem('nimo_remote_enabled') === 'true') {
      nimoBrain.startRemotePolling();
    }
  }, []);

  // Register central NimoBrain actions
  useEffect(() => {
    const unregNavigate = nimoBrain.registerAction('navigate_to_page', (params) => {
      const view = params?.view || params?.page || params?.target || params?.name;
      const tab = params?.tab; // optional: set studio tab when navigating
      console.log('[App] Nimo requested navigation to:', view, params);
      if (view) {
        navigateTo(view as any);
        // If navigating to Studio with a specific tab, set it immediately
        if (view === 'forge' && tab) {
          setStudioInitialMode(tab);
        }
      }
    }, {
      th: 'ไปยังหน้าต่างๆ ของแอพ',
      en: 'Navigate to a page view',
      params: "{ view: 'home' | 'player' | 'forge' | 'nimo' | 'profile' | 'settings' | 'admin' | 'game' | 'vault' | 'subscription' }",
      category: 'navigation'
    });

    const unregNavigateAlias = nimoBrain.registerAction('navigate', (params) => {
      const view = params?.view || params?.page || params?.target || params?.name;
      console.log('[App] Nimo requested navigation to (alias):', view, params);
      if (view) {
        navigateTo(view as any);
      }
    }, {
      th: 'ไปยังหน้าต่างๆ (ชื่ออื่น)',
      en: 'Navigate (alias)',
      params: '{ view: string }',
      category: 'navigation'
    });

    const unregArrangeSong = nimoBrain.registerAction('arrange_song', (params) => {
      console.log('[App] Nimo requested arrange_song', params);
      navigateTo('forge');
    }, {
      th: 'ส่งเพลงไปเรียบเรียงประสานเสียงใน AI Arranger',
      en: 'Send song to AI Arranger for harmonization',
      params: '{ text?: string }',
      category: 'studio'
    });

    const unregTeachMe = nimoBrain.registerAction('teach_me', (params) => {
      console.log('[App] Nimo requested teach_me', params);
      navigateTo('home'); // Game moved to Devel/
    }, {
      th: 'เริ่มโหมดแบบฝึกหัดหรือการสอนดนตรี',
      en: 'Start a lesson or practice mode',
      params: '{ topic?: string }',
      category: 'navigation'
    });

    const unregPlaySong = nimoBrain.registerAction('play_song', async (params) => {
      const title = params?.songTitle;
      if (!title) return;
      
      const songs = userSongsRef.current;
      const titleTokens = title.toLowerCase().split(/\s+/);
      const found = songs.find(s => {
        const t = (s.metadata.title || '').toLowerCase();
        return titleTokens.every(token => t.includes(token));
      });
      
      if (found) {
        await handleSongSelect(found.metadata, found.xmlData, 'listen');
      } else {
        throw new Error(`Song not found: ${title}`);
      }
    }, {
      th: 'ค้นหาและเปิดเพลงจากคลัง',
      en: 'Search and play a song from library',
      params: '{ songTitle: string }',
      category: 'player'
    });

    const unregLoadSongData = nimoBrain.registerAction('load_song_data', async (params) => {
      const { metadata, xmlData } = params;
      if (metadata && xmlData) {
        await handleSongSelect(metadata, xmlData, 'listen');
      } else {
        throw new Error('Missing metadata or xmlData');
      }
    }, {
      th: 'โหลดข้อมูลเพลงและเปิดเล่นทันที',
      en: 'Load song data directly and play',
      params: '{ metadata: any, xmlData: string }',
      category: 'player'
    });

    const unregChangeLang = nimoBrain.registerAction('change_language', (params) => {
      const lang = params?.lang;
      if (lang === 'th' || lang === 'en') {
        handleLanguageChange(lang);
      }
    }, {
      th: 'เปลี่ยนภาษาการแสดงผล',
      en: 'Change display language',
      params: "{ lang: 'th' | 'en' }",
      category: 'settings'
    });

    const unregChangeInstrument = nimoBrain.registerAction('change_instrument', (params) => {
      const instrument = params?.instrument;
      if (['piano', 'violin', 'voice', 'guitar'].includes(instrument)) {
        handleInstrumentChange(instrument);
      }
    }, {
      th: 'เปลี่ยนเครื่องดนตรีหลัก',
      en: 'Change main instrument',
      params: "{ instrument: 'piano' | 'violin' | 'voice' | 'guitar' }",
      category: 'settings'
    });

    const unregSoloTrack = nimoBrain.registerAction('solo_track', (params) => {
      const trackName = params?.trackName;
      const trackIdx = params?.trackIndex;
      const solo = params?.solo !== false;
      console.log('[App] Nimo requested solo_track:', { trackName, trackIdx, solo });
      
      setTracks(prev => prev.map((t, idx) => {
        const isTarget = (trackName && t.name.toLowerCase().includes(trackName.toLowerCase())) || 
                         (trackIdx !== undefined && idx === Number(trackIdx));
        if (isTarget) {
          return { ...t, isSolo: solo };
        }
        return t;
      }));
    }, {
      th: 'โซโล่เสียงเฉพาะแทร็ก',
      en: 'Solo a specific track',
      params: '{ trackName?: string, trackIndex?: number, solo: boolean }',
      category: 'player'
    });

    const unregMuteTrack = nimoBrain.registerAction('mute_track', (params) => {
      const trackName = params?.trackName;
      const trackIdx = params?.trackIndex;
      const mute = params?.mute !== false;
      console.log('[App] Nimo requested mute_track:', { trackName, trackIdx, mute });
      
      setTracks(prev => prev.map((t, idx) => {
        const isTarget = (trackName && t.name.toLowerCase().includes(trackName.toLowerCase())) || 
                         (trackIdx !== undefined && idx === Number(trackIdx));
        if (isTarget) {
          return { ...t, isMuted: mute };
        }
        return t;
      }));
    }, {
      th: 'ปิด/เปิดเสียงแทร็ก',
      en: 'Mute/unmute a track',
      params: '{ trackName?: string, trackIndex?: number, mute: boolean }',
      category: 'player'
    });

    const unregSetTrackMode = nimoBrain.registerAction('set_track_mode', (params) => {
      const trackName = params?.trackName;
      const trackIdx = params?.trackIndex;
      const mode = params?.mode;
      console.log('[App] Nimo requested set_track_mode:', { trackName, trackIdx, mode });
      if (mode !== 'vocal' && mode !== 'instrument') return;
      
      setTracks(prev => prev.map((t, idx) => {
        const isTarget = (trackName && t.name.toLowerCase().includes(trackName.toLowerCase())) || 
                         (trackIdx !== undefined && idx === Number(trackIdx));
        if (isTarget) {
          const defaultInst = mode === 'vocal' ? 'Auto' : 'Piano';
          return { ...t, mode, instrument: defaultInst };
        }
        return t;
      }));
    }, {
      th: 'สลับโหมดแทร็ก Vocal/Instrument',
      en: 'Switch track mode vocal/instrument',
      params: "{ trackName?: string, trackIndex?: number, mode: 'vocal' | 'instrument' }",
      category: 'player'
    });

    const unregSetTrackInstrument = nimoBrain.registerAction('set_track_instrument', (params) => {
      const { trackName, trackIndex, instrument } = params;
      setTracks(prev => prev.map((t, idx) => {
        if (t.mode !== 'vocal') return t;
        const isMatch = (trackName && t.name.toLowerCase().includes(trackName.toLowerCase())) || 
                       (trackIndex !== undefined && idx === trackIndex);
        if (isMatch) return { ...t, instrument: instrument };
        return t;
      }));
    }, {
      th: 'เลือกเครื่องดนตรี/นักร้องของแทร็ก',
      en: 'Choose track instrument/voice',
      params: '{ trackName?: string, trackIndex?: number, instrument: string }',
      category: 'player'
    });

    const unregDeleteLatestTrack = nimoBrain.registerAction('delete_latest_track', async () => {
      const engine = await getMusicEngine();
      setTracks(prev => {
        const composerTracks = prev.filter(t => t.id.startsWith('composer-'));
        if (composerTracks.length > 0) {
          const lastComposerTrackId = composerTracks[composerTracks.length - 1].id;
          engine.clearVocalLayers(lastComposerTrackId);
          return prev.filter(t => t.id !== lastComposerTrackId);
        } else if (prev.length > 0) {
          const lastTrackId = prev[prev.length - 1].id;
          engine.clearVocalLayers(lastTrackId);
          return prev.filter(t => t.id !== lastTrackId);
        }
        return prev;
      });
    }, {
      th: 'ลบแทร็กล่าสุดที่เพิ่มเข้ามา',
      en: 'Delete the most recently added track',
      category: 'studio'
    });

    const unregStudioSetTab = nimoBrain.registerAction('studio_set_tab', (params) => {
      const tab = params?.tab;
      console.log('[App] Nimo requested studio_set_tab:', tab);
      if (['composer', 'arranger', 'editor'].includes(tab)) {
        setStudioInitialMode(tab);
        // Also navigate to forge if not already there
        navigateTo('forge');
      }
    }, {
      th: 'เปลี่ยนแท็บใน Studio',
      en: 'Change Studio tab',
      params: "{ tab: 'composer' | 'arranger' | 'editor' }",
      category: 'studio'
    });

    const unregSearchSong = nimoBrain.registerAction('search_song', (params) => {
      const query = params?.query ?? '';
      console.log('[App] Nimo requested search_song', params);
      navigateTo('home');
      // Defer dispatch so HomePage is mounted and listening
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('nimo-search-song', { detail: { query } }));
      }, 100);
    }, {
      th: 'ค้นหาเพลงในคลัง',
      en: 'Search for songs in library',
      params: '{ query: string }',
      category: 'navigation'
    });

    const unregSortSongs = nimoBrain.registerAction('sort_songs', (params) => {
      const mode = params?.mode ?? 'default';
      console.log('[App] Nimo requested sort_songs', params);
      navigateTo('home');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('nimo-sort-songs', { detail: { mode } }));
      }, 100);
    }, {
      th: 'เรียงลำดับเพลง',
      en: 'Sort song library',
      params: "{ mode: 'default' | 'a-z' | 'z-a' | 'newest' | 'oldest' }",
      category: 'navigation'
    });

    const unregImportFile = nimoBrain.registerAction('import_file', (params) => {
      console.log('[App] Nimo requested import_file', params);
      navigateTo('home');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('nimo-import-file'));
      }, 100);
    }, {
      th: 'นำเข้าไฟล์ MusicXML/MIDI',
      en: 'Import MusicXML/MIDI file',
      category: 'navigation'
    });

    const unregYoutubeBatch = nimoBrain.registerAction('download_youtube_batch', async (params) => {
      if (!params || !params.urls || !Array.isArray(params.urls)) return;
      const urls = params.urls as string[];
      const quality = params.quality || 'auto';
      
      // Notify start
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast(`Downloading ${urls.length} YouTube links in batch...`, '#ef4444');
      }

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          const res = await fetch('/vocalido/api/youtube/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, quality })
          });
          const data = await res.json();
          if (data.url) {
            if (typeof window !== 'undefined' && (window as any).showToast) {
              (window as any).showToast(`✅ Downloaded ${i+1}/${urls.length}: ${data.title}`, '#10B981');
            }
            window.dispatchEvent(new CustomEvent('youtube_downloaded', { 
              detail: {
                url: data.url,
                filename: data.filename,
                title: data.title || data.filename
              }
            }));
            // Automatically open Arranger if not already there so user can see it in Audio Bin
            navigateTo('forge');
            setTimeout(() => setStudioInitialMode('arranger'), 100);
          }
        } catch (e) {
          console.error(`Failed to download ${url}`, e);
          if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast(`❌ Failed: ${url}`, '#EF4444');
          }
        }
      }
    }, {
      th: 'ดาวน์โหลด YouTube หลายลิงก์ (Batch)',
      en: 'Download multiple YouTube links (Batch)',
      params: '{ urls: string[], quality: string }',
      category: 'system'
    });

    const unregYoutubeSeparate = nimoBrain.registerAction('youtube_separate_stems', async (params) => {
      if (!params || !params.file_url) return;
      const stems = params.stems || 4;
      try {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(`🎵 Separating stems (${stems}-track)...`, '#8B5CF6');
        }
        const res = await fetch('/vocalido/api/ai/separate-stems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_url: params.file_url, stems })
        });
        const data = await res.json();
        if (data.stems) {
          window.dispatchEvent(new CustomEvent('youtube_stems_ready', { detail: { file_url: params.file_url, stems: data.stems } }));
          if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast(`✅ Stem separation complete! ${Object.keys(data.stems).length} tracks.`, '#10B981');
          }
        }
      } catch (e: any) {
        console.error('Nimo stem separation failed:', e);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(`❌ Stem separation failed: ${e.message}`, '#EF4444');
        }
      }
    }, {
      th: 'แยกแทร็คเครื่องดนตรี (Stem Separation)',
      en: 'Separate audio into instrument stems',
      params: '{ file_url: string, stems: 2|4|6 }',
      category: 'audio'
    });

    const unregYoutubeTranscribe = nimoBrain.registerAction('youtube_transcribe_stem', async (params) => {
      if (!params || !params.stem_url) return;
      try {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(`🎼 Transcribing to sheet music...`, '#6366F1');
        }
        const { transcribeAudioToMusicXML } = await import('./lib/browserTranscribe');
        const musicxml = await transcribeAudioToMusicXML(params.stem_url);
        if (!musicxml) throw new Error('Transcription failed');

        // Note: For Nimo actions, we might need a way to pass the song title or just use a default
        const newSongTitle = `Transcribed Stem (Score)`;
        const newSong = {
          id: `song_${Date.now()}`,
          title: newSongTitle,
          source: 'verovio',
          version: 3,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          bpm: 120,
          isPublic: false,
        };
        await songStorage.saveSong(newSong as any, musicxml);

        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(`✅ Transcription complete! Saved to Vault.`, '#10B981');
        }
      } catch (e: any) {
        console.error('Nimo transcription failed:', e);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(`❌ Transcription failed: ${e.message}`, '#EF4444');
        }
      }
    }, {
      th: 'แปลงเสียงเป็นโน้ตดนตรี (Transcribe)',
      en: 'Transcribe audio stem to sheet music (MusicXML)',
      params: '{ stem_url: string }',
      category: 'audio'
    });

    const unregYoutubePlay = nimoBrain.registerAction('youtube_play_audio', async (params) => {
      if (!params || !params.url) return;
      window.dispatchEvent(new CustomEvent('youtube_play_request', { detail: { url: params.url } }));
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast(`▶ Playing audio...`, '#06B6D4');
      }
    }, {
      th: 'เล่นเสียงจาก Audio Studio',
      en: 'Play audio from Audio Studio',
      params: '{ url: string }',
      category: 'audio'
    });

    const unregYoutubeOpenStudio = nimoBrain.registerAction('open_audio_studio', () => {
      navigateTo('forge');
      setTimeout(() => setStudioInitialMode('youtube'), 100);
    }, {
      th: 'เปิดหน้า Audio Studio (YouTube)',
      en: 'Open Audio Studio (YouTube) page',
      category: 'navigation'
    });

    const unregSyncCloud = nimoBrain.registerAction('sync_cloud', (params) => {
      console.log('[App] Nimo requested sync_cloud', params);
      triggerSync();
    }, {
      th: 'ซิงค์ข้อมูลกับ Cloud',
      en: 'Sync data with cloud',
      category: 'system'
    });

    return () => {
      unregNavigate();
      unregNavigateAlias();
      unregPlaySong();
      unregChangeLang();
      unregChangeInstrument();
      unregSoloTrack();
      unregMuteTrack();
      unregSetTrackMode();
      unregSetTrackInstrument();
      unregDeleteLatestTrack();
      unregArrangeSong();
      unregTeachMe();
      unregStudioSetTab();
      unregSearchSong();
      unregSortSongs();
      unregImportFile();
      unregYoutubeBatch();
      unregYoutubeSeparate();
      unregYoutubeTranscribe();
      unregYoutubePlay();
      unregYoutubeOpenStudio();
      unregSyncCloud();
    };
  }, [navigateTo, handleSongSelect, triggerSync]);

  const renderPage = () => {
    // Show premium splash loader only during initialization
    if (isInitializing) {
      return (
        <SplashLoader 
          progress={initProgress} 
          statusText={initStatus} 
          onStart={() => setHasStartedSplash(true)}
          bgmUrl={bgmUrl}
          bgmTitle={bgmTitle}
          bgmCover={bgmCover}
        />
      );
    }

    // Guard against rendering player view on startup before selectedSong is fully hydrated
    if (currentView === 'player' && !selectedSong) {
      return <PageLoader />;
    }

    switch (currentView) {
      case 'home':
        return <HomePage
          onSongSelect={handleSongSelect}
          userLibrary={userSongs}
          onEnterStudio={() => navigateTo('player')}
          onViewVault={() => navigateTo('home')}
          onSearch={setGlobalSearchQuery}
          performanceMode={performanceMode}
          onToggleDelete={handleToggleDelete}
          onPermanentDelete={handlePermanentDelete}
          onBulkDelete={handleBulkToggleDelete}
          onBulkPermanentDelete={handleBulkPermanentDelete}
          onRefresh={triggerSync}
          onLocalRefresh={handleLocalRefresh}
          isSyncing={isSyncing}
          onOpenNimo={(song, xml) => handleSongSelect(song, xml, 'studio', false, { main: 'player' })}
          onImportToNimo={f => { setPendingImportFile(f); setNimoMounted(true); setIsNimoOpen(true); }}
          onTogglePublic={handleTogglePublic}
          isAdmin={isAdmin}
          currentUserId={authUser?.id}
          bgmUrl={bgmUrl}
          bgmTitle={bgmTitle}
          bgmCover={bgmCover}
        />;
      case 'player':
        return null; // PlayerPage is rendered persistently outside this switch
      case 'forge':
        return <StudioPage selectedSong={selectedSong} xmlData={uploadedMusicXml} layoutBundle={selectedLayoutBundle} tracks={tracks} setTracks={setTracks} onPublish={triggerSync} onExit={() => navigateTo('home')} initialStudioMode={studioInitialMode} />;
      case 'profile':
        return <ProfilePage onEnterForge={() => navigateTo('forge')} userLibrary={userSongs} onSongSelect={handleSongSelect} onTriggerSync={triggerSync} isSyncing={isSyncing} onRefresh={triggerSync} preferredLanguage={preferredLanguage} setPreferredLanguage={handleLanguageChange} userCountry={userCountry} setUserCountry={handleCountryChange} userInstrument={userInstrument} setUserInstrument={handleInstrumentChange} onViewPlan={() => navigateTo('subscription')} />;
      case 'settings':
        return <SettingsPage performanceMode={performanceMode} onTogglePerformanceMode={handleTogglePerformanceMode} nimoEnabled={nimoEnabled} onToggleNimoEnabled={(val) => { setNimoEnabled(val); localStorage.setItem('nimo_enabled', String(val)); }} nimoVoice={nimoVoice} onChangeNimoVoice={(val) => { setNimoVoice(val); localStorage.setItem('nimo_voice', val); }} vocalidoAutoRender={vocalidoAutoRender} onToggleVocalidoAutoRender={(val) => { setVocalidoAutoRender(val); localStorage.setItem('vocalido_auto_render', String(val)); }} renderCardStyle={vocalidoRenderCardStyle} onSelectRenderCardStyle={(val) => { setVocalidoRenderCardStyle(val); localStorage.setItem('vocalido_render_card_style', val); }} nimoModel={nimoModel} onChangeNimoModel={(val) => { setNimoModel(val); localStorage.setItem('nimo_model', val); }} uiTheme={uiTheme} onUiThemeChange={setUiTheme} nimoPosition={nimoPosition} onNimoPositionChange={setNimoPosition} layoutMode={layoutMode} onLayoutModeChange={setLayoutMode} onBack={() => setCurrentView('home')} />;
      case 'distribution':
        return <DistributionPage userLibrary={userSongs} onRefresh={triggerSync} onBack={() => navigateTo('home')} />;
      case 'nimo':
        return <NimoPage selectedSong={selectedSong} xmlData={uploadedMusicXml} preferredLanguage={preferredLanguage} onSongSelect={handleSongSelect} onRefresh={triggerSync} initialFile={pendingImportFile} voiceType={nimoVoice} />;
      // Game moved to Devel/ folder
      case 'presentation':
        return <BrandingPage onEnter={() => navigateTo('home')} backgroundImage="/images/memolody_hero.png" />;
      case 'admin':
        return <AdminPage onRefresh={triggerSync} />;
      case 'subscription':
        return (
          <PricingPage 
            currentTier={(() => {
              const storedTier = localStorage.getItem('mock_membership_tier');
              return (storedTier as any) || (authUser?.membershipTier as any) || 'free';
            })()} 
            onSelectPlan={async (tier, cycle) => {
              localStorage.setItem('mock_membership_tier', tier);
              if (tier === 'free') {
                console.log('[Pricing] Wiping songs and caches for Free tier select...');
                await songStorage.deleteAllSongs();
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && (
                    key.startsWith('tracks_state_') ||
                    key.startsWith('memo_render_history_') ||
                    key.startsWith('active_render_key_') ||
                    key.startsWith('memo_render_u') ||
                    key.startsWith('memo_selected_song_id')
                  )) {
                    keysToRemove.push(key);
                  }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
              }
              alert(`ขอบคุณสำหรับความสนใจ! ระบบจำลองเปลี่ยนสถานะสมาชิกเป็น [${tier.toUpperCase()}] เรียบร้อยแล้ว แอปจะรีโหลดเพื่อเปิดใช้งานครับ`);
              window.location.reload();
            }} 
          />
        );
      default:
        return null;
    }
  };

  if (authLoading) {
    return (
      <div className="flex-1 flex h-[100dvh] items-center justify-center bg-[#0A0A0B]">
        <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin shadow-[0_0_20px_rgba(6,182,212,0.5)]" />
      </div>
    );
  }



  return (
    <div className={`flex flex-col h-[100dvh] w-full bg-transparent font-sans selection:bg-cyan-500/30 ${performanceMode ? 'perf-mode' : ''}`}>

      <header className="h-14 flex items-center justify-between px-6 glass-panel shrink-0 z-[10000] sticky top-0">
        <div className="flex items-center gap-3">
          <Zap size={18} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
          <span className="text-[12px] font-black tracking-[0.2em] text-white drop-shadow-md">MEMOLODY <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">V2.5.2</span></span>
        </div>
        <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
          {NAV_ITEMS
            .filter(item => !item.minRole || hasAccess(role, item.minRole as any))
            .map(item => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => navigateTo(item.id, item.isNimo)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all duration-300 ${
                item.isNimo
                  ? currentView === item.id ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/20 glass-button'
                  : currentView === item.id ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-zinc-400 hover:text-white glass-button border-transparent hover:border-white/10'
              }`}
            >
              <item.icon size={14} strokeWidth={2.5} />
              <span className={currentView === item.id ? "inline" : "hidden sm:inline"}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {authUser && ['owner','executive','admin'].includes(role) && (
            <span className={`hidden sm:flex items-center gap-1 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border
              ${role === 'owner' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' :
                role === 'executive' ? 'bg-violet-500/10 border-violet-500/30 text-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.2)]' :
                'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(0,229,255,0.2)]'}`}>
              {role === 'owner' ? '👑' : role === 'executive' ? '💼' : '🛡️'} {role}
            </span>
          )}
          {isSyncing && <RefreshCcw size={12} className="animate-spin text-cyan-400" />}
          <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${onlineStatus === 'online' ? 'bg-emerald-400 text-emerald-400' : 'bg-rose-400 text-rose-400'}`} />
        </div>
      </header>

      <div className={`flex-1 flex min-h-0 overflow-hidden relative ${nimoPosition === 'right' ? 'md:flex-row-reverse' : 'md:flex-row'}`}>
        {/* Persistent Nimo Sidebar (Desktop) */}
        {nimoEnabled && nimoMounted && currentView !== 'nimo' && (
          <aside className={`w-[360px] flex-shrink-0 relative z-[50] hidden md:flex ${nimoPosition === 'right' ? 'border-l border-white/5' : 'border-r border-white/5'}`}>
            <Suspense fallback={null}>
              <FloatingNimo
                isOpenProp={true}
                setIsOpenProp={() => {}}
                voiceType={nimoVoice}
                preferredLanguage={preferredLanguage}
                geminiModel={nimoModel}
                isSidebarMode={true}
                position={nimoPosition}
              />
            </Suspense>
          </aside>
        )}

        <main className="flex-1 min-w-0 overflow-hidden relative bg-transparent">
          <PageErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              {renderPage()}
            </Suspense>
          </PageErrorBoundary>

          {/* PlayerPage is always mounted (hidden when not active) to preserve vocal renders */}
          {selectedSong && (
            <div
              className="absolute inset-0"
              style={{ display: currentView === 'player' ? 'block' : 'none' }}
            >
              <Suspense fallback={<PageLoader />}>
                <PlayerPage song={selectedSong} musicXml={uploadedMusicXml} layoutBundle={selectedLayoutBundle} tracks={tracks} setTracks={setTracks} viewMode={playerViewMode} setViewMode={setPlayerViewMode} loopPresets={loopPresets} setLoopPresets={setLoopPresets} performanceMode={performanceMode} vocalidoAutoRender={vocalidoAutoRender} renderCardStyle={vocalidoRenderCardStyle} autoPlay={autoPlayOnLoad} onAutoPlayConsumed={() => setAutoPlayOnLoad(false)} onSongUpdate={handleSongUpdate} onNavigate={(view) => setCurrentView(view)} />
              </Suspense>
            </div>
          )}

          {/* Song Loading Overlay */}
          {isSongLoading && (
            <div className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
              <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin shadow-[0_0_20px_rgba(6,182,212,0.5)]"></div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-cyan-400 animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">กำลังดึงข้อมูลเพลงและวิเคราะห์โครงสร้าง...</p>
            </div>
          )}
        </main>

        {/* Floating Nimo AI (Mobile) */}
        {nimoEnabled && nimoMounted && currentView !== 'nimo' && (
          <div className="md:hidden">
            <Suspense fallback={null}>
              <FloatingNimo
                isOpenProp={isNimoOpen}
                setIsOpenProp={setIsNimoOpen}
                voiceType={nimoVoice}
                preferredLanguage={preferredLanguage}
                geminiModel={nimoModel}
                position={nimoPosition}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
};
export default App;
