import React, { useState, useEffect } from 'react';
import { ArrowLeft, Bird } from 'lucide-react';
import { useVocalSampler } from './useVocalSampler';
import { LyricMode } from '../../types';

interface ForestConcertProps {
  onBack: () => void;
  bgmUrl?: string;
}

const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

// Using a 500x250 viewBox for SVG
// 5 lines starting at Y=70, spacing=20
// Line 1 (F5) = 30 (not used yet)
// Line 5 (E4) = 150
const NOTE_Y_MAP: Record<string, number> = {
  'C4': 170, // ledger line below
  'D4': 160, // space below
  'E4': 150, // 1st line (bottom)
  'F4': 140, // 1st space
  'G4': 130, // 2nd line
  'A4': 120, // 2nd space
  'B4': 110, // 3rd line (middle)
  'C5': 100, // 3rd space
};

const ForestConcert: React.FC<ForestConcertProps> = ({ onBack, bgmUrl }) => {
  const [lyricMode] = useState<LyricMode>(() => (localStorage.getItem('memo_lyric_mode') as LyricMode) || 'Ju Solfege Fixed Doh');
  const { playNote, playWrong } = useVocalSampler(lyricMode);
  
  const [currentNote, setCurrentNote] = useState('C4');
  const [score, setScore] = useState(0);
  const [sungText, setSungText] = useState('');
  const [shake, setShake] = useState(false);
  const [lightning, setLightning] = useState(false);
  const [birds, setBirds] = useState<{id: number, x: number, y: number, color: string}[]>([]);
  
  // Reward System: Pre-calculate firefly positions
  const fireflies = React.useMemo(() => {
    return Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 90 + 5}%`,
      top: `${Math.random() * 80 + 10}%`,
      delay: `${-Math.random() * 5}s`,
      duration: `${Math.random() * 3 + 3}s`
    }));
  }, []);

  const getRank = (s: number) => {
    if (s < 5) return { title: 'Sound Explorer', icon: '🌱' };
    if (s < 15) return { title: 'Bird Companion', icon: '🐦' };
    if (s < 30) return { title: 'Forest Maestro', icon: '🦊' };
    return { title: 'Woodland Virtuoso', icon: '🦄' };
  };
  const rank = getRank(score);
  
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    pickRandomNote();
    
    // Play BGM (Playlist of Lyria Generated Tracks or Dynamic Cloud BGM)
    const tracks = bgmUrl ? [bgmUrl] : ['/audio/forest_bgm0.mp3', '/audio/forest_bgm1.mp3'];
    let currentTrackIdx = Math.floor(Math.random() * tracks.length);
    const bgm = new Audio(tracks[currentTrackIdx]);
    bgm.volume = 0.3;
    bgmRef.current = bgm;
    
    const playNext = () => {
      if (tracks.length > 1) {
        currentTrackIdx = (currentTrackIdx + 1) % tracks.length;
        bgm.src = tracks[currentTrackIdx];
        bgm.play().catch(e => console.log("BGM playback prevented."));
      }
    };
    
    bgm.addEventListener('ended', playNext);
    bgm.play().then(() => setHasInteracted(true)).catch(e => console.log("BGM autoplay prevented. Waiting for interaction."));
    
    return () => {
      bgm.removeEventListener('ended', playNext);
      bgm.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgmUrl]);

  const pickRandomNote = () => {
    const next = NOTES[Math.floor(Math.random() * NOTES.length)];
    setCurrentNote(next);
    setSungText('');
  };

  const handleGuess = async (noteName: string) => {
    if (!hasInteracted) {
      setHasInteracted(true);
      bgmRef.current?.play().catch(console.error);
    }
    const correctName = currentNote.replace(/\d/, '');
    if (noteName === correctName) {
      const syllable = playNote(currentNote);
      setSungText(syllable);
      setScore(s => s + 1);
      
      // Play Lyria Generated Bird Choir
      const choir = new Audio('/audio/bird_choir.mp3');
      choir.volume = 0.5;
      choir.play().catch(e => console.log("Choir audio not found or prevented"));

      // Spawn Bird EFX
      const newBirds = Array.from({length: 6}).map((_, i) => ({
        id: Date.now() + i,
        x: (Math.random() - 0.5) * 300,
        y: (Math.random() - 0.5) * 200 - 150,
        color: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'][Math.floor(Math.random() * 5)]
      }));
      setBirds(prev => [...prev, ...newBirds]);
      setTimeout(() => {
        setBirds(prev => prev.filter(b => !newBirds.includes(b)));
      }, 2000);

      setTimeout(() => {
        pickRandomNote();
      }, 1000);
    } else {
      playWrong(); // fallback Tone.js beep
      
      // Play Thunder and Rain SFX
      const thunder = new Audio('/audio/thunder.mp3');
      thunder.volume = 0.8;
      thunder.play().catch(e => console.log("Thunder audio not found or prevented"));

      setLightning(true);
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setLightning(false);
      }, 800);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a1122] overflow-hidden rounded-3xl relative">
      {/* Background artwork */}
      <img 
        src="https://images.unsplash.com/photo-1511497584788-876760111969?w=1200&auto=format&fit=crop" 
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${lightning ? 'opacity-5' : 'opacity-30'}`}
        alt="Tropical Rainforest"
      />
      <div className={`absolute inset-0 transition-colors duration-300 ${lightning ? 'bg-slate-900/90' : 'bg-gradient-to-b from-emerald-900/60 to-transparent'}`} />
      
      {/* Lightning Flash & Rain Overlay */}
      {lightning && (
        <>
          <div className="absolute inset-0 bg-white z-50 pointer-events-none mix-blend-overlay animate-flash" />
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={`rain-${i}`}
                className="absolute bg-white/60 w-0.5 rounded-full animate-rain"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-20%`,
                  height: `${Math.random() * 40 + 20}px`,
                  animationDelay: `${Math.random() * 0.3}s`,
                  animationDuration: `${Math.random() * 0.2 + 0.3}s`
                }}
              />
            ))}
          </div>
        </>
      )}
      
      <header className="relative z-10 flex items-center justify-between p-6">
        <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition backdrop-blur-md">
          <ArrowLeft className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Bird className="text-emerald-400" size={18} />
          </div>
          <h2 className="text-white font-black text-xl tracking-wider uppercase">Forest Concert</h2>
        </div>
        <div className="bg-emerald-500/20 px-4 py-1.5 rounded-full border border-emerald-500/30 backdrop-blur-md flex items-center gap-2">
          <span className="text-xl animate-bounce">{rank.icon}</span>
          <span className="text-emerald-300 font-black text-sm uppercase tracking-widest">
            {rank.title} <span className="text-white">({score})</span>
          </span>
        </div>
      </header>

      {/* Magical Fireflies Reward System */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {fireflies.slice(0, Math.min(score, 100)).map((ff) => (
          <div
            key={`firefly-${ff.id}`}
            className="absolute w-1.5 h-1.5 bg-yellow-200 rounded-full animate-float-firefly mix-blend-screen"
            style={{
              left: ff.left,
              top: ff.top,
              boxShadow: '0 0 12px 6px rgba(253, 224, 71, 0.4)',
              animationDelay: ff.delay,
              animationDuration: ff.duration
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        {/* SVG Staff Engine */}
        <div className={`w-full max-w-2xl px-4 ${shake ? 'animate-shake' : ''}`}>
          <div className="relative w-full aspect-[2/1] bg-black/40 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl overflow-hidden">
            <svg viewBox="0 0 500 250" className="w-full h-full">
              {/* Staff Lines (from Y=70 to Y=150) */}
              {[70, 90, 110, 130, 150].map(y => (
                <line key={y} x1="50" y1={y} x2="450" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />
              ))}
              
              {/* Treble Clef */}
              <text x="35" y="165" fill="rgba(255,255,255,0.7)" style={{ fontSize: '160px', fontFamily: 'serif' }}>𝄞</text>
              
              {/* Ledger Line for C4 */}
              {currentNote === 'C4' && (
                <line x1="220" y1="170" x2="280" y2="170" stroke="rgba(255,255,255,0.8)" strokeWidth="3" strokeLinecap="round" />
              )}

              {/* Note / Bird rendering */}
              <g transform={`translate(250, ${NOTE_Y_MAP[currentNote]})`} className="transition-transform duration-500 ease-out">
                {/* Note head (drawn as a cute bird/egg) */}
                <ellipse cx="0" cy="0" rx="14" ry="10" fill={sungText ? "#10b981" : "white"} />
                {sungText ? (
                  <>
                    <circle cx="-5" cy="-2" r="2" fill="black" />
                    <polygon points="12,-2 20,0 12,2" fill="#fbbf24" />
                  </>
                ) : null}

                {/* Stem */}
                {NOTE_Y_MAP[currentNote] >= 110 ? (
                  <line x1="12" y1="0" x2="12" y2="-40" stroke={sungText ? "#10b981" : "white"} strokeWidth="2" />
                ) : (
                  <line x1="-12" y1="0" x2="-12" y2="40" stroke={sungText ? "#10b981" : "white"} strokeWidth="2" />
                )}
              </g>
            </svg>

            {/* Sung Syllable Popup */}
            {sungText && (
              <div 
                className="absolute left-1/2 -translate-x-1/2 animate-bounce flex items-center justify-center"
                style={{ top: '20%' }}
              >
                <div className="bg-white px-4 py-1.5 rounded-full shadow-lg border border-emerald-200">
                  <span className="text-emerald-600 font-black text-xl">🎵 {sungText}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Bird Particle EFX */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {birds.map(bird => (
            <div
              key={bird.id}
              className="absolute left-1/2 top-1/2 animate-fly flex items-center justify-center"
              style={{
                '--tx': `${bird.x}px`,
                '--ty': `${bird.y}px`,
              } as any}
            >
              <Bird color={bird.color} size={32} className="animate-flap drop-shadow-lg" />
            </div>
          ))}
        </div>
        
        {/* Keyboard Input */}
        <div className="mt-12 flex gap-1 sm:gap-2 justify-center px-2 w-full max-w-4xl mx-auto z-30">
          {['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'].map((note, idx) => (
            <button
              key={`${note}-${idx}`}
              onClick={() => handleGuess(note)}
              className="flex-1 max-w-[4rem] aspect-[3/4] sm:aspect-square rounded-xl sm:rounded-2xl bg-white/10 border-2 border-white/20 text-white font-black text-xl sm:text-2xl hover:bg-emerald-500 hover:border-emerald-400 hover:scale-110 active:scale-95 transition-all shadow-xl backdrop-blur-md flex items-center justify-center"
            >
              {note}
            </button>
          ))}
        </div>
      </div>
      
      {/* Required for the shake animation class */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
          75% { transform: translateX(-5px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        @keyframes flash {
          0%, 100% { opacity: 0; }
          10%, 30% { opacity: 0.8; }
          20% { opacity: 0.2; }
        }
        .animate-flash {
          animation: flash 0.6s ease-out forwards;
        }
        @keyframes rain {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(120vh); opacity: 0; }
        }
        .animate-rain {
          animation: rain linear infinite;
        }
        @keyframes float-firefly {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
          25% { transform: translate(15px, -20px) scale(1.3); opacity: 1; }
          50% { transform: translate(-10px, -35px) scale(0.8); opacity: 0.6; }
          75% { transform: translate(-20px, -15px) scale(1.2); opacity: 0.9; }
        }
        .animate-float-firefly {
          animation: float-firefly ease-in-out infinite;
        }
        @keyframes fly {
          0% { transform: translate(0, 0) scale(0.5); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(1.5); opacity: 0; }
        }
        .animate-fly {
          animation: fly 2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes flap {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(-15deg); }
        }
        .animate-flap {
          animation: flap 0.3s infinite;
        }
      `}</style>
    </div>
  );
};

export default ForestConcert;
