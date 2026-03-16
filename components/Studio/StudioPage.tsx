
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Trash2, Edit3, ArrowLeft, ZoomIn, ZoomOut, X,
  PanelLeft, PlusCircle, Save, Upload, Pencil, Music2,
  ChevronRight, LayoutGrid, Rocket, Settings2, Sparkles,
  Scissors, Share2, Globe, Lock, DollarSign, ShoppingBag,
  Zap, Layers, Cpu, Eye, CheckCircle2, ShieldCheck, UserCircle,
  Mic, Headphones, Waves, Bot, Star, FileText, FileCode, Download,
  Music, Image as ImageIcon, Box
} from 'lucide-react';
import { Song, TrackState, LyricMode, ParsedNote } from '../../types';
import { songStorage } from '../../lib/SongStorage';
import ProScoreEditor, { ProScoreEditorRef } from '../Player/ProScoreEditor';
import { musicEngine } from '../../lib/MusicEngine';
import { MidiWriter } from '../../lib/MidiWriter';

interface StudioPageProps {
  selectedSong: Song | null;
  xmlData: string | null;
  tracks: TrackState[];
  setTracks: React.Dispatch<React.SetStateAction<TrackState[]>>;
  onPublish: () => void;
  onExit?: () => void;
}

const StudioPage: React.FC<StudioPageProps> = ({ selectedSong: initialSong, xmlData: initialXml, tracks, setTracks, onPublish, onExit }) => {
  const [currentProject, setCurrentProject] = useState<Song | null>(initialSong);
  const [xmlHistory, setXmlHistory] = useState<string[]>(initialXml ? [initialXml] : []);
  const [historyIndex, setHistoryIndex] = useState(0);
  const currentXml = xmlHistory[historyIndex];

  const [isPreparing, setIsPreparing] = useState(false);
  const [prepLabel, setPrepLabel] = useState("");
  const [showProjectBrowser, setShowProjectBrowser] = useState(!initialSong);
  const [showExportModal, setShowExportModal] = useState(false);

  const scoreRef = useRef<ProScoreEditorRef>(null);
  const parsedData = useMemo(() => musicEngine.parseMusicXml(currentXml || ''), [currentXml]);

  useEffect(() => {
    if (parsedData.metadata) {
      setCurrentProject(prev => {
        const newTitle = (prev?.title && prev.title !== 'NEURAL PROJECT' && prev.title !== 'Untitled') ? prev.title : parsedData.metadata.title;
        const newArtist = (prev?.artist && prev.artist !== 'MAESTRO' && prev.artist !== 'Unknown') ? prev.artist : parsedData.metadata.artist;
        return ({
          ...(prev || { id: `proj-${Date.now()}`, bpm: 120, key: 'C', duration: 180 }),
          title: newTitle, artist: newArtist, bpm: prev?.bpm || parsedData.metadata.bpm || 120
        } as any);
      });
    }
  }, [parsedData]);

  const executeExport = async (format: 'pdf' | 'png' | 'jpeg' | 'midi' | 'xml' | 'nimo') => {
    setShowExportModal(false);
    setIsPreparing(true);
    setPrepLabel(`EXPORTING ${format.toUpperCase()}...`);
    try {
      const fileName = `${currentProject?.title || 'PROJECT'}`.replace(/\s+/g, '_');
      switch (format) {
        case 'pdf': if (scoreRef.current) await scoreRef.current.exportToPdf(); break;
        case 'png': if (scoreRef.current) await scoreRef.current.exportToImage('png'); break;
        case 'jpeg': if (scoreRef.current) await scoreRef.current.exportToImage('jpeg'); break;
        case 'midi': 
          const mBlob = MidiWriter.generateMidiBlob(parsedData.notes, currentProject?.bpm || 120);
          const mUrl = URL.createObjectURL(mBlob); tLink(mUrl, `${fileName}.mid`); break;
        case 'xml': if (currentXml) tLink(URL.createObjectURL(new Blob([currentXml])), `${fileName}.musicxml`); break;
        case 'nimo': 
           const nData = { protocol: 'NIMO-PROJECT', metadata: currentProject, rawXml: currentXml, tracks };
           tLink(URL.createObjectURL(new Blob([JSON.stringify(nData, null, 2)])), `${fileName}.nimo`); break;
      }
    } finally { setIsPreparing(false); }
  };

  const tLink = (url: string, name: string) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };

  const onXmlChange = useCallback((newXml: string) => {
    setXmlHistory(prev => [...prev.slice(0, historyIndex + 1), newXml]);
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  if (showProjectBrowser) {
    return (
      <div className="h-dvh flex flex-col bg-[#050507] p-8">
        <h1 className="text-3xl font-black text-white italic mb-10 tracking-widest">STUDIO MATRIX</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
          <div onClick={() => setShowProjectBrowser(false)} className="aspect-square bg-white/[0.03] border-2 border-dashed border-white/5 rounded-[40px] flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/[0.05] transition-all active:scale-95">
            <PlusCircle size={32} className="text-cyan-400" />
            <span className="text-white font-black uppercase text-[9px] tracking-[0.3em]">New Project</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-[#050507] overflow-hidden relative">
      <header className="h-14 bg-[#0c0c0e] border-b border-white/5 flex items-center justify-between px-4 z-[3000]">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onExit} className="p-2 text-zinc-400"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <h2 className="text-[11px] font-black text-white uppercase italic truncate pr-4 leading-none">{currentProject?.title}</h2>
            <p className="text-[7px] font-bold text-cyan-500 uppercase tracking-widest truncate">{currentProject?.artist}</p>
          </div>
        </div>
        <button onClick={() => setShowExportModal(true)} className="px-5 h-9 bg-white text-black rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 transition-all">EXPORT</button>
      </header>

      <div className="flex-1 relative bg-[#0a0a0c] m-2 rounded-[32px] border border-white/5 overflow-hidden">
        <ProScoreEditor ref={scoreRef} xmlData={currentXml} currentTime={0} isPlaying={false} layoutMode={'paginated'} isLoupeEnabled={false} songMetadata={currentProject} zoom={1.0} isEditable={true} onXmlChange={onXmlChange} />
      </div>

      {showExportModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[6000] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
          <div className="w-full max-w-lg p-8 relative">
            <button onClick={() => setShowExportModal(false)} className="absolute -top-12 right-0 text-zinc-500 hover:text-white"><X size={24} /></button>
            <h3 className="text-xl font-black text-white uppercase italic mb-8 items-center flex gap-3"><Download className="text-cyan-400" /> EXPORT SYSTEM</h3>
            <div className="grid grid-cols-2 gap-3">
              {[ { f: 'pdf', i: FileText, c: 'text-rose-400', l: 'Score (PDF)' },
                 { f: 'png', i: Layers, c: 'text-emerald-400', l: 'Page (PNG)' },
                 { f: 'midi', i: Music, c: 'text-amber-400', l: 'Performance (MID)' },
                 { f: 'xml', i: FileCode, c: 'text-indigo-400', l: 'Legacy (XML)' },
                 { f: 'nimo', i: Bot, c: 'text-cyan-400', l: 'Neural (NIMO)' } ].map(opt => (
                <button key={opt.f} onClick={() => executeExport(opt.f as any)} className="bg-white/5 border border-white/5 p-4 rounded-3xl flex flex-col items-start gap-2 hover:bg-white/10 active:scale-95 transition-all group">
                   <div className={`w-8 h-8 ${opt.c} bg-current/10 rounded-xl flex items-center justify-center`}><opt.i size={16} /></div>
                   <span className="text-[10px] font-black text-white uppercase tracking-wider">{opt.l}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isPreparing && (
        <div className="absolute inset-0 bg-black/95 z-[7000] flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 rounded-full border-4 border-cyan-500/10 border-t-cyan-500 animate-spin flex items-center justify-center"><Bot size={32} className="text-cyan-400 animate-pulse" /></div>
          <h3 className="text-sm font-black text-white italic tracking-widest uppercase">{prepLabel}</h3>
        </div>
      )}
    </div>
  );
};

export default StudioPage;
