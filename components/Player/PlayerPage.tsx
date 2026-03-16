
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import {
  Play, Pause, SlidersHorizontal,
  X, Volume2, SkipBack,
  RefreshCw, Repeat, Music,
  VolumeX, Bell, BellOff, Eye, EyeOff, LayoutGrid, ChevronUp
} from 'lucide-react';
import ProScoreEditor from './ProScoreEditor';
import { KeyTransposeDisplay, BpmDisplay, BarBeatPositionDisplay, TimeSigDisplay } from './LCDDisplay';
import MixerPanel from './MixerPanel';
import PerformanceScore from './PerformanceScore';
import LoopMatrixModal, { LoopPreset } from './LoopMatrixModal';
import PluginBrowserModal from './PluginBrowserModal';
import FXPluginModal from './FXPluginModal';
import MemoPractice from './MemoPractice';
import ChordPage from '../Chord/ChordPage';
import { musicEngine } from '../../lib/MusicEngine';
import { Song, TrackState, EffectInstance, LyricMode } from '../../types';

export type PlayerCardType = 'score' | 'pianoroll' | 'trackview' | 'memochord' | 'kodaly' | 'practice';

const PlayerPage: React.FC<{
  song: Song | null; musicXml?: string | null; tracks: TrackState[]; setTracks: any;
  viewMode: any; setViewMode: any; isPreviewMode?: boolean;
  loopPresets: LoopPreset[]; setLoopPresets: any;
  performanceMode?: boolean;
}> = ({ song, musicXml, tracks, setTracks, viewMode = 'score', setViewMode, loopPresets, setLoopPresets, performanceMode }) => {
  const [isPlaying, setIsPlaying] = useState(false);
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
  const [activeCard, setActiveCard] = useState<PlayerCardType>('score');

  const volumePopupRef = useRef<HTMLDivElement>(null);
  const volumeDragStartYRef = useRef<number | null>(null);
  const volumeDragStartVolRef = useRef<number>(0.8);
  const localSong = song || { title: 'Untitled', artist: 'Unknown', bpm: 120, key: 'Bb', duration: 180 } as any;
  const parsedData = useMemo(() => musicEngine.parseMusicXml(musicXml || ''), [musicXml]);

  useEffect(() => {
    const xmlBpm = parsedData.metadata.bpm;
    if (xmlBpm && xmlBpm >= 20 && xmlBpm <= 400) {
      setCurrentBpm(xmlBpm);
      musicEngine.setBpm(xmlBpm);
    }
  }, [parsedData.metadata.bpm]);

  const activeLyricMode = useMemo(() => tracks[0]?.lyricMode || 'Movable Do', [tracks]);

  useEffect(() => { musicEngine.setMasterVolume(masterVolume); }, [masterVolume]);
  useEffect(() => { musicEngine.updateTrackStates(tracks); }, [tracks]);

  const musicalTimeRef = useRef(0);
  const lastRenderTime = useRef(0);

  const totalDurationSeconds = useMemo(() => {
    if (!parsedData.notes.length) return localSong.duration || 180;
    const lastNote = parsedData.notes.reduce((p, c) => (c.startTime + c.duration) > (p.startTime + p.duration) ? c : p, parsedData.notes[0]);
    return ((lastNote.startTime + lastNote.duration) * 60) / (currentBpm || 75);
  }, [parsedData.notes, currentBpm, localSong.duration]);

  const handleTogglePlay = async () => {
    await Tone.start();
    if (Tone.getContext().state !== 'running') await Tone.getContext().resume();
    const tState = musicEngine.transportState;
    if (tState === 'started') { musicEngine.pause(); setIsPlaying(false); return; }
    if (tState === 'paused') { try { setIsAudioLoading(true); await musicEngine.resume(); setIsPlaying(true); } finally { setIsAudioLoading(false); } return; }
    setIsAudioLoading(true);
    try {
      await musicEngine.ensureInitialized();
      musicEngine.setBpm(currentBpm || 120);
      await musicEngine.loadSong(parsedData.notes, tracks, transpose, parsedData.timeSignature, isMetronomeOn);
      await musicEngine.start();
      setIsPlaying(true);
    } finally { setIsAudioLoading(false); }
  };

  const beatsPerMeasure = parsedData.timeSignature.beats || 4;
  const currentBar = musicEngine.currentMeasure ? parseInt(musicEngine.currentMeasure) || 1 : Math.floor(musicEngine.transportMusicalTime / beatsPerMeasure) + 1;
  const currentBeat = Math.floor(musicEngine.transportMusicalTime % beatsPerMeasure) + 1;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  const activeLoop = useMemo(() => loopPresets.find(p => p.isActive), [loopPresets]);
  useEffect(() => {
    if (activeLoop && activeLoop.isActive) {
      musicEngine.setLoopEnabled(true);
      musicEngine.setLoopPointsByMeasures(activeLoop.startBar, activeLoop.endBar, beatsPerMeasure);
    } else { musicEngine.setLoopEnabled(false); }
  }, [activeLoop, beatsPerMeasure, currentBpm]);

  const rafId = useRef(0);
  const animate = useCallback((time: number) => {
    musicalTimeRef.current = musicEngine.transportMusicalTime;
    if (time - lastRenderTime.current > 200) {
      setCurrentTime(musicEngine.transportSeconds);
      lastRenderTime.current = time;
    }
    rafId.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [animate]);

  return (
    <div className="h-dvh flex flex-col w-full bg-[#050507] relative overflow-hidden select-none touch-pan-y">
      
      {/* ── CARD NAVIGATION (MOBILE-OPTIMIZED) ── */}
      <div className="shrink-0 bg-[#0c0c0e]/80 border-b border-white/5 backdrop-blur-xl z-[100] safe-top">
         <div className="flex overflow-x-auto no-scrollbar px-4 py-3 gap-2 snap-x">
           {(['score', 'pianoroll', 'trackview', 'memochord', 'kodaly', 'practice'] as PlayerCardType[]).map(card => {
             const labels: Record<PlayerCardType, string> = {
               'score': 'Score', 'pianoroll': 'Roll', 'trackview': 'Tracks',
               'memochord': 'Ring', 'kodaly': 'Kodály', 'practice': 'Practice'
             };
             return (
               <button key={card} onClick={() => setActiveCard(card)}
                 className={`px-5 h-9 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap snap-center transition-all
                   ${activeCard === card ? 'bg-cyan-500 text-black' : 'bg-white/5 text-zinc-500 hover:text-white'}`}>
                 {labels[card]}
               </button>
             );
           })}
         </div>
      </div>

      {/* ── CONTENT AREA ── */}
      <div className={`flex-1 relative w-full ${activeCard === 'score' || activeCard === 'memochord' || activeCard === 'kodaly' ? 'overflow-y-auto no-scrollbar' : 'overflow-hidden'}`}>
        
        <div style={{ display: (activeCard === 'score' || activeCard === 'kodaly') ? 'contents' : 'none' }}>
          <ProScoreEditor xmlData={musicXml} currentTime={musicEngine.transportMusicalTime} isPlaying={isPlaying} songMetadata={localSong} zoom={1.0} transpose={transpose} layoutMode={'paginated'} isLoupeEnabled={false} showLaser={true} lyricMode={activeCard === 'kodaly' ? 'Kodaly' : activeLyricMode} activeLoop={activeLoop} performanceMode={performanceMode} />
        </div>

        {activeCard === 'pianoroll' && (
          <PerformanceScore notes={parsedData.notes} tracks={tracks} musicalTimeRef={musicalTimeRef} onSeek={(t) => musicEngine.setTransportSeconds(t)} onTogglePlay={handleTogglePlay} bpm={currentBpm} isPlaying={isPlaying} songKey={localSong.key} beatsPerMeasure={beatsPerMeasure} />
        )}

        {activeCard === 'trackview' && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-700 opacity-50 p-12">
            <LayoutGrid size={48} className="mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-center">Track Matrix Rendering...</p>
          </div>
        )}

        {activeCard === 'memochord' && <div className="pb-40"><ChordPage song={song} musicXml={musicXml ?? null} /></div>}

        {activeCard === 'practice' && (
          <MemoPractice
            totalBars={parsedData.notes.length > 0 ? (parsedData.notes[parsedData.notes.length - 1].startTime / beatsPerMeasure) : 100}
            currentBar={currentBar}
            onActivateLoop={(startBar, endBar, color) => {
              setLoopPresets((p: any) => {
                let existing = p.find((x: any) => x.id === 'practice-loop');
                if (!existing) return [...p.map((x: any) => ({ ...x, isActive: false })), { id: 'practice-loop', label: 'Practice Focus', startBar, endBar, color, isActive: true }];
                return p.map((x: any) => x.id === 'practice-loop' ? { ...x, startBar, endBar, color, isActive: true } : { ...x, isActive: false });
              });
              setActiveCard('score');
            }}
          />
        )}
      </div>

      {/* ── COMPACT TRANSPORT (MOBILE-ONLY STACK) ── */}
      <div className={`fixed inset-x-0 bottom-0 z-[5000] p-4 transition-transform duration-500 ease-out flex flex-col items-center gap-3 ${isTransportHidden ? 'translate-y-[150%]' : 'translate-y-0'}`}>
        
        {/* Top Info row (Time & Metronome) */}
        <div className="w-full max-w-sm flex items-center justify-between bg-black/80 backdrop-blur-xl border border-white/5 rounded-2xl px-4 h-10 shadow-lg pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-cyan-400 lcd-font tabular-nums">{formatTime(currentTime)}</span>
            <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden relative" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); musicEngine.setTransportSeconds(((e.clientX - rect.left) / rect.width) * totalDurationSeconds); }}>
              <div className="absolute h-full bg-cyan-500" style={{ width: `${(currentTime/totalDurationSeconds)*100}%` }} />
            </div>
            <span className="text-[8px] font-bold text-zinc-600 lcd-font">{formatTime(totalDurationSeconds)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setIsMetronomeOn(!isMetronomeOn); musicEngine.toggleMetronome(!isMetronomeOn); }} 
              className={`p-2 ${isMetronomeOn ? 'text-cyan-400' : 'text-zinc-600'}`}><Bell size={14} /></button>
            <button onClick={() => setShowLoopMatrix(true)} className={`p-2 ${activeLoop ? 'text-cyan-400' : 'text-zinc-600'}`}><Repeat size={14} /></button>
            <button onClick={() => setIsTransportHidden(true)} className="p-2 text-zinc-600 hover:text-white"><EyeOff size={14} /></button>
          </div>
        </div>

        {/* Main Controls row */}
        <div className="w-full max-w-sm flex items-center justify-between p-1 bg-white rounded-full shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-1 pl-2">
            <button onClick={() => setShowMixer(true)} className="w-10 h-10 flex items-center justify-center text-zinc-400"><SlidersHorizontal size={16} /></button>
            <button onClick={() => { musicEngine.pause(); musicEngine.setTransportSeconds(0); setIsPlaying(false); }} className="w-10 h-10 flex items-center justify-center text-zinc-400"><SkipBack size={20} fill="currentColor" /></button>
          </div>

          <button onClick={handleTogglePlay} disabled={isAudioLoading} className="w-14 h-14 bg-cyan-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(0,229,255,0.4)] active:scale-95 transition-all">
            {isAudioLoading ? <RefreshCw size={24} className="animate-spin text-white/50" /> : (isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" className="ml-1" />)}
          </button>

          <div className="flex items-center gap-1 pr-2">
            <button onClick={() => setShowVolumeSlider(!showVolumeSlider)} className={`w-10 h-10 rounded-full flex items-center justify-center ${showVolumeSlider ? 'text-cyan-500 bg-cyan-50' : 'text-zinc-400'}`}>
              {masterVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={20} />}
            </button>
            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>

        {/* LCD Grid for Settings */}
        {!isTransportHidden && (
          <div className="w-full max-w-sm grid grid-cols-4 bg-[#0c0c0e]/95 border border-white/5 rounded-2xl h-10 divide-x divide-white/5 overflow-hidden shadow-xl pointer-events-auto">
             <div className="flex items-center justify-center"><KeyTransposeDisplay keySig={localSong.key} transpose={transpose} onTransposeChange={setTranspose} /></div>
             <div className="flex items-center justify-center"><BpmDisplay bpm={currentBpm} onBpmChange={(b) => { setCurrentBpm(b); musicEngine.setBpm(b); }} /></div>
             <div className="flex items-center justify-center"><TimeSigDisplay beats={parsedData.timeSignature.beats} beatType={parsedData.timeSignature.beatType} /></div>
             <div className="flex items-center justify-center"><BarBeatPositionDisplay bar={currentBar} beat={currentBeat} onSeek={(bar) => musicEngine.setTransportSeconds((bar - 1) * beatsPerMeasure * 60 / currentBpm)} /></div>
          </div>
        )}
      </div>

      {/* Transport Show Trigger */}
      {isTransportHidden && (
        <button onClick={() => setIsTransportHidden(false)} className="fixed bottom-6 left-1/2 -translate-x-1/2 w-12 h-10 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-center text-white/50 animate-bounce active:scale-90 transition-all z-[5001]">
          <ChevronUp size={24} />
        </button>
      )}

      {/* Modals & Overlays */}
      {showVolumeSlider && (
        <div className="fixed inset-0 z-[10000]" onClick={() => setShowVolumeSlider(false)}>
           <div className="absolute bottom-40 right-10 w-14 h-64 bg-black/90 rounded-full border border-white/10 p-3 flex flex-col items-center pointer-events-auto"
              onPointerDown={(e) => {
                volumeDragStartYRef.current = e.clientY;
                volumeDragStartVolRef.current = masterVolume;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                e.stopPropagation();
              }}
              onPointerMove={(e) => {
                if (volumeDragStartYRef.current === null) return;
                const delta = volumeDragStartYRef.current - e.clientY;
                setMasterVolume(Math.max(0, Math.min(1, volumeDragStartVolRef.current + delta / 160)));
              }}
              onPointerUp={() => volumeDragStartYRef.current = null}>
              <div className="flex-1 w-2 bg-white/10 rounded-full relative overflow-hidden">
                <div className="absolute bottom-0 inset-x-0 bg-cyan-400" style={{ height: `${masterVolume*100}%` }} />
              </div>
           </div>
        </div>
      )}

      {showMixer && (
        <div className="fixed inset-0 z-[10000] bg-black/95 p-4 flex flex-col" onClick={(e) => e.target === e.currentTarget && setShowMixer(false)}>
          <div className="w-full h-full max-w-2xl mx-auto bg-[#0c0c0e] border border-white/10 rounded-[32px] p-6 overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-black italic text-white">MIXER</h3>
               <button onClick={() => setShowMixer(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <MixerPanel tracks={tracks} onUpdateTrack={(id, update) => setTracks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, ...update } : t))} />
            </div>
          </div>
        </div>
      )}

      {showLoopMatrix && <LoopMatrixModal presets={loopPresets} onClose={() => setShowLoopMatrix(false)} onUpdatePreset={(id, u) => setLoopPresets((p: any) => p.map((x: any) => x.id === id ? { ...x, ...u } : x))} onDisableAll={() => setLoopPresets((p: any) => p.map((x: any) => ({ ...x, isActive: false })))} />}

    </div>
  );
};

export default PlayerPage;
