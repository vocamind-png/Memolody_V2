
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { ParsedNote } from '../../types';

interface NeuralStreamProps {
  notes: ParsedNote[];
  currentTime: number;
  bpm: number;
  isPlaying: boolean;
}

const NeuralStream: React.FC<NeuralStreamProps> = ({ notes, currentTime, bpm, isPlaying }) => {
  const [hitFlash, setHitFlash] = useState<string | null>(null);
  
  const beatDuration = 60 / bpm;
  const currentBeat = currentTime / beatDuration;
  
  const lookAheadBeats = 10;
  const pixelsPerBeat = 160; 

  const visibleNotes = useMemo(() => {
    return notes.filter(n => {
      const noteEndBeat = n.startTime + n.duration;
      return noteEndBeat >= currentBeat - 0.5 && n.startTime <= currentBeat + lookAheadBeats;
    });
  }, [notes, currentBeat]);

  // Handle Hit Flash Logic
  useEffect(() => {
    const activeNote = visibleNotes.find(n => Math.abs(n.startTime - currentBeat) < 0.05);
    if (activeNote) {
      setHitFlash(activeNote.trackId);
      const timer = setTimeout(() => setHitFlash(null), 150);
      return () => clearTimeout(timer);
    }
  }, [currentBeat, visibleNotes]);

  return (
    <div className="w-full h-full bg-[#050507] overflow-hidden relative rounded-[40px] border border-white/5 perspective-container shadow-[0_50px_100px_rgba(0,0,0,0.5)]">
      <style>{`
        .perspective-container { perspective: 1500px; overflow: hidden; }
        .stream-ground {
          position: absolute; inset: 0; transform: rotateX(55deg); transform-origin: center bottom;
          background: radial-gradient(circle at bottom, rgba(6,182,212,0.1) 0%, transparent 70%);
          z-index: 1;
        }
        .hit-line {
          position: absolute; bottom: 12%; left: 8%; right: 8%; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(6,182,212,0.3), #fff, #06b6d4, #f59e0b, #fff, rgba(245,158,11,0.3), transparent);
          box-shadow: 0 0 20px rgba(6,182,212,0.4); z-index: 100; border-radius: 50%;
        }
        .hit-glow {
          position: absolute; bottom: 12%; left: 50%; transform: translateX(-50%);
          width: 80%; height: 40px; border-radius: 50%;
          filter: blur(20px); opacity: 0; transition: opacity 0.1s; z-index: 90;
        }
        .fireball {
          position: absolute; border-radius: 50%; transition: transform 0.05s linear;
          will-change: transform, opacity; display: flex; align-items: center; justify-content: center; z-index: 50;
        }
        .comet-tail {
          position: absolute; top: 0; left: 10%; right: 10%; height: 100%;
          background: linear-gradient(to top, currentColor 0%, rgba(255,255,255,0.4) 10%, transparent 100%);
          opacity: 0.7; filter: blur(8px); border-radius: 40px;
        }
        .fireball-head {
          position: absolute; top: 0; width: 42px; height: 42px; border-radius: 50%;
          border: 4px solid rgba(255,255,255,0.9); box-shadow: 0 0 30px currentColor;
          background: radial-gradient(circle at center, #fff 0%, currentColor 70%);
          transform: scale(1); transition: transform 0.1s;
        }
        .active-fireball .fireball-head { transform: scale(1.6); filter: brightness(1.5) white; }
      `}</style>

      {/* 3D Background */}
      <div className="stream-ground">
         <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)', backgroundSize: '100px 100px' }} />
      </div>

      {/* HIT VISUALS */}
      <div className="hit-line" />
      <div 
        className="hit-glow" 
        style={{ 
          opacity: hitFlash ? 0.8 : 0, 
          backgroundColor: hitFlash?.includes('S2') ? '#f59e0b' : '#06b6d4',
          boxShadow: `0 0 60px ${hitFlash?.includes('S2') ? '#f59e0b' : '#06b6d4'}`
        }} 
      />

      {/* NOTES STREAM */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ perspective: '1500px' }}>
        {visibleNotes.map((n, i) => {
          const relativeBeat = n.startTime - currentBeat;
          const zDistance = relativeBeat * pixelsPerBeat;
          const isActive = currentBeat >= n.startTime && currentBeat <= (n.startTime + n.duration);
          
          const pitchKey = (n.octave * 12) + ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(n.step);
          const xPos = ((pitchKey - 60) * 3.5) + 50; 
          
          const color = n.trackId.includes('S2') ? '#f59e0b' : '#06b6d4';
          const opacity = Math.max(0, 1 - (zDistance / (lookAheadBeats * pixelsPerBeat)));

          return (
            <div 
              key={`${n.trackId}-${n.startTime}-${i}`}
              className={`fireball ${isActive ? 'active-fireball' : ''}`}
              style={{
                left: `${xPos}%`,
                bottom: '12%',
                width: '40px',
                height: `${n.duration * pixelsPerBeat}px`,
                color: color,
                transform: `rotateX(55deg) translate3d(-50%, ${-zDistance}px, 0)`,
                opacity: opacity,
              }}
            >
              <div className="comet-tail" />
              <div className="fireball-head" style={{ color: color }}>
                 {isActive && <div className="absolute inset-0 bg-white rounded-full animate-ping opacity-50" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* HUD INFOS */}
      <div className="absolute top-8 left-8 flex flex-col gap-2 z-[200]">
         <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-cyan-400 shadow-[0_0_15px_#06b6d4] animate-pulse' : 'bg-zinc-800'}`} />
            <span className="text-[12px] font-black text-white lcd-font tracking-widest uppercase">Maestro Sync</span>
         </div>
         <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.4em] italic pl-6">Neural Stream Active</span>
      </div>
    </div>
  );
};

export default NeuralStream;
