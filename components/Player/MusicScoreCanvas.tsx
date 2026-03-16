

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pencil, Eraser, Trash2, Palette, Minus, Plus } from 'lucide-react';

interface MusicScoreCanvasProps {
  imageSrc: string;
  currentTime: number;
  pixelsPerSecond: number;
  isPlaying?: boolean;
  onClear?: () => void;
}

const COLORS = [
  { id: 'indigo', hex: '#6366f1' },
  { id: 'red', hex: '#ef4444' },
  { id: 'emerald', hex: '#10b981' },
  { id: 'amber', hex: '#f59e0b' },
  { id: 'blue', hex: '#3b82f6' }
];

const MusicScoreCanvas: React.FC<MusicScoreCanvasProps> = ({
  imageSrc,
  currentTime,
  pixelsPerSecond,
  isPlaying = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState(COLORS[0].hex);
  const [lineWidth, setLineWidth] = useState(3);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    // Preserve existing drawing by using a temporary canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) tempCtx.drawImage(canvas, 0, 0);

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = lineWidth * 5; // Eraser is naturally thicker
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = currentColor;
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="relative w-full group select-none flex flex-col items-center">
      {/* PROFESSIONAL PEN TOOL KIT */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#111115]/95 backdrop-blur-2xl border border-white/10 p-2 rounded-3xl shadow-2xl z-[1000] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
        
        {/* Tools */}
        <div className="flex items-center bg-zinc-900/50 p-1 rounded-2xl border border-white/5">
          <button 
            onClick={() => setTool('pen')}
            className={`p-2 rounded-xl transition-all ${tool === 'pen' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Pencil size={16} />
          </button>
          <button 
            onClick={() => setTool('eraser')}
            className={`p-2 rounded-xl transition-all ${tool === 'eraser' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Eraser size={16} />
          </button>
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-1.5 px-2">
          {COLORS.map(c => (
            <button
              key={c.id}
              onClick={() => { setTool('pen'); setCurrentColor(c.hex); }}
              className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${currentColor === c.hex && tool === 'pen' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111115]' : ''}`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>

        {/* Thickness */}
        <div className="flex items-center bg-zinc-900/50 p-1 rounded-2xl border border-white/5 gap-2">
           <button onClick={() => setLineWidth(Math.max(1, lineWidth - 1))} className="p-1 text-zinc-500 hover:text-white"><Minus size={12}/></button>
           <div className="w-8 flex flex-col items-center">
              <span className="text-[6px] font-black text-zinc-600 uppercase">Size</span>
              <span className="text-[10px] font-black text-indigo-400">{lineWidth}</span>
           </div>
           <button onClick={() => setLineWidth(Math.min(15, lineWidth + 1))} className="p-1 text-zinc-500 hover:text-white"><Plus size={12}/></button>
        </div>

        <div className="w-px h-6 bg-white/10 mx-1" />
        
        <button 
          onClick={clearCanvas}
          className="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div 
        ref={containerRef}
        className="relative bg-white rounded-3xl shadow-2xl overflow-hidden border border-zinc-200"
        style={{ maxWidth: '100%', cursor: tool === 'pen' ? 'crosshair' : 'default' }}
      >
        <img 
          ref={imageRef}
          src={imageSrc} 
          alt="Music Score" 
          className="block w-full h-auto pointer-events-none"
          onLoad={syncCanvasSize}
        />

        <div 
          className="absolute top-0 bottom-0 w-[3px] bg-indigo-500 z-[500] pointer-events-none shadow-[0_0_15px_rgba(99,102,241,0.6)] transition-transform duration-100 ease-linear"
          style={{ 
            transform: `translateX(${currentTime * pixelsPerSecond}px)`,
            willChange: 'transform'
          }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-indigo-500 rounded-full -mt-2 border-2 border-white shadow-lg" />
        </div>

        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute top-0 left-0 w-full h-full z-[1000] touch-none"
        />
      </div>

      <div className="mt-6 flex items-center gap-8 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">
        <div className="flex items-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
           PLAYBACK SYNC
        </div>
        <div className="flex items-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
           PEN READY: <span className="text-zinc-400" style={{ color: currentColor }}>{COLORS.find(c => c.hex === currentColor)?.id}</span>
        </div>
      </div>
    </div>
  );
};

export default MusicScoreCanvas;