
import React, { useState, useEffect, useRef } from 'react';
import { 
    Pointer, RotateCcw, RotateCw, X, Trash2,
    GripHorizontal, Pencil, Music, Hash, Activity, 
    Type, AlignCenter, Minus, Plus, Zap
} from 'lucide-react';

// Draggable hook for mobile/desktop
const useDraggable = (ref: React.RefObject<HTMLDivElement>) => {
    const [position, setPosition] = useState({ x: 16, y: 120 });
    const isDraggingRef = useRef(false);
    const offsetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onMouseDown = (e: MouseEvent | TouchEvent) => {
            const target = e instanceof MouseEvent ? e.target : e.touches[0].target;
            if ((target as HTMLElement).closest('.drag-handle')) {
                isDraggingRef.current = true;
                const rect = el.getBoundingClientRect();
                const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
                const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
                offsetRef.current = { x: clientX - rect.left, y: clientY - rect.top };
                if (e instanceof MouseEvent) e.preventDefault();
            }
        };
        const onMouseUp = () => isDraggingRef.current = false;
        const onMouseMove = (e: MouseEvent | TouchEvent) => {
            if (!isDraggingRef.current) return;
            const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
            const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
            setPosition({ x: clientX - offsetRef.current.x, y: clientY - offsetRef.current.y });
        };
        el.addEventListener('mousedown', onMouseDown as any);
        el.addEventListener('touchstart', onMouseDown as any, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchend', onMouseUp);
        window.addEventListener('mousemove', onMouseMove as any);
        window.addEventListener('touchmove', onMouseMove as any, { passive: false });
        return () => {
            el.removeEventListener('mousedown', onMouseDown as any);
            el.removeEventListener('touchstart', onMouseDown as any);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchend', onMouseUp);
            window.removeEventListener('mousemove', onMouseMove as any);
            window.removeEventListener('touchmove', onMouseMove as any);
        };
    }, [ref]);
    return position;
};

// Specialized Notation Icons
const NotationIcon = ({ type, active, size = 22 }: { type: string, active?: boolean, size?: number }) => {
    const color = active ? "#00e5ff" : "currentColor";
    const stroke = active ? 2.5 : 2;

    switch(type) {
        case 'whole': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}><ellipse cx="12" cy="12" rx="7" ry="4" /></svg>;
        case 'half': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}><ellipse cx="9" cy="17" rx="5" ry="3" /><path d="M14 17V4" /></svg>;
        case 'quarter': return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1"><ellipse cx="9" cy="17" rx="5" ry="3" /><path d="M14 17V4" fill="none" stroke={color} strokeWidth={stroke}/></svg>;
        case 'eighth': return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1"><ellipse cx="9" cy="17" rx="5" ry="3" /><path d="M14 17V4c0 0 4 0 5 4" fill="none" stroke={color} strokeWidth={stroke}/></svg>;
        case '16th': return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1"><ellipse cx="9" cy="17" rx="5" ry="3" /><path d="M14 17V4c0 0 4 0 5 4" fill="none" stroke={color} strokeWidth={stroke}/><path d="M14 7c0 0 4 0 5 4" fill="none" stroke={color} strokeWidth={stroke}/></svg>;
        case 'rest-whole': return <div className="w-5 h-2 bg-current" />;
        case 'rest-half': return <div className="w-5 h-2 bg-current relative -top-1" />;
        case 'rest-quarter': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}><path d="M10 4l4 4-4 4 4 4-2 4" /></svg>;
        case 'staccato': return <div className="w-1.5 h-1.5 rounded-full bg-current" />;
        case 'accent': return <span className="text-xl font-bold leading-none">&gt;</span>;
        case 'marcato': return <span className="text-xl font-bold leading-none">^</span>;
        case 'slur': return <svg width={size} height={10} viewBox="0 0 24 10" fill="none" stroke={color} strokeWidth={stroke}><path d="M2 8 Q 12 0 22 8" /></svg>;
        default: return <Music size={size - 2} />;
    }
};

const toolCategories = {
    'NOTES': [
        { id: 'select', label: 'Sel.', lucide: Pointer },
        { id: 'whole-note', label: 'Whole', icon: 'whole' },
        { id: 'half-note', label: 'Half', icon: 'half' },
        { id: 'quarter-note', label: 'Quart.', icon: 'quarter' },
        { id: 'eighth-note', label: '8th', icon: 'eighth' },
        { id: '16th-note', label: '16th', icon: '16th' },
        { id: 'rest-quarter', label: 'Rest', icon: 'rest-quarter' },
        { id: 'rest-half', label: 'Rest 2', icon: 'rest-half' },
        { id: 'dot', label: 'Dot', content: <div className="text-2xl font-black">.</div> },
    ],
    'ACCID.': [
        { id: 'sharp', label: 'Sharp', content: <span className="text-2xl font-serif">♯</span> },
        { id: 'flat', label: 'Flat', content: <span className="text-2xl font-serif">♭</span> },
        { id: 'natural', label: 'Nat.', content: <span className="text-2xl font-serif">♮</span> },
        { id: 'double-sharp', label: 'x2 #', content: <span className="text-xl font-bold">𝄪</span> },
        { id: 'double-flat', label: 'x2 b', content: <span className="text-xl font-bold">𝄫</span> },
    ],
    'ARTIC.': [
        { id: 'staccato', label: 'Stac.', icon: 'staccato' },
        { id: 'accent', label: 'Acc.', icon: 'accent' },
        { id: 'marcato', label: 'Marc.', icon: 'marcato' },
        { id: 'tenuto', label: 'Ten.', content: <div className="w-5 h-1 bg-current rounded-full" /> },
        { id: 'fermata', label: 'Ferm.', content: <span className="text-xl">𝄐</span> },
    ],
    'DYNAMICS': [
        { id: 'ppp', label: 'ppp', content: <span className="italic font-serif text-lg font-black tracking-tighter">ppp</span> },
        { id: 'pp', label: 'pp', content: <span className="italic font-serif text-lg font-black tracking-tighter">pp</span> },
        { id: 'p', label: 'p', content: <span className="italic font-serif text-lg font-black">p</span> },
        { id: 'mp', label: 'mp', content: <span className="italic font-serif text-lg font-black tracking-tighter">mp</span> },
        { id: 'mf', label: 'mf', content: <span className="italic font-serif text-lg font-black tracking-tighter">mf</span> },
        { id: 'f', label: 'f', content: <span className="italic font-serif text-lg font-black">f</span> },
        { id: 'ff', label: 'ff', content: <span className="italic font-serif text-lg font-black tracking-tighter">ff</span> },
        { id: 'fff', label: 'fff', content: <span className="italic font-serif text-lg font-black tracking-tighter">fff</span> },
        { id: 'cresc', label: 'Cres.', content: <span className="text-lg">&lt;</span> },
        { id: 'decresc', label: 'Decr.', content: <span className="text-lg">&gt;</span> },
    ],
    'LINES': [
        { id: 'slur', label: 'Slur', icon: 'slur' },
        { id: 'tie', label: 'Tie', icon: 'slur' },
        { id: '8va', label: '8va', content: <span className="text-[10px] font-black italic">8va</span> },
        { id: '8vb', label: '8vb', content: <span className="text-[10px] font-black italic">8vb</span> },
    ],
    'KEYS': [
        { id: 'g-clef', label: 'G', content: <span className="text-2xl">𝄞</span> },
        { id: 'f-clef', label: 'F', content: <span className="text-2xl">𝄢</span> },
        { id: 'c-clef', label: 'C', content: <span className="text-2xl">𝄡</span> },
    ]
};

interface EngraverCommandCenterProps {
    activeTool: string;
    onToolSelect: (toolId: string) => void;
    isVisible: boolean;
    onToggleVisibility: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const EngraverCommandCenter: React.FC<EngraverCommandCenterProps> = ({
    activeTool, onToolSelect, isVisible, onToggleVisibility,
    onUndo, onRedo, canUndo, canRedo
}) => {
    const [activeCategory, setActiveCategory] = useState<keyof typeof toolCategories>('NOTES');
    const panelRef = useRef<HTMLDivElement>(null);
    const position = useDraggable(panelRef);

    if (!isVisible) {
        return ( 
            <button 
                onClick={onToggleVisibility} 
                className="fixed bottom-32 left-6 z-[5000] w-14 h-14 bg-cyan-600 border border-cyan-400/30 rounded-full flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all hover:bg-cyan-500"
            >
                <Pencil size={24} />
            </button> 
        );
    }

    return (
        <div 
            ref={panelRef}
            style={{ top: Math.max(80, position.y), left: Math.max(10, position.x) }}
            className="fixed z-[5000] w-60 bg-zinc-950/95 backdrop-blur-3xl border border-white/10 rounded-[40px] p-2.5 flex flex-col shadow-[0_40px_100px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 duration-300 select-none touch-none"
        >
            {/* Header / Drag Handle */}
            <div className="drag-handle cursor-move w-full h-8 flex items-center justify-between px-4 text-zinc-500 mb-1">
                <div className="flex items-center gap-2">
                    <GripHorizontal size={14} className="opacity-30" />
                    <span className="text-[7px] font-black uppercase tracking-[0.4em] text-cyan-500/60 italic">MAESTRO ENGRAVER</span>
                </div>
                <button onClick={onToggleVisibility} className="w-6 h-6 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center transition-all text-zinc-500 hover:text-white">
                    <X size={14} />
                </button>
            </div>

            {/* Scrollable Ribbon Tabs */}
            <div className="flex bg-black/60 p-1 rounded-full mb-3 mx-1 overflow-x-auto no-scrollbar border border-white/5 scroll-smooth">
                <div className="flex gap-1 min-w-max px-1">
                    {(Object.keys(toolCategories) as Array<keyof typeof toolCategories>).map((cat) => (
                        <button 
                            key={cat} 
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-1.5 rounded-full text-[7px] font-black uppercase tracking-widest transition-all duration-300 ${activeCategory === cat ? 'bg-white text-black shadow-md scale-105' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Comprehensive 3-Column Tools Grid */}
            <div className="grid grid-cols-3 gap-1.5 p-1 max-h-[380px] overflow-y-auto no-scrollbar scroll-smooth">
                {toolCategories[activeCategory].map(tool => {
                    const isActive = activeTool === tool.id;
                    const LucideIcon = (tool as any).lucide;
                    return (
                        <button 
                            key={tool.id} 
                            onClick={() => onToolSelect(tool.id)}
                            className={`h-18 rounded-[24px] flex flex-col items-center justify-center gap-1 transition-all duration-300 relative group overflow-hidden border ${isActive ? 'bg-[#00e5ff] border-cyan-300 text-black shadow-[0_10px_25px_rgba(0,229,255,0.4)] scale-105 z-10' : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:bg-white/[0.05] hover:border-white/10'}`}
                        >
                            {isActive && <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />}
                            <div className={`transition-all duration-300 ${isActive ? 'scale-110 drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]' : 'group-hover:scale-105 group-hover:text-white'}`}>
                                {LucideIcon ? <LucideIcon size={24} strokeWidth={isActive ? 2.5 : 2} /> : ((tool as any).content || <NotationIcon type={(tool as any).icon} active={isActive} />)}
                            </div>
                            <span className={`text-[7px] font-black uppercase tracking-tighter leading-none ${isActive ? 'text-black' : 'text-zinc-600'}`}>
                                {tool.label}
                            </span>
                        </button>
                    );
                })}
                
                {/* Erase Tool is always helpful to have */}
                <button 
                    onClick={() => onToolSelect('delete')}
                    className={`h-18 rounded-[24px] flex flex-col items-center justify-center gap-1 transition-all border ${activeTool === 'delete' ? 'bg-rose-500 border-rose-400 text-white shadow-lg' : 'bg-zinc-900/40 border-white/5 text-zinc-700 hover:text-rose-400 hover:bg-rose-500/10'}`}
                >
                    <Trash2 size={24} />
                    <span className="text-[7px] font-black uppercase tracking-tighter">Erase</span>
                </button>
            </div>
            
            {/* History Controls */}
            <div className="flex items-center mt-4 p-1 bg-black/60 rounded-[28px] mx-1 border border-white/5 gap-1 shadow-inner">
                <button 
                    onClick={onUndo} 
                    disabled={!canUndo} 
                    className="flex-1 h-9 flex items-center justify-center gap-2 rounded-full text-zinc-600 disabled:opacity-10 hover:text-white transition-all active:scale-90"
                >
                    <RotateCcw size={14} />
                    <span className="text-[8px] font-black tracking-tighter uppercase">Undo</span>
                </button>
                <div className="w-px h-4 bg-white/10" />
                <button 
                    onClick={onRedo} 
                    disabled={!canRedo} 
                    className="flex-1 h-9 flex items-center justify-center gap-2 rounded-full text-zinc-600 disabled:opacity-10 hover:text-white transition-all active:scale-90"
                >
                    <span className="text-[8px] font-black tracking-tighter uppercase">Redo</span>
                    <RotateCw size={14} />
                </button>
            </div>
            
            {/* Context Hub */}
            <div className="mt-2 pb-1 flex items-center justify-center gap-1 opacity-20">
                <Zap size={8} className="text-cyan-400" />
                <span className="text-[6px] font-bold text-white uppercase tracking-widest">Neural Suite V1.1</span>
            </div>
        </div>
    );
};

export default EngraverCommandCenter;
