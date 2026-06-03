/**
 * EngraverCommandCenter — Multi-Panel Floating Palettes
 * Each category (NOTES, ACCID, ARTIC, DYNAMICS, LINES, KEYS)
 * is an independent draggable panel — MuseScore palette style.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Pointer, RotateCcw, RotateCw, X, Trash2,
  GripHorizontal, Pencil, Music, ChevronDown, ChevronUp, Plus
} from 'lucide-react';

// ── Draggable Hook ────────────────────────────────────────────────────

function useDraggable(initialX: number, initialY: number) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const dragging = useRef(false);
  const offset  = useRef({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 60, e.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offset.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  return { ref, pos, onHandleMouseDown };
}

// ── Notation SVG Icons ────────────────────────────────────────────────

const NotationIcon = ({ type, active, size = 22 }: { type: string; active?: boolean; size?: number }) => {
  const color  = active ? '#00e5ff' : 'currentColor';
  const stroke = active ? 2.5 : 2;
  switch (type) {
    case 'whole':       return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}><ellipse cx="12" cy="12" rx="7" ry="4"/></svg>;
    case 'half':        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}><ellipse cx="9" cy="17" rx="5" ry="3"/><path d="M14 17V4"/></svg>;
    case 'quarter':     return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1"><ellipse cx="9" cy="17" rx="5" ry="3"/><path d="M14 17V4" fill="none" stroke={color} strokeWidth={stroke}/></svg>;
    case 'eighth':      return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1"><ellipse cx="9" cy="17" rx="5" ry="3"/><path d="M14 17V4c0 0 4 0 5 4" fill="none" stroke={color} strokeWidth={stroke}/></svg>;
    case '16th':        return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1"><ellipse cx="9" cy="17" rx="5" ry="3"/><path d="M14 17V4c0 0 4 0 5 4" fill="none" stroke={color} strokeWidth={stroke}/><path d="M14 7c0 0 4 0 5 4" fill="none" stroke={color} strokeWidth={stroke}/></svg>;
    case 'rest-whole':  return <div className="w-5 h-2 bg-current"/>;
    case 'rest-half':   return <div className="w-5 h-2 bg-current relative -top-1"/>;
    case 'rest-quarter':return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}><path d="M10 4l4 4-4 4 4 4-2 4"/></svg>;
    case 'staccato':    return <div className="w-1.5 h-1.5 rounded-full bg-current"/>;
    case 'accent':      return <span className="text-xl font-bold leading-none">&gt;</span>;
    case 'marcato':     return <span className="text-xl font-bold leading-none">^</span>;
    case 'slur':        return <svg width={size} height={10} viewBox="0 0 24 10" fill="none" stroke={color} strokeWidth={stroke}><path d="M2 8 Q 12 0 22 8"/></svg>;
    default:            return <Music size={size - 2}/>;
  }
};

// ── Tool categories ───────────────────────────────────────────────────

type ToolItem = {
  id: string;
  label: string;
  lucide?: React.ElementType;
  icon?: string;
  content?: React.ReactNode;
};

const CATEGORIES: Record<string, { emoji: string; color: string; tools: ToolItem[] }> = {
  'NOTES': {
    emoji: '♩', color: 'cyan',
    tools: [
      { id: 'select',       label: 'Sel.',    lucide: Pointer },
      { id: 'whole-note',   label: 'Whole',   icon: 'whole'   },
      { id: 'half-note',    label: 'Half',    icon: 'half'    },
      { id: 'quarter-note', label: 'Quart.',  icon: 'quarter' },
      { id: 'eighth-note',  label: '8th',     icon: 'eighth'  },
      { id: '16th-note',    label: '16th',    icon: '16th'    },
      { id: 'rest-quarter', label: 'Rest ♩',  icon: 'rest-quarter' },
      { id: 'rest-half',    label: 'Rest ♩♩', icon: 'rest-half'    },
      { id: 'dot',          label: 'Dot',     content: <div className="text-2xl font-black">.</div> },
      { id: 'delete',       label: 'Erase',   lucide: Trash2 },
    ],
  },
  'ACCID.': {
    emoji: '♯', color: 'amber',
    tools: [
      { id: 'sharp',        label: 'Sharp',  content: <span className="text-2xl font-serif">♯</span> },
      { id: 'flat',         label: 'Flat',   content: <span className="text-2xl font-serif">♭</span> },
      { id: 'natural',      label: 'Natural',content: <span className="text-2xl font-serif">♮</span> },
      { id: 'double-sharp', label: '×♯',     content: <span className="text-xl font-bold">𝄪</span> },
      { id: 'double-flat',  label: '×♭',     content: <span className="text-xl font-bold">𝄫</span> },
    ],
  },
  'ARTIC.': {
    emoji: '´', color: 'rose',
    tools: [
      { id: 'staccato', label: 'Stac.',  icon: 'staccato' },
      { id: 'accent',   label: 'Acc.',   icon: 'accent'   },
      { id: 'marcato',  label: 'Marc.',  icon: 'marcato'  },
      { id: 'tenuto',   label: 'Ten.',   content: <div className="w-5 h-1 bg-current rounded-full"/> },
      { id: 'fermata',  label: 'Ferm.',  content: <span className="text-xl">𝄐</span> },
    ],
  },
  'DYNAMICS': {
    emoji: 'f', color: 'violet',
    tools: [
      { id: 'ppp',     label: 'ppp',   content: <span className="italic font-serif text-sm font-black tracking-tighter">ppp</span> },
      { id: 'pp',      label: 'pp',    content: <span className="italic font-serif text-sm font-black tracking-tighter">pp</span> },
      { id: 'p',       label: 'p',     content: <span className="italic font-serif text-lg font-black">p</span> },
      { id: 'mp',      label: 'mp',    content: <span className="italic font-serif text-sm font-black tracking-tighter">mp</span> },
      { id: 'mf',      label: 'mf',    content: <span className="italic font-serif text-sm font-black tracking-tighter">mf</span> },
      { id: 'f',       label: 'f',     content: <span className="italic font-serif text-lg font-black">f</span> },
      { id: 'ff',      label: 'ff',    content: <span className="italic font-serif text-sm font-black tracking-tighter">ff</span> },
      { id: 'fff',     label: 'fff',   content: <span className="italic font-serif text-sm font-black tracking-tighter">fff</span> },
      { id: 'cresc',   label: 'Cres.', content: <span className="text-lg">&lt;</span> },
      { id: 'decresc', label: 'Decr.', content: <span className="text-lg">&gt;</span> },
    ],
  },
  'LINES': {
    emoji: '⌒', color: 'emerald',
    tools: [
      { id: 'slur',   label: 'Slur', icon: 'slur' },
      { id: 'tie',    label: 'Tie',  icon: 'slur' },
      { id: '8va',    label: '8va',  content: <span className="text-[10px] font-black italic">8va</span> },
      { id: '8vb',    label: '8vb',  content: <span className="text-[10px] font-black italic">8vb</span> },
    ],
  },
  'KEYS': {
    emoji: '𝄞', color: 'indigo',
    tools: [
      { id: 'g-clef', label: 'G',  content: <span className="text-2xl">𝄞</span> },
      { id: 'f-clef', label: 'F',  content: <span className="text-2xl">𝄢</span> },
      { id: 'c-clef', label: 'C',  content: <span className="text-2xl">𝄡</span> },
    ],
  },
};

// Color map for Tailwind
const COLOR_CLASSES: Record<string, { active: string; badge: string; glow: string }> = {
  cyan:   { active: 'bg-cyan-500 text-black   shadow-[0_6px_20px_rgba(0,229,255,0.4)]', badge: 'bg-cyan-500/20   text-cyan-400',   glow: 'border-cyan-500/40'   },
  amber:  { active: 'bg-amber-400 text-black  shadow-[0_6px_20px_rgba(251,191,36,0.4)]',  badge: 'bg-amber-400/20  text-amber-400',  glow: 'border-amber-500/40'  },
  rose:   { active: 'bg-rose-500  text-white  shadow-[0_6px_20px_rgba(244,63,94,0.4)]',  badge: 'bg-rose-500/20   text-rose-400',   glow: 'border-rose-500/40'   },
  violet: { active: 'bg-violet-500 text-white shadow-[0_6px_20px_rgba(139,92,246,0.4)]', badge: 'bg-violet-500/20 text-violet-400', glow: 'border-violet-500/40' },
  emerald:{ active: 'bg-emerald-500 text-black shadow-[0_6px_20px_rgba(16,185,129,0.4)]',badge: 'bg-emerald-500/20 text-emerald-400',glow: 'border-emerald-500/40'},
  indigo: { active: 'bg-indigo-500 text-white shadow-[0_6px_20px_rgba(99,102,241,0.4)]', badge: 'bg-indigo-500/20  text-indigo-400', glow: 'border-indigo-500/40'  },
};

// ── Single Palette Panel ──────────────────────────────────────────────

interface PaletteProps {
  catKey: string;
  initialX: number;
  initialY: number;
  activeTool: string;
  onToolSelect: (id: string) => void;
  onClose: () => void;
}

const PalettePanel: React.FC<PaletteProps> = ({
  catKey, initialX, initialY, activeTool, onToolSelect, onClose,
}) => {
  const { ref, pos, onHandleMouseDown } = useDraggable(initialX, initialY);
  const [collapsed, setCollapsed] = useState(false);
  const cat = CATEGORIES[catKey];
  const colors = COLOR_CLASSES[cat.color];

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y, position: 'fixed', zIndex: 5000 }}
      className={`w-48 bg-zinc-950 border border-white/8 rounded-[28px] shadow-[0_24px_60px_rgba(0,0,0,0.85)] animate-in fade-in zoom-in-95 duration-200 select-none touch-none overflow-hidden ${colors.glow}`}
      onClick={e => e.stopPropagation()}
    >
      {/* Drag handle / header */}
      <div
        className="drag-handle flex items-center justify-between px-3 py-2 cursor-move border-b border-white/5"
        onMouseDown={onHandleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={12} className="text-zinc-600 opacity-60"/>
          <span className={`text-[7px] font-black uppercase tracking-[0.35em] ${colors.badge.split(' ')[1]}`}>
            {catKey}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(v => !v)}
            className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-white rounded-full hover:bg-white/10 transition-all"
          >
            {collapsed ? <ChevronDown size={10}/> : <ChevronUp size={10}/>}
          </button>
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-rose-400 rounded-full hover:bg-white/10 transition-all"
          >
            <X size={10}/>
          </button>
        </div>
      </div>

      {/* Tool grid */}
      {!collapsed && (
        <div className="grid grid-cols-3 gap-1 p-2">
          {cat.tools.map(tool => {
            const isActive = activeTool === tool.id;
            const LucideIcon = tool.lucide;
            return (
              <button
                key={tool.id}
                onClick={() => onToolSelect(tool.id)}
                className={`h-14 rounded-[18px] flex flex-col items-center justify-center gap-1 transition-all duration-200 relative overflow-hidden border ${
                  isActive
                    ? `${colors.active} border-transparent scale-105 z-10`
                    : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:bg-white/[0.06] hover:border-white/10 hover:text-white'
                }`}
              >
                {isActive && <div className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent pointer-events-none"/>}
                <div className={`transition-all duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                  {LucideIcon
                    ? <LucideIcon size={20} strokeWidth={isActive ? 2.5 : 2}/>
                    : (tool.content || <NotationIcon type={tool.icon!} active={isActive} size={20}/>)}
                </div>
                <span className={`text-[8px] font-bold uppercase tracking-tight leading-none ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                  {tool.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── History Panel ─────────────────────────────────────────────────────

interface HistoryPanelProps {
  initialX: number;
  initialY: number;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  initialX, initialY, onUndo, onRedo, canUndo, canRedo, onClose,
}) => {
  const { ref, pos, onHandleMouseDown } = useDraggable(initialX, initialY);

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y, position: 'fixed', zIndex: 5000 }}
      className="bg-zinc-950 border border-white/8 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in fade-in duration-200 select-none"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 cursor-move" onMouseDown={onHandleMouseDown}>
        <div className="flex items-center gap-2">
          <GripHorizontal size={12} className="text-zinc-600 opacity-60"/>
          <span className="text-[7px] font-black uppercase tracking-[0.35em] text-zinc-500">HISTORY</span>
        </div>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-rose-400 rounded-full hover:bg-white/10 transition-all">
          <X size={10}/>
        </button>
      </div>
      <div className="flex items-center gap-1 p-2">
        <button
          onClick={onUndo} disabled={!canUndo}
          className="flex items-center gap-1.5 px-3 h-8 rounded-2xl text-zinc-400 disabled:opacity-20 hover:text-white hover:bg-white/10 transition-all active:scale-90 text-[8px] font-black uppercase"
        >
          <RotateCcw size={12}/> Undo
        </button>
        <div className="w-px h-4 bg-white/10"/>
        <button
          onClick={onRedo} disabled={!canRedo}
          className="flex items-center gap-1.5 px-3 h-8 rounded-2xl text-zinc-400 disabled:opacity-20 hover:text-white hover:bg-white/10 transition-all active:scale-90 text-[8px] font-black uppercase"
        >
          Redo <RotateCw size={12}/>
        </button>
      </div>
    </div>
  );
};

// ── Launcher (when all panels hidden) ────────────────────────────────

interface LauncherProps {
  onOpen: () => void;
}
const Launcher: React.FC<LauncherProps> = ({ onOpen }) => (
  <button
    onClick={onOpen}
    className="fixed bottom-28 left-5 z-[5000] w-14 h-14 bg-cyan-500 border border-cyan-300/30 rounded-full flex items-center justify-center text-black shadow-2xl active:scale-90 transition-all hover:bg-cyan-400 hover:shadow-[0_0_24px_rgba(0,229,255,0.5)]"
    title="Open Maestro Engraver"
  >
    <Pencil size={22}/>
  </button>
);

// ── Panel Selector overlay ────────────────────────────────────────────

const PANEL_COLS = ['NOTES', 'ACCID.', 'ARTIC.', 'DYNAMICS', 'LINES', 'KEYS', 'HISTORY'] as const;

// ── Main Component ────────────────────────────────────────────────────

interface EngraverCommandCenterProps {
  activeTool: string;
  onToolSelect: (id: string) => void;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// Default starting positions (stacked down-left side)
const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  'NOTES':    { x: 16,  y: 110  },
  'ACCID.':   { x: 16,  y: 440  },
  'ARTIC.':   { x: 16,  y: 620  },
  'DYNAMICS': { x: 210, y: 110  },
  'LINES':    { x: 210, y: 410  },
  'KEYS':     { x: 210, y: 540  },
  'HISTORY':  { x: 16,  y: 820  },
};

const EngraverCommandCenter: React.FC<EngraverCommandCenterProps> = ({
  activeTool, onToolSelect, isVisible, onToggleVisibility,
  onUndo, onRedo, canUndo, canRedo,
}) => {
  // Which panels are currently open
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set(['NOTES', 'HISTORY']));
  const [showSelector, setShowSelector] = useState(false);

  const closePanel  = (key: string) => setOpenPanels(prev => { const s = new Set(prev); s.delete(key); return s; });
  const togglePanel = (key: string) => setOpenPanels(prev => {
    const s = new Set(prev);
    if (s.has(key)) s.delete(key); else s.add(key);
    return s;
  });

  if (!isVisible) {
    return <Launcher onOpen={onToggleVisibility}/>;
  }

  return (
    <>
      {/* Individual palette panels */}
      {Array.from(openPanels).map(key => {
        if (key === 'HISTORY') {
          return (
            <HistoryPanel
              key="HISTORY"
              initialX={DEFAULT_POSITIONS['HISTORY'].x}
              initialY={DEFAULT_POSITIONS['HISTORY'].y}
              onUndo={onUndo}
              onRedo={onRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onClose={() => closePanel('HISTORY')}
            />
          );
        }
        if (!CATEGORIES[key as string]) return null;
        const { x, y } = DEFAULT_POSITIONS[key as string] || { x: 16, y: 110 };
        return (
          <PalettePanel
            key={key}
            catKey={key as string}
            initialX={x}
            initialY={y}
            activeTool={activeTool}
            onToolSelect={onToolSelect}
            onClose={() => closePanel(key as string)}
          />
        );
      })}

      {/* Panel Selector popup */}
      {showSelector && (
        <div
          className="fixed bottom-40 left-5 z-[5500] bg-zinc-950 border border-white/10 rounded-[28px] p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          style={{ minWidth: 220 }}
        >
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-zinc-500 mb-2 px-1">Toggle Panels</p>
          <div className="flex flex-col gap-1">
            {PANEL_COLS.map(key => {
              const isOpen = openPanels.has(key);
              const cat = key === 'HISTORY' ? null : CATEGORIES[key];
              const colors = cat ? COLOR_CLASSES[cat.color] : null;
              return (
                <button
                  key={key}
                  onClick={() => togglePanel(key)}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
                    isOpen ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  <span>{key}</span>
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[7px] ${isOpen ? (colors?.badge || 'bg-zinc-700 text-white') : 'border border-white/10 text-zinc-700'}`}>
                    {isOpen ? '✓' : '+'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FAB — show/hide selector */}
      <button
        onClick={() => setShowSelector(v => !v)}
        className={`fixed bottom-28 left-5 z-[5100] w-14 h-14 border rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all ${
          showSelector
            ? 'bg-rose-500 border-rose-400/30 text-white hover:bg-rose-400'
            : 'bg-cyan-500 border-cyan-300/30 text-black hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(0,229,255,0.4)]'
        }`}
        title="Maestro Engraver"
      >
        {showSelector ? <X size={20}/> : <Pencil size={22}/>}
      </button>

      {/* Click-outside to close selector */}
      {showSelector && (
        <div className="fixed inset-0 z-[5050]" onClick={() => setShowSelector(false)}/>
      )}
    </>
  );
};

export default EngraverCommandCenter;
