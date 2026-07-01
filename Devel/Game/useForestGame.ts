import { useState, useEffect, useCallback, useRef } from 'react';

export type NoteAccidental = 'natural' | 'sharp' | 'flat';

export interface GameNote {
  name: string; // e.g. "C4", "F#4", "Bb4"
  baseNote: string; // e.g. "C", "F", "B"
  octave: number; // e.g. 4
  accidental: NoteAccidental;
  isAccidentalExplicit: boolean; // if true, draw the symbol next to the note
}

export interface RewardItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlockedAtGrade: number;
}

export const REWARDS: RewardItem[] = [
  { id: 'seed_1', name: 'Morning Seed', icon: '🌱', description: 'A seed that glows with morning dew.', unlockedAtGrade: 2 },
  { id: 'feather_1', name: 'Bluejay Feather', icon: '🪶', description: 'Found near a sparkling stream.', unlockedAtGrade: 3 },
  { id: 'gem_1', name: 'Sunset Ruby', icon: '💎', description: 'Radiates the warmth of the evening sun.', unlockedAtGrade: 4 },
  { id: 'bird_1', name: 'Golden Owl', icon: '🦉', description: 'A wise companion for the night.', unlockedAtGrade: 5 },
  { id: 'flower_1', name: 'Moon Lily', icon: '🌸', description: 'Blooms only under starlight.', unlockedAtGrade: 6 },
  { id: 'star_1', name: 'Fallen Star', icon: '⭐', description: 'A piece of the cosmos.', unlockedAtGrade: 7 },
  { id: 'key_1', name: 'Treble Key', icon: '🗝️', description: 'Unlocks the deepest secrets of the forest.', unlockedAtGrade: 8 },
  { id: 'crown_1', name: 'Virtuoso Crown', icon: '👑', description: 'For the true master of the forest.', unlockedAtGrade: 9 },
];

export const MAX_TIME = 100;

export const useForestGame = () => {
  const [grade, setGrade] = useState(1);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MAX_TIME);
  const [isGameOver, setIsGameOver] = useState(false);
  const [inventory, setInventory] = useState<string[]>([]);
  const [showRewardQueue, setShowRewardQueue] = useState<RewardItem | null>(null);
  const [currentNote, setCurrentNote] = useState<GameNote | null>(null);

  // Timer reference
  const timerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    isPlayingRef.current = true;
    
    // Timer speed depends on grade
    // Grade 1 is very slow, Grade 9 is very fast
    const tickRate = Math.max(20, 100 - (grade * 8)); 
    
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsGameOver(true);
          isPlayingRef.current = false;
          return 0;
        }
        return next;
      });
    }, tickRate);
  }, [grade]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  const generateNote = useCallback((currentGrade: number): GameNote => {
    // Basic Grade 1 notes
    let notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    
    if (currentGrade >= 2) {
      notes = ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'];
    }
    
    if (currentGrade >= 3) {
      // Add simple accidentals
      notes.push('F#4', 'Bb4', 'C#4', 'Eb4');
    }
    
    if (currentGrade >= 5) {
      // More complex
      notes.push('G#4', 'Ab4', 'Db4', 'D#4');
    }

    if (currentGrade >= 7) {
      // High/Low extremes
      notes.push('F3', 'E3', 'G5', 'A5');
    }

    const randomPick = notes[Math.floor(Math.random() * notes.length)];
    const match = randomPick.match(/([A-G])([#b]?)(-?\d)/);
    
    if (match) {
      const baseNote = match[1];
      const accidentalStr = match[2];
      const octave = parseInt(match[3], 10);
      
      let accidental: NoteAccidental = 'natural';
      if (accidentalStr === '#') accidental = 'sharp';
      if (accidentalStr === 'b') accidental = 'flat';

      return {
        name: randomPick,
        baseNote,
        octave,
        accidental,
        isAccidentalExplicit: accidental !== 'natural', // Simplification for now
      };
    }
    
    return { name: 'C4', baseNote: 'C', octave: 4, accidental: 'natural', isAccidentalExplicit: false };
  }, []);

  const nextNote = useCallback(() => {
    setCurrentNote(generateNote(grade));
  }, [grade, generateNote]);

  const handleCorrect = useCallback(() => {
    const newScore = score + 1;
    const newCombo = combo + 1;
    setScore(newScore);
    setCombo(newCombo);
    
    // Add time bonus
    const timeBonus = Math.max(5, 20 - grade);
    setTimeLeft(prev => Math.min(MAX_TIME, prev + timeBonus));
    
    // Check level up condition
    // E.g. Grade up every 15 points
    const nextGradeTarget = grade * 15;
    if (newScore >= nextGradeTarget && grade < 9) {
      const newGrade = grade + 1;
      setGrade(newGrade);
      
      // Check for rewards
      const newReward = REWARDS.find(r => r.unlockedAtGrade === newGrade);
      if (newReward && !inventory.includes(newReward.id)) {
        setInventory(prev => [...prev, newReward.id]);
        setShowRewardQueue(newReward);
      }
    }
    
    nextNote();
  }, [score, combo, grade, inventory, nextNote]);

  const handleWrong = useCallback(() => {
    setCombo(0);
    // Penalty
    setTimeLeft(prev => Math.max(0, prev - 15));
  }, []);

  const restart = useCallback(() => {
    setScore(0);
    setCombo(0);
    setGrade(1);
    setTimeLeft(MAX_TIME);
    setIsGameOver(false);
    nextNote();
    startTimer();
  }, [nextNote, startTimer]);

  const changeGrade = useCallback((newGrade: number) => {
    setGrade(newGrade);
    setScore((newGrade - 1) * 15); // Set score to the base of that grade
    setCombo(0);
    setTimeLeft(MAX_TIME);
    setIsGameOver(false);
    // Note: We need to use newGrade directly here because nextNote uses state 'grade' which hasn't updated yet
    setCurrentNote(generateNote(newGrade));
    startTimer();
  }, [generateNote, startTimer]);

  useEffect(() => {
    // Load inventory from local storage
    const saved = localStorage.getItem('forest_inventory');
    if (saved) {
      try {
        setInventory(JSON.parse(saved));
      } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('forest_inventory', JSON.stringify(inventory));
  }, [inventory]);

  return {
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
    changeGrade,
    nextNote
  };
};
