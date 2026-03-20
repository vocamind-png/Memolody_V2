
import React, { useMemo, useState, useEffect, useCallback, useRef, memo } from 'react';
import { Sparkles, Mic, MessageSquare, Waves, ChevronRight, Music2, Play, Search, X, Database, SortAsc, RefreshCcw, Loader2, Plus, RotateCcw, Trash2, ChevronDown, Heart, FolderPlus, Folder, Star, Music, MoreVertical, Store, Video, Target } from 'lucide-react';
import { Song, ViewId, SongFolder } from '../../types';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';
import { songStorage } from '../../lib/SongStorage';
import AbstractCover from './AbstractCover';

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
type FilterTab = 'matrix' | 'favorites' | 'mysongs' | 'trash';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const FOLDER_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

const PAGE_SIZE = 50;

// ── Song Row with Favorite + Folder Context Menu ──
const SongRow = memo(({ item, onSongSelect, onToggleDelete, onPermanentDelete, isTrashMode, onToggleFavorite, folders, onAssignFolder }: any) => {
  const durMin = Math.floor((item.metadata.duration || 0) / 60);
  const durSec = Math.floor((item.metadata.duration || 0) % 60);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer group active:bg-white/[0.05] relative"
      onClick={() => !isTrashMode && onSongSelect(item.metadata, item.xmlData, 'listen')}
    >
      <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden relative shadow-md group-hover:shadow-cyan-500/20 transition-shadow">
        <AbstractCover seed={item.metadata.title || item.metadata.id} size={80} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
          <Play size={12} className="text-white fill-current drop-shadow-lg" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.metadata.isFavorite && <Heart size={10} className="text-rose-500 fill-rose-500 shrink-0" />}
          <p className="text-[11px] font-black text-white uppercase italic truncate group-hover:text-cyan-400 transition-colors duration-75">
            {item.metadata.title}
          </p>
        </div>
        <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest truncate">
          {item.metadata.artist || 'Unknown Maestro'}
          {item.metadata.folderId && <span className="ml-2 text-indigo-400/60">• {folders?.find((f: SongFolder) => f.id === item.metadata.folderId)?.name || ''}</span>}
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
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.metadata.id); }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${item.metadata.isFavorite ? 'text-rose-500' : 'text-zinc-800 hover:text-rose-400 opacity-0 group-hover:opacity-100'}`}
          >
            <Heart size={12} fill={item.metadata.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-800 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreVertical size={12} />
          </button>
          <ChevronRight size={14} className="text-zinc-800 group-hover:text-cyan-500 shrink-0" />
        </div>
      )}

      {/* Context Menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-[2000]" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
          <div className="absolute right-12 top-full -mt-2 w-44 bg-[#111] border border-white/10 rounded-xl overflow-hidden z-[2001] shadow-2xl animate-in fade-in zoom-in-95 duration-100">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.metadata.id); setShowMenu(false); }}
              className="w-full px-4 py-2.5 text-[9px] font-bold text-left flex items-center gap-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <Heart size={10} fill={item.metadata.isFavorite ? 'currentColor' : 'none'} className={item.metadata.isFavorite ? 'text-rose-500' : ''} />
              {item.metadata.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
            </button>
            <div className="px-3 py-1.5 text-[7px] font-black text-zinc-700 uppercase tracking-widest border-t border-white/5">Move to Folder</div>
            <button
              onClick={(e) => { e.stopPropagation(); onAssignFolder(item.metadata.id, undefined); setShowMenu(false); }}
              className={`w-full px-4 py-2 text-[9px] font-bold text-left text-zinc-500 hover:bg-white/5 hover:text-white ${!item.metadata.folderId ? 'text-cyan-400' : ''}`}
            >
              No Folder
            </button>
            {folders?.map((f: SongFolder) => (
              <button
                key={f.id}
                onClick={(e) => { e.stopPropagation(); onAssignFolder(item.metadata.id, f.id); setShowMenu(false); }}
                className={`w-full px-4 py-2 text-[9px] font-bold text-left flex items-center gap-2 hover:bg-white/5 hover:text-white ${item.metadata.folderId === f.id ? 'text-cyan-400' : 'text-zinc-500'}`}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                {f.name}
              </button>
            ))}

            {/* Distribution */}
            <div className="px-3 py-1.5 text-[7px] font-black text-zinc-700 uppercase tracking-widest border-t border-white/5 mt-1">Distribution</div>
            <button
              onClick={(e) => { e.stopPropagation(); alert('Publishing to Marketplace...'); setShowMenu(false); }}
              className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center gap-2 text-amber-500 hover:bg-white/5 hover:text-amber-400"
            >
              <Store size={10} />
              SELL IN MARKET
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); alert('Promoting Challenge...'); setShowMenu(false); }}
              className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center gap-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <Star size={10} />
              PROMOTE & CHALLENGE
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); alert('Add Promo Video...'); setShowMenu(false); }}
              className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center gap-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <Video size={10} />
              ADD PROMO VDO CLIP
            </button>

            {/* Preview Restriction / Challenge */}
            <div className="px-3 py-1.5 text-[7px] font-black text-zinc-700 uppercase tracking-widest border-t border-white/5 mt-1">Preview Restriction</div>
            <button
              onClick={(e) => { e.stopPropagation(); alert('Set limit: Full Song'); setShowMenu(false); }}
              className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center justify-between text-indigo-400 hover:bg-white/5 hover:text-indigo-300 group/btn"
            >
              FULL SONG
              <ChevronRight size={10} className="opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); alert('Set limit: 8 Bars'); setShowMenu(false); }}
              className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center justify-between text-zinc-500 hover:bg-white/5 hover:text-white group/btn"
            >
              8 BARS LIMIT
              <ChevronRight size={10} className="opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); alert('Set limit: 16 Bars'); setShowMenu(false); }}
              className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center justify-between text-zinc-500 hover:bg-white/5 hover:text-white group/btn"
            >
              16 BARS LIMIT
              <ChevronRight size={10} className="opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); alert('Set limit: 32 Bars'); setShowMenu(false); }}
              className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center justify-between text-zinc-500 hover:bg-white/5 hover:text-white group/btn"
            >
              32 BARS LIMIT
              <ChevronRight size={10} className="opacity-0 group-hover/btn:opacity-100 transition-opacity" />
            </button>
          </div>
        </>
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
  const [activeTab, setActiveTab] = useState<FilterTab>('matrix');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showImport, setShowImport] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [folders, setFolders] = useState<SongFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load folders on mount
  useEffect(() => {
    songStorage.getFolders().then(setFolders);
  }, []);

  const handleToggleFavorite = useCallback(async (songId: string) => {
    await songStorage.toggleFavorite(songId);
    onRefresh();
  }, [onRefresh]);

  const handleAssignFolder = useCallback(async (songId: string, folderId: string | undefined) => {
    await songStorage.assignSongToFolder(songId, folderId);
    onRefresh();
  }, [onRefresh]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const folder: SongFolder = {
      id: `folder_${Date.now()}`,
      name: newFolderName.trim(),
      color: newFolderColor,
      createdAt: new Date().toISOString()
    };
    await songStorage.saveFolder(folder);
    setFolders(prev => [...prev, folder]);
    setNewFolderName('');
    setShowNewFolder(false);
  }, [newFolderName, newFolderColor]);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    await songStorage.deleteFolder(folderId);
    setFolders(prev => prev.filter(f => f.id !== folderId));
    if (activeFolder === folderId) setActiveFolder(null);
  }, [activeFolder]);

  // Counts
  const totalCount = useMemo(() => userLibrary.filter(i => !i.metadata.isDeleted).length, [userLibrary]);
  const favCount = useMemo(() => userLibrary.filter(i => !i.metadata.isDeleted && i.metadata.isFavorite).length, [userLibrary]);
  const mySongsCount = useMemo(() => userLibrary.filter(i => !i.metadata.isDeleted && i.metadata.origin === 'load').length, [userLibrary]);
  const trashCount = useMemo(() => userLibrary.filter(i => i.metadata.isDeleted).length, [userLibrary]);

  // Filter & Logic
  const filteredLibrary = useMemo(() => {
    let list: typeof userLibrary = [];
    switch (activeTab) {
      case 'matrix':
        list = userLibrary.filter(item => !item.metadata.isDeleted);
        break;
      case 'favorites':
        list = userLibrary.filter(item => !item.metadata.isDeleted && item.metadata.isFavorite);
        break;
      case 'mysongs':
        list = userLibrary.filter(item => !item.metadata.isDeleted && item.metadata.origin === 'load');
        break;
      case 'trash':
        list = userLibrary.filter(item => item.metadata.isDeleted);
        break;
    }

    // Apply folder filter
    if (activeFolder) {
      list = list.filter(i => i.metadata.folderId === activeFolder);
    }

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
  }, [userLibrary, searchQuery, activeTab, sortMode, activeFolder]);

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

  const TABS: { id: FilterTab, label: string, count: number, color: string }[] = [
    { id: 'matrix', label: 'Matrix', count: totalCount, color: 'text-cyan-400' },
    { id: 'favorites', label: 'Favorites', count: favCount, color: 'text-rose-400' },
    { id: 'mysongs', label: 'My Songs', count: mySongsCount, color: 'text-amber-400' },
    { id: 'trash', label: 'Trash', count: trashCount, color: 'text-zinc-500' },
  ];

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
              <span className="text-[8px] font-mono text-zinc-700">{totalCount} songs</span>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
              {recentSongs.map(item => (
                <div key={item.metadata.id} onClick={() => onSongSelect(item.metadata, item.xmlData, 'listen')}
                  className="shrink-0 w-32 aspect-square rounded-2xl overflow-hidden relative group/card hover:scale-[1.03] active:scale-95 transition-all shadow-lg hover:shadow-xl hover:shadow-cyan-500/10 border border-white/10">
                  <AbstractCover seed={item.metadata.title || item.metadata.id} size={256} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-between p-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 group-hover/card:text-cyan-400 group-hover/card:bg-cyan-500/20 transition-colors">
                        <Play size={12} fill="currentColor" />
                      </div>
                      {item.metadata.isFavorite && <Heart size={10} className="text-rose-500 fill-rose-500" />}
                    </div>
                    <p className="text-[9px] font-black text-white uppercase italic truncate drop-shadow-lg">{item.metadata.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── TOTAL MATRIX / VAULT (SCROLLABLE BOTTOM) ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Section Tabs & Sort */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.03]">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setActiveFolder(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shrink-0
                  ${activeTab === tab.id ? `${tab.color} bg-white/[0.05]` : 'text-zinc-700 hover:text-zinc-400'}`}
              >
                {tab.label}
                <span className={`text-[7px] font-mono ${activeTab === tab.id ? 'opacity-100' : 'opacity-40'}`}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="h-7 px-2.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center gap-1 text-[8px] font-black text-zinc-500 uppercase">
              <SortAsc size={10} /> {SORT_OPTIONS.find(o => o.value === sortMode)?.label}
            </button>
            <button onClick={() => setShowNewFolder(true)} className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 hover:bg-indigo-500/20 transition-colors" title="New Folder">
              <FolderPlus size={12} />
            </button>
            <button onClick={() => setShowImport(true)} className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-colors" title="Import">
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* Folder Pills (horizontal scroll) */}
        {folders.length > 0 && activeTab !== 'trash' && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.03] overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveFolder(null)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-wider transition-colors
                ${!activeFolder ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-zinc-600 hover:text-zinc-400'}`}
            >
              All
            </button>
            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFolder(activeFolder === f.id ? null : f.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-wider transition-colors group/pill
                  ${activeFolder === f.id ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-zinc-600 hover:text-zinc-400'}`}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                {f.name}
                <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }}
                  className="ml-1 text-zinc-800 hover:text-rose-400 opacity-0 group-hover/pill:opacity-100 transition-opacity">
                  <X size={8} />
                </button>
              </button>
            ))}
          </div>
        )}

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
              <p className="text-[8px] font-black uppercase tracking-widest opacity-20">
                {activeTab === 'favorites' ? 'No Favorites Yet' :
                  activeTab === 'mysongs' ? 'No Imported Songs' :
                    activeTab === 'trash' ? 'Trash Empty' : 'Matrix Offline or Empty'}
              </p>
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
                  onToggleFavorite={handleToggleFavorite}
                  folders={folders}
                  onAssignFolder={handleAssignFolder}
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

      {/* ── New Folder Modal ── */}
      {showNewFolder && (
        <div className="fixed inset-0 z-[20000] bg-black/95 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-[32px] p-10 flex flex-col items-center gap-6 relative">
            <button onClick={() => setShowNewFolder(false)} className="absolute top-6 right-6 text-zinc-600 hover:text-white"><X size={20} /></button>
            <div className="w-16 h-16 rounded-[20px] bg-indigo-500/10 flex items-center justify-center text-indigo-400"><FolderPlus size={32} /></div>
            <div className="text-center">
              <h2 className="text-lg font-black text-white italic tracking-tighter uppercase mb-1">New Folder</h2>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Organize your collections</p>
            </div>
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="FOLDER NAME..."
              className="w-full h-12 bg-white/[0.05] border border-white/10 rounded-2xl px-5 text-[11px] font-black text-white uppercase outline-none focus:border-indigo-500/30 placeholder:text-zinc-800"
            />
            <div className="flex gap-2">
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewFolderColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${newFolderColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111] scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button onClick={handleCreateFolder}
              className="w-full h-12 bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-30"
              disabled={!newFolderName.trim()}>
              Create Folder
            </button>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
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
