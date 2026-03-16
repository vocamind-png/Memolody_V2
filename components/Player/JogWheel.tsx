

import React, { useState, useRef, useEffect } from 'react';
import { Disc3 } from 'lucide-react';

interface JogWheelProps {
  isPlaying: boolean;
  onSeek: (percent: number) => void;
}

const JogWheel: React.FC<JogWheelProps> = ({ isPlaying, onSeek }) => {
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);

  useEffect(() => {
    let animId: number;
    if (isPlaying && !isDragging) {
      const step = () => {
        rotationRef.current = (rotationRef.current + 1.5) % 360;
        setRotation(rotationRef.current);
        animId = requestAnimationFrame(step);
      };
      animId = requestAnimationFrame(step);
    }
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isDragging]);

  const handleInteraction = (clientX: number, clientY: number) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    setRotation(angle);
    rotationRef.current = angle;
    onSeek((angle + 180) / 360);
  };

  const onStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    if ('touches' in e) handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      handleInteraction(clientX, clientY);
    };
    const onEnd = () => setIsDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging]);

  return (
    <div 
      ref={wheelRef}
      onMouseDown={onStart}
      onTouchStart={onStart}
      className="relative w-44 h-44 md:w-56 md:h-56 bg-zinc-900 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-2xl border-[6px] md:border-[10px] border-[#18181b] touch-none"
    >
      <div 
        className="w-full h-full relative" 
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <Disc3 className="w-full h-full text-zinc-800 opacity-80" />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 md:w-4 md:h-4 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.8)] border-2 border-white"></div>
      </div>
      <div className="absolute w-16 h-16 md:w-20 md:h-20 bg-[#18181b] rounded-full border-4 border-zinc-800 flex items-center justify-center z-20 shadow-xl">
        <div className="w-5 h-5 bg-zinc-900 rounded-full border-2 border-zinc-800"></div>
      </div>
    </div>
  );
};

export default JogWheel;