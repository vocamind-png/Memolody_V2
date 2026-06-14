
import React, { useState, useMemo, useRef, memo, useEffect, useCallback } from 'react';
import {
  Search, Database, X, ChevronRight, Music,
  SortAsc, Plus, Trash2, RefreshCcw, Play, RotateCcw,
  Loader2, ChevronDown, Sparkles
} from 'lucide-react';
import { Song } from '../../types';
import { songStorage } from '../../lib/SongStorage';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';

type SortMode = 'default' | 'az' | 'za' | 'newest' | 'oldest';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

// ── Lightweight Song Row ──
const SongRow = memo(({ item, onSongSelect, onToggleDelete, onPermanentDelete, isTrashMode }: any) => {
  const durMin = Math.floor((item.metadata.duration || 0) / 60);
  const durSec = Math.floor((item.metadata.duration || 0) % 60);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer group"
      onClick={() => !isTrashMode && onSongSelect(item.metadata, item.xmlData, 'listen')}
    >
      {/* Play icon */}
      <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0 group-hover:bg-cyan-500/10">
        <Play size={10} className="text-zinc-600 group-hover:text-cyan-400 fill-current" />
      </div>

      {/* Title & Artist */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-white truncate group-hover:text-cyan-400 transition-colors duration-75">
          {item.metadata.title}
        </p>
        <p className="text-[9px] text-zinc-600 truncate">
          {item.metadata.artist || 'Unknown'}
        </p>
      </div>

      {/* Duration */}
      <span className="text-[9px] text-zinc-700 font-mono tabular-nums shrink-0">
        {durMin}:{durSec.toString().padStart(2, '0')}
      </span>

      {/* Actions */}
      {isTrashMode ? (
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onToggleDelete(item.metadata.id, false); }}
            className="w-6 h-6 rounded flex items-center justify-center text-zinc-700 hover:text-emerald-400 hover:bg-emerald-500/10">
            <RotateCcw size={11} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onPermanentDelete(item.metadata.id); }}
            className="w-6 h-6 rounded flex items-center justify-center text-zinc-700 hover:text-rose-400 hover:bg-rose-500/10">
            <Trash2 size={11} />
          </button>
        </div>
      ) : (
        <ChevronRight size={12} className="text-zinc-800 group-hover:text-cyan-500 shrink-0" />
      )}
    </div>
  );
});

// ── Page size for incremental rendering ──
const PAGE_SIZE = 80;

interface VaultPageProps {
  onSongSelect: (song: Song, xml?: string, mode?: 'listen' | 'studio') => void;
  userLibrary: { metadata: Song, xmlData: string }[];
  onRefresh: () => void;
  onEnterForge: () => void;
  onEnterBiz: () => void;
  onToggleDelete: (id: string, isDeleted: boolean) => void;
  onPermanentDelete: (id: string) => void;
  isSyncing?: boolean;
  initialSearchQuery?: string;
  onSearchClear?: () => void;
}

const VaultPage: React.FC<VaultPageProps> = ({
  onSongSelect, userLibrary = [], onRefresh, onEnterForge, onEnterBiz,
  onToggleDelete, onPermanentDelete, isSyncing,
  initialSearchQuery = '', onSearchClear
}) => {
  const [searchInput, setSearchInput] = useState(initialSearchQuery);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [activeCategory, setActiveCategory] = useState<'total' | 'trash'>('total');
  const [showImportConsole, setShowImportConsole] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchInput(initialSearchQuery);
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, activeCategory, sortMode]);

  const doSearch = useCallback(() => {
    setSearchQuery(searchInput);
  }, [searchInput]);

  const filteredLibrary = useMemo(() => {
    let list = activeCategory === 'total'
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
  }, [userLibrary, searchQuery, activeCategory, sortMode]);

  // Only render visible items
  const visibleItems = useMemo(() => filteredLibrary.slice(0, visibleCount), [filteredLibrary, visibleCount]);
  const hasMore = visibleCount < filteredLibrary.length;

  // Load more on scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400 && hasMore) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredLibrary.length));
    }
  }, [hasMore, filteredLibrary.length]);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setShowImportConsole(false);
    try {
      for (let i = 0; i < files.length; i++) {
        // We pass true as the 2nd argument to enable AI Cover Generation for newly imported files
        const { metadata, xmlData } = await parseMusicXMLMetadata(files[i], true);
        metadata.origin = 'load';
        await songStorage.saveSong(metadata, xmlData);
      }
      onRefresh();
    } catch { alert("Import failed."); } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0A0A0B] overflow-hidden select-none">

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <Database size={16} className="text-cyan-400" />
          <span className="text-sm font-black text-white uppercase tracking-tight">
            {activeCategory === 'trash' ? 'Trash' : 'Vault'}
          </span>
          <span className="text-[9px] font-bold text-zinc-600 tabular-nums">{filteredLibrary.length} songs</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Category toggle */}
          <div className="flex bg-white/[0.03] rounded-lg p-0.5 border border-white/5">
            <button onClick={() => setActiveCategory('total')}
              className={`px-3 py-1 rounded-md text-[8px] font-black uppercase transition-colors duration-75 ${activeCategory === 'total' ? 'bg-white text-black' : 'text-zinc-600'}`}>
              All
            </button>
            <button onClick={() => setActiveCategory('trash')}
              className={`px-3 py-1 rounded-md text-[8px] font-black uppercase transition-colors duration-75 ${activeCategory === 'trash' ? 'bg-rose-500 text-white' : 'text-zinc-600'}`}>
              Trash
            </button>
          </div>

          {/* Sort */}
          <div className="relative">
            <button onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[8px] font-black text-zinc-500 uppercase hover:text-white transition-colors duration-75">
              <SortAsc size={11} />
              {SORT_OPTIONS.find(o => o.value === sortMode)?.label}
              <ChevronDown size={8} />
            </button>
            {showSortDropdown && (
              <>
                <div className="fixed inset-0 z-[999]" onClick={() => setShowSortDropdown(false)} />
                <div className="absolute right-0 top-full mt-1 w-32 bg-[#111] border border-white/10 rounded-lg overflow-hidden z-[1000] shadow-xl">
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => { setSortMode(opt.value); setShowSortDropdown(false); }}
                      className={`w-full px-3 py-2 text-[9px] font-bold text-left transition-colors duration-75 ${sortMode === opt.value ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Import */}
          <button onClick={() => setShowImportConsole(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[8px] font-black text-cyan-400 uppercase hover:bg-cyan-500/20 transition-colors duration-75">
            <Plus size={11} strokeWidth={3} /> Import
          </button>

          {/* Refresh */}
          <button onClick={onRefresh} disabled={isSyncing}
            className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-600 hover:text-white transition-colors duration-75">
            {isSyncing ? <Loader2 size={12} className="animate-spin text-cyan-400" /> : <RefreshCcw size={12} />}
          </button>
        </div>
      </div>

      {/* ── SEARCH BAR ── */}
      <div className="px-6 py-3 shrink-0 border-b border-white/[0.03]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-700" />
          <input
            type="text"
            placeholder="Search songs..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            className="w-full h-11 bg-white/[0.02] border border-white/5 rounded-lg pl-10 pr-8 text-base text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-600"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(''); setSearchQuery(''); onSearchClear?.(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── SONG LIST — virtualized: only renders visibleCount items ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {visibleItems.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-zinc-800">
            <Music size={32} className="mb-3 opacity-20" />
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">
              {activeCategory === 'trash' ? 'Trash Empty' : searchQuery ? 'No Results' : 'No Songs'}
            </span>
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
                isTrashMode={activeCategory === 'trash'}
              />
            ))}
            {hasMore && (
              <div className="flex items-center justify-center py-4">
                <span className="text-[9px] text-zinc-700 font-bold">Showing {visibleCount} of {filteredLibrary.length} — scroll for more</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── IMPORT MODAL — no blur ── */}
      {showImportConsole && (
        <div className="fixed inset-0 z-[20000] bg-black/90 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#111] border border-white/10 rounded-2xl p-8 relative">
            <button onClick={() => setShowImportConsole(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X size={16} />
            </button>
            <h2 className="text-lg font-black text-white uppercase mb-6">Import</h2>
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-sm font-bold text-cyan-400 hover:bg-cyan-500/20 transition-colors duration-75">
              Select MusicXML / MIDI Files
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" accept=".xml,.musicxml,.mxl,.mid,.midi,.emk" onChange={handleFileInputChange} />
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultPage;
