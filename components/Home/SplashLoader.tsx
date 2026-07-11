import React, { useEffect, useState } from 'react';
import { Music, Sparkles } from 'lucide-react';

interface SplashLoaderProps {
  progress: number;
  statusText?: string;
  onStart?: () => void;
  bgmUrl?: string;
  bgmTitle?: string;
  bgmCover?: string;
}

export const SplashLoader: React.FC<SplashLoaderProps> = ({ progress, statusText = 'Loading Memolody V2...', onStart, bgmUrl, bgmTitle, bgmCover }) => {
  const [dots, setDots] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const fadeInAudio = (audioEl: HTMLAudioElement) => {
    // If it's already playing and volume is up, do not reset
    if (!audioEl.paused && audioEl.volume > 0) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    audioEl.volume = 0;
    
    audioEl.play().then(() => {
      setAudioError(false);
      // Store globally so HomePage can reuse the same playing audio
      (window as any).__memolody_bgm = audioEl;
      let vol = 0;
      const targetVolume = 0.5;
      intervalRef.current = setInterval(() => {
        vol += 0.05;
        if (vol >= targetVolume) {
          audioEl.volume = targetVolume;
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else {
          audioEl.volume = vol;
        }
      }, 200);
    }).catch(() => setAudioError(true));
  };

  useEffect(() => {
    if (audioRef.current) {
      fadeInAudio(audioRef.current);
    }
  }, []);

  const fadeOutAudio = (audioEl: HTMLAudioElement) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    let vol = audioEl.volume;
    intervalRef.current = setInterval(() => {
      vol -= 0.1;
      if (vol <= 0) {
        audioEl.volume = 0;
        audioEl.pause();
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        audioEl.volume = vol;
      }
    }, 100);
  };

  const handleEnableAudio = () => {
    if (audioRef.current) {
      if (!audioRef.current.paused && audioRef.current.volume > 0) {
        fadeOutAudio(audioRef.current);
      } else {
        fadeInAudio(audioRef.current);
      }
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setShowRecovery(true);
    }, 12000);
    return () => clearTimeout(t);
  }, []);

  const handleForceClear = async () => {
    if (confirm("คุณต้องการล้างข้อมูลแอปทั้งหมด (รวมถึงเพลงที่อัปโหลดไว้) เพื่อรีเซ็ตระบบหรือไม่?")) {
      try {
        localStorage.clear();
        sessionStorage.clear();
        if ('indexedDB' in window) {
          const databases = await window.indexedDB.databases();
          databases.forEach(db => {
            if (db.name) window.indexedDB.deleteDatabase(db.name);
          });
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
          }
        }
        alert("ล้างข้อมูลสำเร็จแล้วค่ะ กำลังรีโหลดแอปใหม่...");
        window.location.reload();
      } catch (e) {
        alert("เกิดข้อผิดพลาดในการล้างข้อมูล: " + String(e));
      }
    }
  };

  // Subtle animated ellipsis for the status text
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#050507] text-white select-none overflow-hidden cursor-pointer"
      onClick={handleEnableAudio}
    >
      {/* Immersive background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[45vw] h-[45vw] rounded-full bg-indigo-500/10 blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />

      <audio ref={audioRef} src={bgmUrl || "/audio/Where_Dreams_Align.mp3"} loop preload="auto" />
      <div className="relative z-10 flex flex-col items-center max-w-lg w-full px-6">
        
          {/* Now Playing Widget */}
          {(
            <div className="absolute top-6 right-6 flex items-center gap-3 bg-black/40 backdrop-blur-md px-3 py-2 rounded-full border border-white/5 animate-fade-in shadow-xl">
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 animate-[spin_10s_linear_infinite]">
                <img src={bgmCover || '/images/memolody_hero.png'} alt="Cover" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col pr-2">
                <span className="text-[7px] text-cyan-400 font-black tracking-widest uppercase">NOW PLAYING</span>
                <span className="text-[10px] text-white font-medium truncate max-w-[120px]">{bgmTitle || 'Where Dreams Align'}</span>
              </div>
            </div>
          )}

        {/* Brand Logo & Header */}
        <div className="flex items-center gap-2 mb-10 animate-fade-in relative">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-[0_0_20px_rgba(0,229,255,0.3)]">
            <Music size={20} className="text-black" strokeWidth={2.5} />
          </div>
          <span className="text-[11px] font-black tracking-[0.25em] text-zinc-400 uppercase">
            MEMOLODY <span className="text-cyan-400">V2.5</span>
          </span>
          {audioError && (
            <button 
              onClick={handleEnableAudio}
              className="absolute -right-28 px-3 py-1 bg-cyan-500/20 text-cyan-300 text-[9px] font-bold tracking-widest rounded-full border border-cyan-500/50 hover:bg-cyan-500/40 transition-colors animate-pulse whitespace-nowrap"
            >
              TAP TO UNMUTE
            </button>
          )}
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
          <div className="absolute left-10 flex items-center justify-center pointer-events-none opacity-90" style={{ transform: 'translateY(10px)' }}>
            <span className="text-[58px] font-serif text-cyan-400 select-none leading-none" style={{ filter: 'drop-shadow(0 0 2px rgba(6,182,212,0.5))' }}>𝄞</span>
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

          {/* Recovery UI Removed as requested */}
        </div>

        {/* Credits Section */}
        <div className="flex flex-col items-center gap-1.5 mt-10 text-center animate-fade-in" style={{ animationDelay: '300ms' }}>
          <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">
            Founded & Funded by <span className="text-zinc-300 font-extrabold">Tanate Ua-Aphitorn</span>
          </div>
          <div className="text-[7.5px] text-zinc-500 font-semibold uppercase tracking-wide">
            Designed & Built by <span className="text-zinc-300 font-extrabold">Paisan Chamnong</span>
          </div>
          <div className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
            in collaboration with <span className="text-cyan-400 font-extrabold drop-shadow-[0_0_4px_rgba(34,211,238,0.3)]">Google Antigravity</span>
          </div>
          <div className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
            AI Voice provided by <a href="https://lottev.moe/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 font-extrabold drop-shadow-[0_0_4px_rgba(129,140,248,0.3)] transition-colors">lottev.moe</a>
          </div>
        </div>

        <span className="text-[6.5px] text-zinc-600 font-bold uppercase tracking-widest mt-10 text-center max-w-[250px] leading-relaxed opacity-75">
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
