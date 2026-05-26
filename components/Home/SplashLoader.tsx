import React, { useEffect, useState } from 'react';
import { Music, Sparkles } from 'lucide-react';

interface SplashLoaderProps {
  progress: number;
  statusText?: string;
}

export const SplashLoader: React.FC<SplashLoaderProps> = ({ progress, statusText = 'Loading Memolody V2...' }) => {
  const [dots, setDots] = useState('');

  // Subtle animated ellipsis for the status text
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#050507] text-white select-none overflow-hidden">
      {/* Immersive background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[45vw] h-[45vw] rounded-full bg-indigo-500/10 blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />

      <div className="relative z-10 flex flex-col items-center max-w-lg w-full px-6">
        
        {/* Brand Logo & Header */}
        <div className="flex items-center gap-2 mb-10 animate-fade-in">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-[0_0_20px_rgba(0,229,255,0.3)]">
            <Music size={20} className="text-black" strokeWidth={2.5} />
          </div>
          <span className="text-[11px] font-black tracking-[0.25em] text-zinc-400 uppercase">
            MEMOLODY <span className="text-cyan-400">V2.3</span>
          </span>
        </div>

        {/* ── 5-LINE STAFF & FALLING NOTES AREA ── */}
        <div className="relative w-full h-36 flex items-center justify-center mb-6 overflow-hidden rounded-2xl bg-black/20 border border-white/5 backdrop-blur-md shadow-2xl">
          
          {/* Glowing 5 Staff Lines */}
          <div className="absolute inset-x-6 flex flex-col justify-between h-16 pointer-events-none opacity-80">
            {[0, 1, 2, 3, 4].map(i => (
              <div 
                key={i} 
                className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent relative"
                style={{
                  boxShadow: '0 0 8px rgba(6, 182, 212, 0.4)'
                }}
              >
                {/* Glowing runner light along the staff lines */}
                <div 
                  className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-staff-sweep"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              </div>
            ))}
          </div>

          {/* Treble Clef Icon at the start */}
          <div className="absolute left-10 flex items-center justify-center pointer-events-none opacity-40 animate-pulse">
            <span className="text-4xl font-serif text-cyan-400/70 select-none">𝄞</span>
          </div>

          {/* Animated Falling Notes landing on the staff */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Note 1 */}
            <div className="absolute top-[-20px] left-[30%] animate-note-fall" style={{ animationDelay: '0s', animationDuration: '3.5s' }}>
              <div className="relative w-6 h-6 flex flex-col items-end">
                <div className="w-3.5 h-2.5 bg-cyan-400 rounded-full rotate-[-20deg] shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                <div className="w-[1.5px] h-6 bg-cyan-400 absolute bottom-1 right-0 shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
              </div>
            </div>

            {/* Note 2 */}
            <div className="absolute top-[-20px] left-[50%] animate-note-fall-alt" style={{ animationDelay: '0.8s', animationDuration: '4.2s' }}>
              <div className="relative w-6 h-6 flex flex-col items-end">
                <div className="w-3.5 h-2.5 bg-indigo-400 rounded-full rotate-[-20deg] shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                <div className="w-[1.5px] h-6 bg-indigo-400 absolute bottom-1 right-0 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                <div className="w-3.5 h-2 bg-indigo-400 absolute top-0 right-[-2px] rounded-r-full rotate-[15deg] origin-left shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              </div>
            </div>

            {/* Note 3 */}
            <div className="absolute top-[-20px] left-[70%] animate-note-fall" style={{ animationDelay: '1.5s', animationDuration: '3.8s' }}>
              <div className="relative w-6 h-6 flex flex-col items-end">
                <div className="w-3.5 h-2.5 bg-cyan-400 rounded-full rotate-[-20deg] shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                <div className="w-[1.5px] h-6 bg-cyan-400 absolute bottom-1 right-0 shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
              </div>
            </div>

            {/* Note 4 */}
            <div className="absolute top-[-20px] left-[80%] animate-note-fall-alt" style={{ animationDelay: '2.2s', animationDuration: '4.5s' }}>
              <div className="relative w-6 h-6 flex flex-col items-end">
                <div className="w-3.5 h-2.5 bg-indigo-400 rounded-full rotate-[-20deg] shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                <div className="w-[1.5px] h-6 bg-indigo-400 absolute bottom-1 right-0 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
              </div>
            </div>
          </div>

          {/* Glowing Wave graphic (audio waves) */}
          <div className="absolute bottom-2 left-6 right-6 h-8 pointer-events-none opacity-40">
            <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="w-full h-full text-cyan-400">
              <path 
                d="M0,50 Q25,20 50,50 T100,50 T150,50 T200,50 T250,50 T300,50 T350,50 T400,50" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                className="animate-wave-flow"
              />
              <path 
                d="M0,50 Q25,80 50,50 T100,50 T150,50 T200,50 T250,50 T300,50 T350,50 T400,50" 
                fill="none" 
                stroke="indigo" 
                strokeWidth="1.5" 
                className="animate-wave-flow-reverse opacity-70"
              />
            </svg>
          </div>
        </div>

        {/* Status Text & Progress Info */}
        <div className="w-full flex flex-col gap-3">
          <div className="flex justify-between items-center text-[8.5px] font-black uppercase tracking-widest text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Sparkles size={10} className="text-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
              {statusText}{dots}
            </span>
            <span className="text-cyan-400 tabular-nums font-mono drop-shadow-[0_0_5px_rgba(0,229,255,0.4)]">{Math.round(progress)}%</span>
          </div>

          {/* Premium Glowing Progress Bar */}
          <div className="h-1.5 w-full bg-zinc-900/60 rounded-full border border-white/5 overflow-hidden relative">
            <div 
              className="h-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-indigo-500 rounded-full shadow-[0_0_12px_rgba(0,229,255,0.8)] transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
            {/* Glossy light highlight effect inside progress bar */}
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.15),transparent)] rounded-full" />
          </div>
        </div>

        <span className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest mt-12 text-center max-w-[250px] leading-relaxed">
          Secured local offline database. All processing happens on your device.
        </span>

      </div>

      {/* Styled custom CSS for Loader animations */}
      <style>{`
        @keyframes staffSweep {
          0% { left: -50px; opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { left: 100%; opacity: 0; }
        }
        .animate-staff-sweep {
          position: absolute;
          animation: staffSweep 4s infinite linear;
        }

        @keyframes waveFlow {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-wave-flow {
          animation: waveFlow 12s infinite linear;
          transform-origin: center;
        }
        .animate-wave-flow-reverse {
          animation: waveFlow 18s infinite linear reverse;
          transform-origin: center;
        }

        @keyframes noteFall {
          0% { transform: translateY(-30px); opacity: 0; }
          15% { opacity: 1; }
          60% { transform: translateY(60px); opacity: 1; }
          75% { transform: translateY(55px); opacity: 0.9; }
          100% { transform: translateY(120px); opacity: 0; }
        }
        .animate-note-fall {
          animation: noteFall infinite ease-in-out;
        }

        @keyframes noteFallAlt {
          0% { transform: translateY(-30px); opacity: 0; }
          10% { opacity: 1; }
          50% { transform: translateY(75px); opacity: 1; }
          70% { transform: translateY(70px); opacity: 0.9; }
          100% { transform: translateY(120px); opacity: 0; }
        }
        .animate-note-fall-alt {
          animation: noteFallAlt infinite ease-in-out;
        }

        .animate-fade-in {
          animation: fadeIn 1s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
