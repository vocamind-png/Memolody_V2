import React, { useState, useEffect, useCallback } from 'react';
import { LEVELS, LevelDefinition, RhythmSequence } from './levels';
import { Scene3D } from './Scene3D';
import { VFXOverlay, VFXType } from './VFXOverlay';
import { AudioManager } from './AudioManager';

interface GameEngineProps {
  onBack?: () => void;
}

export const GameEngine: React.FC<GameEngineProps> = ({ onBack }) => {
  const [currentLevel, setCurrentLevel] = useState<LevelDefinition | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bpm, setBpm] = useState(120);
  
  // To pass VFX events to the overlay
  const [lastVFXEvent, setLastVFXEvent] = useState<{ type: VFXType; timestamp: number } | null>(null);

  const startGame = async (level: LevelDefinition) => {
    setCurrentLevel(level);
    setScore(0);
    setCombo(0);
    setBpm(level.sequences[0].bpm);
    setIsPlaying(true);
    
    // Initialize audio (must be done after user interaction)
    await AudioManager.getInstance().init();
  };

  const triggerVFX = (type: VFXType) => {
    setLastVFXEvent({ type, timestamp: Date.now() });
  };

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (!isPlaying) return;
    
    if (e.code === 'Space') {
      // Very basic rhythm logic for MVP
      // In a real game, you would compare Date.now() to expected beat times.
      // For now, randomly simulate hit or miss to demonstrate features.
      const hitSuccess = Math.random() > 0.3; // 70% chance to hit for demo

      if (hitSuccess) {
        setScore(s => s + 100);
        setCombo(c => {
          const newCombo = c + 1;
          if (newCombo % 5 === 0) {
            triggerVFX('cheer');
            AudioManager.getInstance().playSuccessCheer();
          } else {
            triggerVFX('perfect');
          }
          return newCombo;
        });
      } else {
        setCombo(0);
        const mistakeType = Math.random() > 0.5 ? 'oops' : 'help';
        triggerVFX(mistakeType);
        AudioManager.getInstance().playMistakeComedySound();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  if (!currentLevel) {
    return (
      <div 
        className="relative flex flex-col items-center justify-center h-full min-h-screen text-white font-sans bg-cover bg-center"
        style={{ backgroundImage: 'url("/images/brainrot/movie_poster.png")', backgroundColor: '#111' }}
      >
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black bg-opacity-60 z-0"></div>
        
        <div className="z-10 flex flex-col items-center justify-center w-full">
          <h1 className="text-6xl md:text-7xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-white to-green-500 uppercase tracking-widest drop-shadow-[0_5px_5px_rgba(0,0,0,1)] text-center px-4">
            Italian Brainrot Music
          </h1>
          <h2 className="text-3xl mb-8 font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">Select a Grade</h2>
          <div className="grid gap-4 w-full max-w-md px-4">
            {LEVELS.map(level => (
              <button
                key={level.id}
                onClick={() => startGame(level)}
                className="p-4 bg-gray-900 bg-opacity-80 hover:bg-opacity-100 hover:bg-gray-800 border-2 border-red-500 rounded-2xl text-xl font-bold flex justify-between items-center transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,0,0,0.5)] backdrop-blur-sm"
              >
                <span className="drop-shadow-md">{level.grade}</span>
                <span className="text-green-400 drop-shadow-md">{level.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-screen bg-black overflow-hidden select-none">
      {/* 3D Scene Background */}
      <Scene3D isPlaying={isPlaying} bpm={bpm} characterImage={currentLevel.characterImage} />

      {/* VFX Overlay Layer */}
      <VFXOverlay lastEvent={lastVFXEvent} />

      {/* HUD Layer */}
      <div className="absolute top-0 left-0 w-full p-6 z-20 flex justify-between items-start pointer-events-none">
        <div>
          <h2 className="text-3xl font-black text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
            Score: <span className="text-yellow-400">{score}</span>
          </h2>
          <h3 className="text-2xl font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)] mt-2">
            Combo: <span className="text-red-400">{combo}x</span>
          </h3>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
            {currentLevel.grade}
          </h2>
          <p className="text-xl text-green-400 drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
            {currentLevel.name}
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none text-center">
        <p className="text-white text-2xl font-bold animate-pulse drop-shadow-md">
          Press [SPACE] to hit the rhythm!
        </p>
      </div>
      
      {/* Back Button */}
      <button 
        onClick={() => {
          setIsPlaying(false);
          setCurrentLevel(null);
          if (onBack) onBack();
        }}
        className="absolute top-6 left-1/2 transform -translate-x-1/2 z-30 px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full border-2 border-white transition-all shadow-lg hover:scale-105"
      >
        Quit Game
      </button>
    </div>
  );
};
