import React, { useState, useEffect, useRef } from 'react';
import { Bot, Wand2, Music, Loader2, Play, X, Tags } from 'lucide-react';
import { TrackState } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';
import { nimoBrain } from '../../lib/NimoBrain';

const STYLE_CATEGORIES = [
  {
    name: "Pop & Electronic",
    styles: ["Pop", "K-Pop", "J-Pop", "Lo-Fi Beats", "Synthwave", "EDM", "House", "Techno", "Chillout", "Hyperpop", "City Pop", "Dubstep", "Drum and Bass", "Trance"]
  },
  {
    name: "Rock & Metal",
    styles: ["Indie Rock", "Pop Punk", "Alternative Rock", "Heavy Metal", "Grunge", "Shoegaze", "Post-Rock", "Nu Metal", "Black Metal", "Math Rock"]
  },
  {
    name: "Acoustic & Folk",
    styles: ["Acoustic Pop", "Folk", "Country", "Singer-Songwriter", "Bluegrass", "Celtic"]
  },
  {
    name: "Cinematic & Classical",
    styles: ["Epic Cinematic", "Symphony Orchestra", "Piano Solo", "String Quartet", "Ambient", "Baroque", "Minimalist", "Choral", "Film Score"]
  },
  {
    name: "R&B, Hip Hop & Urban",
    styles: ["R&B", "Hip Hop", "Trap", "Soul", "Funk", "Neo-Soul", "Gospel", "Lo-Fi Hip Hop"]
  },
  {
    name: "Jazz & Blues",
    styles: ["Jazz", "Smooth Jazz", "Bossa Nova", "Blues", "Swing", "Bebop", "Ragtime"]
  },
  {
    name: "World & Regional",
    styles: ["Reggae", "Latin Pop", "Afrobeats", "Reggaeton", "Salsa", "Bollywood", "Mariachi", "K-Trot"]
  },
  {
    name: "Niche & Specialty",
    styles: ["8-bit / Chiptune", "Lullaby", "Acapella", "Gregorian Chant", "Sea Shanty", "Musical Theatre"]
  }
];

const MOODS = ['😊 Happy', '😢 Sad', '⚡ Energetic', '☕ Chill', '🔥 Aggressive', '🌌 Dreamy', '🎲 Surprise Me'];
const TEMPOS = ['🐢 Slow', '🚶 Medium', '🏃 Fast', '🌪️ Very Fast'];

interface ComposerPageProps {
  parsedData: any | null;
  tracks: TrackState[];
  setTracks: React.Dispatch<React.SetStateAction<TrackState[]>>;
  onTrackCreated: (trackId: string) => void;
}

const ComposerPage: React.FC<ComposerPageProps> = ({ parsedData, tracks, setTracks, onTrackCreated }) => {
  const [lyriaPrompt, setLyriaPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [isLyriaGenerating, setIsLyriaGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // New State for Selectors
  const [genMode, setGenMode] = useState<'full' | 'backing'>('full');
  const [selectedMood, setSelectedMood] = useState<string>('');
  const [selectedTempo, setSelectedTempo] = useState<string>('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false);
  
  // Stem extraction state
  const [extractMode, setExtractMode] = useState<{[key: string]: string}>({});
  const [extractedStems, setExtractedStems] = useState<{[key: string]: any[]}>({});
  const [isExtracting, setIsExtracting] = useState<{[key: string]: boolean}>({});

  // Use refs to access latest state in NimoBrain callbacks without re-registering
  const generateRef = useRef<() => void>(() => {});

  useEffect(() => {
    nimoBrain.updateState('musicgenState', {
      mode: genMode,
      mood: selectedMood,
      tempo: selectedTempo,
      styles: selectedStyles,
      prompt: lyriaPrompt,
      isGenerating: isLyriaGenerating,
      generatedTracksCount: tracks.filter(t => t.id.startsWith('composer-')).length
    });
  }, [genMode, selectedMood, selectedTempo, selectedStyles, lyriaPrompt, isLyriaGenerating, tracks]);

  useEffect(() => {
    const unregGenerate = nimoBrain.registerAction('musicgen_generate', () => {
      generateRef.current();
    }, { th: 'สั่ง AI แต่งเพลงใหม่ทันที', en: 'Trigger AI to compose a new song', category: 'composer' });
    
    const unregSetMood = nimoBrain.registerAction('musicgen_set_mood', (params) => {
      if (params?.mood) setSelectedMood(params.mood);
    }, { th: 'ตั้ง Mood ของเพลง', en: 'Set song mood', params: "{ mood: 'Happy' | 'Sad' | 'Energetic' | 'Chill' | 'Aggressive' | 'Dreamy' }", category: 'composer' });

    const unregSetTempo = nimoBrain.registerAction('musicgen_set_tempo', (params) => {
      if (params?.tempo) setSelectedTempo(params.tempo);
    }, { th: 'ตั้งจังหวะเพลงใหม่', en: 'Set new song tempo', params: "{ tempo: 'Slow' | 'Medium' | 'Fast' | 'Very Fast' }", category: 'composer' });

    const unregAddStyle = nimoBrain.registerAction('musicgen_add_style', (params) => {
      if (params?.style) {
        setSelectedStyles(prev => {
          if (!prev.includes(params.style)) return [...prev, params.style];
          return prev;
        });
      }
    }, { th: 'เพิ่มสไตล์เพลง', en: 'Add a style tag', params: "{ style: string }", category: 'composer' });

    const unregClearStyles = nimoBrain.registerAction('musicgen_clear_styles', () => {
      setSelectedStyles([]);
    }, { th: 'ล้างสไตล์ทั้งหมด', en: 'Clear all style tags', category: 'composer' });
    
    const unregSetPrompt = nimoBrain.registerAction('musicgen_set_prompt', (params) => {
      if (params?.prompt !== undefined) setLyriaPrompt(params.prompt);
    }, { th: 'ตั้งคำอธิบายเพลง', en: 'Set song description prompt', params: "{ prompt: string }", category: 'composer' });

    const unregSetLyrics = nimoBrain.registerAction('musicgen_set_lyrics', (params) => {
      if (params?.lyrics !== undefined) setLyrics(params.lyrics);
    }, { th: 'ใส่เนื้อร้อง', en: 'Set lyrics text', params: "{ lyrics: string }", category: 'composer' });

    return () => {
      unregGenerate();
      unregSetMood();
      unregSetTempo();
      unregAddStyle();
      unregClearStyles();
      unregSetPrompt();
      unregSetLyrics();
    };
  }, []);

  const handleLyriaGenerate = async () => {
    if (genMode === 'backing' && (!parsedData || !parsedData.notes || parsedData.notes.length === 0)) {
      setErrorMsg("No notes found in the current song to create a backing track.");
      return;
    }
    setErrorMsg(null);
    setIsLyriaGenerating(true);
    
    try {
      // Remove emojis from mood and tempo before sending
      const moodText = selectedMood.replace(/[\u1000-\uFFFF]+/g, '').trim();
      const tempoText = selectedTempo.replace(/[\u1000-\uFFFF]+/g, '').trim();
      
      const finalPromptParts = [
        ...selectedStyles,
        moodText && moodText !== 'Surprise Me' ? `${moodText} mood` : '',
        tempoText ? `${tempoText} tempo` : '',
        lyriaPrompt
      ].filter(Boolean);
      
      const finalPrompt = finalPromptParts.join(', ');

      // Bypass backend 'Missing notes data' check for full songs by sending a dummy rest note.
      const payloadNotes = genMode === 'backing' 
        ? parsedData.notes 
        : [{ step: 'z', alter: 0, octave: 4, startTime: 0, duration: 4 }];
        
      const finalPromptForLyria = genMode === 'full' 
        ? `[FULL ORIGINAL SONG] ${finalPrompt || 'Auto'}` 
        : (finalPrompt || 'Auto');

      const response = await fetch('/vocalido/api/ai/lyria-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: genMode,
          notes: payloadNotes, 
          prompt: finalPromptForLyria,
          lyrics: lyrics,
          key: parsedData?.keySignature || 'C',
          bpm: parsedData?.tempo || 120,
          style: 'auto'
        })
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to request composition');
      }
      
      let audioSrc = '';
      if (data.task_id) {
        let isComplete = false;
        let pollCount = 0;
        const MAX_POLLS = 60; // Max 3 minutes
        while (!isComplete && pollCount < MAX_POLLS) {
          pollCount++;
          await new Promise(r => setTimeout(r, 3000));
          const pollRes = await fetch('/vocalido/api/ai/lyria-poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: data.task_id })
          });
          const pollData = await pollRes.json();
          if (!pollRes.ok || !pollData.success) {
            if (pollData.status !== 'processing') {
              throw new Error(pollData.message || pollData.error || 'Composition failed during generation');
            }
          }

          if (pollData.status === 'completed' || pollData.status === 'success') {
            isComplete = true;
            audioSrc = pollData.data?.base64 ? `data:audio/mp3;base64,${pollData.data.base64}` : pollData.data?.url;
          } else if (pollData.status === 'failed' || pollData.error) {
            throw new Error(pollData.message || pollData.error || 'Composition failed during generation');
          }
        }
        if (!isComplete) {
          throw new Error('Composition timed out. The server took too long to respond.');
        }
      } else if (data.data) {
        audioSrc = data.data.base64 ? `data:audio/mp3;base64,${data.data.base64}` : data.data.url;
      } else {
        throw new Error('Invalid response from AI Composer');
      }
      
      const newTrackId = `composer-${Date.now()}`;
      
      // Generate dynamic name based on selections
      const mainStyle = selectedStyles.length > 0 ? selectedStyles[0] : 'MusicGen';
      const mainMood = selectedMood ? selectedMood.replace(/[\u1000-\uFFFF]+/g, '').trim().split(' ')[0] : 'Track';
      const randomNum = Math.floor(Math.random() * 999) + 1;
      const trackName = `${mainMood} ${mainStyle} #${randomNum}`;

      const newTrack: TrackState = {
        id: newTrackId,
        name: trackName,
        isMuted: false,
        isSolo: false,
        lyricMode: 'phoneme' as any,
        volume: 0,
        pan: 0,
        mode: 'vocal',
        audioSrc: audioSrc,
        effects: []
      };
      
      setTracks(prev => [...prev, newTrack]);
      
      try {
        const lyriaBpm = data.data.detectedBpm || (parsedData.tempo || 120);
        await musicEngine.addVocalLayer(newTrackId, audioSrc, undefined, lyriaBpm);
        onTrackCreated(newTrackId);
      } catch (e) {
        console.error('Failed to load AI audio layer:', e);
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to generate track.");
    } finally {
      setIsLyriaGenerating(false);
    }
  };

  useEffect(() => {
    generateRef.current = handleLyriaGenerate;
  }, [handleLyriaGenerate]);

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden bg-[#050507] pb-[160px] custom-scrollbar">
      {/* Background aesthetics */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-500/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="min-h-full w-full flex p-4 sm:p-8">
        <div className="relative z-10 max-w-2xl w-full m-auto bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,211,238,0.4)]">
            <Wand2 size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-3 drop-shadow-lg flex items-center gap-2">
            ✨ MusicGen
          </h1>
          <p className="text-sm text-zinc-400 max-w-lg leading-relaxed">
            {genMode === 'full' 
              ? 'Let the AI compose a completely new song from your prompt and lyrics.' 
              : 'Let the AI compose a full backing track for your melody. Select the mood, tempo, and styles, or describe your own.'}
          </p>
        </div>

        <div className="space-y-6">
          
          {/* Generation Mode Selector */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-black/40 rounded-full p-1 border border-white/10 relative">
              <button
                onClick={() => setGenMode('full')}
                className={`relative px-6 py-2 text-sm font-medium rounded-full transition-all duration-300 z-10 ${
                  genMode === 'full' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Full Song
              </button>
              <button
                onClick={() => setGenMode('backing')}
                className={`relative px-6 py-2 text-sm font-medium rounded-full transition-all duration-300 z-10 ${
                  genMode === 'backing' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Backing Track
              </button>
              {/* Highlight Pill */}
              <div
                className={`absolute top-1 bottom-1 w-[50%] bg-cyan-600/80 shadow-[0_0_15px_rgba(8,145,178,0.5)] rounded-full transition-transform duration-300 ease-out`}
                style={{ transform: genMode === 'backing' ? 'translateX(98%)' : 'translateX(0)' }}
              />
            </div>
          </div>
          
          {/* Mood & Tempo Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-black/30 p-5 rounded-2xl border border-white/5">
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Mood</label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map(mood => (
                  <button
                    key={mood}
                    onClick={() => setSelectedMood(selectedMood === mood ? '' : mood)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      selectedMood === mood 
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' 
                        : 'bg-black/60 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-300'
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Tempo</label>
              <div className="flex flex-wrap gap-2">
                {TEMPOS.map(tempo => (
                  <button
                    key={tempo}
                    onClick={() => setSelectedTempo(selectedTempo === tempo ? '' : tempo)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      selectedTempo === tempo 
                        ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300' 
                        : 'bg-black/60 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-300'
                    }`}
                  >
                    {tempo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="group relative">
              <div className="flex justify-between items-end mb-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">Custom Prompt</label>
                <button 
                  onClick={() => setIsStyleModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg transition-colors border border-cyan-500/20"
                >
                  <Tags size={14} />
                  Browse Styles
                </button>
              </div>
              
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-[20px] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 mt-8" />
              <div className="relative bg-black/50 border border-white/10 rounded-2xl flex flex-col focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400 transition-all">
                
                {/* Selected Style Chips */}
                {selectedStyles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 border-b border-white/10 bg-black/20 rounded-t-2xl">
                    {selectedStyles.map(style => (
                      <span key={style} className="flex items-center gap-1 bg-purple-500/20 border border-purple-500/30 text-purple-300 px-2.5 py-1 rounded-md text-xs font-medium">
                        {style}
                        <button onClick={() => setSelectedStyles(s => s.filter(x => x !== style))} className="hover:text-white ml-1">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                
                <textarea
                  className="w-full bg-transparent p-6 text-white text-base focus:outline-none min-h-[120px] resize-none rounded-2xl"
                  placeholder="Describe your musical style here. e.g., 'Epic Cinematic Symphony', 'Upbeat K-Pop', 'Sad acoustic guitar'..."
                  value={lyriaPrompt}
                  onChange={e => setLyriaPrompt(e.target.value)}
                />
              </div>
            </div>
            
            <div className="group relative">
              <div className="flex justify-between items-end mb-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">Lyrics (Optional)</label>
                <button
                  onClick={() => setIsLyricsExpanded(!isLyricsExpanded)}
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                >
                  {isLyricsExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
              <div className="absolute -inset-1 bg-gradient-to-r from-pink-500 to-purple-500 rounded-[20px] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 mt-6" />
              <textarea
                className={`relative w-full bg-black/50 border border-white/10 rounded-2xl p-6 text-white text-base focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400 resize-none transition-all ${isLyricsExpanded ? 'min-h-[400px]' : 'min-h-[160px] h-[calc(100%-24px)]'}`}
                placeholder="Enter lyrics for the AI to sing... (Leave empty for an instrumental arrangement)"
                value={lyrics}
                onChange={e => setLyrics(e.target.value)}
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleLyriaGenerate}
            disabled={isLyriaGenerating}
            className="relative w-full h-16 rounded-2xl text-sm font-black uppercase tracking-[0.2em] transition-all group overflow-hidden bg-[#111] border border-white/10 disabled:opacity-50 disabled:pointer-events-none mt-4"
          >
            {/* Hover Effects */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <div className="relative z-10 flex items-center justify-center gap-3">
              {isLyriaGenerating ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <span className="text-white drop-shadow-md">COMPOSING MUSIC...</span>
                </>
              ) : (
                <>
                  <Wand2 size={20} className="text-cyan-400 group-hover:text-white transition-colors" />
                  <span className="text-zinc-300 group-hover:text-white transition-colors">GENERATE TRACK</span>
                </>
              )}
            </div>
          </button>

          {/* Generated Tracks Preview */}
          {tracks.filter(t => t.id.startsWith('composer-')).length > 0 && (
            <div className="mt-8 space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Generated Compositions</h3>
              <div className="space-y-3">
                {tracks.filter(t => t.id.startsWith('composer-')).map(track => (
                  <div key={track.id} className="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Music size={16} className="text-cyan-400" />
                        <span className="text-sm font-bold text-white">{track.name}</span>
                      </div>
                      {/* Download Button */}
                      {track.audioSrc && (
                        <a 
                          href={track.audioSrc} 
                          download={`${track.name}.mp3`}
                          className="text-[10px] font-bold uppercase bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-white transition-colors flex items-center gap-1"
                          title="Download MP3"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          Save
                        </a>
                      )}
                    </div>
                    {track.audioSrc ? (
                      <audio controls className="w-full h-10" src={track.audioSrc}>
                        Your browser does not support the audio element.
                      </audio>
                    ) : (
                      <div className="text-xs text-zinc-500 italic">No audio source available</div>
                    )}
                    <div className="flex flex-col gap-2 mt-2 bg-black/20 p-3 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-400 uppercase">Separation Mode:</span>
                        <select 
                          value={extractMode[track.id] || '2stems'} 
                          onChange={(e) => setExtractMode(prev => ({...prev, [track.id]: e.target.value}))}
                          className="bg-black/50 border border-white/10 rounded-lg text-xs text-white px-2 py-1 outline-none focus:border-cyan-400"
                        >
                          <option value="2stems">2 Tracks (Vocals + Music)</option>
                          <option value="4stems">4 Tracks (Vocals, Drums, Bass, Other)</option>
                        </select>
                      </div>
                      
                      <button
                        disabled={isExtracting[track.id]}
                        onClick={async () => {
                          if (!track.audioSrc || !track.audioSrc.includes('base64,')) {
                            alert("Requires full audio data to extract stems.");
                            return;
                          }
                          try {
                            setIsExtracting(prev => ({...prev, [track.id]: true}));
                            const mode = extractMode[track.id] || '2stems';
                            const b64 = track.audioSrc.split(',')[1];
                            const res = await fetch('/vocalido/api/ai/extract-stems-midi', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ audio_base64: b64, mode })
                            });
                            const data = await res.json();
                            if (!data.success) throw new Error(data.message);
                            
                            // Decode XML and create objects
                            const atobUTF8 = (b64: string) => decodeURIComponent(escape(atob(b64)));
                            const results: any[] = [];
                            
                            for (const [stemName, stemData] of Object.entries(data.data as Record<string, any>)) {
                                if (stemData?.xml) {
                                  const xmlStr = atobUTF8(stemData.xml);
                                  const parsed = (await import('../../lib/MusicEngine')).musicEngine.parseMusicXml(xmlStr);
                                  results.push({
                                    id: `${stemName}-${Date.now()}`,
                                    name: `${track.name} (${stemName.toUpperCase()})`,
                                    instrument: stemName === 'vocals' ? 'vocal' : stemName === 'drums' ? 'drums' : stemName === 'bass' ? 'bass' : 'piano',
                                    mode: stemName === 'vocals' ? 'vocal' : 'piano',
                                    _generatedNotes: parsed.notes
                                  });
                                }
                            }
                            
                            setExtractedStems(prev => ({...prev, [track.id]: results}));
                          } catch (e: any) {
                            alert("Extraction Failed: " + e.message);
                          } finally {
                            setIsExtracting(prev => ({...prev, [track.id]: false}));
                          }
                        }}
                        className={`w-full h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${isExtracting[track.id] ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/40 hover:to-pink-500/40 border border-purple-500/30 text-purple-200'}`}
                      >
                        {isExtracting[track.id] ? (
                           <><div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin"/> EXTRACTING...</>
                        ) : (
                           <><span className="text-[14px]">✂️</span> Extract Stems & Notes</>
                        )}
                      </button>
                    </div>

                    {/* Extracted Folder UI */}
                    {extractedStems[track.id] && extractedStems[track.id].length > 0 && (
                      <div className="mt-2 bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-3">
                        <div className="text-xs font-bold text-indigo-300 uppercase mb-2 flex justify-between items-center">
                          <span>Extracted MIDI Tracks</span>
                          <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded-full">{extractedStems[track.id].length} Items</span>
                        </div>
                        <div className="space-y-2">
                          {extractedStems[track.id].map(stem => (
                            <div key={stem.id} className="flex items-center justify-between bg-black/40 p-2 rounded-lg border border-white/5">
                               <div className="flex items-center gap-2 text-xs text-white">
                                 <Music size={12} className="text-pink-400" />
                                 {stem.name}
                               </div>
                               <button 
                                 onClick={() => {
                                   setTracks(prev => [...prev, stem]);
                                   alert(`${stem.name} imported to Arranger!`);
                                 }}
                                 className="text-[10px] font-bold uppercase bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-white transition-colors"
                               >
                                 Import
                               </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Style Library Modal */}
      {isStyleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Tags className="text-cyan-400" /> Style Library
              </h2>
              <button onClick={() => setIsStyleModalOpen(false)} className="text-zinc-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
              {STYLE_CATEGORIES.map(category => (
                <div key={category.name}>
                  <h3 className="text-sm font-bold text-cyan-300/80 uppercase tracking-widest mb-4 flex items-center gap-3">
                    {category.name}
                    <div className="h-px bg-white/10 flex-1"></div>
                  </h3>
                  <div className="flex flex-wrap gap-2.5">
                    {category.styles.map(style => {
                      const isSelected = selectedStyles.includes(style);
                      return (
                        <button
                          key={style}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedStyles(s => s.filter(x => x !== style));
                            } else {
                              setSelectedStyles(s => [...s, style]);
                            }
                          }}
                          className={`px-4 py-2 rounded-xl text-sm transition-all border shadow-sm ${
                            isSelected 
                              ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 border-purple-400/50 text-white font-bold scale-105' 
                              : 'bg-black/50 border-white/10 text-zinc-300 hover:border-white/30 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {style}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-6 border-t border-white/10 bg-black/40 flex justify-between items-center rounded-b-3xl">
              <div className="text-zinc-400 text-sm">
                Selected: <span className="text-white font-bold">{selectedStyles.length}</span> styles
              </div>
              <button 
                onClick={() => setIsStyleModalOpen(false)}
                className="bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg hover:shadow-cyan-500/25"
              >
                Apply Styles
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </div>
  );
};

export default ComposerPage;
