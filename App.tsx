
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Home, User, Database, Music2, Settings, Zap, RefreshCcw } from 'lucide-react';
import { musicEngine } from './lib/MusicEngine';
import { songStorage } from './lib/SongStorage';
import { CloudSyncService } from './lib/CloudSyncService';
import { Song, TrackState } from './types';
import { LoopPreset } from './components/Player/LoopMatrixModal';

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

// ── Minimal loading fallback ──
const PageLoader = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
  </div>
);

type ViewId = 'home' | 'library' | 'player' | 'profile' | 'forge' | 'distribution' | 'settings' | 'nimo' | 'presentation';

const INITIAL_LOOP_PRESETS: LoopPreset[] = [
  { id: 'intro', label: 'Intro', color: '#00e5ff', startBar: 1, endBar: 4, isActive: false },
  { id: 'verse', label: 'Verse', color: '#10b981', startBar: 5, endBar: 12, isActive: false },
  { id: 'chorus', label: 'Chorus', color: '#ffab00', startBar: 13, endBar: 20, isActive: false },
  { id: 'bridge', label: 'Bridge', color: '#ef4444', startBar: 21, endBar: 28, isActive: false },
  { id: 'solo', label: 'Solo', color: '#6366f1', startBar: 29, endBar: 36, isActive: false },
  { id: 'outro', label: 'Outro', color: '#a855f7', startBar: 37, endBar: 44, isActive: false },
  { id: 'custom', label: 'Custom', color: '#ffffff', startBar: 1, endBar: 100, isActive: false },
];

const NAV_ITEMS: { id: ViewId; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'MATRIX' },
  { id: 'forge', icon: Music2, label: 'STUDIO' },
  { id: 'profile', icon: User, label: 'ME' },
  { id: 'settings', icon: Settings, label: 'CFG' },
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [uploadedMusicXml, setUploadedMusicXml] = useState<string | null>(null);
  const [userSongs, setUserSongs] = useState<{ metadata: Song, xmlData: string }[]>([]);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [playerViewMode, setPlayerViewMode] = useState<'score' | 'pianoroll'>('score');
  const [isSyncing, setIsSyncing] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState<'online' | 'offline'>('online');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [performanceMode, setPerformanceMode] = useState(() => localStorage.getItem('nimo_perf_mode') === 'true');
  const [loopPresets, setLoopPresets] = useState<LoopPreset[]>(INITIAL_LOOP_PRESETS);

  // Settings stored in localStorage only — no re-render needed for these
  const [preferredLanguage, setPreferredLanguage] = useState<'th' | 'en'>(() => (localStorage.getItem('nimo_lang') as any) || 'en');
  const [userCountry, setUserCountry] = useState(() => localStorage.getItem('nimo_country') || '');
  const [userInstrument, setUserInstrument] = useState(() => localStorage.getItem('nimo_instrument') || '');
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('nimo_lang'));
  const [nimoEnabled, setNimoEnabled] = useState(() => localStorage.getItem('nimo_enabled') !== 'false');
  const [nimoVoice, setNimoVoice] = useState<'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man'>(() => (localStorage.getItem('nimo_voice') as any) || 'teen_girl');

  // ── Init & Sync (deferred) ──
  useEffect(() => {
    (async () => {
      try {
        await songStorage.init();
        const songs = await songStorage.getAllSongs();
        setUserSongs(songs);
        // Defer cloud sync — don't block UI
        setTimeout(() => triggerSync(), 5000);
      } catch (e) {
        console.error("Init Error:", e);
      }
    })();

    // Check online status at slower cadence (60s instead of 15s)
    const interval = setInterval(async () => {
      const isUp = await CloudSyncService.checkUpdateAvailability();
      setOnlineStatus(isUp ? 'online' : 'offline');
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const syncResult = await CloudSyncService.syncWithGlobalCloud();
      if (syncResult.total >= 0) {
        const updatedSongs = await songStorage.getAllSongs();
        setUserSongs(updatedSongs);
      }
    } catch (e: any) {
      console.warn("Sync interrupted:", e.message);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // ── Navigation — direct setState for instant response ──
  const navigateTo = useCallback((view: ViewId) => {
    if (view === 'player') setPlayerViewMode('score');
    setCurrentView(view);
  }, []);

  const handleToggleDelete = useCallback(async (id: string, isDeleted: boolean) => {
    const song = userSongs.find(s => s.metadata.id === id);
    if (song) {
      await songStorage.saveSong({ ...song.metadata, isDeleted }, song.xmlData);
      setUserSongs(await songStorage.getAllSongs());
    }
  }, [userSongs]);

  const handlePermanentDelete = useCallback(async (id: string) => {
    if (window.confirm("ลบเพลงนี้ถาวร?")) {
      await songStorage.deleteSong(id);
      setUserSongs(await songStorage.getAllSongs());
    }
  }, []);

  const handleSongSelect = useCallback(async (
    song: Song, xml?: string,
    mode: 'listen' | 'studio' | 'edit' = 'studio',
    fromMarket = false,
    desiredView?: { main: 'player' | 'tracks', player?: 'score' | 'pianoroll' }
  ) => {
    let finalXml = xml;
    const owned = userSongs.find(s => s.metadata.id === song.id);
    if (!finalXml) finalXml = owned?.xmlData || '';

    setSelectedSong(song);
    setUploadedMusicXml(finalXml);

    musicEngine.pause();
    musicEngine.setTransportSeconds(0);

    const parsed = musicEngine.parseMusicXml(finalXml);
    const newTracks: TrackState[] = Object.entries(parsed.partNames).map(([id, name]) => {
      const low = name.toLowerCase();
      const isVocal = ['vocal', 'voice', 'singer', 'melody', 'lead', 'soprano'].some(k => low.includes(k));
      return {
        id, name, isMuted: false, isSolo: false, lyricMode: 'Movable Do', volume: 0.8, pan: 0,
        mode: isVocal ? 'vocal' : 'instrument',
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
      setCurrentView('player');
      setPlayerViewMode('score');
    }
  }, [userSongs]);

  const handleLanguageChange = (lang: 'th' | 'en') => { setPreferredLanguage(lang); localStorage.setItem('nimo_lang', lang); };
  const handleCountryChange = (c: string) => { setUserCountry(c); localStorage.setItem('nimo_country', c); };
  const handleInstrumentChange = (i: string) => { setUserInstrument(i); localStorage.setItem('nimo_instrument', i); };
  const handleTogglePerformanceMode = (v: boolean) => { setPerformanceMode(v); localStorage.setItem('nimo_perf_mode', String(v)); };

  const completeOnboarding = () => {
    if (!userCountry || !userInstrument) {
      alert(preferredLanguage === 'en' ? "Please complete all fields" : "กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    setShowOnboarding(false);
  };

  // ── Render current page only ──
  const renderPage = () => {
    switch (currentView) {
      case 'home':
        return (
          <HomePage
            onSongSelect={handleSongSelect}
            userLibrary={userSongs}
            onEnterStudio={() => navigateTo('player')}
            onViewVault={() => navigateTo('home')} // Now part of home
            onSearch={(q) => setGlobalSearchQuery(q)}
            performanceMode={performanceMode}
            onToggleDelete={handleToggleDelete}
            onPermanentDelete={handlePermanentDelete}
            onRefresh={triggerSync}
            isSyncing={isSyncing}
          />
        );
      case 'player':
        return <PlayerPage song={selectedSong} musicXml={uploadedMusicXml} tracks={tracks} setTracks={setTracks} viewMode={playerViewMode} setViewMode={setPlayerViewMode} loopPresets={loopPresets} setLoopPresets={setLoopPresets} performanceMode={performanceMode} />;
      case 'forge':
        return <StudioPage selectedSong={selectedSong} xmlData={uploadedMusicXml} tracks={tracks} setTracks={setTracks} onPublish={triggerSync} onExit={() => navigateTo('home')} />;
      case 'profile':
        return <ProfilePage onEnterForge={() => navigateTo('forge')} userLibrary={userSongs} onSongSelect={handleSongSelect} onTriggerSync={triggerSync} isSyncing={isSyncing} onRefresh={triggerSync} preferredLanguage={preferredLanguage} setPreferredLanguage={handleLanguageChange} userCountry={userCountry} setUserCountry={handleCountryChange} userInstrument={userInstrument} setUserInstrument={handleInstrumentChange} />;
      case 'settings':
        return <SettingsPage performanceMode={performanceMode} onTogglePerformanceMode={handleTogglePerformanceMode} nimoEnabled={nimoEnabled} onToggleNimoEnabled={(val) => { setNimoEnabled(val); localStorage.setItem('nimo_enabled', String(val)); }} nimoVoice={nimoVoice} onChangeNimoVoice={(val) => { setNimoVoice(val); localStorage.setItem('nimo_voice', val); }} />;
      case 'distribution':
        return <DistributionPage userLibrary={userSongs} onRefresh={triggerSync} onBack={() => navigateTo('home')} />;
      case 'nimo':
        return <NimoPage selectedSong={selectedSong} xmlData={uploadedMusicXml} preferredLanguage={preferredLanguage} />;
      case 'presentation':
        return <BrandingPage onEnter={() => navigateTo('home')} backgroundImage="/images/memolody_hero.png" />;
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col h-[100dvh] w-full bg-[#0A0A0B] font-sans selection:bg-cyan-500/30 ${performanceMode ? 'perf-mode' : ''}`}>

      {/* ── ONBOARDING ── */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[30000] bg-black/95 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-8 space-y-6">
            <h2 className="text-lg font-black text-white uppercase tracking-tight text-center">Welcome to Memolody</h2>

            <select value={userCountry} onChange={e => handleCountryChange(e.target.value)}
              className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm outline-none focus:border-cyan-500">
              <option value="" disabled className="text-black">Country...</option>
              <option value="Thailand" className="text-black">Thailand</option>
              <option value="USA" className="text-black">USA</option>
              <option value="UK" className="text-black">UK</option>
              <option value="Other" className="text-black">Other</option>
            </select>

            <div className="flex gap-2">
              {(['en', 'th'] as const).map(lang => (
                <button key={lang} onClick={() => handleLanguageChange(lang)}
                  className={`flex-1 h-11 rounded-xl text-xs font-black uppercase border transition-colors ${preferredLanguage === lang ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-white/5 text-zinc-500 border-white/10'}`}>
                  {lang === 'en' ? 'EN' : 'TH'}
                </button>
              ))}
            </div>

            <select value={userInstrument} onChange={e => handleInstrumentChange(e.target.value)}
              className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm outline-none focus:border-cyan-500">
              <option value="" disabled className="text-black">Instrument...</option>
              <option value="Piano" className="text-black">Piano</option>
              <option value="Guitar" className="text-black">Guitar</option>
              <option value="Vocals" className="text-black">Vocals</option>
              <option value="Other" className="text-black">Other</option>
            </select>

            <button onClick={completeOnboarding}
              className="w-full h-12 bg-white text-black rounded-xl font-black uppercase tracking-widest text-xs active:scale-95">
              Start
            </button>
          </div>
        </div>
      )}

      {/* ── HEADER — solid bg, no blur ── */}
      <header className="h-12 flex items-center justify-between px-4 bg-[#0A0A0B] border-b border-white/5 shrink-0 z-[10000]">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-cyan-400" />
          <span className="text-[10px] font-black tracking-[0.15em] text-zinc-400">MEMOLODY <span className="text-cyan-400">V2</span></span>
        </div>

        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map(item => (
            <button key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-colors duration-75 ${currentView === item.id ? 'bg-white text-black' : 'text-zinc-600 hover:text-zinc-300'}`}>
              <item.icon size={12} strokeWidth={2.5} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isSyncing && <RefreshCcw size={10} className="animate-spin text-cyan-400" />}
          <div className={`w-1.5 h-1.5 rounded-full ${onlineStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </div>
      </header>

      {/* ── MAIN — only active page renders ── */}
      <main className="flex-1 overflow-hidden relative bg-[#0A0A0B]">
        <Suspense fallback={<PageLoader />}>
          {renderPage()}
        </Suspense>
      </main>
    </div>
  );
};
export default App;
