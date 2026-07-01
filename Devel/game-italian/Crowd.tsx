import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D, Color } from 'three';

interface CrowdProps {
  isPlaying: boolean;
  bpm: number;
  count?: number;
}

const colors = ['#ff0055', '#00ffaa', '#5500ff', '#ffff00', '#00aaff'];

export const Crowd: React.FC<CrowdProps> = ({ isPlaying, bpm, count = 300 }) => {
  const meshRef = useRef<InstancedMesh>(null);
  
  // Create a dummy object to compute matrix transformations
  const dummy = useMemo(() => new Object3D(), []);

  // Pre-calculate random properties for each crowd member
  const crowdData = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      position: [
        (Math.random() - 0.5) * 35, // Spread across X
        -5.5 + Math.random() * 1.0, // Y height (moved down to not block text)
        0 + Math.random() * 6       // Z depth (moved back slightly)
      ],
      color: new Color(colors[Math.floor(Math.random() * colors.length)]),
      phaseOffset: Math.random() * Math.PI, // Random jump timing offset
      jumpHeight: 0.3 + Math.random() * 0.7, // Lower jump height
    }));
  }, [count]);

  // Set colors once on mount
  React.useEffect(() => {
    if (meshRef.current) {
      crowdData.forEach((data, i) => {
        meshRef.current!.setColorAt(i, data.color);
      });
      meshRef.current.instanceColor!.needsUpdate = true;
    }
  }, [crowdData]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    const beatDuration = 60.0 / bpm;
    // Base phase synced to beat
    const beatPhase = (time / beatDuration) * Math.PI * 2.0;

    crowdData.forEach((data, i) => {
      let y = data.position[1];
      
      if (isPlaying) {
        // Calculate individual jump
        // Using abs(sin) makes them bounce up on every beat
        const jump = Math.abs(Math.sin(beatPhase + (data.phaseOffset * 0.2))) * data.jumpHeight;
        y += jump;
      } else {
        // Just idle sway when not playing
        y += Math.sin(time * 2 + data.phaseOffset) * 0.1;
      }

      dummy.position.set(data.position[0], y, data.position[2]);
      
      // Look at camera occasionally or just face forward
      dummy.rotation.y = Math.sin(time + data.phaseOffset) * 0.2;
      
      // Slight scale pulse
      const scale = 1.0 + (isPlaying ? Math.sin(beatPhase) * 0.1 : 0);
      dummy.scale.set(scale, scale, scale);

      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow receiveShadow>
      {/* We use a simple capsule or sphere to represent glowing crowd members/light sticks */}
      <sphereGeometry args={[0.3, 8, 8]} />
      <meshStandardMaterial 
        roughness={0.2} 
        metalness={0.8}
        emissive="#111111"
        emissiveIntensity={0.5}
      />
    </instancedMesh>
  );
};
