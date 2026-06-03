import React, { useMemo, useState, useEffect, useRef, useCallback, memo } from 'react';
import { TrackState, ParsedNote } from '../../types';
import { getChromaticSolfege } from '../../lib/SolfegeLogic';

// Constant — never recreated
const SEMI_TONE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const STEP_INDEX = ["C", "D", "E", "F", "G", "A", "B"];
const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11];

interface PerformanceScoreProps {
  notes: ParsedNote[];
  tracks: TrackState[];
  musicalTimeRef: React.MutableRefObject<number>;
  onSeek: (time: number) => void;
  onTogglePlay?: () => void;
  bpm?: number;
  zoomX?: number;
  zoomY?: number;
  isPlaying?: boolean;
  songKey?: string;
  beatsPerMeasure?: number;
  soloedStems?: Record<string, number | null>;
}

const PerformanceScore: React.FC<PerformanceScoreProps> = ({
  notes = [], tracks = [], musicalTimeRef, onSeek, onTogglePlay, bpm = 120, zoomX = 160, zoomY = 24, isPlaying = false, songKey = 'C', beatsPerMeasure = 4, soloedStems = {}
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [zoom, setZoom] = useState(1.0);

  const pixelsPerBeat = zoomX * zoom;
  const noteHeight = zoomY * zoom;
  const pianoWidth = 70;
  const measureWidth = pixelsPerBeat * beatsPerMeasure;

  // Store values in refs so rAF loop can read latest without dependency
  const pixelsPerBeatRef = useRef(pixelsPerBeat);
  pixelsPerBeatRef.current = pixelsPerBeat;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const handleResize = () => setViewportWidth(containerRef.current?.clientWidth || window.innerWidth);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const lastNoteEnd = useMemo(() => {
    if (notes.length === 0) return 100;
    return notes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0);
  }, [notes]);
  const lastNoteEndRef = useRef(lastNoteEnd);
  lastNoteEndRef.current = lastNoteEnd;

  const contentWidth = Math.max((lastNoteEnd + 40) * pixelsPerBeat + pianoWidth, viewportWidth + 500);

  // Zoom helpers
  const zoomIn = useCallback(() => setZoom(z => Math.min(2.5, +(z + 0.15).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(0.4, +(z - 0.15).toFixed(2))), []);

  // Keyboard shortcuts: Spacebar = play/stop, Cmd/Alt + Arrow = zoom
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay?.();
        return;
      }

      // Cmd (Mac) or Alt (Win) + Arrow keys for zoom
      if (e.metaKey || e.altKey) {
        if (e.code === 'ArrowUp' || e.code === 'ArrowRight') {
          e.preventDefault();
          zoomIn();
        } else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') {
          e.preventDefault();
          zoomOut();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTogglePlay, zoomIn, zoomOut]);

  // DOM cache for rAF loop
  const cachedNoteEls = useRef<{ el: HTMLElement; start: number; dur: number; color: string; midi: number; wasActive: boolean }[]>([]);
  const cachedKeyEls = useRef<{ el: HTMLElement; midi: number; isBlack: boolean; wasActive: boolean }[]>([]);
  const cacheBuilt = useRef(false);

  // Invalidate cache when layout changes
  useEffect(() => { cacheBuilt.current = false; }, [notes, zoom, tracks]);

  // Single rAF loop — runs once, reads ALL values from refs (zero dependencies)
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      const el = scrollRef.current;
      if (el) {
        const ct = musicalTimeRef.current;
        const ppb = pixelsPerBeatRef.current;
        const lne = lastNoteEndRef.current;
        const clampedTime = Math.min(ct, lne + 2);
        const playbackTrackX = clampedTime * ppb;

        // Auto-scroll ONLY when playing
        if (isPlayingRef.current) {
          // Keep playhead around the left 20% of the screen if possible
          const target = Math.max(0, playbackTrackX - el.clientWidth * 0.2);
          const max = Math.max(0, el.scrollWidth - el.clientWidth);
          // Only auto-scroll if the playhead is moving out of view or if we want to lock it
          el.scrollLeft = Math.min(target, max);
        }

        // Build DOM cache once (invalidated when zoom/notes/tracks change)
        if (!cacheBuilt.current) {
          const nEls = el.querySelectorAll('[data-ns]');
          cachedNoteEls.current = Array.from(nEls).map(n => {
            const h = n as HTMLElement;
            return {
              el: h,
              start: parseFloat(h.dataset.ns || '0'),
              dur: parseFloat(h.dataset.nd || '0'),
              color: h.dataset.nc || '#00e5ff',
              midi: parseInt(h.dataset.nm || '-1'),
              wasActive: false
            };
          });
          const kEls = el.querySelectorAll('[data-midi]');
          cachedKeyEls.current = Array.from(kEls).map(k => {
            const h = k as HTMLElement;
            const midi = parseInt(h.dataset.midi || '0');
            return { el: h, midi, isBlack: SEMI_TONE_NAMES[midi % 12].includes('#'), wasActive: false };
          });
          cacheBuilt.current = true;
        }

        // --- PLAYHEAD UPDATE ---
        const playhead = document.getElementById('perf-playhead');
        if (playhead) {
          playhead.style.transform = `translateX(${playbackTrackX}px)`;
        }

        const playing = isPlayingRef.current;

        // Pass 1: Notes + active midi set — O(notes)
        const activeMidiSet = new Set<number>();
        for (let i = 0; i < cachedNoteEls.current.length; i++) {
          const n = cachedNoteEls.current[i];
          const isActive = playing && ct >= n.start && ct < n.start + n.dur;
          if (isActive) activeMidiSet.add(n.midi);
          if (isActive !== n.wasActive) {
            n.wasActive = isActive;
            n.el.style.opacity = isActive ? '1' : '0.7';
            n.el.style.boxShadow = isActive ? `0 0 10px ${n.color}` : 'none';
            if (isActive) n.el.classList.add('note-active');
            else n.el.classList.remove('note-active');
          }
        }

        // Pass 2: Keys — O(keys)
        for (let i = 0; i < cachedKeyEls.current.length; i++) {
          const k = cachedKeyEls.current[i];
          const isActive = activeMidiSet.has(k.midi);
          if (isActive !== k.wasActive) {
            k.wasActive = isActive;
            if (isActive) {
              k.el.classList.add(k.isBlack ? 'pk-glow-b' : 'pk-glow-w');

              // Trigger hit effect
              k.el.classList.remove('pk-hit');
              void k.el.offsetWidth; // Force reflow to restart animation
              k.el.classList.add('pk-hit');

              const spark = k.el.querySelector('.spark-bar') as HTMLElement;
              if (spark) spark.style.display = 'block';
            } else {
              k.el.classList.remove('pk-glow-w', 'pk-glow-b', 'pk-hit');
              const spark = k.el.querySelector('.spark-bar') as HTMLElement;
              if (spark) spark.style.display = 'none';
            }
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { running = false; };
  }, []); // ← EMPTY — runs once, never restarts, reads from refs

  // Track layouts
  const trackLayouts = useMemo(() => {
    const ids = Array.from(new Set(notes.map(n => n.trackId)));
    return ids.map(tid => {
      const tn = notes.filter(n => n.trackId === tid);
      if (!tn.length) return null;
      const midis = tn.map(n => {
        const si = STEP_INDEX.indexOf(n.step.toUpperCase());
        return (n.octave + 1) * 12 + STEP_SEMI[si] + (n.alter || 0);
      });
      const mn = Math.min(...midis), mx = Math.max(...midis);
      const td = tracks.find(t => t.id === tid);
      
      // Standard 88-key piano range (A0=21 to C8=108)
      const eMin = 21, eMax = 108;
      
      return {
        id: tid,
        lyricMode: td?.lyricMode || 'Movable Do',
        laneHeight: (eMax - eMin + 1) * noteHeight,
        startMidi: eMax,
        notes: tn.map(n => {
          const si = STEP_INDEX.indexOf(n.step.toUpperCase());
          const midi = (n.octave + 1) * 12 + STEP_SEMI[si] + (n.alter || 0);
          // Clamp notes outside 88-keys to avoid breaking layout (rare)
          const clampedMidi = Math.max(eMin, Math.min(eMax, midi));
          return { ...n, y: (eMax - clampedMidi) * noteHeight, x: n.startTime * pixelsPerBeat, midi: clampedMidi };
        })
      };
    }).filter(Boolean);
  }, [notes, noteHeight, pixelsPerBeat, tracks]);

  const rulerBars = useMemo(() => {
    const count = Math.ceil(contentWidth / measureWidth);
    return Array.from({ length: count }, (_, i) => i);
  }, [contentWidth, measureWidth]);

  // Auto-scroll vertically on first load
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (!hasScrolledRef.current && scrollRef.current && trackLayouts.length > 0) {
      const firstLane = trackLayouts[0];
      let targetMidi = 60; // Default C4
      if (firstLane && firstLane.notes.length > 0) {
        // Find the highest pitch (max MIDI = lowest Y) to ensure notes are visible
        targetMidi = Math.max(...firstLane.notes.map((n: any) => n.midi));
      }
      const eMax = 108;
      const targetY = (eMax - targetMidi) * noteHeight;
      // Center it roughly in the viewport
      scrollRef.current.scrollTop = Math.max(0, targetY - (scrollRef.current.clientHeight / 3));
      hasScrolledRef.current = true;
    }
  }, [trackLayouts, noteHeight]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#050507] overflow-hidden relative select-none">
      <style>{`
        .pk-w { 
          background:linear-gradient(to right,#f4f4f5,#fff);
          display:flex;align-items:center;justify-content:flex-end;padding-right:8px;
          font:700 10px/1 'Inter',sans-serif;color:#52525b;position:relative;z-index:10;
        }
        .pk-b { 
          background:linear-gradient(to right,#18181b,#27272a 85%,#000);
          width:60%;height:100%;position:absolute;left:0;top:0;z-index:20;
          border-bottom:1px solid #000;border-top:1px solid #3f3f46;
          border-right:1px solid #111;border-radius:0 4px 4px 0;
          box-shadow:2px 4px 12px rgba(0,0,0,.6);
          display:flex;align-items:center;justify-content:flex-end;padding-right:6px;
          font:700 9px/1 'Inter',sans-serif;color:#e4e4e7;
        }
        .pk-glow-w {
          background: linear-gradient(to right, #ffffff, #f0f9ff, #bae6fd)!important;
          box-shadow: 
            0 0 40px rgba(14, 165, 233, 0.8),
            0 0 80px rgba(14, 165, 233, 0.4),
            inset 0 0 20px #fff,
            inset -5px 0 15px rgba(14, 165, 233, 0.6)!important;
          border-right: 4px solid #fff!important;
          color: #0c4a6e!important;
          z-index: 100!important;
          filter: brightness(1.5) saturate(1.2);
        }
        .pk-glow-b {
          background: linear-gradient(to right, #0ea5e9, #38bdf8, #7dd3fc)!important;
          box-shadow: 
            0 0 40px rgba(56, 189, 248, 0.8),
            0 0 80px rgba(14, 165, 233, 0.4),
            inset 0 0 20px rgba(255, 255, 255, 0.5)!important;
          border-right: 3px solid #fff!important;
          color: #f0f9ff!important;
          z-index: 100!important;
          filter: brightness(1.4) saturate(1.2);
        }
        .pk-col { border-right: 2px solid #000; box-shadow: 10px 0 40px rgba(0,0,0,0.9); }
        
        /* WARP AND FLOATING SPARKS */
        .key-warp {
          position: absolute;
          right: -40px; top: -20%; height: 140%; width: 80px;
          background: radial-gradient(ellipse at center, rgba(255,255,255,1) 0%, rgba(14, 165, 233, 0.6) 30%, transparent 75%);
          opacity: 0; pointer-events: none; z-index: 200; mix-blend-mode: screen;
          filter: blur(8px);
        }
        .pk-hit .key-warp { animation: warp-flash-ultra 0.6s cubic-bezier(0.15, 1, 0.3, 1) forwards; }
        
        @keyframes warp-flash-ultra {
          0% { transform: scaleX(0.1) scaleY(0.4); opacity: 1; filter: brightness(4) blur(2px); }
          30% { transform: scaleX(2) scaleY(1.3); opacity: 0.9; filter: brightness(2) blur(6px); }
          100% { transform: scaleX(4) scaleY(1.8); opacity: 0; filter: brightness(1) blur(12px); }
        }

        .spark-splash {
          position: absolute; right: 0; top: 50%; width: 1px; height: 1px;
          pointer-events: none; z-index: 250;
        }
        .spark {
          position: absolute; width: 4px; height: 4px; border-radius: 50%;
          background: #fff; 
          box-shadow: 0 0 10px #fff, 0 0 20px #0ea5e9, 0 0 30px #38bdf8;
          opacity: 0;
          will-change: transform, opacity;
        }
        .pk-hit .spark { animation: spark-float-warp 1.5s cubic-bezier(0.1, 0.8, 0.4, 1) forwards; }
        
        /* Variety of spark trajectories */
        .spark:nth-child(1) { --tx: 80px;  --ty: -60px; --tr: 360deg; animation-delay: 0s; }
        .spark:nth-child(2) { --tx: 120px; --ty: -20px; --tr: -180deg; animation-delay: 0.05s; }
        .spark:nth-child(3) { --tx: 100px; --ty: 40px;  --tr: 240deg; animation-delay: 0.02s; }
        .spark:nth-child(4) { --tx: 70px;  --ty: 70px;  --tr: -90deg; animation-delay: 0.1s; }
        .spark:nth-child(5) { --tx: 150px; --ty: 10px;  --tr: 45deg;  animation-delay: 0.08s; }
        .spark:nth-child(6) { --tx: 90px;  --ty: -90px; --tr: 120deg; animation-delay: 0.12s; }
        .spark:nth-child(7) { --tx: 130px; --ty: 50px;  --tr: -300deg; animation-delay: 0.04s; }
        .spark:nth-child(8) { --tx: 60px;  --ty: -30px; --tr: 15deg;  animation-delay: 0.15s; }

        @keyframes spark-float-warp {
          0% { transform: translate(0, 0) scale(1.5) rotate(0deg); opacity: 1; filter: brightness(3); }
          20% { transform: translate(calc(var(--tx) * 0.3), calc(var(--ty) * 0.3)) scale(1.2) rotate(calc(var(--tr) * 0.2)); opacity: 1; }
          70% { transform: translate(calc(var(--tx) * 0.8), calc(var(--ty) * 0.8)) scale(0.8) rotate(calc(var(--tr) * 0.7)); opacity: 0.6; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0) rotate(var(--tr)); opacity: 0; filter: brightness(1); }
        }

        .spark-bar {
          position:absolute;right:-3px;top:0;height:100%;width:8px;
          background:linear-gradient(to right, #fff, rgba(14,165,233,0.5), transparent);
          box-shadow: 0 0 25px #fff, 0 0 50px #0ea5e9;
          pointer-events:none;display:none;z-index:200;
          mix-blend-mode: screen;
        }

        .lyric-text { color: rgba(0,0,0,0.7); }
        .note-active .lyric-text { color: white; text-shadow: 0 0 5px white; }

        /* Custom DAW-style Scrollbar */
        .custom-scroll::-webkit-scrollbar {
          width: 14px;
          height: 14px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: #0a0a0c;
          border-left: 1px solid rgba(255,255,255,0.05);
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 7px;
          border: 3px solid #0a0a0c;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }
        .custom-scroll::-webkit-scrollbar-corner {
          background: #0a0a0c;
        }
      `}</style>

      {/* ZOOM — floating, separate from ruler */}
      <div className="absolute top-1 right-3 z-[5000] flex items-center gap-1 bg-transparent border-none">
        <button onClick={zoomOut}
          className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white font-extrabold text-base active:scale-90 transition-all bg-transparent border-none select-none">
          -
        </button>
        <span className="text-[9px] font-black text-zinc-500/80 w-8 text-center tabular-nums select-none">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn}
          className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white font-extrabold text-base active:scale-90 transition-all bg-transparent border-none select-none">
          +
        </button>
      </div>

      {/* Single scroll container */}
      <div ref={scrollRef} className="custom-scroll w-full h-full overflow-auto" style={{ willChange: 'scroll-position' }}>
        <div className="relative" style={{ width: contentWidth, minHeight: '100%' }}>

          {/* RULER — sticky top */}
          <div className="sticky top-0 z-[2000] h-7 flex" style={{ width: contentWidth }}>
            <div className="sticky left-0 z-[2050] bg-[#080810] flex items-center justify-center border-r border-indigo-500/25 border-b border-b-indigo-500/25 shrink-0" style={{ width: pianoWidth }}>
              <span className="text-[7px] font-black uppercase tracking-widest text-indigo-400">BAR</span>
            </div>
            <div className="flex-1 relative bg-[#080810]/95 backdrop-blur-xl border-b border-indigo-500/25">
              {rulerBars.map(i => (
                <div key={i} className="absolute top-0 bottom-0 flex items-end pb-0.5 border-l border-indigo-500/40" style={{ left: i * measureWidth }}>
                  <span className="text-[9px] font-black text-indigo-400 ml-1.5 leading-none">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TRACK LANES */}
          {trackLayouts.map((lane: any) => (
            <div key={lane.id} className="relative flex" style={{ height: lane.laneHeight }}>
              {/* KEYBOARD */}
              <div className="sticky left-0 z-[1000] bg-black flex flex-col pk-col shrink-0" style={{ width: pianoWidth }}>
                {Array.from({ length: Math.ceil(lane.laneHeight / noteHeight) }).map((_, i) => {
                  const midi = lane.startMidi - i;
                  const isBlack = SEMI_TONE_NAMES[midi % 12].includes('#');
                  const octave = Math.floor(midi / 12) - 1;
                  const noteName = SEMI_TONE_NAMES[midi % 12];
                  return (
                    <div key={midi} data-midi={midi} className="relative flex items-center bg-zinc-100" style={{ height: noteHeight }}>
                      {isBlack ? (
                        <>
                          <div className="absolute inset-y-0 right-0 w-[40%] bg-gradient-to-r from-zinc-100 to-white" />
                          <div className="absolute right-0 w-[40%] border-t border-zinc-400 z-10" style={{ top: '50%' }} />
                          <div className="pk-b"><span>{noteName}</span></div>
                        </>
                      ) : (
                        <div className={`pk-w w-full h-full ${(noteName === 'C' || noteName === 'F') ? 'border-b border-zinc-400' : ''}`}>
                          <span className={noteName === 'C' ? 'font-black text-black' : ''}>{noteName === 'C' ? `C${octave}` : noteName}</span>
                        </div>
                      )}
                      <div className="spark-bar" />
                      <div className="key-warp" />
                      <div className="spark-splash">
                        <div className="spark" />
                        <div className="spark" />
                        <div className="spark" />
                        <div className="spark" />
                        <div className="spark" />
                        <div className="spark" />
                        <div className="spark" />
                        <div className="spark" />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* TIMELINE */}
              <div className="flex-1 relative overflow-hidden" style={{ background: '#050507' }}>
                {/* Horizontal Pitch Grid (DAW Style) */}
                <div className="absolute inset-0 pointer-events-none z-[1]">
                  {Array.from({ length: Math.ceil(lane.laneHeight / noteHeight) }).map((_, i) => {
                    const midi = lane.startMidi - i;
                    const isBlack = SEMI_TONE_NAMES[midi % 12].includes('#');
                    return (
                      <div 
                        key={`hgrid-${midi}`}
                        className={`absolute w-full border-b border-white/[0.05] ${isBlack ? 'bg-white/[0.02]' : ''}`}
                        style={{ top: i * noteHeight, height: noteHeight }}
                      />
                    );
                  })}
                </div>

                {/* Notes */}
                <div className="absolute inset-0 z-[10]">
                  {lane.notes.map((n: any, j: number) => {
                    const voiceIdx = (n.voice || 1) - 1;
                    const isSoloed = soloedStems?.[n.trackId] === voiceIdx;
                    let color = n.trackId.includes('S2') ? '#ffab00' : '#00e5ff';
                    
                    if (soloedStems && soloedStems[n.trackId] !== undefined && soloedStems[n.trackId] !== null) {
                      if (isSoloed) {
                        color = '#f59e0b'; // Amber 500 when soloed
                      } else {
                        color = '#52525b'; // Zinc 500 (dimmed) when not soloed
                      }
                    } else {
                       const voiceColors = ['#00e5ff', '#ffab00', '#f43f5e', '#a855f7'];
                       color = voiceColors[voiceIdx % voiceColors.length];
                    }

                    const showLyric = lane.lyricMode !== 'Closed' && lane.lyricMode !== 'Words';
                    const solfegeText = showLyric ? getChromaticSolfege(n.step, n.alter || 0, songKey, lane.lyricMode as any) : '';
                    return (
                      <div key={j}
                        data-ns={n.startTime} data-nd={n.duration} data-nc={color} data-nm={n.midi}
                        className="absolute rounded-sm flex items-center transition-colors"
                        style={{
                          left: n.x, top: n.y + 1,
                          width: Math.max(6, n.duration * pixelsPerBeat - 1),
                          height: noteHeight - 2,
                          backgroundColor: color,
                          opacity: 0.7,
                        }}>
                        {showLyric && noteHeight >= 14 && (
                          <span className="lyric-text text-[8px] font-bold pl-1 whitespace-nowrap pointer-events-none transition-colors">{solfegeText}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Measure Bar Lines & Beat Lines */}
                <div className="absolute inset-0 pointer-events-none z-[5]">
                  {rulerBars.map(i => (
                    <React.Fragment key={`bar-group-${i}`}>
                      <div 
                        className="absolute top-0 bottom-0 w-[1px] bg-indigo-500/60"
                        style={{ left: i * measureWidth }}
                      />
                      {Array.from({ length: beatsPerMeasure - 1 }).map((_, bIdx) => (
                        <div 
                          key={`beat-${i}-${bIdx}`} 
                          className="absolute top-0 bottom-0 w-[1px] bg-white/10"
                          style={{ left: i * measureWidth + (bIdx + 1) * pixelsPerBeat }}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          ))}



        </div>
      </div>
    </div>
  );
};

export default memo(PerformanceScore);
