
import React, { useState, useRef, useEffect } from 'react';

const useValueDrag = (initialValue: number, step: number, onChange: (val: number) => void) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startVal.current = initialValue;
    
    const onMove = (me: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in me ? me.touches[0].clientY : (me as MouseEvent).clientY;
      const delta = Math.floor((startY.current - currentY) / 10);
      onChange(startVal.current + (delta * step));
    };

    const onEnd = () => {
      setIsDragging(false);
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

  return { isDragging, handleStart };
};

// ── Key names for both Major and Minor keys ──
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

// Enharmonic equivalents for lookup
const KEY_ALIASES: Record<string, string> = {
  'C#': 'Db', 'Gb': 'F#', 'Cb': 'B', 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb',
  'C#m': 'C#m', 'D#m': 'Ebm', 'G#m': 'G#m', 'A#m': 'Bbm', 'Abm': 'G#m', 'Gbm': 'F#m'
};

export const KeyTransposeDisplay: React.FC<{ keySig: string; transpose: number; onTransposeChange: any }> = ({ keySig, transpose, onTransposeChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(transpose.toString());
  
  const getTransposedKey = (base: string, trans: number) => {
    const isMinor = (base || '').includes('m');
    const cleanBase = (base || 'C').replace('m', '').trim();
    
    // Resolve enharmonic alias
    const resolved = KEY_ALIASES[cleanBase] || cleanBase;
    
    const keyList = isMinor ? MINOR_KEYS : MAJOR_KEYS;
    const searchList = isMinor
      ? MINOR_KEYS.map(k => k.replace('m', ''))
      : MAJOR_KEYS;
    
    let idx = searchList.indexOf(resolved);
    if (idx === -1) idx = searchList.indexOf(cleanBase);
    if (idx === -1) idx = 0;
    
    const newIdx = (idx + trans + 120) % 12;
    return keyList[newIdx];
  };

  const { isDragging, handleStart } = useValueDrag(transpose, 1, (val) => {
    onTransposeChange(Math.max(-12, Math.min(12, val)));
  });

  const handleSubmit = () => {
    const val = parseInt(tempValue);
    if (!isNaN(val)) onTransposeChange(Math.max(-12, Math.min(12, val)));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black/80 rounded-lg border border-amber-400/50 p-1">
        <input 
          autoFocus type="number" value={tempValue} 
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="bg-transparent text-amber-400 text-sm font-black lcd-font w-full text-center outline-none"
        />
      </div>
    );
  }

  return (
    <div 
      className={`flex flex-col items-center select-none cursor-ns-resize h-full justify-center transition-all w-full px-0.5 ${isDragging ? 'bg-white/5' : 'hover:bg-white/[0.02]'}`}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onClick={() => { if (!isDragging) { setIsEditing(true); setTempValue(transpose.toString()); } }}
    >
        <div className="flex items-baseline gap-0.5 leading-none">
            <span className="text-[15px] font-black italic lcd-font text-[#ffab00] tracking-tighter">
                {getTransposedKey(keySig, transpose)}
            </span>
            <span className="text-[9px] font-black text-[#ffab00]/50 italic ml-0.5">
                {transpose >= 0 ? `+${transpose}` : transpose}
            </span>
        </div>
        <span className="text-[6px] font-black text-zinc-600 uppercase tracking-widest mt-0.5">KEY</span>
    </div>
  );
};

export const BpmDisplay: React.FC<{ bpm: number; onBpmChange: (newBpm: number) => void }> = ({ bpm, onBpmChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(Math.round(bpm).toString());
  
  const { isDragging, handleStart } = useValueDrag(bpm, 1, (val) => onBpmChange(Math.max(20, Math.min(400, val))));

  const handleSubmit = () => {
    const val = parseInt(tempValue);
    if (!isNaN(val)) onBpmChange(Math.max(20, Math.min(400, val)));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black/80 rounded-lg border border-cyan-400/50 p-1">
        <input 
          autoFocus type="number" value={tempValue} 
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="bg-transparent text-cyan-400 text-sm font-black lcd-font w-full text-center outline-none"
        />
      </div>
    );
  }

  return (
    <div 
      className={`flex flex-col items-center select-none cursor-ns-resize h-full justify-center transition-all w-full px-0.5 ${isDragging ? 'bg-white/5' : 'hover:bg-white/[0.02]'}`}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onClick={() => { if (!isDragging) { setIsEditing(true); setTempValue(Math.round(bpm).toString()); } }}
    >
        <span className="text-[16px] font-black italic lcd-font text-[#00e5ff] leading-none tracking-tighter">
          {Math.round(bpm)}
        </span>
        <span className="text-[6px] font-black text-zinc-600 uppercase tracking-widest mt-0.5">BPM</span>
    </div>
  );
};

export const TimeSigDisplay: React.FC<{ beats?: number; beatType?: number }> = ({ beats = 4, beatType = 4 }) => {
  return (
    <div className="flex flex-col items-center select-none leading-none w-full">
      <div className="flex flex-col items-center gap-[1px]">
        <span className="text-[13px] font-black italic lcd-font text-white/90">{beats}</span>
        <div className="w-3 h-[0.5px] bg-zinc-700" />
        <span className="text-[13px] font-black italic lcd-font text-white/90">{beatType}</span>
      </div>
      <span className="text-[5px] font-black text-zinc-600 uppercase tracking-widest mt-0.5">SIG</span>
    </div>
  );
};

export const BarBeatPositionDisplay: React.FC<{ bar: number; beat: number; onSeek?: (bar: number) => void }> = ({ bar, beat, onSeek }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(bar.toString());
  const { isDragging, handleStart } = useValueDrag(bar, 1, (val) => onSeek?.(Math.max(1, val)));

  const handleEditSubmit = () => {
    const val = parseInt(editValue);
    if (!isNaN(val)) onSeek?.(Math.max(1, val));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black/80 rounded-lg border border-amber-400/50 p-1">
        <input 
          autoFocus type="number" value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
          className="bg-transparent text-amber-400 text-sm font-black lcd-font w-full text-center outline-none"
        />
      </div>
    );
  }

  return (
    <div 
      className={`flex flex-col items-center select-none cursor-ns-resize h-full justify-center transition-all w-full px-1 ${isDragging ? 'bg-white/5' : 'hover:bg-white/[0.02]'}`}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onDoubleClick={() => { setIsEditing(true); setEditValue(bar.toString()); }}
    >
      <div className="flex items-baseline gap-0.5 leading-none">
        <span className="text-[19px] font-black italic text-[#ffab00] lcd-font tracking-tighter">
            {bar}
        </span>
        <span className="text-[13px] font-black italic text-white/30 lcd-font tracking-tighter">
            {beat}
        </span>
      </div>
      <span className="text-[6px] font-black text-zinc-600 uppercase tracking-widest mt-0.5">POS</span>
    </div>
  );
};
