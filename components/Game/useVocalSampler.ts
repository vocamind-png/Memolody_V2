import { useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { LyricMode } from '../../types';

// This is a stub implementation for the Vocal Sampler.
// Later, it will be replaced by fetching actual mp3/wav sampler banks
// based on the selected LyricMode.
export const useVocalSampler = (lyricMode: LyricMode) => {
  const synthRef = useRef<Tone.Synth | null>(null);
  const wrongSynthRef = useRef<Tone.MembraneSynth | null>(null);
  const samplerRef = useRef<Tone.Sampler | null>(null);

  useEffect(() => {
    // Determine the correct folder based on the lyric mode
    let folder = 'american';
    if (lyricMode.includes('Ju Solfege')) folder = 'ju';
    else if (lyricMode.includes('Movable')) folder = 'movable';

    samplerRef.current = new Tone.Sampler({
      urls: {
        C4: "C4.mp3",
        D4: "D4.mp3",
        E4: "E4.mp3",
        F4: "F4.mp3",
        G4: "G4.mp3",
        A4: "A4.mp3",
        B4: "B4.mp3",
        C5: "C5.mp3"
      },
      baseUrl: `/audio/solfege/${folder}/`, 
      onload: () => {
        console.log(`[VocalSampler] Audio files for ${folder} loaded successfully!`);
      }
    }).toDestination();

    // 2. Fallback Synth (Triangle wave) just in case audio files are missing
    synthRef.current = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 1 },
      volume: 5
    }).toDestination();

    wrongSynthRef.current = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 2,
      oscillator: { type: 'square' as any },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.01, release: 1.4 },
      volume: -5
    }).toDestination();

    return () => {
      synthRef.current?.dispose();
      wrongSynthRef.current?.dispose();
      samplerRef.current?.dispose();
    };
  }, [lyricMode]);

  const getSyllable = useCallback((noteName: string) => {
    const isJu = lyricMode.includes('Ju Solfege');
    const isAmerican = lyricMode.includes('American');
    const isMovable = lyricMode.includes('Movable');
    
    // Simplified Fixed C Major mapping
    const mapJu: Record<string, string> = { 'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Ti' };
    const mapAmericanFixed: Record<string, string> = { 'C': 'C', 'D': 'D', 'E': 'E', 'F': 'F', 'G': 'G', 'A': 'A', 'B': 'B' };
    const mapAmericanMovable: Record<string, string> = { 'C': '1', 'D': '2', 'E': '3', 'F': '4', 'G': '5', 'A': '6', 'B': '7' };
    
    if (isJu) return mapJu[noteName] || noteName;
    if (isMovable && isAmerican) return mapAmericanMovable[noteName] || noteName;
    return mapAmericanFixed[noteName] || noteName;
  }, [lyricMode]);

  const playNote = useCallback((noteWithOctave: string) => {
    if (Tone.context.state !== 'running') {
      Tone.start();
    }
    
    if (samplerRef.current && samplerRef.current.loaded) {
      samplerRef.current.triggerAttackRelease(noteWithOctave, '8n');
    } else if (synthRef.current) {
      synthRef.current.triggerAttackRelease(noteWithOctave, '8n');
    }

    const noteName = noteWithOctave.replace(/\d/, '');
    const syllable = getSyllable(noteName);

    console.log(`[VocalSampler] Playing pitch ${noteWithOctave}, singing "${syllable}" (${lyricMode})`);
    
    return syllable;
  }, [getSyllable, lyricMode]);

  const playWrong = useCallback(() => {
    if (Tone.context.state !== 'running') Tone.start();
    wrongSynthRef.current?.triggerAttackRelease('C2', '8n');
  }, []);

  return { playNote, playWrong, getSyllable };
};
