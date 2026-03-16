import React, { useEffect, useRef } from 'react';
import { musicEngine } from '../../lib/MusicEngine';

interface LEDMeterProps {
  trackId: string;
}

const LEDMeter: React.FC<LEDMeterProps> = ({ trackId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(null);

  useEffect(() => {
    const update = () => {
      const level = musicEngine.getTrackLevel(trackId);
      const bars = containerRef.current?.children;
      if (bars) {
        for (let i = 0; i < bars.length; i++) {
          const threshold = (bars.length - i) / bars.length;
          const bar = bars[i] as HTMLElement;
          // Dynamically adjust bar styling based on level
          if (level >= threshold) {
            // First bar (top) for clipping, then amber for peaks, then emerald for normal
            if (i < 1) bar.className = 'w-1 h-0.5 rounded-[0.2px] bg-red-500 shadow-[0_0_5px_#ef4444]';
            else if (i < 3) bar.className = 'w-1 h-0.5 rounded-[0.2px] bg-amber-400 shadow-[0_0_5px_#fbbf24]';
            else bar.className = 'w-1 h-0.5 rounded-[0.2px] bg-emerald-400 shadow-[0_0_5px_#34d399]';
          } else {
            bar.className = 'w-1 h-0.5 rounded-[0.2px] bg-zinc-800';
          }
        }
      }
      requestRef.current = requestAnimationFrame(update);
    };
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [trackId]);

  return (
    <div ref={containerRef} className="flex flex-col gap-[1px] h-full py-0.5 shrink-0 justify-center">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="w-1 h-0.5 rounded-[0.2px] bg-zinc-800 transition-all duration-75" />
      ))}
    </div>
  );
};

export default LEDMeter;