
import React from 'react';
import { 
  Rocket, Bird, Theater, UtensilsCrossed, 
  Play, Sparkles, Heart, Star
} from 'lucide-react';

interface GameTheme {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  gradient: string;
  image: string;
}

const THEMES: GameTheme[] = [
  { 
    id: 'space', 
    title: 'Space Odyssey', 
    subtitle: 'Syfri-urtahic', 
    icon: Rocket, 
    color: 'text-indigo-400',
    gradient: 'from-indigo-600/40 to-purple-900/60',
    image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&auto=format&fit=crop'
  },
  { 
    id: 'forest', 
    title: 'Forest Concert', 
    subtitle: 'Happy Birdie', 
    icon: Bird, 
    color: 'text-yellow-400',
    gradient: 'from-emerald-400/60 to-lime-500/60',
    image: 'https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=600&auto=format&fit=crop' // Bright cute meadow
  },
  { 
    id: 'history', 
    title: 'Historical Quest', 
    subtitle: 'Omert Chiom', 
    icon: Theater, 
    color: 'text-amber-400',
    gradient: 'from-blue-600/40 to-indigo-950/60',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop'
  },
  { 
    id: 'italian', 
    title: 'Italian Ballot', 
    subtitle: '3D Mean Style', 
    icon: UtensilsCrossed, 
    color: 'text-rose-500',
    gradient: 'from-rose-600/60 via-white/10 to-emerald-600/60',
    image: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=600&auto=format&fit=crop' // Bold Italian vibe
  }
];

const GameHub: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-transparent overflow-y-auto no-scrollbar pb-32 pt-2">
      <style>{`
        .game-card {
          width: 100%;
          height: 170px;
          border-radius: 24px;
          overflow: hidden;
          flex-shrink: 0;
          box-shadow: 0 8px 30px rgba(0,0,0,0.5);
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          background: var(--bg-panel);
          backdrop-filter: blur(12px);
          border: 1px solid var(--border-light);
        }
        @media (min-width: 640px) {
          .game-card { height: 250px; border-radius: 32px; }
        }
        .game-card:hover {
          transform: translateY(-5px) scale(1.03);
          box-shadow: 0 15px 40px rgba(0,0,0,0.8);
          border-color: rgba(255,255,255,0.2);
        }
        .play-btn-area {
          background: white;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (min-width: 640px) {
          .play-btn-area { height: 50px; }
        }
        .dots-row span {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          margin: 0 1.5px;
        }
        .dots-row span.active {
          background: white;
          box-shadow: 0 0 5px white;
        }
        .forest-glow {
          filter: drop-shadow(0 0 10px rgba(163, 230, 53, 0.8));
        }
        .italian-glow {
          filter: drop-shadow(0 0 12px rgba(244, 63, 94, 0.8));
        }
      `}</style>

      {/* HEADER */}
      <header className="px-6 pt-8 pb-4 shrink-0">
        <div className="flex items-center gap-2 mb-2">
           <div className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
              <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
                 <div className="w-1.5 h-0.5 bg-[#1a233a] rounded-sm rotate-45" />
              </div>
           </div>
           <span className="text-base font-black text-white tracking-tighter">Memolody Hub</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tighter mb-1">Game Center</h1>
        
        <div className="flex items-center gap-2 mb-4">
           <div className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
           <p className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]">
              Coming soon: Practice your song with our game!
           </p>
        </div>
      </header>

      {/* 2x2 COMPACT GRID */}
      <div className="grid grid-cols-2 gap-3 px-6 mb-8">
        {THEMES.map((theme) => (
          <div key={theme.id} className="game-card flex flex-col group cursor-pointer border border-white/5 relative">
            {/* TOP AREA: ARTWORK */}
            <div className={`flex-1 relative overflow-hidden bg-gradient-to-br ${theme.gradient}`}>
               <img 
                 src={theme.image} 
                 className={`absolute inset-0 w-full h-full object-cover mix-blend-overlay ${theme.id === 'forest' ? 'opacity-70' : 'opacity-40'} group-hover:scale-110 transition-transform duration-[2000ms]`} 
                 alt="" 
               />
               
               {/* SPECIAL DECO FOR FOREST */}
               {theme.id === 'forest' && (
                 <div className="absolute top-2 right-2 animate-bounce">
                    <Heart size={10} className="text-rose-300 fill-rose-300 opacity-60" />
                 </div>
               )}

               {/* THEME TITLE */}
               <div className="absolute top-2.5 inset-x-0 text-center px-1">
                  <h3 className={`text-white font-black text-[8px] sm:text-[10px] uppercase tracking-wider ${theme.id === 'forest' ? 'drop-shadow-md' : 'opacity-80'}`}>{theme.title}</h3>
               </div>

               {/* MAIN ICON */}
               <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                  <div className={`w-11 h-11 sm:w-16 sm:h-16 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center mb-1.5 shadow-xl transition-transform group-hover:rotate-6 ${theme.color} ${theme.id === 'forest' ? 'forest-glow bg-emerald-400/20' : ''} ${theme.id === 'italian' ? 'italian-glow' : ''}`}>
                     <theme.icon size={22} className="sm:w-[32px] sm:h-[32px]" strokeWidth={2} />
                  </div>
                  <div className="text-center">
                     <p className={`text-white/80 font-black text-[6px] sm:text-[7px] uppercase tracking-[0.1em] mb-1 ${theme.id === 'forest' ? 'text-white' : ''}`}>{theme.subtitle}</p>
                     <div className="dots-row flex items-center justify-center">
                        <span className="active" />
                        <span />
                        <span />
                        <span />
                     </div>
                  </div>
               </div>
            </div>

            {/* BOTTOM AREA: PLAY BUTTON */}
            <div className="play-btn-area">
               <button className="bg-[#1a233a] hover:bg-indigo-900 px-5 py-1 rounded-full flex items-center gap-1 transition-all active:scale-90 border border-transparent hover:border-white/10">
                  <span className="text-white text-[8px] sm:text-[10px] font-black uppercase tracking-widest">Play</span>
               </button>
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER ACCENT */}
      <div className="mt-2 text-center px-10 opacity-30">
         <div className="flex items-center justify-center gap-4">
            <div className="h-px flex-1 bg-white/20" />
            <Sparkles size={14} className="text-white" />
            <div className="h-px flex-1 bg-white/20" />
         </div>
      </div>
    </div>
  );
};

export default GameHub;
