
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
  
  // Advanced Filters
  const [filterGenre, setFilterGenre] = useState('');
  const [filterEra, setFilterEra] = useState('');
  const [filterComposer, setFilterComposer] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterInstrument, setFilterInstrument] = useState('');
  const [filterGrade, setFilterGrade] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchInput(initialSearchQuery);
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, activeCategory, sortMode, filterGenre, filterEra, filterComposer, filterYear, filterInstrument, filterGrade]);

  const doSearch = useCallback(() => {
    setSearchQuery(searchInput);
  }, [searchInput]);

  const uniqueGenres = useMemo(() => ['Classical', 'Baroque', 'Romantic', 'Modern', 'Contemporary', 'Jazz', 'Pop', 'Rock', 'Blues', 'R&B', 'Hip Hop', 'Electronic', 'Acoustic', 'Folk', 'Country', 'Latin', 'World', 'Soundtrack', 'Anime', 'K-Pop', 'J-Pop', 'Bossa Nova', 'Lo-Fi', 'Metal', 'Soul', 'Funk', 'Disco', 'Reggae'].sort(), []);
  const uniqueEras = useMemo(() => ['Medieval', 'Renaissance', 'Baroque', 'Classical', 'Romantic', '20th Century', 'Modern', 'Contemporary', '1920s', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'].sort(), []);
  const uniqueComposers = useMemo(() => ['J.S. Bach', 'W.A. Mozart', 'L.v. Beethoven', 'F. Chopin', 'C. Debussy', 'P.I. Tchaikovsky', 'A. Vivaldi', 'J. Brahms', 'F. Schubert', 'G.F. Handel', 'J. Haydn', 'F. Liszt', 'R. Schumann', 'S. Rachmaninoff', 'I. Stravinsky', 'C. Saint-Saëns', 'A. Dvořák', 'E. Grieg', 'G. Verdi', 'R. Wagner', 'G. Puccini', 'Joe Hisaishi', 'Hans Zimmer', 'John Williams', 'Ennio Morricone', 'Ryuichi Sakamoto', 'Yiruma'].sort(), []);
  const uniqueYears = useMemo(() => ['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2015', '2010', '2000', '1990', '1980', '1970', '1960', '1950', '1900', '1850', '1800', '1750', '1700', '1650', '1600'].sort((a, b) => Number(b) - Number(a)), []);
  const uniqueInstruments = useMemo(() => ['Piano', 'Acoustic Guitar', 'Electric Guitar', 'Bass Guitar', 'Violin', 'Viola', 'Cello', 'Double Bass', 'Harp', 'Flute', 'Clarinet', 'Oboe', 'Bassoon', 'Saxophone', 'Trumpet', 'Trombone', 'French Horn', 'Tuba', 'Drums', 'Percussion', 'Timpani', 'Marimba', 'Synthesizer', 'Keyboard', 'Organ', 'Accordion', 'Ukulele', 'Vocals', 'Choir'].sort(), []);
  const uniqueGrades = useMemo(() => ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Diploma'], []);

  const filteredLibrary = useMemo(() => {
    let list = activeCategory === 'total'
      ? userLibrary.filter(item => !item.metadata.isDeleted)
      : userLibrary.filter(item => item.metadata.isDeleted);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      
      // Parse grade numbers to prevent substring matches (e.g. matching "Grade 1" inside "Grade 11")
      const gradeMatch = q.match(/(?:grade|เกรด)\s*(\d+)\b/);
      let targetGradeNum: number | null = null;
      let cleanQuery = q;
      
      if (gradeMatch) {
        targetGradeNum = parseInt(gradeMatch[1], 10);
        // Remove the grade token from query to avoid matching it in song titles
        cleanQuery = q.replace(gradeMatch[0], '').trim();
      }

      list = list.filter(i => {
        // 1. Exact Grade Match (if specified in query)
        if (targetGradeNum !== null) {
          const dGradeRaw = i.metadata.difficulty_grade || i.metadata.difficultyGrade || i.metadata.difficulty || i.metadata.grade || '';
          const dGrade = String(dGradeRaw).trim().toLowerCase();
          const itemGradeNumMatch = dGrade.match(/\d+/);
          const itemGradeNum = itemGradeNumMatch ? parseInt(itemGradeNumMatch[0], 10) : null;
          
          if (itemGradeNum !== targetGradeNum) {
            return false;
          }
        }

        // 2. Title/Artist match
        if (cleanQuery) {
          return (
            i.metadata.title.toLowerCase().includes(cleanQuery) ||
            i.metadata.artist.toLowerCase().includes(cleanQuery)
          );
        }
        return true;
      });
    }

    if (filterGenre) list = list.filter(i => {
      const g = (i.metadata.genre || i.metadata.category || '').toLowerCase().trim();
      const fg = filterGenre.toLowerCase().trim();
      if (!g) return false;
      if (g === fg) return true;
      if ((fg === 'classical' && g === 'classic') || (fg === 'classic' && g === 'classical')) return true;
      return g.includes(fg) || fg.includes(g);
    });
    if (filterEra) list = list.filter(i => i.metadata.era?.toLowerCase() === filterEra.toLowerCase());
    if (filterComposer) list = list.filter(i => i.metadata.composer?.toLowerCase() === filterComposer.toLowerCase() || i.metadata.artist?.toLowerCase() === filterComposer.toLowerCase());
    if (filterYear) list = list.filter(i => String(i.metadata.year) === String(filterYear));
    if (filterInstrument) list = list.filter(i => i.metadata.instruments?.some(inst => inst.toLowerCase() === filterInstrument.toLowerCase()));
    if (filterGrade && filterGrade !== 'All') {
      list = list.filter(i => {
        const dGradeRaw = i.metadata.difficulty_grade || i.metadata.difficultyGrade || i.metadata.difficulty || i.metadata.grade || '';
        let dGrade = String(dGradeRaw).trim();
        if (/^[1-8]$/.test(dGrade)) dGrade = `Grade ${dGrade}`;
        
        if (filterGrade === 'None') return !dGrade || dGrade.toLowerCase() === 'none';
        if (filterGrade === 'Diploma') return dGrade.toLowerCase() === 'diploma';
        if (['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(filterGrade)) {
          return dGrade.toLowerCase() === filterGrade.toLowerCase();
        }
        if (filterGrade.includes('-')) {
          const match = filterGrade.match(/Grade\s+(\d+)-(\d+)/i);
          if (match) {
            const min = parseInt(match[1]);
            const max = parseInt(match[2]);
            const grade = parseInt(dGrade.replace(/Grade\s*/i, '') || '0');
            return grade >= min && grade <= max;
          }
        }
        return dGrade.toLowerCase() === filterGrade.toLowerCase();
      });
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
  }, [userLibrary, searchQuery, activeCategory, sortMode, filterGenre, filterEra, filterComposer, filterYear, filterInstrument, filterGrade]);

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
            data-nimo-target="import_file"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[8px] font-black text-cyan-400 uppercase hover:bg-cyan-500/20 transition-colors duration-75">
            <Plus size={11} strokeWidth={3} /> Import
          </button>

          {/* Refresh */}
          <button onClick={onRefresh} disabled={isSyncing}
            data-nimo-target="sync_cloud"
            className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-600 hover:text-white transition-colors duration-75">
            {isSyncing ? <Loader2 size={12} className="animate-spin text-cyan-400" /> : <RefreshCcw size={12} />}
          </button>
        </div>
      </div>

      {/* ── SEARCH BAR ── */}
      <div className="px-6 py-3 shrink-0 border-b border-white/[0.03]">
        <div className="relative">
          <button onClick={doSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-cyan-400 transition-colors z-10">
            <Search size={14} />
          </button>
          <input
            data-nimo-target="search_song"
            type="text"
            placeholder="Search songs..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            className="w-full h-11 bg-white/[0.02] border border-white/5 rounded-lg pl-10 pr-8 text-base text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-600"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearchQuery(''); onSearchClear?.(); }}
                className="text-zinc-600 hover:text-white p-1">
                <X size={12} />
              </button>
            )}
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-lg transition-colors ${showFilters || filterGenre || filterInstrument || filterEra || filterYear || filterComposer || filterGrade !== 'All' ? 'text-cyan-400' : 'text-zinc-600 hover:text-white'}`}
              title="Styles & Filters"
            >
              <Database size={14} /> 
            </button>
          </div>
        </div>
      </div>

      {/* ── ADVANCED FILTERS PANEL ── */}
      {showFilters && (
        <div className="px-6 py-4 bg-white/[0.02] border-b border-white/[0.03]">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-in slide-in-from-top-2 duration-200">
            {/* Genre */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Genre</label>
              <select value={filterGenre} onChange={e => setFilterGenre(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50">
                <option value="">All Genres</option>
                {uniqueGenres.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {/* Era */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Era</label>
              <select value={filterEra} onChange={e => setFilterEra(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50">
                <option value="">All Eras</option>
                {uniqueEras.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            {/* Composer */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Composer</label>
              <select value={filterComposer} onChange={e => setFilterComposer(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50">
                <option value="">All Composers</option>
                {uniqueComposers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Year */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Year</label>
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50">
                <option value="">All Years</option>
                {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {/* Instruments */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Instruments</label>
              <select value={filterInstrument} onChange={e => setFilterInstrument(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50">
                <option value="">All Instruments</option>
                {uniqueInstruments.map(inst => <option key={inst} value={inst}>{inst}</option>)}
              </select>
            </div>
            {/* Grade */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Grade</label>
              <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50">
                <option value="All">All</option>
                {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Clear All */}
            {(filterGenre || filterEra || filterComposer || filterYear || filterInstrument || filterGrade !== 'All') && (
              <button 
                onClick={() => {
                  setFilterGenre(''); setFilterEra(''); setFilterComposer(''); setFilterYear(''); setFilterInstrument(''); setFilterGrade('All');
                }}
                className="col-span-full mt-2 text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] hover:text-rose-400 transition-colors flex items-center justify-center gap-1 py-2 border-t border-white/5"
              >
                <RotateCcw size={10} />
                Reset All Filters
              </button>
            )}
          </div>
        </div>
      )}

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
