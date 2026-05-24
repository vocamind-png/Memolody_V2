
import { Song, MusicalMemo, SongFolder } from '../types';

interface StoredSong {
  metadata: Song;
  xmlData: string;
  layoutBundle?: any | null;
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
  private deletedStore = 'deleted_ids';
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 8); // Bump to 8 for deleted_ids
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'metadata.id' });
        }
        if (!db.objectStoreNames.contains(this.deletedStore)) {
          db.createObjectStore(this.deletedStore, { keyPath: 'id' });
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

  async saveSong(metadata: Song, xmlData: string, layoutBundle?: any | null): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName, this.deletedStore], 'readwrite');
      // Ensure ID is a string for consistent indexing
      const finalMetadata = { ...metadata, id: String(metadata.id) };
      transaction.objectStore(this.storeName).put({ metadata: finalMetadata, xmlData, layoutBundle });
      transaction.objectStore(this.deletedStore).delete(finalMetadata.id); // Remove from deleted list if re-added
      transaction.oncomplete = () => {
        // Background sync to Firestore
        this.syncSongToCloud(finalMetadata, xmlData, layoutBundle);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- Background Cloud Sync helpers ---
  private async syncSongToCloud(metadata: Song, xmlData: string, layoutBundle?: any | null) {
    // Dynamically import to avoid circular dependency if any
    const { db: firestoreDb, isFirebaseConfigured, auth } = await import('./firebase');
    if (!isFirebaseConfigured || !firestoreDb) return;
    try {
      const userId = auth?.currentUser?.uid || localStorage.getItem('mock_user_id') || 'guest';
      const { doc, setDoc } = await import('firebase/firestore');
      const docRef = doc(firestoreDb, `users/${userId}/songs`, String(metadata.id));
      await setDoc(docRef, { metadata, xmlData, layoutBundle: layoutBundle || null, updated_at: new Date().toISOString() });
    } catch (e) {
      console.warn("Could not sync song to cloud", e);
    }
  }

  private async removeSongFromCloud(songId: string) {
    const { db: firestoreDb, isFirebaseConfigured, auth } = await import('./firebase');
    if (!isFirebaseConfigured || !firestoreDb) return;
    try {
      const userId = auth?.currentUser?.uid || localStorage.getItem('mock_user_id') || 'guest';
      const { doc, deleteDoc } = await import('firebase/firestore');
      const docRef = doc(firestoreDb, `users/${userId}/songs`, String(songId));
      await deleteDoc(docRef);
    } catch (e) {
      console.warn("Could not remove song from cloud", e);
    }
  }
  // ------------------------------------

  async deleteSong(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName, this.deletedStore], 'readwrite');
      // Physically remove from main store (permanent real delete)
      transaction.objectStore(this.storeName).delete(String(id));
      // Keep a tombstone in deletedStore so cloud-sync knows not to re-download this song
      transaction.objectStore(this.deletedStore).put({ id: String(id), deletedAt: new Date().toISOString() });
      transaction.oncomplete = () => {
        this.removeSongFromCloud(String(id));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /** Permanently deletes a song with NO tombstone (e.g. after user confirms from trash) */
  async permanentDeleteSong(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName, this.deletedStore], 'readwrite');
      transaction.objectStore(this.storeName).delete(String(id));
      transaction.objectStore(this.deletedStore).delete(String(id)); // also clear tombstone
      transaction.oncomplete = () => {
        this.removeSongFromCloud(String(id));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async bulkDeleteSongs(ids: string[]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName, this.deletedStore], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const delStore = transaction.objectStore(this.deletedStore);
      ids.forEach(id => {
        // Physically remove from main store
        store.delete(String(id));
        // Keep tombstone for cloud-sync
        delStore.put({ id: String(id), deletedAt: new Date().toISOString() });
        this.removeSongFromCloud(String(id));
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
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
    const tx = db.transaction([
      this.storeName,
      this.favoritesStore,
      this.memoStore,
      this.foldersStore,
      this.historyStore,
      this.deletedStore
    ], 'readwrite');
    tx.objectStore(this.storeName).clear();
    tx.objectStore(this.favoritesStore).clear();
    tx.objectStore(this.memoStore).clear();
    tx.objectStore(this.foldersStore).clear();
    tx.objectStore(this.historyStore).clear();
    tx.objectStore(this.deletedStore).clear();
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

  async bulkUpdateSongsMetadata(ids: string[], updates: Partial<Song>): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      
      let processed = 0;
      ids.forEach(id => {
        const request = store.get(String(id));
        request.onsuccess = () => {
          const song = request.result;
          if (song) {
            song.metadata = { ...song.metadata, ...updates };
            store.put(song);
          }
          processed++;
          if (processed === ids.length) {
            // All requests initiated, transaction will complete
          }
        };
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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
  async importNeuralCore(jsonStringOrObject: string | any, onProgress?: (percent: number) => void): Promise<void> {
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
    let songsToImport: any[] = [];
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

    // ดึง existing keys และ deleted IDs ก่อนเพื่อลดการเขียนข้อมูลซ้ำและข้ามเพลงที่ลบไปแล้ว
    const { existingKeys, deletedKeys } = await new Promise<{ existingKeys: Set<string>, deletedKeys: Set<string> }>((resolve, reject) => {
      const tx = db.transaction([this.storeName, this.deletedStore], 'readonly');
      const songStore = tx.objectStore(this.storeName);
      const delStore = tx.objectStore(this.deletedStore);

      const existingReq = songStore.getAllKeys();
      const deletedReq = delStore.getAll();

      tx.oncomplete = () => {
        const eKeys = new Set((existingReq.result || []).map((k: any) => String(k)));
        const dKeys = new Set((deletedReq.result || []).map((d: any) => String(d.id)));
        resolve({ existingKeys: eKeys, deletedKeys: dKeys });
      };
      tx.onerror = () => reject(tx.error);
    });

    // กรองเอาเฉพาะเพลงใหม่ที่ไม่ได้ถูกลบ
    const newSongs: any[] = [];
    for (const s of songsToImport) {
      const rawId = s.metadata?.id || s.id;
      if (!rawId) continue;
      const idStr = String(rawId);

      if (existingKeys.has(idStr) || deletedKeys.has(idStr)) {
        continue; // ข้ามเพลงที่มีอยู่แล้ว หรือเพลงที่ผู้ใช้ลบไปแล้ว
      }

      if (s.metadata && s.metadata.id) {
        newSongs.push({
          ...s,
          metadata: {
            ...s.metadata,
            id: idStr
          }
        });
      } else if (s.id && s.title) {
        newSongs.push({
          metadata: {
            ...s,
            id: idStr
          },
          xmlData: s.xmlData || ''
        });
      }
    }

    console.log(`[importNeuralCore] Found ${newSongs.length} new songs out of ${songsToImport.length} total.`);
    if (newSongs.length === 0) return;

    // ทยอยบันทึกข้อมูลเป็นชุดๆ ละ 5,000 เพลง พร้อมหน่วงเวลาสั้นๆ เพื่อเลี่ยงการบล็อก main thread บนหน้าจอ
    const BATCH_SIZE = 5000;
    for (let i = 0; i < newSongs.length; i += BATCH_SIZE) {
      const chunk = newSongs.slice(i, i + BATCH_SIZE);
      
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([this.storeName], 'readwrite');
        const songStore = tx.objectStore(this.storeName);

        chunk.forEach(s => {
          songStore.put(s);
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      if (onProgress) {
        const progressPercent = Math.min(100, Math.round(((i + chunk.length) / newSongs.length) * 100));
        onProgress(progressPercent);
      }

      // หน่วงเวลาสั้นๆ เพื่อให้เบราว์เซอร์ได้อัปเดต UI และไม่ทำให้แอปค้าง/กระตุก
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

export const songStorage = new SongStorage();
