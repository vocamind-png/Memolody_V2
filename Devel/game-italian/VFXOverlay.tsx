import React, { useState, useEffect } from 'react';

export type VFXType = 'perfect' | 'help' | 'oops' | 'cheer' | null;

interface VFXEvent {
  id: number;
  type: VFXType;
  x: number;
  y: number;
}

interface VFXOverlayProps {
  lastEvent: { type: VFXType; timestamp: number } | null;
}

export const VFXOverlay: React.FC<VFXOverlayProps> = ({ lastEvent }) => {
  const [events, setEvents] = useState<VFXEvent[]>([]);

  useEffect(() => {
    if (lastEvent && lastEvent.type) {
      const newEvent: VFXEvent = {
        id: lastEvent.timestamp,
        type: lastEvent.type,
        // Randomize position slightly around the center
        x: 50 + (Math.random() * 20 - 10),
        y: 40 + (Math.random() * 20 - 10),
      };
      setEvents((prev) => [...prev, newEvent]);

      // Remove after animation completes (e.g., 1 second)
      setTimeout(() => {
        setEvents((prev) => prev.filter((e) => e.id !== newEvent.id));
      }, 1000);
    }
  }, [lastEvent]);

  const renderVFX = (event: VFXEvent) => {
    let text = '';
    let colorClass = '';
    
    switch (event.type) {
      case 'perfect':
        text = 'Perfetto!';
        colorClass = 'text-green-500 shadow-green-500/50';
        break;
      case 'cheer':
        text = 'Mamma Mia!';
        colorClass = 'text-yellow-400 shadow-yellow-400/50';
        break;
      case 'help':
        text = 'Aiuto! (Help!)';
        colorClass = 'text-red-500 shadow-red-500/50';
        break;
      case 'oops':
        text = 'Oops!';
        colorClass = 'text-orange-500 shadow-orange-500/50';
        break;
      default:
        return null;
    }

    return (
      <div
        key={event.id}
        className={`absolute font-black text-6xl tracking-wider uppercase animate-bounce drop-shadow-2xl ${colorClass}`}
        style={{
          left: `${event.x}%`,
          top: `${event.y}%`,
          transform: 'translate(-50%, -50%)',
          WebkitTextStroke: '2px white',
        }}
      >
        {text}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
      {events.map(renderVFX)}
    </div>
  );
};
