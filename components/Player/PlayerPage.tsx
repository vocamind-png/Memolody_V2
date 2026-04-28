
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import {
  Play, Pause, SlidersHorizontal,
  X, Volume2, SkipBack,
  RefreshCw, Repeat, Music,
  VolumeX, Bell, BellOff, Eye, EyeOff, Lock,
  ChevronDown, Library, Languages, Mic2, Timer, Sparkles
} from 'lucide-react';
import ProScoreEditor from './ProScoreEditor';
import { KeyTransposeDisplay, BpmDisplay, BarBeatPositionDisplay, TimeSigDisplay } from './LCDDisplay';
import MixerPanel from './MixerPanel';
import PerformanceScore from './PerformanceScore';
import TrackView from './TrackView';
import LoopMatrixModal, { LoopPreset } from './LoopMatrixModal';
import PluginBrowserModal from './PluginBrowserModal';
import FXPluginModal from './FXPluginModal';
import MemoPractice from './MemoPractice';
import ChordPage from '../Chord/ChordPage';
import { musicEngine } from '../../lib/MusicEngine';
import { getChromaticSolfege } from '../../lib/SolfegeLogic';
import { Song, TrackState, EffectInstance, LyricMode } from '../../types';

export type PlayerCardType = 'score' | 'pianoroll' | 'trackview' | 'memochord' | 'practice' | 'vocalido';

const PlayerPage: React.FC<{
  song: Song | null; musicXml?: string | null; layoutBundle?: any | null; tracks: TrackState[]; setTracks: any;
  viewMode: any; setViewMode: any; isPreviewMode?: boolean;
  loopPresets: LoopPreset[]; setLoopPresets: any;
  performanceMode?: boolean;
  vocalidoAutoRender?: boolean;
  autoPlay?: boolean;           // ← auto-start playback after OMR import
  onAutoPlayConsumed?: () => void; // ← clears the flag in App.tsx
}> = ({ song, musicXml, layoutBundle, tracks, setTracks, viewMode = 'score', setViewMode, loopPresets, setLoopPresets, performanceMode, vocalidoAutoRender, autoPlay, onAutoPlayConsumed }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTransportHidden, setIsTransportHidden] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentBpm, setCurrentBpm] = useState(song?.bpm || 120);
  const [transpose, setTranspose] = useState(0);
  const [showMixer, setShowMixer] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showLoopMatrix, setShowLoopMatrix] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [isRenderingVocal, setIsRenderingVocal] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderTimer, setRenderTimer] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Card Navigation State
  const [activeCard, setActiveCard] = useState<PlayerCardType>('score');
  const [isNavMenuVisible, setIsNavMenuVisible] = useState(false);
  
  // Original Image Split View State
  const [isOriginalViewHidden, setIsOriginalViewHidden] = useState(false);

  const [storedSinger, setStoredSinger] = useState<string | null>(null);
  const [svsEngine, setSvsEngine] = useState<'vocalido' | 'acestep'>('vocalido');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const [pluginBrowserTarget, setPluginBrowserTarget] = useState<{ trackId: string; slotIndex: number } | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<{ trackId: string; slotIndex: number; plugin: EffectInstance } | null>(null);

  // Split View Resizer State
  const [sidebarWidth, setSidebarWidth] = useState(40); // Percentage 0-100
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // Mouse event handlers for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !splitContainerRef.current) return;
      const containerRect = splitContainerRef.current.getBoundingClientRect();
      let newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      // Clamp between 10% and 90%
      if (newWidth < 10) newWidth = 10;
      if (newWidth > 90) newWidth = 90;
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const volumePopupRef = useRef<HTMLDivElement>(null);
  const volumeDragStartYRef = useRef<number | null>(null);
  const volumeDragStartVolRef = useRef<number>(0.8);
  const lastRenderedKeyRef = useRef<string>('');
  const localSong = song || { title: 'Untitled', artist: 'Unknown', bpm: 120, key: 'Bb', duration: 180 } as any;
  const parsedData = useMemo(() => {
    try {
      const result = musicEngine.parseMusicXml(musicXml || '');
      console.log(`[PlayerPage] 📦 MusicXML parsed: ${result.notes.length} notes, size: ${musicXml?.length || 0} chars`);
      return result;
    } catch (e) {
      console.error('[PlayerPage] ❌ Parse error:', e);
      return { notes: [], metadata: {} as any, partNames: {}, timeSignature: { beats: 4, beatType: 4 } };
    }
  }, [musicXml]);

  const vocalTrack = useMemo(() => {
    if (!tracks || tracks.length === 0) return null;
    return tracks.find(t => t.mode === 'vocal') || tracks[0];
  }, [tracks]);

  const activeLyricMode = useMemo(() => {
    return vocalTrack?.lyricMode || 'British Fixed Doh';
  }, [vocalTrack]);

  const activeVoiceName = useMemo(() => {
    if (vocalTrack?.instrument && vocalTrack.instrument !== 'Auto') return vocalTrack.instrument;
    if (storedSinger) return storedSinger;
    return 'Auto';
  }, [vocalTrack, storedSinger]);


  // ── SONG CHANGE → Full engine reset (ONLY on song change) ─────────────────
  useEffect(() => {
    musicEngine.stopAndClear();
    setIsPlaying(false);
    setCurrentTime(0);
    setTranspose(0);
    setIsAudioLoading(false);
    setIsMetronomeOn(false);
    setShowMixer(false);
    setShowVolumeSlider(false);
    setShowLoopMatrix(false);
    setRenderProgress(0);
    lastRenderedKeyRef.current = ''; 
    setIsRenderingVocal(false); // Force reset on song change
    console.log(`[PlayerPage] 🎵 Song changed → engine cleared.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id]);

  // Handle automatic track role assignment once notes are parsed
  useEffect(() => {
    if (!parsedData.notes.length || tracks.length > 0) return;

    if (parsedData.partNames) {
      const partIds = Object.keys(parsedData.partNames);
      if (partIds.length > 0) {
        console.log('[PlayerPage] 🎹 Auto-assigning track roles based on parsed notes');
        const newTracks = partIds.map((id, index) => ({
          id,
          name: parsedData.partNames[id] || `Track ${index + 1}`,
          volume: 0.8,
          isMuted: false,
          mode: index === 0 ? 'vocal' : 'instrument',
          instrument: index === 0 ? (activeVoiceName || 'Alto Female') : 'Piano',
          lyricMode: activeLyricMode || 'British Fixed Doh',
          effects: []
        }));
        setTracks(newTracks);
      }
    }
  }, [parsedData.notes.length, parsedData.partNames, setTracks, activeVoiceName, activeLyricMode]);

  // ── AUTO-RENDER: Direct trigger on song load or lyric mode change ────────────
  const autoRenderRef = useRef(false);
  
  useEffect(() => {
    // Guard: only run when auto-render is enabled, iframe is loaded, and we have a song with XML, tracks are ready, and lyrics are not off
    if (!vocalidoAutoRender) return;
    if (!iframeLoaded) return;
    if (!musicXml || !song?.id || activeLyricMode === 'Close') return;
    if (!parsedData.notes.length) return;
    if (tracks.length === 0) return; // Wait for tracks to populate
    
    const currentKey = `${song.id}_${activeLyricMode}_${activeVoiceName}`;
    if (currentKey === lastRenderedKeyRef.current) return;
    
    console.log(`[Vocalido] 🚀 Auto-Render triggered: ${activeLyricMode} (${parsedData.notes.length} notes)`);
    lastRenderedKeyRef.current = currentKey;
    
    // Use a microtask to avoid stale closure issues
    autoRenderRef.current = true;
  }, [vocalidoAutoRender, iframeLoaded, song?.id, musicXml, activeLyricMode, activeVoiceName, parsedData.notes.length, tracks.length]);
  
  // Separate effect to actually call the function (avoids stale closure)
  useEffect(() => {
    if (autoRenderRef.current) {
      autoRenderRef.current = false;
      triggerVocalSynthesis();
    }
  });

  // ── AUTO-PLAY: Triggered after OMR import to play immediately ────────────
  useEffect(() => {
    if (!autoPlay) return;
    if (!parsedData.notes.length) return;
    if (!song?.id) return;

    // Consume the flag immediately so re-renders don't re-trigger
    onAutoPlayConsumed?.();

    // Wait for song change effect + audio engine init to settle
    const t = setTimeout(() => {
      console.log('[PlayerPage] 🎹 Auto-play triggered after OMR import');
      handleTogglePlay();
    }, 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, song?.id, parsedData.notes.length]);

  useEffect(() => {
    const xmlBpm = parsedData.metadata.bpm;
    if (xmlBpm && xmlBpm >= 20 && xmlBpm <= 400) {
      setCurrentBpm(xmlBpm);
      musicEngine.setBpm(xmlBpm);
    }
  }, [parsedData.metadata.bpm]);

  // Listen to cross-window storage changes and direct messages so Voice Name updates locally immediately
  useEffect(() => {
    const syncSinger = () => {
      try {
        const saved = localStorage.getItem('vocalido_singers');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.length > 0) setStoredSinger(parsed[0].name);
        }
      } catch(e) {}
    };
    
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SINGER_SAVED') {
        setStoredSinger(e.data.name);
      }
    };

    syncSinger();
    window.addEventListener('storage', syncSinger);
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('storage', syncSinger);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Derive up to 8 notes of lyrics based on current parse
  const currentPhraseToSing = useMemo(() => {
    if (!parsedData || parsedData.notes.length === 0) return "Do Re Mi Fa Sol La Ti Do";
    return parsedData.notes.slice(0, 8).map(n => n.solfege || 'La').join(' ');
  }, [parsedData]);

  // When switching to Vocalido Studio card, push note data into the iframe
  useEffect(() => {
    if (activeCard === 'vocalido' && iframeRef.current) {
      // 1. Send the simple 8-note phrase for the quick preview box
      const phraseMessage = { type: 'UPDATE_PHRASE', phrase: currentPhraseToSing };
      
      // 2. Send the full note data for the "Sing from Score" feature
      const stepMap: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
      const notesForStudio = parsedData.notes.map(n => ({
        pitch: (n.octave + 1) * 12 + (stepMap[n.step.toUpperCase()] || 0) + (n.alter || 0),
        duration: n.duration,
        startTime: n.startTime,
        lyric: n.solfege || 'La'
      }));
      const notesMessage = { type: 'UPDATE_NOTES', notes: notesForStudio };

      // Small timeout to ensure iframe's script has attached its listener after mount
      setTimeout(() => {
        if (!iframeRef.current || svsEngine !== 'vocalido') return;
        iframeRef.current.contentWindow?.postMessage(phraseMessage, '*');
        iframeRef.current.contentWindow?.postMessage(notesMessage, '*');
      }, 800);
    }
  }, [activeCard, currentPhraseToSing, parsedData.notes]);

  useEffect(() => {
    musicEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    musicEngine.updateTrackStates(tracks);
  }, [tracks]);

  // ── Transpose change → reload engine with new semitone shift ──────────────
  useEffect(() => {
    const state = musicEngine.transportState;
    if (state === 'stopped') return; // next Play will pick up transpose automatically

    const wasPlaying = state === 'started';
    const savedPos = musicEngine.transportSeconds;

    musicEngine.pause();
    setIsPlaying(false);

    // Reload for BOTH playing and paused states
    if (parsedData.notes.length > 0) {
      setIsAudioLoading(true);
      musicEngine.ensureInitialized()
        .then(() => musicEngine.loadSong(parsedData.notes, tracks, transpose, parsedData.timeSignature, isMetronomeOn))
        .then(() => {
          musicEngine.setTransportSeconds(savedPos);
          if (wasPlaying) return musicEngine.start();
        })
        .then(() => { if (wasPlaying) setIsPlaying(true); })
        .catch(e => console.error('Transpose reload failed:', e))
        .finally(() => setIsAudioLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transpose]);

  const musicalTimeRef = useRef(0);

  const lastRenderTime = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumePopupRef.current && !volumePopupRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false);
      }
    };
    if (showVolumeSlider) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVolumeSlider]);

  const totalDurationSeconds = useMemo(() => {
    if (!parsedData.notes.length) return localSong.duration || 180;
    const lastNote = parsedData.notes.reduce((p, c) => (c.startTime + c.duration) > (p.startTime + p.duration) ? c : p, parsedData.notes[0]);
    return ((lastNote.startTime + lastNote.duration) * 60) / (currentBpm || 75);
  }, [parsedData.notes, currentBpm, localSong.duration]);

  const triggerVocalSynthesis = async () => {
    if (isRenderingVocal || !musicXml || !parsedData.notes.length) return;
    if (tracks.length === 0) return;

    setRenderError(null);
    setIsRenderingVocal(true);
    setRenderProgress(0);
    setRenderTimer(0);

    // Declare these BEFORE try so they are accessible in catch/finally
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      let simulatedProgress = 0;
      if (elapsed < 3) simulatedProgress = (elapsed / 3) * 60;
      else if (elapsed < 10) simulatedProgress = 60 + ((elapsed - 3) / 7) * 30;
      else {
        const extra = elapsed - 10;
        simulatedProgress = 90 + (9.9 * (1 - Math.exp(-extra / 60)));
      }
      setRenderProgress(Math.min(99.9, simulatedProgress));
      setRenderTimer(Math.round(elapsed));
    }, 250);
    const cleanupLocal = () => {
      clearInterval(progressInterval);
      clearTimeout(timeoutId);
    };

    try {
      const stepMap: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
      
      const primaryTrackId = tracks.find(t => t.mode === 'vocal')?.id || tracks[0]?.id || 'P1';
      const sourceNotes = parsedData.notes.filter(n => n.trackId === primaryTrackId).slice(0, 128); // Reduced to 128 for stability
      
      const notesToSynthesize = sourceNotes.map(n => {
        let lyric = 'La';
        try {
          const songKey = (parsedData.metadata as any)?.key || 'C';
          lyric = getChromaticSolfege(
            n.step || 'C', 
            n.alter || 0, 
            songKey, 
            activeLyricMode,
            n.duration / ((parsedData.timeSignature as any)?.beats || 4),
            0 
          ) || n.solfege || 'La';
        } catch (e) {
          console.warn('[SVS] Solfege calc error:', e);
        }
        
        const safeStep = (n.step || 'C').toUpperCase();
        return {
          pitch: (n.octave + 1) * 12 + (stepMap[safeStep] || 0) + (n.alter || 0),
          duration: isNaN(n.duration) ? 0.5 : n.duration,
          startTime: isNaN(n.startTime) ? 0 : n.startTime,
          lyric
        };
      });

      console.log(`[SVS] 🎙️ Initializing ${svsEngine.toUpperCase()} Synthesis...`);

      if (svsEngine === 'vocalido') {
        const resp = await fetch('/studio/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ 
            notes: notesToSynthesize, 
            params: { singer: activeVoiceName, bpm: currentBpm } 
          })
        });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const result = await resp.json();
          let url = '';
          
          if (result.audio_url) {
            // If server returned a URL, use it (prefixed with proxy if needed)
            url = result.audio_url.startsWith('http') ? result.audio_url : result.audio_url;
          } else if (result.audio_b64) {
            // If server returned base64, convert to Blob
            const binary = atob(result.audio_b64);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
            const blob = new Blob([array], { type: result.mime_type || 'audio/wav' });
            url = URL.createObjectURL(blob);
          } else {
            throw new Error("Invalid synthesis response: no audio data");
          }
          
          // 🚀 Register with MusicEngine for persistence and sync
          console.log(`[Vocalido] 🎙️ Registering vocal layer to MusicEngine: ${primaryTrackId} via ${result.engine || 'unknown'}`);
          await musicEngine.addVocalLayer(primaryTrackId, url);
          
          setRenderProgress(100);
          cleanupLocal();

          // Return to score view after a brief moment so user sees 100%
          setTimeout(() => {
            setIsRenderingVocal(false);
            setActiveCard('score');   // ← Navigate back to sheet music
          }, 800);

          // Auto-play if already playing
          if (isPlaying) await musicEngine.resume();

        } else {
          const errorData = await resp.json().catch(() => ({}));
          throw new Error(errorData.error || `Vocalido Error: ${resp.status}`);
        }
      } else {
        // ACE-Step 1.5 ASYNC POLLING WORKFLOW
        const voiceToUse = (activeVoiceName === 'Auto' || !activeVoiceName) ? 'alto female' : activeVoiceName;
        
        // High-fidelity prompt to reduce breathing artifacts and ensure singing
        const singingPrompt = `(RAW SOLO VOCAL:2.2), A crystal clear professional ${voiceToUse} singer, performing a studio-quality a capella vocal track, singing the lyrics with perfect pitch and clear articulation, dry recording, no background noise, expressive and melodic.`;

        const submitResp = await fetch('http://localhost:8001/release_task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            prompt: singingPrompt,
            lyrics: notesToSynthesize.map(n => n.lyric).join('  '), 
            bpm: currentBpm,
            audio_duration: Math.max(30, Math.min(60, totalDurationSeconds + 2)), // Dynamic duration with buffer
            task_type: "text2music",
            model: 'acestep-v15-turbo'
          })
        });

        if (!submitResp.ok) throw new Error(`ACE Submission Failed: ${submitResp.status}`);
        
        const submitData = await submitResp.json();
        const taskId = submitData.data?.task_id;
        if (!taskId) throw new Error("ACE-Step: No Task ID returned");

        console.log(`[ACE-Step] ⏳ Task Queued: ${taskId}. Polling...`);

        // Start Polling Loop
        let isDone = false;
        let pollCount = 0;
        while (!isDone && pollCount < 60) { // Max 2 minutes
          await new Promise(resolve => setTimeout(resolve, 2000));
          pollCount++;

          const pollResp = await fetch('http://localhost:8001/query_result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id_list: [taskId] })
          });

            if (pollResp.ok) {
              const pollData = await pollResp.json();
              console.log(`[ACE-Step] Polling Data:`, pollData);
              const taskResult = pollData.data?.[0];
            
            if (taskResult?.status === 1) { // Success
              const resultData = JSON.parse(taskResult.result);
              const resultObj = resultData[0];
              const filePath = resultObj.file;
              if (filePath) {
                const audioUrl = filePath.startsWith('http') 
                  ? filePath 
                  : (filePath.startsWith('/') ? `http://localhost:8001${filePath}` : `http://localhost:8001/v1/audio?path=${encodeURIComponent(filePath)}`);
                
                console.log(`[ACE-Step] 🎵 Final Audio URL: ${audioUrl}`);
                
                // 🚀 Register with MusicEngine for persistence and sync
                console.log(`[ACE-Step] 🎙️ Registering vocal layer to MusicEngine: ${primaryTrackId}`);
                await musicEngine.addVocalLayer(primaryTrackId, audioUrl);

                isDone = true;
                setRenderProgress(100);
                setTimeout(() => {
                  setIsRenderingVocal(false);
                  setActiveCard('score'); // Bounce back to notes
                  cleanupLocal();
                }, 800); 

                // Auto-play if already playing
                if (isPlaying) await musicEngine.resume();
              }
            } else if (taskResult?.status === 2) { // Failed
              const errorMsg = taskResult.error || "ACE-Step: Task Failed on server";
              setRenderError(errorMsg);
              setTimeout(() => setIsRenderingVocal(false), 2000);
              throw new Error(errorMsg);
            } else {
              // Update status text if available
              if (taskResult?.progress_text) {
                console.log(`[ACE-Step] ${taskResult.progress_text}`);
              }
            }
          }
        }
        if (!isDone) throw new Error("ACE-Step: Generation Timed Out");
      }
    } catch (e: any) {
      console.error(`[${svsEngine.toUpperCase()}] Error:`, e);
      setRenderError(e.message || "Synthesis Failed");
      // Auto-close after 3 seconds so the user can see the error but doesn't get stuck
      setTimeout(() => {
        setIsRenderingVocal(false);
        setRenderError(null);
      }, 3000);
      cleanupLocal();
    }
  };

  const closeRenderOverlay = () => {
    setIsRenderingVocal(false);
    setRenderError(null);
  };

  const handleTogglePlay = async () => {
    if (isRenderingVocal) return;
    
    await Tone.start();
    if (Tone.getContext().state !== 'running') {
      console.log("[PlayerPage] Resuming Audio Context...");
      await Tone.getContext().resume();
    }
    musicEngine.setMasterVolume(masterVolume);

    const tState = musicEngine.transportState;

    if (tState === 'started') {
      musicEngine.pause();
      setIsPlaying(false);
      return;
    }

    if (tState === 'paused') {
      setIsAudioLoading(true);
      try {
        await musicEngine.resume();
        setIsPlaying(true);
      } catch (e) {
        console.error('Resume failed:', e);
      } finally {
        setIsAudioLoading(false);
      }
      return;
    }

    setIsAudioLoading(true);
    try {
      await musicEngine.ensureInitialized();
      const bpmToUse = (parsedData.metadata as any)?.bpm || currentBpm || 120;
      musicEngine.setBpm(bpmToUse);
      setCurrentBpm(bpmToUse);

      await musicEngine.loadSong(parsedData.notes, tracks, transpose, parsedData.timeSignature, isMetronomeOn);
      await musicEngine.start();
      setIsPlaying(true);
    } catch (e) {
      console.error('Playback Start Failed:', e);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const beatsPerMeasure = Math.max(1, parsedData?.timeSignature?.beats || 4);
  const writtenBar = musicEngine.currentMeasure;
  const currentBar = writtenBar ? parseInt(writtenBar) || 1 : Math.floor(musicEngine.transportMusicalTime / beatsPerMeasure) + 1;
  const currentBeat = Math.floor(musicEngine.transportMusicalTime % beatsPerMeasure) + 1;
  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const originalBpm = (parsedData?.metadata as any)?.bpm || 120;
  const musicalTime = musicEngine.transportMusicalTime * (60 / Math.max(1, originalBpm));

  const activeLoop = useMemo(() => loopPresets.find(p => p.isActive), [loopPresets]);

  useEffect(() => {
    if (activeLoop && activeLoop.isActive) {
      musicEngine.setLoopEnabled(true);
      musicEngine.setLoopPointsByMeasures(activeLoop.startBar, activeLoop.endBar, beatsPerMeasure);
    } else {
      musicEngine.setLoopEnabled(false);
    }
  }, [activeLoop, beatsPerMeasure, currentBpm]);

  const rafId = useRef(0);
  const animate = useCallback((time: number) => {
    // Update musicalTime ref at ~60fps (for smooth laser movement in ProScoreEditor)
    musicalTimeRef.current = musicEngine.transportMusicalTime;

    // Only trigger React re-renders for the time display at ~5fps (200ms)
    // This prevents React's reconciliation from competing with the audio thread
    if (time - lastRenderTime.current > 200) {
      const currentTransportSeconds = musicEngine.transportSeconds;
      setCurrentTime(currentTransportSeconds);

      // 🛑 Auto-stop logic: Stop precisely at the end of the song (0.3s buffer)
      if (musicEngine.transportState === 'started' && totalDurationSeconds > 0) {
        if (currentTransportSeconds >= totalDurationSeconds + 0.3 && !(musicEngine as any).isLoopActive) {
          musicEngine.pause();
          setIsPlaying(false);
        }
      }

      lastRenderTime.current = time;
    }
    rafId.current = requestAnimationFrame(animate);
  }, [totalDurationSeconds, isPlaying]);

  useEffect(() => {
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [animate]);

  useEffect(() => {
    if (song?.previewLimit && song.previewLimit > 0 && isPlaying) {
      const limitSeconds = song.previewLimit * beatsPerMeasure * (60 / originalBpm);
      if (currentTime >= limitSeconds) {
        musicEngine.pause();
        setIsPlaying(false);
        musicEngine.setTransportSeconds(limitSeconds);
        alert(`This is a restricted preview limited to ${song.previewLimit} Bars.`);
      }
    }
  }, [currentTime, song?.previewLimit, isPlaying, beatsPerMeasure, originalBpm]);

  return (
    <div className="flex flex-col h-full w-full bg-[#050507] relative overflow-hidden unselectable">
      {/* ── PLAYER OPTIONS MENU (LEFT ALIGNED) ── */}
      <div className="absolute top-3 left-3 sm:left-4 z-[4000] flex flex-col items-start">
        <button
          onClick={() => setIsNavMenuVisible(!isNavMenuVisible)}
          className={`bg-[#0c0c0e]/95 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest hover:text-white shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center gap-1.5 transition-all active:scale-95 group ${activeCard !== 'vocalido' ? 'text-[#00e5ff]' : 'text-zinc-400'}`}
        >
          <Library size={12} className={`${activeCard !== 'vocalido' ? 'text-[#00e5ff]' : 'text-zinc-400'} group-hover:text-white transition-colors`} />
          <span className="hidden sm:inline">PLAYER : </span>
          <span className="text-zinc-200">{activeLyricMode || 'Standard'}</span>
          <ChevronDown size={12} className={`ml-1 transition-transform duration-300 ${isNavMenuVisible ? 'rotate-180' : ''}`} />
        </button>

        {isNavMenuVisible && (
          <div className="mt-2 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/10 p-4 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col gap-3 w-[260px] animate-in fade-in slide-in-from-top-4 origin-top-left">

            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest pl-2 mb-1 flex items-center gap-1.5"><Library size={9} /> Visual Modes</span>
              {(['score', 'pianoroll', 'trackview', 'memochord', 'practice'] as PlayerCardType[]).map(card => {
                const labels: Record<PlayerCardType, string> = {
                  'score': 'Score Sheet', 'pianoroll': 'Piano Roll', 'trackview': 'Trackview',
                  'memochord': 'Chord Ring', 'practice': 'Memo Practice', 'vocalido': 'Voice Studio'
                };
                return (
                  <button
                    key={card}
                    onClick={() => { setActiveCard(card); setIsNavMenuVisible(false); }}
                    className={`px-4 py-2.5 rounded-2xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all text-left flex items-center justify-between
                      ${activeCard === card ? 'bg-[#00e5ff] text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'}`}
                  >
                    <span>{labels[card]}</span>
                    {activeCard === card && <span className="w-1.5 h-1.5 rounded-full bg-black/60" />}
                  </button>
                );
              })}
            </div>

            <div className="h-px bg-white/10 w-full my-0.5" />

            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto scrollbar-hide pr-1">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest pl-2 mb-1 flex items-center gap-1.5"><Languages size={9} /> Singing Systems</span>
              
              {[
                { group: 'American', items: ['American Movable Do', 'American Fixed Do'] },
                { group: 'British', items: ['British Movable Doh', 'British Fixed Doh'] },
                { group: 'Ju Solfege', items: ['Ju Solfege Movable Doh', 'Ju Solfege Fixed Doh'] },
                { group: 'Pedagogical', items: ['Jianpu', 'Kodaly', 'Kodaly Rhythm'] },
                { group: 'Ethnic', items: ['Indian Sargam'] },
                { group: 'Standard', items: ['Lyric', 'Close'] }
              ].map(grp => (
                <div key={grp.group} className="flex flex-col gap-1">
                  <span className="text-[7px] font-black text-zinc-600 uppercase tracking-widest pl-2 mb-0.5">{grp.group}</span>
                  <div className="grid grid-cols-2 gap-1">
                    {grp.items.map(mode => {
                      const isActive = tracks.length > 0 && tracks[0].lyricMode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => {
                            setTracks((prevTracks: any) => prevTracks.map((t: any) => ({ ...t, lyricMode: mode as LyricMode })));
                            setIsNavMenuVisible(false);
                          }}
                          className={`px-3 py-2 rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all text-center flex items-center justify-center border
                            ${isActive ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'}`}
                        >
                          {mode.replace('American ', '').replace('British ', '').replace('Ju Solfege ', '').replace('Indian ', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>

      {/* ── PREMIUM CLOUD DROPDOWN SVS CONTROL ── */}
      <div className="absolute top-3 right-3 sm:right-4 z-[4000] flex items-center">
        <div className="flex items-center bg-[#0c0c0e]/85 backdrop-blur-2xl border border-white/10 rounded-full pl-5 pr-3 py-1.5 shadow-2xl gap-4 hover:border-white/30 transition-all cursor-pointer group">
          {/* Main Display Area (Click to Toggle Studio) */}
          <button 
            className="flex items-center gap-3 pr-2"
            onClick={() => {
              if (activeCard === 'vocalido') {
                setActiveCard('score');
              } else {
                setActiveCard('vocalido');
                setIsNavMenuVisible(false);
              }
            }}
          >
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${activeCard === 'vocalido' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {svsEngine === 'vocalido' ? 'VOCALIDO' : 'ACE-STEP'}
            </span>
            <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-300 ${activeCard === 'vocalido' ? 'rotate-180' : ''}`} />
          </button>

          <div className="w-px h-3 bg-white/10" />

          {/* Settings & Toggle Area (Separated and larger) */}
          <div className="flex items-center gap-3 pl-1">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSvsEngine(prev => prev === 'vocalido' ? 'acestep' : 'vocalido');
              }}
              className={`p-2 -m-2 rounded-full transition-all ${svsEngine === 'acestep' ? 'text-cyan-400 hover:bg-cyan-400/10' : 'text-purple-400 hover:bg-purple-400/10'}`}
              title={`Switch to ${svsEngine === 'vocalido' ? 'ACE-Step' : 'Vocalido'}`}
            >
              <SlidersHorizontal size={14} />
            </button>
            
            {/* Status Dot */}
            <div className="relative flex items-center justify-center ml-1">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              <div className="absolute w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping opacity-40" />
            </div>
          </div>
        </div>
      </div>

      {song?.previewLimit && song.previewLimit > 0 && (
        <div className="absolute top-[80px] left-1/2 -translate-x-1/2 z-[100] bg-rose-500/10 backdrop-blur-xl border border-rose-500/30 text-rose-200 px-5 py-2 rounded-full shadow-2xl flex items-center gap-2 pointer-events-none">
          <Lock size={14} className="text-rose-400" />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Preview Restricted to {song.previewLimit} Bars</span>
        </div>
      )}

      <div 
        ref={splitContainerRef}
        className={`flex-1 flex flex-row relative w-full overflow-hidden ${isResizing ? 'select-none pointer-events-none' : ''}`}
      >

        {/* ── LEFT SIDEBAR: ORIGINAL IMAGE COMPARISON (SPLIT VIEW) ── */}
        {song?.coverUrl && activeCard === 'score' && (
          <div 
            className={`relative flex flex-col bg-[#0c0c0e] transition-[width] duration-0 ease-in-out z-[1000]`}
            style={{ width: !isOriginalViewHidden ? `${sidebarWidth}%` : '0px' }}
          >
            {/* Toggle Button (Eye) - Floats outside when hidden */}
            <button
              onClick={() => setIsOriginalViewHidden(!isOriginalViewHidden)}
              className={`absolute top-4 ${!isOriginalViewHidden ? 'right-4' : '-right-12 bg-white/10 backdrop-blur-md rounded-r-xl border border-l-0 border-white/20 px-2 py-2 pointer-events-auto'} z-[5000] text-zinc-400 hover:text-white transition-all`}
              title={!isOriginalViewHidden ? "Hide Original View" : "Show Original View"}
            >
              {!isOriginalViewHidden ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>

            {!isOriginalViewHidden && (
              <div className="flex flex-col w-full h-full p-4 overflow-y-auto pointer-events-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <span className="text-[10px] font-black text-[#00e5ff] uppercase tracking-widest bg-[#00e5ff]/10 px-2 py-1 rounded">Original Sheet</span>
                </div>
                
                {/* Thumbnails / Full Image View */}
                <div className="w-full flex-1 rounded-xl overflow-hidden border border-white/20 bg-[#121216] shadow-2xl relative">
                  <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                    {song.coverUrl.startsWith('pdf:') ? (
                      <iframe 
                        src={song.coverUrl.replace('pdf:', '')} 
                        className="w-full h-full border-0 bg-zinc-900" 
                        title="Original PDF"
                      />
                    ) : (
                      <img 
                        src={song.coverUrl} 
                        alt="Original Sheet Music" 
                        className="w-full h-auto object-contain cursor-crosshair min-h-full" 
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DRAGGABLE DIVIDER ── */}
        {song?.coverUrl && activeCard === 'score' && !isOriginalViewHidden && (
          <div
            onMouseDown={() => setIsResizing(true)}
            className="w-1.5 bg-black hover:bg-[#00e5ff] flex items-center justify-center cursor-col-resize z-[2000] transition-colors pointer-events-auto"
          >
            <div className="w-px h-8 bg-white/30" />
          </div>
        )}

        {/* ── MAIN CONTENT AREA (RIGHT SIDE IN SPLIT VIEW) ── */}
        <div className="flex-1 flex flex-col relative overflow-hidden pointer-events-auto">
          {/* ProScoreEditor: Handles Score, MemoChord */}
          <div
            style={{
              display: (activeCard === 'score') ? 'flex' : 'none',
              flexDirection: 'column',
              width: '100%', height: '100%'
            }}
          >
          <ProScoreEditor
            xmlData={musicXml}
            currentTime={musicEngine.transportMusicalTime}
            isPlaying={isPlaying}
            songMetadata={localSong}
            zoom={1.0}
            transpose={transpose}
            layoutMode={'paginated'}
            isLoupeEnabled={false}
            showLaser={true}
            lyricMode={activeLyricMode}
            activeLoop={activeLoop}
            performanceMode={performanceMode}
            layoutBundle={layoutBundle}
          />
        </div>

        {/* ── [VOCALIDO RENDER OVERLAY] ── */}
        {isRenderingVocal && (
          <div className="absolute inset-0 z-[5000] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-500 pointer-events-auto">
            <div className="relative flex flex-col items-center">
              {/* Outer Ring */}
              <div className="relative w-56 h-56 flex items-center justify-center">
                <svg viewBox="0 0 224 224" className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                  <circle
                    cx="112" cy="112" r="100"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    className="text-white/10"
                  />
                  {!renderError && (
                    <circle
                      cx="112" cy="112" r="100"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray="628.3"
                      strokeDashoffset={628.3 - (628.3 * renderProgress) / 100}
                      strokeLinecap="round"
                      fill="transparent"
                      className="text-cyan-400 transition-all duration-300 ease-out"
                    />
                  )}
                </svg>
                
                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <span className="text-4xl font-black tracking-tighter tabular-nums drop-shadow-lg">
                    {renderProgress < 99.9 ? renderProgress.toFixed(1) : "99.9"}%
                  </span>
                  <div className="flex items-center gap-1.5 mt-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold tabular-nums opacity-80">{renderTimer}s</span>
                  </div>
                  <div className="mt-6 flex flex-col items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 animate-pulse">
                      {renderProgress > 95 ? "Finalizing Audio..." : "Rendering Tone"}
                    </span>
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-1 h-1 bg-white/20 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col items-center gap-2">
                <div className="px-5 py-2 bg-black/60 border border-white/10 rounded-2xl backdrop-blur-xl flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full ${renderError ? 'bg-rose-500' : 'bg-cyan-400 animate-pulse'}`} />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">
                    {renderError ? (
                      <span className="text-rose-400 truncate max-w-[200px]">{renderError}</span>
                    ) : (
                      <>AI SINGER: <span className="text-cyan-400">{(activeVoiceName || 'Auto').toUpperCase()}</span></>
                    )}
                  </span>
                </div>
                {renderError ? (
                  <button 
                    onClick={() => triggerVocalSynthesis()}
                    className="mt-2 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
                  >
                    Try Again • ลองใหม่
                  </button>
                ) : (
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Wait for play • กำลังประมวลผลจนจบ</p>
                )}
                {renderError && (
                  <button onClick={closeRenderOverlay} className="text-[8px] text-zinc-500 underline mt-2 uppercase tracking-widest">Dismiss • ปิด</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PerformanceScore: Handles Piano Roll */}
        {activeCard === 'pianoroll' && (
          <div className="w-full h-full relative">
            <PerformanceScore
              notes={parsedData.notes}
              tracks={tracks}
              musicalTimeRef={musicalTimeRef}
              onSeek={(t) => musicEngine.setTransportSeconds(t)}
              onTogglePlay={handleTogglePlay}
              bpm={currentBpm}
              isPlaying={isPlaying}
              songKey={localSong.key}
              beatsPerMeasure={beatsPerMeasure}
            />
          </div>
        )}

        {/* Trackview: Full DAW timeline */}
        {activeCard === 'trackview' && (
          <div className="w-full h-full relative z-40 bg-[#050507] flex flex-col">
            <TrackView
              song={localSong}
              musicXml={musicXml || null}
              tracks={tracks}
              setTracks={setTracks}
              loopPresets={loopPresets}
              setLoopPresets={setLoopPresets}
              onExitTrackView={(card) => setActiveCard(card as any)}
            />
          </div>
        )}

        {/* Chord Ring: Full ChordPage with diatonic ring visualization */}
        {activeCard === 'memochord' && (
          <div className="w-full h-full overflow-y-auto no-scrollbar pb-48">
            <ChordPage song={song} musicXml={musicXml ?? null} />
          </div>
        )}

        {/* Action Page: Memo Practice */}
        {activeCard === 'practice' && (
          <MemoPractice
            totalBars={parsedData.notes.length > 0 ? (parsedData.notes[parsedData.notes.length - 1].startTime / beatsPerMeasure) : 100}
            currentBar={currentBar}
            onActivateLoop={(startBar, endBar, color) => {
              // Update global active loop in loopPresets
              setLoopPresets((p: any) => {
                let existing = p.find((x: any) => x.id === 'practice-loop');
                if (!existing) {
                  return [...p.map((x: any) => ({ ...x, isActive: false })), { id: 'practice-loop', name: 'Practice Focus', startBar, endBar, color, isActive: true }];
                }
                return p.map((x: any) => x.id === 'practice-loop' ? { ...x, startBar, endBar, color, isActive: true } : { ...x, isActive: false });
              });
              // Auto switch back to Score to see the loop and play
              setActiveCard('score');
            }}
          />
        )}

        {/* SVS Studio: Integrated Vocalido / ACE-Step UI */}
        {activeCard === 'vocalido' && (
          <div className="absolute inset-0 z-[3500] bg-[#0a0a0f] overflow-hidden pt-[52px] flex items-center justify-center">
            {!iframeLoaded && (
              <div className="flex flex-col items-center gap-4 text-white/50">
                <RefreshCw size={40} className="animate-spin text-accent" />
                <p className="text-sm font-medium">Initializing Voice Studio...</p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={svsEngine === 'vocalido' ? "/voice-studio.html" : "http://localhost:7860"}
              className={`w-full h-full border-0 transition-opacity duration-500 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
              title={svsEngine === 'vocalido' ? "Vocalido Voice Studio" : "ACE-Step 1.5 Engine"}
              allow="autoplay; microphone"
              onLoad={() => {
                console.log("[PlayerPage] 🎙️ Voice Studio iframe loaded");
                setIframeLoaded(true);
              }}
            />
          </div>
        )}
        <audio ref={audioRef} style={{display: 'none'}} />
        </div> {/* <-- Closes MAIN CONTENT AREA */}
      </div> {/* <-- Closes flex-row container */}

      {/* Render transport controls ONLY if a song is loaded AND not in Trackview (has its own) */}
      {song && activeCard !== 'trackview' && (
        <>
          {/* Floating Translucent Eye - Shows ONLY when transport is completely hidden */}
          <button
            onClick={() => {
              const el = document.getElementById('transport-container');
              if (el) {
                el.style.transform = 'translateY(0)';
              }
            }}
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[5000] w-12 h-8 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all duration-300 md:hidden no-print ${!isTransportHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            title="Show Controls"
          >
            <Eye size={20} />
          </button>

          {/* Main Transport Container - Slides away completely */}
          <div id="transport-container" className={`fixed inset-x-0 z-[5000] flex flex-col items-center px-3 no-print gap-1.5 pointer-events-none transition-transform duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] ${isTransportHidden ? 'translate-y-[200%]' : 'translate-y-0'}`}
            style={{ bottom: 'min(env(safe-area-inset-bottom, 16px), 16px)' }}>
            <div className="w-full max-w-[500px] bg-[#0c0c0e]/90 backdrop-blur-2xl px-3 h-9 rounded-full border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center gap-3 pointer-events-auto">
              {/* Eye Toggle on the far left - Trigger to hide */}
              <button
                onClick={() => setIsTransportHidden(true)}
                className="p-1.5 transition-all text-white/50 hover:text-white"
                title="Hide Controls"
              >
                <EyeOff size={14} />
              </button>

              <span className="text-[10px] font-black text-cyan-400 lcd-font tabular-nums w-9">{formatTime(currentTime)}</span>
              <div className="flex-1 relative h-[2px] flex items-center cursor-pointer group overflow-hidden" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); musicEngine.setTransportSeconds(((e.clientX - rect.left) / rect.width) * totalDurationSeconds); }}>
                <div className="w-full h-full bg-white/20 rounded-full" />
                <div className="absolute h-full bg-cyan-400 left-0 transition-all shadow-[0_0_8px_#00e5ff]" style={{ width: `${Math.min(100, Math.max(0, (currentTime / totalDurationSeconds) * 100))}%` }} />
                <div className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_#fff] transition-all" style={{ left: `calc(${Math.min(100, Math.max(0, (currentTime / totalDurationSeconds) * 100))}% - 6px)` }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-zinc-300 lcd-font tabular-nums w-9 text-right">{formatTime(totalDurationSeconds)}</span>
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
                <button
                  onClick={() => setShowLoopMatrix(true)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${activeLoop ? 'border-transparent shadow-lg' : 'bg-transparent border-white/10 text-white/50 hover:text-white'}`}
                  style={activeLoop ? {
                    backgroundColor: activeLoop.color,
                    color: '#000',
                    boxShadow: `0 0 15px ${activeLoop.color}80`
                  } : {}}
                >
                  <Repeat size={14} fill={activeLoop ? "currentColor" : "none"} />
                </button>
              </div>
            </div>

            <div className="w-full max-w-[calc(100vw-32px)] md:max-w-[640px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-full h-[54px] flex items-center px-2.5 pointer-events-auto relative">
              <div className="flex-[2] flex items-center justify-start gap-0.5 pr-1 border-r border-zinc-100">
                <button onClick={() => setShowMixer(!showMixer)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showMixer ? 'bg-zinc-100 text-black' : 'text-zinc-300 hover:text-black'}`}><SlidersHorizontal size={14} /></button>
                <button onClick={() => {
                  if (musicEngine.transportState !== 'stopped') {
                    musicEngine.pause();
                  }
                  musicEngine.setTransportSeconds(0);
                  musicEngine.currentMeasure = '';
                  musicEngine.currentNoteTime = 0;
                  setIsPlaying(false);
                }} className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-black"><SkipBack size={18} fill="currentColor" /></button>
                <div className="relative ml-1">
                  <div className={`absolute inset-0 bg-cyan-400/20 blur-md rounded-full transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
                  <button 
                    onClick={handleTogglePlay} 
                    disabled={isAudioLoading || isRenderingVocal} 
                    className={`relative w-[38px] h-[38px] rounded-full flex items-center justify-center text-white transition-all 
                      ${isRenderingVocal ? 'bg-zinc-800 shadow-none grayscale' : 'bg-[#00e5ff] shadow-[0_4px_15px_rgba(0,229,255,0.4)]'}`}
                  >
                    {isAudioLoading ? <RefreshCw size={16} className="animate-spin text-white/50" /> : (isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" className="ml-0.5" />)}
                  </button>
                </div>
              </div>

              <div className="flex-[8] h-[40px] bg-[#0c0c0e] rounded-full flex items-center border border-black shadow-inner overflow-hidden mx-1.5">
                <div className="flex-[1.2] h-full border-r border-white/5 flex items-center justify-center"><KeyTransposeDisplay keySig={parsedData.metadata.key || localSong.key} transpose={transpose} onTransposeChange={setTranspose} /></div>
                <div className="flex-[1.2] h-full border-r border-white/5 flex items-center justify-center"><BpmDisplay bpm={currentBpm} onBpmChange={(b) => { setCurrentBpm(b); musicEngine.setBpm(b); }} /></div>
                <div className="flex-[0.8] h-full border-r border-white/5 flex items-center justify-center"><TimeSigDisplay beats={parsedData.timeSignature.beats} beatType={parsedData.timeSignature.beatType} /></div>
                <div className="flex-[1.5] h-full flex items-center justify-center"><BarBeatPositionDisplay bar={currentBar} beat={currentBeat} onSeek={(bar) => musicEngine.setTransportSeconds((bar - 1) * beatsPerMeasure * 60 / currentBpm)} /></div>
              </div>

              <div className="flex-[1.5] flex items-center justify-end gap-1 pl-1 relative">
                <button onClick={() => setActiveCard(activeCard === 'score' ? 'pianoroll' : 'score')} className={`w-9 h-9 border rounded-full flex flex-col items-center justify-center group active:scale-95 transition-all ${activeCard === 'score' ? 'bg-[#fbfbfb] border-zinc-100 text-zinc-300' : 'bg-cyan-50 border-cyan-100 text-cyan-500'}`}>
                  <Music size={13} className={activeCard === 'score' ? 'text-zinc-300' : 'text-cyan-500'} />
                  <span className={`text-[6px] font-black uppercase mt-0.5 ${activeCard === 'score' ? 'text-zinc-400' : 'text-cyan-600'}`}>SCR</span>
                </button>

                <div className="relative" ref={volumePopupRef}>
                  <button
                    onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border-2 ${showVolumeSlider ? 'border-cyan-400 bg-cyan-50 text-cyan-600 shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'border-transparent text-zinc-300 hover:text-cyan-500'}`}
                  >
                    {masterVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={20} className={showVolumeSlider ? 'text-cyan-600' : 'text-zinc-300'} />}
                  </button>

                  {showVolumeSlider && (
                    <div
                      ref={volumePopupRef}
                      className="absolute bottom-[64px] left-1/2 -translate-x-1/2 w-14 h-64 bg-[#0c0c0e]/95 backdrop-blur-2xl rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,1)] border border-white/10 p-3.5 flex flex-col items-center animate-in slide-in-from-bottom-6 duration-300 z-[9999] ring-1 ring-white/10 select-none touch-none"
                      onPointerDown={(e) => {
                        volumeDragStartYRef.current = e.clientY;
                        volumeDragStartVolRef.current = masterVolume;
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        e.stopPropagation();
                      }}
                      onPointerMove={(e) => {
                        if (volumeDragStartYRef.current === null) return;
                        const deltaY = volumeDragStartYRef.current - e.clientY;
                        const trackHeight = 160;
                        const newVol = Math.max(0, Math.min(1, volumeDragStartVolRef.current + deltaY / trackHeight));
                        setMasterVolume(newVol);
                        musicEngine.setMasterVolume(newVol);
                      }}
                      onPointerUp={() => { volumeDragStartYRef.current = null; }}
                      onPointerCancel={() => { volumeDragStartYRef.current = null; }}
                    >
                      <div className="flex-1 w-2.5 bg-black rounded-full relative overflow-hidden border border-white/5 shadow-inner cursor-ns-resize">
                        <div
                          className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-cyan-600 via-cyan-400 to-white shadow-[0_0_15px_rgba(0,229,255,0.6)]"
                          style={{ height: `${masterVolume * 100}%` }}
                        />
                      </div>
                      <div className="mt-4 flex flex-col items-center shrink-0">
                        <div className="bg-black/80 px-2 py-1.5 rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.2)] flex items-center justify-center min-w-[36px]">
                          <span className="text-[15px] font-black text-cyan-400 lcd-font tracking-tighter leading-none">{Math.round(masterVolume * 100)}</span>
                        </div>
                        <span className="text-[6px] font-black text-zinc-500 uppercase tracking-[0.3em] mt-2.5 opacity-60">MASTER</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {song && showMixer && (
        <div className="fixed inset-0 z-[9000] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 pointer-events-auto" onClick={(e) => { if (e.target === e.currentTarget) setShowMixer(false); }}>
          <div className="w-full max-w-3xl bg-[#0c0c0e] border border-white/10 rounded-[40px] p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#0c0c0e] z-10 pb-2">
              <h3 className="text-lg font-black italic uppercase text-white tracking-tighter flex items-center gap-3">
                <SlidersHorizontal size={20} className="text-cyan-400" /> Mixer Core
              </h3>
              <button onClick={() => setShowMixer(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/20 transition-all">
                <X size={20} />
              </button>
            </div>
            <MixerPanel
              tracks={tracks}
              songKey={song?.key || localSong.key || 'C'}
              onUpdateTrack={(id, update) => setTracks((prev: any) => prev.map((t: any) => t.id === id ? { ...t, ...update } : t))}
              onOpenPluginBrowser={(trackId, slotIndex) => setPluginBrowserTarget({ trackId, slotIndex })}
              onOpenPluginEditor={(trackId, slotIndex, plugin) => setEditingPlugin({ trackId, slotIndex, plugin })}
            />
          </div>
        </div>
      )}
      {showLoopMatrix && <LoopMatrixModal presets={loopPresets} onUpdatePreset={(id, u) => setLoopPresets((p: any) => p.map((x: any) => x.id === id ? { ...x, ...u } : x))} onDisableAll={() => setLoopPresets((p: any) => p.map((x: any) => ({ ...x, isActive: false })))} onClose={() => setShowLoopMatrix(false)} />}
      {pluginBrowserTarget && <PluginBrowserModal onClose={() => setPluginBrowserTarget(null)} onSelect={(pluginDef) => {
        const newEffect: EffectInstance = { definition: pluginDef, isBypassed: false };
        const { trackId, slotIndex } = pluginBrowserTarget;
        setTracks((prev: any) => prev.map((t: any) => t.id === trackId ? { ...t, effects: [...(t.effects || []).slice(0, slotIndex), newEffect, ...(t.effects || []).slice(slotIndex + 1)] } : t));
        setPluginBrowserTarget(null);
      }} />}
      {editingPlugin && <FXPluginModal plugin={editingPlugin.plugin.definition} isBypassed={editingPlugin.plugin.isBypassed} onClose={() => setEditingPlugin(null)} onBypassToggle={() => {
        const { trackId, slotIndex, plugin } = editingPlugin;
        const newPlugin = { ...plugin, isBypassed: !plugin.isBypassed };
        setTracks((prev: any) => prev.map((t: any) => t.id === trackId ? { ...t, effects: [...(t.effects || []).slice(0, slotIndex), newPlugin, ...(t.effects || []).slice(slotIndex + 1)] } : t));
        setEditingPlugin(p => p ? { ...p, plugin: newPlugin } : null);
      }} onRemove={() => {
        const { trackId, slotIndex } = editingPlugin;
        setTracks((prev: any) => prev.map((t: any) => t.id === trackId ? { ...t, effects: [...(t.effects || []).slice(0, slotIndex), ...(t.effects || []).slice(slotIndex + 1)] } : t));
        setEditingPlugin(null);
      }} />}
    </div>
  );
};

export default PlayerPage;
