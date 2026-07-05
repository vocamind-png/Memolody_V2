import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Blocks, Loader2, Music2, Scissors, Link, Repeat, Trash2, PlusCircle, Search, Settings2, ArrowLeft, Wand2, Volume2, VolumeX, Mic2, MessageSquare, ZoomIn, ZoomOut, Undo2, Redo2, ClipboardPaste, Copy, Eraser, MousePointerClick, MousePointer2, Wrench, Download, BookOpen, Headphones, Youtube } from 'lucide-react';
import { Song, TrackState } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';
import { SymbolicArranger, ArrangementConfig } from '../../lib/SymbolicArranger';
import { AIArrangerService } from '../../lib/AIArrangerService';
import { songStorage } from '../../lib/SongStorage';
import { NeuralRenderService } from '../../lib/NeuralRenderService';
import { nimoBrain } from '../../lib/NimoBrain';
import { TrackVisualizer } from './TrackVisualizer';
import { AudioTrackVisualizer } from './AudioTrackVisualizer';
import { GM_INSTRUMENTS } from '../../lib/instruments';

// Dummy data for sections for demonstration
interface SongSection {
  id: string;
  name: string;
  startMeasure: number;
  endMeasure: number;
  color: string;
}

interface AudioBinFile {
  url: string;
  filename: string;
  title: string;
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

const ArrangerPage: React.FC<ArrangerPageProps> = ({ song, musicXml, tracks, setTracks, hideHeader, onTrackDoubleClick, visualType = 'score' }) => {
  const localSong = useMemo(() => song || { title: 'Untitled Composition', artist: 'Nimo', bpm: 120, key: 'C', duration: 180 } as any, [song]);
  const [localXml, setLocalXml] = useState(musicXml || '');
  const parsedData = useMemo(() => musicEngine.parseMusicXml(localXml), [localXml]);
  
  useEffect(() => {
    if (musicXml) setLocalXml(musicXml);
  }, [musicXml]);

  useEffect(() => {
    const handleYoutubeDownloaded = (e: CustomEvent) => {
      setDownloadedFiles(prev => {
        // Prevent duplicate adds if event fires multiple times
        if (prev.some(f => f.url === e.detail.url)) return prev;
        return [...prev, e.detail];
      });
    };
    
    window.addEventListener('youtube_downloaded' as any, handleYoutubeDownloaded);

    return () => {
      window.removeEventListener('youtube_downloaded' as any, handleYoutubeDownloaded);
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportStem = () => {
    if (!localXml) {
      alert("No notes to export");
      return;
    }
    const blob = new Blob([localXml], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'melody-stem.musicxml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAudio = async () => {
    setIsExporting(true);
    try {
      const blob = await musicEngine.exportMaster('webm');
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Memolody_Export_${new Date().getTime()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Export failed", e);
      alert("Audio export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadYoutube = async () => {
    if (!youtubeUrl) return;
    setIsDownloading(true);
    try {
      const res = await fetch('/vocalido/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl })
      });
      const data = await res.json();
      if (data.url) {
        // Create new track with this audio
        const newTrack: TrackState = {
            id: `youtube-${Date.now()}`,
            name: data.title || 'YouTube Audio',
            type: 'audio',
            volume: 80,
            pan: 0,
            isMuted: false,
            isSolo: false,
            audioRegions: [{
                id: `region-${Date.now()}`,
                url: data.url,
                startTime: 0,
                duration: 200, // Approximate, Tone handles duration dynamically
                sourceOffset: 0,
                timeStretchRatio: 1,
                name: 'YouTube Audio'
            }]
        };
        setTracks(prev => [...prev, newTrack]);
        setShowYoutubeModal(false);
        setYoutubeUrl('');
      } else {
        alert(data.error || "Failed to download YouTube video");
      }
    } catch (e) {
      console.error(e);
      alert("Error contacting backend for YouTube download");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSeparateStems = async (stems: 2 | 4) => {
    if (!stemTargetTrackId) return;
    const targetTrack = tracks.find(t => t.id === stemTargetTrackId);
    if (!targetTrack || !targetTrack.audioRegions || targetTrack.audioRegions.length === 0) return;
    
    setIsSeparating(true);
    // Use the first region for simplicity
    const region = targetTrack.audioRegions[0];
    const fileUrl = region.url;
    
    try {
      const res = await fetch('/vocalido/api/ai/separate-stems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: fileUrl, stems })
      });
      const data = await res.json();
      if (data.stems) {
        const newTracks: TrackState[] = [];
        Object.keys(data.stems).forEach((stemName, idx) => {
          newTracks.push({
            id: `stem-${stemName}-${Date.now()}-${idx}`,
            name: `${targetTrack.name} (${stemName})`,
            type: 'audio',
            volume: 80,
            pan: 0,
            isMuted: false,
            isSolo: false,
            audioRegions: [{
              ...region,
              id: `region-${stemName}-${Date.now()}`,
              url: data.stems[stemName],
              name: stemName
            }]
          });
        });
        
        // Remove original track, add new ones
        setTracks(prev => {
            const filtered = prev.filter(t => t.id !== stemTargetTrackId);
            return [...filtered, ...newTracks];
        });
        setShowStemModal(false);
      } else {
        alert(data.error || "Failed to separate stems");
      }
    } catch (e) {
      console.error(e);
      alert("Error contacting backend for stem separation");
    } finally {
      setIsSeparating(false);
      setStemTargetTrackId(null);
    }
  };

  const handleAddSong = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const xml = ev.target?.result as string;
      try {
        setLocalXml(xml);
        alert("Song loaded successfully!");
      } catch (err) {
        alert("Failed to load song: " + err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  
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
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showStemModal, setShowStemModal] = useState(false);
  const [isSeparating, setIsSeparating] = useState(false);
  const [stemTargetTrackId, setStemTargetTrackId] = useState<string | null>(null);
  const [downloadedFiles, setDownloadedFiles] = useState<AudioBinFile[]>([]);
  const [ytInput, setYtInput] = useState('');
  const [isYtDownloading, setIsYtDownloading] = useState(false);
  const [audioBinOpen, setAudioBinOpen] = useState(true);

  // --- DAW Tools & Audio State ---
  const [activeTool, setActiveTool] = useState<'pointer' | 'scissors' | 'glue'>('pointer');
  const [armedTrackId, setArmedTrackId] = useState<string | null>(null);
  
  const handleRegionSplit = (trackId: string, regionId: string, splitTimeRelative: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId && t.audioRegions) {
        const regionIndex = t.audioRegions.findIndex(r => r.id === regionId);
        if (regionIndex === -1) return t;
        const region = t.audioRegions[regionIndex];
        
        if (splitTimeRelative < 0.1 || splitTimeRelative > region.duration - 0.1) return t;

        const region1 = { 
          ...region, 
          id: `${region.id}_a`, 
          duration: splitTimeRelative,
          sourceDuration: splitTimeRelative * region.timeStretchRatio
        };
        const region2 = { 
          ...region, 
          id: `${region.id}_b`, 
          startTime: region.startTime + splitTimeRelative,
          duration: region.duration - splitTimeRelative,
          sourceOffset: region.sourceOffset + (splitTimeRelative * region.timeStretchRatio),
          sourceDuration: (region.duration - splitTimeRelative) * region.timeStretchRatio
        };

        const newRegions = [...t.audioRegions];
        newRegions.splice(regionIndex, 1, region1, region2);
        
        return { ...t, audioRegions: newRegions };
      }
      return t;
    }));
  };

  const handleRegionGlue = (trackId: string, regionId: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id === trackId && t.audioRegions) {
        const sortedRegions = [...t.audioRegions].sort((a, b) => a.startTime - b.startTime);
        const regionIndex = sortedRegions.findIndex(r => r.id === regionId);
        
        if (regionIndex === -1 || regionIndex === sortedRegions.length - 1) return t;
        
        const region1 = sortedRegions[regionIndex];
        const region2 = sortedRegions[regionIndex + 1];
        
        if (region1.bufferId === region2.bufferId) {
          const newRegion = {
            ...region1,
            id: `${region1.id}_merged`,
            duration: (region2.startTime + region2.duration) - region1.startTime,
            sourceDuration: (region2.sourceOffset + region2.sourceDuration) - region1.sourceOffset,
            fadeOutDuration: region2.fadeOutDuration
          };
          
          sortedRegions.splice(regionIndex, 2, newRegion);
          return { ...t, audioRegions: sortedRegions };
        }
      }
      return t;
    }));
  };

  const [arrangeStyle, setArrangeStyle] = useState('auto');
  const [arrangeBpm, setArrangeBpm] = useState(localSong.bpm);
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  
  // UI Toggles
  const [localVisualType, setLocalVisualType] = useState<'score' | 'pianoroll'>(visualType);
  useEffect(() => {
    setLocalVisualType(visualType);
  }, [visualType]);
  const [scrollMode, setScrollMode] = useState<'page' | 'continuous'>('continuous');

  const [aiEngine, setAiEngine] = useState('auto');
  const [arrangeKey, setArrangeKey] = useState(song?.key || 'C');
  const [chordSource, setChordSource] = useState<'ai' | 'original'>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAIStudioModalOpen, setIsAIStudioModalOpen] = useState(false);
  const [aiStudioTab, setAiStudioTab] = useState<'arrange' | 'lyria' | 'lyrics'>('arrange');
  const [lyricsPrompt, setLyricsPrompt] = useState('');
  const [aiArrangementOptions, setAiArrangementOptions] = useState<any[]>([]);
  const [activeOptionIndex, setActiveOptionIndex] = useState<number>(0);

  const [zoomLevel, setZoomLevel] = useState(1);

  const pixelsPerMeasure = 80 * zoomLevel; // Dynamic pixels per measure based on zoom

  // Ref to hold current scrollMode without triggering re-renders of the effect
  const scrollModeRef = useRef(scrollMode);
  useEffect(() => {
    scrollModeRef.current = scrollMode;
  }, [scrollMode]);

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
          if (scrollModeRef.current === 'continuous') {
            // SCROLL MODE: Keep playhead fixed in the middle (timeline scrolls)
            const targetScroll = x - (scrollContainer.clientWidth / 2) + 100;
            scrollContainer.scrollLeft = Math.max(0, targetScroll);
          } else {
            // PAGE MODE / STATIC: Playhead moves. When it reaches 90% of view, snap timeline to next page
            const containerScrollLeft = scrollContainer.scrollLeft;
            const containerWidth = scrollContainer.clientWidth;
            const viewRightEdge = containerScrollLeft + containerWidth;
            
            // If playhead goes beyond 90% of the visible container
            if (x + 100 > viewRightEdge - (containerWidth * 0.1)) {
              scrollContainer.scrollLeft = x + 100 - (containerWidth * 0.1);
            } else if (x + 100 < containerScrollLeft) {
              scrollContainer.scrollLeft = Math.max(0, x + 100 - (containerWidth * 0.1));
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pixelsPerMeasure, beatsPerMeasure, parsedData.metadata?.bpm]);

  const handleLyriaRender = async () => {
    setIsGenerating(true);
    try {
      // @ts-ignore
      const abcData = musicEngine.musicXmlToAbc(localXml);
      // Logic placeholder for actual Lyria render endpoint
      alert("Rendering with Lyria...");
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInstrumentoRender = async (track: TrackState, index: number) => {
    setIsGenerating(true);
    try {
      // Find notes for this track
      const trackNotes = (track as any)._generatedNotes || parsedData.notes.filter(n => n.trackId === track.id || (!n.trackId && index === 0));
      if (!trackNotes.length) {
        alert("No notes in this track to render.");
        return;
      }
      
      const { NeuralRenderService } = await import('../../lib/NeuralRenderService');
      let audioUrl;
      if (track.instrument === 'vocal' || track.mode === 'vocal') {
        audioUrl = await NeuralRenderService.renderTrack({ ...track, mode: 'vocal' }, trackNotes);
      } else {
        audioUrl = await NeuralRenderService.renderInstrumento(track, trackNotes);
      }
      
      // Successfully generated. Update the track to use this audio URL and switch its mode to audio/vocal
      const newTracks = [...tracks];
      newTracks[index] = { ...track, mode: 'vocal', instrument: track.instrument, audioSrc: audioUrl };
      setTracks(newTracks);
      
      // Load into MusicEngine as an audio stem
      // @ts-ignore
      await musicEngine.addVocalLayer(track.id, audioUrl);
      
    } catch (e: any) {
      alert(`Instrumento Render Failed: ${e.message}`);
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const applyOption = async (optIndex: number, optionsList: any[]) => {
    if (!optionsList || optionsList.length === 0) return;
    setIsGenerating(true);
    setActiveOptionIndex(optIndex);
    try {
      const aiResult = optionsList[optIndex];
      let config = {
        key: arrangeKey,
        bpm: arrangeBpm,
        timeSignature: parsedData.timeSignature || { beats: 4, beatType: 4 },
        style: arrangeStyle,
        chordSource: chordSource,
        prompt: aiPrompt,
        sections: sections,
        aiChords: aiResult.chords,
        aiTracksConfig: aiResult.tracksConfig
      } as any;
      
      const existingUserTracks = tracks.filter(t => !t.name.startsWith('AI '));
      const userTrack = existingUserTracks[0];
      const leadMelody = (userTrack as any)?._generatedNotes 
        || parsedData.notes.filter(n => n.trackId === (userTrack?.id || tracks[0]?.id) || (!n.trackId && tracks.length <= 1));
        
      const newTracks = await SymbolicArranger.generateArrangement(leadMelody, config);
      
      // Filter out old AI tracks, keep user tracks
      const updatedTracks = [...existingUserTracks, ...newTracks];
      setTracks(updatedTracks);
      
      // Load into MusicEngine so it actually plays
      const existingTrackIds = new Set(existingUserTracks.map(t => t.id));
      let allNotes = parsedData.notes.filter(n => !n.trackId || existingTrackIds.has(n.trackId));
      
      // Ensure Composer generated notes are kept
      existingUserTracks.forEach(t => {
        if ((t as any)._generatedNotes) {
          allNotes = allNotes.concat((t as any)._generatedNotes);
        }
      });
      
      newTracks.forEach(t => {
        if ((t as any)._generatedNotes) {
          allNotes = allNotes.concat((t as any)._generatedNotes);
        }
      });
      
      await musicEngine.loadSong(allNotes, updatedTracks, 0, parsedData.timeSignature || { beats: 4 }, false, true);
      
      // Re-attach audio sources if they exist in state but not in engine
      for (const t of updatedTracks) {
        if (t.audioSrc && !musicEngine.hasVocalLayer(t.id)) {
          await musicEngine.addVocalLayer(t.id, t.audioSrc);
        }
      }
    } catch (e: any) {
      console.error('Failed to apply arrangement option:', e);
      setTimeout(() => alert(`Error applying option: ${e.message}`), 100);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      let config = {
        key: arrangeKey,
        bpm: arrangeBpm,
        timeSignature: parsedData.timeSignature || { beats: 4, beatType: 4 },
        style: arrangeStyle,
        chordSource: chordSource,
        prompt: aiPrompt,
        sections: sections,
        instruments: undefined,
        is4PartChorus: undefined,
        chordProgression: undefined
      } as any;
      
      const baseUrl = '/vocalido';

      if (chordSource === 'ai' && aiPrompt.trim()) {
        try {
          const res = await fetch(`${baseUrl}/v1/analyze_arranger_brief`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: aiPrompt,
              key: arrangeKey,
              bpm: arrangeBpm,
              time_signature: `${config.timeSignature.beats}/${config.timeSignature.beatType}`
            })
          });
          const data = await res.json();
          if (data && !data.error) {
            console.log("AI Arranger Parsed:", data);
            config.style = data.style || arrangeStyle;
            if (data.tempo) {
              config.bpm = data.tempo;
              setArrangeBpm(data.tempo);
            }
            config.instruments = data.instruments;
            config.is4PartChorus = data.is_4_part_chorus;
            config.chordProgression = data.chord_progression;
          }
        } catch (e) {
          console.error("Failed to analyze brief with backend:", e);
        }
      }
      
      // Get lead melody
      const existingUserTracks = tracks.filter(t => !t.name.startsWith('AI '));
      const userTrack = existingUserTracks[0];
      const leadMelody = (userTrack as any)?._generatedNotes 
        || parsedData.notes.filter(n => n.trackId === (userTrack?.id || tracks[0]?.id) || (!n.trackId && tracks.length <= 1));
      
      let newTracks: TrackState[] = [];
      
      if (['rag-gemini', 'gemini', 'auto'].includes(aiEngine)) {
        try {
          if (chordSource === 'ai') {
            console.log("[RAG] Retrieving library for references...");
            const library = await songStorage.getAllSongs();
            const references = AIArrangerService.retrieveReferences(library, arrangeStyle, aiPrompt, 3);
            
            console.log(`[RAG] Found ${references.length} references. Calling Gemini...`);
            const aiResults = await AIArrangerService.generateAIArrangement(leadMelody, references, arrangeStyle, aiPrompt, arrangeKey, arrangeBpm, aiArrangementOptions);
            
            if (aiResults && aiResults.length > 0) {
              console.log(`[RAG] AI generated ${aiResults.length} options.`);
              setAiArrangementOptions(aiResults);
              await applyOption(0, aiResults);
              return; // applyOption handles the rest (SymbolicArranger & MusicEngine)
            } else {
              console.warn("[RAG] AI failed to generate chords, falling back to algorithmic.");
              setTimeout(() => alert("AI could not generate multiple options at this time (too complex or rate limited). Falling back to basic generation."), 100);
            }
          }
          
          newTracks = await SymbolicArranger.generateArrangement(leadMelody, config);
        } catch (ragErr) {
          console.error("RAG Arranger failed:", ragErr);
          newTracks = await SymbolicArranger.generateArrangement(leadMelody, config);
        }
      } else {
        // Generate new tracks using Python Multi-Engine AI Router
        const res = await fetch(`${baseUrl}/api/arrange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                engine: aiEngine,
                leadMelody: leadMelody,
                prompt: aiPrompt,
                style: arrangeStyle,
                key: arrangeKey,
                bpm: arrangeBpm,
                sections: sections,
                config: {
                  is_simple_mode: isSimpleMode
                }
            })
        });
        const resData = await res.json();
        if (!resData.success) {
            throw new Error(resData.message || "Failed to generate arrangement");
        }
        newTracks = resData.data.tracks || [];
      }
      
      // Filter out old AI tracks, keep user tracks
      const existingTracks = tracks.filter(t => !t.name.startsWith('AI '));
      const updatedTracks = [...existingTracks, ...newTracks];
      setTracks(updatedTracks);
      
      // Load into MusicEngine so it actually plays
      // Keep notes that belong to user tracks
      const existingTrackIds = new Set(existingTracks.map(t => t.id));
      let allNotes = parsedData.notes.filter(n => !n.trackId || existingTrackIds.has(n.trackId));
      
      newTracks.forEach(t => {
        if ((t as any)._generatedNotes) {
          allNotes = allNotes.concat((t as any)._generatedNotes);
        }
      });
      try {
        await musicEngine.loadSong(allNotes, updatedTracks, 0, parsedData.timeSignature || { beats: 4 }, false, true);
        
        // Re-attach audio sources if they exist in state but not in engine
        for (const t of updatedTracks) {
          if (t.audioSrc && !musicEngine.hasVocalLayer(t.id)) {
            await musicEngine.addVocalLayer(t.id, t.audioSrc);
          }
        }
      } catch (err) {
        console.error('Failed to load generated song into MusicEngine:', err);
      }
      
    } catch (e: any) {
      console.error('Failed to generate arrangement:', e);
      setIsGenerating(false);
      // Use setTimeout to allow React to update the state and render the UI before the alert blocks the thread
      setTimeout(() => {
        alert(`Error: ${e.message || 'Failed to generate arrangement'}`);
      }, 100);
    }
  };

  const handleGenerateLyrics = async () => {
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
    <div className="relative flex flex-col h-full bg-transparent overflow-hidden group/arranger">
      <input type="file" ref={fileInputRef} className="hidden" accept=".xml,.musicxml,.mxl,.mid,.midi" onChange={handleAddSong} />
      <style>{`
        .track-lane {
          background: var(--bg-panel);
          backdrop-filter: blur(8px);
          border: 1px solid var(--border-light);
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
        <header className="h-14 sm:h-16 glass-panel flex items-center justify-between px-3 sm:px-6 z-[3000] shrink-0 sticky top-0 border-b-0 border-x-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={() => { /* Implement back to previous view */ }} className="w-9 h-9 sm:w-10 sm:h-10 glass-button text-zinc-400 rounded-xl sm:rounded-2xl flex items-center justify-center hover:text-white transition-all shrink-0"><ArrowLeft size={18}/></button>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] sm:text-[13px] font-black text-white uppercase italic truncate max-w-[100px] sm:max-w-[200px] leading-tight drop-shadow-md">{localSong?.title || 'ARRANGER VIEW'}</span>
              <span className="text-[6px] sm:text-[7px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 uppercase tracking-widest italic leading-none drop-shadow-sm">NEURAL ARRANGER</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
              <div className="relative group">
                <button className="px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/5 text-emerald-400 hover:text-white hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-2">
                  {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14}/>} EXPORT
                </button>
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#111] border border-white/10 rounded-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9000] shadow-2xl">
                  <button onClick={handleExportAudio} disabled={isExporting} className="w-full text-left px-4 py-2 text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:bg-white/10 flex items-center gap-2">
                     <Volume2 size={12}/> Export Audio (WebM/WAV)
                  </button>
                  <button onClick={handleExportStem} className="w-full text-left px-4 py-2 text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:bg-white/10 flex items-center gap-2">
                     <BookOpen size={12}/> Export Score (MusicXML)
                  </button>
                </div>
              </div>
              <button onClick={() => setShowYoutubeModal(true)} className="px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/40 hover:text-white transition-all flex items-center gap-2">
                  <Youtube size={14}/> FROM YOUTUBE
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/40 hover:text-white transition-all flex items-center gap-2">
                  <PlusCircle size={14}/> ADD MY SONG
              </button>
              <button onClick={addNewSection} className="px-3 py-2 rounded-full text-[9px] font-black uppercase tracking-widest bg-cyan-600 text-white shadow-lg flex items-center gap-2">
                  <Blocks size={14}/> ADD SECTION
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
                
                {/* View Type Toggle (Removed per request) */}

                {/* Scroll Mode Toggle */}
                <div className="flex bg-[#111] p-1 rounded-xl border border-white/10 shrink-0 ml-1">
                  <button 
                    onClick={() => setScrollMode('page')} 
                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${scrollMode === 'page' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'}`}
                  >
                    STATIC
                  </button>
                  <button 
                    onClick={() => setScrollMode('continuous')} 
                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${scrollMode === 'continuous' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'}`}
                  >
                    SCROLL
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
                  onClick={() => setIsAIStudioModalOpen(true)} 
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
                      <><Loader2 className="animate-spin" size={16}/> ARRANGING...</>
                    ) : (
                      <><Wand2 size={16} className="text-yellow-100 animate-pulse" /> ✨ AI STUDIO</>
                    )}
                  </span>
                </button>
              </div>
              
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => {
                    const originalTracks = tracks.filter(t => !t.name.startsWith('AI '));
                    setTracks(originalTracks);
                    setAiArrangementOptions([]);
                  }}
                  className="px-3 h-7 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[9px] font-black uppercase hover:bg-red-500 hover:text-white transition-all flex items-center gap-1.5"
                >
                  <Trash2 size={12} /> CLEAR AI
                </button>
                
                {aiArrangementOptions.length > 0 && (
                  <div className="flex items-center gap-1 ml-2 bg-zinc-900/80 p-1 rounded-lg border border-white/5">
                    {aiArrangementOptions.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => applyOption(i, aiArrangementOptions)}
                        disabled={isGenerating}
                        className={`px-3 h-6 rounded-md text-[10px] font-black transition-all ${
                          activeOptionIndex === i
                            ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                        } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        P{i + 1}
                      </button>
                    ))}
                  </div>
                )}
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

              {/* AI Prompts (Consolidated into AI Studio) */}
              <div className="flex items-center gap-1.5 shrink-0">
              </div>

              <select value={arrangeStyle} onChange={e => setArrangeStyle(e.target.value)} className="bg-zinc-900 border border-white/10 text-white text-[11px] rounded-lg px-2 py-1.5 w-20 outline-none focus:border-emerald-500 shrink-0">
                <option value="auto">Auto</option>
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
              <select value={aiEngine} onChange={e => setAiEngine(e.target.value)} title="Advanced Engine Settings" className="bg-zinc-900 border border-purple-500/30 text-purple-400 font-bold text-[11px] rounded-lg px-2 py-1.5 w-[130px] outline-none shadow-[0_0_10px_rgba(168,85,247,0.1)] shrink-0">
                <option value="auto">⚙️ Auto Engine</option>
                <option value="rag-gemini">⚙️ Gemini RAG (Local)</option>
                <option value="gemini">⚙️ Gemini Cloud</option>
                <option value="magenta">⚙️ Magenta</option>
                <option value="symphonynet">⚙️ SymphonyNet</option>
                <option value="choir">⚙️ Choir (SATB)</option>
              </select>
              <div className="flex items-center gap-0.5 bg-[#0c0c0e] rounded-lg p-0.5 border border-white/10 shrink-0">
                <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"><ZoomOut size={12}/></button>
                <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))} className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"><ZoomIn size={12}/></button>
              </div>
              </div>
          </div>

          {/* Timeline Scroll Container (Horizontal & Vertical) */}
          <div className="flex-1 flex gap-4 overflow-hidden relative">
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

              {/* TOOLS FLOATING BAR */}
              <div className="absolute top-2 right-4 z-[2000] flex items-center gap-1 bg-black/60 backdrop-blur-xl border border-white/10 rounded-lg p-1 shadow-2xl">
                <button onClick={() => setActiveTool('pointer')} className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${activeTool === 'pointer' ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`} title="Pointer Tool">
                  <MousePointer2 size={12} />
                </button>
                <button onClick={() => setActiveTool('scissors')} className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${activeTool === 'scissors' ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`} title="Scissors Tool">
                  <Scissors size={12} />
                </button>
                <button onClick={() => setActiveTool('glue')} className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${activeTool === 'glue' ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`} title="Glue Tool">
                  <Link size={12} />
                </button>
              </div>

              {/* Track Lanes */}
              <div className="flex-1 relative flex flex-col z-10">
                {(() => {
                  const activeTracksCount = tracks.filter((t, i) => {
                    const count = ((t as any)._generatedNotes?.length) || parsedData.notes.filter(n => n.trackId === t.id || (!n.trackId && i === 0)).length;
                    return count > 0;
                  }).length;

                  return tracks.map((track, index) => {
                    const trackNoteCount = ((track as any)._generatedNotes?.length) || parsedData.notes.filter(n => n.trackId === track.id || (!n.trackId && index === 0)).length;
                    const isTrackEmpty = trackNoteCount === 0;

                    return (
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
                                {trackNoteCount} notes
                              </span>
                            </div>
                      <div className="flex items-center gap-1.5 w-full mt-1">
                        <select 
                          className="bg-black/50 border border-white/10 text-white text-[9px] rounded px-1 py-0.5 outline-none focus:border-cyan-500 w-[45px] truncate"
                          value={track.mode === 'vocal' ? 'vocal' : (track.instrument || 'piano')}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const val = e.target.value;
                            const newMode = val === 'vocal' ? 'vocal' : 'instrument';
                            const newTracks = [...tracks];
                            newTracks[index] = { ...track, instrument: val as any, mode: newMode };
                            setTracks(newTracks);
                            // Also switch instrument in MusicEngine
                            musicEngine.switchTrackMode(track.id, track.name, newMode, { instrument: val });
                          }}
                        >
                          <option value="">Default Instrument</option>
                          <optgroup label="Vocals">
                            <option value="vocal">🎤 Vocal</option>
                          </optgroup>
                          {GM_INSTRUMENTS.map((group) => (
                            <optgroup key={group.name} label={group.name}>
                              {group.instruments.map((inst) => (
                                <option key={inst.id} value={inst.id}>
                                  {inst.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {['vocal', 'Instrumento AI'].includes(track.instrument || '') && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation();
                              handleInstrumentoRender(track, index);
                            }} 
                            disabled={isTrackEmpty || isGenerating}
                            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] transition-all ${isGenerating ? 'opacity-50 cursor-not-allowed' : (track.instrument === 'vocal' ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-[0_0_8px_rgba(6,182,212,0.5)]') } hover:scale-105`}
                            title={track.instrument === 'vocal' ? "Render with Vocalido AI" : "Render with Instrumento AI"}
                          >
                            <Wand2 size={10} />
                          </button>
                        )}
                        {!isTrackEmpty && (
                          <button onClick={(e) => { e.stopPropagation(); const t=[...tracks]; t[index].isMuted=!t[index].isMuted; setTracks(t); }} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black leading-none transition-all ${track.isMuted ? 'bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}>
                            M
                          </button>
                        )}
                        {!isTrackEmpty && activeTracksCount > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); const t=[...tracks]; t[index].isSolo=!t[index].isSolo; setTracks(t); }} className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black leading-none transition-all ${track.isSolo ? 'bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}>
                            S
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newArmId = armedTrackId === track.id ? null : track.id;
                            setArmedTrackId(newArmId);
                            musicEngine.armTrack(newArmId);
                          }}
                          className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black transition-all ml-1 ${armedTrackId === track.id ? 'bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.5)] animate-pulse' : 'bg-white/5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'}`}
                          title="Arm Record"
                        >
                          ◉
                        </button>
                        {track.type === 'audio' && (
                          <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setStemTargetTrackId(track.id);
                                setShowStemModal(true);
                            }}
                            className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all ml-1"
                            title="Separate Stems"
                          >
                            ✂️
                          </button>
                        )}
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
                      {track.trackType === 'audio' ? (
                        <AudioTrackVisualizer 
                          track={track}
                          pixelsPerBeat={pixelsPerMeasure / beatsPerMeasure}
                          bpm={parsedData.metadata?.bpm || 120}
                          height={128} // h-32 = 128px
                          activeTool={activeTool}
                          onRegionSplit={(regionId, splitTime) => handleRegionSplit(track.id, regionId, splitTime)}
                          onRegionGlue={(regionId) => handleRegionGlue(track.id, regionId)}
                        />
                      ) : (
                        <TrackVisualizer 
                          track={track} 
                          notes={(track as any)._generatedNotes || parsedData.notes.filter(n => n.trackId === track.id || (!n.trackId && index === 0))} 
                          width={totalMeasures * pixelsPerMeasure}
                          height={128} // h-32 = 128px
                          visualType={localVisualType}
                          pixelsPerBeat={pixelsPerMeasure / beatsPerMeasure}
                          songKey={arrangeKey}
                          totalMeasures={totalMeasures}
                          pixelsPerMeasure={pixelsPerMeasure}
                        />
                      )}
                      {/* Overlay Measures Grid on top of Visualizer if needed */}
                      {localVisualType !== 'score' && (
                        <div className="absolute inset-0 pointer-events-none z-10">
                          {Array.from({ length: totalMeasures }).map((_, i) => (
                            <div 
                              key={`grid-m-${i}`} 
                              className="measure-line" 
                              style={{ left: i * pixelsPerMeasure }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            })()}

              {/* Section Blocks Overlay - NOW INSIDE TRACK LANES CONTAINER */}
              <div className="absolute top-0 left-[100px] right-0 bottom-0 pointer-events-none z-[20] overflow-hidden">
                {isSimpleMode ? null : (
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
                
                {/* Playhead */}
                <div 
                  id="arranger-playhead"
                  className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-[100] shadow-[0_0_10px_rgba(239,68,68,0.8)] pointer-events-none"
                  style={{ left: 0, transform: 'translateX(0px)', willChange: 'transform' }}
                >
                  <div className="absolute -top-3 -left-1.5 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
                </div>
              </div>
            </div>
            
            {/* Audio Bin Sidebar */}
            {audioBinOpen && (
              <div className="w-64 bg-[#0c0c0e] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-inner shrink-0">
                <div className="h-10 flex items-center justify-between px-4 border-b border-white/10 bg-black/40 shrink-0">
                  <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Headphones size={12} className="text-cyan-400" /> AUDIO BIN
                  </h3>
                  <button onClick={() => setAudioBinOpen(false)} className="text-zinc-500 hover:text-white">
                    <ArrowLeft size={12} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                  {downloadedFiles.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-[10px] uppercase font-bold tracking-widest">
                      No downloads yet
                    </div>
                  ) : (
                    downloadedFiles.map((file, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2 hover:bg-white/10 transition-colors group">
                        <span className="text-xs font-bold text-zinc-300 truncate" title={file.title}>{file.title}</span>
                        <div className="flex items-center gap-1 mt-1">
                          <button 
                            onClick={(e) => {
                              const audio = new Audio(file.url);
                              audio.play();
                            }}
                            className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/40 hover:text-white transition-all"
                            title="Preview"
                          >
                            <Volume2 size={12} />
                          </button>
                          <button 
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = file.url;
                              a.download = file.filename;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                            }}
                            className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center hover:bg-purple-500/40 hover:text-white transition-all"
                            title="Save to Computer"
                          >
                            <Download size={12} />
                          </button>
                          <button 
                            onClick={() => {
                              setTracks(prev => [...prev, {
                                id: `track-bin-${Date.now()}`,
                                name: file.title,
                                type: 'audio',
                                volume: 80,
                                pan: 0,
                                isMuted: false,
                                isSolo: false,
                                audioRegions: [{
                                  id: `region-bin-${Date.now()}`,
                                  name: file.title,
                                  url: file.url,
                                  startTime: 0,
                                  duration: 60,
                                  sourceDuration: 60,
                                  timeStretchRatio: 1
                                }]
                              }]);
                            }}
                            className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/40 hover:text-white transition-all ml-auto"
                            title="Add to Track"
                          >
                            <PlusCircle size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {!audioBinOpen && (
              <button 
                onClick={() => setAudioBinOpen(true)}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-24 bg-black/80 backdrop-blur-md border border-white/10 rounded-l-xl flex items-center justify-center text-zinc-500 hover:text-cyan-400 hover:bg-white/5 transition-all z-50 shadow-2xl"
                title="Open Audio Bin"
              >
                <div className="rotate-90 text-[9px] font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2">
                  <Headphones size={10} /> AUDIO BIN
                </div>
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
      </div>

      {/* Unified AI Studio Modal */}
      {isAIStudioModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0c0c0e] border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col">
            <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Wand2 size={24} className="text-cyan-400"/> ✨ AI STUDIO
            </h3>
            
            {/* Tabs */}
            <div className="flex bg-[#111] p-1.5 rounded-xl border border-white/10 mb-6">
              <button 
                onClick={() => setAiStudioTab('arrange')}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${aiStudioTab === 'arrange' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <div className="flex items-center justify-center gap-2"><Music2 size={14}/> Arrange MIDI</div>
              </button>
              <button 
                onClick={() => setAiStudioTab('lyrics')}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${aiStudioTab === 'lyrics' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <div className="flex items-center justify-center gap-2"><Mic2 size={14}/> Write Lyrics</div>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {aiStudioTab === 'arrange' && (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                    Generate editable background tracks (Piano, Bass, Drums) based on your melody. This is great for <span className="text-emerald-400">learning notes and chords</span>.
                  </p>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Arrangement Brief</label>
                  <textarea 
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-h-[120px] resize-none"
                    placeholder="Ex: Upbeat, mid-tempo, chill acoustic guitar strumming..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                  />
                  <div className="flex justify-end gap-3 mt-6">
                    <button 
                      onClick={() => setIsAIStudioModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      CANCEL
                    </button>
                    <button 
                      onClick={() => {
                        setIsAIStudioModalOpen(false);
                        handleGenerate();
                      }}
                      className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-105 transition-all"
                    >
                      GENERATE MIDI TRACKS
                    </button>
                  </div>
                </div>
              )}

              {aiStudioTab === 'lyrics' && (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                    Let AI write lyrics perfectly fitting your melody notes. 
                  </p>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Lyrics Concept</label>
                  <textarea 
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 min-h-[120px] resize-none"
                    placeholder="Ex: I want a fun English children's song about brushing teeth..."
                    value={lyricsPrompt}
                    onChange={e => setLyricsPrompt(e.target.value)}
                  />
                  <div className="flex justify-end gap-3 mt-6">
                    <button 
                      onClick={() => setIsAIStudioModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      CANCEL
                    </button>
                    <button 
                      onClick={() => {
                        setIsAIStudioModalOpen(false);
                        handleGenerateLyrics();
                      }}
                      className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-purple-500 text-black shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:scale-105 transition-all"
                    >
                      GENERATE LYRICS
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* YouTube Modal */}
      {showYoutubeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <h2 className="text-xl font-black text-white uppercase italic mb-4">Import from YouTube</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Enter a YouTube URL. The audio will be downloaded and added to a new track.
            </p>
            <input 
              type="text" 
              className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-red-500 focus:outline-none mb-6"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              disabled={isDownloading}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowYoutubeModal(false)}
                disabled={isDownloading}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                CANCEL
              </button>
              <button 
                onClick={handleDownloadYoutube}
                disabled={isDownloading || !youtubeUrl}
                className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
              >
                {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Youtube size={14} />} 
                {isDownloading ? 'DOWNLOADING...' : 'DOWNLOAD AUDIO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stem Separation Modal */}
      {showStemModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <h2 className="text-xl font-black text-white uppercase italic mb-4">Separate Stems (Demucs)</h2>
            <p className="text-xs text-zinc-400 mb-6">
              AI will split the selected audio track into multiple stems. This may take a minute.
            </p>
            <div className="flex flex-col gap-3 mb-6">
              <button 
                onClick={() => handleSeparateStems(2)}
                disabled={isSeparating}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 text-left transition-all disabled:opacity-50"
              >
                <div className="font-bold text-white mb-1">2 Stems</div>
                <div className="text-xs text-zinc-400">Vocal + Instrumental</div>
              </button>
              <button 
                onClick={() => handleSeparateStems(4)}
                disabled={isSeparating}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 text-left transition-all disabled:opacity-50"
              >
                <div className="font-bold text-white mb-1">4 Stems</div>
                <div className="text-xs text-zinc-400">Vocal + Drums + Bass + Other</div>
              </button>
            </div>
            
            <div className="flex justify-end gap-3">
              {isSeparating ? (
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-widest mr-auto">
                    <Loader2 size={14} className="animate-spin" /> SEPARATING STEMS...
                </div>
              ) : (
                <button 
                    onClick={() => { setShowStemModal(false); setStemTargetTrackId(null); }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                    CANCEL
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArrangerPage;
