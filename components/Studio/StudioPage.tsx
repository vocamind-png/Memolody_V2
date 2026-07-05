
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { midiInputManager } from '../../lib/MidiInputManager';
import {
  ArrowLeft, X, PlusCircle, Settings2, Play, Square, Pause,
  Cpu, Bot, FileText, FileCode, Download, Search,
  Music, Layers, RotateCcw, RotateCw, Headphones, SlidersHorizontal, VolumeX, Volume2, SkipBack, Bell, Zap, Sparkles, Youtube, Loader2
} from 'lucide-react';
import { Song, TrackState } from '../../types';
import ProScoreEditor, { ProScoreEditorRef } from '../Player/ProScoreEditor';
import PerformanceScore from '../Player/PerformanceScore';
import { KeyTransposeDisplay, BpmDisplay, BarBeatPositionDisplay } from '../Player/LCDDisplay';
import ScoreEditOverlay, { EditTool, NoteType } from './ScoreEditOverlay';
import EngraverCommandCenter from './EngraverCommandCenter';
import { musicEngine } from '../../lib/MusicEngine';
import { MidiWriter } from '../../lib/MidiWriter';
import { PluginManager } from '../../plugins/core/manager';
import { songStorage } from '../../lib/SongStorage';
import { parseMusicXMLMetadata, injectSolfegeToXml } from '../../lib/MusicXmlParser';
import ArrangerPage from '../Arranger/ArrangerPage';
import ComposerPage from '../Composer/ComposerPage';
import { AudioConverter } from '../../lib/AudioConverter';
import { nimoBrain } from '../../lib/NimoBrain';
import { useScoreLens } from '../ScoreLens/useScoreLens';

interface StudioPageProps {
  selectedSong: Song | null;
  xmlData: string | null;
  layoutBundle?: any | null;
  tracks: TrackState[];
  setTracks: React.Dispatch<React.SetStateAction<TrackState[]>>;
  onPublish: () => void;
  onExit?: () => void;
  initialStudioMode?: 'composer' | 'arranger' | 'editor';
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
  selectedSong: initialSong, xmlData: initialXml, layoutBundle, tracks, setTracks, onPublish, onExit, initialStudioMode = 'arranger'
}) => {
  const [currentProject, setCurrentProject] = useState<Song | null>(initialSong);
  const [xmlHistory, setXmlHistory] = useState<string[]>(initialXml ? [initialXml] : []);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Lifted state from ArrangerPage
  const [arrangerVisualType, setArrangerVisualType] = useState<'score' | 'pianoroll'>('score');

  const [activeTab, setActiveTab] = useState('arranger');
  const currentXml = xmlHistory[historyIndex];

  const [isPreparing, setIsPreparing] = useState(false);
  const [prepLabel, setPrepLabel] = useState('PREPARING ENVIRONMENT...');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showProjectBrowser, setShowProjectBrowser] = useState(!initialSong);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPluginSettings, setShowPluginSettings] = useState(false);
  const [activePluginId, setActivePluginId] = useState<string>('vocalido-svs');
  const [plugins] = useState(PluginManager.getInstance().listPlugins());
  const [studioMode, setStudioMode] = useState<'composer' | 'arranger' | 'editor' | 'pianoroll'>(initialStudioMode);
  const [pianorollTrackId, setPianorollTrackId] = useState<string | null>(null);
  const [ytInput, setYtInput] = useState('');
  const [isYtDownloading, setIsYtDownloading] = useState(false);
  const [ytProgress, setYtProgress] = useState('');
  const [showYtModal, setShowYtModal] = useState(false);
  const [ytResults, setYtResults] = useState<{title: string; url: string; filename: string}[]>([]);

  const { processImage, isProcessing: omrProcessing, progress: omrProgress, error: omrError } = useScoreLens();

  useEffect(() => {
    if (omrProcessing) {
      setIsPreparing(true);
      if (omrProgress) setPrepLabel(omrProgress);
    } else {
      setIsPreparing(false);
    }
  }, [omrProcessing, omrProgress]);

  useEffect(() => {
    if (omrError) {
      alert(`❌ OMR/Import Failed: ${omrError}`);
    }
  }, [omrError]);

  // Sync initialStudioMode prop changes (e.g. from Nimo AI)
  useEffect(() => {
    if (initialStudioMode) {
      setStudioMode(initialStudioMode);
    }
  }, [initialStudioMode]);

  // Sync props to state if they change (e.g. when navigating from Player)
  useEffect(() => {
    if (initialSong) {
      setCurrentProject(initialSong);
      setShowProjectBrowser(false);
    }
  }, [initialSong]);

  useEffect(() => {
    if (initialXml) {
      setXmlHistory([initialXml]);
      setHistoryIndex(0);
    }
  }, [initialXml]);

  // Keep MidiInputManager updated with the best active track
  useEffect(() => {
    if (pianorollTrackId) {
      midiInputManager.setActiveTrack(pianorollTrackId);
    } else if (tracks && tracks.length > 0) {
      const firstInst = tracks.find(t => t.type === 'instrument') || tracks[0];
      if (firstInst) midiInputManager.setActiveTrack(firstInst.id);
    }
  }, [pianorollTrackId, tracks]);

  // ── Transport & Audio State ──
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volumeDragStartYRef = useRef<number | null>(null);
  const volumeDragStartVolRef = useRef(0.8);
  const volumePopupRef = useRef<HTMLDivElement>(null);
  const volumeFillRef = useRef<HTMLDivElement>(null);
  const volumeTextRef = useRef<HTMLSpanElement>(null);

  const [currentBpm, setCurrentBpm] = useState(120);
  const [transpose, setTranspose] = useState(0);

  const barTextRef = useRef<HTMLSpanElement>(null);
  const beatTextRef = useRef<HTMLSpanElement>(null);
  const timeTextRef = useRef<HTMLSpanElement>(null);

  const scrubberFillRef = useRef<HTMLDivElement>(null);
  const scrubberThumbRef = useRef<HTMLDivElement>(null);

  const [isMetronomeOn, setIsMetronomeOn] = useState(false);


  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Engraver state ───────────────────────────────────────────────────
  const [engraverVisible, setEngraverVisible] = useState(true);
  const [engraverTool, setEngraverTool] = useState('select');
  const [svgPagesCount, setSvgPagesCount] = useState(0);
  const scoreContainerRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<ProScoreEditorRef>(null);
  const musicalTimeRef = useRef(0);

  // Harmony Generator state
  const [showHarmonyModal, setShowHarmonyModal] = useState(false);
  const [harmonyKey, setHarmonyKey] = useState('C');
  const [harmonyChords, setHarmonyChords] = useState('I IV V I');
  const [harmonyDurations, setHarmonyDurations] = useState('1 1 1 1');
  const [harmonyModel, setHarmonyModel] = useState('rule-based');

  const executeHarmony = async () => {
    setIsPreparing(true);
    setPrepLabel('GENERATING SATB HARMONY...');
    try {
      const res = await fetch('/vocalido/v1/generate_harmony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: harmonyKey,
          chord_progression: harmonyChords,
          durations: harmonyDurations,
          time_signature: parsedData?.timeSignature ? `${parsedData.timeSignature.beats}/${parsedData.timeSignature.beatType}` : '4/4',
          original_xml: currentXml,
          model_type: harmonyModel
        })
      });
      const data = await res.json();
      if (data.musicxml) {
        onXmlChange(data.musicxml);
        setShowHarmonyModal(false);
        // Automatically save the generated harmony back to IndexedDB
        if (currentProject) {
          const updatedMeta = { ...currentProject };
          await songStorage.saveSong(updatedMeta, data.musicxml, layoutBundle);
          onPublish(); // Trigger sync/refresh in App.tsx
        }
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
    if (parsedData?.metadata?.bpm) {
      setCurrentBpm(parsedData.metadata.bpm);
      musicEngine.setBpm(parsedData.metadata.bpm);
    }
  }, [parsedData?.metadata?.bpm]);

  const totalDurationSeconds = useMemo(() => {
    if (!parsedData?.notes || parsedData.notes.length === 0) return 180;
    const lastBeat = parsedData.notes.reduce((max, n) => Math.max(max, (n.startTime || 0) + (n.duration || 0)), 0);
    return (lastBeat * 60) / (currentBpm || 120) + 2; // +2s tail
  }, [parsedData, currentBpm]);

  // Sync tracks state when new parts are detected (e.g. after generating SATB)
  useEffect(() => {
    if (!parsedData.partNames) return;
    const newTrackIds = Object.keys(parsedData.partNames).sort().join(',');
    setTracks(prev => {
      const currentTrackIds = prev.map(t => t.id).sort().join(',');
      if (currentTrackIds === newTrackIds) return prev;
      
      return Object.keys(parsedData.partNames).map((id, index) => {
        const name = parsedData.partNames[id] || 'Track';
        const low = name.toLowerCase();
        let isVocal = false;
        if (Object.keys(parsedData.partNames).length === 1) isVocal = true;
        else if (/soprano|alto|tenor|bass|voice|vocal|choir|lead|harmony|melody|singer/.test(low)) isVocal = true;
        else if (index === 0) isVocal = true;

        return {
          id, name, isMuted: false, isSolo: false, lyricMode: 'British Fixed Doh' as any, volume: 0.8, pan: 0,
          mode: isVocal ? 'vocal' : 'instrument',
          instrument: isVocal ? 'Auto' : 'Piano',
          effects: Array(6).fill(null)
        };
      });
    });
  }, [parsedData.partNames, setTracks]);

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

  // Sync animation frame for transport time
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number;
    const updateTime = () => {
      const beatsPerMeasure = parsedData?.timeSignature?.beats || 4;
      const writtenBar = musicEngine.currentMeasure;
      const calcBar = writtenBar ? parseInt(writtenBar) || 1 : Math.floor(musicEngine.transportMusicalTime / beatsPerMeasure) + 1;
      const calcBeat = Math.floor(musicEngine.transportMusicalTime % beatsPerMeasure) + 1;
      
      if (barTextRef.current) barTextRef.current.innerText = calcBar.toString();
      if (beatTextRef.current) beatTextRef.current.innerText = calcBeat.toString();
      if (timeTextRef.current) timeTextRef.current.innerText = formatTime(musicEngine.transportSeconds);
      
      const seconds = musicEngine.transportSeconds;
      if (totalDurationSeconds > 0) {
        const pct = Math.min(100, Math.max(0, (seconds / totalDurationSeconds) * 100));
        if (scrubberFillRef.current) scrubberFillRef.current.style.width = `${pct}%`;
        if (scrubberThumbRef.current) scrubberThumbRef.current.style.left = `calc(${pct}% - 6px)`;
      }

      musicalTimeRef.current = musicEngine.transportMusicalTime;
      rafId = requestAnimationFrame(updateTime);
    };
    rafId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, parsedData, currentBpm]);

  // Ensure song is loaded into the engine
  useEffect(() => {
    if (parsedData?.notes && tracks.length > 0) {
      let combined = [...parsedData.notes];
      tracks.forEach(t => {
        if ((t as any)._generatedNotes) {
          combined = combined.concat((t as any)._generatedNotes);
        }
      });
      musicEngine.loadSong(combined, tracks, transpose, parsedData.timeSignature || { beats: 4 }, isMetronomeOn, true)
        .then(() => {
          // Re-attach audio sources if they exist in state but not in engine
          tracks.forEach(t => {
            if (t.audioSrc && !musicEngine.hasVocalLayer(t.id)) {
              musicEngine.addVocalLayer(t.id, t.audioSrc).catch(e => console.warn('Failed to restore vocal layer:', e));
            }
          });
        })
        .catch(e => console.warn('Failed to load song into engine:', e));
    }
  }, [parsedData, tracks, transpose, isMetronomeOn]);


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

  const executeExport = async (format: 'pdf' | 'png' | 'jpeg' | 'midi' | 'xml' | 'nimo' | 'wav' | 'mp3') => {
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
        case 'wav': 
        case 'mp3':
          if (!musicEngine.isSongLoaded) break;
          setPrepLabel('RECORDING MIXDOWN (PLEASE WAIT)...');
          musicEngine.pause();
          musicEngine.setTransportSeconds(0);
          await musicEngine.startMasterRecording();
          musicEngine.start();
          
          const maxDur = parsedData.notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0) + 2; // +2s tail
          
          await new Promise<void>(resolve => {
            setTimeout(async () => {
              musicEngine.pause();
              musicEngine.setTransportSeconds(0);
              setPrepLabel('CONVERTING AUDIO...');
              const url = await musicEngine.stopMasterRecording();
              if (url) {
                // Fetch the webm blob
                const webmBlob = await fetch(url).then(r => r.blob());
                if (format === 'wav') {
                  const wavBlob = await AudioConverter.webmToWav(webmBlob);
                  tLink(URL.createObjectURL(wavBlob), `${fn}_MIXDOWN.wav`);
                } else if (format === 'mp3') {
                  const mp3Blob = await AudioConverter.webmToMp3(webmBlob);
                  tLink(URL.createObjectURL(mp3Blob), `${fn}_MIXDOWN.mp3`);
                }
              }
              resolve();
            }, maxDur * 1000);
          });
          break;
      }
    } finally { setIsPreparing(false); }
  };

  // ── Refs for stable NimoBrain callbacks ──
  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const executeExportRef = useRef(executeExport);
  useEffect(() => { handleUndoRef.current = handleUndo; }, [handleUndo]);
  useEffect(() => { handleRedoRef.current = handleRedo; }, [handleRedo]);
  useEffect(() => { executeExportRef.current = executeExport; });

  // Register Studio-specific NimoBrain actions once on mount
  useEffect(() => {
    const unregUndo = nimoBrain.registerAction('undo', () => {
      console.log('[StudioPage] Nimo requested undo');
      handleUndoRef.current();
    }, { th: 'ย้อนกลับการแก้ไขล่าสุดใน Studio', en: 'Undo last edit in Studio', category: 'studio' });

    const unregRedo = nimoBrain.registerAction('redo', () => {
      console.log('[StudioPage] Nimo requested redo');
      handleRedoRef.current();
    }, { th: 'ทำซ้ำการแก้ไขที่ย้อนกลับ', en: 'Redo last undone edit', category: 'studio' });

    const unregExportSong = nimoBrain.registerAction('export_song', (params) => {
      console.log('[StudioPage] Nimo requested export_song', params);
      const formatMap: Record<string, string> = {
        musicxml: 'xml',
        midi: 'midi',
        pdf: 'pdf',
        wav: 'wav',
        mp3: 'mp3',
        png: 'png',
        jpeg: 'jpeg',
        nimo: 'nimo',
      };
      const rawFormat = params?.format;
      const mapped = rawFormat ? formatMap[rawFormat] || rawFormat : null;
      if (mapped) {
        executeExportRef.current(mapped as any);
      } else {
        // No format specified — open the export modal for the user to choose
        setShowExportModal(true);
      }
    }, { th: 'ส่งออกเพลง', en: 'Export song', params: "{ format?: 'musicxml' | 'midi' | 'pdf' | 'wav' }", category: 'studio' });

    return () => {
      unregUndo();
      unregRedo();
      unregExportSong();
    };
  }, []);

  if (showProjectBrowser) {
    return (
      <div className="h-full w-full flex flex-col bg-[#050507] p-8">
        <h1 className="text-3xl font-black text-white italic mb-10 tracking-widest">STUDIO MATRIX</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
          <div
            onClick={() => setShowProjectBrowser(false)}
            className="aspect-video bg-white/[0.03] border-2 border-dashed border-white/5 rounded-[24px] flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/[0.05] transition-all active:scale-95"
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
                
                let successCount = 0;
                
                for (const file of files) {
                  try {
                    const { metadata, xmlData, layoutBundle } = await parseMusicXMLMetadata(file);
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
            className="aspect-video bg-amber-500/5 border-2 border-dashed border-amber-500/20 rounded-[24px] flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-amber-500/10 transition-all active:scale-95"
          >
            <Download size={32} className="text-amber-500" />
            <span className="text-amber-500 font-black uppercase text-[9px] tracking-[0.3em]">Import & Convert (.EMK)</span>
          </div>
        </div>
      </div>
    );
  }
  const handleYtDownload = async () => {
    if (!ytInput.trim()) return;
    const rawLines = ytInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const urls = [...new Set(rawLines)].map(u => u.startsWith('http') ? u : 'ytsearch1:' + u);
    if (urls.length === 0) return;

    setIsYtDownloading(true);
    setYtResults([]);
    const results: {title: string; url: string; filename: string}[] = [];
    const total = urls.length;

    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast(`Downloading ${total} clip(s)...`, '#ef4444');
    }

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setYtProgress(`${i + 1} / ${total}`);
      try {
        const res = await fetch('/vocalido/api/youtube/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, quality: 'auto' })
        });
        const data = await res.json();
        if (data.url) {
          const item = { title: data.title || 'Unknown', url: data.url, filename: data.filename };
          results.push(item);
          setYtResults([...results]);
          window.dispatchEvent(new CustomEvent('youtube_downloaded', {
            detail: { url: data.url, title: data.title, filename: data.filename }
          }));
        }
      } catch (e) {
        console.error(`Failed to download ${url}`, e);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(`❌ ${i+1}/${total}: Failed`, '#EF4444');
        }
      }
    }

    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast(`Done! ${results.length}/${total} downloaded`, '#10B981');
    }
    setYtInput('');
    setYtProgress('');
    setIsYtDownloading(false);
    setShowYtModal(false);
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#050507] overflow-hidden relative">

      {/* ══ Top Header ══════════════════════════════════════════════════ */}
      <header className="h-14 bg-[#0c0c0e] border-b border-white/5 flex items-center justify-between px-4 z-[3000] shrink-0 gap-4 overflow-x-auto">
        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={onExit} 
            className="w-9 h-9 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 hover:scale-105 transition-all group"
            title="Exit Studio"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div className="min-w-0 flex flex-col justify-center">
            <h2 className="text-[11px] font-black text-white uppercase italic truncate max-w-[150px] leading-none">
              {currentProject?.title || 'UNTITLED MATRIX'}
            </h2>
            <p className="text-[7px] font-bold text-cyan-500 uppercase tracking-widest truncate mt-1">
              {currentProject?.artist || 'MAESTRO'} · {parsedData.timeSignature?.beats || 4}/{parsedData.timeSignature?.beatType || 4}
            </p>
          </div>
        </div>

        {/* ── Center Controls (Undo/Redo & Mode) ── */}
        <div className="flex items-center gap-4 shrink-0 mx-auto">
          {/* Undo / Redo */}
          {studioMode === 'editor' && (
            <div className="flex bg-[#111] p-1 rounded-2xl border border-white/10 shrink-0 gap-1">
              <button 
                onClick={() => setHistoryIndex(i => Math.max(0, i - 1))}
                disabled={historyIndex <= 0}
                className="w-8 h-7 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Undo"
              >
                <RotateCcw size={12} />
              </button>
              <button 
                onClick={() => setHistoryIndex(i => Math.min(xmlHistory.length - 1, i + 1))}
                disabled={historyIndex >= xmlHistory.length - 1}
                className="w-8 h-7 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="Redo"
              >
                <RotateCw size={12} />
              </button>
            </div>
          )}

          <div className="flex bg-[#111] p-1 rounded-2xl border border-white/10 shrink-0">
            {/* COMPOSER TAB */}
            <button 
              onClick={() => setStudioMode('composer')} 
              className={`relative px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all group ${
                studioMode === 'composer' 
                ? 'text-white shadow-[0_0_30px_rgba(34,211,238,0.6)] scale-105 z-10' 
                : 'text-zinc-300 hover:text-white'
              }`}
            >
              {studioMode !== 'composer' && (
                <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                  <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent animate-[spin_4s_linear_infinite] opacity-50" />
                  <div className="absolute inset-[1px] bg-[#111] rounded-[10px] z-0" />
                  <div className="absolute inset-0 border border-cyan-500/30 rounded-xl z-0" />
                </div>
              )}
              {studioMode === 'composer' && (
                <>
                  <div className="absolute -inset-3 bg-gradient-to-r from-cyan-400 to-indigo-500 opacity-40 blur-lg animate-pulse pointer-events-none rounded-2xl" />
                  <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none shadow-[inset_0_0_20px_rgba(0,229,255,0.5)]">
                    <div className="absolute inset-0 bg-black/60" />
                    <div className="absolute -inset-[100%] bg-[conic-gradient(from_0deg,transparent_0_320deg,rgba(0,229,255,1)_360deg)] animate-[spin_1.5s_linear_infinite]" />
                    <div className="absolute inset-[1.5px] rounded-[10.5px] bg-gradient-to-r from-indigo-600/90 to-cyan-500/90 z-0" />
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30 mix-blend-overlay z-0" />
                  </div>
                </>
              )}
              <span className="relative z-10 flex items-center gap-1.5 drop-shadow-md">
                COMPOSER
              </span>
            </button>

            {/* ARRANGER TAB */}
            <button 
              onClick={() => setStudioMode('arranger')} 
              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${
                studioMode === 'arranger' || studioMode === 'pianoroll'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] scale-105 z-10' 
                  : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {studioMode === 'arranger' ? (
                <Zap size={10} className="text-yellow-300 fill-yellow-300 animate-bounce" />
              ) : (
                <Zap size={10} className="text-cyan-400/60" />
              )}
              AI ARRANGER
            </button>

            {/* EDITOR TAB */}
            <button 
              onClick={() => setStudioMode('editor')} 
              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                studioMode === 'editor' 
                  ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)] scale-105 z-10' 
                  : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              EDITOR
            </button>

            {/* YOUTUBE DOWNLOAD BUTTON */}
            <button
              onClick={() => setShowYtModal(true)}
              className="flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/30 hover:text-white transition-all"
            >
              <Youtube size={11} /> YouTube
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 mr-6">
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
              input.multiple = false;
              input.accept = 'image/*,application/pdf,.pdf,.emk,.mid,.midi,.xml,.musicxml,.mxl';
              input.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                  const result = await processImage(file, 'th');
                  if (result && !('error' in result)) {
                    // Update current project with the new imported song
                    setCurrentProject(result.song);
                    setXmlHistory([result.xmlData]);
                    setHistoryIndex(0);
                    setStudioMode('editor');
                    onPublish();
                    alert(`✅ OMR / Import Success!`);
                  }
                } catch (err) {
                  console.error('[OMR]', err);
                }
              };
              input.click();
            }}
            className="px-3 h-8 bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center gap-2 rounded-xl text-[8px] font-black uppercase hover:bg-purple-500 hover:text-black transition-all"
          >
            <Search size={12}/> OMR SCAN
          </button>

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
                
                let successCount = 0;
                
                for (const file of files) {
                  try {
                    const { metadata, xmlData, layoutBundle } = await parseMusicXMLMetadata(file);
                    metadata.origin = 'load'; 
                    await songStorage.saveSong(metadata, xmlData, layoutBundle);
                    successCount++;
                  } catch (err) {
                    console.error(`[Studio] Failed to import ${file.name}:`, err);
                  }
                }
                
                setIsPreparing(false);
                if (successCount > 0) {
                  onPublish(); 
                  alert(`✅ Successfully imported ${successCount} songs to your library!`);
                } else {
                  alert(`❌ Failed to import files. Please check format.`);
                }
              };
              input.click();
            }}
            className="px-3 h-8 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-[8px] font-black uppercase hover:bg-amber-500 hover:text-black transition-all"
          >
            IMPORT
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="px-3 h-8 bg-white text-black rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 transition-all"
          >
            EXPORT
          </button>
        </div>
      </header>

      {/* ══ Studio View Area ═════════════════════════════════════════════ */}
      <div className="flex-1 relative overflow-hidden bg-[#0a0a0c]">
        {(() => {
          const allPlayableNotes = (() => {
            let combined = [...(parsedData?.notes || [])];
            if (tracks && tracks.length > 0) {
              tracks.forEach(t => {
                if ((t as any)._generatedNotes) {
                  combined = combined.concat((t as any)._generatedNotes);
                }
              });
            }
            return combined;
          })();

          if (studioMode === 'composer') {
            return (
              <ComposerPage 
                parsedData={parsedData}
                tracks={tracks}
                setTracks={setTracks}
                onTrackCreated={(trackId) => {
                  // Do not automatically navigate to arranger
                  // setStudioMode('arranger');
                }}
              />
            );
          } else if (studioMode === 'arranger') {
            return (
              <ArrangerPage 
                song={currentProject} 
                musicXml={currentXml} 
                tracks={tracks} 
                setTracks={setTracks} 
                hideHeader={true}
                visualType={arrangerVisualType}
                onTrackDoubleClick={(trackId, targetMode) => {
                  setPianorollTrackId(trackId);
                  setStudioMode(targetMode || 'pianoroll');
                }}
              />
            );
          } else if (studioMode === 'pianoroll') {
            return (
              <div className="absolute inset-0 z-10 overflow-hidden bg-[#0a0a0c]">
                <PerformanceScore
                  notes={allPlayableNotes.filter(n => n.trackId === pianorollTrackId) || []}
                  tracks={tracks}
                  musicalTimeRef={musicalTimeRef}
                  onSeek={(time) => musicEngine.setTransportSeconds(time)}
                  onTogglePlay={() => {
                    if (musicEngine.transportState === 'started') musicEngine.pause();
                    else musicEngine.start();
                  }}
                  bpm={currentBpm}
                  isPlaying={isPlaying}
                  songKey={currentProject?.key || 'C'}
                  beatsPerMeasure={parsedData?.timeSignature?.beats || 4}
                />
                {/* Back button */}
                <button 
                  onClick={() => setStudioMode('arranger')}
                  className="absolute top-4 left-4 z-[5000] px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black uppercase tracking-widest backdrop-blur-md shadow-lg border border-white/10 transition-all active:scale-95 flex items-center gap-2"
                >
                  ← Back to Arranger
                </button>
              </div>
            );
          } else {
            return (
              <>
                <div ref={scoreContainerRef} className="absolute inset-0 z-0">
                  <ProScoreEditor
                    ref={scoreRef}
                    xmlData={currentXml}
                    lyricMode={localStorage.getItem('memo_lyric_mode') || 'Ju Solfege Movable Doh'}
                    onXmlChange={(newXml) => {
                      const solfegeXml = injectSolfegeToXml(newXml, localStorage.getItem('memo_lyric_mode') || 'Ju Solfege Movable Doh');
                      onXmlChange(solfegeXml);
                    }}
                    currentTime={0}
                    isPlaying={isPlaying}
                    layoutMode="paginated"
                    isLoupeEnabled={false}
                    songMetadata={currentProject}
                    zoom={1.0}
                    isEditable={true}
                    onPageCountChange={setSvgPagesCount}
                    layoutBundle={layoutBundle}
                  />
                </div>

                <ScoreEditOverlay
                  containerRef={scoreContainerRef}
                  xmlData={currentXml}
                  isEditable={true}
                  activeTool={activeTool}
                  activeDuration={activeDuration || 'quarter'}
                  onXmlChange={onXmlChange}
                  svgPagesCount={svgPagesCount}
                />
              </>
            );
          }
        })()}
      </div>

      {/* ══ Maestro Engraver — floating draggable panel ══════════════════ */}
      {studioMode === 'editor' && (
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
      )}

      {/* ── Footer Transport Controls ── */}
      <footer className="shrink-0 bg-[#0A0A0C]/95 backdrop-blur-xl border-t border-white/5 flex flex-col items-center sm:px-4 py-2 gap-2 relative z-[30] pointer-events-auto w-full">
        {/* Scrubber (Slide Bar) */}
        <div className="w-full max-w-[500px] bg-[#0c0c0e]/90 backdrop-blur-2xl px-3 h-8 rounded-full border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center gap-3">
          <span ref={timeTextRef} className="text-[9px] font-black text-cyan-400 lcd-font tabular-nums w-9 text-right">0:00</span>
          <div 
            className="flex-1 relative h-[2px] flex items-center cursor-pointer group overflow-hidden" 
            onClick={(e) => { 
              const rect = e.currentTarget.getBoundingClientRect(); 
              musicEngine.setTransportSeconds(((e.clientX - rect.left) / rect.width) * totalDurationSeconds); 
              
              const seconds = ((e.clientX - rect.left) / rect.width) * totalDurationSeconds;
              if (timeTextRef.current) timeTextRef.current.innerText = formatTime(seconds);
              const pct = Math.min(100, Math.max(0, (seconds / totalDurationSeconds) * 100));
              if (scrubberFillRef.current) scrubberFillRef.current.style.width = `${pct}%`;
              if (scrubberThumbRef.current) scrubberThumbRef.current.style.left = `calc(${pct}% - 6px)`;
            }}
          >
            <div className="w-full h-full bg-white/20 rounded-full" />
            <div ref={scrubberFillRef} className="absolute h-full bg-cyan-400 left-0 transition-all shadow-[0_0_8px_#00e5ff]" style={{ width: '0%' }} />
            <div ref={scrubberThumbRef} className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_#fff] transition-all" style={{ left: '-6px' }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-zinc-300 lcd-font tabular-nums w-9 text-left">{formatTime(totalDurationSeconds)}</span>
            <div className="h-3 w-px bg-white/20 mx-1" />
            <button
              onClick={() => {
                const next = !isMetronomeOn;
                setIsMetronomeOn(next);
                musicEngine.toggleMetronome(next);
              }}
              className={`p-1 transition-all ${isMetronomeOn ? 'text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.8)]' : 'text-white/80 hover:text-white'}`}
            >
              <Bell size={13} fill={isMetronomeOn ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        {/* Main Transport */}
        <div className="w-full max-w-[calc(100vw-8px)] md:max-w-[640px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-full h-[54px] min-[360px]:h-[64px] flex items-center justify-between px-1.5 min-[360px]:px-2.5 sm:px-3 md:px-4 pointer-events-auto relative">
          
          {/* LEFT GROUP: Mixer Toggle, Volume & SCR vertically stacked */}
          <div className="flex items-center gap-1.5 min-[360px]:gap-2 border-r border-zinc-100 pr-1.5 min-[360px]:pr-2.5 md:pr-3.5">
            <button
              onClick={() => {}} // Disabled or No-op for now in Arrange view
              className="w-8 h-8 min-[380px]:w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all text-zinc-300 cursor-not-allowed"
              title="Mixer (Not available in Arrange Mode)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 min-[380px]:w-4 min-[380px]:h-4 sm:w-[18px] sm:h-[18px]" />
            </button>

            {/* Vertical stack for Volume and SCR */}
            <div className="flex flex-col gap-0.5 items-center justify-center">
              {/* Volume Trigger */}
              <div className="relative" ref={volumePopupRef}>
                <button
                  onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                  className={`w-6 h-6 min-[360px]:w-7 h-7 rounded-full flex items-center justify-center transition-all border ${
                    showVolumeSlider
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-600 shadow-[0_0_10px_rgba(0,229,255,0.4)]'
                      : 'border-transparent text-zinc-400 hover:text-cyan-500 hover:bg-zinc-50'
                  }`}
                  title="Volume Control"
                >
                  {masterVolume === 0 ? (
                    <VolumeX className="w-2.5 h-2.5 min-[360px]:w-3 h-3" />
                  ) : (
                    <Volume2 className={`w-2.5 h-2.5 min-[360px]:w-3 h-3 ${showVolumeSlider ? 'text-cyan-600' : 'text-zinc-400 hover:text-cyan-500'}`} />
                  )}
                </button>
              
              {showVolumeSlider && (
                <div
                  className="absolute bottom-[48px] left-[-10px] w-12 h-48 bg-[#0c0c0e]/95 backdrop-blur-2xl rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 p-2.5 flex flex-col items-center animate-in slide-in-from-bottom-3 duration-300 z-[9999] select-none touch-none"
                  onPointerDown={(e) => {
                    volumeDragStartYRef.current = e.clientY;
                    volumeDragStartVolRef.current = masterVolume;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    e.stopPropagation();
                  }}
                  onPointerMove={(e) => {
                    if (volumeDragStartYRef.current === null) return;
                    const deltaY = volumeDragStartYRef.current - e.clientY;
                    const newVol = Math.max(0, Math.min(1, volumeDragStartVolRef.current + deltaY / 100));
                    musicEngine.setMasterVolume(newVol);
                    if (volumeFillRef.current) {
                      volumeFillRef.current.style.height = `${newVol * 100}%`;
                    }
                    if (volumeTextRef.current) {
                      volumeTextRef.current.innerText = Math.round(newVol * 100).toString();
                    }
                  }}
                  onPointerUp={(e) => { 
                    if (volumeDragStartYRef.current !== null) {
                      const deltaY = volumeDragStartYRef.current - e.clientY;
                      const newVol = Math.max(0, Math.min(1, volumeDragStartVolRef.current + deltaY / 100));
                      setMasterVolume(newVol);
                    }
                    volumeDragStartYRef.current = null; 
                  }}
                  onPointerCancel={() => { volumeDragStartYRef.current = null; }}
                >
                  <div className="flex-1 w-2 bg-black rounded-full relative overflow-hidden border border-white/5 shadow-inner cursor-ns-resize">
                    <div
                      ref={volumeFillRef}
                      className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-cyan-600 via-cyan-400 to-white shadow-[0_0_10px_rgba(0,229,255,0.6)]"
                      style={{ height: `${masterVolume * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 bg-black/80 px-1 py-0.5 rounded-lg border border-cyan-500/30 flex items-center justify-center min-w-[24px]">
                    <span ref={volumeTextRef} className="text-[10px] font-black text-cyan-400 tracking-tighter leading-none">{Math.round(masterVolume * 100)}</span>
                  </div>
                </div>
              )}
            </div>

              {/* SCR (Score toggle) */}
              <button
                onClick={() => setArrangerVisualType(arrangerVisualType === 'score' ? 'pianoroll' : 'score')}
                className={`w-6 h-6 min-[360px]:w-7 h-7 border rounded-full flex flex-col items-center justify-center group active:scale-95 transition-all ${
                  arrangerVisualType === 'score' ? 'bg-[#fbfbfb] border-zinc-100 text-zinc-400' : 'bg-cyan-50 border-cyan-100 text-cyan-500'
                }`}
                title="Toggle Score View"
              >
                <Music className={`w-2.5 h-2.5 min-[360px]:w-3 h-3 ${arrangerVisualType === 'score' ? 'text-zinc-400 group-hover:text-zinc-600' : 'text-cyan-500'}`} />
              </button>
            </div>
          </div>

          {/* CENTER GROUP: Narrow LCD Display */}
          <div className="flex-1 flex justify-center px-1">
            <div className="bg-[#0c0c0e] rounded overflow-hidden flex flex-row items-center justify-center font-mono text-[#00e5ff] w-full max-w-[280px] sm:max-w-[340px] md:max-w-[420px] h-[34px] min-[360px]:h-[38px] sm:h-[42px] md:h-[46px] border border-white/5 shadow-inner relative">
              <div className="flex-1 h-full border-r border-white/[0.03] flex items-center justify-center">
                <KeyTransposeDisplay keySig={parsedData.metadata.key || currentProject?.key || 'C'} transpose={transpose} onTransposeChange={setTranspose} />
              </div>
              <div className="flex-1 h-full border-r border-white/[0.03] flex items-center justify-center">
                <BpmDisplay bpm={currentBpm} onBpmChange={(b) => { setCurrentBpm(b); musicEngine.setBpm(b); }} />
              </div>
              <div className="flex-1 h-full flex items-center justify-center">
                <BarBeatPositionDisplay barRef={barTextRef} beatRef={beatTextRef} onSeek={(bar) => {
                  const beatsPerMeasure = parsedData?.timeSignature?.beats || 4;
                  if (barTextRef.current) barTextRef.current.innerText = bar.toString();
                  musicEngine.setTransportSeconds((bar - 1) * beatsPerMeasure * (60 / currentBpm));
                }} />
              </div>
            </div>
          </div>

          {/* RIGHT GROUP: Back and Play/Pause Controls */}
          <div className="flex items-center gap-1.5 min-[360px]:gap-2 pl-1 min-[360px]:pl-1.5 pr-1.5 min-[360px]:pr-2.5">
            <button onClick={() => { 
                musicEngine.pause();
                musicEngine.setTransportSeconds(0);
                setIsPlaying(false);
                if (barTextRef.current) barTextRef.current.innerText = "1";
                if (beatTextRef.current) beatTextRef.current.innerText = "1";
              }} className="p-1.5 md:p-2 text-zinc-400 hover:text-white transition-colors group">
              <SkipBack className="w-3.5 h-3.5 min-[360px]:w-4 min-[360px]:h-4 sm:w-[19px] sm:h-[19px]" fill="currentColor" />
            </button>

            <div className="relative">
              <div className={`absolute inset-0 bg-[#00e5ff]/20 blur-md rounded-full transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
              <button
                onClick={async () => {
                  if (isPlaying) {
                    musicEngine.pause();
                    setIsPlaying(false);
                  } else {
                    await musicEngine.start();
                    setIsPlaying(true);
                  }
                }}
                className="relative w-10 h-10 min-[360px]:w-11 h-11 sm:w-12 sm:h-12 md:w-[54px] md:h-[54px] rounded-full flex items-center justify-center text-white transition-all active:scale-95 bg-[#00e5ff] hover:bg-[#00c8e0] shadow-[0_4px_25px_rgba(0,229,255,0.5)]"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 sm:w-[24px] sm:h-[24px]" fill="white" />
                ) : (
                  <Play className="w-4 h-4 sm:w-[24px] sm:h-[24px] ml-0.5 sm:ml-1" fill="white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </footer>

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
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1 block">AI Model</label>
                <select value={harmonyModel} onChange={e => setHarmonyModel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-indigo-500/50 mb-4 appearance-none">
                  <option value="rule-based">Rule-Based SATB (Fast, Simple)</option>
                  <option value="deepbach">DeepBach (JS Bach Style SATB)</option>
                  <option value="transformer">Transformer (Pop/General Accompaniment)</option>
                </select>
              </div>
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
                { f: 'wav',  n: 'Audio (WAV)',       c: 'text-fuchsia-400',I: Headphones},
                { f: 'mp3',  n: 'Audio (MP3)',       c: 'text-emerald-400',I: Headphones},
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

      {/* ══ YouTube Batch Download Modal ═══════════════════════════════ */}
      {showYtModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[6500] flex items-center justify-center p-6" onClick={() => !isYtDownloading && setShowYtModal(false)}>
          <div className="w-full max-w-lg bg-[#0c0c0e] border border-red-500/20 rounded-[32px] p-8 relative shadow-[0_0_60px_rgba(239,68,68,0.1)] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <button onClick={() => { if (!isYtDownloading) { setShowYtModal(false); setYtResults([]); } }} className="absolute top-6 right-6 text-zinc-500 hover:text-white disabled:opacity-30 z-10" disabled={isYtDownloading}>
              <X size={24} />
            </button>

            <h3 className="text-sm font-black text-white italic uppercase tracking-widest mb-2 flex gap-2 items-center shrink-0">
              <Youtube size={16} className="text-red-500" />
              YouTube Batch Download
            </h3>

            {/* ── Phase 1: Input ── */}
            {ytResults.length === 0 && !isYtDownloading && (
              <>
                <p className="text-[10px] text-zinc-500 mb-4 shrink-0">Paste up to 20 YouTube links or song names (one per line)</p>
                <textarea
                  value={ytInput}
                  onChange={e => setYtInput(e.target.value)}
                  placeholder={"https://www.youtube.com/watch?v=...\nhttps://youtu.be/...\nHello - Adele\nBohemian Rhapsody - Queen"}
                  rows={8}
                  className="w-full bg-black/60 border border-white/10 rounded-2xl p-4 text-xs text-white font-mono placeholder-zinc-700 outline-none resize-none focus:border-red-500/40 transition-colors"
                />
                <div className="flex items-center justify-between mt-4 shrink-0">
                  <span className="text-[10px] font-bold text-zinc-500">
                    {ytInput.trim() ? `${ytInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length} link(s)` : 'No links yet'}
                  </span>
                  <button
                    onClick={handleYtDownload}
                    disabled={!ytInput.trim()}
                    className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg hover:shadow-red-500/30 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                  >
                    <Download size={14} />
                    Start Download
                  </button>
                </div>
              </>
            )}

            {/* ── Phase 2: Downloading Progress ── */}
            {isYtDownloading && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
                <div className="w-16 h-16 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin" />
                <p className="text-sm font-black text-white uppercase tracking-widest">Downloading {ytProgress}</p>
                {ytResults.length > 0 && (
                  <p className="text-[10px] text-emerald-400 font-bold">{ytResults.length} completed</p>
                )}
              </div>
            )}

            {/* ── Phase 3: Song List Results ── */}
            {ytResults.length > 0 && !isYtDownloading && (
              <>
                <p className="text-[10px] text-emerald-400 font-bold mb-3 shrink-0">{ytResults.length} song(s) downloaded successfully</p>
                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar min-h-0 pr-1">
                  {ytResults.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 hover:bg-white/10 transition-colors group">
                      <span className="text-[10px] font-black text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                      <Music size={12} className="text-red-400 shrink-0" />
                      <span className="text-xs font-bold text-zinc-300 truncate flex-1" title={item.title}>{item.title}</span>
                      <button
                        onClick={() => handleSaveFile(item.url, item.filename)}
                        className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/30 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                        title="Save to computer"
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5 shrink-0">
                  <button
                    onClick={() => { setYtResults([]); setYtInput(''); }}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 border border-white/10 hover:text-white hover:bg-white/5 transition-all"
                  >
                    New Batch
                  </button>
                  <button
                    onClick={handleSaveAll}
                    className="flex-1 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg hover:shadow-emerald-500/30 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                  >
                    <Download size={14} />
                    Save All to Computer ({ytResults.length})
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioPage;
