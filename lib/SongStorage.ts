
import { Song, MusicalMemo, SongFolder } from '../types';

interface StoredSong {
  metadata: Song;
  xmlData: string;
}

export interface NeuralStats {
  totalLimit: number;
  spentVocal: number;
  spentNimo: number;
  lastUpdated: string;
}

export class SongStorage {
  private dbName = 'MemolodyDB_v2'; // เราใช้ V2 เพื่อรองรับระบบ AI ใหม่
  private storeName = 'user_songs';
  private historyStore = 'listening_history';
  private favoritesStore = 'favorites';
  private memoStore = 'musical_memos';
  private statsStore = 'usage_stats';
  private foldersStore = 'song_folders';
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 6);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'metadata.id' });
        }
        if (!db.objectStoreNames.contains(this.historyStore)) {
          db.createObjectStore(this.historyStore, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.favoritesStore)) {
          db.createObjectStore(this.favoritesStore, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.memoStore)) {
          db.createObjectStore(this.memoStore, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.statsStore)) {
          db.createObjectStore(this.statsStore, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.foldersStore)) {
          db.createObjectStore(this.foldersStore, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e: any) => {
        this.db = e.target.result;
        resolve(this.db!);
      };
      request.onerror = () => reject('IndexedDB failed to open');
    });
  }

  async getUsageStats(): Promise<NeuralStats> {
    const db = await this.init();
    return new Promise((resolve) => {
      const request = db.transaction([this.statsStore], 'readonly').objectStore(this.statsStore).get('main');
      request.onsuccess = () => {
        if (request.result) resolve(request.result);
        else resolve({
          totalLimit: 1000000,
          spentVocal: 0,
          spentNimo: 0,
          lastUpdated: new Date().toISOString()
        });
      };
    });
  }

  async recordUsage(vocal: number, nimo: number): Promise<void> {
    const current = await this.getUsageStats();
    const db = await this.init();
    const transaction = db.transaction([this.statsStore], 'readwrite');
    transaction.objectStore(this.statsStore).put({
      id: 'main',
      totalLimit: current.totalLimit,
      spentVocal: current.spentVocal + vocal,
      spentNimo: current.spentNimo + nimo,
      lastUpdated: new Date().toISOString()
    });
  }

  async saveSong(metadata: Song, xmlData: string): Promise<void> {
    const db = await this.init();
    const transaction = db.transaction([this.storeName], 'readwrite');
    // Ensure ID is a string for consistent indexing
    const finalMetadata = { ...metadata, id: String(metadata.id) };
    transaction.objectStore(this.storeName).put({ metadata: finalMetadata, xmlData });
  }

  async deleteSong(id: string): Promise<void> {
    const db = await this.init();
    const transaction = db.transaction([this.storeName], 'readwrite');
    transaction.objectStore(this.storeName).delete(id);
  }

  async getAllSongs(): Promise<StoredSong[]> {
    const db = await this.init();
    return new Promise((resolve) => {
      const request = db.transaction([this.storeName], 'readonly').objectStore(this.storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveMemo(memo: MusicalMemo): Promise<void> {
    const db = await this.init();
    const transaction = db.transaction([this.memoStore], 'readwrite');
    transaction.objectStore(this.memoStore).put(memo);
  }

  async deleteMemo(id: string): Promise<void> {
    const db = await this.init();
    const transaction = db.transaction([this.memoStore], 'readwrite');
    transaction.objectStore(this.memoStore).delete(id);
  }

  async getMemos(): Promise<MusicalMemo[]> {
    const db = await this.init();
    return new Promise((resolve) => {
      const request = db.transaction([this.memoStore], 'readonly').objectStore(this.memoStore).getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async deleteAllSongs(): Promise<void> {
    const db = await this.init();
    const tx = db.transaction([this.storeName, this.favoritesStore, this.memoStore], 'readwrite');
    tx.objectStore(this.storeName).clear();
    tx.objectStore(this.favoritesStore).clear();
    tx.objectStore(this.memoStore).clear();
  }

  // ── Favorite Management ──────────────────────────────────────────
  async toggleFavorite(songId: string): Promise<boolean> {
    const db = await this.init();
    const tx = db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve) => {
      const request = store.get(songId);
      request.onsuccess = () => {
        const song = request.result;
        if (song) {
          song.metadata.isFavorite = !song.metadata.isFavorite;
          store.put(song);
          resolve(song.metadata.isFavorite);
        } else resolve(false);
      };
    });
  }

  // ── Folder Management ──────────────────────────────────────────────
  async getFolders(): Promise<SongFolder[]> {
    const db = await this.init();
    return new Promise((resolve) => {
      const tx = db.transaction([this.foldersStore], 'readonly');
      const request = tx.objectStore(this.foldersStore).getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveFolder(folder: SongFolder): Promise<void> {
    const db = await this.init();
    const tx = db.transaction([this.foldersStore], 'readwrite');
    tx.objectStore(this.foldersStore).put(folder);
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.init();
    const tx = db.transaction([this.foldersStore], 'readwrite');
    tx.objectStore(this.foldersStore).delete(id);
  }

  async assignSongToFolder(songId: string, folderId: string | undefined): Promise<void> {
    const db = await this.init();
    const tx = db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve) => {
      const request = store.get(songId);
      request.onsuccess = () => {
        const song = request.result;
        if (song) {
          song.metadata.folderId = folderId;
          store.put(song);
        }
        resolve();
      };
    });
  }

  // ── Update Song Metadata (partial) ───────────────────────────────
  async updateSongMetadata(songId: string, updates: Partial<Song>): Promise<void> {
    const db = await this.init();
    const tx = db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve) => {
      const request = store.get(songId);
      request.onsuccess = () => {
        const song = request.result;
        if (song) {
          song.metadata = { ...song.metadata, ...updates };
          store.put(song);
        }
        resolve();
      };
    });
  }

  async exportNeuralCore(): Promise<string> {
    const songs = await this.getAllSongs();
    const bundle = {
      protocol: 'NIMO-CORE',
      version: '1.5',
      exportedAt: new Date().toISOString(),
      data: { songs }
    };
    return JSON.stringify(bundle);
  }

  /**
   * [NEURAL IMPORT V2.1 - COMPATIBILITY MODE]
   * ปรับปรุงให้รองรับข้อมูลทั้งแบบเก่า (Legacy) และแบบใหม่ (NIMO-CORE)
   */
  async importNeuralCore(jsonStringOrObject: string | any): Promise<void> {
    let bundle: any;
    if (typeof jsonStringOrObject === 'string') {
      try {
        bundle = JSON.parse(jsonStringOrObject);
      } catch (e) {
        throw new Error("Invalid JSON format");
      }
    } else {
      bundle = jsonStringOrObject;
    }

    const db = await this.init();

    // แกะข้อมูลแบบยืดหยุ่น:
    // 1. ถ้าเป็น NIMO-CORE ให้เอาจาก bundle.data.songs
    // 2. ถ้าเป็น Array ตรงๆ ให้ใช้เลย
    // 3. ถ้าเป็นไฟล์ที่มี field 'songs' ให้ใช้ field นั้น
    let songsToImport = [];
    if (bundle.protocol === 'NIMO-CORE' && bundle.data?.songs) {
      songsToImport = bundle.data.songs;
    } else if (Array.isArray(bundle)) {
      songsToImport = bundle;
    } else if (bundle.songs && Array.isArray(bundle.songs)) {
      songsToImport = bundle.songs;
    } else if (bundle.data?.songs && Array.isArray(bundle.data.songs)) {
      songsToImport = bundle.data.songs;
    }

    if (songsToImport.length === 0) return;

    const tx = db.transaction([this.storeName], 'readwrite');
    const songStore = tx.objectStore(this.storeName);

    songsToImport.forEach((s: any) => {
      if (s.metadata && s.metadata.id) {
        // xmlData อาจเป็น URL (จาก Cloud) หรือ XML string (จาก Local)
        songStore.put(s);
      } else if (s.id && s.title) {
        // Legacy format — metadata อยู่ชั้นนอก, xmlData อาจเป็น URL
        songStore.put({ metadata: s, xmlData: s.xmlData || '' });
      }
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const songStorage = new SongStorage();
