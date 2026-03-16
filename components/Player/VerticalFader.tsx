
import React, { useRef, useCallback } from 'react';

interface VerticalFaderProps {
  value: number; // 0 to 1
  onChange: (value: number) => void;
}

const VerticalFader: React.FC<VerticalFaderProps> = ({ value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleInteraction = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const trackHeight = rect.height;
    // Add padding to the effective area to make it easier to reach 0 and 100
    const padding = 8;
    const effectiveHeight = trackHeight - (padding * 2);
    const relativeY = clientY - rect.top - padding;

    const newValue = 1 - Math.max(0, Math.min(1, relativeY / effectiveHeight));
    onChange(newValue);
  }, [onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    document.body.style.cursor = 'ns-resize';
    handleInteraction(e.clientY);
    const onMouseMove = (moveEvent: MouseEvent) => {
      handleInteraction(moveEvent.clientY);
    };
    const onMouseUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
  
  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    handleInteraction(e.touches[0].clientY);
    const onTouchMove = (moveEvent: TouchEvent) => {
      handleInteraction(moveEvent.touches[0].clientY);
    };
    const onTouchEnd = () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
  };

  const thumbPositionPercent = (1 - value) * 100;
  
  return (
    <div 
        ref={trackRef}
        className="relative h-full w-full flex items-center justify-center cursor-ns-resize py-2"
        onMouseDown={onMouseDown} 
        onTouchStart={onTouchStart}
      >
        {/* Track with Ticks */}
        <div className="relative w-1 h-full bg-black/50 rounded-full">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="absolute -right-2 w-2 h-px bg-zinc-600" style={{ top: `${(i+1)*10}%` }}/>
          ))}
        </div>
        
        {/* Thumb */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-cyan-400 rounded-full pointer-events-none" 
          style={{ 
            top: `calc(${thumbPositionPercent}% - 8px)`, 
            willChange: 'top',
            boxShadow: '0 0 8px var(--nimo-cyan-aura)'
          }} 
        />
      </div>
  );
};

export default VerticalFader;
