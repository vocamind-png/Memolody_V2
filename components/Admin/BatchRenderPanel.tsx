import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mic, Play, Pause, Square, RotateCcw, CheckCircle2, XCircle, Clock, Loader2, Sparkles, Copy, Search, Plus, X, ClipboardPaste, Zap, ArrowUpDown, ChevronDown } from 'lucide-react';
import { batchRenderService, BatchRenderProgress, isSongFullyRendered, getSongRenderedKeyCount, getSongRenderedKeys, fetchCloudRenderStatusBulk, fetchAllCloudRenderedSongsFull, CloudRenderedSong } from '../../lib/BatchRenderService';
import { songStorage } from '../../lib/SongStorage';
import { getClassicalRank } from '../../lib/classicalRanking';
import { Song } from '../../types';

interface SongEntry {
  song: Song;
  xmlData: string;
  rank: number;
}

const TRANSPOSE_RANGE = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}



type TabMode = 'top_chart' | 'paste_id' | 'search';

const BatchRenderPanel: React.FC = () => {
  const [allSongs, setAllSongs] = useState<{ song: Song; xmlData: string }[]>([]);
  const [topSongs, setTopSongs] = useState<SongEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<BatchRenderProgress | null>(null);
  const [songCount, setSongCount] = useState(5);
  const [tabMode, setTabMode] = useState<TabMode>('top_chart');
  
  // Paste ID state
  const [pasteInput, setPasteInput] = useState('');
  const [selectedSongs, setSelectedSongs] = useState<{ song: Song; xmlData: string }[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter & Sort state
  type RenderFilter = 'all' | 'rendered' | 'partial' | 'not_rendered';
  type SortField = 'rank' | 'title' | 'artist' | 'grade' | 'era' | 'genre';
  const [renderFilter, setRenderFilter] = useState<RenderFilter>('all');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState('');
  // Cloud-rendered songs fetched directly from Supabase
  const [cloudRenderedSongs, setCloudRenderedSongs] = useState<CloudRenderedSong[]>([]);
  const [cloudLoading, setCloudLoading] = useState(true);



  // Load all songs from library
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const songs = await songStorage.getAllSongs();
        const all = songs.map(entry => ({ song: entry.metadata, xmlData: entry.xmlData }));
        
        const ranked: SongEntry[] = [];
        for (const entry of songs) {
          const meta = entry.metadata;
          const rank = getClassicalRank(meta.artist || '', meta.title || '');
          if (rank < 999) {
            ranked.push({ song: meta, xmlData: entry.xmlData, rank });
          }
        }
        setAllSongs(all);
        ranked.sort((a, b) => a.rank - b.rank);
        setTopSongs(ranked);
      } catch (err) {
        console.error('[BatchRender] Failed to load songs:', err);
      }
      setLoading(false);
    })();
  }, []);

  // Fetch cloud rendered songs directly from Supabase
  useEffect(() => {
    setCloudLoading(true);
    fetchAllCloudRenderedSongsFull()
      .then(songs => {
        setCloudRenderedSongs(songs);
        setCloudLoading(false);
      })
      .catch(() => setCloudLoading(false));
  }, []);

  // Fetch cloud render status for locally-known songs
  // fetchCloudRenderStatusBulk removed to prevent rate limiting, fetchAllCloudRenderedSongsFull is sufficient.

  // Merge cloud renders into local song render status
  // (local songs whose ID matches song_<cloudId> or exact cloudId)
  const effectivelyRenderedIds = useMemo(() => {
    const set = new Set<string>();
    for (const cs of cloudRenderedSongs) {
      if (cs.fullyRendered) {
        set.add(cs.songId);
        set.add('song_' + cs.songId);
      }
    }
    return set;
  }, [cloudRenderedSongs]);

  const getEffectiveKeyCount = useCallback((songId: string): number => {
    // Check local cache
    const local = getSongRenderedKeyCount(songId);
    if (local >= 12) return local;
    // Check cloud by exact or prefixed ID
    const normId = songId.replace(/^song_/, '');
    const cs = cloudRenderedSongs.find(c => c.songId.replace(/^song_/, '') === normId);
    if (cs) return Math.max(local, cs.keys.length);
    return local;
  }, [cloudRenderedSongs]);

  const getEffectiveKeys = useCallback((songId: string): number[] => {
    const local = getSongRenderedKeys(songId);
    if (local.length >= 12) return local;
    const normId = songId.replace(/^song_/, '');
    const cs = cloudRenderedSongs.find(c => c.songId.replace(/^song_/, '') === normId);
    if (!cs) return local;
    const merged = new Set([...local, ...cs.keys]);
    return Array.from(merged).sort((a, b) => a - b);
  }, [cloudRenderedSongs]);

  const isEffectivelyFullyRendered = useCallback((songId: string): boolean => {
    if (isSongFullyRendered(songId)) return true;
    if (effectivelyRenderedIds.has(songId)) return true;
    return getEffectiveKeyCount(songId) >= 12;
  }, [effectivelyRenderedIds, getEffectiveKeyCount]);

  useEffect(() => {
    const unsub = batchRenderService.subscribe(setProgress);
    return unsub;
  }, []);

  // Get songs to render based on mode
  const getSongsToRender = useCallback((): { song: Song; xmlData: string }[] => {
    if (tabMode === 'top_chart') {
      return topSongs.slice(0, songCount).map(s => ({ song: s.song, xmlData: s.xmlData }));
    }
    return selectedSongs;
  }, [tabMode, topSongs, songCount, selectedSongs]);

  const [serverSide, setServerSide] = useState(true);

  const handleStart = useCallback(() => {
    const songs = getSongsToRender();
    if (!songs.length) return;
    if (serverSide) {
      // Server-side: just send song IDs, server handles everything locally on GPU
      const songIds = songs.map(s => s.song.id);
      batchRenderService.startServerSide(songIds);
    } else {
      // Client-side: browser orchestrates each render through the proxy
      batchRenderService.buildQueue(songs, TRANSPOSE_RANGE);
      batchRenderService.start(songs);
    }
  }, [getSongsToRender, serverSide]);

  // Add song by ID
  const handleAddById = useCallback(() => {
    const ids = pasteInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const added: { song: Song; xmlData: string }[] = [];
    for (const id of ids) {
      const found = allSongs.find(s => s.song.id === id || s.song.title?.toLowerCase().includes(id.toLowerCase()));
      if (found && !selectedSongs.some(s => s.song.id === found.song.id)) {
        added.push(found);
      }
    }
    setSelectedSongs(prev => [...prev, ...added]);
    setPasteInput('');
  }, [pasteInput, allSongs, selectedSongs]);

  const handleRemoveSelected = (id: string) => {
    setSelectedSongs(prev => prev.filter(s => s.song.id !== id));
  };

  const handleAddFromSearch = (song: { song: Song; xmlData: string }) => {
    if (!selectedSongs.some(s => s.song.id === song.song.id)) {
      setSelectedSongs(prev => [...prev, song]);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Search filter
  const searchResults = searchQuery.length >= 2
    ? allSongs.filter(s => {
        const q = searchQuery.toLowerCase();
        return (s.song.title?.toLowerCase().includes(q) || s.song.artist?.toLowerCase().includes(q) || s.song.id?.toLowerCase().includes(q));
      }).slice(0, 20)
    : [];

  const isRunning = progress?.isRunning || false;
  const isPaused = progress?.isPaused || false;
  const totalJobs = progress?.total || 0;
  const completedJobs = progress?.completed || 0;
  const errorJobs = progress?.errors || 0;
  const skippedJobs = progress?.skipped || 0;
  const pct = totalJobs > 0 ? Math.round(((completedJobs + skippedJobs) / totalJobs) * 100) : 0;
  const songsToRender = getSongsToRender();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-fuchsia-400" />
            <span className="text-[9px] font-black text-fuchsia-400 uppercase tracking-[0.3em]">Batch Vocal Render</span>
          </div>
          <p className="text-[10px] text-zinc-500">
            Render songs × 12 keys (-5 to +6) using Vocalido AI · Library: {allSongs.length.toLocaleString()} songs
          </p>
        </div>
      </div>

      {/* Mode Tabs */}
      {!isRunning && (
        <div className="flex gap-1 bg-white/[0.02] p-1 rounded-xl border border-white/5">
          {[
            { id: 'top_chart' as TabMode, label: 'Top Chart', icon: Sparkles },
            { id: 'paste_id' as TabMode, label: 'Paste Song ID', icon: ClipboardPaste },
            { id: 'search' as TabMode, label: 'Search & Add', icon: Search },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setTabMode(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all
                ${tabMode === tab.id ? 'bg-white/10 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab Content */}
      {!isRunning && tabMode === 'top_chart' && (
        <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Top Chart Songs</span>
            <span className="text-lg font-black text-white">{songCount}</span>
          </div>
          <input type="range" min={1} max={Math.min(topSongs.length || 1, 20)} value={songCount} onChange={e => setSongCount(Number(e.target.value))} className="w-full accent-fuchsia-500" />
          <div className="flex justify-between text-[8px] text-zinc-600 font-bold">
            <span>1 song</span>
            <span>{Math.min(topSongs.length, 20)} songs</span>
          </div>
        </div>
      )}

      {!isRunning && tabMode === 'paste_id' && (
        <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-4">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Paste Song IDs (one per line or comma-separated)</span>
          <div className="flex gap-2">
            <textarea
              value={pasteInput}
              onChange={e => setPasteInput(e.target.value)}
              placeholder="Paste song IDs here..."
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder:text-zinc-700 resize-none h-20 focus:outline-none focus:border-fuchsia-500/50"
            />
            <button
              onClick={handleAddById}
              disabled={!pasteInput.trim()}
              className="px-4 bg-fuchsia-500/20 border border-fuchsia-500/30 rounded-xl text-fuchsia-400 text-xs font-black uppercase hover:bg-fuchsia-500/30 transition-all disabled:opacity-30"
            >
              <Plus size={16} />
            </button>
          </div>
          {/* Selected songs */}
          {selectedSongs.length > 0 && (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto no-scrollbar">
              {selectedSongs.map(entry => (
                <div key={entry.song.id} className="flex items-center gap-2 px-3 py-2 bg-fuchsia-500/5 border border-fuchsia-500/10 rounded-lg">
                  <span className="text-[10px] font-bold text-white flex-1 truncate">{entry.song.title}</span>
                  <span className="text-[8px] text-zinc-500 font-mono truncate max-w-[120px]">{entry.song.id}</span>
                  <button onClick={() => handleCopyId(entry.song.id)} className="text-zinc-500 hover:text-cyan-400 transition-colors" title="Copy ID">
                    {copiedId === entry.song.id ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>

                  <button onClick={() => handleRemoveSelected(entry.song.id)} className="text-zinc-500 hover:text-rose-400 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isRunning && tabMode === 'search' && (
        <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-4">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Search Library ({allSongs.length.toLocaleString()} songs)</span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by title, artist, or ID..."
              className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/50"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-[250px] overflow-y-auto no-scrollbar">
              {searchResults.map(entry => {
                const isAdded = selectedSongs.some(s => s.song.id === entry.song.id);
                return (
                  <div key={entry.song.id} className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg hover:bg-white/[0.05] transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-white truncate">{entry.song.title}</div>
                      <div className="text-[8px] text-zinc-500 truncate">{entry.song.artist}</div>
                    </div>
                    <button onClick={() => handleCopyId(entry.song.id)} className="text-zinc-500 hover:text-cyan-400 transition-colors shrink-0" title="Copy ID">
                      {copiedId === entry.song.id ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>

                    <button
                      onClick={() => handleAddFromSearch(entry)}
                      disabled={isAdded}
                      className={`px-2 py-1 rounded text-[8px] font-black uppercase shrink-0 transition-all ${isAdded ? 'bg-emerald-500/20 text-emerald-400' : 'bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30'}`}
                    >
                      {isAdded ? '✓ Added' : '+ Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Show selected count */}
          {selectedSongs.length > 0 && (
            <div className="text-[9px] font-bold text-fuchsia-400 pt-2 border-t border-white/5">
              {selectedSongs.length} songs selected for batch render
            </div>
          )}
        </div>
      )}



      {/* Summary Stats */}
      {!isRunning && songsToRender.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#111115] border border-white/5 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-white">{songsToRender.length * 12}</div>
            <div className="text-[8px] text-zinc-500 font-bold uppercase">Total Renders</div>
          </div>
          <div className="bg-[#111115] border border-white/5 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-cyan-400">~{Math.round(songsToRender.length * 12 * 3.5 / 60)}h</div>
            <div className="text-[8px] text-zinc-500 font-bold uppercase">Est. Time</div>
          </div>
          <div className="bg-[#111115] border border-white/5 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-emerald-400">${(songsToRender.length * 12 * 3.5 / 60 * 0.27).toFixed(2)}</div>
            <div className="text-[8px] text-zinc-500 font-bold uppercase">GPU Cost</div>
          </div>
        </div>
      )}

      {/* Render Mode Toggle */}
      {!isRunning && (
        <div className="flex items-center gap-3 bg-[#111115] border border-white/5 rounded-2xl p-3">
          <button
            onClick={() => setServerSide(true)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              serverSide
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Zap size={14} /> Server-Side (10x Fast)
          </button>
          <button
            onClick={() => setServerSide(false)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              !serverSide
                ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-lg shadow-fuchsia-500/20'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Mic size={14} /> Client-Side
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {!isRunning ? (
          <button
            onClick={handleStart}
            disabled={loading || songsToRender.length === 0}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30 ${
              serverSide
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20'
                : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500'
            }`}
          >
            {serverSide ? <Zap size={16} /> : <Play size={16} />}
            {serverSide ? `⚡ Server Render (${songsToRender.length} songs)` : `Start Batch Render (${songsToRender.length} songs)`}
          </button>
        ) : (
          <>
            {!serverSide && (
              <button
                onClick={() => isPaused ? batchRenderService.resume() : batchRenderService.pause()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-amber-500/20 border border-amber-500/30 rounded-2xl text-amber-400 text-xs font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all active:scale-95"
              >
                {isPaused ? <><Play size={16} /> Resume</> : <><Pause size={16} /> Pause</>}
              </button>
            )}
            <button
              onClick={() => batchRenderService.stop()}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-rose-500/20 border border-rose-500/30 rounded-2xl text-rose-400 text-xs font-black uppercase tracking-widest hover:bg-rose-500/30 transition-all active:scale-95"
            >
              <Square size={16} /> Stop
            </button>
          </>
        )}
      </div>

      {/* Progress */}
      {progress && totalJobs > 0 && (
        <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Progress</span>
            <span className="text-sm font-black text-white">{completedJobs + skippedJobs}/{totalJobs} ({pct}%)</span>
          </div>
          <div className="h-3 bg-black/50 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-400" /><span className="text-[9px] font-bold text-emerald-400">{completedJobs}</span></div>
            <div className="flex items-center gap-1.5"><RotateCcw size={12} className="text-zinc-500" /><span className="text-[9px] font-bold text-zinc-500">{skippedJobs} skip</span></div>
            <div className="flex items-center gap-1.5"><XCircle size={12} className="text-rose-400" /><span className="text-[9px] font-bold text-rose-400">{errorJobs} err</span></div>
            <div className="flex items-center gap-1.5"><Clock size={12} className="text-cyan-400" /><span className="text-[9px] font-bold text-cyan-400">{formatTime(progress.elapsedMs)}</span></div>
          </div>
          {progress.statusText && (
            <div className="flex items-center gap-2 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl px-4 py-3">
              {isRunning && !isPaused && <Loader2 size={14} className="text-fuchsia-400 animate-spin" />}
              <span className="text-[10px] font-bold text-fuchsia-300">{progress.statusText}</span>
            </div>
          )}
          {isRunning && progress.estimatedRemainingMs > 0 && (
            <div className="text-[9px] text-zinc-500 font-bold text-center">Estimated remaining: {formatTime(progress.estimatedRemainingMs)}</div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Song Library — Filter, Sort, Search, Scroll                  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        {/* Header with count */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
            {loading ? 'Loading...' : tabMode === 'top_chart' ? `${topSongs.length.toLocaleString()} Classical Songs` : `${selectedSongs.length} Selected Songs`}
          </span>
        </div>

        {/* ── Filter Chips ── */}
        {(() => {
          const allEntries = tabMode === 'top_chart' ? topSongs : selectedSongs;
          const countRendered = allEntries.filter(e => {
            const s = 'rank' in e ? (e as SongEntry).song : (e as { song: Song; xmlData: string }).song;
            return isEffectivelyFullyRendered(s.id);
          }).length;
          const countPartial = allEntries.filter(e => {
            const s = 'rank' in e ? (e as SongEntry).song : (e as { song: Song; xmlData: string }).song;
            const kc = getEffectiveKeyCount(s.id);
            return kc > 0 && !isEffectivelyFullyRendered(s.id);
          }).length;
          const countNone = allEntries.length - countRendered - countPartial;
          const filters: { id: RenderFilter; label: string; count: number; color: string; activeColor: string }[] = [
            { id: 'all', label: 'All', count: allEntries.length, color: 'text-zinc-400', activeColor: 'bg-white/10 text-white' },
            { id: 'rendered', label: '✅ Rendered', count: countRendered, color: 'text-emerald-500', activeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
            { id: 'partial', label: '🟠 Partial', count: countPartial, color: 'text-amber-500', activeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
            { id: 'not_rendered', label: '⬜ Not Rendered', count: countNone, color: 'text-zinc-500', activeColor: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
          ];
          return (
            <div className="flex flex-wrap gap-1.5">
              {filters.map(f => (
                <button
                  key={f.id}
                  onClick={() => setRenderFilter(f.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                    renderFilter === f.id
                      ? f.activeColor
                      : 'border-transparent text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {f.label}
                  <span className={`text-[8px] font-mono ${renderFilter === f.id ? 'opacity-80' : 'opacity-50'}`}>({f.count})</span>
                </button>
              ))}
            </div>
          );
        })()}

        {/* ── Sort & Search Bar ── */}
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.03] border border-white/5 rounded-lg text-[9px] font-black text-zinc-400 uppercase tracking-widest hover:text-zinc-200 transition-all"
            >
              <ArrowUpDown size={11} />
              {sortField === 'rank' ? 'Rank' : sortField === 'title' ? 'Title' : sortField === 'artist' ? 'Composer' : sortField === 'grade' ? 'Grade' : sortField === 'era' ? 'Era' : 'Style'}
              <ChevronDown size={10} className={`transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSortMenu && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-900 border border-white/10 rounded-xl p-1 z-50 min-w-[160px] shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                {([
                  { id: 'rank' as SortField, label: '🏆 Rank (Classical)' },
                  { id: 'title' as SortField, label: '🎵 Title' },
                  { id: 'artist' as SortField, label: '🎼 Composer / Artist' },
                  { id: 'grade' as SortField, label: '📊 Grade' },
                  { id: 'era' as SortField, label: '📅 Era / Year' },
                  { id: 'genre' as SortField, label: '🎭 Style / Genre' },
                ] as { id: SortField; label: string }[]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (sortField === opt.id) { setSortAsc(!sortAsc); }
                      else { setSortField(opt.id); setSortAsc(true); }
                      setShowSortMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                      sortField === opt.id ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {opt.label} {sortField === opt.id ? (sortAsc ? '↑' : '↓') : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Toggle sort direction */}
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="px-2 py-2 bg-white/[0.03] border border-white/5 rounded-lg text-[9px] font-black text-zinc-500 hover:text-zinc-200 transition-all"
            title={sortAsc ? 'Ascending' : 'Descending'}
          >
            {sortAsc ? '↑ A-Z' : '↓ Z-A'}
          </button>
          {/* Quick search in list */}
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              value={listSearchQuery}
              onChange={e => setListSearchQuery(e.target.value)}
              placeholder="Filter by title, artist, genre..."
              className="w-full bg-white/[0.03] border border-white/5 rounded-lg pl-8 pr-3 py-2 text-[10px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-fuchsia-500/30"
            />
            {listSearchQuery && (
              <button onClick={() => setListSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* ── Filtered & Sorted Song List ── */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={24} className="text-fuchsia-400 animate-spin" /></div>
        ) : (() => {
          // Build filtered + sorted list
          const baseEntries = tabMode === 'top_chart' ? topSongs : selectedSongs;
          let filtered = baseEntries.map((entry, idx) => {
            const song = 'rank' in entry ? (entry as SongEntry).song : (entry as { song: Song; xmlData: string }).song;
            const rank = 'rank' in entry ? (entry as SongEntry).rank : idx + 1;
            const keyCount = getEffectiveKeyCount(song.id);
            const fullyRendered = isEffectivelyFullyRendered(song.id);
            return { song, rank, keyCount, fullyRendered, entry };
          });

          // Apply render filter
          if (renderFilter === 'rendered') filtered = filtered.filter(f => f.fullyRendered);
          else if (renderFilter === 'partial') filtered = filtered.filter(f => f.keyCount > 0 && !f.fullyRendered);
          else if (renderFilter === 'not_rendered') filtered = filtered.filter(f => f.keyCount === 0);

          // Apply search
          if (listSearchQuery.length >= 2) {
            const q = listSearchQuery.toLowerCase();
            filtered = filtered.filter(f =>
              f.song.title?.toLowerCase().includes(q) ||
              f.song.artist?.toLowerCase().includes(q) ||
              f.song.composer?.toLowerCase().includes(q) ||
              f.song.genre?.toLowerCase().includes(q) ||
              f.song.era?.toLowerCase().includes(q) ||
              f.song.category?.toLowerCase().includes(q) ||
              f.song.difficultyGrade?.toLowerCase().includes(q) ||
              f.song.id?.toLowerCase().includes(q)
            );
          }

          // Apply sort
          const dir = sortAsc ? 1 : -1;
          filtered.sort((a, b) => {
            switch (sortField) {
              case 'rank': return (a.rank - b.rank) * dir;
              case 'title': return (a.song.title || '').localeCompare(b.song.title || '') * dir;
              case 'artist': return ((a.song.composer || a.song.artist || '')).localeCompare((b.song.composer || b.song.artist || '')) * dir;
              case 'grade': return (a.song.difficultyGrade || a.song.difficulty || 'Z').localeCompare(b.song.difficultyGrade || b.song.difficulty || 'Z') * dir;
              case 'era': return (a.song.era || a.song.year || '9999').localeCompare(b.song.era || b.song.year || '9999') * dir;
              case 'genre': return (a.song.genre || a.song.category || 'Z').localeCompare(b.song.genre || b.song.category || 'Z') * dir;
              default: return 0;
            }
          });

          return (
            <>
              {/* Result count */}
              <div className="text-[9px] font-bold text-zinc-600">
                Showing {filtered.length} of {baseEntries.length} songs
              </div>

              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto no-scrollbar pb-20">
                {filtered.map(({ song, rank, keyCount, fullyRendered }) => {
                  const renderedKeys = getEffectiveKeys(song.id);
                  const pctRendered = Math.round((keyCount / 12) * 100);

                  return (
                    <div key={song.id} className={`rounded-xl border transition-all overflow-hidden ${fullyRendered ? 'bg-emerald-500/5 border-emerald-500/20' : keyCount > 0 ? 'bg-amber-500/5 border-amber-500/10' : 'bg-white/[0.02] border-white/5'}`}>
                      {/* Row 1: Rank + Full Title + Status */}
                      <div className="flex items-start gap-3 px-4 pt-3 pb-1">
                        <div className="relative shrink-0">
                          <div className={`w-16 h-10 rounded-xl flex items-center justify-center ${fullyRendered ? 'bg-emerald-500/20' : 'bg-fuchsia-500/20'}`}>
                            <span className={`text-xs font-black ${fullyRendered ? 'text-emerald-400' : 'text-fuchsia-400'}`}>#{rank}</span>
                          </div>
                          {fullyRendered && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                              <CheckCircle2 size={10} className="text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white leading-tight break-words">{song.title}</span>
                            {fullyRendered && (
                              <span className="flex items-center gap-0.5 px-2 py-0.5 bg-emerald-500/20 rounded-full shrink-0 mt-0.5">
                                <Sparkles size={9} className="text-emerald-400" />
                                <span className="text-[8px] font-black text-emerald-400">AI READY</span>
                              </span>
                            )}
                            {!fullyRendered && keyCount > 0 && (
                              <span className="flex items-center gap-0.5 px-2 py-0.5 bg-amber-500/20 rounded-full shrink-0 mt-0.5">
                                <span className="text-[8px] font-black text-amber-400">{keyCount}/12</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Row 2: Artist + Metadata badges + Keys + Actions */}
                      <div className="flex items-center gap-1.5 px-4 pb-2 pt-0.5 flex-wrap">
                        <span className="text-[10px] text-zinc-500 truncate max-w-[130px]">{song.composer || song.artist}</span>
                        {/* Metadata badges */}
                        {song.difficultyGrade && (
                          <span className="px-1.5 py-0.5 bg-indigo-500/10 rounded text-[7px] font-black text-indigo-400 uppercase">{song.difficultyGrade}</span>
                        )}
                        {(song.era || song.year) && (
                          <span className="px-1.5 py-0.5 bg-cyan-500/10 rounded text-[7px] font-black text-cyan-400">{song.era || song.year}</span>
                        )}
                        {(song.genre || song.category) && (
                          <span className="px-1.5 py-0.5 bg-fuchsia-500/10 rounded text-[7px] font-black text-fuchsia-400">{song.genre || song.category}</span>
                        )}
                        <div className="flex-1" />
                        {/* 12-Key progress dots */}
                        <div className="flex gap-[3px] shrink-0">
                          {TRANSPOSE_RANGE.map(tp => (
                            <div
                              key={tp}
                              className={`w-2 h-2 rounded-[3px] transition-colors ${renderedKeys.includes(tp) ? 'bg-emerald-500 shadow-sm shadow-emerald-500/30' : 'bg-white/[0.06]'}`}
                              title={`Key ${tp >= 0 ? '+' : ''}${tp}${renderedKeys.includes(tp) ? ' ✓' : ''}`}
                            />
                          ))}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleCopyId(song.id); }} className="text-zinc-600 hover:text-cyan-400 transition-colors shrink-0 ml-1" title="Copy Song ID">
                          {copiedId === song.id ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        </button>

                      </div>
                      {/* Progress bar */}
                      {keyCount > 0 && !fullyRendered && (
                        <div className="h-[2px] bg-black/30">
                          <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500" style={{ width: `${pctRendered}%` }} />
                        </div>
                      )}
                      {fullyRendered && <div className="h-[2px] bg-emerald-500/40" />}
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="text-center py-10 text-zinc-600 text-xs font-bold">No songs match this filter</div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Cloud Rendered Songs (direct from Supabase) ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">☁️ Cloud Rendered Songs</span>
          {cloudLoading && <Loader2 size={12} className="text-emerald-400 animate-spin" />}
          {!cloudLoading && (
            <span className="text-[8px] text-zinc-600 font-mono">{cloudRenderedSongs.filter(s => s.fullyRendered).length} fully rendered · {cloudRenderedSongs.filter(s => !s.fullyRendered).length} partial</span>
          )}
        </div>
        <div className="space-y-2">
          {cloudRenderedSongs.length === 0 && !cloudLoading && (
            <div className="text-center py-6 text-zinc-600 text-xs">No cloud renders found in Supabase</div>
          )}
          {cloudRenderedSongs.map(cs => {
            // Try to find matching local song
            const localMatch = allSongs.find(s =>
              s.song.id === cs.songId ||
              s.song.id === 'song_' + cs.songId ||
              s.song.id.replace(/^song_/, '') === cs.songId
            );
            const title = localMatch?.song.title || cs.titleHint || cs.songId.substring(0, 16) + '...';
            const artist = localMatch?.song.composer || localMatch?.song.artist || cs.voice || '';

            return (
              <div key={cs.songId} className={`rounded-xl border transition-all overflow-hidden ${
                cs.fullyRendered ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/10'
              }`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    cs.fullyRendered ? 'bg-emerald-500/20' : 'bg-amber-500/20'
                  }`}>
                    {cs.fullyRendered
                      ? <CheckCircle2 size={16} className="text-emerald-400" />
                      : <span className="text-[9px] font-black text-amber-400">{cs.keys.length}/12</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white truncate">{title}</span>
                      {cs.fullyRendered && (
                        <span className="flex items-center gap-0.5 px-2 py-0.5 bg-emerald-500/20 rounded-full shrink-0">
                          <Sparkles size={9} className="text-emerald-400" />
                          <span className="text-[8px] font-black text-emerald-400">AI READY</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {artist && <span className="text-[10px] text-zinc-500 truncate">{artist}</span>}
                      <span className="px-1.5 py-0.5 bg-cyan-500/10 rounded text-[7px] font-black text-cyan-400 uppercase">{cs.voice}</span>
                    </div>
                  </div>
                  {/* 12-Key dots */}
                  <div className="flex gap-[3px] shrink-0">
                    {TRANSPOSE_RANGE.map(tp => (
                      <div
                        key={tp}
                        className={`w-2 h-2 rounded-[3px] transition-colors ${
                          cs.keys.includes(tp) ? 'bg-emerald-500 shadow-sm shadow-emerald-500/30' : 'bg-white/[0.06]'
                        }`}
                        title={`Key ${tp >= 0 ? '+' : ''}${tp}${cs.keys.includes(tp) ? ' ✓' : ''}`}
                      />
                    ))}
                  </div>
                  <button onClick={() => handleCopyId(cs.songId)} className="text-zinc-600 hover:text-cyan-400 transition-colors shrink-0" title="Copy ID">
                    {copiedId === cs.songId ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
                {!cs.fullyRendered && (
                  <div className="h-[2px] bg-black/30">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all" style={{ width: `${Math.round((cs.keys.length / 12) * 100)}%` }} />
                  </div>
                )}
                {cs.fullyRendered && <div className="h-[2px] bg-emerald-500/40" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BatchRenderPanel;
