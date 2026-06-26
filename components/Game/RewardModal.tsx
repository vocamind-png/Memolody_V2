import React from 'react';
import { Star, Sparkles, X } from 'lucide-react';
import { RewardItem } from './useForestGame';

interface RewardModalProps {
  reward: RewardItem;
  onClose: () => void;
}

export const RewardModal: React.FC<RewardModalProps> = ({ reward, onClose }) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#1a233a] border border-emerald-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden transform animate-in zoom-in-95 duration-500">
        
        {/* Magic glow background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] aspect-square bg-emerald-500/20 blur-3xl rounded-full mix-blend-screen" />
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white z-10"
        >
          <X size={20} />
        </button>

        <div className="relative z-10 text-center flex flex-col items-center">
          <div className="flex items-center gap-2 text-emerald-400 mb-6 font-black tracking-widest uppercase text-sm">
            <Sparkles size={16} />
            <span>New Discovery!</span>
            <Sparkles size={16} />
          </div>
          
          <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-emerald-400/50 flex items-center justify-center text-5xl mb-6 shadow-[0_0_30px_rgba(52,211,153,0.3)] animate-pulse">
            {reward.icon}
          </div>
          
          <h3 className="text-2xl font-black text-white mb-2">{reward.name}</h3>
          <p className="text-emerald-100/70 mb-8 px-4 text-sm leading-relaxed">
            {reward.description}
          </p>
          
          <button 
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shadow-lg"
          >
            Add to Vault
          </button>
        </div>
      </div>
    </div>
  );
};
