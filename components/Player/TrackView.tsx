import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Tone from 'tone';
import {
  ZoomIn, ZoomOut, Play, Pause, SkipBack, Plus,
  Repeat, Mic, SlidersHorizontal, VolumeX, Volume2,
  ChevronLast, ChevronFirst, Maximize, Minimize, Search,
  Target, TargetIcon, MousePointer2, MoveHorizontal,
  Circle, PlusSquare, Sliders, Music2, Languages, FileText, EyeOff, Music,
  Cpu, Sparkles, RefreshCw, Activity, Binary, Timer, Library
} from 'lucide-react';
import { musicEngine } from '../../lib/MusicEngine';
import { Song, ParsedNote, TrackState, EffectInstance, LyricMode } from '../../types';
import { KeyTransposeDisplay, BpmDisplay, BarBeatPositionDisplay, TimeSigDisplay } from './LCDDisplay';
import PluginBrowserModal from './PluginBrowserModal';
import FXPluginModal from './FXPluginModal';
import VerticalFader from './VerticalFader';
import LEDMeter from './LEDMeter';
import LoopMatrixModal, { LoopPreset } from './LoopMatrixModal';
import { SoundBankModule } from '../../plugins/soundbank';

interface TrackViewProps {
  song: Song | null;
  musicXml: string | null;
  tracks: TrackState[];
  setTracks: React.Dispatch<React.SetStateAction<TrackState[]>>;
  isPreviewMode?: boolean;
  onTrackDoubleClick?: () => void;
  loopPresets: LoopPreset[];
  setLoopPresets: any;
  onExitTrackView?: (card: string) => void;
  soloedStems?: Record<string, number | null>;
  onSoloStem?: (trackId: string, stemIndex: number | null) => void;
  showStemControls?: boolean;
}

const MIDIClip: React.FC<{ notes: ParsedNote[]; pixelsPerSecond: number; isMuted: boolean, trackHeight: number, onDoubleClick?: () => void }> = ({ notes, pixelsPerSecond, isMuted, trackHeight, onDoubleClick }) => {
  if (!notes || notes.length === 0) return null;
  const startTime = notes.reduce((min, n) => Math.min(min, n.startTime), Infinity);
  const endTime = notes.reduce((max, n) => Math.max(max, n.startTime + n.duration), -Infinity);
  const duration = endTime - startTime;

  return (
    <div
      onDoubleClick={onDoubleClick}
      className={`absolute top-1 bottom-1 rounded-lg border transition-all cursor-pointer ${isMuted ? 'opacity-20 grayscale' : 'bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-400/50 shadow-md'}`}
      style={{ left: startTime * pixelsPerSecond, width: Math.max(20, duration * pixelsPerSecond) }}
    >
      <svg className="w-full h-full opacity-40" viewBox={`0 0 ${Math.max(20, duration * pixelsPerSecond)} ${trackHeight}`}>
        {notes.slice(0, 100).map((n, i) => (
          <rect
            key={i}
            x={(n.startTime - startTime) * pixelsPerSecond}
            y={(1 - ((n.octave * 12 + n.alter) % 48) / 48) * (trackHeight * 0.4)}
            width={Math.max(2, n.duration * pixelsPerSecond - 1)}
            height={Math.max(1, trackHeight * 0.02)}
            fill="#00e5ff"
            rx="0.5"
          />
        ))}
      </svg>
    </div>
  );
};

const MiniRotaryPan = ({ value, onChange }: { value: number; onChange: (val: number) => void }) => {
  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startVal = value;
    const moveHandler = (me: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in me ? me.touches[0].clientY : (me as MouseEvent).clientY;
      const delta = (startY - currentY) / 100;
      onChange(Math.max(-1, Math.min(1, startVal + delta)));
    };
    const endHandler = () => {
      document.removeEventListener('mousemove', moveHandler as any);
      document.removeEventListener('mouseup', endHandler);
      document.removeEventListener('touchmove', moveHandler as any);
      document.removeEventListener('touchend', endHandler);
    };
    document.addEventListener('mousemove', moveHandler as any);
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchmove', moveHandler as any);
    document.addEventListener('touchend', endHandler);
  };

  return (
    <div
      className="w-6 h-6 rounded-full bg-zinc-900 border border-white/10 relative cursor-ns-resize flex items-center justify-center group"
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onDoubleClick={() => onChange(0)}
      title={`Pan: ${Math.round(value * 100)}`}
    >
      <div
        className="absolute top-0.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-cyan-400 rounded-full origin-bottom"
        style={{ transform: `rotate(${value * 135}deg)` }}
      />
    </div>
  );
};

const TrackView: React.FC<TrackViewProps> = ({ song, musicXml, tracks, setTracks, onTrackDoubleClick, loopPresets, setLoopPresets, onExitTrackView, soloedStems, onSoloStem, showStemControls }) => {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(60);
  const [trackHeight, setTrackHeight] = useState(220); // 👈 changed to 220 to fit channel strip items
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentBpm, setCurrentBpm] = useState(song?.bpm || 120);
  const [transpose, setTranspose] = useState(0);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showLoopMatrix, setShowLoopMatrix] = useState(false);
  const [followPlayhead, setFollowPlayhead] = useState(true);

  const [pluginBrowserTarget, setPluginBrowserTarget] = useState<{ trackId: string; slotIndex: number } | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<{ trackId: string; slotIndex: number; plugin: EffectInstance } | null>(null);

  const [isMixerOpen, setIsMixerOpen] = useState(true);
  const [mixerWidth, setMixerWidth] = useState(200);

  const requestRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const parsedData = useMemo(() => musicEngine.parseMusicXml(musicXml || ''), [musicXml]);
  const totalDurationSeconds = useMemo(() => {
    if (!parsedData.notes.length) return song?.duration || 180;
    const last = parsedData.notes.reduce((p, c) => (c.startTime + c.duration) > (p.startTime + p.duration) ? c : p);
    return (last.startTime + last.duration) * (60 / currentBpm);
  }, [parsedData.notes, currentBpm, song?.duration]);

  const totalDurationBeats = useMemo(() => {
    if (!parsedData.notes.length) return (song?.duration || 180) * (currentBpm / 60);
    const last = parsedData.notes.reduce((p, c) => (c.startTime + c.duration) > (p.startTime + p.duration) ? c : p);
    return Math.ceil(last.startTime + last.duration);
  }, [parsedData.notes, currentBpm, song?.duration]);

  // REFS for rAF loop
  const followRef = useRef(followPlayhead);
  followRef.current = followPlayhead;
  const pixelsRef = useRef(pixelsPerSecond);
  pixelsRef.current = pixelsPerSecond;
  const lastStateUpdate = useRef(0);

  // Single rAF loop for smooth playhead & scrolling (bypassing React render)
  useEffect(() => {
    const animate = (time: number) => {
      const ctMusical = musicEngine.transportMusicalTime;
      const state = musicEngine.transportState === 'started';

      // 1. Direct DOM manipulation for Playhead (Smooth 60fps) - mapped to Musical Time (Beats)
      const playhead = document.getElementById('trackview-playhead');
      if (playhead) {
        playhead.style.left = `${ctMusical * pixelsRef.current}px`;
      }

      // 2. Direct DOM manipulation for Auto-Scroll (Smooth 60fps)
      const viewport = scrollRef.current;
      if (viewport && state && followRef.current) {
        const playheadX = ctMusical * pixelsRef.current;
        const currentScroll = viewport.scrollLeft;
        const viewportWidth = viewport.clientWidth;
        if (playheadX > currentScroll + (viewportWidth * 0.7) || playheadX < currentScroll) {
          viewport.scrollLeft = playheadX - (viewportWidth * 0.2);
        }
      }

      // 3. Throttle React state updates (for LCDs) to ~10fps to avoid heavy SVG re-renders
      if (time - lastStateUpdate.current > 100) {
        setCurrentTime(t => Math.abs(t - ctMusical) > 0.1 ? ctMusical : t); // store Beats
        setIsPlaying(state);
        lastStateUpdate.current = time;

        // 🛑 Auto-stop logic: 2 bars after the last note
        const beatsPerMeasure = parsedData.timeSignature.beats || 4;
        const totalBeats = totalDurationBeats;
        const stopThreshold = totalBeats + (2 * beatsPerMeasure);

        if (state && ctMusical >= stopThreshold) {
          musicEngine.pause();
        }
      }

      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  useEffect(() => { musicEngine.setMasterVolume(masterVolume); }, [masterVolume]);

  // 🔊 Real-time Mute/Solo/Pan/Volume sync to audio engine
  useEffect(() => {
    musicEngine.updateTrackStates(tracks);
  }, [tracks]);

  const handleRulerDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startPixels = pixelsPerSecond;
    const onMove = (me: MouseEvent | TouchEvent) => {
      const cx = 'touches' in me ? me.touches[0].clientX : (me as MouseEvent).clientX;
      const delta = cx - startX;
      setPixelsPerSecond(Math.max(10, Math.min(1000, startPixels * (1 + delta / 200))));
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMove as any);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('mousemove', onMove as any);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove as any);
    window.addEventListener('touchend', onEnd);
  };

  const handleVerticalZoomDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startH = trackHeight;
    const onMove = (me: MouseEvent | TouchEvent) => {
      const cy = 'touches' in me ? me.touches[0].clientY : (me as MouseEvent).clientY;
      const delta = cy - startY;
      setTrackHeight(Math.max(80, Math.min(600, startH + delta)));
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMove as any);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('mousemove', onMove as any);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove as any);
    window.addEventListener('touchend', onEnd);
  };

  const handlePlayheadDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const viewport = scrollRef.current;
    if (!viewport) return;

    const onMove = (me: MouseEvent | TouchEvent) => {
      const rect = viewport.getBoundingClientRect();
      const cx = 'touches' in me ? me.touches[0].clientX : (me as MouseEvent).clientX;
      const scrollLeft = viewport.scrollLeft;

      // Calculate local X in the scrollable timeline
      const localX = cx - rect.left + scrollLeft;
      const newTimeBeats = Math.max(0, localX / pixelsPerSecond);

      // Convert beats to seconds if needed, but setTransportSeconds seems to accept seconds
      // However, current implementation of currentTime is beats. 
      // MusicEngine.setTransportSeconds uses seconds.
      const bpmVal = Tone.Transport.bpm.value;
      const seconds = (newTimeBeats / Tone.Transport.PPQ) * (60 / bpmVal) * Tone.Transport.PPQ; // actually beats / (bpm/60)
      musicEngine.setTransportSeconds(newTimeBeats * (60 / bpmVal));
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove as any);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove as any);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove as any);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove as any);
    window.addEventListener('touchend', onEnd);
  };

  const handleTogglePlay = async () => {
    if (musicEngine.transportState === 'started') {
      musicEngine.pause();
    } else {
      await musicEngine.ensureInitialized();
      await musicEngine.loadSong(parsedData.notes, tracks, transpose, parsedData.timeSignature, false);
      musicEngine.start();
    }
  };

  const cycleTrackMode = (track: TrackState) => {
    const modes: LyricMode[] = [
      'American Movable Do', 'American Fixed Do', 
      'British Movable Doh', 'British Fixed Doh', 
      'Ju Solfege Movable Doh', 'Ju Solfege Fixed Doh', 
      'Jianpu', 'Kodaly', 'Kodaly Rhythm', 
      'Lyric', 'Close'
    ];
    const currentIdx = modes.indexOf(track.lyricMode);
    const nextLyricMode = modes[(currentIdx + 1) % modes.length];
    
    const nextMode: 'instrument' | 'vocal' = nextLyricMode === 'Close' ? 'instrument' : 'vocal';
    const nextPluginId = nextMode === 'vocal' ? 'svs-vocal' : 'memolody-sampler';

    // Update UI state
    setTracks(prev => prev.map(t => {
      if (t.id !== track.id) return t;
      return { ...t, lyricMode: nextLyricMode, mode: nextMode, pluginId: nextPluginId as any };
    }));
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  const beatsPerMeasure = parsedData.timeSignature.beats || 4;
  const currentBar = Math.floor(currentTime / beatsPerMeasure) + 1;
  const currentBeat = Math.floor(currentTime % beatsPerMeasure) + 1;

  return (
    <div className="h-full w-full flex flex-col bg-[#050507] overflow-hidden relative select-none">
      <style>{`
        .scanner-line {
            position: absolute; top: 0; bottom: 0; width: 3px;
            background: #6366f1; z-index: 1500; cursor: ew-resize;
            box-shadow: 0 0 15px rgba(99, 102, 241, 0.9), 0 0 30px rgba(99, 102, 241, 0.4);
            will-change: left; pointer-events: auto;
        }
        .scanner-head {
            position: absolute; top: 0; left: 50%; transform: translateX(-50%);
            width: 14px; height: 14px; background: white; border-radius: 50%;
            box-shadow: 0 0 15px white; border: 2px solid #6366f1;
            cursor: ew-resize;
        }
        .v-resize-handle {
            position: absolute; bottom: 0; left: 0; right: 0; height: 6px;
            cursor: ns-resize; z-index: 20; transition: background 0.2s;
        }
        .v-resize-handle:hover { background: rgba(99, 102, 241, 0.4); }
        .h-resize-ruler { cursor: ew-resize; }
        .h-resize-ruler:hover { background: rgba(255,255,255,0.05); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* HEADER CONSOLE */}
      <header className="h-12 border-b border-white/10 bg-[#0c0c0e] flex items-center justify-between px-3 sm:px-6 z-[2000] shrink-0 gap-2">
        {/* Left: Mixer toggle + Title */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div
            onClick={() => { const targetWidth = isMixerOpen ? 0 : 200; setMixerWidth(targetWidth); setIsMixerOpen(!isMixerOpen); }}
            className={`p-1.5 rounded-lg cursor-pointer transition-all hover:scale-110 active:scale-95 ${isMixerOpen ? 'bg-[#6366f1] text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-white/5 text-zinc-400'}`}
          >
            {isMixerOpen ? <ChevronFirst size={14} /> : <ChevronLast size={14} />}
          </div>
          <div className="flex flex-col hidden sm:flex">
            <span className="text-[9px] font-black text-white uppercase italic tracking-tight leading-tight">STUDIO MATRIX</span>
            <span className="text-[5px] font-bold text-zinc-500 uppercase tracking-widest leading-none">NEURAL CONSOLE V5.5</span>
          </div>
        </div>

        {/* Center: Card Switcher tabs */}
        {onExitTrackView && (
          <div className="flex-1 flex items-center justify-center overflow-x-auto no-scrollbar">
            <div className="flex bg-black/40 p-1 rounded-full border border-white/10 gap-0.5">
              {[
                { id: 'score', label: 'SCORE' },
                { id: 'pianoroll', label: 'PIANO' },
                { id: 'trackview', label: 'TRACK', active: true },
                { id: 'memochord', label: 'CHORD' },
                { id: 'practice', label: 'MEMO' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => !tab.active && onExitTrackView(tab.id)}
                  className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${tab.active ? 'bg-indigo-600 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Right: Zoom display + Follow toggle */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5 gap-2 items-center px-2 sm:px-3 hidden sm:flex">
            <div className="flex flex-col items-center">
              <span className="text-[5px] font-black text-zinc-600 uppercase tracking-widest">H-SCL</span>
              <span className="text-[8px] font-black text-indigo-400 lcd-font">{Math.round(pixelsPerSecond)}</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-[5px] font-black text-zinc-600 uppercase tracking-widest">V-SCL</span>
              <span className="text-[8px] font-black text-cyan-400 lcd-font">{trackHeight}</span>
            </div>
          </div>

          <button
            onClick={() => setFollowPlayhead(!followPlayhead)}
            className={`px-2 sm:px-3 h-8 rounded-full border text-[8px] sm:text-[9px] font-black flex items-center gap-1.5 sm:gap-2 transition-all ${followPlayhead ? 'bg-[#6366f1] border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-white/5 border-white/10 text-zinc-500'}`}
          >
            <Target size={12} /> <span className="hidden sm:inline">{followPlayhead ? 'FOLLOW ON' : 'PAGING ON'}</span>
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE AREA */}
      <div className="flex-1 flex overflow-hidden relative pb-28 bg-[#050507]">
        {/* ENHANCED MIXER SIDEBAR */}
        <div
          className="h-full bg-[#08080a] flex flex-col shrink-0 z-[1000] relative overflow-hidden border-r border-white/5 transition-[width] duration-300 ease-in-out shadow-2xl"
          style={{ width: mixerWidth }}
        >
          <div className="w-full h-full flex flex-col overflow-y-auto no-scrollbar" style={{ minWidth: 200 }}>
            <div className="h-6 border-b border-white/5 flex items-center justify-center shrink-0 bg-black/40 sticky top-0 z-10">
              <span className="text-[4px] font-black text-zinc-600 uppercase tracking-[0.4em] italic">NEURAL CHANNEL STRIP</span>
            </div>

            {tracks.map((track) => {
              const modeConfig: Record<string, { label: string, color: string, icon: any }> = {
                'American Movable Do': { label: 'AMER-M', color: 'bg-blue-600', icon: Languages },
                'American Fixed Do': { label: 'AMER-F', color: 'bg-blue-800', icon: Languages },
                'British Movable Doh': { label: 'BRIT-M', color: 'bg-red-600', icon: Languages },
                'British Fixed Doh': { label: 'BRIT-F', color: 'bg-red-800', icon: Languages },
                'Ju Solfege Movable Doh': { label: 'JU-M', color: 'bg-indigo-600', icon: Languages },
                'Ju Solfege Fixed Doh': { label: 'JU-F', color: 'bg-indigo-800', icon: Languages },
                'Jianpu': { label: 'JIAPU', color: 'bg-amber-600', icon: Activity },
                'Kodaly': { label: 'KODLY', color: 'bg-rose-600', icon: Binary },
                'Kodaly Rhythm': { label: 'TA-TI', color: 'bg-fuchsia-600', icon: Timer },
                'Lyric': { label: 'LYRIC', color: 'bg-sky-500', icon: FileText },
                'Close': { label: 'OFF', color: 'bg-zinc-800', icon: EyeOff }
              };
              const currentCfg = modeConfig[track.lyricMode] || modeConfig['Ju Solfege Movable Doh'];

              return (
                <div key={track.id} className="border-b border-white/5 flex flex-col px-3 py-3 gap-2 transition-all overflow-hidden relative group/strip" style={{ height: trackHeight }}>
                  <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isArmed: !t.isArmed } : t))}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${track.isArmed ? 'bg-rose-600 text-white shadow-[0_0_10px_#ef4444]' : 'bg-zinc-900 border border-white/10 text-zinc-700 hover:text-zinc-400'}`}
                      >
                        <Circle size={10} fill={track.isArmed ? "currentColor" : "none"} />
                      </button>
                      <div className="flex flex-col min-w-0">
                        <h4 className="text-[8px] font-bold text-white uppercase truncate leading-none">{track.name || 'STEMME'}</h4>
                      </div>
                    </div>
                    <div className="shrink-0 h-4 flex items-center"><LEDMeter trackId={track.id} /></div>
                  </div>

                  <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
                    <div className="w-10 flex flex-col items-center bg-black/40 rounded-2xl border border-white/5 py-2">
                      <div className="flex-1 w-full px-1.5">
                        <VerticalFader value={track.volume} onChange={v => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, volume: v } : t))} />
                      </div>
                      <span className="text-[7px] font-black text-cyan-400 lcd-font mt-1">{Math.round(track.volume * 100)}</span>
                    </div>

                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="flex gap-1">
                        <button 
                          onClick={() => {
                            const newTracks = tracks.map(t => t.id === track.id ? { ...t, isMuted: !t.isMuted, isSolo: !t.isMuted ? false : t.isSolo } : t);
                            musicEngine.updateTrackStates(newTracks);
                            setTracks(newTracks as any);
                          }} 
                          className={`flex-1 h-6 rounded-lg text-[8px] font-black border transition-all ${track.isMuted ? 'bg-rose-600 border-rose-400 text-white shadow-lg' : 'bg-zinc-900 border-white/5 text-zinc-600'}`}
                        >M</button>
                        <button 
                          onClick={() => {
                            const newTracks = tracks.map(t => t.id === track.id ? { ...t, isSolo: !t.isSolo, isMuted: !t.isSolo ? false : t.isMuted } : t);
                            musicEngine.updateTrackStates(newTracks);
                            setTracks(newTracks as any);
                          }} 
                          className={`flex-1 h-6 rounded-lg text-[8px] font-black border transition-all ${track.isSolo ? 'bg-amber-400 border-amber-300 text-black shadow-lg shadow-amber-400/20' : 'bg-zinc-900 border-white/5 text-zinc-600'}`}
                        >S</button>
                      </div>
                      
                      {(() => {
                        const availableStems = musicEngine.getAvailableStems(track.id);
                        const activeStem = soloedStems ? (soloedStems[track.id] ?? null) : musicEngine.getActiveStem(track.id);
                        if (showStemControls && availableStems > 1) {
                          return (
                            <div className="flex gap-0.5">
                              {Array.from({ length: availableStems }).map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    const nextStem = activeStem === i ? null : i;
                                    if (onSoloStem) {
                                      onSoloStem(track.id, nextStem);
                                    } else {
                                      musicEngine.soloStem(track.id, nextStem);
                                    }
                                  }}
                                  title={`Solo Stem ${i+1}`}
                                  className={`flex-1 h-5 rounded flex items-center justify-center text-[7px] font-bold border transition-all ${activeStem === i ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_8px_#06b6d4]' : 'bg-black/40 border-white/10 text-cyan-500/70 hover:bg-white/10 hover:text-cyan-400'}`}
                                >
                                  S{i + 1}
                                </button>
                              ))}
                            </div>
                          );
                        }
                        return null;
                      })()}
                      <button onClick={() => cycleTrackMode(track)} className={`flex items-center gap-2 px-2 h-7 rounded-xl border border-white/10 transition-all active:scale-95 group/mode ${currentCfg.color}`}>
                        <currentCfg.icon size={12} className="text-white/80" />
                        <span className="text-[7px] font-black text-white uppercase tracking-widest">{currentCfg.label}</span>
                      </button>
                      <div className="bg-black/30 rounded-xl border border-white/5 p-1 flex flex-col items-center gap-0.5">
                        <MiniRotaryPan value={track.pan || 0} onChange={(val) => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, pan: val } : t))} />
                        <div className="flex justify-between w-full px-2"><span className="text-[4px] text-zinc-700">L</span><span className="text-[4px] text-zinc-700">R</span></div>
                      </div>
                      {/* Instrument / Source Slot */}
                      <button
                        onClick={() => {
                          setTracks(prev => prev.map(t => {
                            if (t.id === track.id) {
                              const defaultId = t.mode === 'vocal' ? 'svs-vocal' : 'memolody-sampler';
                              return { ...t, pluginId: t.pluginId || defaultId };
                            }
                            return t;
                          }));
                          setEditingPlugin({ trackId: track.id, slotIndex: -1, plugin: { definition: null as any, isBypassed: false } }); // special trigger
                        }}
                        className={`h-6 rounded-xl border flex items-center justify-center gap-1.5 transition-all group/inst ${track.pluginId ? 'bg-indigo-500 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-black/40 border-white/10 hover:bg-white/5'}`}
                      >
                        <Sliders size={10} className={track.pluginId ? 'text-white' : 'text-indigo-400 group-hover/inst:scale-110'} />
                        <span className={`text-[6px] font-black uppercase tracking-widest truncate max-w-[40px] ${track.pluginId ? 'text-white' : 'text-white/50'}`}>
                          {track.pluginId === 'memolody-sampler' ? 'SNDBANK' : track.pluginId === 'svs-vocal' ? 'VOCAL' : 'SOURCE'}
                        </span>
                      </button>

                      {/* FX Insert Slot */}
                      <button onClick={() => setPluginBrowserTarget({ trackId: track.id, slotIndex: 0 })} className="h-6 rounded-xl bg-[#0c0c0f] border border-white/5 flex items-center justify-center gap-2 hover:bg-white/5 transition-all group/plug">
                        <PlusSquare size={10} className="text-cyan-400/50 group-hover/plug:scale-110 group-hover/plug:text-cyan-400" />
                        <span className="text-[6px] font-black text-white/50 uppercase tracking-widest">FX</span>
                      </button>


                    </div>
                  </div>
                  <div onMouseDown={handleVerticalZoomDrag} onTouchStart={handleVerticalZoomDrag} className="v-resize-handle" />
                </div>
              );
            })}

            {/* ADD TRACK BUTTON */}
            <div className="flex-1 min-h-[120px] pb-10 flex items-center justify-center border-b border-white/5 bg-transparent hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => {
              const newId = `T-${Date.now().toString().slice(-6)}`;
              setTracks(prev => [...prev, {
                id: newId, name: `NEW TRACK`, isMuted: false, isSolo: false, lyricMode: 'Ju Solfege Movable Doh', volume: 0.8, pan: 0, mode: 'instrument', effects: Array(6).fill(null), isArmed: false
              }]);
            }}>
              <div className="flex flex-col items-center gap-2 group mt-6">
                <div className="w-10 h-10 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center group-hover:bg-cyan-900 group-hover:border-cyan-500/50 transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] group-hover:shadow-[0_0_20px_rgba(0,229,255,0.4)]">
                  <Plus size={16} className="text-zinc-500 group-hover:text-cyan-400" />
                </div>
                <span className="text-[8px] font-black text-zinc-600 group-hover:text-cyan-500 uppercase tracking-widest">Add Track</span>
              </div>
            </div>
          </div>
        </div>

        {/* TRACK TIMELINE */}
        <div className="flex-1 overflow-x-auto no-scrollbar relative bg-black/10" ref={scrollRef}>
          <div className="relative min-h-full" style={{ width: Math.max(totalDurationBeats * pixelsPerSecond + 1000, 2000) }}>

            {/* TIMELINE RULER */}
            <div onMouseDown={handleRulerDrag} onTouchStart={handleRulerDrag} className="sticky top-0 h-8 bg-[#0c0c0e]/90 backdrop-blur-xl border-b border-indigo-500/25 z-[1200] flex items-center px-4 h-resize-ruler transition-colors">
              {Array.from({ length: Math.ceil((totalDurationBeats + 80) / beatsPerMeasure) }).map((_, i) => (
                <div key={i} className="absolute h-full border-l border-indigo-500/40 flex items-center pl-1.5" style={{ left: i * beatsPerMeasure * pixelsPerSecond }}>
                  <span className="text-[9px] font-black text-indigo-400 lcd-font leading-none">{i + 1}</span>
                </div>
              ))}
            </div>

            {tracks.map((track) => (
              <div key={track.id} className="relative border-b border-white/5 hover:bg-white/[0.01] transition-colors overflow-hidden" style={{ height: trackHeight }}>
                <div className="absolute inset-0 pointer-events-none opacity-[0.15] flex">
                  {Array.from({ length: totalDurationBeats + 100 }).map((_, bi) => (
                    <div key={bi} className={`h-full border-l ${bi % beatsPerMeasure === 0 ? 'border-indigo-400 opacity-50' : 'border-white/20 opacity-30'}`} style={{ width: pixelsPerSecond, flexShrink: 0 }} />
                  ))}
                </div>
                <MIDIClip notes={parsedData.notes.filter(n => n.trackId === track.id)} pixelsPerSecond={pixelsPerSecond} isMuted={track.isMuted} trackHeight={trackHeight} onDoubleClick={onTrackDoubleClick} />
                <div onMouseDown={handleVerticalZoomDrag} onTouchStart={handleVerticalZoomDrag} className="v-resize-handle" />
              </div>
            ))}

            {/* PLAYHEAD (Indigo Line) - Moved inside the relative container for accuracy */}
            <div
              id="trackview-playhead"
              className="scanner-line"
              onMouseDown={handlePlayheadDrag}
              onTouchStart={handlePlayheadDrag}
              style={{
                left: `${(currentTime * pixelsPerSecond)}px`,
              }}
            >
              <div className="scanner-head" />
            </div>
          </div>
        </div>
      </div>

      {/* TRANSPORT PILL */}
      <div className="fixed bottom-4 inset-x-0 z-[5000] flex flex-col items-center px-3 no-print gap-1.5 pointer-events-none">
        <div className="w-full max-w-[450px] bg-black/80 backdrop-blur-3xl px-3 h-7 rounded-full border border-white/10 shadow-2xl flex items-center gap-3 pointer-events-auto">
          <span className="text-[9px] font-black text-[#6366f1] lcd-font tabular-nums w-12">{formatTime(musicEngine.transportSeconds)}</span>
          <div className="flex-1 relative h-[1px] flex items-center cursor-pointer group" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); musicEngine.setTransportSeconds(((e.clientX - rect.left) / rect.width) * totalDurationSeconds); }}>
            <div className="w-full h-full bg-white/10 rounded-full" />
            <div className="absolute h-full bg-[#6366f1] left-0 transition-all shadow-[0_0_8px_#6366f1]" style={{ width: `${(musicEngine.transportSeconds / totalDurationSeconds) * 100}%` }} />
            <div className="absolute w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_10px_#fff] transition-all" style={{ left: `calc(${(musicEngine.transportSeconds / totalDurationSeconds) * 100}% - 5px)` }} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black text-zinc-600 lcd-font tabular-nums w-12 text-right">{formatTime(totalDurationSeconds)}</span>
            <div className="h-2 w-px bg-white/10 mx-0.5" />
            <button onClick={() => setShowLoopMatrix(true)} className={`p-1 transition-all ${loopPresets.some(p => p.isActive) ? 'text-indigo-400 drop-shadow-[0_0_8px_#6366f1]' : 'text-zinc-700 hover:text-indigo-400'}`} title="Loop Matrix"><Repeat size={10} /></button>
            <button onClick={() => setFollowPlayhead(!followPlayhead)} className={`p-1 transition-all ${followPlayhead ? 'text-indigo-400 drop-shadow-[0_0_8px_#6366f1]' : 'text-zinc-700 hover:text-indigo-400'}`} title="Toggle Follow Mode"><Target size={10} /></button>
          </div>
        </div>

        <div className="w-full max-w-[calc(100vw-32px)] md:max-w-[580px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-full h-[60px] flex items-center px-3 pointer-events-auto relative">
          <div className="flex-[2] flex items-center justify-start gap-0.5 pr-2 border-r border-zinc-100">
            <button onClick={() => { const targetWidth = isMixerOpen ? 0 : 200; setMixerWidth(targetWidth); setIsMixerOpen(!isMixerOpen); }} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isMixerOpen ? 'bg-zinc-100 text-black shadow-inner' : 'text-zinc-300 hover:text-black hover:bg-zinc-50'}`}><Sliders size={16} /></button>
            <button onClick={() => musicEngine.setTransportSeconds(0)} className="w-9 h-9 flex items-center justify-center text-zinc-300 hover:text-black active:scale-90 transition-all"><SkipBack size={20} fill="currentColor" /></button>
            <div className="relative ml-0.5">
              <div className={`absolute inset-0 bg-[#6366f1]/30 blur-md rounded-full transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
              <button onClick={handleTogglePlay} className={`relative w-[46px] h-[46px] rounded-full flex items-center justify-center text-white transition-all active:scale-90 bg-gradient-to-br from-[#6366f1] to-indigo-700 shadow-[0_4px_15px_rgba(99,102,241,0.4)] hover:brightness-110`}>
                {isPlaying ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" className="ml-0.5" />}
              </button>
            </div>
          </div>
          <div className="flex-1 max-w-[130px] min-[350px]:max-w-[150px] min-[380px]:max-w-[180px] sm:max-w-[230px] md:max-w-[260px] mx-auto h-[44px] bg-[#0a0a0c] rounded-full flex items-center border border-black shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className="flex-1 h-full border-r border-white/5 flex items-center justify-center scale-[0.95]"><KeyTransposeDisplay keySig={song?.key || 'C'} transpose={transpose} onTransposeChange={setTranspose} /></div>
            <div className="flex-1 h-full border-r border-white/5 flex items-center justify-center scale-[0.95]"><BpmDisplay bpm={currentBpm} onBpmChange={(b) => { setCurrentBpm(b); musicEngine.setBpm(b); }} /></div>
            <div className="flex-[0.5] h-full border-r border-white/5 flex items-center justify-center scale-90"><TimeSigDisplay beats={parsedData.timeSignature.beats} beatType={parsedData.timeSignature.beatType} /></div>
            <div className="flex-[1.2] h-full flex items-center justify-center scale-[0.95]"><BarBeatPositionDisplay bar={currentBar} beat={currentBeat} onSeek={(bar) => musicEngine.setTransportSeconds((bar - 1) * beatsPerMeasure * 60 / currentBpm)} /></div>
          </div>
          <div className="flex-[2.5] flex items-center justify-end gap-1 pl-1 relative">
            <button onClick={() => setIsRecording(!isRecording)} className={`w-9 h-9 border rounded-full flex flex-col items-center justify-center group active:scale-95 transition-all ${isRecording ? 'bg-rose-50 border-rose-200 text-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.2)]' : 'bg-[#fbfbfb] border-zinc-100 text-zinc-300 hover:text-rose-400 hover:border-rose-100'}`}>
              <div className={`w-2 h-2 rounded-full mb-0.5 ${isRecording ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]' : 'bg-zinc-300'}`} />
              <span className={`text-[6px] font-black uppercase tracking-tighter ${isRecording ? 'text-rose-600' : 'text-zinc-400'}`}>REC</span>
            </button>
            <button onClick={() => setShowVolumeSlider(!showVolumeSlider)} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border-2 ${showVolumeSlider ? 'border-[#6366f1] bg-indigo-50 text-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'border-transparent text-zinc-300 hover:text-indigo-500 hover:bg-zinc-50'}`}>
              {masterVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={20} className={showVolumeSlider ? 'text-indigo-600' : 'text-zinc-300'} />}
            </button>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showLoopMatrix && <LoopMatrixModal presets={loopPresets} onUpdatePreset={(id, u) => setLoopPresets((p: any) => p.map((x: any) => x.id === id ? { ...x, ...u } : x))} onDisableAll={() => setLoopPresets((p: any) => p.map((x: any) => ({ ...x, isActive: false })))} onClose={() => setShowLoopMatrix(false)} />}

      {pluginBrowserTarget && <PluginBrowserModal onClose={() => setPluginBrowserTarget(null)} onSelect={(pluginDef) => {
        const newEffect: EffectInstance = { definition: pluginDef, isBypassed: false };
        const { trackId, slotIndex } = pluginBrowserTarget;
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, effects: [...t.effects.slice(0, slotIndex), newEffect, ...t.effects.slice(slotIndex + 1)] } : t));
        setPluginBrowserTarget(null);
      }} />}

      {editingPlugin && editingPlugin.slotIndex === -1 && (
        (() => {
          const t = tracks.find(tr => tr.id === editingPlugin.trackId);
          if (!t) return null;
          if (t.pluginId === 'svs-vocal') {
            return null; // VocalioModule removed
          }
          return (
            <SoundBankModule
              trackId={t.id}
              settings={t.pluginSettings || {}}
              onUpdateSettings={(settings) => setTracks(prev => prev.map(tr => tr.id === t.id ? { ...tr, pluginSettings: settings } : tr))}
              onClose={() => setEditingPlugin(null)}
            />
          );
        })()
      )}

      {editingPlugin && editingPlugin.slotIndex >= 0 && <FXPluginModal plugin={editingPlugin.plugin.definition} isBypassed={editingPlugin.plugin.isBypassed} onClose={() => setEditingPlugin(null)} onBypassToggle={() => {
        const { trackId, slotIndex, plugin } = editingPlugin;
        const newPlugin = { ...plugin, isBypassed: !plugin.isBypassed };
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, effects: [...t.effects.slice(0, slotIndex), newPlugin, ...t.effects.slice(slotIndex + 1)] } : t));
        setEditingPlugin(p => p ? { ...p, plugin: newPlugin } : null);
      }} onRemove={() => {
        const { trackId, slotIndex } = editingPlugin;
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, effects: [...t.effects.slice(0, slotIndex), null, ...t.effects.slice(slotIndex + 1)] } : t));
        setEditingPlugin(null);
      }} />}
    </div>
  );
};

export default TrackView;