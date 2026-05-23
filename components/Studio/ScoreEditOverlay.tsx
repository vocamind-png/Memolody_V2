/**
 * ScoreEditOverlay — Direct-on-Score Note Editor
 * v2 — with draggable floating toolbar + drag-to-change-pitch
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Trash2, ArrowUp, ArrowDown, ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

export type EditTool = 'select' | 'eraser' | 'pencil';
export type NoteType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd';

interface SelectedNote {
  svgId: string;
  screenX: number;   // centre of note in viewport px
  screenY: number;
  step: string;
  octave: number;
  alter: number;
  durationType: string;
  dots: number;
  isRest: boolean;
  measureNum: number;
  voiceNum: number;
  staff: number;
  xmlIndex: number;  // index in doc.querySelectorAll('note')
}

// ── Music helpers ────────────────────────────────────────────────────

const STEP_SEMI: Record<string, number> = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };
const DURATION_TYPES: NoteType[] = ['whole','half','quarter','eighth','16th','32nd'];
const DUR_LABEL: Record<string,string> = { whole:'W',half:'H',quarter:'Q',eighth:'8','16th':'16','32nd':'32' };

function transposePitch(step: string, octave: number, alter: number, semitones: number) {
  let midi = (octave + 1) * 12 + STEP_SEMI[step] + alter;
  midi = Math.max(21, Math.min(108, midi + semitones));
  const newOct = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  const NAT: [string,number][] = [
    ['C',0],['C',1],['D',0],['E',-1],['E',0],['F',0],
    ['F',1],['G',0],['A',-1],['A',0],['B',-1],['B',0],
  ];
  const [newStep, newAlter] = NAT[pc];
  return { step: newStep, octave: newOct, alter: newAlter };
}

function applyPitchToDoc(doc: Document, noteIdx: number, step: string, octave: number, alter: number) {
  const noteEl = Array.from(doc.querySelectorAll('note'))[noteIdx];
  if (!noteEl) return;
  let pitch = noteEl.querySelector('pitch');
  if (!pitch) { pitch = doc.createElement('pitch'); noteEl.insertBefore(pitch, noteEl.firstChild); }
  const set = (tag: string, val: string) => {
    let el = pitch!.querySelector(tag);
    if (!el) { el = doc.createElement(tag); pitch!.appendChild(el); }
    el.textContent = val;
  };
  set('step', step);
  const existAlter = pitch.querySelector('alter');
  if (alter !== 0) { set('alter', String(alter)); } else if (existAlter) existAlter.parentNode?.removeChild(existAlter);
  set('octave', String(octave));
}

function applyDurationToDoc(doc: Document, noteIdx: number, durType: string) {
  const noteEl = Array.from(doc.querySelectorAll('note'))[noteIdx];
  if (!noteEl) return;
  let typeEl = noteEl.querySelector('type');
  if (!typeEl) { typeEl = doc.createElement('type'); noteEl.appendChild(typeEl); }
  typeEl.textContent = durType;
}

function deleteNoteFromDoc(doc: Document, noteIdx: number) {
  const noteEl = Array.from(doc.querySelectorAll('note'))[noteIdx];
  noteEl?.parentNode?.removeChild(noteEl);
}

function parsePitch(xmlStr: string, noteIdx: number) {
  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const noteEl = Array.from(doc.querySelectorAll('note'))[noteIdx];
    if (!noteEl) return null;
    const step = noteEl.querySelector('pitch > step')?.textContent || 'C';
    const octave = parseInt(noteEl.querySelector('pitch > octave')?.textContent || '4');
    const alter = parseFloat(noteEl.querySelector('pitch > alter')?.textContent || '0');
    const durationType = noteEl.querySelector('type')?.textContent?.trim() || 'quarter';
    const dots = noteEl.querySelectorAll('dot').length;
    const isRest = !!noteEl.querySelector('rest');
    const measureNum = parseInt(noteEl.closest('measure')?.getAttribute('number') || '0');
    const voiceNum = parseInt(noteEl.querySelector('voice')?.textContent || '1');
    const staff = parseInt(noteEl.querySelector('staff')?.textContent || '1');
    return { step, octave, alter, durationType, dots, isRest, measureNum, voiceNum, staff };
  } catch { return null; }
}

// ── Highlight helpers ────────────────────────────────────────────────

function highlightNote(containerEl: HTMLElement, svgId: string, on: boolean) {
  const el = containerEl.querySelector(`#${svgId}`);
  if (!el) return;
  el.querySelectorAll('use, ellipse, rect').forEach(n => {
    const s = n as SVGElement;
    if (on) { s.style.fill = '#06b6d4'; s.style.filter = 'drop-shadow(0 0 4px #06b6d4)'; }
    else     { s.style.fill = ''; s.style.filter = ''; }
  });
}

// ── Draggable hook for toolbar ───────────────────────────────────────

function useDraggableToolbar(initialX: number, initialY: number) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - offset.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return { pos, setPos, onHandleMouseDown };
}

// ── Main Component ────────────────────────────────────────────────────

interface ScoreEditOverlayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  xmlData: string | null;
  isEditable: boolean;
  activeTool: EditTool;
  activeDuration: NoteType;
  onXmlChange: (xml: string, label: string) => void;
  svgPagesCount: number;
}

const ScoreEditOverlay: React.FC<ScoreEditOverlayProps> = ({
  containerRef, xmlData, isEditable, activeTool, activeDuration, onXmlChange, svgPagesCount,
}) => {
  const [selected, setSelected] = useState<SelectedNote | null>(null);
  const toolbar = useDraggableToolbar(window.innerWidth / 2 - 140, 140);

  // Drag-to-pitch state
  const dragStartY = useRef<number | null>(null);
  const dragStartPitch = useRef<{ step: string; octave: number; alter: number } | null>(null);
  const isDraggingNote = useRef(false);
  const dragSemis = useRef(0);

  // Scroll/Drag state for empty space
  const isScrollingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const scrollStartRef = useRef<{ left: number; top: number } | null>(null);
  const hasMovedRef = useRef(false);
  const wasScrollingRef = useRef(false);

  // ── Find note hits ─────────────────────────────────────────────────
  const getNoteHits = useCallback(() => {
    if (!containerRef.current) return [];
    const hits: { svgId: string; rect: DOMRect; xmlIndex: number }[] = [];
    containerRef.current.querySelectorAll('g.note[id]').forEach((g, i) => {
      try {
        const use = g.querySelector('use, ellipse, path') as SVGElement | null;
        const r = (use || g).getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        hits.push({ svgId: (g as Element).id, rect: r, xmlIndex: i });
      } catch { /* skip */ }
    });
    return hits;
  }, [containerRef]);

  // ── Hit test at (clientX, clientY) ────────────────────────────────
  const hitTest = useCallback((cx: number, cy: number) => {
    const hits = getNoteHits();
    let best: typeof hits[0] | null = null;
    let bestDist = 28;
    for (const h of hits) {
      const ncx = h.rect.left + h.rect.width / 2;
      const ncy = h.rect.top + h.rect.height / 2;
      const dist = Math.hypot(cx - ncx, cy - ncy);
      // also check expanded rect
      const inRect = cx >= h.rect.left - 10 && cx <= h.rect.right + 10
                  && cy >= h.rect.top  - 14 && cy <= h.rect.bottom + 14;
      if (dist < bestDist || (inRect && dist < 40)) {
        bestDist = dist;
        best = h;
      }
    }
    return best;
  }, [getNoteHits]);

  // ── Select note ────────────────────────────────────────────────────
  const selectNote = useCallback((hit: ReturnType<typeof hitTest>) => {
    if (!hit || !xmlData) return;
    const data = parsePitch(xmlData, hit.xmlIndex);
    if (!data) return;
    // clear old highlight
    if (selected && containerRef.current) highlightNote(containerRef.current, selected.svgId, false);
    if (containerRef.current) highlightNote(containerRef.current, hit.svgId, true);
    const cx = hit.rect.left + hit.rect.width / 2;
    const cy = hit.rect.top  + hit.rect.height / 2;
    setSelected({ svgId: hit.svgId, screenX: cx, screenY: cy, xmlIndex: hit.xmlIndex, ...data });
    // auto-position toolbar above the note if far away
    toolbar.setPos(prev => ({
      x: Math.max(8, Math.min(window.innerWidth - 300, cx - 140)),
      y: Math.max(60, cy - 130),
    }));
  }, [xmlData, selected, containerRef, toolbar]);

  // ── Commit XML ────────────────────────────────────────────────────
  const commitPitch = useCallback((step: string, octave: number, alter: number, noteIdx: number) => {
    if (!xmlData) return;
    const doc = new DOMParser().parseFromString(xmlData, 'text/xml');
    applyPitchToDoc(doc, noteIdx, step, octave, alter);
    onXmlChange(new XMLSerializer().serializeToString(doc), `Pitch → ${step}${octave}`);
  }, [xmlData, onXmlChange]);

  const changePitch = useCallback((semitones: number) => {
    if (!selected || !xmlData) return;
    const { step, octave, alter } = transposePitch(selected.step, selected.octave, selected.alter, semitones);
    commitPitch(step, octave, alter, selected.xmlIndex);
    setSelected(s => s ? { ...s, step, octave, alter } : null);
  }, [selected, xmlData, commitPitch]);

  const changeDuration = useCallback((durType: NoteType) => {
    if (!selected || !xmlData) return;
    const doc = new DOMParser().parseFromString(xmlData, 'text/xml');
    applyDurationToDoc(doc, selected.xmlIndex, durType);
    onXmlChange(new XMLSerializer().serializeToString(doc), `Duration → ${durType}`);
    setSelected(s => s ? { ...s, durationType: durType } : null);
  }, [selected, xmlData, onXmlChange]);

  const deleteSelected = useCallback(() => {
    if (!selected || !xmlData) return;
    if (containerRef.current) highlightNote(containerRef.current, selected.svgId, false);
    const doc = new DOMParser().parseFromString(xmlData, 'text/xml');
    deleteNoteFromDoc(doc, selected.xmlIndex);
    onXmlChange(new XMLSerializer().serializeToString(doc), 'Delete note');
    setSelected(null);
  }, [selected, xmlData, onXmlChange, containerRef]);

  // ── Mouse handlers ─────────────────────────────────────────────────
  const onOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isEditable || !xmlData) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      // Empty space -> scroll/drag
      const scrollContainer = containerRef.current?.querySelector('.memolody-scrollbar') as HTMLElement | null;
      if (scrollContainer) {
        isScrollingRef.current = true;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        scrollStartRef.current = { left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop };
        hasMovedRef.current = false;
        wasScrollingRef.current = false;
      }
      return;
    }

    if (activeTool === 'eraser') {
      if (containerRef.current) highlightNote(containerRef.current, hit.svgId, false);
      const doc = new DOMParser().parseFromString(xmlData, 'text/xml');
      deleteNoteFromDoc(doc, hit.xmlIndex);
      onXmlChange(new XMLSerializer().serializeToString(doc), 'Erase note');
      if (selected?.svgId === hit.svgId) setSelected(null);
      return;
    }

    // SELECT: begin potential drag-to-pitch
    selectNote(hit);
    dragStartY.current = e.clientY;
    dragSemis.current = 0;
    const data = parsePitch(xmlData, hit.xmlIndex);
    dragStartPitch.current = data ? { step: data.step, octave: data.octave, alter: data.alter } : null;
    isDraggingNote.current = false;
  }, [isEditable, xmlData, activeTool, hitTest, selectNote, selected, containerRef, onXmlChange]);

  const onOverlayMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isEditable) return;

    if (isScrollingRef.current && dragStartRef.current && scrollStartRef.current) {
      const scrollContainer = containerRef.current?.querySelector('.memolody-scrollbar') as HTMLElement | null;
      if (scrollContainer) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.hypot(dx, dy) > 3) {
          hasMovedRef.current = true;
        }
        scrollContainer.style.scrollBehavior = 'auto';
        scrollContainer.scrollLeft = scrollStartRef.current.left - dx;
        scrollContainer.scrollTop = scrollStartRef.current.top - dy;
      }
      return;
    }

    if (dragStartY.current === null || !dragStartPitch.current || !selected) return;
    const deltaY = dragStartY.current - e.clientY; // positive = up = higher pitch
    const semis = Math.round(deltaY / 10);          // 10px per semitone
    if (Math.abs(deltaY) > 5) isDraggingNote.current = true;
    if (semis !== dragSemis.current) {
      dragSemis.current = semis;
      const { step, octave, alter } = transposePitch(
        dragStartPitch.current.step, dragStartPitch.current.octave, dragStartPitch.current.alter, semis
      );
      // Live preview: just update selected display, commit on mouseup
      setSelected(s => s ? { ...s, step, octave, alter } : null);
    }
  }, [isEditable, selected, containerRef]);

  const onOverlayMouseUp = useCallback((e: React.MouseEvent) => {
    if (isScrollingRef.current) {
      isScrollingRef.current = false;
      dragStartRef.current = null;
      scrollStartRef.current = null;
      if (hasMovedRef.current) {
        wasScrollingRef.current = true;
      }
      const scrollContainer = containerRef.current?.querySelector('.memolody-scrollbar') as HTMLElement | null;
      if (scrollContainer) {
        scrollContainer.style.scrollBehavior = '';
      }
      return;
    }

    if (dragStartY.current === null || !dragStartPitch.current || !selected || !xmlData) {
      dragStartY.current = null;
      return;
    }
    if (isDraggingNote.current && dragSemis.current !== 0) {
      const { step, octave, alter } = transposePitch(
        dragStartPitch.current.step, dragStartPitch.current.octave, dragStartPitch.current.alter, dragSemis.current
      );
      commitPitch(step, octave, alter, selected.xmlIndex);
      setSelected(s => s ? { ...s, step, octave, alter } : null);
    }
    dragStartY.current = null;
    dragStartPitch.current = null;
    isDraggingNote.current = false;
  }, [selected, xmlData, commitPitch, containerRef]);

  const onOverlayClick = useCallback((e: React.MouseEvent) => {
    if (wasScrollingRef.current) {
      wasScrollingRef.current = false;
      return; // was scrolling drag, do nothing
    }
    if (isDraggingNote.current) return; // was a drag, not a click
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit && selected) {
      // Click empty area → deselect
      if (containerRef.current) highlightNote(containerRef.current, selected.svgId, false);
      setSelected(null);
    }
  }, [hitTest, selected, containerRef]);

  // ── Touch handlers ─────────────────────────────────────────────────
  const onOverlayTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isEditable || !xmlData) return;
    const touch = e.touches[0];
    const hit = hitTest(touch.clientX, touch.clientY);
    if (!hit) {
      // Empty space -> scroll/drag
      const scrollContainer = containerRef.current?.querySelector('.memolody-scrollbar') as HTMLElement | null;
      if (scrollContainer) {
        isScrollingRef.current = true;
        dragStartRef.current = { x: touch.clientX, y: touch.clientY };
        scrollStartRef.current = { left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop };
        hasMovedRef.current = false;
        wasScrollingRef.current = false;
      }
      return;
    }

    if (activeTool === 'eraser') {
      if (containerRef.current) highlightNote(containerRef.current, hit.svgId, false);
      const doc = new DOMParser().parseFromString(xmlData, 'text/xml');
      deleteNoteFromDoc(doc, hit.xmlIndex);
      onXmlChange(new XMLSerializer().serializeToString(doc), 'Erase note');
      if (selected?.svgId === hit.svgId) setSelected(null);
      return;
    }

    // SELECT note on touch
    selectNote(hit);
    dragStartY.current = touch.clientY;
    dragSemis.current = 0;
    const data = parsePitch(xmlData, hit.xmlIndex);
    dragStartPitch.current = data ? { step: data.step, octave: data.octave, alter: data.alter } : null;
    isDraggingNote.current = false;
  }, [isEditable, xmlData, activeTool, hitTest, selectNote, selected, containerRef, onXmlChange]);

  const onOverlayTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isEditable) return;
    const touch = e.touches[0];

    if (isScrollingRef.current && dragStartRef.current && scrollStartRef.current) {
      const scrollContainer = containerRef.current?.querySelector('.memolody-scrollbar') as HTMLElement | null;
      if (scrollContainer) {
        const dx = touch.clientX - dragStartRef.current.x;
        const dy = touch.clientY - dragStartRef.current.y;
        if (Math.hypot(dx, dy) > 3) {
          hasMovedRef.current = true;
        }
        scrollContainer.style.scrollBehavior = 'auto';
        scrollContainer.scrollLeft = scrollStartRef.current.left - dx;
        scrollContainer.scrollTop = scrollStartRef.current.top - dy;
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (dragStartY.current === null || !dragStartPitch.current || !selected) return;
    const deltaY = dragStartY.current - touch.clientY;
    const semis = Math.round(deltaY / 10);
    if (Math.abs(deltaY) > 5) isDraggingNote.current = true;
    if (semis !== dragSemis.current) {
      dragSemis.current = semis;
      const { step, octave, alter } = transposePitch(
        dragStartPitch.current.step, dragStartPitch.current.octave, dragStartPitch.current.alter, semis
      );
      setSelected(s => s ? { ...s, step, octave, alter } : null);
    }
    if (e.cancelable) e.preventDefault();
  }, [isEditable, selected, containerRef]);

  const onOverlayTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isScrollingRef.current) {
      isScrollingRef.current = false;
      dragStartRef.current = null;
      scrollStartRef.current = null;
      if (hasMovedRef.current) {
        wasScrollingRef.current = true;
      }
      const scrollContainer = containerRef.current?.querySelector('.memolody-scrollbar') as HTMLElement | null;
      if (scrollContainer) {
        scrollContainer.style.scrollBehavior = '';
      }
      return;
    }

    if (dragStartY.current === null || !dragStartPitch.current || !selected || !xmlData) {
      dragStartY.current = null;
      return;
    }
    if (isDraggingNote.current && dragSemis.current !== 0) {
      const { step, octave, alter } = transposePitch(
        dragStartPitch.current.step, dragStartPitch.current.octave, dragStartPitch.current.alter, dragSemis.current
      );
      commitPitch(step, octave, alter, selected.xmlIndex);
      setSelected(s => s ? { ...s, step, octave, alter } : null);
    }
    dragStartY.current = null;
    dragStartPitch.current = null;
    isDraggingNote.current = false;
  }, [selected, xmlData, commitPitch, containerRef]);

  // ── Keyboard ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditable) return;
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'Delete': case 'Backspace': e.preventDefault(); deleteSelected(); break;
        case 'ArrowUp':   e.preventDefault(); changePitch(e.shiftKey ? 12 : 1);  break;
        case 'ArrowDown': e.preventDefault(); changePitch(e.shiftKey ? -12 : -1); break;
        case 'Enter':
          // Confirm/deselect
          if (containerRef.current) highlightNote(containerRef.current, selected.svgId, false);
          setSelected(null);
          break;
        case 'Escape':
          if (containerRef.current) highlightNote(containerRef.current, selected.svgId, false);
          setSelected(null);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditable, selected, deleteSelected, changePitch, containerRef]);

  // Clear on score re-render
  useEffect(() => { setSelected(null); }, [svgPagesCount]);

  if (!isEditable) return null;

  // ── Note label display ─────────────────────────────────────────────
  const noteLabel = selected
    ? selected.isRest ? '𝄽 Rest'
    : `${selected.step}${selected.alter===1?'♯':selected.alter===-1?'♭':selected.alter===2?'𝄪':selected.alter===-2?'𝄫':''}${selected.octave}`
    : '';

  const cursorStyle = activeTool === 'eraser' ? 'crosshair' : activeTool === 'pencil' ? 'cell' : 'default';

  return (
    <>
      {/* Score interaction layer */}
      <div
        className="absolute inset-0 z-[100]"
        style={{ cursor: cursorStyle }}
        onMouseDown={onOverlayMouseDown}
        onMouseMove={onOverlayMouseMove}
        onMouseUp={onOverlayMouseUp}
        onClick={onOverlayClick}
        onTouchStart={onOverlayTouchStart}
        onTouchMove={onOverlayTouchMove}
        onTouchEnd={onOverlayTouchEnd}
      />

      {/* Drag pitch indicator stripe */}
      {isDraggingNote.current && selected && dragSemis.current !== 0 && (
        <div
          className="fixed z-[300] pointer-events-none px-3 py-1 bg-cyan-500 text-black text-[10px] font-black rounded-full shadow-lg"
          style={{ left: selected.screenX, top: selected.screenY - 50, transform: 'translateX(-50%)' }}
        >
          {dragSemis.current > 0 ? `+${dragSemis.current}` : dragSemis.current} semitones → {noteLabel}
        </div>
      )}

      {/* Floating, draggable Note Toolbar */}
      {selected && activeTool === 'select' && (
        <div
          className="fixed z-[250] pointer-events-auto select-none"
          style={{ left: toolbar.pos.x, top: toolbar.pos.y }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <div
            className="rounded-2xl shadow-2xl border border-white/10 overflow-hidden min-w-[280px]"
            style={{
              background: 'linear-gradient(135deg,rgba(8,8,18,1),rgba(14,14,28,1))',
              animation: 'floatIn 0.15s ease-out',
            }}
          >
            {/* Drag Handle */}
            <div
              className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-white/5 cursor-move"
              onMouseDown={toolbar.onHandleMouseDown}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal size={12} className="text-zinc-600" />
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">{noteLabel}</span>
                <span className="text-[7px] text-zinc-600">M{selected.measureNum}</span>
              </div>
              <button
                onClick={() => {
                  if (containerRef.current) highlightNote(containerRef.current, selected.svgId, false);
                  setSelected(null);
                }}
                className="w-4 h-4 flex items-center justify-center text-zinc-600 hover:text-white"
              >
                ×
              </button>
            </div>

            {/* Pitch controls */}
            <div className="flex items-center px-2 py-2 gap-1">
              {/* Octave up */}
              <button onClick={() => changePitch(12)}
                className="w-8 h-8 flex flex-col items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-all active:scale-90"
                title="Octave up (+12)">
                <ChevronUp size={10}/><ChevronUp size={10} className="-mt-1.5"/>
              </button>
              {/* Semitone up */}
              <button onClick={() => changePitch(1)}
                className="flex-1 h-8 flex items-center justify-center gap-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 text-[9px] font-black transition-all active:scale-90"
                title="↑ semitone (↑)">
                <ArrowUp size={12}/> UP
              </button>
              {/* Semitone down */}
              <button onClick={() => changePitch(-1)}
                className="flex-1 h-8 flex items-center justify-center gap-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 text-[9px] font-black transition-all active:scale-90"
                title="↓ semitone (↓)">
                <ArrowDown size={12}/> DOWN
              </button>
              {/* Octave down */}
              <button onClick={() => changePitch(-12)}
                className="w-8 h-8 flex flex-col items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-all active:scale-90"
                title="Octave down (-12)">
                <ChevronDown size={10}/><ChevronDown size={10} className="-mt-1.5"/>
              </button>
            </div>

            {/* Duration row */}
            <div className="flex items-center px-2 pb-2 gap-1">
              {DURATION_TYPES.map(d => (
                <button key={d} onClick={() => changeDuration(d)}
                  className={`flex-1 h-7 text-[8px] font-black rounded-lg transition-all active:scale-90 ${
                    selected.durationType === d ? 'bg-cyan-500 text-black' : 'bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white'
                  }`} title={d}>
                  {DUR_LABEL[d]}
                </button>
              ))}
              <div className="w-px h-4 bg-white/10 mx-0.5"/>
              {/* Delete */}
              <button onClick={deleteSelected}
                className="w-8 h-7 flex items-center justify-center rounded-lg bg-rose-500/20 hover:bg-rose-500/60 text-rose-400 hover:text-white transition-all active:scale-90"
                title="Delete (Del)">
                <Trash2 size={12}/>
              </button>
            </div>

            {/* Hint row */}
            <div className="px-3 pb-2 text-[7px] text-zinc-700 text-center">
              Drag note ↑↓ to change pitch · Arrow keys · Shift+↑↓ octave · Del to delete · Enter to confirm
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes floatIn {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </>
  );
};

export default ScoreEditOverlay;
