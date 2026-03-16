import React from 'react';
import { X, SlidersHorizontal, Power, Trash2 } from 'lucide-react';
import { PluginDefinition } from '../../types';

interface FXPluginModalProps {
  plugin: PluginDefinition | null;
  isBypassed: boolean;
  onClose: () => void;
  onBypassToggle: () => void;
  onRemove: () => void;
}

const FXPluginModal: React.FC<FXPluginModalProps> = ({ plugin, isBypassed, onClose, onBypassToggle, onRemove }) => {
  if (!plugin) return null;

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-md bg-[#111115] border border-white/10 rounded-[40px] shadow-2xl flex flex-col overflow-hidden">
        <header className="p-4 flex items-center justify-between border-b border-white/5 bg-black/30">
          <div className="flex items-center gap-3">
            <SlidersHorizontal size={16} className="text-cyan-400" />
            <h2 className="text-lg font-black text-white italic uppercase tracking-tighter">{plugin.name}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onBypassToggle} className={`p-2 rounded-full transition-colors ${isBypassed ? 'bg-zinc-700 text-zinc-400' : 'bg-cyan-600 text-white'}`}>
                <Power size={14} />
            </button>
            <button onClick={onRemove} className="p-2 text-zinc-600 hover:text-rose-500 bg-white/5 rounded-full">
                <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="p-2 text-zinc-600 hover:text-white bg-white/5 rounded-full">
                <X size={16} />
            </button>
          </div>
        </header>

        <div className="p-8 space-y-4">
          <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest text-center">{plugin.description}</p>
          <div className="py-12 flex items-center justify-center bg-black/30 border border-dashed border-white/10 rounded-2xl">
            <span className="text-sm font-black text-zinc-700 italic">Plugin Controls UI Placeholder</span>
          </div>
        </div>

        <footer className="p-4 bg-black/30 border-t border-white/5 text-center">
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-700">MEMOLODY NEURAL DSP</span>
        </footer>
      </div>
    </div>
  );
};

export default FXPluginModal;