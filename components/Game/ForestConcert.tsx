import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Bird, Timer, Sparkles, Gem } from 'lucide-react';
import { useVocalSampler } from './useVocalSampler';
import { LyricMode } from '../../types';
import { useForestGame, MAX_TIME, REWARDS } from './useForestGame';
import { RewardModal } from './RewardModal';

interface ForestConcertProps {
  onBack: () => void;
  bgmUrl?: string;
}

// 5 lines starting at Y=70, spacing=20
const NOTE_Y_MAP: Record<string, number> = {
  'F3': 200, // below ledger lines
  'G3': 190,
  'A3': 180,
  'B3': 170,
  'C4': 170, // ledger line below
  'D4': 160, // space below
  'E4': 150, // 1st line (bottom)
  'F4': 140, // 1st space
  'G4': 130, // 2nd line
  'A4': 120, // 2nd space
  'B4': 110, // 3rd line (middle)
  'C5': 100, // 3rd space
  'D5': 90,  // 4th line
  'E5': 80,  // 4th space
  'F5': 70,  // 5th line (top)
  'G5': 60,  // space above
  'A5': 50,  // ledger line above
};

const PIANO_KEYS = [
  { note: 'C', type: 'white' },
  { note: 'C#', type: 'black' },
  { note: 'D', type: 'white' },
  { note: 'D#', type: 'black' },
  { note: 'E', type: 'white' },
  { note: 'F', type: 'white' },
  { note: 'F#', type: 'black' },
  { note: 'G', type: 'white' },
  { note: 'G#', type: 'black' },
  { note: 'A', type: 'white' },
  { note: 'Bb', type: 'black' },
  { note: 'B', type: 'white' },
  { note: 'C', type: 'white' }
];

const ForestConcert: React.FC<ForestConcertProps> = ({ onBack, bgmUrl }) => {
  const [lyricMode] = useState<LyricMode>(() => (localStorage.getItem('memo_lyric_mode') as LyricMode) || 'Ju Solfege Fixed Doh');
  const { playNote, playWrong } = useVocalSampler(lyricMode);
  
  const {
    grade,
    score,
    combo,
    timeLeft,
    isGameOver,
    inventory,
    showRewardQueue,
    setShowRewardQueue,
    currentNote,
    startTimer,
    stopTimer,
    handleCorrect,
    handleWrong,
    restart,
    nextNote
  } = useForestGame();

  const [sungText, setSungText] = useState('');
  const [shake, setShake] = useState(false);
  const [lightning, setLightning] = useState(false);
  const [birds, setBirds] = useState<{id: number, x: number, y: number, color: string}[]>([]);
  const [showInventory, setShowInventory] = useState(false);
  
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    // Initial start
    nextNote();
    startTimer();
    return () => stopTimer();
  }, [nextNote, startTimer, stopTimer]);

  useEffect(() => {
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

  const onGuess = async (guessedBaseOrAccidental: string) => {
    if (isGameOver) return;
    
    if (!hasInteracted) {
      setHasInteracted(true);
      bgmRef.current?.play().catch(console.error);
    }
    
    if (!currentNote) return;

    // We compare against the full name without octave for complex keys, 
    // but the piano keyboard passes "C", "C#", etc.
    const noteWithoutOctave = currentNote.name.replace(/\d/, '');
    
    // For Grade 1-2 (No accidentals expected from user, so comparing baseNote is fine)
    // For Grade 3+ (Piano keys pass "C#", "Bb", etc.)
    const isCorrect = (guessedBaseOrAccidental === noteWithoutOctave) || (grade < 3 && guessedBaseOrAccidental === currentNote.baseNote);

    if (isCorrect) {
      const syllable = playNote(currentNote.name);
      setSungText(syllable);
      
      handleCorrect();
      
      // Spawn Bird EFX
      const newBirds = Array.from({length: 3}).map((_, i) => ({
        id: Date.now() + i,
        x: (Math.random() - 0.5) * 300,
        y: (Math.random() - 0.5) * 200 - 150,
        color: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'][Math.floor(Math.random() * 5)]
      }));
      setBirds(prev => [...prev, ...newBirds]);
      setTimeout(() => {
        setBirds(prev => prev.filter(b => !newBirds.includes(b)));
        setSungText('');
      }, 1000);

    } else {
      playWrong();
      handleWrong();
      
      // Visual feedback
      const thunder = new Audio('/audio/thunder.mp3');
      thunder.volume = 0.8;
      thunder.play().catch(e => console.log("Thunder audio not found or prevented"));

      setLightning(true);
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setLightning(false);
      }, 500);
    }
  };

  // Determine Background based on Grade
  const getBackground = () => {
    if (grade >= 7) return 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&auto=format&fit=crop'; // Starry night forest
    if (grade >= 4) return 'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=1200&auto=format&fit=crop'; // Golden hour / magical
    return 'https://images.unsplash.com/photo-1511497584788-876760111969?w=1200&auto=format&fit=crop'; // Morning tropical
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a1122] overflow-hidden rounded-3xl relative">
      {/* Background artwork */}
      <img 
        src={getBackground()} 
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${lightning ? 'opacity-5 blur-none' : 'opacity-40 blur-[2px]'}`}
        alt="Forest Background"
      />
      <div className={`absolute inset-0 transition-colors duration-300 ${lightning ? 'bg-slate-900/90' : 'bg-gradient-to-b from-emerald-950/80 via-transparent to-black/80'}`} />
      
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

      {/* Rewards Queue Modal */}
      {showRewardQueue && (
        <RewardModal 
          reward={showRewardQueue} 
          onClose={() => setShowRewardQueue(null)} 
        />
      )}

      {/* Header */}
      <header className="relative z-20 flex flex-col gap-4 p-6 shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition backdrop-blur-md">
            <ArrowLeft className="text-white" />
          </button>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowInventory(!showInventory)}
              className="bg-purple-500/20 px-4 py-1.5 rounded-full border border-purple-500/30 backdrop-blur-md flex items-center gap-2 hover:bg-purple-500/40 transition"
            >
              <Gem size={16} className="text-purple-300" />
              <span className="text-purple-100 font-bold text-sm">Vault ({inventory.length})</span>
            </button>
            
            <div className="bg-emerald-500/20 px-5 py-1.5 rounded-full border border-emerald-500/30 backdrop-blur-md flex items-center gap-3">
              <span className="text-emerald-300 font-black text-sm uppercase tracking-widest">
                Grade {grade}
              </span>
              <div className="w-px h-4 bg-emerald-500/50" />
              <span className="text-white font-black text-xl">{score}</span>
            </div>
          </div>
        </div>

        {/* Time Progress Bar */}
        <div className="w-full h-3 bg-black/40 rounded-full border border-white/10 overflow-hidden backdrop-blur-sm flex relative">
          <div 
            className={`h-full transition-all duration-300 ease-linear ${timeLeft < 25 ? 'bg-rose-500 animate-pulse' : 'bg-gradient-to-r from-emerald-400 to-teal-400'}`}
            style={{ width: `${(timeLeft / MAX_TIME) * 100}%` }}
          />
          <Timer size={14} className="absolute top-1/2 -translate-y-1/2 left-2 text-white/50 mix-blend-overlay" />
        </div>
      </header>

      {/* Inventory Panel */}
      {showInventory && (
        <div className="absolute inset-x-4 top-24 z-40 bg-black/80 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-top-4">
          <h3 className="text-white font-black text-lg mb-3 flex items-center gap-2">
            <Sparkles className="text-purple-400" size={18} /> Forest Vault
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {REWARDS.map(r => {
              const unlocked = inventory.includes(r.id);
              return (
                <div key={r.id} className={`shrink-0 w-20 flex flex-col items-center gap-1 ${unlocked ? 'opacity-100' : 'opacity-30 grayscale'}`}>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl border-2 ${unlocked ? 'border-purple-400/50 bg-white/10' : 'border-white/10 bg-black/50'}`}>
                    {unlocked ? r.icon : '?'}
                  </div>
                  <span className="text-[10px] text-white/80 text-center font-bold">{unlocked ? r.name : `Grade ${r.unlockedAtGrade}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {isGameOver && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in">
          <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-widest text-center">Time's Up!</h2>
          <p className="text-emerald-400 font-bold mb-8 text-lg">Final Score: {score} | Reached Grade {grade}</p>
          <button 
            onClick={restart}
            className="px-8 py-3 bg-white text-black font-black uppercase tracking-widest rounded-full hover:scale-105 active:scale-95 transition"
          >
            Play Again
          </button>
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center pb-6">
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
              
              {/* Ledger Lines */}
              {currentNote && NOTE_Y_MAP[currentNote.name] >= 170 && (
                <line x1="220" y1="170" x2="280" y2="170" stroke="rgba(255,255,255,0.8)" strokeWidth="3" strokeLinecap="round" />
              )}
              {currentNote && NOTE_Y_MAP[currentNote.name] >= 190 && (
                <line x1="220" y1="190" x2="280" y2="190" stroke="rgba(255,255,255,0.8)" strokeWidth="3" strokeLinecap="round" />
              )}

              {/* Note rendering */}
              {currentNote && (
                <g transform={`translate(250, ${NOTE_Y_MAP[currentNote.name] || 130})`} className="transition-transform duration-500 ease-out">
                  {/* Accidental Symbol */}
                  {currentNote.isAccidentalExplicit && (
                    <text x="-35" y="12" fill="white" style={{ fontSize: '40px', fontFamily: 'serif', fontWeight: 'bold' }}>
                      {currentNote.accidental === 'sharp' ? '♯' : currentNote.accidental === 'flat' ? '♭' : '♮'}
                    </text>
                  )}

                  {/* Note head */}
                  <ellipse cx="0" cy="0" rx="14" ry="10" fill={sungText ? "#10b981" : "white"} />
                  {sungText ? (
                    <>
                      <circle cx="-5" cy="-2" r="2" fill="black" />
                      <polygon points="12,-2 20,0 12,2" fill="#fbbf24" />
                    </>
                  ) : null}

                  {/* Stem */}
                  {(NOTE_Y_MAP[currentNote.name] || 130) >= 110 ? (
                    <line x1="12" y1="0" x2="12" y2="-40" stroke={sungText ? "#10b981" : "white"} strokeWidth="2" />
                  ) : (
                    <line x1="-12" y1="0" x2="-12" y2="40" stroke={sungText ? "#10b981" : "white"} strokeWidth="2" />
                  )}
                </g>
              )}
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
            
            {/* Combo Multiplier */}
            {combo > 3 && (
              <div className="absolute top-4 right-4 animate-pulse">
                <span className="text-yellow-400 font-black italic text-2xl drop-shadow-lg">{combo}x</span>
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
        
        {/* Keyboard Input - Dynamic based on level */}
        <div className="mt-8 flex justify-center px-4 w-full max-w-4xl mx-auto z-30">
          {grade < 3 ? (
            // Simple Keyboard (Naturals only)
            <div className="flex gap-2 w-full max-w-md justify-center">
              {['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'].map((note, idx) => (
                <button
                  key={`simple-${note}-${idx}`}
                  onClick={() => onGuess(note)}
                  className="flex-1 max-w-[3.5rem] aspect-[3/4] rounded-xl bg-white/10 border-2 border-white/20 text-white font-black text-xl hover:bg-emerald-500 hover:border-emerald-400 hover:scale-110 active:scale-95 transition-all shadow-xl backdrop-blur-md"
                >
                  {note}
                </button>
              ))}
            </div>
          ) : (
            // Piano Keyboard Layout (Grade 3+)
            <div className="flex relative h-32 w-full max-w-lg bg-black/20 p-2 rounded-2xl backdrop-blur-md border border-white/10">
              {PIANO_KEYS.map((key, idx) => {
                if (key.type === 'white') {
                  return (
                    <button
                      key={`piano-${idx}`}
                      onClick={() => onGuess(key.note)}
                      className="flex-1 h-full bg-white text-slate-800 font-bold text-lg rounded-b-lg border-x border-slate-300 hover:bg-emerald-200 active:bg-emerald-400 focus:outline-none flex items-end justify-center pb-2 transition-colors relative z-10"
                    >
                      {key.note}
                    </button>
                  );
                } else {
                  return (
                    <button
                      key={`piano-${idx}`}
                      onClick={() => onGuess(key.note)}
                      className="absolute top-2 w-[8%] h-20 bg-slate-900 text-white font-bold text-xs rounded-b-md shadow-xl hover:bg-emerald-600 active:bg-emerald-500 focus:outline-none flex items-end justify-center pb-2 transition-colors z-20"
                      style={{ 
                        left: `${(idx / PIANO_KEYS.length) * 100}%`,
                        transform: 'translateX(-50%)'
                      }}
                    >
                      {key.note}
                    </button>
                  );
                }
              })}
            </div>
          )}
        </div>
      </div>
      
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
