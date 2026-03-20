
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Home, User, Music2, Play, Zap, RefreshCcw, Star, Shield, Sparkles } from 'lucide-react';
import { FloatingNimo } from './components/Nimo/FloatingNimo';
import JSZip from 'jszip';
import { musicEngine } from './lib/MusicEngine';
import { songStorage } from './lib/SongStorage';
import { CloudSyncService } from './lib/CloudSyncService';
import { Song, TrackState } from './types';
import { LoopPreset } from './components/Player/LoopMatrixModal';
import { useAuth, hasAccess } from './lib/useAuth';

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

// ── Minimal loading fallback ──
const PageLoader = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
  </div>
);

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
  { id: 'admin', icon: Shield, label: 'CORE', minRole: 'admin' },
];

const App: React.FC = () => {
  const { authUser, role } = useAuth();
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [isNimoOpen, setIsNimoOpen] = useState(false);
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

  // Settings
  const [preferredLanguage, setPreferredLanguage] = useState<'th' | 'en'>(() => (localStorage.getItem('nimo_lang') as any) || 'en');
  const [userCountry, setUserCountry] = useState(() => localStorage.getItem('nimo_country') || '');
  const [userInstrument, setUserInstrument] = useState(() => localStorage.getItem('nimo_instrument') || '');
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('nimo_lang'));
  const [nimoEnabled, setNimoEnabled] = useState(() => localStorage.getItem('nimo_enabled') !== 'false');
  const [nimoVoice, setNimoVoice] = useState<'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man'>(() => (localStorage.getItem('nimo_voice') as any) || 'teen_girl');

  useEffect(() => {
    (async () => {
      try {
        await songStorage.init();
        const songs = await songStorage.getAllSongs();
        setUserSongs(songs);
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

  const navigateTo = useCallback((view: ViewId, openNimo?: boolean) => {
    if (openNimo) {
      setIsNimoOpen(true);
      return;
    }
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

  const renderPage = () => {
    switch (currentView) {
      case 'home':
        return <HomePage onSongSelect={handleSongSelect} userLibrary={userSongs} onEnterStudio={() => navigateTo('player')} onViewVault={() => navigateTo('home')} onSearch={setGlobalSearchQuery} performanceMode={performanceMode} onToggleDelete={handleToggleDelete} onPermanentDelete={handlePermanentDelete} onRefresh={triggerSync} isSyncing={isSyncing} />;
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
      {showOnboarding && (
        <div className="fixed inset-0 z-[30000] bg-black/95 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-2xl p-8 space-y-6">
            <h2 className="text-lg font-black text-white uppercase tracking-tight text-center">Welcome to Memolody</h2>
            <select value={userCountry} onChange={e => handleCountryChange(e.target.value)} className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm outline-none focus:border-cyan-500">
              <option value="" disabled>Country...</option>
              <option value="Thailand">Thailand</option>
              <option value="USA">USA</option>
              <option value="Other">Other</option>
            </select>
            <div className="flex gap-2">
              {['en', 'th'].map(lang => (
                <button key={lang} onClick={() => handleLanguageChange(lang as any)} className={`flex-1 h-11 rounded-xl text-xs font-black uppercase border transition-colors ${preferredLanguage === lang ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-white/5 text-zinc-500 border-white/10'}`}>
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
            <select value={userInstrument} onChange={e => handleInstrumentChange(e.target.value)} className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white text-sm outline-none focus:border-cyan-500">
              <option value="" disabled>Instrument...</option>
              <option value="Piano">Piano</option>
              <option value="Guitar">Guitar</option>
              <option value="Vocals">Vocals</option>
            </select>
            <button onClick={completeOnboarding} className="w-full h-12 bg-white text-black rounded-xl font-black uppercase tracking-widest text-xs active:scale-95">Start</button>
          </div>
        </div>
      )}

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
              onClick={() => item.isNimo ? navigateTo(item.id, true) : navigateTo(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[8px] font-black uppercase tracking-wider transition-colors duration-75 ${
                item.isNimo
                  ? 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/20'
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
        <Suspense fallback={<PageLoader />}>
          {renderPage()}
        </Suspense>
      </main>

      {/* Floating Nimo AI - globally visible on all pages */}
      {nimoEnabled && (
        <FloatingNimo
          isOpenProp={isNimoOpen}
          setIsOpenProp={setIsNimoOpen}
          voiceType={nimoVoice}
          preferredLanguage={preferredLanguage}
        />
      )}
    </div>
  );
};
export default App;
