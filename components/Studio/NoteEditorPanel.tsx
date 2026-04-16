
/**
 * NoteEditorPanel — Full MusicXML Note Editor
 * 
 * Features:
 *   - Parse MusicXML and list all notes by measure
 *   - Click a note → edit pitch, duration, accidental, ties, rests
 *   - Add note / Delete note / Insert rest
 *   - Changes update MusicXML in real-time via onXmlChange
 *   - Undo support (parent manages history)
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Music2, Trash2, Plus, ChevronLeft, ChevronRight,
  RotateCcw, Check, X, Hash, Minus, MoveVertical
} from 'lucide-react';

interface NoteData {
  id: string;           // unique key
  measureNum: number;
  voiceNum: number;
  staff: number;
  isRest: boolean;
  isChord: boolean;
  step: string;         // C D E F G A B
  octave: number;
  alter: number;        // -2 -1 0 1 2
  durationType: string; // whole half quarter eighth 16th 32nd
  dots: number;
  tieStart: boolean;
  tieStop: boolean;
  slur: boolean;
  noteIndex: number;    // index within measure's note list
  rawXml: string;       // original <note>...</note> xml fragment
}

interface NoteEditorPanelProps {
  xmlData: string | null;
  onXmlChange: (xml: string, label: string) => void;
  onClose: () => void;
}

// ── Duration helpers ─────────────────────────────────────────────────
const DURATION_TYPES = [
  { key: 'whole',   label: '𝅝', name: 'Whole',    abbr: 'W' },
  { key: 'half',    label: '𝅗𝅥', name: 'Half',     abbr: 'H' },
  { key: 'quarter', label: '♩', name: 'Quarter',  abbr: 'Q' },
  { key: 'eighth',  label: '♪', name: 'Eighth',   abbr: '8' },
  { key: '16th',    label: '𝅘𝅥𝅯', name: '16th',    abbr: '16' },
  { key: '32nd',    label: '𝅘𝅥𝅰', name: '32nd',    abbr: '32' },
];

const NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTALS = [
  { alter: -2, label: '𝄫', name: 'Double flat' },
  { alter: -1, label: '♭', name: 'Flat' },
  { alter: 0,  label: '♮', name: 'Natural' },
  { alter: 1,  label: '♯', name: 'Sharp' },
  { alter: 2,  label: '𝄪', name: 'Double sharp' },
];
const OCTAVES = [2, 3, 4, 5, 6, 7];
const VOICES = [1, 2, 3, 4, 5];

// ── MusicXML helper: parse notes from XML string ─────────────────────
function parseNotesFromXml(xmlStr: string): { notes: NoteData[]; totalMeasures: number } {
  if (!xmlStr) return { notes: [], totalMeasures: 0 };
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    if (doc.querySelector('parsererror')) return { notes: [], totalMeasures: 0 };

    const notes: NoteData[] = [];
    let noteIndex = 0;
    const measures = doc.querySelectorAll('measure');
    const totalMeasures = measures.length;

    measures.forEach((measure) => {
      const msNum = parseInt(measure.getAttribute('number') || '0');
      const noteEls = measure.querySelectorAll('note');

      noteEls.forEach((noteEl, ni) => {
        const isRest = !!noteEl.querySelector('rest');
        const isChord = !!noteEl.querySelector('chord');
        const stepEl = noteEl.querySelector('pitch > step');
        const octEl = noteEl.querySelector('pitch > octave');
        const alterEl = noteEl.querySelector('pitch > alter');
        const typeEl = noteEl.querySelector('type');
        const dots = noteEl.querySelectorAll('dot').length;
        const tieEls = Array.from(noteEl.querySelectorAll('tie'));
        const voice = parseInt(noteEl.querySelector('voice')?.textContent || '1');
        const staff = parseInt(noteEl.querySelector('staff')?.textContent || '1');

        const step = stepEl?.textContent || 'C';
        const octave = parseInt(octEl?.textContent || '4');
        const alter = parseFloat(alterEl?.textContent || '0');
        const durType = typeEl?.textContent?.trim() || 'quarter';

        const tieStart = tieEls.some(t => t.getAttribute('type') === 'start');
        const tieStop = tieEls.some(t => t.getAttribute('type') === 'stop');
        const slur = !!noteEl.querySelector('notations slur');

        const id = `m${msNum}-n${ni}-v${voice}`;

        notes.push({
          id,
          measureNum: msNum,
          voiceNum: voice,
          staff,
          isRest,
          isChord,
          step,
          octave,
          alter,
          durationType: durType,
          dots,
          tieStart,
          tieStop,
          slur,
          noteIndex: noteIndex++,
          rawXml: noteEl.outerHTML || '',
        });
      });
    });

    return { notes, totalMeasures };
  } catch {
    return { notes: [], totalMeasures: 0 };
  }
}

// ── Apply note edit back to MusicXML ─────────────────────────────────
function applyNoteEdit(xmlStr: string, original: NoteData, updated: Partial<NoteData>): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    if (doc.querySelector('parsererror')) return xmlStr;

    const measures = doc.querySelectorAll('measure');
    const targetMeasure = Array.from(measures).find(
      m => parseInt(m.getAttribute('number') || '0') === original.measureNum
    );
    if (!targetMeasure) return xmlStr;

    const noteEls = Array.from(targetMeasure.querySelectorAll('note'));
    // Match by position within measure, filtering by voice
    const measureNotes = noteEls.filter((_, i) => {
      const voice = parseInt(noteEls[i].querySelector('voice')?.textContent || '1');
      const staff = parseInt(noteEls[i].querySelector('staff')?.textContent || '1');
      return voice === original.voiceNum && staff === original.staff;
    });

    // Find the target note by index (simplified — match voice+staff+position)
    let targetNote: Element | null = null;
    let matchCount = 0;
    for (const noteEl of noteEls) {
      const voice = parseInt(noteEl.querySelector('voice')?.textContent || '1');
      const staff = parseInt(noteEl.querySelector('staff')?.textContent || '1');
      if (voice === original.voiceNum && staff === original.staff) {
        if (matchCount === 0) {
          targetNote = noteEl;
          // Find more specifically by comparing the raw note type and octave
          const step = noteEl.querySelector('pitch > step')?.textContent || '';
          const oct = noteEl.querySelector('pitch > octave')?.textContent || '';
          const type = noteEl.querySelector('type')?.textContent || '';
          if (step === original.step && oct === String(original.octave) && type === original.durationType) {
            break;
          }
        }
        matchCount++;
      }
    }

    // Better: find by matching original raw XML note type tag
    if (!targetNote) {
      for (const noteEl of noteEls) {
        const voice = parseInt(noteEl.querySelector('voice')?.textContent || '1');
        const step = noteEl.querySelector('pitch > step')?.textContent || '';
        const oct = noteEl.querySelector('pitch > octave')?.textContent || '';
        const type = noteEl.querySelector('type')?.textContent || '';
        if (voice === original.voiceNum &&
            step === original.step &&
            oct === String(original.octave) &&
            type === original.durationType) {
          targetNote = noteEl;
          break;
        }
      }
    }

    if (!targetNote) return xmlStr;

    // Apply changes
    const merged = { ...original, ...updated };

    if (!merged.isRest) {
      // Ensure pitch element exists
      let pitchEl = targetNote.querySelector('pitch');
      if (!pitchEl) {
        pitchEl = doc.createElement('pitch');
        targetNote.insertBefore(pitchEl, targetNote.firstChild);
      }

      let stepEl = pitchEl.querySelector('step');
      if (!stepEl) { stepEl = doc.createElement('step'); pitchEl.appendChild(stepEl); }
      stepEl.textContent = merged.step;

      let alterEl = pitchEl.querySelector('alter');
      if (merged.alter !== 0) {
        if (!alterEl) { alterEl = doc.createElement('alter'); pitchEl.appendChild(alterEl); }
        alterEl.textContent = String(merged.alter);
      } else {
        alterEl?.parentNode?.removeChild(alterEl);
      }

      let octEl = pitchEl.querySelector('octave');
      if (!octEl) { octEl = doc.createElement('octave'); pitchEl.appendChild(octEl); }
      octEl.textContent = String(merged.octave);

      // Remove rest if converting
      const restEl = targetNote.querySelector('rest');
      if (restEl) restEl.parentNode?.removeChild(restEl);
    } else {
      // Convert to rest
      let pitchEl = targetNote.querySelector('pitch');
      if (pitchEl) pitchEl.parentNode?.removeChild(pitchEl);
      if (!targetNote.querySelector('rest')) {
        const restEl = doc.createElement('rest');
        targetNote.insertBefore(restEl, targetNote.firstChild);
      }
    }

    // Duration type
    let typeEl = targetNote.querySelector('type');
    if (!typeEl) { typeEl = doc.createElement('type'); targetNote.appendChild(typeEl); }
    typeEl.textContent = merged.durationType;

    // Dots
    Array.from(targetNote.querySelectorAll('dot')).forEach(d => d.parentNode?.removeChild(d));
    for (let i = 0; i < merged.dots; i++) {
      const dotEl = doc.createElement('dot');
      targetNote.appendChild(dotEl);
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (e) {
    console.error('[NoteEditor] Edit failed:', e);
    return xmlStr;
  }
}

// ── Delete note from XML ──────────────────────────────────────────────
function deleteNoteFromXml(xmlStr: string, note: NoteData): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    const measures = doc.querySelectorAll('measure');
    const targetMeasure = Array.from(measures).find(
      m => parseInt(m.getAttribute('number') || '0') === note.measureNum
    );
    if (!targetMeasure) return xmlStr;

    const noteEls = Array.from(targetMeasure.querySelectorAll('note'));
    for (const noteEl of noteEls) {
      const voice = parseInt(noteEl.querySelector('voice')?.textContent || '1');
      const step = noteEl.querySelector('pitch > step')?.textContent || '';
      const oct = noteEl.querySelector('pitch > octave')?.textContent || '';
      const type = noteEl.querySelector('type')?.textContent || '';
      if (voice === note.voiceNum && step === note.step && oct === String(note.octave) && type === note.durationType) {
        noteEl.parentNode?.removeChild(noteEl);
        break;
      }
    }
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return xmlStr;
  }
}

// ── Main Component ────────────────────────────────────────────────────
const NoteEditorPanel: React.FC<NoteEditorPanelProps> = ({ xmlData, onXmlChange, onClose }) => {
  const [currentMeasure, setCurrentMeasure] = useState(1);
  const [selectedNote, setSelectedNote] = useState<NoteData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editState, setEditState] = useState<Partial<NoteData>>({});
  const [filterStaff, setFilterStaff] = useState<number | null>(null);

  const { notes, totalMeasures } = useMemo(
    () => parseNotesFromXml(xmlData || ''),
    [xmlData]
  );

  const measureNotes = useMemo(
    () => notes.filter(n => n.measureNum === currentMeasure &&
      (filterStaff === null || n.staff === filterStaff)),
    [notes, currentMeasure, filterStaff]
  );

  const handleSelectNote = useCallback((note: NoteData) => {
    setSelectedNote(note);
    setEditState({
      step: note.step,
      octave: note.octave,
      alter: note.alter,
      durationType: note.durationType,
      dots: note.dots,
      isRest: note.isRest,
      tieStart: note.tieStart,
      tieStop: note.tieStop,
    });
    setEditMode(false);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!selectedNote || !xmlData) return;
    const newXml = applyNoteEdit(xmlData, selectedNote, editState);
    onXmlChange(newXml, `Edit note in measure ${selectedNote.measureNum}`);

    // Re-select with updated data
    const { notes: newNotes } = parseNotesFromXml(newXml);
    const updated = newNotes.find(n =>
      n.measureNum === selectedNote.measureNum &&
      n.voiceNum === selectedNote.voiceNum
    );
    setSelectedNote(updated || null);
    setEditMode(false);
  }, [selectedNote, xmlData, editState, onXmlChange]);

  const handleDeleteNote = useCallback(() => {
    if (!selectedNote || !xmlData) return;
    if (!window.confirm('ลบโน้ตนี้?')) return;
    const newXml = deleteNoteFromXml(xmlData, selectedNote);
    onXmlChange(newXml, `Delete note in measure ${selectedNote.measureNum}`);
    setSelectedNote(null);
    setEditMode(false);
  }, [selectedNote, xmlData, onXmlChange]);

  const getNoteName = (note: NoteData) => {
    if (note.isRest) return 'REST';
    const acc = note.alter === 1 ? '#' : note.alter === -1 ? 'b' : note.alter === 2 ? '##' : note.alter === -2 ? 'bb' : '';
    return `${note.step}${acc}${note.octave}`;
  };

  const getDurLabel = (type: string, dots: number) => {
    const d = DURATION_TYPES.find(d => d.key === type);
    return (d?.abbr || type) + (dots === 1 ? '.' : dots === 2 ? '..' : '');
  };

  return (
    <div className="flex flex-col h-full bg-[#090910] text-white overflow-hidden">
      {/* Header */}
      <div className="h-12 bg-[#0d0d14] border-b border-white/5 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Music2 size={14} className="text-cyan-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300">Note Editor</span>
        </div>
        <button onClick={onClose} className="p-1 text-zinc-600 hover:text-white">
          <X size={14} />
        </button>
      </div>

      {/* Measure Navigator */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/20 shrink-0">
        <button
          onClick={() => { setCurrentMeasure(m => Math.max(1, m - 1)); setSelectedNote(null); }}
          disabled={currentMeasure <= 1}
          className="p-1 text-zinc-500 hover:text-white disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
          Measure
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={totalMeasures}
            value={currentMeasure}
            onChange={e => {
              const v = Math.max(1, Math.min(totalMeasures, parseInt(e.target.value) || 1));
              setCurrentMeasure(v);
              setSelectedNote(null);
            }}
            className="w-12 bg-white/5 border border-white/10 rounded-lg text-center text-[10px] font-black text-white py-1 outline-none"
          />
          <span className="text-[9px] text-zinc-600">/ {totalMeasures}</span>
        </div>
        <button
          onClick={() => { setCurrentMeasure(m => Math.min(totalMeasures, m + 1)); setSelectedNote(null); }}
          disabled={currentMeasure >= totalMeasures}
          className="p-1 text-zinc-500 hover:text-white disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>

        {/* Staff filter */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[8px] text-zinc-600 uppercase">Staff:</span>
          {[null, 1, 2].map(s => (
            <button
              key={String(s)}
              onClick={() => setFilterStaff(s)}
              className={`px-2 py-0.5 text-[8px] font-black rounded-md uppercase transition-all ${
                filterStaff === s ? 'bg-cyan-500 text-black' : 'bg-white/5 text-zinc-500 hover:text-white'
              }`}
            >
              {s === null ? 'All' : `S${s}`}
            </button>
          ))}
        </div>
      </div>

      {/* Note List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {measureNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-[9px] uppercase tracking-widest">
            <Music2 size={24} className="mb-2 opacity-30" />
            No notes in this measure
          </div>
        ) : (
          <div className="p-2 grid gap-1">
            {measureNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => handleSelectNote(note)}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all active:scale-[0.98] flex items-center gap-3 ${
                  selectedNote?.id === note.id
                    ? 'bg-cyan-500/20 border border-cyan-500/40'
                    : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]'
                }`}
              >
                {/* Voice badge */}
                <div className={`w-5 h-5 rounded-md text-[7px] font-black flex items-center justify-center shrink-0 ${
                  [,'bg-cyan-500/20 text-cyan-400','bg-rose-500/20 text-rose-400','bg-amber-500/20 text-amber-400'][note.staff] || 'bg-white/10 text-white'
                }`}>
                  {note.isChord ? '⋮' : `S${note.staff}`}
                </div>

                {/* Note info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[13px] font-black leading-none ${
                      note.isRest ? 'text-zinc-500' : 'text-white'
                    }`}>
                      {getNoteName(note)}
                    </span>
                    <span className="text-[8px] font-bold text-zinc-500 uppercase">
                      {getDurLabel(note.durationType, note.dots)}
                    </span>
                    {note.tieStart && <span className="text-[7px] text-amber-400">TIE→</span>}
                    {note.tieStop && <span className="text-[7px] text-amber-400">→TIE</span>}
                    {note.slur && <span className="text-[7px] text-purple-400">SLUR</span>}
                    {note.isChord && <span className="text-[7px] text-cyan-400">CHORD</span>}
                  </div>
                  <div className="text-[7px] text-zinc-600 mt-0.5">V{note.voiceNum}</div>
                </div>

                {selectedNote?.id === note.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {selectedNote && (
        <div className="border-t border-white/10 bg-[#0a0a12] p-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400">
              {editMode ? '✏️ Editing' : 'Selected'}: {getNoteName(selectedNote)}
            </span>
            <div className="flex items-center gap-2">
              {!editMode && (
                <>
                  <button
                    onClick={() => setEditMode(true)}
                    className="px-3 py-1.5 bg-cyan-500 text-black text-[8px] font-black uppercase rounded-lg hover:bg-cyan-400 transition-all"
                  >
                    EDIT
                  </button>
                  <button
                    onClick={handleDeleteNote}
                    className="p-1.5 bg-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-500/30 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
              {editMode && (
                <>
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1.5 bg-emerald-500 text-black text-[8px] font-black uppercase rounded-lg hover:bg-emerald-400 flex items-center gap-1"
                  >
                    <Check size={10} /> SAVE
                  </button>
                  <button
                    onClick={() => { setEditMode(false); }}
                    className="p-1.5 bg-white/5 text-zinc-400 rounded-lg hover:bg-white/10"
                  >
                    <RotateCcw size={12} />
                  </button>
                </>
              )}
            </div>
          </div>

          {editMode ? (
            <div className="space-y-3">
              {/* Rest toggle */}
              <div className="flex items-center gap-3">
                <span className="text-[8px] text-zinc-500 uppercase w-16">Type</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditState(s => ({ ...s, isRest: false }))}
                    className={`px-3 py-1 text-[8px] font-black uppercase rounded-lg transition-all ${
                      !editState.isRest ? 'bg-cyan-500 text-black' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    ♩ Note
                  </button>
                  <button
                    onClick={() => setEditState(s => ({ ...s, isRest: true }))}
                    className={`px-3 py-1 text-[8px] font-black uppercase rounded-lg transition-all ${
                      editState.isRest ? 'bg-zinc-500 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    𝄽 Rest
                  </button>
                </div>
              </div>

              {/* Pitch — only show if not rest */}
              {!editState.isRest && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-[8px] text-zinc-500 uppercase w-16">Note</span>
                    <div className="flex gap-1 flex-wrap">
                      {NOTES.map(n => (
                        <button
                          key={n}
                          onClick={() => setEditState(s => ({ ...s, step: n }))}
                          className={`w-8 h-8 text-[11px] font-black rounded-lg transition-all ${
                            editState.step === n ? 'bg-cyan-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[8px] text-zinc-500 uppercase w-16">Accid.</span>
                    <div className="flex gap-1">
                      {ACCIDENTALS.map(a => (
                        <button
                          key={a.alter}
                          onClick={() => setEditState(s => ({ ...s, alter: a.alter }))}
                          title={a.name}
                          className={`w-8 h-8 text-[13px] font-black rounded-lg transition-all ${
                            editState.alter === a.alter ? 'bg-amber-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[8px] text-zinc-500 uppercase w-16">Octave</span>
                    <div className="flex gap-1">
                      {OCTAVES.map(o => (
                        <button
                          key={o}
                          onClick={() => setEditState(s => ({ ...s, octave: o }))}
                          className={`w-8 h-8 text-[10px] font-black rounded-lg transition-all ${
                            editState.octave === o ? 'bg-purple-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                          }`}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Duration */}
              <div className="flex items-center gap-3">
                <span className="text-[8px] text-zinc-500 uppercase w-16">Length</span>
                <div className="flex gap-1 flex-wrap">
                  {DURATION_TYPES.map(d => (
                    <button
                      key={d.key}
                      onClick={() => setEditState(s => ({ ...s, durationType: d.key }))}
                      title={d.name}
                      className={`px-2 h-8 text-[9px] font-black rounded-lg transition-all ${
                        editState.durationType === d.key ? 'bg-emerald-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {d.abbr}
                    </button>
                  ))}
                  <button
                    onClick={() => setEditState(s => ({ ...s, dots: s.dots === 1 ? 0 : 1 }))}
                    className={`px-2 h-8 text-[9px] font-black rounded-lg transition-all ${
                      editState.dots === 1 ? 'bg-amber-500 text-black' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    •
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-[8px]">
              {[
                ['Measure', String(selectedNote.measureNum)],
                ['Staff', `S${selectedNote.staff}`],
                ['Voice', `V${selectedNote.voiceNum}`],
                ['Note', getNoteName(selectedNote)],
                ['Duration', getDurLabel(selectedNote.durationType, selectedNote.dots)],
                ['Type', selectedNote.isRest ? 'Rest' : selectedNote.isChord ? 'Chord' : 'Note'],
              ].map(([k, v]) => (
                <div key={k} className="bg-white/[0.03] rounded-lg p-2">
                  <div className="text-zinc-600 uppercase tracking-wider mb-0.5">{k}</div>
                  <div className="font-black text-white">{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NoteEditorPanel;
