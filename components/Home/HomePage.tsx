
import React, { useMemo, useState, useEffect, useCallback, useRef, memo } from 'react';
import { Sparkles, Mic, MessageSquare, Waves, ChevronRight, Music2, Play, Search, X, Database, SortAsc, RefreshCcw, Loader2, Plus, RotateCcw, Trash2, ChevronDown } from 'lucide-react';
import { Song, ViewId } from '../../types';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';
import { songStorage } from '../../lib/SongStorage';

interface HomePageProps {
  onSongSelect: (song: Song, xml?: string, mode?: 'listen' | 'studio') => void;
  userLibrary: { metadata: Song, xmlData: string }[];
  onEnterStudio: () => void;
  onViewVault: () => void;
  onSearch: (query: string) => void;
  performanceMode?: boolean;
  onToggleDelete: (id: string, isDeleted: boolean) => void;
  onPermanentDelete: (id: string) => void;
  onRefresh: () => void;
  isSyncing?: boolean;
}

type SortMode = 'default' | 'az' | 'za' | 'newest' | 'oldest';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const PAGE_SIZE = 50;

// ── Shared Song Row for the Matrix ──
const SongRow = memo(({ item, onSongSelect, onToggleDelete, onPermanentDelete, isTrashMode }: any) => {
  const durMin = Math.floor((item.metadata.duration || 0) / 60);
  const durSec = Math.floor((item.metadata.duration || 0) % 60);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer group active:bg-white/[0.05]"
      onClick={() => !isTrashMode && onSongSelect(item.metadata, item.xmlData, 'listen')}
    >
      <div className="w-9 h-9 rounded-xl bg-white/[0.03] flex items-center justify-center shrink-0 group-hover:bg-cyan-500/10 transition-colors">
        <Play size={11} className="text-zinc-600 group-hover:text-cyan-400 fill-current" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-white uppercase italic truncate group-hover:text-cyan-400 transition-colors duration-75">
          {item.metadata.title}
        </p>
        <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest truncate">
          {item.metadata.artist || 'Unknown Maestro'}
        </p>
      </div>
      <span className="text-[9px] text-zinc-700 font-mono tabular-nums shrink-0">
        {durMin}:{durSec.toString().padStart(2, '0')}
      </span>
      {isTrashMode ? (
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onToggleDelete(item.metadata.id, false); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-700 hover:text-emerald-400">
            <RotateCcw size={12} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onPermanentDelete(item.metadata.id); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-700 hover:text-rose-400">
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <ChevronRight size={14} className="text-zinc-800 group-hover:text-cyan-500 shrink-0" />
      )}
    </div>
  );
});

const HomePage: React.FC<HomePageProps> = ({
  onSongSelect, userLibrary = [], onEnterStudio, onViewVault, onSearch,
  performanceMode, onToggleDelete, onPermanentDelete, onRefresh, isSyncing
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'matrix' | 'trash'>('matrix');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showImport, setShowImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter & Logic
  const filteredLibrary = useMemo(() => {
    let list = activeTab === 'matrix'
      ? userLibrary.filter(item => !item.metadata.isDeleted)
      : userLibrary.filter(item => item.metadata.isDeleted);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.metadata.title.toLowerCase().includes(q) ||
        i.metadata.artist.toLowerCase().includes(q)
      );
    }

    switch (sortMode) {
      case 'az': list.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title)); break;
      case 'za': list.sort((a, b) => b.metadata.title.localeCompare(a.metadata.title)); break;
      case 'newest': list.sort((a, b) => {
        const ad = a.metadata.createdAt ? new Date(a.metadata.createdAt).getTime() : 0;
        const bd = b.metadata.createdAt ? new Date(b.metadata.createdAt).getTime() : 0;
        return bd - ad;
      }); break;
      case 'oldest': list.sort((a, b) => {
        const ad = a.metadata.createdAt ? new Date(a.metadata.createdAt).getTime() : 0;
        const bd = b.metadata.createdAt ? new Date(b.metadata.createdAt).getTime() : 0;
        return ad - bd;
      }); break;
      default: list.reverse(); break;
    }
    return list;
  }, [userLibrary, searchQuery, activeTab, sortMode]);

  const recentSongs = useMemo(() => userLibrary.filter(it => !it.metadata.isDeleted).reverse().slice(0, 5), [userLibrary]);
  const visibleItems = useMemo(() => filteredLibrary.slice(0, visibleCount), [filteredLibrary, visibleCount]);
  const hasMore = visibleCount < filteredLibrary.length;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300 && hasMore) {
      setVisibleCount(prev => prev + PAGE_SIZE);
    }
  }, [hasMore]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setShowImport(false);
    try {
      for (let i = 0; i < files.length; i++) {
        const { metadata, xmlData } = await parseMusicXMLMetadata(files[i]);
        metadata.origin = 'load';
        await songStorage.saveSong(metadata, xmlData);
      }
      onRefresh();
    } catch { alert("Import failed."); }
  };

  return (
    <div className="h-full flex flex-col bg-[#0A0A0B] overflow-hidden select-none">
      
      {/* ── HEADER / SEARCH & RECENT (STATIC TOP) ── */}
      <div className="shrink-0 p-6 space-y-6 bg-gradient-to-b from-white/[0.02] to-transparent border-b border-white/5">
        
        {/* Brand/Hero */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-black text-white tracking-[0.4em] uppercase italic">MEMOLODY</h1>
          <p className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.3em]">Hear by Eye, Play by Ear</p>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-cyan-400 transition-colors" />
          <input
            type="text"
            placeholder="FIND YOUR MUSIC..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setSearchQuery(searchInput)}
            className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-10 text-[10px] font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800 transition-all uppercase"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearchQuery(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Recent Matrix (Horizontal Scroll) */}
        {recentSongs.length > 0 && (
          <div className="space-y-3">
             <div className="flex items-center justify-between px-1">
               <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest italic">Recent Matrix</span>
             </div>
             <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
               {recentSongs.map(item => (
                 <div key={item.metadata.id} onClick={() => onSongSelect(item.metadata, item.xmlData, 'listen')}
                    className="shrink-0 w-32 aspect-square rounded-2xl bg-white/[0.03] border border-white/5 p-3 flex flex-col justify-between hover:bg-white/[0.06] active:scale-95 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-cyan-400/10 flex items-center justify-center text-cyan-400"><Play size={12} fill="currentColor" /></div>
                    <p className="text-[9px] font-black text-white uppercase italic truncate">{item.metadata.title}</p>
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>

      {/* ── TOTAL MATRIX / VAULT (SCROLLABLE BOTTOM) ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Section Tabs & Sort */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
          <div className="flex items-center gap-4">
             <button onClick={() => setActiveTab('matrix')}
                className={`text-[10px] font-black uppercase tracking-widest italic transition-colors ${activeTab === 'matrix' ? 'text-cyan-400' : 'text-zinc-600'}`}>
               Matrix
             </button>
             <button onClick={() => setActiveTab('trash')}
                className={`text-[10px] font-black uppercase tracking-widest italic transition-colors ${activeTab === 'trash' ? 'text-rose-500' : 'text-zinc-600'}`}>
               Trash
             </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowSortDropdown(!showSortDropdown)}
               className="h-8 px-3 rounded-lg bg-white/[0.03] border border-white/5 flex items-center gap-1.5 text-[8px] font-black text-zinc-500 uppercase">
              <SortAsc size={10} /> {SORT_OPTIONS.find(o => o.value === sortMode)?.label}
            </button>
            <button onClick={() => setShowImport(true)} className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* Sort Dropdown Overlay */}
        {showSortDropdown && (
          <>
            <div className="fixed inset-0 z-[1000]" onClick={() => setShowSortDropdown(false)} />
            <div className="absolute right-16 top-[420px] sm:top-[440px] w-32 bg-[#111] border border-white/10 rounded-xl overflow-hidden z-[1001] shadow-2xl animate-in fade-in zoom-in-95 duration-100">
               {SORT_OPTIONS.map(opt => (
                 <button key={opt.value} onClick={() => { setSortMode(opt.value); setShowSortDropdown(false); }}
                    className={`w-full px-4 py-2 text-[9px] font-bold text-left transition-colors ${sortMode === opt.value ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`}>
                   {opt.label}
                 </button>
               ))}
            </div>
          </>
        )}

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto pb-24" onScroll={handleScroll}>
          {visibleItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-800">
              <Database size={24} className="mb-2 opacity-10" />
              <p className="text-[8px] font-black uppercase tracking-widest opacity-20">Matrix Offline or Empty</p>
            </div>
          ) : (
            <>
              {visibleItems.map(item => (
                <SongRow
                  key={item.metadata.id}
                  item={item}
                  onSongSelect={onSongSelect}
                  onToggleDelete={onToggleDelete}
                  onPermanentDelete={onPermanentDelete}
                  isTrashMode={activeTab === 'trash'}
                />
              ))}
              {hasMore && (
                <div className="flex justify-center p-6 text-[8px] font-black text-zinc-700 uppercase tracking-widest">
                   Accessing neural nodes...
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-[20000] bg-black/95 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-[32px] p-10 flex flex-col items-center gap-8 relative">
            <button onClick={() => setShowImport(false)} className="absolute top-6 right-6 text-zinc-600 hover:text-white"><X size={20} /></button>
            <div className="w-20 h-20 rounded-[24px] bg-cyan-500/10 flex items-center justify-center text-cyan-400"><Database size={40} /></div>
            <div className="text-center">
              <h2 className="text-xl font-black text-white italic tracking-tighter uppercase mb-2">Import Node</h2>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Select MusicXML or MIDI to integrate</p>
            </div>
            <button onClick={() => fileInputRef.current?.click()}
               className="w-full h-14 bg-cyan-500 text-black rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-transform">
              Select Files
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" accept=".xml,.musicxml,.mxl,.mid,.midi" onChange={handleImport} />
          </div>
        </div>
      )}

      {/* Sync Status Overlay (bottom-left) */}
      <div className="fixed bottom-20 left-6 flex items-center gap-2 px-3 py-1.5 bg-black/50 border border-white/5 rounded-full backdrop-blur-md z-[500]">
        <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-cyan-500 animate-pulse' : 'bg-emerald-500'}`} />
        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">{isSyncing ? 'Neural Syncing...' : 'Link Stable'}</span>
        <button onClick={onRefresh} className="ml-2 text-white/20 hover:text-white transition-colors">
          <RefreshCcw size={10} className={isSyncing ? 'animate-spin' : ''} />
        </button>
      </div>

    </div>
  );
};

export default HomePage;
