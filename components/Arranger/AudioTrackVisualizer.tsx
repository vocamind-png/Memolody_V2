import React, { useEffect, useRef, useState } from 'react';
import { TrackState, AudioRegion } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';
import { Loader2 } from 'lucide-react';

interface AudioTrackVisualizerProps {
  track: TrackState;
  pixelsPerBeat?: number;
  bpm?: number;
  height?: number;
  onRegionClick?: (regionId: string) => void;
  onRegionDoubleClick?: (regionId: string) => void;
  selectedRegionId?: string | null;
  activeTool?: 'pointer' | 'scissors' | 'glue';
  onRegionSplit?: (regionId: string, splitTimeRelative: number) => void;
  onRegionGlue?: (regionId: string) => void;
}

export const AudioTrackVisualizer: React.FC<AudioTrackVisualizerProps> = ({
  track,
  pixelsPerBeat = 20,
  bpm = 120,
  height = 80,
  onRegionClick,
  onRegionDoubleClick,
  selectedRegionId,
  activeTool = 'pointer',
  onRegionSplit,
  onRegionGlue,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const pixelsPerSecond = (bpm / 60) * pixelsPerBeat;

  // We rely on musicEngine to have the buffers loaded.
  // Actually, musicEngine loads them during loadSong. We can just draw them.
  
  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-[#111115] rounded-lg border border-white/5 overflow-hidden group"
    >
      {!track.audioRegions || track.audioRegions.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs italic pointer-events-none">
          Drag & Drop Audio Files Here or Press Record
        </div>
      ) : (
        track.audioRegions.map((region) => (
          <AudioRegionBlock
            key={region.id}
            region={region}
            pixelsPerSecond={pixelsPerSecond}
            height={height}
            isSelected={selectedRegionId === region.id}
            onClick={(e) => {
              if (activeTool === 'pointer') {
                onRegionClick?.(region.id);
              } else if (activeTool === 'scissors') {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const splitTimeRelative = clickX / pixelsPerSecond;
                onRegionSplit?.(region.id, splitTimeRelative);
              } else if (activeTool === 'glue') {
                onRegionGlue?.(region.id);
              }
            }}
            onDoubleClick={() => onRegionDoubleClick?.(region.id)}
            cursor={activeTool === 'scissors' ? 'crosshair' : activeTool === 'glue' ? 'cell' : 'pointer'}
          />
        ))
      )}
    </div>
  );
};

interface AudioRegionBlockProps {
  region: AudioRegion;
  pixelsPerSecond: number;
  height: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  cursor?: string;
}

const AudioRegionBlock: React.FC<AudioRegionBlockProps> = ({
  region,
  pixelsPerSecond,
  height,
  isSelected,
  onClick,
  onDoubleClick,
  cursor = 'pointer'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [forceRender, setForceRender] = useState(0);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer = musicEngine.audioBuffers.get(region.bufferId);
    
    // Setup canvas resolution
    const width = region.duration * pixelsPerSecond;
    canvas.width = width * window.devicePixelRatio; // for Retina displays
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear background
    ctx.clearRect(0, 0, width, height);
    
    if (!buffer) {
      // Buffer not loaded yet. Poll for it since musicEngine might be loading it asynchronously.
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText('Loading Audio...', 10, 20);
      
      const timer = setTimeout(() => setForceRender(f => f + 1), 500);
      return () => clearTimeout(timer);
    }

    // Draw waveform
    const channelData = buffer.getChannelData(0); // Use left channel for visualization
    const sampleRate = buffer.sampleRate;
    
    // We need to map from the sourceOffset to sourceOffset + sourceDuration
    const startSample = Math.floor(region.sourceOffset * sampleRate);
    const endSample = Math.floor((region.sourceOffset + region.sourceDuration) * sampleRate);
    const sliceLen = endSample - startSample;
    
    const step = Math.ceil(sliceLen / width);
    const amp = height / 2;
    
    ctx.beginPath();
    ctx.moveTo(0, amp);
    
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      
      for (let j = 0; j < step; j++) {
        const idx = startSample + (i * step) + j;
        if (idx >= 0 && idx < channelData.length) {
          const datum = channelData[idx];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }
      
      // If we didn't find any data in this slice, just draw center line
      if (min === 1.0 && max === -1.0) {
        min = 0; max = 0;
      }
      
      ctx.lineTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#cbd5e1'; // Sky-400 or Slate-300
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw Fade In/Out overlaps
    if (region.fadeInDuration > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const fadeW = region.fadeInDuration * pixelsPerSecond;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fadeW, height);
      ctx.lineTo(0, height);
      ctx.fill();
      
      // Line
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fadeW, height);
      ctx.strokeStyle = '#f87171'; // Red-400
      ctx.stroke();
    }
    
    if (region.fadeOutDuration > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const fadeW = region.fadeOutDuration * pixelsPerSecond;
      ctx.beginPath();
      ctx.moveTo(width, 0);
      ctx.lineTo(width - fadeW, height);
      ctx.lineTo(width, height);
      ctx.fill();
      
      // Line
      ctx.beginPath();
      ctx.moveTo(width, 0);
      ctx.lineTo(width - fadeW, height);
      ctx.strokeStyle = '#f87171';
      ctx.stroke();
    }

  }, [region, pixelsPerSecond, height, isSelected, forceRender]);

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`absolute top-0 bottom-0 overflow-hidden rounded-sm border ${
        isSelected ? 'bg-sky-500/20 border-sky-400' : 'bg-slate-700/50 border-slate-500'
      } ${region.isMuted ? 'opacity-30 grayscale' : ''} hover:border-sky-300 transition-colors`}
      style={{ 
        left: region.startTime * pixelsPerSecond, 
        width: Math.max(10, region.duration * pixelsPerSecond),
        cursor: cursor
      }}
      title={region.name}
    >
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%' }}
      />
      {/* Title Bar */}
      <div className="absolute top-0 left-0 right-0 bg-black/40 px-1 py-0.5 text-[10px] text-white/80 truncate pointer-events-none">
        {region.name}
      </div>
      
      {/* Trim Handles */}
      <div className="absolute top-0 bottom-0 left-0 w-2 cursor-col-resize hover:bg-white/20 transition-colors" />
      <div className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize hover:bg-white/20 transition-colors" />
    </div>
  );
};
