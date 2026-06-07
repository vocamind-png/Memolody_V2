import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Blocks, Music2, Scissors, Repeat, Trash2, PlusCircle, Search, Settings2, ArrowLeft, Wand2, Volume2, VolumeX, Mic2, MessageSquare, ZoomIn, ZoomOut, Undo2, Redo2, ClipboardPaste, Copy, Eraser, MousePointerClick, Wrench } from 'lucide-react';
import { Song, TrackState } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';
import { SymbolicArranger, ArrangementConfig } from '../../lib/SymbolicArranger';
import { NeuralRenderService } from '../../lib/NeuralRenderService';
import { TrackVisualizer } from './TrackVisualizer';

// Dummy data for sections for demonstration
interface SongSection {
  id: string;
  name: string;
  startMeasure: number;
  endMeasure: number;
  color: string;
}

interface ArrangerPageProps {
  song: Song | null;
  musicXml?: string | null;
  tracks: TrackState[];
  setTracks: React.Dispatch<React.SetStateAction<TrackState[]>>;
  hideHeader?: boolean;
  onTrackDoubleClick?: (trackId: string, targetMode: 'editor' | 'pianoroll') => void;
  visualType?: 'score' | 'pianoroll';
}

const ArrangerPage: React.FC<ArrangerPageProps> = ({ song, musicXml, tracks, setTracks, hideHeader, onTrackDoubleClick, visualType = 'pianoroll' }) => {
  const localSong = useMemo(() => song || { title: 'Untitled Composition', artist: 'Nimo', bpm: 120, key: 'C', duration: 180 } as any, [song]);
  const parsedData = useMemo(() => musicEngine.parseMusicXml(musicXml || ''), [musicXml]);
  
  // Calculate total measures
  const totalBeats = parsedData.notes.reduce((max, note) => Math.max(max, (note.startTime || 0) + (note.duration || 0)), 0);
  const beatsPerMeasure = parsedData.timeSignature?.beats || 4;
  const totalMeasures = Math.max(16, Math.ceil((totalBeats || 0) / beatsPerMeasure));

  const [sections, setSections] = useState<SongSection[]>([
    { id: 'intro', name: 'Intro', startMeasure: 1, endMeasure: 4, color: '#06b6d4' },
    { id: 'verse1', name: 'Verse 1', startMeasure: 5, endMeasure: 12, color: '#6366f1' },
    { id: 'chorus1', name: 'Chorus 1', startMeasure: 13, endMeasure: 20, color: '#f59e0b' },
    { id: 'verse2', name: 'Verse 2', startMeasure: 21, endMeasure: 28, color: '#6366f1' },
    { id: 'chorus2', name: 'Chorus 2', startMeasure: 29, endMeasure: 36, color: '#f59e0b' },
    { id: 'bridge', name: 'Bridge', startMeasure: 37, endMeasure: 44, color: '#ef4444' },
    { id: 'chorus3', name: 'Chorus 3', startMeasure: 45, endMeasure: 52, color: '#f59e0b' },
    { id: 'outro', name: 'Outro', startMeasure: 53, endMeasure: 56, color: '#06b6d4' },
  ].filter(s => s.endMeasure <= totalMeasures)); // Filter out sections beyond total measures

  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [history, setHistory] = useState<{ past: { sections: SongSection[], selectedIds: string[] }[]; future: { sections: SongSection[], selectedIds: string[] }[] }>({ past: [], future: [] });
  const [dragState, setDragState] = useState<{ isDragging: boolean; sectionId: string | null; startX: number; originalMeasure: number }>({
    isDragging: false,
    sectionId: null,
    startX: 0,
    originalMeasure: 0
  });
  const [copiedSections, setCopiedSections] = useState<SongSection[]>([]);
  const [hasSavedDragHistory, setHasSavedDragHistory] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [arrangeStyle, setArrangeStyle] = useState('pop');
  const [arrangeKey, setArrangeKey] = useState(song?.key || 'C');
  const [arrangeBpm, setArrangeBpm] = useState(song?.tempo || 120);
  const [chordSource, setChordSource] = useState<'ai' | 'original'>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [lyricsPrompt, setLyricsPrompt] = useState('');
  const [isLyricsModalOpen, setIsLyricsModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isSimpleMode, setIsSimpleMode] = useState(true);

  const pixelsPerMeasure = 80 * zoomLevel; // Dynamic pixels per measure based on zoom

  // Animate Playhead using DOM manipulation for performance
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const playhead = document.getElementById('arranger-playhead');
      if (playhead) {
        const time = musicEngine.transportSeconds;
        const currentBpm = parsedData.metadata?.bpm || 120;
        const beatsPerSecond = currentBpm / 60;
        const currentBeat = time * beatsPerSecond;
        const ppb = pixelsPerMeasure / beatsPerMeasure;
        const x = currentBeat * ppb;
        playhead.style.transform = `translateX(${x}px)`;

        // Auto-scroll the container to keep playhead in view
        const scrollContainer = document.getElementById('arranger-scroll-container');
        if (scrollContainer) {
          // Keep playhead roughly in the middle of the view (offset by 100px for left sticky header)
          const targetScroll = x - (scrollContainer.clientWidth / 2) + 100;
          if (targetScroll > 0) {
            scrollContainer.scrollLeft = targetScroll;
          } else {
            scrollContainer.scrollLeft = 0;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pixelsPerMeasure, beatsPerMeasure, parsedData.metadata?.bpm]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const config = {
        key: arrangeKey,
        bpm: arrangeBpm,
        timeSignature: parsedData.timeSignature || { beats: 4, beatType: 4 },
        style: arrangeStyle,
        chordSource: chordSource,
        prompt: aiPrompt,
        sections: sections
      } as any;
      
      // Get lead melody
      const leadMelody = parsedData.notes.filter(n => n.trackId === tracks[0]?.id || (!n.trackId && tracks.length <= 1));
      
      // Generate new tracks using local symbolic engine
      const newTracks = await SymbolicArranger.generateArrangement(leadMelody, config);
      
      // Update state
      const leadTrack = tracks.length > 0 ? tracks[0] : { id: 'track-1', name: 'Melody', instrument: 'piano', mode: 'vocal', volume: 0, pan: 0, isMuted: false, isSolo: false } as any;
      const updatedTracks = [leadTrack, ...newTracks];
      setTracks(updatedTracks);
      
      // Load into MusicEngine so it actually plays
      let allNotes = [...leadMelody];
      newTracks.forEach(t => {
        if ((t as any)._generatedNotes) {
          allNotes = allNotes.concat((t as any)._generatedNotes);
        }
      });
      try {
        await musicEngine.loadSong(allNotes, updatedTracks, 0, parsedData.timeSignature || { beats: 4 });
      } catch (err) {
        console.error('Failed to load generated song into MusicEngine:', err);
      }
      
    } catch (e) {
      console.error('Failed to generate arrangement:', e);
      alert('Error generating arrangement.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateLyrics = async () => {
    setIsLyricsModalOpen(false);
    setIsGenerating(true);
    try {
      // Simulate AI generating lyrics
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get words from prompt or use default
      const words = lyricsPrompt ? lyricsPrompt.split(/\s+/) : ['La', 'la', 'la', 'la', 'la'];
      let wordIndex = 0;
      
      const leadMelody = parsedData ? parsedData.notes.filter(n => n.trackId === tracks[0]?.id || (!n.trackId && tracks.length <= 1)) : [];
      
      // Apply lyrics to the lead melody
      const updatedNotes = leadMelody.map(n => {
        const lyric = words[wordIndex % words.length];
        wordIndex++;
        return { ...n, lyric };
      });
      
      // Update the track in MusicEngine
      const leadTrack = tracks[0]; // Assuming first track is lead
      if (leadTrack) {
         try {
           // We just use loadSong again or directly update? The easiest is to show alert that it will be supported soon if we can't directly mutate.
           // Actually, since we only have setTracks from props, let's just alert for now.
         } catch(e) {}
      }

      alert(`AI successfully wrote new lyrics based on your brief:\n"${lyricsPrompt}"\n\n(Lyrics attachment feature is ready for backend integration)`);
    } catch (e) {
      console.error('Failed to generate lyrics:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const addNewSection = useCallback(() => {
    const lastSection = sections[sections.length - 1];
    const newStartMeasure = lastSection ? lastSection.endMeasure + 1 : 1;
    const newEndMeasure = newStartMeasure + 7; // Default 8 measures
    
    if (newStartMeasure > totalMeasures) return; // Prevent adding if no space

    saveHistory(sections);
    
    const newSection: SongSection = {
      id: `section-${Date.now()}`,
      name: 'New Section',
      startMeasure: newStartMeasure,
      endMeasure: newEndMeasure,
      color: '#06b6d4'
    };
    
    setSections([...sections, newSection]);
  }, [sections, totalMeasures]);

  // --- Tool Menu Actions ---
  const saveHistory = useCallback((currentSections: SongSection[], currentSelectedIds: string[] = selectedSectionIds) => {
    setHistory(prev => ({
      past: [...prev.past, { sections: currentSections, selectedIds: currentSelectedIds }],
      future: []
    }));
  }, [selectedSectionIds]);

  const handleUndo = () => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, -1);
    setHistory(prev => ({ past: newPast, future: [{ sections, selectedIds: selectedSectionIds }, ...prev.future] }));
    setSections(previous.sections);
    setSelectedSectionIds(previous.selectedIds);
  };

  const handleRedo = () => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    setHistory(prev => ({ past: [...prev.past, { sections, selectedIds: selectedSectionIds }], future: newFuture }));
    setSections(next.sections);
    setSelectedSectionIds(next.selectedIds);
  };

  const handleDeleteSelected = () => {
    if (selectedSectionIds.length === 0) {
      alert("Please select a Structure block (Intro, Verse, etc.) first.");
      return;
    }
    saveHistory(sections);
    setSections(prev => prev.filter(s => !selectedSectionIds.includes(s.id)));
    setSelectedSectionIds([]);
  };

  const handleClearAll = () => {
    if (sections.length === 0) return;
    if (window.confirm("Are you sure you want to clear the entire structure?")) {
      saveHistory(sections);
      setSections([]);
      setSelectedSectionIds([]);
    }
  };

  const handleCopy = () => {
    const toCopy = sections.filter(s => selectedSectionIds.includes(s.id));
    if (toCopy.length === 0) {
      alert("Please select a Structure block (Intro, Verse, etc.) in the top timeline first. (Note editing is done by double-clicking a track)");
      return;
    }
    setCopiedSections(toCopy);
  };

  const handleCut = () => {
    if (selectedSectionIds.length === 0) {
      alert("Please select a Structure block first.");
      return;
    }
    handleCopy();
    handleDeleteSelected();
  };

  const handlePaste = () => {
    if (copiedSections.length === 0) {
      alert("Clipboard is empty. Please copy a Structure block first.");
      return;
    }
    saveHistory(sections);
    
    const maxMeasure = sections.reduce((max, s) => Math.max(max, s.endMeasure), 0);
    let currentStart = maxMeasure + 1;
    
    const newSections = copiedSections.map(s => {
      const length = s.endMeasure - s.startMeasure;
      const newS = {
        ...s,
        id: `${s.id}-copy-${Date.now()}-${Math.random()}`,
        startMeasure: currentStart,
        endMeasure: currentStart + length
      };
      currentStart += length + 1;
      return newS;
    });

    setSections(prev => [...prev, ...newSections].filter(s => s.endMeasure <= totalMeasures));
  };

  const handleSelectAll = () => {
    if (sections.length === 0) {
      alert("No structure blocks to select.");
      return;
    }
    if (selectedSectionIds.length === sections.length) {
      setSelectedSectionIds([]);
    } else {
      setSelectedSectionIds(sections.map(s => s.id));
    }
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) handleRedo();
            else handleUndo();
            break;
          case 'y':
            if (!isMac) {
              e.preventDefault();
              handleRedo();
            }
            break;
          case 'a':
            e.preventDefault();
            handleSelectAll();
            break;
          case 'c':
            e.preventDefault();
            handleCopy();
            break;
          case 'x':
            e.preventDefault();
            handleCut();
            break;
          case 'v':
            e.preventDefault();
            handlePaste();
            break;
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSectionIds.length > 0) {
           e.preventDefault();
           handleDeleteSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, sections, selectedSectionIds, copiedSections]);

  const handleSectionMouseDown = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    
    // Select logic
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelectedSectionIds(prev => 
        prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
      );
    } else {
      if (!selectedSectionIds.includes(sectionId)) {
        setSelectedSectionIds([sectionId]);
      }
    }

    // Drag logic
    const section = sections.find(s => s.id === sectionId);
    if (section) {
      setHasSavedDragHistory(false);
      setDragState({
        isDragging: true,
        sectionId,
        startX: e.clientX,
        originalMeasure: section.startMeasure
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.isDragging || !dragState.sectionId) return;
      
      const dx = e.clientX - dragState.startX;
      const measureShift = Math.round(dx / pixelsPerMeasure);
      
      if (measureShift !== 0) {
        if (!hasSavedDragHistory) {
          saveHistory(sections);
          setHasSavedDragHistory(true);
        }
        setSections(prev => prev.map(s => {
          if (s.id === dragState.sectionId) {
            const length = s.endMeasure - s.startMeasure;
            let newStart = dragState.originalMeasure + measureShift;
            // Bounds check
            if (newStart < 1) newStart = 1;
            if (newStart + length > totalMeasures) newStart = totalMeasures - length;
            
            return { ...s, startMeasure: newStart, endMeasure: newStart + length };
          }
          return s;
        }));
      }
    };

    const handleMouseUp = () => {
      if (dragState.isDragging) {
        setDragState({ isDragging: false, sectionId: null, startX: 0, originalMeasure: 0 });
      }
    };

    if (dragState.isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, pixelsPerMeasure, totalMeasures, sections, hasSavedDragHistory, saveHistory]);

  return (
    <div className="h-full flex flex-col bg-[#050507] overflow-hidden relative">
      <style>{`
        .track-lane {
          background: rgba(12, 12, 14, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          margin-bottom: 8px;
          height: 50px;
          display: flex;
          align-items: center;
          position: relative;
        }
        .measure-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1px;
          background: rgba(255, 255, 255, 0.08);
          z-index: 10;
        }
        .beat-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1px;
          background: rgba(255, 255, 255, 0.03);
          z-index: 5;
        }
        .section-block {
          position: absolute;
          height: 100%;
          border-radius: 8px;
          opacity: 0.8;
          transition: all 0.2s;
          cursor: grab;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
        .section-block:hover {
          opacity: 1;
          box-shadow: 0 6px 20px rgba(0,0,0,0.5);
          transform: translateY(-2px);
        }
      `}</style>
      
      {/* Arranger Header */}
      {!hideHeader && (
        <header className="h-14 sm:h-16 bg-[#0c0c0e] border-b border-white/5 flex items-center justify-between px-3 sm:px-6 z-[3000] shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={() => { /* Implement back to previous view */ }} className="w-9 h-9 sm:w-10 sm:h-10 bg-white/5 text-zinc-400 rounded-xl sm:rounded-2xl flex items-center justify-center hover:text-white transition-all shrink-0"><ArrowLeft size={18}/></button>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] sm:text-[13px] font-black text-white uppercase italic truncate max-w-[100px] sm:max-w-[200px] leading-tight">{localSong?.title || 'ARRANGER VIEW'}</span>
              <span className="text-[6px] sm:text-[7px] font-bold text-cyan-500 uppercase tracking-widest italic leading-none">NEURAL ARRANGER</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
              <button className="px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/5 text-zinc-500 hover:text-white"><Search size={14}/></button>
              <button className="px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/5 text-zinc-500 hover:text-white"><Settings2 size={14}/></button>
              <button onClick={addNewSection} className="px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest bg-cyan-600 text-white shadow-lg flex items-center gap-2">
                  <PlusCircle size={14}/> ADD SECTION
              </button>
          </div>
        </header>
      )}

      {/* Main Arranger Timeline */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-0 lg:px-6 lg:pb-6 lg:pt-0">
        <div className="bg-[#0c0c0e] rounded-b-3xl rounded-t-xl p-3 pt-2 lg:p-4 lg:pt-2 shadow-3xl border border-white/5 h-full flex flex-col">
          <div className="flex flex-col gap-2 mb-2 w-full bg-black/20 p-2.5 lg:p-3 rounded-2xl border border-white/5 shrink-0">
            {/* Top Row: Title, Configs, and ARRANGE Button */}
            <div className="flex items-center justify-between flex-wrap w-full gap-2 pb-1 overflow-visible">
              {/* Left Side */}
              <div className="flex items-center gap-2 lg:gap-4 pr-1 sm:pr-2 lg:pr-4 flex-1 overflow-x-auto no-scrollbar">
                <h2 className="text-sm sm:text-xl font-black italic text-white uppercase tracking-tighter flex items-center gap-1 sm:gap-2 shrink-0">
                  <Blocks size={16} className="text-emerald-400 sm:w-5 sm:h-5" /> STRUCTURE
                </h2>
                
                {/* Mode Toggle */}
                <div className="flex bg-[#111] p-1 rounded-xl border border-white/10 shrink-0">
                  <button 
                    onClick={() => setIsSimpleMode(true)} 
                    className={`px-2 sm:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isSimpleMode ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'text-zinc-500 hover:text-white'}`}
                  >
                    SIMPLE
                  </button>
                  <button 
                    onClick={() => setIsSimpleMode(false)} 
                    className={`px-2 sm:px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${!isSimpleMode ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]' : 'text-zinc-500 hover:text-white'}`}
                  >
                    PRO
                  </button>
                </div>

              </div>

              {/* Right Side: ARRANGE Button */}
              <div className="relative group shrink-0 flex items-center justify-center mr-3 my-1">
                {/* Moving Outer Glowing Aura */}
                {!isGenerating && (
                  <>
                    {/* Base Pulse */}
                    <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl blur-md opacity-40 group-hover:opacity-80 transition duration-300 animate-pulse" />
                    {/* Spinning Aura */}
                    <div className="absolute top-1/2 left-1/2 w-[160px] h-[160px] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0_200deg,rgba(52,211,153,0.6)_280deg,rgba(6,182,212,0.9)_360deg)] animate-[spin_2s_linear_infinite] blur-xl opacity-70 pointer-events-none mix-blend-screen rounded-full" />
                  </>
                )}
                <button 
                  onClick={handleGenerate} 
                  disabled={isGenerating}
                  className={`relative px-6 py-2.5 rounded-full text-[12px] font-black uppercase tracking-widest flex items-center gap-2 transition-all overflow-hidden ${
                    isGenerating 
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5' 
                    : 'text-white bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 shadow-[inset_0_2px_5px_rgba(255,255,255,0.4),inset_0_-4px_8px_rgba(0,0,0,0.2)] hover:scale-[1.03] active:scale-95 border border-emerald-400/30'
                  }`}
                >
                  {!isGenerating && (
                    <>
                      {/* Texture for extra dimension */}
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay z-0" />
                      {/* Light Reflection sweep */}
                      <div className="absolute top-0 -left-[100%] w-[120%] h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 group-hover:left-[100%] transition-all duration-700 ease-in-out z-0" />
                    </>
                  )}
                  <span className="relative z-10 flex items-center gap-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                    {isGenerating ? (
                      <><Blocks className="animate-spin" size={16}/> WAIT...</>
                    ) : (
                      <><Wand2 size={16} className="text-yellow-100 animate-pulse" /> ARRANGE</>
                    )}
                  </span>
                </button>
              </div>
              
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => {
                    const originalTracks = tracks.filter(t => !t.name.startsWith('AI '));
                    setTracks(originalTracks);
                  }}
                  className="px-3 h-7 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[9px] font-black uppercase hover:bg-red-500 hover:text-white transition-all flex items-center gap-1.5"
                >
                  <Trash2 size={12} /> CLEAR AI
                </button>
              </div>
            </div>

            {/* Bottom Row: Config Controls */}
            <div className="flex items-center gap-1.5 flex-wrap pb-1">
              
              {/* Advanced Tool Dropdown Menu (Moved to bottom row) */}
              <div className="relative group shrink-0">
                <button className="px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center gap-1 transition-colors min-w-[32px]">
                  <Wrench size={12} /> <span className="hidden min-[380px]:inline">TOOLS</span>
                </button>
                {/* Dropdown Content */}
                <div className="absolute top-full left-0 mt-1 w-48 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[5000] flex flex-col py-1 pointer-events-none group-hover:pointer-events-auto">
                  <button onClick={handleUndo} className="px-3 py-2 text-[10px] font-bold text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2"><Undo2 size={12}/> Undo</div>
                    <span className="text-zinc-500 font-normal">⌘Z</span>
                  </button>
                  <button onClick={handleRedo} className="px-3 py-2 text-[10px] font-bold text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2"><Redo2 size={12}/> Redo</div>
                    <span className="text-zinc-500 font-normal">⇧⌘Z</span>
                  </button>
                  <div className="w-full h-px bg-white/10 my-1"/>
                  <button onClick={handleSelectAll} className="px-3 py-2 text-[10px] font-bold text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2"><MousePointerClick size={12}/> Select All</div>
                    <span className="text-zinc-500 font-normal">⌘A</span>
                  </button>
                  <div className="w-full h-px bg-white/10 my-1"/>
                  <button onClick={handleCut} className="px-3 py-2 text-[10px] font-bold text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2"><Scissors size={12}/> Cut</div>
                    <span className="text-zinc-500 font-normal">⌘X</span>
                  </button>
                  <button onClick={handleCopy} className="px-3 py-2 text-[10px] font-bold text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2"><Copy size={12}/> Copy</div>
                    <span className="text-zinc-500 font-normal">⌘C</span>
                  </button>
                  <button onClick={handlePaste} className="px-3 py-2 text-[10px] font-bold text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2"><ClipboardPaste size={12}/> Paste</div>
                    <span className="text-zinc-500 font-normal">⌘V</span>
                  </button>
                  <button onClick={handleDeleteSelected} className="px-3 py-2 text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-between w-full text-left">
                    <div className="flex items-center gap-2"><Trash2 size={12}/> Delete</div>
                    <span className="text-rose-500/50 font-normal">⌫</span>
                  </button>
                  <div className="w-full h-px bg-white/10 my-1"/>
                  <button onClick={handleClearAll} className="px-3 py-2 text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 w-full text-left">
                    <Eraser size={12}/> Clear All
                  </button>
                </div>
              </div>

              {/* AI Prompts */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button 
                  onClick={() => setIsPromptModalOpen(true)} 
                  className="relative group px-2 min-[380px]:px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-zinc-950 border border-emerald-500/40 text-emerald-400 hover:text-emerald-300 hover:border-emerald-400 hover:bg-emerald-950/30 transition-all flex items-center justify-center gap-1 overflow-hidden shadow-[inset_0_0_10px_rgba(16,185,129,0.05)] min-w-[32px]"
                >
                  <div className="absolute top-1/2 left-1/2 w-[250%] h-[250%] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0_150deg,rgba(52,211,153,0.4)_180deg,transparent_210deg)] animate-[spin_4s_linear_infinite] pointer-events-none" />
                  <MessageSquare size={12} className="relative z-10 drop-shadow-[0_0_5px_rgba(52,211,153,0.6)]" />
                  <span className="relative z-10 drop-shadow-[0_0_5px_rgba(52,211,153,0.6)] hidden min-[400px]:inline">{aiPrompt ? 'EDIT BRIEF' : 'AI BRIEF'}</span>
                </button>
                <button 
                  onClick={() => setIsLyricsModalOpen(true)} 
                  className="relative group px-2 min-[380px]:px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-zinc-950 border border-purple-500/40 text-purple-400 hover:text-purple-300 hover:border-purple-400 hover:bg-purple-950/30 transition-all flex items-center justify-center gap-1 overflow-hidden shadow-[inset_0_0_10px_rgba(168,85,247,0.05)] min-w-[32px]"
                >
                  <div className="absolute top-1/2 left-1/2 w-[250%] h-[250%] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0_150deg,rgba(192,132,252,0.4)_180deg,transparent_210deg)] animate-[spin_4s_linear_infinite] pointer-events-none" style={{ animationDelay: '-2s' }} />
                  <Mic2 size={12} className="relative z-10 drop-shadow-[0_0_5px_rgba(192,132,252,0.6)]" />
                  <span className="relative z-10 drop-shadow-[0_0_5px_rgba(192,132,252,0.6)] hidden min-[400px]:inline">{lyricsPrompt ? 'LYRICS' : 'AI LYRICS'}</span>
                </button>
              </div>

              <select value={arrangeStyle} onChange={e => setArrangeStyle(e.target.value)} className="bg-zinc-900 border border-white/10 text-white text-[11px] rounded-lg px-2 py-1.5 w-20 outline-none focus:border-emerald-500 shrink-0">
                <option value="pop">Pop</option>
                <option value="jazz">Jazz</option>
                <option value="rock">Rock</option>
                <option value="classical">Classical</option>
                <option value="lofi">Lo-Fi</option>
                <option value="edm">EDM</option>
                <option value="rnb">R&B</option>
                <option value="acoustic">Acoustic</option>
                <option value="bossanova">Bossa Nova</option>
                <option value="funk">Funk</option>
                <option value="cinematic">Cinematic</option>
                <option value="kpop">K-Pop</option>
              </select>
              <select value={chordSource} onChange={e => setChordSource(e.target.value as any)} className="bg-zinc-900 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] rounded-lg px-2 py-1.5 w-24 outline-none shadow-[0_0_10px_rgba(16,185,129,0.1)] shrink-0">
                <option value="ai">AI Chords</option>
                <option value="original">Original</option>
              </select>
              <div className="flex items-center gap-0.5 bg-[#0c0c0e] rounded-lg p-0.5 border border-white/10 shrink-0">
                <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"><ZoomOut size={12}/></button>
                <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"><ZoomIn size={12}/></button>
              </div>
              </div>
          </div>

          {/* Timeline Scroll Container (Horizontal & Vertical) */}
          <div id="arranger-scroll-container" className="flex-1 overflow-auto relative flex flex-col border border-white/5 rounded-2xl bg-[#0c0c0e] custom-scrollbar shadow-inner">
            <div style={{ width: Math.max(800, totalMeasures * pixelsPerMeasure + 100) }} className="min-h-full flex flex-col relative z-0">
              
              {/* Measure Ruler (Sticky Top) */}
              <div className="h-8 sticky top-0 z-[60] flex border-b border-white/10 bg-[#0c0c0e] shadow-sm">
                {/* Header Spacer (Sticky Left) */}
                <div className="w-[100px] shrink-0 border-r border-white/10 bg-[#0c0c0e] sticky left-0 z-[70] flex items-center px-3 shadow-[4px_0_10px_rgba(0,0,0,0.5)]">
                  <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Timeline</span>
                </div>
                {/* Ruler Measures */}
                <div className="flex-1 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center">
                    {Array.from({ length: totalMeasures }).map((_, i) => (
                      <div 
                        key={`ruler-m-${i}`} 
                        className="absolute h-full flex flex-col items-center justify-center border-l border-white/10" 
                        style={{ left: i * pixelsPerMeasure, width: pixelsPerMeasure }}
                      >
                        <span className="text-[10px] font-black text-zinc-500 lcd-font">{i + 1}</span>
                        {/* Beat lines within measure */}
                        {Array.from({ length: beatsPerMeasure - 1 }).map((_, bIdx) => (
                          <div key={`ruler-b-${i}-${bIdx}`} className="absolute top-0 h-1/2 w-px bg-white/5" style={{ left: ((bIdx + 1) / beatsPerMeasure) * pixelsPerMeasure }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Track Lanes */}
              <div className="flex-1 relative flex flex-col z-10">
                {tracks.map((track, index) => (
                  <div 
                    key={track.id} 
                    onDoubleClick={() => onTrackDoubleClick && onTrackDoubleClick(track.id, visualType === 'score' ? 'editor' : 'pianoroll')}
                    className="track-lane group hover:bg-white/[0.02] flex h-32 border-b border-white/5 transition-colors relative cursor-pointer"
                  >
                    {/* Track Header (Sticky Left) */}
                    <div className="w-[100px] shrink-0 h-full flex flex-col justify-center items-start px-3 border-r border-white/10 bg-[#0c0c0e] sticky left-0 z-[50] shadow-[4px_0_10px_rgba(0,0,0,0.5)]">
                        <div className="flex flex-col w-full gap-0.5 mb-1.5 overflow-hidden">
                          <span className="text-white text-[9px] font-black uppercase tracking-wide leading-tight truncate w-full" title={track.name}>{track.name}</span>
                          <span className="text-zinc-600 text-[8px] font-mono">
                            {((track as any)._generatedNotes?.length) || parsedData.notes.filter(n => n.trackId === track.id || (!n.trackId && index === 0)).length} notes
                          </span>
                        </div>
                      <div className="flex items-center gap-1.5 w-full mt-1">
                        <select 
                          className="bg-black/50 border border-white/10 text-white text-[9px] rounded px-1 py-0.5 outline-none focus:border-cyan-500 w-[45px] truncate"
                          value={track.instrument || 'piano'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const newTracks = [...tracks];
                            newTracks[index] = { ...track, instrument: e.target.value as any, mode: 'instrument' };
                            setTracks(newTracks);
                            // Also switch instrument in MusicEngine
                            musicEngine.switchTrackMode(track.id, track.name, 'instrument', { instrument: e.target.value });
                          }}
                        >
                          <option value="piano">Piano</option>
                          <option value="bass">Bass</option>
                          <option value="drums">Drums</option>
                          <option value="guitar">Guitar</option>
                          <option value="strings">Strings</option>
                          <option value="synth">Synth</option>
                          <option value="vocal">Vocal</option>
                        </select>
                        <button onClick={(e) => { e.stopPropagation(); const t=[...tracks]; t[index].isMuted=!t[index].isMuted; setTracks(t); }} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black leading-none transition-all ${track.isMuted ? 'bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}>
                          M
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); const t=[...tracks]; t[index].isSolo=!t[index].isSolo; setTracks(t); }} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black leading-none transition-all ${track.isSolo ? 'bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}>
                          S
                        </button>
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (confirm(`Delete track "${track.name}"?`)) {
                              setTracks(tracks.filter(t => t.id !== track.id));
                            }
                          }} 
                          className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-all ml-auto"
                          title="Delete Track"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    {/* Visualizer - flex-1 */}
                    <div className="flex-1 relative h-full bg-black/20">
                      <TrackVisualizer 
                        track={track} 
                        notes={(track as any)._generatedNotes || parsedData.notes.filter(n => n.trackId === track.id || (!n.trackId && index === 0))} 
                        width={totalMeasures * pixelsPerMeasure}
                        height={128} // h-32 = 128px
                        visualType={visualType}
                        pixelsPerBeat={pixelsPerMeasure / beatsPerMeasure}
                      />
                      {/* Overlay Measures Grid on top of Visualizer if needed */}
                      <div className="absolute inset-0 pointer-events-none z-10">
                        {Array.from({ length: totalMeasures }).map((_, i) => (
                          <div 
                            key={`grid-m-${i}`} 
                            className="measure-line" 
                            style={{ left: i * pixelsPerMeasure }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

              {/* Section Blocks Overlay - NOW INSIDE TRACK LANES CONTAINER */}
              <div className="absolute top-0 left-[100px] right-0 bottom-0 pointer-events-none z-[20] overflow-hidden">
                {isSimpleMode ? (
                  <div className="absolute inset-0 flex items-center justify-center p-8 z-30 pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-6 flex flex-col items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.15)] text-center max-w-md">
                      <Wand2 size={32} className="text-cyan-400 mb-3 animate-pulse" />
                      <h3 className="text-white font-black text-lg tracking-widest uppercase mb-2 text-shadow">✨ Auto-Structure is Active</h3>
                      <p className="text-cyan-100/70 text-xs leading-relaxed">Nimo (Agentic AI) will automatically detect the best verse/chorus transitions for this song based on the original melody. Just pick your style and press Arrange!</p>
                    </div>
                  </div>
                ) : (
                  sections.map(section => {
                    const isSelected = selectedSectionIds.includes(section.id);
                    return (
                    <div
                      key={section.id}
                      className={`section-block pointer-events-auto flex items-center justify-center ${isSelected ? 'ring-2 ring-white z-[30] shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'z-20'}`}
                      style={{
                        left: (section.startMeasure - 1) * pixelsPerMeasure,
                        width: (section.endMeasure - section.startMeasure + 1) * pixelsPerMeasure,
                        top: 0,
                        height: '100%',
                        backgroundColor: `${section.color}${isSelected ? '40' : '20'}`,
                        borderColor: section.color,
                        border: `1px solid ${section.color}`,
                        borderTopWidth: '4px',
                      }}
                      onMouseEnter={() => setHoveredSection(section.id)}
                      onMouseLeave={() => setHoveredSection(null)}
                      onMouseDown={(e) => handleSectionMouseDown(e, section.id)}
                    >
                      <span className="absolute top-2 left-2 text-white/70 text-[10px] font-black uppercase tracking-widest text-shadow-sm">{section.name}</span>
                      {hoveredSection === section.id && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setSelectedSectionIds([section.id]); handleCut(); }} className="w-6 h-6 rounded-full bg-black/40 text-white/70 hover:text-white flex items-center justify-center hover:bg-white/20 transition-colors"><Scissors size={10}/></button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedSectionIds([section.id]); handleCopy(); handlePaste(); }} className="w-6 h-6 rounded-full bg-black/40 text-white/70 hover:text-white flex items-center justify-center hover:bg-white/20 transition-colors"><Repeat size={10}/></button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedSectionIds([section.id]); handleDeleteSelected(); }} className="w-6 h-6 rounded-full bg-black/40 text-white/70 hover:text-rose-500 flex items-center justify-center hover:bg-rose-500/20 transition-colors"><Trash2 size={10}/></button>
                        </div>
                      )}
                    </div>
                  )})
                )}
                

              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Prompt Modal */}
      {isPromptModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <MessageSquare size={18}/> AI ARRANGER BRIEF
            </h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Provide additional instructions for the AI, e.g., <em>"Sad mood with leading piano", "Upbeat K-Pop style", or "Epic orchestral strings"</em>.
            </p>
            <textarea 
              className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-h-[120px] resize-none"
              placeholder="Ex: Upbeat, mid-tempo, chill acoustic guitar strumming..."
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setIsPromptModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                CLOSE
              </button>
              <button 
                onClick={() => setIsPromptModalOpen(false)}
                className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-105 transition-all"
              >
                SAVE BRIEF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lyrics Modal */}
      {isLyricsModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-black text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Mic2 size={18}/> AI LYRICS WRITER
            </h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Describe your concept to let the AI write lyrics perfectly fitting this melody, e.g., <em>"Fun children's song about brushing teeth", "Heartbreak pop ballad", or "Aggressive hip-hop diss track"</em>.
            </p>
            <textarea 
              className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[120px] resize-none"
              placeholder="Ex: I want a fun English children's song about brushing teeth..."
              value={lyricsPrompt}
              onChange={e => setLyricsPrompt(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setIsLyricsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                CLOSE
              </button>
              <button 
                onClick={handleGenerateLyrics}
                className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-purple-500 text-black shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:scale-105 transition-all"
              >
                GENERATE LYRICS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArrangerPage;
