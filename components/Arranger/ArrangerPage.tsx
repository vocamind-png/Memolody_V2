
import React, { useState, useMemo, useCallback } from 'react';
import { Blocks, Music2, Scissors, Repeat, Trash2, PlusCircle, Search, Settings2, ArrowLeft } from 'lucide-react';
import { Song, TrackState } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';

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
}

const ArrangerPage: React.FC<ArrangerPageProps> = ({ song, musicXml, tracks, setTracks }) => {
  const localSong = useMemo(() => song || { title: 'Untitled Composition', artist: 'Nimo', bpm: 120, key: 'C', duration: 180 } as any, [song]);
  const parsedData = useMemo(() => musicEngine.parseMusicXml(musicXml || ''), [musicXml]);
  
  // Calculate total measures
  const totalBeats = parsedData.notes.reduce((max, note) => Math.max(max, note.startTime + note.duration), 0);
  const beatsPerMeasure = parsedData.timeSignature.beats || 4;
  const totalMeasures = Math.ceil(totalBeats / beatsPerMeasure);

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

  const pixelsPerMeasure = 80; // pixels per measure for the timeline view

  const addNewSection = useCallback(() => {
    const lastSection = sections[sections.length - 1];
    const newStartMeasure = lastSection ? lastSection.endMeasure + 1 : 1;
    const newEndMeasure = newStartMeasure + 7; // Default 8 measures
    
    if (newStartMeasure > totalMeasures) return; // Prevent adding if no space

    setSections(prev => [...prev, {
      id: `new-${Date.now()}`,
      name: `New Section ${prev.length + 1}`,
      startMeasure: newStartMeasure,
      endMeasure: Math.min(newEndMeasure, totalMeasures),
      color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
    }]);
  }, [sections, totalMeasures]);

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

      {/* Main Arranger Timeline */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-6">
        <div className="bg-[#0c0c0e] rounded-[40px] p-8 shadow-3xl border border-white/5 h-full flex flex-col">
          <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter mb-8 flex items-center gap-3">
            <Blocks size={24} className="text-emerald-400" /> SONG <span className="text-emerald-400">STRUCTURE</span>
          </h2>

          {/* Measure Ruler */}
          <div className="relative h-12 flex-shrink-0 mb-4 bg-zinc-900/50 rounded-lg overflow-hidden border border-white/5">
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

          {/* Track Lanes */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {tracks.map((track, index) => (
              <div 
                key={track.id} 
                className="track-lane group hover:border-cyan-500/20"
                style={{ width: totalMeasures * pixelsPerMeasure }}
              >
                <div className="w-40 shrink-0 text-white font-bold text-xs uppercase px-4 flex items-center gap-2">
                  <Music2 size={16} className="text-cyan-400" />
                  <span className="truncate">{track.name || `Track ${index + 1}`}</span>
                </div>
                <div className="flex-1 relative h-full">
                  {/* Measures Grid */}
                  {Array.from({ length: totalMeasures }).map((_, i) => (
                    <div 
                      key={`grid-m-${i}`} 
                      className="measure-line" 
                      style={{ left: i * pixelsPerMeasure }}
                    />
                  ))}
                  {/* Beat Grid */}
                  {Array.from({ length: totalMeasures * beatsPerMeasure }).map((_, i) => (
                    <div 
                      key={`grid-b-${i}`} 
                      className="beat-line" 
                      style={{ left: (i / beatsPerMeasure) * pixelsPerMeasure }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Section Blocks Overlay */}
          <div className="absolute top-0 left-[200px] right-0 bottom-0 pointer-events-none"> {/* Adjust left offset to match track name width */}
            {sections.map(section => (
              <div
                key={section.id}
                className="section-block pointer-events-auto flex items-center justify-center"
                style={{
                  left: (section.startMeasure - 1) * pixelsPerMeasure + 200, // Adjust for track name width
                  width: (section.endMeasure - section.startMeasure + 1) * pixelsPerMeasure,
                  top: `calc(${84 + 12}px + ${0 * (50 + 8)}px)`, // Adjust for ruler height + track lane height + gap
                  height: `calc(100% - ${84 + 12}px)`, // Spans across all track lanes
                  backgroundColor: `${section.color}40`,
                  borderColor: section.color,
                  border: `1px solid ${section.color}`,
                  zIndex: 20,
                }}
                onMouseEnter={() => setHoveredSection(section.id)}
                onMouseLeave={() => setHoveredSection(null)}
              >
                <span className="text-white text-xs font-black uppercase tracking-widest text-shadow-lg">{section.name}</span>
                {hoveredSection === section.id && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button className="w-6 h-6 rounded-full bg-white/10 text-white/70 hover:text-white"><Scissors size={12}/></button>
                    <button className="w-6 h-6 rounded-full bg-white/10 text-white/70 hover:text-white"><Repeat size={12}/></button>
                    <button className="w-6 h-6 rounded-full bg-white/10 text-white/70 hover:text-rose-500"><Trash2 size={12}/></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArrangerPage;
