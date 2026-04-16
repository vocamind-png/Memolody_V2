
export enum ChromaticSolfege {
  DOH = 'Doh', DI = 'di', RE = 'Re', RI = 'ri', ME = 'Me',
  FAH = 'Fah', FI = 'fi', SOL = 'Sol', SI = 'si', LAH = 'Lah',
  LI = 'li', TI = 'Ti', RU = 'ru', MU = 'mu', SU = 'su',
  LU = 'lu', TU = 'tu'
}

export type LyricMode = 
  | 'American Movable Do' | 'American Fixed Do' 
  | 'British Movable Doh' | 'British Fixed Doh' 
  | 'Ju Solfege Movable Doh' | 'Ju Solfege Fixed Doh' 
  | 'Jianpu' | 'Kodaly' | 'Kodaly Rhythm' 
  | 'Indian Sargam' | 'Lyric' | 'Close';
export type ScoreLayoutMode = 'auto' | 'infinite' | 'horizontal' | 'paginated';
export type ViewId = 'home' | 'library' | 'player' | 'profile' | 'forge' | 'distribution' | 'settings' | 'nimo' | 'presentation';

export interface MusicalMemo {
  id: string;
  songId?: string;
  songTitle?: string;
  scheduledTime: string;
  label: string;
  isActive: boolean;
  days?: string[];
  details?: string;
  playbackStartTime?: number;
  playbackEndTime?: number;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm: number;
  key: string;
  audioUrl: string;
  coverUrl: string;
  musicXmlUrl?: string;
  isPremium: boolean;
  category: string;
  difficulty: string;
  price?: number;
  isDraft?: boolean;
  ownerId?: string;
  ownerName?: string;
  createdAt?: string;
  isPublic?: boolean;
  isForSale?: boolean;
  salePrice?: number;
  origin?: 'create' | 'load' | 'bought';
  isDeleted?: boolean;
  isFavorite?: boolean;
  folderId?: string;
  views?: number;
  likes?: number;
  commentCount?: number;
  isLiked?: boolean;
}

export interface SongFolder {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface TrackState {
  id: string;
  name: string;
  isMuted: boolean;
  isSolo: boolean;
  lyricMode: LyricMode;
  volume: number;
  pan: number;
  isArmed?: boolean;
  mode?: 'instrument' | 'vocal';
  instrument?: string;
  pluginId?: 'memolody-sampler' | 'svs-vocal' | null;
  pluginSettings?: any;
  effects: (EffectInstance | null)[];
}

export interface ParsedNote {
  trackId: string;
  step: string;
  octave: number;
  alter: number;
  duration: number;
  startTime: number;
  solfege: string;
  staff?: number; // 1 for Treble Clef, 2 for Bass Clef
  voice?: number; // For multiple voices within the same staff
  measure?: string;
}

export interface PluginDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: any[];
}

export interface EffectInstance {
  definition: PluginDefinition;
  isBypassed: boolean;
}

export interface TextAnnotation {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export interface ScheduleSlot {
  id: string;
  day: string;
  time: string;
  activity: string;
  isPublic: boolean;
}

export interface CreatorProfile {
  id: string;
  name: string;
  avatarUrl: string;
  bio: string;
  isOnline: boolean;
  followers: number;
  matrixCount: number;
  schedule: ScheduleSlot[];
  calendar: any[];
}

export interface EffectCategory {
  name: string;
  plugins: PluginDefinition[];
}
