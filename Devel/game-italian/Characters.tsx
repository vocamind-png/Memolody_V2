import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';

interface CharacterProps {
  isPlaying: boolean;
  bpm: number;
  children?: React.ReactNode;
}

// 1. Bamboo (Tung Tung Tung Sahur - Drummer)
export const Bamboo: React.FC<CharacterProps> = ({ isPlaying, bpm, children }) => {
  const groupRef = useRef<Group>(null);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    const beat = (time / (60 / bpm)) * Math.PI * 2;
    // Bop up and down
    groupRef.current.position.y = isPlaying ? Math.abs(Math.sin(beat)) * 0.2 : 0;
    // Slight rocking
    groupRef.current.rotation.z = isPlaying ? Math.sin(beat * 0.5) * 0.1 : 0;
  });

  return (
    <group ref={groupRef}>
      {/* Bamboo Segments */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
        <meshStandardMaterial color="#22c55e" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.8, 16]} />
        <meshStandardMaterial color="#4ade80" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.8, 16]} />
        <meshStandardMaterial color="#22c55e" roughness={0.7} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.1, 2.5, 0.25]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0.1, 2.5, 0.25]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      {/* Arms (holding drums) */}
      <mesh position={[-0.4, 1.4, 0.2]} rotation={[Math.PI / 4, 0, Math.PI / 8]}>
        <cylinderGeometry args={[0.05, 0.05, 0.6]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
      <mesh position={[0.4, 1.4, 0.2]} rotation={[Math.PI / 4, 0, -Math.PI / 8]}>
        <cylinderGeometry args={[0.05, 0.05, 0.6]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
      {/* Instrument Slot */}
      <group position={[0, 0, 0]}>
        {children}
      </group>
    </group>
  );
};

// 2. Coffee Cup (Ballerina Cappuccina - Singer)
export const CoffeeCup: React.FC<CharacterProps> = ({ isPlaying, bpm, children }) => {
  const groupRef = useRef<Group>(null);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    const beat = (time / (60 / bpm)) * Math.PI * 2;
    // Singer sways smoothly
    groupRef.current.rotation.y = isPlaying ? Math.sin(beat * 0.5) * 0.5 : 0;
    groupRef.current.position.y = isPlaying ? Math.sin(beat) * 0.1 : 0;
  });

  return (
    <group ref={groupRef}>
      {/* Cup Body */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.6, 0.4, 1.2, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      {/* Coffee Inside */}
      <mesh position={[0, 1.41, 0]}>
        <cylinderGeometry args={[0.58, 0.58, 0.01, 32]} />
        <meshStandardMaterial color="#3e2723" roughness={0.9} />
      </mesh>
      {/* Handle */}
      <mesh position={[0.6, 0.8, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <torusGeometry args={[0.3, 0.08, 16, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Face (drawn on cup) */}
      <mesh position={[-0.2, 0.9, 0.57]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0.2, 0.9, 0.57]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0, 0.7, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.02, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#ffaaaa" />
      </mesh>
      {/* Instrument Slot (Mic) */}
      <group position={[0, 0, 0.2]}>
        {children}
      </group>
    </group>
  );
};

// 3. Shark (Tralalero Tralala - Guitarist)
export const Shark: React.FC<CharacterProps> = ({ isPlaying, bpm, children }) => {
  const groupRef = useRef<Group>(null);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    const beat = (time / (60 / bpm)) * Math.PI * 2;
    // Aggressive rocking
    groupRef.current.position.y = isPlaying ? Math.abs(Math.sin(beat)) * 0.3 : 0;
    groupRef.current.rotation.x = isPlaying ? Math.sin(beat) * 0.2 : 0;
  });

  return (
    <group ref={groupRef}>
      {/* Shark Body (Cone/Capsule) */}
      <mesh position={[0, 1.2, 0]}>
        <capsuleGeometry args={[0.6, 1.5, 16, 32]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.4} />
      </mesh>
      {/* Dorsal Fin */}
      <mesh position={[0, 1.5, -0.6]} rotation={[Math.PI / 8, 0, 0]}>
        <coneGeometry args={[0.2, 0.8, 4]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
      {/* Side Fins */}
      <mesh position={[-0.6, 0.8, 0]} rotation={[0, 0, Math.PI / 4]}>
        <coneGeometry args={[0.15, 0.6, 4]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0.6, 0.8, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <coneGeometry args={[0.15, 0.6, 4]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.3, 1.8, 0.5]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0.3, 1.8, 0.5]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      {/* Mouth */}
      <mesh position={[0, 1.4, 0.58]} rotation={[Math.PI / 8, 0, 0]}>
        <boxGeometry args={[0.6, 0.1, 0.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Instrument Slot (Guitar) */}
      <group position={[0, 0.8, 0.4]}>
        {children}
      </group>
    </group>
  );
};

// 4. Raccoon (Trippi Troppi - Keyboardist)
export const Raccoon: React.FC<CharacterProps> = ({ isPlaying, bpm, children }) => {
  const groupRef = useRef<Group>(null);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    const beat = (time / (60 / bpm)) * Math.PI * 2;
    // Bouncing while playing keys
    groupRef.current.position.y = isPlaying ? Math.abs(Math.sin(beat * 2)) * 0.15 : 0;
  });

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 1.0, 16]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      {/* Mask */}
      <mesh position={[0, 1.65, 0.35]}>
        <boxGeometry args={[0.8, 0.25, 0.2]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Eyes (White dots in mask) */}
      <mesh position={[-0.2, 1.65, 0.46]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.2, 1.65, 0.46]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Ears */}
      <mesh position={[-0.3, 2.0, 0]}>
        <coneGeometry args={[0.1, 0.25, 4]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <mesh position={[0.3, 2.0, 0]}>
        <coneGeometry args={[0.1, 0.25, 4]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      {/* Tail */}
      <mesh position={[0, 0.5, -0.6]} rotation={[-Math.PI / 4, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.8, 16]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.6, 1.0, 0.3]} rotation={[Math.PI / 2, 0, Math.PI / 8]}>
        <cylinderGeometry args={[0.08, 0.08, 0.6]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      <mesh position={[0.6, 1.0, 0.3]} rotation={[Math.PI / 2, 0, -Math.PI / 8]}>
        <cylinderGeometry args={[0.08, 0.08, 0.6]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      {/* Instrument Slot (Keyboard) */}
      <group position={[0, 0, 0]}>
        {children}
      </group>
    </group>
  );
};

// 5. Crocodile Airplane (Bombardino Crocodilo - Bassist)
export const CrocodilePlane: React.FC<CharacterProps> = ({ isPlaying, bpm, children }) => {
  const groupRef = useRef<Group>(null);
  const propRef = useRef<Group>(null);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    const beat = (time / (60 / bpm)) * Math.PI * 2;
    // Flying hovering effect
    groupRef.current.position.y = Math.sin(time * 2) * 0.2;
    // Dip to the beat
    groupRef.current.rotation.z = isPlaying ? Math.sin(beat) * 0.15 : 0;
    
    // Spin propeller
    if (propRef.current) {
      propRef.current.rotation.z += isPlaying ? 0.5 : 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Fuselage / Body */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[1.0, 0.8, 2.0]} />
        <meshStandardMaterial color="#065f46" />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.9, 1.2]}>
        <boxGeometry args={[0.8, 0.4, 0.8]} />
        <meshStandardMaterial color="#047857" />
      </mesh>
      {/* Teeth */}
      <mesh position={[0, 0.65, 1.2]}>
        <boxGeometry args={[0.82, 0.1, 0.7]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.4, 1.4, 0.8]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[0.4, 1.4, 0.8]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
      {/* Wings */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[3.0, 0.1, 0.8]} />
        <meshStandardMaterial color="#064e3b" />
      </mesh>
      {/* Tail Fin */}
      <mesh position={[0, 1.6, -0.8]}>
        <boxGeometry args={[0.1, 0.6, 0.6]} />
        <meshStandardMaterial color="#064e3b" />
      </mesh>
      {/* Propeller */}
      <group ref={propRef} position={[0, 0.9, 1.65]}>
        <mesh>
          <boxGeometry args={[0.1, 1.2, 0.05]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
        <mesh>
          <boxGeometry args={[1.2, 0.1, 0.05]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      </group>
      {/* Instrument Slot (Bass) */}
      <group position={[0, -0.2, 1.2]}>
        {children}
      </group>
    </group>
  );
};
