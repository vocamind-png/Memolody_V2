

import { Song } from '../types';

export interface MemolodyFile {
  version: string;
  metadata: Partial<Song>;
  rawXml: string;
  annotations: {
    drawings: any[];
    fingering: Record<string, string>; // noteId -> finger
    lyrics: Record<string, string>; // noteId -> custom lyric
  };
  dawSyncData: {
    tempoMap: { time: number, bpm: number }[];
    measureMap: { index: number, audioStartTime: number }[];
    sampleRate: number;
  };
}

export const exportToMemolody = (data: MemolodyFile): string => {
  return JSON.stringify(data, null, 2);
};

export const loadMemolodyFile = (jsonString: string): MemolodyFile => {
  return JSON.parse(jsonString);
};

export const downloadMemolodyFile = (data: MemolodyFile, fileName: string) => {
  const blob = new Blob([exportToMemolody(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.split('.')[0]}.memolody`;
  a.click();
  URL.revokeObjectURL(url);
};