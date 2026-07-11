import React, { useMemo, useState, useEffect, useCallback, useRef, memo, lazy, Suspense } from 'react';
import { Sparkles, Mic, MessageSquare, Waves, ChevronRight, Music2, Play, Search, X, Database, SortAsc, RefreshCcw, Loader2, Plus, RotateCcw, Trash2, ChevronDown, Heart, FolderPlus, Folder, Star, Music, MoreVertical, Store, Video, Target, Camera, Upload, Crop } from 'lucide-react';
import * as Tone from 'tone';
import { Song, ViewId, SongFolder } from '../../types';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';
import { songStorage } from '../../lib/SongStorage';
import { getClassicalRank } from '../../lib/classicalRanking';
import { isSongFullyRendered } from '../../lib/BatchRenderService';
import ScoreSelectionModal from './ScoreSelectionModal';
import { GoogleGenAI } from '@google/genai';




import AbstractCover from './AbstractCover';
const CameraCapture = lazy(() => import('./CameraCapture'));

// ── Era Detection from Composer Name ─────────────────────────────────
const detectEraFromName = (name: string): string => {
  if (!name || name === 'NA' || name === 'Unknown') return '';
  const c = name.toLowerCase();
  if (/\b(bach|vivaldi|handel|purcell|corelli|telemann|scarlatti|lully|rameau|couperin|pachelbel|albinoni)\b/.test(c)) return 'Baroque';
  if (/\b(mozart|haydn|beethoven|clementi|hummel|salieri|boccherini|dussek|field)\b/.test(c)) return 'Classical';
  if (/\b(chopin|liszt|schumann|tchaikovsky|brahms|mendelssohn|schubert|verdi|wagner|dvorak|grieg|rachmaninoff|rachmaninov|strauss|puccini|mahler|bruckner|elgar|sibelius|rimsky|mussorgsky|borodin|saint-saens|bizet|faure|franck|paganini)\b/.test(c)) return 'Romantic';
  if (/\b(debussy|ravel|satie|scriabin|delius|respighi|albeniz|granados)\b/.test(c)) return 'Impressionist';
  if (/\b(stravinsky|bartok|prokofiev|shostakovich|copland|gershwin|bernstein|britten|hindemith|poulenc|milhaud|messiaen|villa-lobos|barber|kodaly|orff|holst|vaughan williams|walton)\b/.test(c)) return '20th Century';
  if (/\b(glass|reich|adams|part|arvo|ligeti|cage|boulez|stockhausen|xenakis|berio|nono|feldman|riley|tavener|rutter|whitacre|einaudi|yiruma|zimmer|morricone|sakamoto)\b/.test(c)) return 'Contemporary';
  if (/\b(traditional|folk|anonymous|anon|trad)\b/.test(c)) return 'Traditional';
  if (/\b(kirkpatrick|doane|sankey|bliss|crosby|bradbury|mason|root|webb|mcgranahan|stebbins|gabriel|lowry|knapp|sweney|excell|fischer)\b/.test(c)) return 'Sacred/Hymn';
  return '';
};

// ── Approximate Year from Composer Name ─────────────────────────────────
const COMPOSER_YEARS: Record<string, number> = {
  // Baroque
  bach: 1720, vivaldi: 1720, handel: 1730, purcell: 1690, corelli: 1700, telemann: 1720, scarlatti: 1730, pachelbel: 1690, albinoni: 1710, lully: 1680, rameau: 1730, couperin: 1710,
  // Classical
  mozart: 1780, haydn: 1780, beethoven: 1800, clementi: 1790, hummel: 1810,
  // Romantic
  chopin: 1840, liszt: 1850, schumann: 1840, tchaikovsky: 1880, brahms: 1870, mendelssohn: 1840, schubert: 1825, verdi: 1860, wagner: 1860, dvorak: 1880, grieg: 1880, rachmaninoff: 1900, rachmaninov: 1900, strauss: 1890, puccini: 1900, mahler: 1900, bruckner: 1880, elgar: 1900, sibelius: 1900, bizet: 1870, faure: 1890, franck: 1880, paganini: 1830, 'saint-saens': 1880,
  // Impressionist
  debussy: 1900, ravel: 1910, satie: 1900, scriabin: 1905,
  // 20th Century
  stravinsky: 1920, bartok: 1930, prokofiev: 1930, shostakovich: 1940, copland: 1940, gershwin: 1930, bernstein: 1950, britten: 1950, holst: 1920, barber: 1940,
  // Contemporary
  glass: 1980, einaudi: 2000, yiruma: 2005, zimmer: 2000, morricone: 1980, sakamoto: 1990, williams: 1980,
  // Hymn writers
  kirkpatrick: 1880, sankey: 1880, bliss: 1870, crosby: 1870, bradbury: 1860, mason: 1840,
};

const detectYearFromComposer = (name: string): string => {
  if (!name || name === 'NA' || name === 'Unknown') return '';
  const c = name.toLowerCase();
  for (const [key, year] of Object.entries(COMPOSER_YEARS)) {
    if (c.includes(key)) return String(year);
  }
  return '';
};

// ── Instrument Detection from Title / Genre ─────────────────────────────────
const detectInstrumentsFromTitle = (title: string, genre: string): string[] => {
  const t = (title || '').toLowerCase();
  const g = (genre || '').toLowerCase();
  const instruments: string[] = [];
  
  // Detect from title keywords
  if (/\b(piano|pianoforte|klavier)\b/.test(t)) instruments.push('Piano');
  if (/\b(violin|violino)\b/.test(t)) instruments.push('Violin');
  if (/\b(viola)\b/.test(t)) instruments.push('Viola');
  if (/\b(cello|violoncello)\b/.test(t)) instruments.push('Cello');
  if (/\b(flute|flauto)\b/.test(t)) instruments.push('Flute');
  if (/\b(clarinet|clarinetto)\b/.test(t)) instruments.push('Clarinet');
  if (/\b(oboe)\b/.test(t)) instruments.push('Oboe');
  if (/\b(bassoon|fagotto)\b/.test(t)) instruments.push('Bassoon');
  if (/\b(trumpet|tromba)\b/.test(t)) instruments.push('Trumpet');
  if (/\b(horn|corno)\b/.test(t)) instruments.push('French Horn');
  if (/\b(trombone)\b/.test(t)) instruments.push('Trombone');
  if (/\b(harp|arpa)\b/.test(t)) instruments.push('Harp');
  if (/\b(organ|orgel)\b/.test(t)) instruments.push('Organ');
  if (/\b(guitar|guitare|chitarra)\b/.test(t)) instruments.push('Guitar');
  if (/\b(saxophone|sax)\b/.test(t)) instruments.push('Saxophone');
  if (/\b(drums?|percussion)\b/.test(t)) instruments.push('Drums');
  if (/\b(voice|vocal|song|lied|aria|choral|choir|hymn|anthem|cantata|mass)\b/.test(t)) instruments.push('Vocals');
  if (/\b(sonata|sonatina|etude|prelude|fugue|waltz|mazurka|nocturne|ballade|scherzo|impromptu|rondo|minuet|gavotte|bourree|invention|fantasia|rhapsody|polonaise|tarantella|bagatelle|moment|barcarolle)\b/.test(t)) {
    if (instruments.length === 0) instruments.push('Piano'); // Most solo classical forms are piano
  }
  if (/\b(concerto|symphony|symphonic|overture|suite|serenade|divertimento)\b/.test(t)) instruments.push('Orchestra');
  if (/\b(quartet|quintet|trio|duet)\b/.test(t)) instruments.push('Chamber');
  
  // If nothing detected and genre is classical, default to Piano
  if (instruments.length === 0 && (g.includes('classic') || g.includes('baroque') || g.includes('romantic'))) {
    instruments.push('Piano');
  }
  
  return instruments;
};

// ── Processing Overlay (shown during OMR) ─────────────────────────────────
const ProcessingOverlay: React.FC<{ message: string; error?: string | null; onDismiss?: () => void; bgmUrl?: string }> = ({ message, error, onDismiss, bgmUrl }) => {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => {
      clearInterval(t);
    };
  }, []);

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 z-[70000] flex flex-col items-center justify-center gap-5 p-6"
        style={{ background: 'rgba(9,9,12,0.97)', backdropFilter: 'blur(20px)' }}>
        <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center border border-rose-500/30">
          <span className="text-3xl">❌</span>
        </div>
        <div className="text-center max-w-sm">
          <p className="text-white font-black uppercase tracking-widest text-sm">Import ไม่สำเร็จ</p>
          <p className="text-rose-300 text-[11px] font-bold mt-3 leading-relaxed break-words">{error}</p>
        </div>
        <button onClick={onDismiss}
          className="mt-2 bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
          ปิด
        </button>
      </div>
    );
  }

  const step = message.includes('Pass 1') ? 1
    : message.includes('Pass 2') ? 2
    : message.includes('บันทึก') ? 3
    : message.includes('✅') ? 4 : 1;

  return (
    <div className="fixed inset-0 z-[70000] flex flex-col items-center justify-center gap-5"
      style={{ background: 'rgba(9,9,12,0.97)', backdropFilter: 'blur(20px)' }}>

      {/* Animated ring */}
      <div className="relative w-24 h-24 mb-2">
        <div className="absolute inset-0 rounded-full border-2 border-cyan-500/10 animate-ping" />
        <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
        <div className="absolute inset-0 rounded-full border-4 border-t-cyan-400 border-r-cyan-500/0 border-b-cyan-500/0 border-l-cyan-500/0 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl select-none">🎵</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <p className="text-white font-black uppercase tracking-widest text-sm">AI กำลังอ่านโน้ต</p>
        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">Deep Learning OMR Engine</p>
      </div>

      {/* Large Timer */}
      <div className="flex flex-col items-center justify-center my-4">
        <div className="text-5xl font-black tabular-nums text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-cyan-600 drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">
          {elapsed}<span className="text-2xl text-cyan-500/50">s</span>
        </div>
        <p className="text-zinc-600 text-[9px] uppercase tracking-widest mt-2">กำลังประมวลผล (อาจจะใช้เวลาถึง 4 นาที โปรดรอ)</p>
      </div>

      {/* Current message */}
      <p className="text-cyan-300 text-[11px] font-bold max-w-xs text-center leading-relaxed px-4 animate-pulse">{message}</p>

      {/* Cancel Button */}
      {elapsed > 10 && onDismiss && (
        <button onClick={onDismiss} className="mt-4 px-6 py-2 rounded-full border border-zinc-800 text-zinc-500 text-[10px] uppercase font-bold tracking-widest hover:text-white hover:border-zinc-600 transition-colors">
          ยกเลิกการทำงาน
        </button>
      )}
    </div>
  );
};


interface HomePageProps {
  onSongSelect: (song: Song, xmlData?: string, mode?: 'listen' | 'edit' | 'play') => void;
  userLibrary: { metadata: Song, xmlData: string }[];
  onEnterStudio: () => void;
  onViewVault: () => void;
  onSearch: (query: string) => void;
  performanceMode?: boolean;
  onToggleDelete: (id: string, isDeleted: boolean) => void;
  onPermanentDelete: (id: string) => void;
  onBulkDelete: (ids: string[], isDeleted: boolean) => void;
  onBulkPermanentDelete: (ids: string[]) => void;
  onRefresh: () => void;
  onLocalRefresh: () => Promise<void>; // ← fast local-only DB refresh (bypasses cloud sync guard)
  isSyncing?: boolean;
  onOpenNimo?: (song: Song, xml: string) => void;
  onImportToNimo?: (file: File) => void;
  onTogglePublic: (id: string, isPublic: boolean) => void;
  isAdmin?: boolean;
  currentUserId?: string;
  bgmUrl?: string;
  bgmTitle?: string;
  bgmCover?: string;
}

type SortMode = 'default' | 'az' | 'za' | 'newest' | 'oldest';
type FilterTab = 'home' | 'favorites' | 'mysongs' | 'trash';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const FOLDER_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

const PAGE_SIZE = 50;

// ── Song Row with Selection + Context Menu ──
// ── Song Row with Selection + Context Menu ──
const SongRow = memo(({ item, onSongSelect, onToggleDelete, onPermanentDelete, isTrashMode, onToggleFavorite, folders, onAssignFolder, isSelected, onToggleSelect, onTogglePublic, activeTab, isAdmin, currentUserId }: any) => {
  const durMin = Math.floor((item.metadata.duration || 0) / 60);
  const durSec = Math.floor((item.metadata.duration || 0) % 60);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] active:bg-white/[0.05] relative transition-colors touch-manipulation select-none ${isSelected ? 'bg-cyan-500/5' : ''}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      onClick={() => {
        if (!isTrashMode) {
          onSongSelect(item.metadata, item.xmlData, 'listen');
        }
      }}
    >
      {/* Checkbox for Selection - ONLY show if not in Home tab */}
      {activeTab !== 'home' && (
        <div 
          onClick={(e) => { e.stopPropagation(); onToggleSelect && onToggleSelect(item.metadata.id); }}
          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-cyan-500 border-cyan-500 text-black' : 'border-white/10 text-transparent group-hover:border-cyan-500/50'}`}
        >
          <div className={`w-2 h-2 rounded-sm bg-white ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
        </div>
      )}

      <div 
        className="w-16 h-9 rounded-xl shrink-0 overflow-hidden relative shadow-md transition-shadow"
      >
        <AbstractCover seed={item.metadata.title || item.metadata.id} size={80} />
        {(() => {
          try {
            const histStr = localStorage.getItem(`memo_render_history_${item.metadata.id}`);
            const hasRendered = histStr ? (JSON.parse(histStr) || []).length > 0 : false;
            if (hasRendered) {
              return (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none group-hover:bg-black/50 transition-all">
                  <div 
                    className="w-6 h-6 rounded-full bg-cyan-500/90 backdrop-blur-sm flex items-center justify-center shadow-[0_0_10px_rgba(0,229,255,0.4)] pointer-events-auto cursor-pointer hover:scale-110 active:scale-95 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSongSelect(item.metadata, item.xmlData, 'play');
                    }}
                  >
                    <Play size={12} className="text-black fill-black ml-0.5" />
                  </div>
                </div>
              );
            }
          } catch (e) {
            // Ignore parse errors
          }
          return null;
        })()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.metadata.isFavorite && <Heart size={10} className="text-rose-500 fill-rose-500 shrink-0" />}
          <p className="text-[11px] font-black text-white uppercase italic truncate group-hover:text-cyan-400 transition-colors duration-75">
            {item.metadata.title}
          </p>
        </div>
        <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest truncate flex items-center gap-1.5 mt-0.5">
          <span>{item.metadata.artist || 'Unknown Maestro'}</span>
          {(() => {
            const grade = item.metadata?.difficulty_grade || item.metadata?.difficultyGrade || item.metadata?.difficulty || item.difficulty_grade || item.difficultyGrade || item.difficulty;
            return grade && grade !== 'none' ? (
              <span className="px-1.5 py-0.5 rounded-sm bg-white/5 border border-white/10 text-[7px] text-zinc-400 font-bold tracking-widest leading-none">
                {grade}
              </span>
            ) : null;
          })()}
          {item.metadata.ownerName && item.metadata.ownerName !== 'Admin' && (
            <span className="text-cyan-500/80 lowercase italic font-medium">@{item.metadata.ownerName}</span>
          )}
          {item.metadata.folderId && <span className="text-indigo-400/60">• {folders?.find((f: SongFolder) => f.id === item.metadata.folderId)?.name || ''}</span>}
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
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors touch-manipulation ${item.metadata.isFavorite ? 'text-rose-500' : 'text-zinc-600 active:text-rose-400'}`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Heart size={13} fill={item.metadata.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-600 active:text-white transition-all touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <MoreVertical size={13} />
          </button>
          <ChevronRight size={14} className="text-zinc-700 shrink-0" />
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
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); onTogglePublic(item.metadata.id, !item.metadata.isPublic); }}
              className={`w-full px-4 py-2 text-[9px] font-bold text-left flex items-center gap-2 border-t border-white/5 ${item.metadata.isPublic ? 'text-cyan-400' : 'text-zinc-500'} hover:bg-white/5`}
            >
              <Music size={10} />
              {item.metadata.isPublic ? 'REMOVE FROM HOME' : 'SHARE TO HOME FEED'}
            </button>
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

            {/* Danger Zone */}
            {(() => {
              const isOwner = currentUserId && item.metadata.ownerId === currentUserId;
              if (activeTab !== 'home' || isAdmin || isOwner) {
                return (
                  <>
                    <div className="px-3 py-1.5 text-[7px] font-black text-rose-500/70 uppercase tracking-widest border-t border-white/5 mt-1">Danger Zone</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleDelete(item.metadata.id, true); setShowMenu(false); }}
                      className="w-full px-4 py-2 text-[9px] font-bold text-left flex items-center gap-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 size={10} />
                      MOVE TO TRASH
                    </button>
                  </>
                );
              }
              return null;
            })()}
          </div>
        </>
      )}
    </div>
  );
});

const HomePage: React.FC<HomePageProps> = ({
  onSongSelect, userLibrary = [], onEnterStudio, onViewVault, onSearch,
  performanceMode, onToggleDelete, onPermanentDelete, onBulkDelete, onBulkPermanentDelete, onRefresh, onLocalRefresh, isSyncing, onOpenNimo, onImportToNimo,
  onTogglePublic, isAdmin, currentUserId,
  bgmUrl, bgmTitle, bgmCover
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // BGM Audio - reuse the audio from SplashLoader if available, otherwise create new
  const bgmRef = React.useRef<HTMLAudioElement | null>(null);
  const bgmStartedRef = React.useRef(false);

  useEffect(() => {
    // Check if SplashLoader already created and started playing an audio
    const existingBgm = (window as any).__memolody_bgm as HTMLAudioElement | undefined;
    
    if (existingBgm && !existingBgm.paused) {
      // Reuse the already-playing audio from SplashLoader!
      bgmRef.current = existingBgm;
      bgmStartedRef.current = true;
      existingBgm.volume = 1.0;
      console.log('🎵 BGM: Reusing audio from SplashLoader (already playing)');
      
      // Resume Tone.js
      try { Tone.start(); } catch (e) {}
      return;
    }

    // Fallback: create new Audio (for cases where SplashLoader didn't play)
    const audioSrc = bgmUrl || '/audio/Where_Dreams_Align.mp3';
    const audio = existingBgm || new Audio(audioSrc);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 1.0;
    bgmRef.current = audio;

    const startBGM = () => {
      if (bgmStartedRef.current) return;
      const a = bgmRef.current;
      if (!a) return;
      a.play().then(() => {
        bgmStartedRef.current = true;
        (window as any).__memolody_bgm = a;
        console.log('🎵 BGM playing!');
        window.removeEventListener('click', startBGM, true);
        window.removeEventListener('touchstart', startBGM, true);
        window.removeEventListener('touchend', startBGM, true);
        window.removeEventListener('keydown', startBGM, true);
      }).catch(err => {
        console.warn('BGM play attempt failed:', err);
      });
    };

    // Try immediately
    startBGM();

    // Listen for ANY user gesture in capture phase
    window.addEventListener('click', startBGM, true);
    window.addEventListener('touchstart', startBGM, true);
    window.addEventListener('touchend', startBGM, true);
    window.addEventListener('keydown', startBGM, true);

    // Also resume Tone.js audio context
    const resumeTone = () => {
      try { Tone.start(); } catch (e) {}
    };
    window.addEventListener('click', resumeTone);

    return () => {
      window.removeEventListener('click', startBGM, true);
      window.removeEventListener('touchstart', startBGM, true);
      window.removeEventListener('touchend', startBGM, true);
      window.removeEventListener('keydown', startBGM, true);
      window.removeEventListener('click', resumeTone);
      // Do NOT pause/destroy bgm here - let it keep playing
    };
  }, [bgmUrl]);

  // ── Stop BGM on first user click/tap (after it's started) ──
  useEffect(() => {
    let stopRegistered = false;
    
    const stopBgmOnClick = () => {
      const audio = bgmRef.current || (window as any).__memolody_bgm as HTMLAudioElement | undefined;
      if (!audio || audio.paused) return;
      
      // Fade out smoothly over 500ms
      let vol = audio.volume;
      const fadeInterval = setInterval(() => {
        vol -= 0.1;
        if (vol <= 0) {
          audio.volume = 0;
          audio.pause();
          audio.currentTime = 0;
          clearInterval(fadeInterval);
          (window as any).__memolody_bgm = null;
          bgmRef.current = null;
          console.log('🎵 BGM stopped by user click');
        } else {
          audio.volume = vol;
        }
      }, 50);
      
      // Remove listener after first use (one-shot)
      window.removeEventListener('click', stopBgmOnClick, true);
      window.removeEventListener('touchend', stopBgmOnClick, true);
      stopRegistered = false;
    };

    // Wait a short moment so the "start BGM" click doesn't immediately stop it
    const timer = setTimeout(() => {
      if (bgmStartedRef.current || (window as any).__memolody_bgm) {
        window.addEventListener('click', stopBgmOnClick, true);
        window.addEventListener('touchend', stopBgmOnClick, true);
        stopRegistered = true;
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      if (stopRegistered) {
        window.removeEventListener('click', stopBgmOnClick, true);
        window.removeEventListener('touchend', stopBgmOnClick, true);
      }
    };
  }, []);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiFilteredIds, setAiFilteredIds] = useState<string[] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterGenre, setFilterGenre] = useState('');
  const [filterEra, setFilterEra] = useState('');
  const [filterComposer, setFilterComposer] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterInstrument, setFilterInstrument] = useState('');
  const [filterGrade, setFilterGrade] = useState('All');
  const [topSongs, setTopSongs] = useState<any[]>([]);

  useEffect(() => {
    import('../../lib/SongAnalyticsService').then(m => {
      m.SongAnalyticsService.getTopSongs(10).then(setTopSongs);
    });
  }, []);

  const [activeTab, setActiveTab] = useState<FilterTab>('home');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showImport, setShowImport] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [processingError, setProcessingError] = useState<string | null>(null);
  // After import/capture — ask user: Edit or NIMO?
  const [pendingImport, setPendingImport] = useState<{ metadata: Song; xmlData: string; layoutBundle?: any } | null>(null);
  const [pendingSelectionFile, setPendingSelectionFile] = useState<File | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [folders, setFolders] = useState<SongFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Auto Re-grade Background Process ──
  const [regradeStatus, setRegradeStatus] = useState<{ running: boolean; done: number; total: number; regraded: number } | null>(null);
  const regradeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    // Check if re-grading is needed (only run once)
    const key = 'memolody_regrade_done';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    
    const runRegrade = async () => {
      try {
        // Quick check: see if any songs need re-grading
        const allSongs = await songStorage.getAllSongs();
        const needsRegrade = allSongs.filter(s => {
          const m = s.metadata as any;
          const grade = m.difficulty_grade || m.difficulty || '';
          return (!grade || grade === 'Intermediate' || grade === 'intermediate') && s.xmlData?.startsWith('http');
        });
        
        if (needsRegrade.length === 0) return;
        
        console.log(`[Auto Re-grade] Starting background re-grade for ${needsRegrade.length} songs...`);
        setRegradeStatus({ running: true, done: 0, total: needsRegrade.length, regraded: 0 });
        
        const abort = new AbortController();
        regradeAbortRef.current = abort;
        
        const result = await songStorage.batchRegrade(
          (done, total) => {
            setRegradeStatus(prev => prev ? { ...prev, done, total, regraded: done } : null);
          },
          abort.signal
        );
        
        console.log(`[Auto Re-grade] Complete! Regraded: ${result.regraded}, Failed: ${result.failed}`);
        setRegradeStatus({ running: false, done: result.regraded, total: needsRegrade.length, regraded: result.regraded });
        
        // Refresh library if any songs were regraded
        if (result.regraded > 0 && onLocalRefresh) {
          onLocalRefresh();
        }
        
        // Auto-hide after 5 seconds
        setTimeout(() => setRegradeStatus(null), 5000);
      } catch (e) {
        console.warn('[Auto Re-grade] Error:', e);
        setRegradeStatus(null);
      }
    };
    
    // Delay 3 seconds to let the page settle
    const timer = setTimeout(runRegrade, 3000);
    return () => {
      clearTimeout(timer);
      regradeAbortRef.current?.abort();
    };
  }, []);

  // ── Listen for NimoBrain custom events dispatched from App.tsx ──
  useEffect(() => {
    const handleSearchSong = (e: Event) => {
      const query = (e as CustomEvent).detail?.query ?? '';
      console.log('[HomePage] Nimo search_song event:', query);
      setSearchInput(query);
      setSearchQuery(query);
    };
    const handleSortSongs = (e: Event) => {
      let mode = (e as CustomEvent).detail?.mode ?? 'default';
      // Normalize 'a-z'→'az', 'z-a'→'za' for compatibility
      if (mode === 'a-z') mode = 'az';
      if (mode === 'z-a') mode = 'za';
      console.log('[HomePage] Nimo sort_songs event:', mode);
      if (['default', 'az', 'za', 'newest', 'oldest'].includes(mode)) {
        setSortMode(mode as SortMode);
      }
    };
    const handleImportFile = () => {
      console.log('[HomePage] Nimo import_file event');
      setShowImport(true);
    };
    window.addEventListener('nimo-search-song', handleSearchSong);
    window.addEventListener('nimo-sort-songs', handleSortSongs);
    window.addEventListener('nimo-import-file', handleImportFile);
    return () => {
      window.removeEventListener('nimo-search-song', handleSearchSong);
      window.removeEventListener('nimo-sort-songs', handleSortSongs);
      window.removeEventListener('nimo-import-file', handleImportFile);
    };
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((ids: string[]) => {
    if (selectedIds.size === ids.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(ids));
  }, [selectedIds]);

  const handleBulkAction = useCallback(async (action: 'delete' | 'permanent' | 'restore') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (action === 'delete') onBulkDelete(ids, true);
    else if (action === 'permanent') onBulkPermanentDelete(ids);
    else if (action === 'restore') onBulkDelete(ids, false);

    setSelectedIds(new Set());
  }, [selectedIds, onBulkDelete, onBulkPermanentDelete]);

  // Derived state for bulk actions
  const isAllSelectedOwnedByMe = useMemo(() => {
    if (selectedIds.size === 0) return false;
    const selectedSongs = userLibrary.filter(s => selectedIds.has(s.metadata.id));
    return selectedSongs.every(s => currentUserId && s.metadata.ownerId === currentUserId);
  }, [selectedIds, userLibrary, currentUserId]);

  const handleCameraCapture = useCallback(async ({ file }: { dataUrl: string; file: File }) => {
    setShowCamera(false);
    setIsProcessing(true);
    setProcessingMsg('🤖 Gemini AI กำลังอ่านโน้ตจากภาพ...');
    try {
      const { metadata, xmlData, layoutBundle } = await parseMusicXMLMetadata(file, true);
      metadata.origin = 'load';
      await songStorage.saveSong(metadata, xmlData, layoutBundle);
      await onLocalRefresh();
      onRefresh();
      // Go straight to player BEFORE hiding processing overlay
      onSongSelect(metadata, xmlData, 'listen');
      setIsProcessing(false); 
      setProcessingMsg('');
    } catch (err: any) {
      setProcessingError(err?.message || 'Camera processing failed');
      setProcessingMsg('');
    }
  }, [onRefresh, onLocalRefresh, onSongSelect]);


  // Load folders on mount
  useEffect(() => {
    songStorage.getFolders().then(setFolders);
  }, []);

  const handleExportDB = useCallback(async () => {
    try {
      const jsonStr = await songStorage.exportNeuralCore();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nimo-core-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('Failed to export database');
    }
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

  // Extract dynamic genre folders (Virtual Folders)
  const genreFolders = useMemo(() => {
    const genreMap = new Map<string, string>(); // normalized -> original
    
    // Always include these default genres
    const DEFAULT_GENRES = ['POP', 'ROCK', 'JAZZ', 'CLASSIC', 'ELECTRONIC', 'ACOUSTIC', 'R&B'];
    DEFAULT_GENRES.forEach(g => genreMap.set(g, g));

    userLibrary.forEach(i => {
      const g = i.metadata.genre || i.metadata.category;
      if (g) {
        const normalized = g.trim().toUpperCase();
        if (!genreMap.has(normalized)) {
          genreMap.set(normalized, g);
        }
      }
    });

    return Array.from(genreMap.keys()).sort().map((normalizedGenre, idx) => ({
      id: `virtual_genre_${normalizedGenre}`,
      name: normalizedGenre,
      color: FOLDER_COLORS[idx % FOLDER_COLORS.length],
      isVirtual: true,
      genreName: normalizedGenre
    }));
  }, [userLibrary]);

  const allFolders = useMemo(() => folders, [folders]);

  // Build dropdown options: actual song data + hardcoded presets (data values first)
  const uniqueGenres = useMemo(() => {
    const set = new Set<string>();
    userLibrary.forEach(s => {
      const g = (s.metadata.genre || s.metadata.category || '').trim();
      if (g) set.add(g);
    });
    ['Classical', 'Baroque', 'Romantic', 'Modern', 'Contemporary', 'Jazz', 'Pop', 'Rock', 'Blues', 'R&B', 'Hip Hop', 'Electronic', 'Acoustic', 'Folk', 'Country', 'Latin', 'World', 'Soundtrack', 'Anime', 'K-Pop', 'J-Pop', 'Bossa Nova', 'Lo-Fi', 'Metal', 'Soul', 'Funk', 'Disco', 'Reggae'].forEach(p => set.add(p));
    return Array.from(set).sort();
  }, [userLibrary]);

  const uniqueEras = useMemo(() => {
    const set = new Set<string>();
    userLibrary.forEach(s => {
      const m = s.metadata as any;
      let e = (m.era || '').trim();
      // Derive era from artist/composer if missing
      if (!e) e = detectEraFromName(m.composer || m.artist || '');
      if (e) set.add(e);
    });
    ['Baroque', 'Classical', 'Romantic', 'Impressionist', '20th Century', 'Contemporary', 'Traditional', 'Sacred/Hymn'].forEach(p => set.add(p));
    return Array.from(set).sort();
  }, [userLibrary]);

  const uniqueComposers = useMemo(() => {
    const set = new Set<string>();
    userLibrary.forEach(s => {
      const m = s.metadata as any;
      const c = (m.composer || m.artist || '').trim();
      if (c && c !== 'NA' && c !== 'Unknown') set.add(c);
    });
    return Array.from(set).sort();
  }, [userLibrary]);

  const uniqueYears = useMemo(() => {
    const set = new Set<string>();
    userLibrary.forEach(s => {
      const m = s.metadata as any;
      let y = String(m.year || '').trim();
      if (!y || y === 'undefined' || y === '0') {
        y = detectYearFromComposer(m.composer || m.artist || '');
      }
      if (y) set.add(y);
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [userLibrary]);

  const uniqueInstruments = useMemo(() => {
    const set = new Set<string>();
    userLibrary.forEach(s => {
      const m = s.metadata as any;
      const existing = m.instruments || [];
      if (existing.length > 0) {
        existing.forEach((inst: string) => {
          const i = inst.trim();
          if (i) set.add(i);
        });
      } else {
        // Derive from title
        detectInstrumentsFromTitle(m.title || '', m.genre || m.category || '').forEach(inst => set.add(inst));
      }
    });
    return Array.from(set).sort();
  }, [userLibrary]);

  const uniqueGrades = useMemo(() => {
    const set = new Set<string>();
    let debugCount = 0;
    userLibrary.forEach(s => {
      const m = s.metadata as any;
      // Brute-force: scan ALL property values for grade info
      for (const key of Object.keys(m)) {
        const val = m[key];
        if (typeof val !== 'string' || !val) continue;
        const v = val.trim();
        const gradeMatch = v.match(/^Grade\s*(\d+)$/i);
        if (gradeMatch) { set.add(`Grade ${gradeMatch[1]}`); debugCount++; break; }
        if (/^[1-8]$/.test(v)) { set.add(`Grade ${v}`); debugCount++; break; }
        if (/^(Beginner|Intermediate|Advanced|Expert|Diploma)$/i.test(v)) { set.add(v); debugCount++; break; }
      }
    });
    // TEMP DEBUG
    console.log(`[GRADE DEBUG] Total songs: ${userLibrary.length}, Songs with grade data: ${debugCount}, Unique grades found: [${Array.from(set).join(', ')}]`);
    if (userLibrary.length > 0) {
      const sample = userLibrary.slice(0, 3).map(s => {
        const m = s.metadata as any;
        return `"${m.title}" → ALL_KEYS:[${Object.keys(m).join(',')}] ALL_STRING_VALUES:[${Object.entries(m).filter(([,v]) => typeof v === 'string' && v).map(([k,v]) => `${k}="${v}"`).join(', ')}]`;
      });
      console.log('[GRADE DEBUG] Sample songs:', sample.join('\n'));
    }
    ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Diploma'].forEach(p => set.add(p));
    return Array.from(set).sort();
  }, [userLibrary]);

  // Counts
  const totalCount = useMemo(() => userLibrary.filter(i => !i.metadata.isDeleted).length, [userLibrary]);
  const homeCount = useMemo(() => userLibrary.filter(item => {
    if (item.metadata.isDeleted) return false;
    const m = item.metadata as any;
    let era = (m.era || '').toLowerCase().trim();
    if (!era) {
      era = detectEraFromName(m.composer || m.artist || '').toLowerCase();
    }
    return era === 'baroque' || era === 'classical' || era === 'romantic' || era === 'classic';
  }).length, [userLibrary]);
  const favCount = useMemo(() => userLibrary.filter(i => !i.metadata.isDeleted && i.metadata.isFavorite).length, [userLibrary]);
  const mySongsCount = useMemo(() => userLibrary.filter(i => !i.metadata.isDeleted && i.metadata.origin === 'load').length, [userLibrary]);
  const trashCount = useMemo(() => userLibrary.filter(i => i.metadata.isDeleted).length, [userLibrary]);

  // Filter & Logic
  const filteredLibrary = useMemo(() => {
    let list: typeof userLibrary = [];
    switch (activeTab) {
      case 'home':
        // Show only non-deleted songs from Baroque, Classical, and Romantic eras on the home tab
        list = userLibrary.filter(item => {
          if (item.metadata.isDeleted) return false;
          const m = item.metadata as any;
          let era = (m.era || '').toLowerCase().trim();
          if (!era) {
            era = detectEraFromName(m.composer || m.artist || '').toLowerCase();
          }
          return era === 'baroque' || era === 'classical' || era === 'romantic' || era === 'classic';
        });
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
      if (activeFolder.startsWith('virtual_genre_')) {
        const genreName = activeFolder.replace('virtual_genre_', '');
        list = list.filter(i => {
          const g = i.metadata.genre || i.metadata.category;
          return g && g.trim().toUpperCase() === genreName;
        });
      } else {
        list = list.filter(i => i.metadata.folderId === activeFolder);
      }
    }

    if (aiFilteredIds !== null) {
      list = list.filter(i => aiFilteredIds.includes(i.metadata.id));
    } else if (searchQuery) {
      const q = searchQuery.toLowerCase();
      
      // Parse grade numbers to prevent substring matches (e.g., matching "Grade 1" inside "Grade 11")
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
          const m = i.metadata as any;
          const dGradeRaw = m.difficulty_grade || m.difficultyGrade || m.difficulty || m.grade || '';
          const dGrade = String(dGradeRaw).trim().toLowerCase();
          const itemGradeNumMatch = dGrade.match(/\d+/);
          const itemGradeNum = itemGradeNumMatch ? parseInt(itemGradeNumMatch[0], 10) : null;
          
          // Also check title for grade info (e.g. "Minuet - Grade 3")
          const titleText = `${m.title || ''} ${m.artist || ''}`.toLowerCase();
          const titleGradeMatch = titleText.match(/grade\s*(\d+)/);
          const titleGradeNum = titleGradeMatch ? parseInt(titleGradeMatch[1], 10) : null;
          
          if (itemGradeNum !== targetGradeNum && titleGradeNum !== targetGradeNum) {
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
    if (filterEra) list = list.filter(i => {
      const m = i.metadata as any;
      // Check existing era field or derive from composer/artist
      let era = (m.era || '').toLowerCase().trim();
      if (!era) {
        era = detectEraFromName(m.composer || m.artist || '').toLowerCase();
      }
      const fe = filterEra.toLowerCase().trim();
      if (!era) return false;
      return era === fe || era.includes(fe) || fe.includes(era);
    });
    if (filterComposer) list = list.filter(i => {
      const m = i.metadata as any;
      const composer = (m.composer || '').toLowerCase();
      const artist = (m.artist || '').toLowerCase();
      const fc = filterComposer.toLowerCase();
      // Match exact or partial (e.g. "Debussy" matches "Claude Debussy" or "C. Debussy")
      return composer === fc || artist === fc || 
             composer.includes(fc) || fc.includes(composer) ||
             artist.includes(fc) || fc.includes(artist);
    });
    if (filterYear) list = list.filter(i => {
      const m = i.metadata as any;
      let year = String(m.year || '').trim();
      // Derive year from composer name if missing
      if (!year || year === 'undefined' || year === '0') {
        year = detectYearFromComposer(m.composer || m.artist || '');
      }
      if (!year) return false;
      const fy = Number(filterYear);
      const sy = Number(year);
      // Match within ±20 year range for approximate matching
      return Math.abs(sy - fy) <= 20;
    });
    if (filterInstrument) list = list.filter(i => {
      const m = i.metadata as any;
      // Check existing instruments array
      const existing = m.instruments || [];
      if (existing.length > 0) {
        return existing.some((inst: string) => inst.toLowerCase() === filterInstrument.toLowerCase());
      }
      // Derive from title
      const detected = detectInstrumentsFromTitle(m.title || '', m.genre || m.category || '');
      return detected.some(inst => inst.toLowerCase() === filterInstrument.toLowerCase());
    });
    if (filterGrade && filterGrade !== 'All') {
      list = list.filter(i => {
        const m = i.metadata as any;
        
        // Brute-force: scan ALL metadata values for grade info
        let foundGrade = '';
        for (const key of Object.keys(m)) {
          const val = m[key];
          if (typeof val !== 'string' || !val) continue;
          const v = val.trim();
          // Match "Grade X" format
          const gradeMatch = v.match(/^Grade\s*(\d+)$/i);
          if (gradeMatch) { foundGrade = `Grade ${gradeMatch[1]}`; break; }
          // Match plain number 1-8
          if (/^[1-8]$/.test(v)) { foundGrade = `Grade ${v}`; break; }
          // Match difficulty labels
          if (/^(Beginner|Intermediate|Advanced|Expert|Diploma)$/i.test(v)) { foundGrade = v; break; }
        }
        
        // Also check title for grade info (e.g. "Minuet - Grade 3")
        if (!foundGrade) {
          const titleText = `${m.title || ''} ${m.artist || ''}`;
          const titleMatch = titleText.match(/Grade\s*(\d+)/i);
          if (titleMatch) foundGrade = `Grade ${titleMatch[1]}`;
          // Check for difficulty words in title
          const diffMatch = titleText.match(/\b(Beginner|Intermediate|Advanced|Expert|Diploma)\b/i);
          if (diffMatch && !foundGrade) foundGrade = diffMatch[1];
        }
        
        if (!foundGrade) return filterGrade === 'None';
        
        // Compare
        if (filterGrade === 'None') return false;
        if (filterGrade.includes('-')) {
          const rangeMatch = filterGrade.match(/Grade\s+(\d+)-(\d+)/i);
          if (rangeMatch) {
            const min = parseInt(rangeMatch[1]);
            const max = parseInt(rangeMatch[2]);
            const num = parseInt(foundGrade.replace(/Grade\s*/i, '') || '0');
            return num >= min && num <= max;
          }
        }
        return foundGrade.toLowerCase() === filterGrade.toLowerCase();
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
  }, [userLibrary, searchQuery, activeTab, sortMode, activeFolder, aiFilteredIds, filterGenre, filterEra, filterComposer, filterYear, filterInstrument, filterGrade]);

  const recentSongs = useMemo(() => {
    try {
      const stored = localStorage.getItem('memo_recent_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) return parsed;
      }
    } catch(e) {}
    return userLibrary.filter(it => !it.metadata.isDeleted).reverse().slice(0, 5).map(it => it.metadata);
  }, [userLibrary]);

  const topClassicalSongs = useMemo(() => {
    const classical = userLibrary.filter(it => {
      if (!it || !it.metadata || it.metadata.isDeleted) return false;
      const explicitEra = it.metadata.era && it.metadata.era !== 'NA' ? it.metadata.era : null;
      // Many XMLs put composer name inside the title or artist field
      const textToSearch = `${it.metadata.composer || ''} ${it.metadata.artist || ''} ${it.metadata.title || ''}`;
      const era = (explicitEra || detectEraFromName(textToSearch)).toLowerCase();
      
      const isClassicalEra = ['baroque', 'classical', 'romantic', 'impressionist', '20th century', 'contemporary'].includes(era);
      const isRanked = getClassicalRank(textToSearch, it.metadata.title || '') < 999;
      
      return isClassicalEra || isRanked;
    });
    classical.sort((a, b) => {
      const textA = `${a.metadata.composer || ''} ${a.metadata.artist || ''} ${a.metadata.title || ''}`;
      const textB = `${b.metadata.composer || ''} ${b.metadata.artist || ''} ${b.metadata.title || ''}`;
      const rankA = getClassicalRank(textA, a.metadata.title || '');
      const rankB = getClassicalRank(textB, b.metadata.title || '');
      
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      
      const aPop = (a.metadata.views || 0) + (a.metadata.playCount || 0) * 2 + (a.metadata.likes || 0) * 5;
      const bPop = (b.metadata.views || 0) + (b.metadata.playCount || 0) * 2 + (b.metadata.likes || 0) * 5;
      return bPop - aPop;
    });
    return classical.slice(0, 500).map(it => it.metadata);
  }, [userLibrary]);

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

    const fileList: File[] = Array.from(files as FileList);
    const file = fileList[0];

    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isImg = /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name) || file.type.startsWith('image/');

    if (isPdf || isImg) {
      // Route to ScoreSelectionModal for cropping
      setPendingSelectionFile(file);
      e.target.value = '';
      return;
    }

    // Non-image files (XML, MIDI) go directly to processImport
    e.target.value = '';
    processImport(fileList);
  };

  const processImport = async (files: File | File[] | Blob, originalFileName?: string, startPage?: number, endPage?: number) => {
    console.log('[Import] 🚀 processImport called:', { files, originalFileName });
    setProcessingError(null);
    setIsProcessing(true);
    setProcessingMsg('🤖 Pass 1: Gemini กำลังอ่านโน้ต...');

    let fileList: File[];
    if (Array.isArray(files)) {
      fileList = files;
    } else if (files instanceof File) {
      fileList = [files];
    } else {
      fileList = [new File([files], originalFileName || 'upload.jpg', { type: 'image/jpeg' })];
    }

    console.log('[Import] fileList:', fileList.map(f => `${f.name} (${f.type}, ${(f.size/1024).toFixed(0)}KB)`));

    try {
      let lastMetadata: any = null;
      let lastXml = '';

      if (fileList.length === 1) {
        const f = fileList[0];
        console.log(`[Import] Processing file: ${f.name}`);
        const { metadata, xmlData, layoutBundle } = await parseMusicXMLMetadata(f, true, (msg) => setProcessingMsg(msg), startPage, endPage);
        
        if (originalFileName && (metadata.title === 'NEURAL MASTERPIECE' || metadata.title.includes('UNTITLED'))) {
          metadata.title = originalFileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') + ' (Selection)';
        }
        metadata.origin = 'load';
        setPendingImport({ metadata, xmlData, layoutBundle });
        setIsProcessing(false);
        return;
      }

      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        console.log(`[Import] Processing file ${i+1}/${fileList.length}: ${f.name} (${f.type}, ${f.size} bytes)`);

        if (fileList.length > 1) setProcessingMsg(`ไฟล์ ${i + 1}/${fileList.length}...`);
        setProcessingMsg('🤖 Pass 1: Gemini กำลังอ่านโน้ต...');

        console.log('[Import] Calling parseMusicXMLMetadata...');
        const { metadata, xmlData, layoutBundle } = await parseMusicXMLMetadata(f, true, (msg) => setProcessingMsg(msg), startPage, endPage);
        console.log('[Import] ✅ parseMusicXMLMetadata returned:', metadata.title, '| xmlData length:', xmlData.length);

        setProcessingMsg('💾 กำลังบันทึกลง My Songs...');

        if (originalFileName && (metadata.title === 'NEURAL MASTERPIECE' || metadata.title.includes('UNTITLED'))) {
          metadata.title = originalFileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') + ' (Selection)';
        }

        metadata.origin = 'load';
        console.log('[Import] Saving to IndexedDB:', metadata.id, metadata.title);
        await songStorage.saveSong(metadata, xmlData, layoutBundle);
        console.log('[Import] ✅ Saved to IndexedDB');
        lastMetadata = metadata;
        lastXml = xmlData;
      }

      setProcessingMsg('✅ บันทึกเรียบร้อย! กำลังเปิด Player...');
      
      // Play C Major Arpeggio Success Sound
      try {
        const Tone = await import('tone');
        await Tone.start();
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 2 }
        }).toDestination();
        synth.volume.value = -12;
        const now = Tone.now();
        synth.triggerAttackRelease("C4", "8n", now);
        synth.triggerAttackRelease("E4", "8n", now + 0.15);
        synth.triggerAttackRelease("G4", "8n", now + 0.3);
        synth.triggerAttackRelease("C5", "2n", now + 0.45);
      } catch (e) {
        console.log('Audio play failed', e);
      }

      console.log('[Import] Refreshing song list...');
      await onLocalRefresh();
      onRefresh();

      if (lastMetadata && lastXml) {
        console.log('[Import] 🎵 Navigating to Player with:', lastMetadata.title);
        
        // Go straight to player BEFORE hiding processing overlay to prevent Home bounce
        onSongSelect(lastMetadata, lastXml, 'listen');
        
        setIsProcessing(false);
        setProcessingMsg('');
      } else {
        setIsProcessing(false);
        setProcessingMsg('');
      }
    } catch (err: any) {
      console.error('[Import] ❌ FULL ERROR:', err);
      // Keep isProcessing=true but set error so overlay shows it
      setProcessingError(err?.message || 'Failed to process file');
      setProcessingMsg(''); 
    }
  };

  const handleSavePendingImport = async () => {
    if (!pendingImport) return;
    setIsProcessing(true);
    setProcessingMsg('💾 กำลังบันทึกลง My Songs...');
    try {
      await songStorage.saveSong(pendingImport.metadata, pendingImport.xmlData, pendingImport.layoutBundle);
      
      // Play C Major Arpeggio Success Sound
      try {
        const Tone = await import('tone');
        await Tone.start();
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 2 }
        }).toDestination();
        synth.volume.value = -12;
        const now = Tone.now();
        synth.triggerAttackRelease("C4", "8n", now);
        synth.triggerAttackRelease("E4", "8n", now + 0.15);
        synth.triggerAttackRelease("G4", "8n", now + 0.3);
        synth.triggerAttackRelease("C5", "2n", now + 0.45);
      } catch (e) {
        console.log('Audio play failed', e);
      }

      await onLocalRefresh();
      onRefresh();
      onSongSelect(pendingImport.metadata, pendingImport.xmlData, 'listen');
    } catch (e) {
      console.error(e);
      alert('Failed to save song');
    } finally {
      setIsProcessing(false);
      setPendingImport(null);
    }
  };


  const TABS: { id: FilterTab, label: string, count: number, color: string }[] = [
    { id: 'home', label: 'Home', count: homeCount, color: 'text-cyan-400' },
    { id: 'favorites', label: 'Favorites', count: favCount, color: 'text-rose-400' },
    { id: 'mysongs', label: 'My Songs', count: mySongsCount, color: 'text-amber-400' },
    { id: 'trash', label: 'Trash', count: trashCount, color: 'text-zinc-500' },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0A0A0B] overflow-y-auto overflow-x-hidden select-none" onScroll={handleScroll}>
      {/* ── HEADER / SEARCH & RECENT (STATIC TOP) ── */}
      <div className="shrink-0 px-6 pt-6 pb-2 space-y-5 bg-gradient-to-b from-white/[0.02] to-transparent border-b border-white/5">

        {/* Brand/Hero & Now Playing Widget */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col items-start gap-1.5">
            <h1 className="text-2xl font-black text-white tracking-[0.4em] uppercase italic">MEMOLODY</h1>
            <p className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
              Hear by Eye, Play by Ear
              <button onClick={handleExportDB} className="text-[7px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full hover:bg-cyan-500/30 transition-colors cursor-pointer">EXPORT DB</button>
            </p>
          </div>

          {/* Now Playing Widget */}
          <div className="flex items-center gap-3 bg-black/30 backdrop-blur-md px-3 py-2 rounded-full border border-white/5 cursor-pointer hover:bg-black/50 transition-colors" onClick={() => {
            const bgm = bgmRef.current;
            if (bgm) {
              if (bgm.paused) bgm.play().catch(()=>{});
              else bgm.pause();
            }
          }}>
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 animate-[spin_10s_linear_infinite]">
              <img src={bgmCover || '/images/memolody_hero.png'} alt="Cover" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col pr-2 hidden sm:flex">
              <span className="text-[7px] text-cyan-400 font-black tracking-widest uppercase">NOW PLAYING</span>
              <span className="text-[10px] text-white font-medium truncate max-w-[120px]">{bgmTitle || 'Where Dreams Align'}</span>
            </div>
          </div>
        </div>

        {/* Hidden file input (kept for programmatic import from + button) */}
        <input
          ref={cameraInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".xml,.musicxml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
          onChange={handleImport}
        />

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative group flex-1">
          <button 
            onClick={() => setSearchQuery(searchInput)}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-cyan-400 transition-colors z-10 hover:text-cyan-300"
          >
            <Search size={16} />
          </button>
          <input
            type="text"
            placeholder="FIND YOUR MUSIC..."
            value={searchInput}
            onChange={e => {
              setSearchInput(e.target.value);
              setAiFilteredIds(null);
              setSearchQuery(e.target.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setAiFilteredIds(null);
                setSearchQuery(searchInput);
              }
            }}
            className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-20 text-xs font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800 transition-all uppercase"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearchQuery(''); setAiFilteredIds(null); }} className="text-zinc-600 hover:text-white transition-colors p-1.5">
                  <X size={14} />
                </button>
              )}
              <button
                onClick={async () => {
                  if (!searchInput.trim()) return;
                  setIsAiSearching(true);
                  setAiFilteredIds(null);
                  try {
                    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
                    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
                    const ai = new GoogleGenAI({ apiKey });
                    
                    const prompt = `You are a music search intent extractor. User query: "${searchInput}". 
Extract search parameters into JSON. Return ONLY JSON with this format: 
{ "keywords": ["..."], "genres": ["..."], "moods": ["..."], "instruments": ["..."], "era": ["..."] }
If a field is not relevant, leave the array empty. Translate concepts into English keywords if needed.`;

                    const response = await ai.models.generateContent({ model: 'gemini-1.5-flash', contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.1 } });
                    const params = JSON.parse(response.text || '{}');
                    
                    let matches = userLibrary;
                    const allKeywords = [
                      ...(params.keywords || []), ...(params.genres || []), ...(params.moods || []), ...(params.instruments || []), ...(params.era || [])
                    ].map((k: string) => k.toLowerCase());

                    if (allKeywords.length > 0) {
                      matches = matches.filter(song => {
                        const m = song.metadata;
                        const rawGrade = m.difficulty_grade || m.difficultyGrade || m.difficulty || m.grade || '';
                        let dGrade = String(rawGrade).trim();
                        if (/^[1-8]$/.test(dGrade)) dGrade = `Grade ${dGrade}`;
                        
                        const textToSearch = [m.title, m.artist, m.genre, m.mood, m.era, m.composer, dGrade, ...(m.instruments || [])].filter(Boolean).join(' ').toLowerCase();
                        return allKeywords.some(kw => textToSearch.includes(kw));
                      });
                    }
                    
                    setAiFilteredIds(matches.map(m => m.metadata.id));
                    setSearchQuery(searchInput);
                  } catch (e) {
                    console.error(e);
                    setSearchQuery(searchInput);
                  } finally {
                    setIsAiSearching(false);
                  }
                }}
                className={`p-1.5 rounded-lg transition-colors ${isAiSearching ? 'text-cyan-400 animate-pulse' : 'text-zinc-500 hover:text-cyan-400'}`}
                title="AI Smart Search"
                disabled={isAiSearching}
              >
                <Sparkles size={16} className={isAiSearching ? 'animate-spin' : ''} />
              </button>
              
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`p-1.5 rounded-lg transition-colors ${showFilters || filterGenre || filterInstrument || filterEra || filterYear || filterComposer || filterGrade !== 'All' ? 'text-cyan-400' : 'text-zinc-500 hover:text-cyan-400'}`}
                title="Styles & Filters"
              >
                <Database size={16} /> 
              </button>
            </div>
          </div>
        </div>

        {/* ── ADVANCED FILTERS PANEL ── */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-[20px] animate-in slide-in-from-top-2 duration-200">
            {/* Genre */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Genre</label>
              <select 
                value={filterGenre}
                onChange={e => setFilterGenre(e.target.value)}
                className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="">All Genres</option>
                {uniqueGenres.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            {/* Era */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Era</label>
              <select 
                value={filterEra}
                onChange={e => setFilterEra(e.target.value)}
                className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="">All Eras</option>
                {uniqueEras.map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            {/* Composer */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Composer</label>
              <select 
                value={filterComposer}
                onChange={e => setFilterComposer(e.target.value)}
                className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="">All Composers</option>
                {uniqueComposers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {/* Year */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Year</label>
              <select 
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
                className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="">All Years</option>
                {uniqueYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {/* Instruments */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Instruments</label>
              <select 
                value={filterInstrument}
                onChange={e => setFilterInstrument(e.target.value)}
                className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="">All Instruments</option>
                {uniqueInstruments.map(inst => (
                  <option key={inst} value={inst}>{inst}</option>
                ))}
              </select>
            </div>
            {/* Grade */}
            <div className="space-y-1">
              <label className="text-[7px] font-black text-zinc-600 uppercase tracking-widest ml-2">Grade</label>
              <select 
                value={filterGrade}
                onChange={e => setFilterGrade(e.target.value)}
                className="w-full bg-[#111] border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-zinc-400 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="All">All</option>
                {uniqueGrades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
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
        )}
      </div>

      {/* Top Charts Matrix (Horizontal Scroll) */}
      <div className="space-y-2 mb-6">
        <div className="flex items-center justify-between px-1">
          <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1"><Star size={10} /> Top Charts</span>
          <span className="text-[8px] font-mono text-zinc-700">Global</span>
        </div>
        {topClassicalSongs.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 overflow-y-auto max-h-[320px] px-1 pb-2 custom-scrollbar">
            {topClassicalSongs.map((item, index) => (
              <div key={item.id} onClick={() => onSongSelect(item, undefined, 'listen')}
                className="flex flex-col gap-1.5 group/card cursor-pointer relative bg-white/[0.02] p-2 rounded-xl border border-white/5 hover:bg-white/[0.05] transition-all">
                {/* Rank Badge */}
                {index < 3 ? (
                  <div className="absolute top-0 left-0 -mt-2 -ml-2 w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-black flex items-center justify-center text-[10px] font-black shadow-lg z-10 border-2 border-[#0a0a0b]">
                    <span className="text-[12px] -mt-[1px]">👑</span>
                  </div>
                ) : index < 100 ? (
                  <div className="absolute top-0 left-0 -mt-2 -ml-2 w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center text-[10px] font-black shadow-lg z-10 border border-[#0a0a0b]">
                    <Star size={10} fill="currentColor" />
                  </div>
                ) : (
                  <div className="absolute top-0 left-0 -mt-2 -ml-2 w-6 h-6 rounded-full bg-zinc-700 text-white flex items-center justify-center text-[9px] font-black shadow-lg z-10 border border-[#0a0a0b]">
                    {index + 1}
                  </div>
                )}
                {/* Cover Area */}
                <div className="w-full aspect-video rounded-lg overflow-hidden relative shadow-md group-hover/card:shadow-lg border border-white/10 mb-1">
                  <AbstractCover seed={item.title || item.id} size={140} />
                  
                  {/* Default small play button overlay */}
                  <div className="absolute bottom-2 left-2 flex items-center justify-center pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity z-20">
                    <div 
                      className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-black shadow-lg shadow-amber-500/20 hover:scale-110 transition-transform pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSongSelect(item, undefined, 'play');
                      }}
                    >
                      <Play size={14} fill="currentColor" className="ml-1" />
                    </div>
                  </div>
                  
                  {/* Favorite Icon */}
                  {item.isFavorite && <Heart size={14} className="text-rose-500 fill-rose-500 absolute top-2 right-2 z-20 shadow-sm" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[10px] font-black text-white truncate leading-tight group-hover/card:text-amber-400 transition-colors flex items-center gap-1">
                    {item.title || 'Untitled Song'}
                    {isSongFullyRendered(item.id) && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-px bg-emerald-500/20 rounded-full shrink-0" title="AI Vocal Ready - All 12 keys rendered">
                        <Sparkles size={6} className="text-emerald-400" />
                      </span>
                    )}
                  </h3>
                  <p className="text-[8px] font-bold text-zinc-500 truncate mt-0.5 uppercase tracking-widest">{item.artist || item.composer || 'Unknown Artist'}</p>
                </div>
                <div className="text-[7px] text-zinc-600 font-mono mt-auto pt-1 border-t border-white/5 flex justify-between">
                  <span className="text-amber-500/70">CLASSICAL TOP 500</span>
                  {item.difficultyGrade && <span className="text-cyan-600">{item.difficultyGrade}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-2 py-6 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">No chart data yet. Play a song to start tracking!</p>
          </div>
        )}
      </div>

      {/* Recent Matrix (Horizontal Scroll) */}
        {recentSongs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest italic">Recent</span>
              <span className="text-[8px] font-mono text-zinc-700">{totalCount} songs</span>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar px-1">
              {recentSongs.map(item => (
                <div key={item.id} onClick={() => onSongSelect(item, undefined, 'listen')}
                  className="shrink-0 w-[calc(33.33%-6px)] flex flex-col gap-1.5 group/card cursor-pointer">
                  {/* Cover Image Area */}
                  <div className="w-full aspect-video rounded-xl overflow-hidden relative shadow-md group-hover/card:shadow-lg group-hover/card:shadow-cyan-500/10 border border-white/10 transition-all group-hover/card:-translate-y-1">
                    <AbstractCover seed={item.title || item.id} size={200} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-50" />
                    
                    {/* Play Button Overlay */}
                    {(() => {
                      try {
                        const histStr = localStorage.getItem(`memo_render_history_${item.id}`);
                        const hasRendered = histStr ? (JSON.parse(histStr) || []).length > 0 : false;
                        if (hasRendered) {
                          return (
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none group-hover/card:bg-black/40 transition-all">
                              <div 
                                className="w-8 h-8 rounded-full bg-cyan-500/90 backdrop-blur-sm flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.5)] pointer-events-auto cursor-pointer hover:scale-110 active:scale-95 transition-transform"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSongSelect(item, undefined, 'play');
                                }}
                              >
                                <Play size={16} className="text-black fill-black ml-0.5" />
                              </div>
                            </div>
                          );
                        }
                      } catch (e) {}
                      
                      // Default small play button if not rendered
                      return (
                        <div className="absolute bottom-1.5 left-1.5 flex items-center justify-center pointer-events-none">
                          <div 
                            className="w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 group-hover/card:text-cyan-400 group-hover/card:bg-cyan-500/20 transition-colors pointer-events-auto cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSongSelect(item, undefined, 'play');
                            }}
                          >
                            <Play size={10} fill="currentColor" className="ml-0.5" />
                          </div>
                        </div>
                      );
                    })()}
                    
                    {/* Favorite Icon */}
                    {item.isFavorite && <Heart size={10} className="text-rose-500 fill-rose-500 absolute top-1.5 right-1.5" />}
                  </div>
                  
                  {/* Title Area (Outside the cover) */}
                  <div className="px-0.5">
                    <p className="text-[10px] leading-tight font-black text-white uppercase italic truncate">{item.title || 'Untitled Song'}</p>
                    <p className="text-[8px] leading-tight text-zinc-500 uppercase tracking-wider truncate mt-0.5">{item.artist || 'Unknown Artist'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* ── TOTAL MATRIX / VAULT (SCROLLABLE BOTTOM) ── */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* Section Tabs & Sort */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.03]">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setActiveFolder(null); setSelectedIds(new Set()); }}
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

        {/* Folder Pills (wrapped and scrollable) */}
        {allFolders.length > 0 && activeTab !== 'trash' && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/[0.03] max-h-32 overflow-y-auto custom-scrollbar">
            <button
              onClick={() => setActiveFolder(null)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors
                ${!activeFolder ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300'}`}
            >
              All
            </button>
            {allFolders.map((f: any) => (
              <div
                key={f.id}
                onClick={() => setActiveFolder(activeFolder === f.id ? null : f.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer
                  ${activeFolder === f.id ? 'bg-white/10 text-white border-white/20' : 'bg-white/[0.03] border-white/[0.02] text-zinc-400 hover:text-white'} border group/pill`}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                {f.name}
                <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }}
                  className="ml-1 text-zinc-800 hover:text-rose-400 opacity-0 group-hover/pill:opacity-100 transition-opacity">
                  <X size={8} />
                </button>
              </div>
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

        {/* Song List */}
        <div className="pb-32">
          {isAiSearching ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-800">
              <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 animate-pulse">AI is searching...</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-zinc-800">
              {isSyncing && !searchQuery ? (
                <>
                  <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 animate-pulse">Syncing Database...</p>
                </>
              ) : (
                <>
                  <Database size={24} className="mb-2 opacity-10" />
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-20">
                    {searchQuery ? 'No songs match your search' :
                      activeTab === 'favorites' ? 'No Favorites Yet' :
                        activeTab === 'mysongs' ? 'No Imported Songs' :
                          activeTab === 'trash' ? 'Trash is Empty' : 'No songs found'}
                  </p>
                </>
              )}
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
                  isSelected={selectedIds.has(item.metadata.id)}
                  onToggleSelect={handleToggleSelect}
                  onTogglePublic={onTogglePublic}
                  activeTab={activeTab}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
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
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">MusicXML · MIDI · PDF · PNG · JPG · Scan Score</p>
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full h-14 bg-cyan-500 text-black rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-transform">
              Select Files
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" accept=".xml,.musicxml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif" onChange={handleImport} />
          </div>
        </div>
      )}

      {/* ── Pending Import Metadata Modal ── */}
      {pendingImport && (
        <div className="fixed inset-0 z-[20000] bg-black/95 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#111] border border-white/10 rounded-[32px] p-8 flex flex-col gap-6 relative">
            <button onClick={() => setPendingImport(null)} className="absolute top-6 right-6 text-zinc-600 hover:text-white"><X size={20} /></button>
            <div className="text-center mt-2">
              <h2 className="text-xl font-black text-white italic tracking-tighter uppercase mb-1">Song Details</h2>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Customize before saving</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Title</label>
                <input
                  type="text"
                  value={pendingImport.metadata.title}
                  onChange={e => setPendingImport({...pendingImport, metadata: {...pendingImport.metadata, title: e.target.value}})}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-cyan-500/50"
                  placeholder="Song Title"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Artist / Composer</label>
                <input
                  type="text"
                  value={pendingImport.metadata.artist || ''}
                  onChange={e => setPendingImport({...pendingImport, metadata: {...pendingImport.metadata, artist: e.target.value}})}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-cyan-500/50"
                  placeholder="Artist"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Genre</label>
                  <input
                    type="text"
                    value={pendingImport.metadata.genre || ''}
                    onChange={e => setPendingImport({...pendingImport, metadata: {...pendingImport.metadata, genre: e.target.value}})}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-cyan-500/50"
                    placeholder="Pop, Rock..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Year</label>
                  <input
                    type="text"
                    value={pendingImport.metadata.year || ''}
                    onChange={e => setPendingImport({...pendingImport, metadata: {...pendingImport.metadata, year: e.target.value}})}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-cyan-500/50"
                    placeholder="2024"
                  />
                </div>
              </div>
            </div>

            <button onClick={handleSavePendingImport}
              className="w-full h-12 bg-cyan-500 text-black rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-transform mt-2 flex items-center justify-center gap-2">
              <Database size={14} />
              Save to My Songs
            </button>
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

      {/* ── BULK ACTION BAR ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-4 bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-[28px] shadow-2xl z-[10000] flex items-center gap-6 animate-in slide-in-from-bottom-8 duration-300">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-white uppercase italic tracking-widest">{selectedIds.size} STREAMS SELECTED</span>
            <button
              onClick={() => handleSelectAll(filteredLibrary.map(i => i.metadata.id))}
              className="text-[8px] font-bold text-cyan-400 uppercase text-left hover:text-white transition-colors"
            >
              {selectedIds.size === filteredLibrary.length ? 'DESELECT ALL' : 'SELECT ALL SONGS'}
            </button>
          </div>

          <div className="h-8 w-[1px] bg-white/10" />

          <div className="flex gap-2">
            {activeTab === 'trash' ? (
              <>
                <button
                  onClick={() => handleBulkAction('restore')}
                  className="px-5 py-2.5 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-400 transition-all flex items-center gap-2"
                >
                  <RotateCcw size={12} /> RESTORE
                </button>
                <button
                  onClick={() => handleBulkAction('permanent')}
                  className="px-5 py-2.5 bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-400 transition-all flex items-center gap-2"
                >
                  <Trash2 size={12} /> PURGE FOREVER
                </button>
              </>
            ) : (activeTab !== 'home' || isAdmin || isAllSelectedOwnedByMe) ? (
              <button
                onClick={() => handleBulkAction('delete')}
                className="px-5 py-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 hover:text-white transition-all flex items-center gap-2"
              >
                <Trash2 size={12} /> MOVE TO TRASH
              </button>
            ) : null}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-5 py-2.5 bg-white/5 text-zinc-400 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* ── Camera Capture Modal ── */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* ── OCR / Import Processing Overlay ── */}
      {isProcessing && (
        <ProcessingOverlay
          message={processingMsg}
          error={processingError}
          onDismiss={() => { setIsProcessing(false); setProcessingMsg(''); setProcessingError(null); }}
        />
      )}




      {/* Selective Crop Modal */}
      {pendingSelectionFile && (
        <ScoreSelectionModal
          file={pendingSelectionFile}
          onConfirm={(croppedBlob, startPage, endPage) => {
            const fileName = pendingSelectionFile.name;
            console.log('[ScoreSelection] ✅ onConfirm called. croppedBlob:', croppedBlob, 'type:', croppedBlob instanceof File ? (croppedBlob as File).type : 'Blob', 'size:', croppedBlob.size);
            setPendingSelectionFile(null); // close modal
            // processImport handles the rest (Gemini Vision → save → Player)
            processImport(croppedBlob, fileName, startPage, endPage);
          }}
          onCancel={() => setPendingSelectionFile(null)}
        />
      )}
    </div>
  );
};

export default HomePage;
