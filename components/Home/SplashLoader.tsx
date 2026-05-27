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
            <svg 
              width="50" 
              height="100" 
              viewBox="5 5 45 90" 
              className="text-cyan-400/80" 
              fill="currentColor"
              style={{ filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.4))' }}
            >
              <path d="M32.108,45.02C31.428,42.709,30.78,40.425,30.195,38.209C34.229,34.433,37.429,29.413,37.5,21.283C37.536,17.06,37.032,12.006,33.025,6.535C31.843,4.922,29.604,4.519,27.934,5.621C23.985,8.227,20,14.457,20,22.5C20,26.253,20.699,30.663,21.782,35.411C20.949,36.021,20.077,36.63,19.177,37.259C12.86,41.667,5,47.153,5,60C5,74.084,16.44,82.5,27.5,82.5C29.658,82.5,31.729,82.271,33.677,81.841C33.684,82.066,33.688,82.285,33.688,82.5C33.688,85.257,31.445,87.5,28.688,87.5C27.352,87.5,26.096,86.98,25.153,86.036L19.848,91.339C22.209,93.7,25.348,95,28.688,95C35.581,95,41.188,89.393,41.188,82.5C41.188,81.387,41.118,80.206,40.986,78.964C46.528,75.615,50,70.154,50,63.75C50,53.699,42.05,45.47,32.108,45.02ZM29.244,15.311C29.86,17.224,30.017,19.139,30,21.218C29.973,24.421,29.287,26.889,28.125,28.943C27.729,26.582,27.5,24.41,27.5,22.5C27.5,19.607,28.264,17.158,29.244,15.311ZM27.5,75C20.229,75,12.5,69.743,12.5,60C12.5,51.065,17.341,47.686,23.469,43.409C23.573,43.337,23.677,43.264,23.781,43.192C24.103,44.346,24.438,45.509,24.78,46.677C19.873,49.271,16.188,54.53,16.188,60C16.188,63.338,17.488,66.477,19.848,68.838L25.153,63.535C24.209,62.59,23.688,61.335,23.688,59.999C23.688,57.909,25.121,55.645,27.027,54.157C27.096,54.384,27.166,54.611,27.234,54.838C29.303,61.627,31.419,68.566,32.64,74.372C31.05,74.78,29.322,75,27.5,75ZM39.503,70.664C38.239,65.243,36.406,59.209,34.508,52.981C39.128,54.381,42.5,58.679,42.5,63.75C42.5,66.425,41.488,68.887,39.503,70.664Z" />
            </svg>
          </div>

          {/* Animated Falling Notes landing on the staff */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Note 1 (Quarter Note - Stem Up) */}
            <div className="absolute top-[-20px] left-[30%] animate-note-fall" style={{ animationDelay: '0s', animationDuration: '3.5s' }}>
              <svg width="24" height="36" viewBox="0 0 24 36" className="text-cyan-400" style={{ filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.9))' }} fill="currentColor">
                <ellipse cx="7" cy="28" rx="6.5" ry="4.5" transform="rotate(-20 7 28)" />
                <rect x="12.5" y="4" width="1.5" height="24" rx="0.5" />
              </svg>
            </div>
            {/* Note 1 Burst */}
            <div className="absolute top-[52px] left-[calc(30%+4px)] w-8 h-8 rounded-full bg-white animate-glow-burst" style={{ animationDelay: '0s', animationDuration: '3.5s', mixBlendMode: 'screen' }} />

            {/* Note 2 (Eighth Note - Stem Down, Flag Curves Up-Right) */}
            <div className="absolute top-[-20px] left-[50%] animate-note-fall-alt" style={{ animationDelay: '0.8s', animationDuration: '4.2s' }}>
              <svg width="24" height="36" viewBox="0 0 24 36" className="text-indigo-400" style={{ filter: 'drop-shadow(0 0 8px rgba(99,102,241,0.9))' }} fill="currentColor">
                <ellipse cx="17" cy="8" rx="6.5" ry="4.5" transform="rotate(-20 17 8)" />
                <rect x="11" y="8" width="1.5" height="24" rx="0.5" />
                <path d="M 11,32 C 15.5,29 18.5,24 15.5,18 C 14.5,16 13,15 13,15 C 15,17.5 15.5,22 11,26 Z" />
              </svg>
            </div>
            {/* Note 2 Burst */}
            <div className="absolute top-[47px] left-[calc(50%+14px)] w-8 h-8 rounded-full bg-white animate-glow-burst-alt" style={{ animationDelay: '0.8s', animationDuration: '4.2s', mixBlendMode: 'screen' }} />

            {/* Note 3 (Sixteenth Note - Stem Up, Parallel Flags Curve Down-Right) */}
            <div className="absolute top-[-20px] left-[70%] animate-note-fall" style={{ animationDelay: '1.5s', animationDuration: '3.8s' }}>
              <svg width="24" height="36" viewBox="0 0 24 36" className="text-cyan-400" style={{ filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.9))' }} fill="currentColor">
                <ellipse cx="7" cy="28" rx="6.5" ry="4.5" transform="rotate(-20 7 28)" />
                <rect x="12.5" y="4" width="1.5" height="24" rx="0.5" />
                <path d="M 13.5,4 C 18,7 21,12 18,18 C 17,20 15.5,21 15.5,21 C 17.5,18.5 18,14 13.5,10 Z" />
                <path d="M 13.5,9 C 18,12 21,17 18,23 C 17,25 15.5,26 15.5,26 C 17.5,23.5 18,19 13.5,15 Z" />
              </svg>
            </div>
            {/* Note 3 Burst */}
            <div className="absolute top-[52px] left-[calc(70%+4px)] w-8 h-8 rounded-full bg-white animate-glow-burst" style={{ animationDelay: '1.5s', animationDuration: '3.8s', mixBlendMode: 'screen' }} />

            {/* Note 4 (Eighth Note - Stem Up, Flag Curves Down-Right) */}
            <div className="absolute top-[-20px] left-[80%] animate-note-fall-alt" style={{ animationDelay: '2.2s', animationDuration: '4.5s' }}>
              <svg width="24" height="36" viewBox="0 0 24 36" className="text-indigo-400" style={{ filter: 'drop-shadow(0 0 8px rgba(99,102,241,0.9))' }} fill="currentColor">
                <ellipse cx="7" cy="28" rx="6.5" ry="4.5" transform="rotate(-20 7 28)" />
                <rect x="12.5" y="4" width="1.5" height="24" rx="0.5" />
                <path d="M 13.5,4 C 18,7 21,12 18,18 C 17,20 15.5,21 15.5,21 C 17.5,18.5 18,14 13.5,10 Z" />
              </svg>
            </div>
            {/* Note 4 Burst */}
            <div className="absolute top-[62px] left-[calc(80%+4px)] w-8 h-8 rounded-full bg-white animate-glow-burst-alt" style={{ animationDelay: '2.2s', animationDuration: '4.5s', mixBlendMode: 'screen' }} />
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
          62%, 100% { transform: translateY(60px); opacity: 0; }
        }
        .animate-note-fall {
          animation: noteFall infinite ease-in;
        }

        @keyframes noteFallAlt {
          0% { transform: translateY(-30px); opacity: 0; }
          12% { opacity: 1; }
          50% { transform: translateY(75px); opacity: 1; }
          52%, 100% { transform: translateY(75px); opacity: 0; }
        }
        .animate-note-fall-alt {
          animation: noteFallAlt infinite ease-in;
        }

        @keyframes glowBurst {
          0%, 58% { transform: scale(0); opacity: 0; }
          60% { transform: scale(0.4); opacity: 1; }
          65% { transform: scale(1.6); opacity: 0.7; filter: blur(3px); }
          75% { transform: scale(2.2); opacity: 0; filter: blur(6px); }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .animate-glow-burst {
          animation: glowBurst infinite ease-out;
        }

        @keyframes glowBurstAlt {
          0%, 48% { transform: scale(0); opacity: 0; }
          50% { transform: scale(0.4); opacity: 1; }
          55% { transform: scale(1.6); opacity: 0.7; filter: blur(3px); }
          65% { transform: scale(2.2); opacity: 0; filter: blur(6px); }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .animate-glow-burst-alt {
          animation: glowBurstAlt infinite ease-out;
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
