
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Home, User, Music2, Play, Zap, RefreshCcw, Star, Shield, Sparkles, Mic2, Settings } from 'lucide-react';
// Lazy load Nimo - only loads JS bundle when user first clicks NIMO
const FloatingNimo = lazy(() => import('./components/Nimo/FloatingNimo').then(m => ({ default: m.FloatingNimo })));
import JSZip from 'jszip';
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
import { songStorage } from './lib/SongStorage';
import { DEMO_SONGS } from './data/demo_songs';
import { CloudSyncService } from './lib/CloudSyncService';
import { Song, TrackState } from './types';
import { LoopPreset } from './components/Player/LoopMatrixModal';
import { useAuth, hasAccess } from './lib/useAuth';
import { nimoBrain } from './lib/NimoBrain';

// ── Lazy-load ALL heavy page components ──
const HomePage = lazy(() => import('./components/Home/HomePage'));
const VaultPage = lazy(() => import('./components/Vault/VaultPage'));
const PlayerPage = lazy(() => import('./components/Player/PlayerPage'));
const StudioPage = lazy(() => import('./components/Studio/StudioPage'));
const ProfilePage = lazy(() => import('./components/Profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('./components/Settings/SettingsPage'));
const DistributionPage = lazy(() => import('./components/Distribution/DistributionPage'));
const NimoPage = lazy(() => import('./components/Nimo/NimoPage'));
const BrandingPage = lazy(() => import('./components/Presentation/BrandingPage'));
const AdminPage = lazy(() => import('./components/Admin/AdminPage'));
const PricingTiers = lazy(() => import('./components/Subscription/PricingTiers'));

// ── Error Boundary for lazy-loaded pages ──
interface EBState { hasError: boolean }
interface EBProps { children: React.ReactNode }
class PageErrorBoundary extends React.Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    (this as any).state = { hasError: false };
  }
  static getDerivedStateFromError(): EBState { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('[EB] lazy fail:', err); }
  render(): React.ReactNode {
    if (((this as any).state as EBState).hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-zinc-600 text-[9px] uppercase tracking-widest">Page failed — tap to reload</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 bg-cyan-500 text-black text-[9px] font-black uppercase rounded-xl">
            Reload
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
  { id: 'forge', icon: Music2, label: 'EDIT' },
  { id: 'subscription', icon: Star, label: 'PLAN' },
  { id: 'nimo', icon: Sparkles, label: 'NIMO', isNimo: true },
  { id: 'profile', icon: User, label: 'ME' },
  { id: 'settings', icon: Settings, label: 'SETTINGS' },
  { id: 'admin', icon: Shield, label: 'CORE', minRole: 'admin' },
];

const App: React.FC = () => {
  const { authUser, role } = useAuth();
  const isAdmin = hasAccess(role, 'admin');
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [isNimoOpen, setIsNimoOpen] = useState(false);
  const [nimoMounted, setNimoMounted] = useState(false); // mount on first click only
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
  const [performanceMode, setPerformanceMode] = useState(() => localStorage.getItem('nimo_perf_mode') === 'true');
  const [loopPresets, setLoopPresets] = useState<LoopPreset[]>(INITIAL_LOOP_PRESETS);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [autoPlayOnLoad, setAutoPlayOnLoad] = useState(false); // true after OMR import → Player auto-starts

  // Settings
  const [preferredLanguage, setPreferredLanguage] = useState<'th' | 'en'>(() => (localStorage.getItem('nimo_lang') as any) || 'en');
  const [userCountry, setUserCountry] = useState(() => localStorage.getItem('nimo_country') || 'Other');
  const [userInstrument, setUserInstrument] = useState<'piano' | 'violin' | 'voice' | 'guitar'>('piano');
  const [vocalidoAutoRender, setVocalidoAutoRender] = useState(() => {
    const saved = localStorage.getItem('vocalido_auto_render');
    if (saved === null) return true; // Default ON
    return saved === 'true';
  });
  const [nimoEnabled, setNimoEnabled] = useState(() => localStorage.getItem('nimo_enabled') !== 'false');
  const [nimoVoice, setNimoVoice] = useState<'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man'>(() => (localStorage.getItem('nimo_voice') as any) || 'teen_girl');

  useEffect(() => {
    (async () => {
      try {
        await songStorage.init();
        await initPlugins(); // Initialize the Plugin System (including Vocalido)

        // Clean up legacy hardcoded demo song if present
        await songStorage.permanentDeleteSong('demo-vocal-01');

        let songs = await songStorage.getAllSongs();

        // 🌱 SEED DATA: If library is empty, add demo songs
        if (songs.length === 0) {
          console.log('🌱 Project Empty: Seeding Vocalido Demo data...');
          for (const demo of DEMO_SONGS) {
            await songStorage.saveSong(demo.metadata as any, demo.xmlData, (demo as any).layoutBundle || null);
          }
          songs = await songStorage.getAllSongs();
        }

        userSongsRef.current = songs;
        setUserSongs(songs);

        // ── Auto-select first song so Player/Edit always shows notes ──────────
        // Pick the most-recently added song (last in list) as the startup default
        if (songs.length > 0) {
          const defaultSong = songs[songs.length - 1]; // most recent
          setSelectedSong(defaultSong.metadata);
          setUploadedMusicXml(defaultSong.xmlData || '');
          setSelectedLayoutBundle(defaultSong.layoutBundle || null);
          console.log(`[App] 🎵 Auto-selected: "${defaultSong.metadata.title}"`);
        }

        setTimeout(() => triggerSync(), 5000);
      } catch (e) {
        console.error("Init Error:", e);
      }
    })();

    const interval = setInterval(async () => {
      const isUp = await CloudSyncService.checkUpdateAvailability();
      setOnlineStatus(isUp ? 'online' : 'offline');
    }, 60000);
    return () => clearInterval(interval);
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
      }
    } catch (e: any) {
      console.warn("Sync interrupted:", e.message);
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
    const updatedList = userSongsRef.current.map(s => s.metadata.id === updatedSong.id ? { ...s, metadata: updatedSong } : s);
    userSongsRef.current = updatedList;
    setUserSongs(updatedList);
  }, []);

  const handleSongSelect = useCallback(async (
    song: Song, xml?: string,
    mode: 'listen' | 'studio' | 'edit' = 'studio',
    fromMarket = false,
    desiredView?: { main: 'player' | 'tracks', player?: 'score' | 'pianoroll' }
  ) => {
    let finalXml = xml;
    const owned = userSongsRef.current.find(s => s.metadata.id === song.id); // use ref — stable
    if (!finalXml) finalXml = owned?.xmlData || '';

    if (finalXml && finalXml.startsWith('http')) {
      try {
        const url = finalXml;
        const isMxl = url.endsWith('.mxl');
        const resp = await fetch(url);
        if (resp.ok) {
          if (isMxl) {
            const blob = await resp.blob();
            const zip = await JSZip.loadAsync(blob);
            let xmlContent = '';
            for (const [name, file] of Object.entries(zip.files)) {
              if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
                xmlContent = await (file as any).async('string');
                break;
              }
            }
            finalXml = xmlContent || '';
          } else {
            finalXml = await resp.text();
          }
          if (owned && finalXml) {
            await songStorage.saveSong(owned.metadata, finalXml);
          }
        }
      } catch (e) {
        console.warn('[Neural] Fetch error:', e);
      }
    }

    setSelectedSong(song);
    setUploadedMusicXml(finalXml);
    setSelectedLayoutBundle(owned?.layoutBundle || null);
    
    // Track song play
    telemetry.track('song_play', { songTitle: song.title, mode });

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
    
    const newTracks: TrackState[] = trackIds.map((id, index) => {
      const name = parsed.partNames[id] || 'Track';
      const clef = parsed.trackClefs?.[id];
      const low = name.toLowerCase();
      
      // Auto-logic: 
      // 1. If only one track total, it's vocal.
      // 2. Otherwise, the first Treble Clef (G) track found is vocal.
      // 3. All others are instruments.
      let isVocal = false;
      if (trackIds.length === 1) {
        isVocal = true;
      } else if (!vocalTrackSelected && clef === 'G') {
        isVocal = true;
        vocalTrackSelected = true;
      } else if (!vocalTrackSelected && index === 0 && !clef) {
        // Fallback for cases where clef detection might fail on first track
        isVocal = true;
        vocalTrackSelected = true;
      }

      return {
        id, name, isMuted: false, isSolo: false, lyricMode: 'British Fixed Doh' as const, volume: 0.8, pan: 0,
        mode: isVocal ? 'vocal' as const : 'instrument' as const,
        instrument: isVocal ? 'Auto' : 'Piano', 
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
    nimoBrain.updateState('songLibrary', userSongs.map(s => ({
      id: s.metadata.id,
      title: s.metadata.title,
      artist: s.metadata.artist,
      category: s.metadata.category
    })));
  }, [currentView, selectedSong, preferredLanguage, userInstrument, userSongs]);

  // Start remote polling
  useEffect(() => {
    nimoBrain.startRemotePolling();
  }, []);

  // Register central NimoBrain actions
  useEffect(() => {
    const unregNavigate = nimoBrain.registerAction('navigate_to_page', (params) => {
      const view = params?.view;
      if (view) {
        navigateTo(view as any);
      }
    });

    const unregPlaySong = nimoBrain.registerAction('play_song', async (params) => {
      const title = params?.songTitle;
      if (!title) return;
      
      const songs = userSongsRef.current;
      const found = songs.find(s => s.metadata.title.toLowerCase().includes(title.toLowerCase()));
      if (found) {
        await handleSongSelect(found.metadata, found.xmlData, 'listen');
      } else {
        throw new Error(`Song not found: ${title}`);
      }
    });

    const unregChangeLang = nimoBrain.registerAction('change_language', (params) => {
      const lang = params?.lang;
      if (lang === 'th' || lang === 'en') {
        handleLanguageChange(lang);
      }
    });

    const unregChangeInstrument = nimoBrain.registerAction('change_instrument', (params) => {
      const instrument = params?.instrument;
      if (['piano', 'violin', 'voice', 'guitar'].includes(instrument)) {
        handleInstrumentChange(instrument);
      }
    });

    return () => {
      unregNavigate();
      unregPlaySong();
      unregChangeLang();
      unregChangeInstrument();
    };
  }, [navigateTo, handleSongSelect]);

  const renderPage = () => {
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
        />;
      case 'player':
        return <PlayerPage song={selectedSong} musicXml={uploadedMusicXml} layoutBundle={selectedLayoutBundle} tracks={tracks} setTracks={setTracks} viewMode={playerViewMode} setViewMode={setPlayerViewMode} loopPresets={loopPresets} setLoopPresets={setLoopPresets} performanceMode={performanceMode} vocalidoAutoRender={vocalidoAutoRender} autoPlay={autoPlayOnLoad} onAutoPlayConsumed={() => setAutoPlayOnLoad(false)} onSongUpdate={handleSongUpdate} />;
      case 'forge':
        return <StudioPage selectedSong={selectedSong} xmlData={uploadedMusicXml} layoutBundle={selectedLayoutBundle} tracks={tracks} setTracks={setTracks} onPublish={triggerSync} onExit={() => navigateTo('home')} />;
      case 'profile':
        return <ProfilePage onEnterForge={() => navigateTo('forge')} userLibrary={userSongs} onSongSelect={handleSongSelect} onTriggerSync={triggerSync} isSyncing={isSyncing} onRefresh={triggerSync} preferredLanguage={preferredLanguage} setPreferredLanguage={handleLanguageChange} userCountry={userCountry} setUserCountry={handleCountryChange} userInstrument={userInstrument} setUserInstrument={handleInstrumentChange} />;
      case 'settings':
        return <SettingsPage performanceMode={performanceMode} onTogglePerformanceMode={handleTogglePerformanceMode} nimoEnabled={nimoEnabled} onToggleNimoEnabled={(val) => { setNimoEnabled(val); localStorage.setItem('nimo_enabled', String(val)); }} nimoVoice={nimoVoice} onChangeNimoVoice={(val) => { setNimoVoice(val); localStorage.setItem('nimo_voice', val); }} vocalidoAutoRender={vocalidoAutoRender} onToggleVocalidoAutoRender={(val) => { setVocalidoAutoRender(val); localStorage.setItem('vocalido_auto_render', String(val)); }} />;
      case 'distribution':
        return <DistributionPage userLibrary={userSongs} onRefresh={triggerSync} onBack={() => navigateTo('home')} />;
      case 'nimo':
        return <NimoPage selectedSong={selectedSong} xmlData={uploadedMusicXml} preferredLanguage={preferredLanguage} onSongSelect={handleSongSelect} onRefresh={triggerSync} initialFile={pendingImportFile} />;
      case 'presentation':
        return <BrandingPage onEnter={() => navigateTo('home')} backgroundImage="/images/memolody_hero.png" />;
      case 'admin':
        return <AdminPage onRefresh={triggerSync} />;
      case 'subscription':
        return <PricingTiers />;
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col h-[100dvh] w-full bg-[#0A0A0B] font-sans selection:bg-cyan-500/30 ${performanceMode ? 'perf-mode' : ''}`}>

      <header className="h-12 flex items-center justify-between px-4 bg-[#0A0A0B] border-b border-white/5 shrink-0 z-[10000]">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-cyan-400" />
          <span className="text-[10px] font-black tracking-[0.15em] text-zinc-400">MEMOLODY <span className="text-cyan-400">V2</span></span>
        </div>
        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS
            .filter(item => !item.minRole || hasAccess(role, item.minRole as any))
            .map(item => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => navigateTo(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-colors duration-75 ${
                item.isNimo
                  ? currentView === item.id ? 'bg-cyan-500 text-black' : 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/20'
                  : currentView === item.id ? 'bg-white text-black' : 'text-zinc-600 hover:text-zinc-300'
              }`}
            >
              <item.icon size={12} strokeWidth={2.5} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {authUser && ['owner','executive','admin'].includes(role) && (
            <span className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border
              ${role === 'owner' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                role === 'executive' ? 'bg-violet-500/10 border-violet-500/20 text-violet-400' :
                'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'}`}>
              {role === 'owner' ? '👑' : role === 'executive' ? '💼' : '🛡️'} {role}
            </span>
          )}
          {isSyncing && <RefreshCcw size={10} className="animate-spin text-cyan-400" />}
          <div className={`w-1.5 h-1.5 rounded-full ${onlineStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative bg-[#0A0A0B]">
        <PageErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </PageErrorBoundary>
      </main>

      {/* Floating Nimo AI - lazy loaded on first use only */}
      {nimoEnabled && nimoMounted && (
        <Suspense fallback={null}>
          <FloatingNimo
            isOpenProp={isNimoOpen}
            setIsOpenProp={setIsNimoOpen}
            voiceType={nimoVoice}
            preferredLanguage={preferredLanguage}
          />
        </Suspense>
      )}
    </div>
  );
};
export default App;
