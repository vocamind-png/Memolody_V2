import React, { useRef } from 'react';
import { Group } from 'three';
import { Mic, Guitar, Bass, Keyboard, DrumKit } from './Instruments';
import { Bamboo, CoffeeCup, Shark, Raccoon, CrocodilePlane } from './Characters';

export type InstrumentType = 'mic' | 'guitar' | 'bass' | 'keyboard' | 'drums';

interface BandMemberProps {
  isPlaying: boolean;
  bpm: number;
  position: [number, number, number];
  scale?: number;
  tintColor?: string; // Kept for backwards compatibility but not used by geometry characters
  delayOffset?: number; 
  instrument?: InstrumentType;
  name?: string;
}

export const BandMember: React.FC<BandMemberProps> = ({ 
  isPlaying, 
  bpm, 
  position, 
  scale = 1,
  instrument,
  name
}) => {
  const groupRef = useRef<Group>(null);

  // Determine which instrument to render
  const renderInstrument = () => {
    switch (instrument) {
      case 'mic': return <Mic />;
      case 'guitar': return <Guitar />;
      case 'bass': return <Bass />;
      case 'keyboard': return <Keyboard />;
      case 'drums': return <DrumKit />;
      default: return null;
    }
  };

  // Determine which character to render
  const renderCharacter = () => {
    switch (name) {
      case 'Tung Tung Tung Sahur': 
        return <Bamboo isPlaying={isPlaying} bpm={bpm}>{renderInstrument()}</Bamboo>;
      case 'Ballerina Cappuccina': 
        return <CoffeeCup isPlaying={isPlaying} bpm={bpm}>{renderInstrument()}</CoffeeCup>;
      case 'Tralalero Tralala': 
        return <Shark isPlaying={isPlaying} bpm={bpm}>{renderInstrument()}</Shark>;
      case 'Trippi Troppi': 
        return <Raccoon isPlaying={isPlaying} bpm={bpm}>{renderInstrument()}</Raccoon>;
      case 'Bombardino Crocodilo': 
        return <CrocodilePlane isPlaying={isPlaying} bpm={bpm}>{renderInstrument()}</CrocodilePlane>;
      default: 
        return <Bamboo isPlaying={isPlaying} bpm={bpm}>{renderInstrument()}</Bamboo>; // Fallback
    }
  };

  return (
    <group ref={groupRef} position={position} scale={[scale, scale, scale]}>
      {renderCharacter()}
    </group>
  );
};
