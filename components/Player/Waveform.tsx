

import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

const Waveform: React.FC<WaveformProps> = ({ isPlaying, currentTime, duration }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<number[]>([]);

  useEffect(() => {
    dataRef.current = Array.from({ length: 150 }, () => Math.random() * 0.8 + 0.2);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = 4;
      const gap = 2;
      const progress = currentTime / duration || 0;

      dataRef.current.forEach((val, i) => {
        const x = i * (barWidth + gap);
        const height = val * canvas.height * 0.8;
        const y = (canvas.height - height) / 2;

        const isPlayed = (x / canvas.width) < progress;
        
        ctx.fillStyle = isPlayed ? '#6366f1' : '#27272a';
        
        // Use standard fillRect for maximum compatibility (prevents Aw Snap on older browsers)
        ctx.fillRect(x, y, barWidth, height);
      });

      if (isPlaying) {
        requestAnimationFrame(draw);
      }
    };

    draw();
  }, [isPlaying, currentTime, duration]);

  return (
    <div className="w-full h-32 bg-black/40 rounded-2xl border border-white/5 relative overflow-hidden">
      <canvas 
        ref={canvasRef} 
        width={900} 
        height={128} 
        className="w-full h-full"
      />
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_15px_white] z-10"
        style={{ left: `${(currentTime / duration) * 100}%`, transition: 'left 0.1s linear' }}
      />
    </div>
  );
};

export default Waveform;