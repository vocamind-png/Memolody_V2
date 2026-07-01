import React from 'react';

// Microphone for Ballerina Cappuccina
export const Mic = () => (
  <group position={[0, 0.5, 0.5]} rotation={[-Math.PI / 8, 0, 0]} scale={0.5}>
    <mesh position={[0, 1.2, 0]}>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
    </mesh>
    <mesh position={[0, 0.5, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 1]} />
      <meshStandardMaterial color="#222222" />
    </mesh>
  </group>
);

// Guitar for Tralalero Tralala
export const Guitar = () => (
  <group position={[0.2, 0, 0.6]} rotation={[0, -Math.PI / 4, Math.PI / 6]}>
    {/* Body */}
    <mesh position={[0, -0.2, 0]}>
      <boxGeometry args={[0.8, 0.5, 0.1]} />
      <meshStandardMaterial color="#cc2222" />
    </mesh>
    {/* Neck */}
    <mesh position={[0.8, -0.2, 0]}>
      <boxGeometry args={[1.0, 0.1, 0.05]} />
      <meshStandardMaterial color="#8b5a2b" />
    </mesh>
    {/* Headstock */}
    <mesh position={[1.4, -0.2, 0]}>
      <boxGeometry args={[0.2, 0.15, 0.05]} />
      <meshStandardMaterial color="#222222" />
    </mesh>
  </group>
);

// Bass for Bombardino Crocodilo (Longer neck, different color)
export const Bass = () => (
  <group position={[0.2, 0, 0.6]} rotation={[0, -Math.PI / 4, Math.PI / 8]}>
    {/* Body */}
    <mesh position={[0, -0.2, 0]}>
      <boxGeometry args={[0.9, 0.4, 0.1]} />
      <meshStandardMaterial color="#2222cc" />
    </mesh>
    {/* Neck (longer than guitar) */}
    <mesh position={[0.95, -0.2, 0]}>
      <boxGeometry args={[1.2, 0.1, 0.05]} />
      <meshStandardMaterial color="#6b4a1b" />
    </mesh>
    {/* Headstock */}
    <mesh position={[1.65, -0.2, 0]}>
      <boxGeometry args={[0.2, 0.15, 0.05]} />
      <meshStandardMaterial color="#222222" />
    </mesh>
  </group>
);

// Keyboard for Trippi Troppi
export const Keyboard = () => (
  <group position={[0, 0.2, 1.0]}>
    {/* Stand */}
    <mesh position={[-0.4, -0.6, 0]} rotation={[0, 0, Math.PI / 8]}>
      <cylinderGeometry args={[0.03, 0.03, 1.5]} />
      <meshStandardMaterial color="#333333" />
    </mesh>
    <mesh position={[0.4, -0.6, 0]} rotation={[0, 0, -Math.PI / 8]}>
      <cylinderGeometry args={[0.03, 0.03, 1.5]} />
      <meshStandardMaterial color="#333333" />
    </mesh>
    {/* Keyboard Body */}
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 8, 0, 0]}>
      <boxGeometry args={[1.8, 0.1, 0.4]} />
      <meshStandardMaterial color="#111111" />
    </mesh>
    {/* White Keys */}
    <mesh position={[0, 0.06, 0.05]} rotation={[-Math.PI / 8, 0, 0]}>
      <boxGeometry args={[1.7, 0.02, 0.2]} />
      <meshStandardMaterial color="#ffffff" />
    </mesh>
  </group>
);

// DrumKit for Tung Tung Tung Sahur
export const DrumKit = () => (
  <group position={[0, 0, 0.8]}>
    {/* Bass Drum */}
    <mesh position={[0, 0.5, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.6, 0.6, 0.5, 32]} />
      <meshStandardMaterial color="#222222" />
    </mesh>
    <mesh position={[0, 0.5, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.61, 0.61, 0.4, 32]} />
      <meshStandardMaterial color="#aaaaaa" />
    </mesh>
    
    {/* Snare */}
    <mesh position={[-0.7, 0.8, 0.3]} rotation={[0.1, 0, 0]}>
      <cylinderGeometry args={[0.3, 0.3, 0.2, 32]} />
      <meshStandardMaterial color="#dddddd" />
    </mesh>
    <mesh position={[-0.7, 0.3, 0.3]}>
      <cylinderGeometry args={[0.02, 0.02, 0.8]} />
      <meshStandardMaterial color="#888888" />
    </mesh>

    {/* Tom 1 */}
    <mesh position={[-0.3, 1.1, -0.2]} rotation={[0.2, 0, -0.1]}>
      <cylinderGeometry args={[0.25, 0.25, 0.3, 32]} />
      <meshStandardMaterial color="#cc2222" />
    </mesh>

    {/* Tom 2 */}
    <mesh position={[0.3, 1.1, -0.2]} rotation={[0.2, 0, 0.1]}>
      <cylinderGeometry args={[0.25, 0.25, 0.3, 32]} />
      <meshStandardMaterial color="#cc2222" />
    </mesh>

    {/* Cymbal */}
    <mesh position={[0.8, 1.4, 0.1]} rotation={[0.2, 0.1, -0.2]}>
      <cylinderGeometry args={[0.4, 0.4, 0.01, 32]} />
      <meshStandardMaterial color="#ffd700" metalness={1} roughness={0.1} />
    </mesh>
    <mesh position={[0.8, 0.6, 0.1]}>
      <cylinderGeometry args={[0.02, 0.02, 1.5]} />
      <meshStandardMaterial color="#888888" />
    </mesh>
  </group>
);
