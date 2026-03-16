
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import {
  Play, Pause, SlidersHorizontal,
  X, Volume2, SkipBack,
  RefreshCw, Repeat, Music,
  VolumeX, Bell, BellOff, Eye, EyeOff
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

  // Card Navigation State
  const [activeCard, setActiveCard] = useState<PlayerCardType>('score');

  const [pluginBrowserTarget, setPluginBrowserTarget] = useState<{ trackId: string; slotIndex: number } | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<{ trackId: string; slotIndex: number; plugin: EffectInstance } | null>(null);

  const volumePopupRef = useRef<HTMLDivElement>(null);
  const volumeDragStartYRef = useRef<number | null>(null);
  const volumeDragStartVolRef = useRef<number>(0.8);
  const localSong = song || { title: 'Untitled', artist: 'Unknown', bpm: 120, key: 'Bb', duration: 180 } as any;
  const parsedData = useMemo(() => musicEngine.parseMusicXml(musicXml || ''), [musicXml]);

  // Auto-sync BPM from XML metadata whenever a new song is loaded
  useEffect(() => {
    const xmlBpm = parsedData.metadata.bpm;
    if (xmlBpm && xmlBpm >= 20 && xmlBpm <= 400) {
      setCurrentBpm(xmlBpm);
      musicEngine.setBpm(xmlBpm);
    }
  }, [parsedData.metadata.bpm]);

  // Derive the current active lyric mode from tracks to feed into the Score Editor
  const activeLyricMode = useMemo(() => {
    return tracks[0]?.lyricMode || 'Movable Do';
  }, [tracks]);

  useEffect(() => {
    musicEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    musicEngine.updateTrackStates(tracks);
  }, [tracks]);

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

  const handleTogglePlay = async () => {
    // 1. Force start Tone.js Context immediately on user gesture
    await Tone.start();

    // Resume if still suspended (some browsers need this)
    if (Tone.getContext().state !== 'running') {
      await Tone.getContext().resume();
    }

    const tState = musicEngine.transportState;

    // ── CASE 1: Currently playing → PAUSE ──────────────────────────────
    if (tState === 'started') {
      musicEngine.pause();
      setIsPlaying(false);
      return;
    }

    // ── CASE 2: Paused (not stopped) → RESUME from current position ────
    if (tState === 'paused') {
      try {
        setIsAudioLoading(true);
        await musicEngine.resume();
        setIsPlaying(true);
      } catch (e) {
        console.error('Resume failed:', e);
      } finally {
        setIsAudioLoading(false);
      }
      return;
    }

    // ── CASE 3: Stopped / never started → fresh loadSong + start ───────
    setIsAudioLoading(true);
    try {
      await musicEngine.ensureInitialized();
      const bpmToUse = parsedData.metadata.bpm || currentBpm || 120;
      musicEngine.setBpm(bpmToUse);
      setCurrentBpm(bpmToUse);
      await musicEngine.loadSong(parsedData.notes, tracks, transpose, parsedData.timeSignature, isMetronomeOn);
      await musicEngine.start();
      setIsPlaying(true);
    } catch (e) {
      console.error('Playback Start Failed:', e);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const beatsPerMeasure = parsedData.timeSignature.beats || 4;
  // Use written bar number from MusicEngine (correct during repeats)
  // Falls back to calculated bar if currentMeasure not yet set
  const writtenBar = musicEngine.currentMeasure;
  const currentBar = writtenBar ? parseInt(writtenBar) || 1 : Math.floor(musicEngine.transportMusicalTime / beatsPerMeasure) + 1;
  const currentBeat = Math.floor(musicEngine.transportMusicalTime % beatsPerMeasure) + 1;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  const originalBpm = parsedData.metadata.bpm || 120;
  const musicalTime = musicEngine.transportMusicalTime * (60 / originalBpm);

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
    <div className="flex flex-col h-full w-full bg-[#050507] relative overflow-hidden unselectable">

      {/* ── PLAYER CARD NAVIGATOR ── */}
      <div className="w-full flex justify-center py-3 bg-[#0c0c0e]/80 border-b border-white/5 backdrop-blur-xl shrink-0 z-50">
        <div className="flex bg-black/50 p-1.5 rounded-full border border-white/10 shadow-inner overflow-x-auto no-scrollbar max-w-full">
          {(['score', 'pianoroll', 'trackview', 'memochord', 'kodaly', 'practice'] as PlayerCardType[]).map(card => {
            const labels: Record<PlayerCardType, string> = {
              'score': 'Score Sheet', 'pianoroll': 'Piano Roll', 'trackview': 'Trackview',
              'memochord': 'Chord Ring', 'kodaly': 'Kodály', 'practice': 'Memo Practice'
            };
            return (
              <button
                key={card}
                onClick={() => setActiveCard(card)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                  ${activeCard === card ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
              >
                {labels[card]}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`flex-1 flex flex-col relative items-center w-full ${activeCard === 'score' || activeCard === 'memochord' || activeCard === 'kodaly' ? 'pt-2 pb-48 overflow-y-auto no-scrollbar' : 'overflow-hidden'}`}>

        {/* ProScoreEditor: Handles Score, MemoChord, Kodaly */}
        <div
          style={{
            display: (activeCard === 'score' || activeCard === 'kodaly') ? 'contents' : 'none',
            width: '100%', height: '100%'
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
            lyricMode={activeCard === 'kodaly' ? 'Kodaly' : activeLyricMode}
            activeLoop={activeLoop}
            performanceMode={performanceMode}
          />
        </div>

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

        {/* Placeholder: Trackview */}
        {activeCard === 'trackview' && (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 pb-32">
            <SlidersHorizontal size={48} className="opacity-20 mb-4" />
            <p className="font-bold uppercase tracking-widest text-xs">Trackview Layout Mode</p>
            <p className="text-[10px] mt-2 max-w-sm text-center opacity-70">กำลังเตรียม Data Visualization สำหรับมุมมองแบบ Trackview (Multitrack Timeline) แยกตามชิ้นดนตรีครับ</p>
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
      </div>

      {/* Render transport controls ONLY if a song is loaded */}
      {song && (
        <>
          {/* Floating Translucent Eye - Shows ONLY when transport is completely hidden */}
          <button
            onClick={() => {
              const el = document.getElementById('transport-container');
              if (el) {
                el.style.transform = 'translateY(0)';
              }
            }}
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[5000] w-12 h-8 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all duration-300 md:hidden no-print ${!isTransportHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            title="Show Controls"
          >
            <Eye size={20} />
          </button>

          {/* Main Transport Container - Slides away completely */}
          <div id="transport-container" className={`fixed inset-x-0 z-[5000] flex flex-col items-center px-3 no-print gap-1.5 pointer-events-none transition-transform duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] ${isTransportHidden ? 'translate-y-[200%]' : 'translate-y-0'}`}
            style={{ bottom: 'min(env(safe-area-inset-bottom, 16px), 16px)' }}>
            <div className="w-full max-w-[500px] bg-[#0c0c0e]/90 backdrop-blur-2xl px-3 h-9 rounded-full border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center gap-3 pointer-events-auto">
              {/* Eye Toggle on the far left - Trigger to hide */}
              <button
                onClick={() => setIsTransportHidden(true)}
                className="p-1.5 transition-all text-white/50 hover:text-white"
                title="Hide Controls"
              >
                <EyeOff size={14} />
              </button>

              <span className="text-[10px] font-black text-cyan-400 lcd-font tabular-nums w-9">{formatTime(currentTime)}</span>
              <div className="flex-1 relative h-[2px] flex items-center cursor-pointer group overflow-hidden" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); musicEngine.setTransportSeconds(((e.clientX - rect.left) / rect.width) * totalDurationSeconds); }}>
                <div className="w-full h-full bg-white/20 rounded-full" />
                <div className="absolute h-full bg-cyan-400 left-0 transition-all shadow-[0_0_8px_#00e5ff]" style={{ width: `${Math.min(100, Math.max(0, (currentTime / totalDurationSeconds) * 100))}%` }} />
                <div className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_#fff] transition-all" style={{ left: `calc(${Math.min(100, Math.max(0, (currentTime / totalDurationSeconds) * 100))}% - 6px)` }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-zinc-300 lcd-font tabular-nums w-9 text-right">{formatTime(totalDurationSeconds)}</span>
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

            <div className="w-full max-w-[calc(100vw-32px)] md:max-w-[640px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-full h-[54px] flex items-center px-2.5 pointer-events-auto relative">
              <div className="flex-[2.5] flex items-center justify-start gap-0.5 pr-1 border-r border-zinc-100">
                <button onClick={() => setShowMixer(!showMixer)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showMixer ? 'bg-zinc-100 text-black' : 'text-zinc-300 hover:text-black'}`}><SlidersHorizontal size={14} /></button>
                <button onClick={() => {
                  // Stop transport fully → next Play = fresh start (Case 3)
                  if (musicEngine.transportState !== 'stopped') {
                    musicEngine.pause();
                  }
                  musicEngine.setTransportSeconds(0);
                  musicEngine.currentMeasure = '';
                  musicEngine.currentNoteTime = 0;
                  setIsPlaying(false);
                }} className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-black"><SkipBack size={18} fill="currentColor" /></button>
                <div className="relative ml-1">
                  <div className={`absolute inset-0 bg-cyan-400/20 blur-md rounded-full transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
                  <button onClick={handleTogglePlay} disabled={isAudioLoading} className={`relative w-[38px] h-[38px] rounded-full flex items-center justify-center text-white transition-all bg-[#00e5ff] shadow-[0_4px_15px_rgba(0,229,255,0.4)]`}>
                    {isAudioLoading ? <RefreshCw size={16} className="animate-spin text-white/50" /> : (isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" className="ml-0.5" />)}
                  </button>
                </div>
              </div>

              <div className="flex-[5] h-[40px] bg-[#0c0c0e] rounded-full flex items-center border border-black shadow-inner overflow-hidden mx-1.5">
                <div className="flex-1 h-full border-r border-white/5 flex items-center justify-center"><KeyTransposeDisplay keySig={localSong.key} transpose={transpose} onTransposeChange={setTranspose} /></div>
                <div className="flex-1 h-full border-r border-white/5 flex items-center justify-center"><BpmDisplay bpm={currentBpm} onBpmChange={(b) => { setCurrentBpm(b); musicEngine.setBpm(b); }} /></div>
                <div className="flex-[0.5] h-full border-r border-white/5 flex items-center justify-center"><TimeSigDisplay beats={parsedData.timeSignature.beats} beatType={parsedData.timeSignature.beatType} /></div>
                <div className="flex-[1.2] h-full flex items-center justify-center"><BarBeatPositionDisplay bar={currentBar} beat={currentBeat} onSeek={(bar) => musicEngine.setTransportSeconds((bar - 1) * beatsPerMeasure * 60 / currentBpm)} /></div>
              </div>

              <div className="flex-[2.5] flex items-center justify-end gap-1 pl-1 relative">
                <button
                  onClick={() => {
                    const modes: LyricMode[] = ['Movable Do', 'Fixed Do', 'Words', 'Jianpu', 'Kodaly', 'Closed'];
                    const nextMode = modes[(modes.indexOf(activeLyricMode) + 1) % modes.length];

                    // [PLAY STORE COMPLIANCE CHECK]
                    import('../../lib/ComplianceGuard').then(m => m.checkNamingCompliance(nextMode));

                    setTracks(tracks.map(t => ({ ...t, lyricMode: nextMode })));
                  }}
                  className={`w-9 h-9 border rounded-full flex flex-col items-center justify-center group active:scale-95 transition-all ${(activeCard === 'score' || activeCard === 'kodaly' || activeCard === 'memochord') ? 'bg-[#fbfbfb] border-zinc-100 text-zinc-300' : 'bg-[#0c0c0e] border-white/5 text-zinc-400'}`}
                  title="Toggle Lyric Mode"
                >
                  <div className="font-bold text-[8px] leading-none mb-0.5 text-indigo-500">Aa</div>
                  <span className={`text-[4px] font-black uppercase mt-0.5 ${(activeCard === 'score' || activeCard === 'kodaly' || activeCard === 'memochord') ? 'text-zinc-400' : 'text-zinc-500'}`}>LYR</span>
                </button>
                <button onClick={() => setActiveCard(activeCard === 'score' ? 'pianoroll' : 'score')} className={`w-9 h-9 border rounded-full flex flex-col items-center justify-center group active:scale-95 transition-all ${activeCard === 'score' ? 'bg-[#fbfbfb] border-zinc-100 text-zinc-300' : 'bg-cyan-50 border-cyan-100 text-cyan-500'}`}>
                  <Music size={13} className={activeCard === 'score' ? 'text-zinc-300' : 'text-cyan-500'} />
                  <span className={`text-[6px] font-black uppercase mt-0.5 ${activeCard === 'score' ? 'text-zinc-400' : 'text-cyan-600'}`}>SCR</span>
                </button>

                <div className="relative" ref={volumePopupRef}>
                  <button
                    onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border-2 ${showVolumeSlider ? 'border-cyan-400 bg-cyan-50 text-cyan-600 shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'border-transparent text-zinc-300 hover:text-cyan-500'}`}
                  >
                    {masterVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={20} className={showVolumeSlider ? 'text-cyan-600' : 'text-zinc-300'} />}
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
    </div>
  );
};

export default PlayerPage;
