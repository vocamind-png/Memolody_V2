
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, X, PlusCircle, Settings2,
  Cpu, Bot, FileText, FileCode, Download,
  Music, Layers, RotateCcw, RotateCw
} from 'lucide-react';
import { Song, TrackState } from '../../types';
import ProScoreEditor, { ProScoreEditorRef } from '../Player/ProScoreEditor';
import ScoreEditOverlay, { EditTool, NoteType } from './ScoreEditOverlay';
import EngraverCommandCenter from './EngraverCommandCenter';
import { musicEngine } from '../../lib/MusicEngine';
import { MidiWriter } from '../../lib/MidiWriter';
import { PluginManager } from '../../plugins/core/manager';
import { songStorage } from '../../lib/SongStorage';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';

interface StudioPageProps {
  selectedSong: Song | null;
  xmlData: string | null;
  layoutBundle?: any | null;
  tracks: TrackState[];
  setTracks: React.Dispatch<React.SetStateAction<TrackState[]>>;
  onPublish: () => void;
  onExit?: () => void;
}

/** Map EngraverCommandCenter tool IDs → ScoreEditOverlay tool + duration */
function mapEngraverTool(toolId: string): { tool: EditTool; duration: NoteType | null } {
  switch (toolId) {
    case 'select':       return { tool: 'select',  duration: null };
    case 'delete':       return { tool: 'eraser',  duration: null };
    case 'whole-note':   return { tool: 'pencil',  duration: 'whole'   };
    case 'half-note':    return { tool: 'pencil',  duration: 'half'    };
    case 'quarter-note': return { tool: 'pencil',  duration: 'quarter' };
    case 'eighth-note':  return { tool: 'pencil',  duration: 'eighth'  };
    case '16th-note':    return { tool: 'pencil',  duration: '16th'    };
    default:             return { tool: 'select',  duration: null };
  }
}

const StudioPage: React.FC<StudioPageProps> = ({
  selectedSong: initialSong, xmlData: initialXml, layoutBundle, tracks, setTracks, onPublish, onExit
}) => {
  const [currentProject, setCurrentProject] = useState<Song | null>(initialSong);
  const [xmlHistory, setXmlHistory] = useState<string[]>(initialXml ? [initialXml] : []);
  const [historyIndex, setHistoryIndex] = useState(0);
  const currentXml = xmlHistory[historyIndex];

  const [isPreparing, setIsPreparing] = useState(false);
  const [prepLabel, setPrepLabel] = useState('');
  const [showProjectBrowser, setShowProjectBrowser] = useState(!initialSong);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPluginSettings, setShowPluginSettings] = useState(false);
  const [activePluginId, setActivePluginId] = useState<string>('vocalido-svs');
  const [plugins] = useState(PluginManager.getInstance().listPlugins());

  // ── Engraver state ───────────────────────────────────────────────────
  const [engraverVisible, setEngraverVisible] = useState(true);
  const [engraverTool, setEngraverTool] = useState('select');
  const [svgPagesCount, setSvgPagesCount] = useState(0);
  const scoreContainerRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<ProScoreEditorRef>(null);

  // Harmony Generator state
  const [showHarmonyModal, setShowHarmonyModal] = useState(false);
  const [harmonyKey, setHarmonyKey] = useState('C');
  const [harmonyChords, setHarmonyChords] = useState('I IV V I');
  const [harmonyDurations, setHarmonyDurations] = useState('1 1 1 1');

  const executeHarmony = async () => {
    setIsPreparing(true);
    setPrepLabel('GENERATING SATB HARMONY...');
    try {
      const res = await fetch('http://localhost:8000/v1/generate_harmony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: harmonyKey,
          chord_progression: harmonyChords,
          durations: harmonyDurations,
          time_signature: parsedData?.timeSignature ? `${parsedData.timeSignature.beats}/${parsedData.timeSignature.beatType}` : '4/4'
        })
      });
      const data = await res.json();
      if (data.musicxml) {
        onXmlChange(data.musicxml);
        setShowHarmonyModal(false);
      } else {
        alert('Error generating harmony: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to AI server. Make sure the backend is running.');
    } finally {
      setIsPreparing(false);
    }
  };

  // Derive ScoreEditOverlay tool from engraver selection
  const { tool: activeTool, duration: activeDuration } = mapEngraverTool(engraverTool);

  const parsedData = useMemo(() => musicEngine.parseMusicXml(currentXml || ''), [currentXml]);

  useEffect(() => {
    if (parsedData.metadata) {
      setCurrentProject(prev => ({
        ...(prev || { id: `proj-${Date.now()}`, bpm: 120, key: 'C', duration: 180 }),
        title: (prev?.title && prev.title !== 'NEURAL PROJECT' && prev.title !== 'Untitled')
          ? prev.title : parsedData.metadata.title,
        artist: (prev?.artist && prev.artist !== 'MAESTRO' && prev.artist !== 'Unknown')
          ? prev.artist : parsedData.metadata.artist,
        bpm: prev?.bpm || parsedData.metadata.bpm || 120,
      } as any));
    }
  }, [parsedData]);

  const onXmlChange = useCallback((newXml: string, _label?: string) => {
    setXmlHistory(prev => [...prev.slice(0, historyIndex + 1), newXml]);
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) setHistoryIndex(prev => prev - 1);
  }, [historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < xmlHistory.length - 1) setHistoryIndex(prev => prev + 1);
  }, [historyIndex, xmlHistory.length]);

  const tLink = (url: string, name: string) => {
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };

  const executeExport = async (format: 'pdf' | 'png' | 'jpeg' | 'midi' | 'xml' | 'nimo') => {
    setShowExportModal(false);
    setIsPreparing(true);
    setPrepLabel(`EXPORTING ${format.toUpperCase()}...`);
    try {
      const fn = (currentProject?.title || 'PROJECT').replace(/\s+/g, '_');
      switch (format) {
        case 'pdf':  if (scoreRef.current) await scoreRef.current.exportToPdf(); break;
        case 'png':  if (scoreRef.current) await scoreRef.current.exportToImage('png'); break;
        case 'jpeg': if (scoreRef.current) await scoreRef.current.exportToImage('jpeg'); break;
        case 'midi': tLink(URL.createObjectURL(MidiWriter.generateMidiBlob(parsedData.notes, currentProject?.bpm || 120)), `${fn}.mid`); break;
        case 'xml':  if (currentXml) tLink(URL.createObjectURL(new Blob([currentXml])), `${fn}.musicxml`); break;
        case 'nimo': tLink(URL.createObjectURL(new Blob([JSON.stringify({ protocol:'NIMO-PROJECT', metadata: currentProject, rawXml: currentXml, tracks }, null, 2)])), `${fn}.nimo`); break;
      }
    } finally { setIsPreparing(false); }
  };

  if (showProjectBrowser) {
    return (
      <div className="h-dvh flex flex-col bg-[#050507] p-8">
        <h1 className="text-3xl font-black text-white italic mb-10 tracking-widest">STUDIO MATRIX</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
          <div
            onClick={() => setShowProjectBrowser(false)}
            className="aspect-square bg-white/[0.03] border-2 border-dashed border-white/5 rounded-[40px] flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/[0.05] transition-all active:scale-95"
          >
            <PlusCircle size={32} className="text-cyan-400" />
            <span className="text-white font-black uppercase text-[9px] tracking-[0.3em]">New Project</span>
          </div>

          {/* Import & Convert Card */}
          <div
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.accept = '.emk,.mid,.midi,.xml,.musicxml';
              input.onchange = async (e: any) => {
                const files = Array.from(e.target.files as FileList);
                if (files.length === 0) return;
                
                setIsPreparing(true);
                setPrepLabel(`IMPORTING ${files.length} STREAMS...`);
                
                const { FileConverter } = await import('../../lib/FileConverter');
                let successCount = 0;
                
                for (const file of files) {
                  try {
                    const res = await FileConverter.convertFile(file);
                    if (!res.success || !res.midiData) continue;
                    const midiFile = new File([res.midiData], res.fileName, { type: 'audio/midi' });
                    const { metadata, xmlData, layoutBundle } = await parseMusicXMLMetadata(midiFile);
                    metadata.origin = 'load';
                    await songStorage.saveSong(metadata, xmlData, layoutBundle);
                    successCount++;
                  } catch (err) {
                    console.error(`[Studio] Import failed for ${file.name}:`, err);
                  }
                }
                
                setIsPreparing(false);
                if (successCount > 0) {
                  onPublish();
                  alert(`✅ Imported ${successCount} songs! You can find them in the HOME tab.`);
                } else {
                  alert('❌ Failed to import files.');
                }
              };
              input.click();
            }}
            className="aspect-square bg-amber-500/5 border-2 border-dashed border-amber-500/20 rounded-[40px] flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-amber-500/10 transition-all active:scale-95"
          >
            <Download size={32} className="text-amber-500" />
            <span className="text-amber-500 font-black uppercase text-[9px] tracking-[0.3em]">Import & Convert (.EMK)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-[#050507] overflow-hidden relative">

      {/* ══ Top Header ══════════════════════════════════════════════════ */}
      <header className="h-14 bg-[#0c0c0e] border-b border-white/5 flex items-center justify-between px-4 z-[3000] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onExit} className="p-2 text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h2 className="text-[11px] font-black text-white uppercase italic truncate pr-4 leading-none">
              {currentProject?.title || 'UNTITLED MATRIX'}
            </h2>
            <p className="text-[7px] font-bold text-cyan-500 uppercase tracking-widest truncate">
              {currentProject?.artist || 'MAESTRO'} · {parsedData.timeSignature?.beats || 4}/{parsedData.timeSignature?.beatType || 4}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Plugin chip */}
          <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-xl border border-white/5">
            <select
              value={activePluginId}
              onChange={e => setActivePluginId(e.target.value)}
              className="bg-transparent text-[8px] font-black text-zinc-400 uppercase tracking-widest outline-none cursor-pointer hover:text-white"
            >
              {plugins.map(p => (
                <option key={p.id} value={p.id} className="bg-[#0c0c0e]">{p.name}</option>
              ))}
            </select>
            <button onClick={() => setShowPluginSettings(true)} className="p-0.5 hover:text-cyan-400 text-zinc-600">
              <Settings2 size={9} />
            </button>
            <div className={`w-1.5 h-1.5 rounded-full ${
              PluginManager.getInstance().getPlugin(activePluginId)?.status === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'
            }`} />
          </div>

          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.accept = '.emk,.mid,.midi,.xml,.musicxml';
              input.onchange = async (e: any) => {
                const files = Array.from(e.target.files as FileList);
                if (files.length === 0) return;
                setIsPreparing(true);
                setPrepLabel(`IMPORTING ${files.length} STREAMS...`);
                
                const { FileConverter } = await import('../../lib/FileConverter');
                let successCount = 0;
                
                for (const file of files) {
                  try {
                    // 1. Convert if EMK
                    const res = await FileConverter.convertFile(file);
                    if (!res.success || !res.midiData) continue;

                    // 2. Wrap as File if it was a Blob from converter
                    const midiFile = new File([res.midiData], res.fileName, { type: 'audio/midi' });

                    // 3. Parse Metadata (converts MIDI to XML internally)
                    const { metadata, xmlData, layoutBundle } = await parseMusicXMLMetadata(midiFile);
                    
                    // 4. Save to Database
                    metadata.origin = 'load'; // Mark as user-imported
                    await songStorage.saveSong(metadata, xmlData, layoutBundle);
                    successCount++;
                  } catch (err) {
                    console.error(`[Studio] Failed to import ${file.name}:`, err);
                  }
                }
                
                setIsPreparing(false);
                if (successCount > 0) {
                  onPublish(); // Trigger refresh in App
                  alert(`✅ Successfully imported ${successCount} songs to your library!`);
                } else {
                  alert(`❌ Failed to import files. Please check format.`);
                }
              };
              input.click();
            }}
            className="px-4 h-8 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[8px] font-black uppercase hover:bg-amber-500 hover:text-black transition-all"
          >
            IMPORT CONVERTER
          </button>

          <button
            onClick={() => setShowHarmonyModal(true)}
            className="px-4 h-8 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-[8px] font-black uppercase hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1"
          >
            <Bot size={12} /> AI HARMONY
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="px-5 h-8 bg-white text-black rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 transition-all"
          >
            EXPORT
          </button>
        </div>
      </header>

      {/* ══ Score Area (full bleed) ══════════════════════════════════════ */}
      <div className="flex-1 relative overflow-hidden">
        <div ref={scoreContainerRef} className="absolute inset-0">
          <ProScoreEditor
            ref={scoreRef}
            xmlData={currentXml}
            currentTime={0}
            isPlaying={false}
            layoutMode="paginated"
            isLoupeEnabled={false}
            songMetadata={currentProject}
            zoom={1.0}
            isEditable={true}
            onXmlChange={onXmlChange}
            onPageCountChange={setSvgPagesCount}
            layoutBundle={layoutBundle}
          />
        </div>

        {/* Score Edit Overlay */}
        <ScoreEditOverlay
          containerRef={scoreContainerRef}
          xmlData={currentXml}
          isEditable={true}
          activeTool={activeTool}
          activeDuration={activeDuration || 'quarter'}
          onXmlChange={onXmlChange}
          svgPagesCount={svgPagesCount}
        />
      </div>

      {/* ══ Maestro Engraver — floating draggable panel ══════════════════ */}
      <EngraverCommandCenter
        activeTool={engraverTool}
        onToolSelect={setEngraverTool}
        isVisible={engraverVisible}
        onToggleVisibility={() => setEngraverVisible(v => !v)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < xmlHistory.length - 1}
      />

      {/* ══ AI AutoHarmony Modal ════════════════════════════════════════ */}
      {showHarmonyModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[6000] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
          <div className="w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[32px] p-8 relative">
            <button onClick={() => setShowHarmonyModal(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white">
              <X size={24} />
            </button>
            <h3 className="text-xl font-black text-white uppercase italic mb-6 flex gap-3 items-center">
              <Bot className="text-indigo-400" /> AI AUTO-HARMONY (SATB)
            </h3>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1 block">Key</label>
                <input type="text" value={harmonyKey} onChange={e => setHarmonyKey(e.target.value)} placeholder="C, G, Dm..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-indigo-500/50" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1 block">Chord Progression (Roman Numerals)</label>
                <input type="text" value={harmonyChords} onChange={e => setHarmonyChords(e.target.value)} placeholder="I IV V I" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-indigo-500/50" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1 block">Durations (Beats)</label>
                <input type="text" value={harmonyDurations} onChange={e => setHarmonyDurations(e.target.value)} placeholder="1 1 1 1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-indigo-500/50" />
              </div>
              
              <button
                onClick={executeHarmony}
                className="w-full h-12 mt-4 bg-indigo-500 hover:bg-indigo-400 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all"
              >
                GENERATE SATB VOICES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Export Modal ════════════════════════════════════════════════ */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[6000] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
          <div className="w-full max-w-lg p-8 relative">
            <button onClick={() => setShowExportModal(false)} className="absolute -top-12 right-0 text-zinc-500 hover:text-white">
              <X size={24} />
            </button>
            <h3 className="text-xl font-black text-white uppercase italic mb-8 flex gap-3 items-center">
              <Download className="text-cyan-400" /> EXPORT CONSOLE
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { f: 'pdf',  n: 'Score (PDF)',       c: 'text-rose-400',   I: FileText  },
                { f: 'png',  n: 'Page (PNG)',         c: 'text-emerald-400',I: Layers    },
                { f: 'midi', n: 'Performance (MID)', c: 'text-amber-400',  I: Music     },
                { f: 'xml',  n: 'MusicXML',          c: 'text-indigo-400', I: FileCode  },
                { f: 'nimo', n: 'NIMO Project',      c: 'text-cyan-400',   I: Bot       },
              ].map(opt => (
                <button key={opt.f} onClick={() => executeExport(opt.f as any)}
                  className="bg-white/5 border border-white/5 p-4 rounded-3xl flex flex-col items-start gap-2 hover:bg-white/10 active:scale-95 transition-all">
                  <div className={`w-8 h-8 ${opt.c} bg-current/10 rounded-xl flex items-center justify-center`}>
                    <opt.I size={16} />
                  </div>
                  <span className="text-[10px] font-black text-white uppercase tracking-wider">{opt.n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ Plugin Settings ═════════════════════════════════════════════ */}
      {showPluginSettings && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[6000] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[32px] p-8 relative">
            <button onClick={() => setShowPluginSettings(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white">
              <X size={24} />
            </button>
            <h3 className="text-sm font-black text-white italic uppercase tracking-widest mb-8 flex gap-2 items-center">
              <Cpu size={14} className="text-cyan-400" />
              {plugins.find(p => p.id === activePluginId)?.name} SETTINGS
            </h3>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest italic text-center py-10">
              No configurable settings for this plugin.
            </p>
          </div>
        </div>
      )}

      {/* ══ Export Spinner ══════════════════════════════════════════════ */}
      {isPreparing && (
        <div className="absolute inset-0 bg-black/95 z-[7000] flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 rounded-full border-4 border-cyan-500/10 border-t-cyan-500 animate-spin flex items-center justify-center">
            <Bot size={32} className="text-cyan-400 animate-pulse" />
          </div>
          <h3 className="text-sm font-black text-white italic tracking-widest uppercase">{prepLabel}</h3>
        </div>
      )}
    </div>
  );
};

export default StudioPage;
