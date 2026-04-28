import React from 'react';
import { Mic2, Sparkles, ChevronRight } from 'lucide-react';

interface EngineSwitchProps {
  currentEngine: 'vocalido' | 'acestep';
  onSwitch: (engine: 'vocalido' | 'acestep') => void;
}

export const EngineSwitch: React.FC<EngineSwitchProps> = ({ currentEngine, onSwitch }) => {
  return (
    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
      <button
        onClick={() => onSwitch('vocalido')}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
          currentEngine === 'vocalido'
            ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-105 z-10'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
        }`}
      >
        <Mic2 size={12} className={currentEngine === 'vocalido' ? 'animate-pulse' : ''} />
        Vocalido
      </button>

      <div className="w-[1px] h-4 bg-white/10" />

      <button
        onClick={() => onSwitch('acestep')}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
          currentEngine === 'acestep'
            ? 'bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)] scale-105 z-10'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
        }`}
      >
        <Sparkles size={12} className={currentEngine === 'acestep' ? 'animate-bounce' : ''} />
        ACE-Step 1.5
      </button>
    </div>
  );
};
