

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Pencil, Eraser, Trash2, Palette, Minus, Plus } from 'lucide-react';

interface ScoreRendererProps {
  xmlData: string;
  currentTime: number;
  duration: number;
  notes: any[];
  zoom?: number;
  songTitle?: string;
}

const COLORS = [
  { id: 'indigo', hex: '#6366f1' }, { id: 'red', hex: '#ef4444' },
  { id: 'emerald', hex: '#10b981' }, { id: 'amber', hex: '#f59e0b' }
];

const ScoreRenderer = forwardRef(({ xmlData, currentTime, duration, notes, zoom = 0.4, songTitle = "Score" }: ScoreRendererProps, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const osmdRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [currentColor, setCurrentColor] = useState(COLORS[0].hex);
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);

  const elementsMapRef = useRef<{ startTime: number; endTime: number; x: number; staffTop: number; }[]>([]);

  useEffect(() => {
    if (!containerRef.current || !xmlData) return;
    const OSMD = (window as any).opensheetmusicdisplay;
    if (!OSMD) return;

    const render = async () => {
      setIsReady(false);
      if (!osmdRef.current) {
        osmdRef.current = new OSMD.OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true, drawTitle: false, pageFormat: "A4", renderLyrics: true,
          followCursor: false, lyricAlignment: "center", lyricPosition: "below"
        });
      }
      await osmdRef.current.load(xmlData);
      osmdRef.current.Zoom = zoom;
      osmdRef.current.render();

      // Ensure SVG is fully baked before mapping
      setTimeout(() => {
        mapCoordinates();
        syncCanvas();
        setIsReady(true);
      }, 800);
    };
    render();
  }, [xmlData, zoom]);

  const mapCoordinates = () => {
    const container = containerRef.current;
    if (!container) return;
    const noteheads = Array.from(container.querySelectorAll('.vf-notehead')) as SVGElement[];
    if (noteheads.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    const map: any[] = [];
    const sortedTimes = Array.from(new Set(notes.map(n => n.startTime))).sort((a,b) => a-b);

    let hIdx = 0;
    sortedTimes.forEach((st, idx) => {
      const head = noteheads[hIdx];
      if (head) {
        const bbox = head.getBoundingClientRect();
        map.push({
          startTime: st,
          endTime: sortedTimes[idx+1] || st + 0.5,
          x: bbox.left - containerRect.left + container.scrollLeft,
          staffTop: bbox.top - containerRect.top + container.scrollTop - 40
        });
      }
      hIdx += notes.filter(n => n.startTime === st).length;
    });
    elementsMapRef.current = map;
  };

  const syncCanvas = () => {
    if (!canvasRef.current || !containerRef.current) return;
    canvasRef.current.width = containerRef.current.scrollWidth;
    canvasRef.current.height = containerRef.current.scrollHeight;
  };

  useEffect(() => {
    if (!isReady || !cursorRef.current || elementsMapRef.current.length === 0) return;
    const active = elementsMapRef.current.find(i => currentTime >= i.startTime && currentTime < i.endTime);
    if (active) {
      cursorRef.current.style.transform = `translate3d(${active.x}px, ${active.staffTop}px, 0)`;
      cursorRef.current.style.opacity = "1";
    }
  }, [currentTime, isReady]);

  const startDrawing = (e: React.MouseEvent) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = currentColor;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const rect = canvasRef.current?.getBoundingClientRect();
    if (ctx && rect) {
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    }
  };

  return (
    <div className="absolute inset-0 bg-white overflow-hidden flex flex-col group">
      {/* TOOLBAR */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-zinc-900/95 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl z-[1000] opacity-0 group-hover:opacity-100 transition-all duration-300">
        <div className="flex bg-zinc-800 p-1 rounded-xl">
          <button onClick={() => setTool('pen')} className={`p-2 rounded-lg ${tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-zinc-500'}`}><Pencil size={14} /></button>
          <button onClick={() => setTool('eraser')} className={`p-2 rounded-lg ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-zinc-500'}`}><Eraser size={14} /></button>
        </div>
        <div className="flex gap-1.5">
          {COLORS.map(c => <button key={c.id} onClick={() => { setTool('pen'); setCurrentColor(c.hex); }} className="w-5 h-5 rounded-full" style={{ backgroundColor: c.hex }} />)}
        </div>
        <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); ctx?.clearRect(0,0,9999,9999); }} className="p-2 text-zinc-500 hover:text-red-400"><Trash2 size={14} /></button>
      </div>

      <div ref={containerRef} className="flex-1 w-full overflow-auto relative pt-32 pb-48 no-scrollbar z-[100]">
        {/* Layer 2: Indigo Cursor */}
        <div ref={cursorRef} className="absolute top-0 w-[4px] bg-indigo-600/80 z-[500] pointer-events-none opacity-0 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-opacity duration-300" style={{ height: '120px', transition: 'transform 0.1s linear, opacity 0.3s' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-indigo-500 rounded-full -mt-2 border-2 border-white shadow-md" />
        </div>
        
        {/* Layer 3: Drawing Canvas */}
        <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)} className="absolute top-0 left-0 z-[600] cursor-crosshair" />
      </div>

      {!isReady && <div className="absolute inset-0 bg-white/95 flex items-center justify-center z-[2000]">
        <div className="w-10 h-10 border-4 border-indigo-600/10 border-t-indigo-600 rounded-full animate-spin" />
      </div>}
    </div>
  );
});

export default ScoreRenderer;