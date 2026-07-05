import React, { useState, useRef, useCallback } from 'react';
import { Youtube, Download, Loader2, Music, Scissors, Play, X, FileAudio, ChevronDown, ChevronUp, AlertCircle, Upload, Link2 } from 'lucide-react';

interface DownloadedSong {
  id: string;
  title: string;
  url: string;        // server path e.g. /vocalido/audio/xxxxx.wav or blob URL
  filename: string;
  duration: number;    // seconds
  sampleRate: number;
  channels: number;
  fileSize: number;    // bytes
  bitDepth: number;
  stems?: { [key: string]: { url: string; title: string } };
  isSeparating?: boolean;
  separateError?: string;
  isLocal?: boolean;   // true if uploaded from disk (not from server)
}

interface YouTubeStudioPageProps {
  onOpenInPlayer?: (url: string, title: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const YouTubeStudioPage: React.FC<YouTubeStudioPageProps> = ({ onOpenInPlayer }) => {
  const [ytInput, setYtInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [songs, setSongs] = useState<DownloadedSong[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Analyze audio file to extract metadata ──
  const analyzeAudio = useCallback(async (audioData: ArrayBuffer): Promise<Partial<DownloadedSong>> => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const fileSize = audioData.byteLength;
      const audioBuffer = await audioCtxRef.current.decodeAudioData(audioData.slice(0));
      const duration = audioBuffer.duration;
      const sampleRate = audioBuffer.sampleRate;
      const channels = audioBuffer.numberOfChannels;
      
      // Estimate bit depth from file size
      const rawSize = duration * sampleRate * channels * 2; // assuming 16-bit
      const bitDepth = fileSize > rawSize * 1.2 ? 24 : 16;

      return { duration, sampleRate, channels, fileSize, bitDepth };
    } catch (e) {
      console.error('Audio analysis failed:', e);
      return { duration: 0, sampleRate: 44100, channels: 2, fileSize: 0, bitDepth: 16 };
    }
  }, []);

  // ── Handle file upload ──
  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(f => 
      f.type.startsWith('audio/') || 
      /\.(wav|mp3|flac|ogg|m4a|aac|wma)$/i.test(f.name)
    );
    if (audioFiles.length === 0) return;

    for (const file of audioFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const meta = await analyzeAudio(arrayBuffer);
        const blobUrl = URL.createObjectURL(file);
        
        const song: DownloadedSong = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: file.name.replace(/\.[^.]+$/, ''),
          url: blobUrl,
          filename: file.name,
          duration: meta.duration || 0,
          sampleRate: meta.sampleRate || 44100,
          channels: meta.channels || 2,
          fileSize: meta.fileSize || file.size,
          bitDepth: meta.bitDepth || 16,
          isLocal: true,
        };
        setSongs(prev => [...prev, song]);

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('youtube_downloaded', {
          detail: { url: blobUrl, title: song.title, filename: file.name }
        }));
      } catch (e) {
        console.error(`Failed to process ${file.name}:`, e);
      }
    }

    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast(`✅ Loaded ${audioFiles.length} file(s)`, '#10B981');
    }
  }, [analyzeAudio]);

  // ── YouTube download via server ──
  const handleDownload = async () => {
    if (!ytInput.trim()) return;
    const rawLines = ytInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const urls = [...new Set(rawLines)].map(u => u.startsWith('http') ? u : 'ytsearch1:' + u);
    if (urls.length === 0) return;

    setIsDownloading(true);
    const total = urls.length;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setProgress(`${i + 1} / ${total}`);
      try {
        const res = await fetch('/vocalido/api/youtube/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, quality: 'auto' })
        });
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        if (data.url) {
          // Fetch audio data for analysis
          const audioRes = await fetch(data.url);
          const audioData = await audioRes.arrayBuffer();
          const meta = await analyzeAudio(audioData);

          const song: DownloadedSong = {
            id: `yt-${Date.now()}-${i}`,
            title: data.title || 'Unknown',
            url: data.url,
            filename: data.filename,
            duration: meta.duration || data.duration || 0,
            sampleRate: meta.sampleRate || 44100,
            channels: meta.channels || 2,
            fileSize: meta.fileSize || data.fileSize || 0,
            bitDepth: meta.bitDepth || 16,
          };
          setSongs(prev => [...prev, song]);

          // Also dispatch event for Arranger Audio Bin
          window.dispatchEvent(new CustomEvent('youtube_downloaded', {
            detail: { url: data.url, title: data.title, filename: data.filename }
          }));
        }
      } catch (e: any) {
        console.error(`Failed: ${url}`, e);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast(`❌ ${i+1}/${total}: ${e.message || 'Failed'}`, '#EF4444');
        }
      }
    }

    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast(`Done! Downloaded`, '#10B981');
    }
    setYtInput('');
    setProgress('');
    setIsDownloading(false);
  };

  // ── Stem separation ──
  const handleStemSeparation = async (songId: string, stemCount: 2 | 4) => {
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, isSeparating: true, separateError: undefined } : s));
    const song = songs.find(s => s.id === songId);
    if (!song) return;

    try {
      let fileUrl = song.url;

      // If local file, upload to server first
      if (song.isLocal) {
        const blobRes = await fetch(song.url);
        const blob = await blobRes.blob();
        const formData = new FormData();
        formData.append('file', blob, song.filename);
        
        const uploadRes = await fetch('/vocalido/api/upload-audio', {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error);
        fileUrl = uploadData.url || song.url;
      }

      const res = await fetch('/vocalido/api/ai/separate-stems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: fileUrl, stems: stemCount })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const stems: { [key: string]: { url: string; title: string } } = {};
      for (const [name, url] of Object.entries(data.stems)) {
        stems[name] = {
          url: url as string,
          title: `${song.title} — ${name.charAt(0).toUpperCase() + name.slice(1)}`
        };
      }

      setSongs(prev => prev.map(s => s.id === songId ? { ...s, stems, isSeparating: false } : s));
    } catch (e: any) {
      console.error('Stem separation failed:', e);
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, isSeparating: false, separateError: e.message || 'Failed' } : s));
    }
  };

  // ── Save file to computer ──
  const handleSaveFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Open in TrackView ──
  const handleOpenInPlayer = (url: string, title: string) => {
    if (onOpenInPlayer) {
      onOpenInPlayer(url, title);
    }
    window.dispatchEvent(new CustomEvent('youtube_open_in_player', {
      detail: { url, title }
    }));
  };

  // ── Save all ──
  const handleSaveAll = () => {
    songs.forEach((song, i) => {
      setTimeout(() => handleSaveFile(song.url, song.filename), i * 300);
    });
  };

  // ── Remove song ──
  const handleRemoveSong = (id: string) => {
    setSongs(prev => prev.filter(s => s.id !== id));
  };

  // ── Drag & drop handlers ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const linkCount = ytInput.trim() ? ytInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length : 0;

  return (
    <div 
      className="absolute inset-0 flex flex-col bg-[#050507] overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {/* ── Copyright Disclaimer Modal ── */}
      {!disclaimerAccepted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="max-w-lg w-full bg-[#0c0c10] border border-amber-500/20 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <AlertCircle size={20} className="text-amber-400" />
              </div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">ข้อกำหนดและเงื่อนไขการใช้งาน</h3>
            </div>

            <div className="space-y-3 text-[11px] text-zinc-400 leading-relaxed mb-6 max-h-[50vh] overflow-y-auto pr-2">
              <p className="text-zinc-300 font-semibold">
                กรุณาอ่านและยอมรับเงื่อนไขก่อนใช้งานบริการดาวน์โหลดและวิเคราะห์เสียง
              </p>

              <div className="space-y-2 border-l-2 border-amber-500/30 pl-3">
                <p>
                  <strong className="text-amber-400">1. วัตถุประสงค์เพื่อการศึกษา:</strong>{' '}
                  บริการนี้จัดทำขึ้นเพื่อวัตถุประสงค์ทางการศึกษา การวิเคราะห์ทางดนตรี 
                  และการเรียนรู้ด้านการผลิตเสียงเท่านั้น (Educational & Research Purposes Only)
                </p>
                <p>
                  <strong className="text-amber-400">2. ความรับผิดชอบด้านลิขสิทธิ์:</strong>{' '}
                  เนื้อหาทั้งหมดที่นำเข้าผ่านบริการนี้อยู่ภายใต้ความคุ้มครองลิขสิทธิ์ของเจ้าของผลงานต้นฉบับ 
                  ผู้ใช้เป็นผู้รับผิดชอบแต่เพียงผู้เดียวในการตรวจสอบและปฏิบัติตามกฎหมายลิขสิทธิ์ที่เกี่ยวข้อง
                </p>
                <p>
                  <strong className="text-amber-400">3. ข้อห้ามการนำไปเผยแพร่:</strong>{' '}
                  ห้ามนำเนื้อหาที่ได้จากบริการนี้ไปใช้ในเชิงพาณิชย์ เผยแพร่ซ้ำ หรือแจกจ่ายโดยไม่ได้รับอนุญาต
                  จากเจ้าของลิขสิทธิ์ การกระทำดังกล่าวถือเป็นการละเมิดลิขสิทธิ์ตาม พ.ร.บ. ลิขสิทธิ์ พ.ศ. 2537
                </p>
                <p>
                  <strong className="text-amber-400">4. ข้อจำกัดความรับผิด:</strong>{' '}
                  Memolody เป็นเพียงผู้ให้บริการเครื่องมือทางเทคนิคเพื่อการศึกษา 
                  ไม่มีส่วนเกี่ยวข้องและไม่รับผิดชอบต่อการนำเนื้อหาไปใช้ในทางที่ผิดกฎหมายหรือละเมิดสิทธิ์ของผู้อื่น 
                  ความรับผิดชอบทั้งหมดตกอยู่กับผู้ใช้งาน
                </p>
                <p>
                  <strong className="text-amber-400">5. การยินยอม:</strong>{' '}
                  การกดปุ่ม &quot;ยอมรับ&quot; ถือว่าท่านได้อ่าน เข้าใจ และยินยอมปฏิบัติตามเงื่อนไขทั้งหมดข้างต้น
                </p>
              </div>

              <p className="text-[10px] text-zinc-600 italic mt-4">
                This service is provided solely for educational and music analysis purposes. 
                All content remains the intellectual property of its original copyright holders. 
                Users assume full legal responsibility for any use of the materials.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDisclaimerAccepted(true)}
                className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
              >
                ✅ ยอมรับเงื่อนไข
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drag overlay ── */}
      {isDragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm border-4 border-dashed border-emerald-500/50 rounded-2xl m-2 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Upload size={48} className="text-emerald-400 animate-bounce" />
            <p className="text-lg font-black text-emerald-400 uppercase tracking-widest">Drop audio files here</p>
            <p className="text-xs text-zinc-400">WAV, MP3, FLAC, OGG, M4A</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Youtube size={18} className="text-red-500" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Audio Studio</h2>
            <p className="text-[10px] text-zinc-500">Upload files or paste YouTube links • Analyze & separate stems</p>
          </div>
          {songs.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-500">{songs.length} song(s)</span>
              <button
                onClick={handleSaveAll}
                className="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all flex items-center gap-1.5"
              >
                <Download size={10} /> Save All
              </button>
            </div>
          )}
        </div>

        {/* ── Input Area: Upload + YouTube ── */}
        <div className="flex gap-3">
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 w-24 h-[86px] rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all flex flex-col items-center justify-center gap-1.5 group"
          >
            <Upload size={20} className="text-zinc-600 group-hover:text-emerald-400 transition-colors" />
            <span className="text-[8px] font-bold text-zinc-600 group-hover:text-emerald-400 uppercase tracking-widest transition-colors">Upload</span>
            <span className="text-[7px] text-zinc-700">WAV, MP3...</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleFileUpload(e.target.files)}
          />

          {/* YouTube URL input */}
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-1">
              <Link2 size={10} className="text-zinc-600" />
              <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">YouTube Links</span>
            </div>
            <textarea
              value={ytInput}
              onChange={e => setYtInput(e.target.value)}
              placeholder={"Paste YouTube links (one per line)...\nhttps://www.youtube.com/watch?v=..."}
              rows={3}
              disabled={isDownloading}
              className="flex-1 bg-black/60 border border-white/10 rounded-xl p-3 text-xs text-white font-mono placeholder-zinc-700 outline-none resize-none focus:border-red-500/30 transition-colors disabled:opacity-50"
            />
          </div>

          {/* Download button */}
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={handleDownload}
              disabled={isDownloading || !ytInput.trim()}
              className="flex-1 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-b from-red-500 to-red-600 text-white shadow-lg hover:shadow-red-500/30 hover:scale-105 transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-2 min-w-[130px]"
            >
              {isDownloading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {progress}
                </>
              ) : (
                <>
                  <Download size={14} />
                  Download {linkCount > 0 ? `(${linkCount})` : ''}
                </>
              )}
            </button>
            {linkCount > 0 && !isDownloading && (
              <span className="text-[9px] text-zinc-600 text-center">{linkCount} link(s) detected</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Song List ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {songs.length === 0 && !isDownloading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-30">
            <FileAudio size={48} className="text-zinc-600" />
            <p className="text-sm font-bold text-zinc-600 uppercase tracking-widest">No songs yet</p>
            <p className="text-[10px] text-zinc-700 text-center leading-relaxed">
              Drag & drop audio files here, click Upload,<br/>
              or paste YouTube links above
            </p>
          </div>
        )}

        {isDownloading && songs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin" />
            <p className="text-sm font-black text-white uppercase tracking-widest">Downloading {progress}</p>
          </div>
        )}

        {songs.map((song, index) => {
          const isExpanded = expandedId === song.id;
          return (
            <div key={song.id} className="bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all group">
              {/* ── Main Row ── */}
              <div className="flex items-center gap-4 px-5 py-3.5 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : song.id)}>
                <span className="text-[11px] font-black text-zinc-600 w-6 text-right shrink-0">{index + 1}</span>
                {song.isLocal ? (
                  <Upload size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <Music size={14} className="text-red-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-zinc-200 truncate">{song.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      song.isLocal 
                        ? 'text-emerald-400/70 bg-emerald-500/10' 
                        : 'text-red-400/70 bg-red-500/10'
                    }`}>
                      {song.filename.split('.').pop()?.toUpperCase() || 'WAV'}
                    </span>
                    <span className="text-[9px] text-zinc-500">{song.sampleRate.toLocaleString()} Hz</span>
                    <span className="text-[9px] text-zinc-600">•</span>
                    <span className="text-[9px] text-zinc-500">{song.bitDepth}-bit</span>
                    <span className="text-[9px] text-zinc-600">•</span>
                    <span className="text-[9px] text-zinc-500">{formatDuration(song.duration)}</span>
                    {song.fileSize > 0 && (
                      <>
                        <span className="text-[9px] text-zinc-600">•</span>
                        <span className="text-[9px] text-zinc-500">{formatFileSize(song.fileSize)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <button
                  onClick={e => { e.stopPropagation(); handleOpenInPlayer(song.url, song.title); }}
                  className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/30 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                  title="Open in Player"
                >
                  <Play size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleSaveFile(song.url, song.filename); }}
                  className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                  title="Save to computer"
                >
                  <Download size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleRemoveSong(song.id); }}
                  className="w-8 h-8 rounded-lg bg-white/5 text-zinc-600 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                  title="Remove"
                >
                  <X size={12} />
                </button>

                {isExpanded ? <ChevronUp size={14} className="text-zinc-600" /> : <ChevronDown size={14} className="text-zinc-600" />}
              </div>

              {/* ── Expanded: Stem Separation ── */}
              {isExpanded && (
                <div className="px-5 pb-4 pt-1 border-t border-white/5">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Scissors size={11} /> Stem Separation
                  </p>

                  {song.isSeparating && (
                    <div className="flex items-center gap-3 py-4">
                      <Loader2 size={16} className="animate-spin text-purple-400" />
                      <span className="text-xs text-zinc-400">Separating stems with AI (Demucs)... This may take a few minutes</span>
                    </div>
                  )}

                  {song.separateError && (
                    <div className="flex items-center gap-2 py-2 px-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-3">
                      <AlertCircle size={12} className="text-red-400 shrink-0" />
                      <span className="text-[10px] text-red-400">{song.separateError}</span>
                    </div>
                  )}

                  {!song.isSeparating && !song.stems && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStemSeparation(song.id, 2)}
                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 hover:text-white transition-all flex items-center gap-2"
                      >
                        <Scissors size={12} /> 2-Track (Vocals + Inst.)
                      </button>
                      <button
                        onClick={() => handleStemSeparation(song.id, 4)}
                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 hover:text-white transition-all flex items-center gap-2"
                      >
                        <Scissors size={12} /> 4-Track (Vocals, Drums, Bass, Other)
                      </button>
                    </div>
                  )}

                  {/* ── Stem Results ── */}
                  {song.stems && (
                    <div className="space-y-1.5 mt-2">
                      {Object.entries(song.stems).map(([stemName, stemData]) => (
                        <div key={stemName} className="flex items-center gap-3 bg-white/[0.04] border border-white/5 rounded-xl px-4 py-2.5 group/stem hover:bg-white/[0.07] transition-all">
                          <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                          <span className="text-[10px] font-bold text-zinc-300 flex-1 capitalize">{stemData.title}</span>
                          <button
                            onClick={() => handleOpenInPlayer(stemData.url, stemData.title)}
                            className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/30 hover:text-white transition-all opacity-0 group-hover/stem:opacity-100"
                            title="Open in Player"
                          >
                            <Play size={11} />
                          </button>
                          <button
                            onClick={() => handleSaveFile(stemData.url, `${stemName}.wav`)}
                            className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 hover:text-white transition-all opacity-0 group-hover/stem:opacity-100"
                            title="Save"
                          >
                            <Download size={11} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setSongs(prev => prev.map(s => s.id === song.id ? { ...s, stems: undefined } : s))}
                        className="text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
                      >
                        Re-separate with different options
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default YouTubeStudioPage;
