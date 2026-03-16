
import React from 'react';
import { X, Check, Sliders } from 'lucide-react';

export interface LoopPreset {
  id: string;
  label: string;
  color: string;
  startBar: number;
  endBar: number;
  isActive: boolean;
}

interface LoopMatrixModalProps {
  presets: LoopPreset[];
  onUpdatePreset: (id: string, update: Partial<LoopPreset>) => void;
  onDisableAll: () => void;
  onClose: () => void;
}

const LoopMatrixModal: React.FC<LoopMatrixModalProps> = ({ presets, onUpdatePreset, onDisableAll, onClose }) => {
  return (
    <div className="fixed inset-0 z-[8000] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-[320px] bg-[#1a1a1c] border border-white/10 rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,1)] overflow-hidden relative">
        
        {/* Header Section - Compact */}
        <header className="relative z-10 px-6 pt-6 pb-3 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                 <Sliders size={16} className="text-cyan-400" />
              </div>
              <h2 className="text-sm font-black italic text-white uppercase tracking-tighter leading-none">LOOP <span className="text-cyan-400">MATRIX</span></h2>
           </div>
           <button onClick={onClose} className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-all">
              <X size={16} />
           </button>
        </header>

        <div className="relative z-10 px-6 py-1">
           {/* TABLE HEADERS - SCALED DOWN */}
           <div className="flex items-center px-3 mb-2 text-[7px] font-black text-zinc-600 uppercase tracking-[0.3em]">
              <div className="flex-1">PRESET</div>
              <div className="w-14 text-center">BAR IN</div>
              <div className="w-14 text-center">BAR OUT</div>
              <div className="w-10"></div>
           </div>

           {/* PRESET ROWS - COMPACT STYLE */}
           <div className="space-y-1.5 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
              {presets.map((p) => (
                <div 
                  key={p.id} 
                  className={`flex items-center h-[42px] px-1.5 rounded-[20px] border transition-all ${p.isActive ? 'bg-white/5 border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.5)]' : 'bg-black/20 border-white/5 opacity-60 hover:opacity-100 hover:bg-white/[0.02]'}`}
                >
                  <div className="flex-1 flex items-center gap-2.5 pl-3 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]" style={{ color: p.color, backgroundColor: p.color }} />
                    <input 
                      type="text"
                      value={p.label}
                      onChange={(e) => onUpdatePreset(p.id, { label: e.target.value.toUpperCase() })}
                      className="bg-transparent border-none outline-none text-[10px] font-black text-white uppercase tracking-widest w-full placeholder:text-zinc-800 truncate"
                      placeholder="NAME"
                    />
                  </div>

                  <div className="w-14 flex justify-center px-0.5">
                    <div className="bg-black border border-white/10 rounded-lg w-full h-7 flex items-center justify-center overflow-hidden">
                        <input 
                          type="number" 
                          value={p.startBar} 
                          onChange={(e) => onUpdatePreset(p.id, { startBar: parseInt(e.target.value) || 1 })}
                          className="bg-transparent text-center text-[12px] font-black text-cyan-400 lcd-font outline-none w-full"
                        />
                    </div>
                  </div>

                  <div className="w-14 flex justify-center px-0.5">
                    <div className="bg-black border border-white/10 rounded-lg w-full h-7 flex items-center justify-center overflow-hidden">
                        <input 
                          type="number" 
                          value={p.endBar} 
                          onChange={(e) => onUpdatePreset(p.id, { endBar: parseInt(e.target.value) || 1 })}
                          className="bg-transparent text-center text-[12px] font-black text-rose-400 lcd-font outline-none w-full"
                        />
                    </div>
                  </div>

                  <div className="w-10 flex justify-center">
                    <button 
                      onClick={() => {
                        const newActive = !p.isActive;
                        presets.forEach(other => {
                            if(other.id !== p.id) onUpdatePreset(other.id, { isActive: false });
                        });
                        onUpdatePreset(p.id, { isActive: newActive });
                      }}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${p.isActive ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.4)]' : 'bg-white/5 text-zinc-700'}`}
                    >
                      <Check size={14} strokeWidth={4} />
                    </button>
                  </div>
                </div>
              ))}
           </div>
        </div>

        <footer className="relative z-10 p-6 pt-3">
           <button 
             onClick={onDisableAll}
             className="w-full h-10 bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/10 rounded-[20px] text-rose-500 text-[9px] font-black uppercase tracking-[0.3em] transition-all active:scale-[0.98]"
           >
              DISABLE ALL LOOPS
           </button>
           <div className="mt-4 flex justify-center gap-1 opacity-20">
              <span className="text-[6px] font-bold text-zinc-600 uppercase tracking-widest italic leading-none">Matrix Control Protocol V1.5</span>
           </div>
        </footer>
      </div>
    </div>
  );
};

export default LoopMatrixModal;
