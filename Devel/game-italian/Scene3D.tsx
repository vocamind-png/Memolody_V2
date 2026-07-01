import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Image } from '@react-three/drei';
import { BandMember } from './BandMember';
import { Crowd } from './Crowd';

interface Scene3DProps {
  isPlaying: boolean;
  bpm: number;
  characterImage: string;
}

export const Scene3D: React.FC<Scene3DProps> = ({ isPlaying, bpm, characterImage }) => {
  return (
    <div className="w-full h-full absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 2, 12], fov: 50 }}>
        <React.Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[0, 10, 5]} intensity={1.5} castShadow />
          
          {/* Stage Lasers / Spotlights */}
          <spotLight position={[-15, 10, -5]} angle={0.3} penumbra={1} intensity={5} color="#ff0055" castShadow />
          <spotLight position={[15, 10, -5]} angle={0.3} penumbra={1} intensity={5} color="#00ffff" castShadow />
          <spotLight position={[0, 15, -10]} angle={0.5} penumbra={0.5} intensity={4} color="#ffcc00" castShadow />

          {/* Concert Stage Background */}
          <Image 
            url="/images/brainrot/stage_bg.png" 
            position={[0, 8, -20]} 
            scale={[60, 40]} 
            transparent={false}
          />

          {/* Environment */}
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={1} fade speed={isPlaying ? 3 : 1} />
          
          {/* The Band */}
          {/* Singer: Ballerina Cappuccina (Coffee Cup - Brown/White) */}
          <BandMember isPlaying={isPlaying} bpm={bpm} position={[0, -2, 2]} scale={0.8} tintColor="#cda37f" name="Ballerina Cappuccina" instrument="mic" />
          
          {/* Guitarist: Tralalero Tralala (Shark - Blue/Grey) */}
          <BandMember isPlaying={isPlaying} bpm={bpm} position={[-3, -1.5, 0]} scale={0.7} tintColor="#3b82f6" delayOffset={0.2} name="Tralalero Tralala" instrument="guitar" />
          
          {/* Bassist: Bombardino Crocodilo (Crocodile - Dark Green) */}
          <BandMember isPlaying={isPlaying} bpm={bpm} position={[3, -1.5, 0]} scale={0.7} tintColor="#064e3b" delayOffset={0.4} name="Bombardino Crocodilo" instrument="bass" />
          
          {/* Keyboardist: Trippi Troppi (Raccoon - Dark Grey) */}
          <BandMember isPlaying={isPlaying} bpm={bpm} position={[4, 2, -3]} scale={0.6} tintColor="#4b5563" delayOffset={0.5} name="Trippi Troppi" instrument="keyboard" />

          {/* Drummer: Tung Tung Tung Sahur (Bamboo - Neon Green) */}
          <BandMember isPlaying={isPlaying} bpm={bpm} position={[0, -1, -3]} scale={0.9} tintColor="#22c55e" delayOffset={0.6} name="Tung Tung Tung Sahur" instrument="drums" />

          {/* The Audience */}
          <Crowd isPlaying={isPlaying} bpm={bpm} count={400} />

          {/* Controls */}
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            maxPolarAngle={Math.PI / 2 + 0.1} 
            minPolarAngle={Math.PI / 3}
          />
        </React.Suspense>
      </Canvas>
    </div>
  );
};
