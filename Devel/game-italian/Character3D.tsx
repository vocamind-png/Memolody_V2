import React, { useRef, useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { Group } from 'three';

interface Character3DProps {
  isPlaying: boolean;
  bpm: number;
  imageUrl?: string; // Kept for compatibility with Scene3D, but ignored for 3D model
}

export const Character3D: React.FC<Character3DProps> = ({ isPlaying, bpm }) => {
  const group = useRef<Group>(null);
  // Load the Robot model with baked animations
  const { scene, animations } = useGLTF('/RobotExpressive.glb');
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    const danceAction = actions['Dance'];
    const idleAction = actions['Idle'];

    if (danceAction && idleAction) {
      if (isPlaying) {
        idleAction.fadeOut(0.2);
        danceAction.reset().fadeIn(0.2).play();
        
        // Adjust the speed of the dance animation based on the BPM
        // Assuming the base animation was designed around 100 BPM
        danceAction.setEffectiveTimeScale(bpm / 100);
      } else {
        danceAction.fadeOut(0.2);
        idleAction.reset().fadeIn(0.2).play();
      }
    }
  }, [isPlaying, bpm, actions]);

  // Fix materials if they are dark (sometimes GLTF loads dark)
  useEffect(() => {
    scene.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <group ref={group} position={[0, -2.5, 0]} scale={[1, 1, 1]}>
      {/* 
        We use primitive to inject the loaded GLTF scene directly into our React component tree.
        The bones and hierarchy are handled automatically by Three.js.
      */}
      <primitive object={scene} />
    </group>
  );
};

// Preload the model so it's ready before the component mounts
useGLTF.preload('/RobotExpressive.glb');
