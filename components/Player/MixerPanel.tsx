import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Languages, FileText, EyeOff, Music, Mic, Mic2, Hash, Binary, Timer, PlusSquare, Settings2 } from 'lucide-react';
import { TrackState, LyricMode, EffectInstance } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';
import LEDMeter from './LEDMeter';

interface MixerPanelProps {
  tracks: TrackState[];
  onUpdateTrack: (id: string, update: Partial<TrackState>) => void;
  onOpenPluginBrowser?: (trackId: string, slotIndex: number) => void;
  onOpenPluginEditor?: (trackId: string, slotIndex: number, plugin: EffectInstance) => void;
}

const RotaryPan = ({ value, onChange }: { value: number; onChange: (val: number) => void }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startVal.current = value;
    const moveHandler = (me: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in me ? me.touches[0].clientY : (me as MouseEvent).clientY;
      const delta = (startY.current - currentY) / 100;
      onChange(Math.max(-1, Math.min(1, startVal.current + delta)));
    };
    const endHandler = () => {
      setIsDragging(false);
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

  const rotation = value * 135;
  const panLabel = value === 0 ? 'C' : (value < 0 ? `L${Math.round(Math.abs(value) * 100)}` : `R${Math.round(value * 100)}`);

  return (
    <div className="flex flex-col items-center select-none shrink-0 px-2 group relative py-3" onMouseDown={handleStart} onTouchStart={handleStart} onDoubleClick={() => onChange(0)}>
      <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[6px] font-black text-zinc-600">C</span>
      <div className="w-8 h-8 rounded-full bg-zinc-900 border border-white/10 relative cursor-ns-resize shadow-inner flex items-center justify-center group-hover:border-cyan-500/40 transition-all">
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-white rounded-full origin-bottom" style={{ transform: `rotate(${rotation}deg)` }} />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[6px] font-black text-cyan-400 bg-black/80 px-1 rounded">{panLabel}</span>
        </div>
      </div>
      <div className="flex justify-between w-full mt-1">
        <span className="text-[5px] font-bold text-zinc-700">L</span>
        <span className="text-[5px] font-bold text-zinc-700">R</span>
      </div>
    </div>
  );
};

const MixerPanel: React.FC<MixerPanelProps> = ({ tracks, onUpdateTrack, onOpenPluginBrowser, onOpenPluginEditor }) => {
  if (!tracks || tracks.length === 0) return (
    <div className="py-20 text-center">
      <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest italic">Awaiting Audio Tracks...</span>
    </div>
  );

  const cycleLyricMode = (track: TrackState) => {
    const modes: LyricMode[] = ['Movable Do', 'Fixed Do', 'Jianpu', 'Kodaly', 'Kodaly Rhythm', 'Words', 'Closed'];
    const currentIdx = modes.indexOf(track.lyricMode);
    onUpdateTrack(track.id, { lyricMode: modes[(currentIdx + 1) % modes.length] });
  };

  const toggleInstrumentVocal = (track: TrackState) => {
    const nextMode = track.mode === 'vocal' ? 'instrument' : 'vocal';
    // กฎ: ถ้าเปลี่ยนเป็น Instrument ให้ปิด Lyric (Closed) ทันที
    // และถ้ากลับมาเป็น Vocal ให้เปิดเป็น Movable Do (หรือค่าที่เหมาะสม)
    const updates: Partial<TrackState> = {
      mode: nextMode,
      lyricMode: nextMode === 'instrument' ? 'Closed' : (track.lyricMode === 'Closed' ? 'Movable Do' : track.lyricMode)
    };
    onUpdateTrack(track.id, updates);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {tracks.map(track => {
        if (!track) return null;
        const solfegeConfig: Record<string, any> = {
          'Fixed Do': { label: 'F.DO', color: 'bg-emerald-600', icon: Languages },
          'Movable Do': { label: 'M.DO', color: 'bg-indigo-600', icon: Languages },
          'Jianpu': { label: '123', color: 'bg-amber-600', icon: Hash },
          'Kodaly': { label: 'KODALY', color: 'bg-rose-600', icon: Binary },
          'Kodaly Rhythm': { label: 'TA-TI', color: 'bg-fuchsia-600', icon: Timer },
          'Words': { label: 'WORD', color: 'bg-sky-500', icon: FileText },
          'Closed': { label: 'OFF', color: 'bg-zinc-800', icon: EyeOff }
        };
        const cfg = solfegeConfig[track.lyricMode] || solfegeConfig['Movable Do'];
        const SIcon = cfg.icon;

        return (
          <div key={track.id} className="bg-[#08080a] border border-white/5 rounded-2xl px-2 py-1.5 flex items-center shadow-2xl min-h-[64px] w-full group/row">

            <div className="flex items-center gap-3 shrink-0 border-r border-white/5 pr-4 min-w-[60px]">
              <LEDMeter trackId={track.id} />
              <div className="flex flex-col truncate w-[40px]">
                <span className="text-[11px] font-black text-white uppercase italic truncate">{track.name || 'Track'}</span>
                <span className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest">{track.id}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1 shrink-0 px-4 border-r border-white/5 items-center">
              <button
                onClick={() => toggleInstrumentVocal(track)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${track.mode === 'vocal' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-zinc-900 border-white/10 text-cyan-400'}`}
              >
                {track.mode === 'vocal' ? <Mic size={18} /> : <Music size={18} />}
              </button>
              <span className="text-[6px] font-black uppercase text-zinc-700 tracking-widest">{track.mode || 'INSTR'}</span>
            </div>

            <div className="flex flex-col gap-1 shrink-0 px-3 border-r border-white/5">
              <button
                onClick={() => {
                  const nextSolo = !track.isSolo;
                  onUpdateTrack(track.id, { isSolo: nextSolo, isMuted: nextSolo ? false : track.isMuted });
                }}
                className={`w-8 h-6 rounded-md text-[9px] font-black border transition-all ${track.isSolo ? 'bg-amber-400 border-amber-300 text-black shadow-lg' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}
              >S</button>
              <button
                onClick={() => {
                  const nextMute = !track.isMuted;
                  onUpdateTrack(track.id, { isMuted: nextMute, isSolo: nextMute ? false : track.isSolo });
                }}
                className={`w-8 h-6 rounded-md text-[9px] font-black border transition-all ${track.isMuted ? 'bg-rose-600 border-rose-500 text-white shadow-lg' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}
              >M</button>
            </div>

            <RotaryPan value={track.pan || 0} onChange={(val) => onUpdateTrack(track.id, { pan: val })} />

            <button
              onClick={() => cycleLyricMode(track)}
              className={`h-10 w-14 flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 transition-all active:scale-90 mx-2 shrink-0 ${cfg.color}`}
            >
              <SIcon size={14} className="text-white" />
              <span className="text-[7px] font-black uppercase text-white tracking-tighter leading-none">{cfg.label}</span>
            </button>

            <div className="flex-1 flex items-center gap-4 bg-black/40 px-4 py-3 rounded-2xl border border-white/5 ml-1">
              <VolumeX size={14} className={track.isMuted || track.volume === 0 ? 'text-rose-500' : 'text-zinc-800'} />
              <div className="relative flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={track.volume}
                  onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div
                  className="absolute h-full bg-gradient-to-r from-indigo-600 to-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-75"
                  style={{ width: `${(track.volume || 0) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-black text-cyan-400 lcd-font min-w-[32px] text-right">
                {Math.round((track.volume || 0) * 100)}
              </span>
            </div>

            <div className="flex flex-col gap-1 shrink-0 px-3 border-l border-white/5 ml-2">
              <div className="flex items-center gap-1">
                {track.effects?.filter(Boolean).map((fx, idx) => (
                  <button
                    key={idx}
                    onClick={() => onOpenPluginEditor?.(track.id, idx, fx!)}
                    className={`h-8 px-2 rounded-lg border flex items-center justify-center gap-1 transition-all ${fx!.isBypassed ? 'bg-zinc-900 border-zinc-700 text-zinc-500' : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30'}`}
                  >
                    <Settings2 size={10} />
                    <span className="text-[7px] font-black uppercase tracking-widest">{fx!.definition.name.substring(0, 4)}</span>
                  </button>
                ))}
                {(!track.effects || track.effects.filter(Boolean).length < 3) && (
                  <button
                    onClick={() => onOpenPluginBrowser?.(track.id, track.effects?.filter(Boolean).length || 0)}
                    className="h-8 w-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center hover:bg-zinc-800 transition-all group/plug"
                  >
                    <PlusSquare size={12} className="text-zinc-500 group-hover/plug:text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MixerPanel;