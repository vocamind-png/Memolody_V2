
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
    if (this.db) {
      try {
        // Test if the connection is still open
        this.db.transaction([this.storeName], 'readonly');
        return this.db;
      } catch {
        this.db = null; // Connection was closed, re-open
      }
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 8);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'metadata.id' });
        if (!db.objectStoreNames.contains(this.deletedStore)) db.createObjectStore(this.deletedStore, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(this.historyStore)) db.createObjectStore(this.historyStore, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(this.favoritesStore)) db.createObjectStore(this.favoritesStore, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(this.memoStore)) db.createObjectStore(this.memoStore, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(this.statsStore)) db.createObjectStore(this.statsStore, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(this.foldersStore)) db.createObjectStore(this.foldersStore, { keyPath: 'id' });
      };
      request.onsuccess = (e: any) => {
        this.db = e.target.result;
        this.db!.onclose = () => { this.db = null; };
        resolve(this.db!);
      };
      request.onerror = () => reject('IndexedDB failed to open');
    });
  }

  async getUsageStats(): Promise<NeuralStats> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
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
      request.onerror = () => reject(request.error);
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

  /** Helper to normalize metadata grades and other fields when importing/saving so we don't have to do it on the fly */
  private normalizeSongMetadata(meta: any): Song {
    const finalMeta = { ...meta };
    
    // Normalize Grade
    const rawGrade = finalMeta.difficulty_grade || finalMeta.difficultyGrade || finalMeta.difficulty || finalMeta.grade;
    if (rawGrade) {
      let dGrade = String(rawGrade).trim();
      if (/^[1-8]$/.test(dGrade)) dGrade = `Grade ${dGrade}`;
      finalMeta.difficulty_grade = dGrade;
      // remove old redundant fields
      delete finalMeta.difficultyGrade;
      delete finalMeta.difficulty;
      delete finalMeta.grade;
    }
    
    // Normalize Genre
    const rawGenre = finalMeta.genre || finalMeta.category;
    if (rawGenre) {
      finalMeta.genre = String(rawGenre).trim();
      delete finalMeta.category;
    }
    
    // Derive Composer from artist if missing
    if (!finalMeta.composer && finalMeta.artist && finalMeta.artist !== 'NA' && finalMeta.artist !== 'Unknown') {
      finalMeta.composer = finalMeta.artist;
    }
    
    // Derive Era from composer/artist name if missing
    if (!finalMeta.era && (finalMeta.composer || finalMeta.artist)) {
      finalMeta.era = this.detectEraFromComposer(finalMeta.composer || finalMeta.artist);
    }
    
    return finalMeta as Song;
  }

  /** Detect musical era from composer name */
  private detectEraFromComposer(composer: string): string {
    if (!composer || composer === 'NA' || composer === 'Unknown') return '';
    const c = composer.toLowerCase();
    
    // Baroque (1600-1750)
    if (/\b(bach|vivaldi|handel|purcell|corelli|telemann|scarlatti|lully|rameau|couperin|pachelbel|albinoni)\b/.test(c)) return 'Baroque';
    
    // Classical (1750-1820)  
    if (/\b(mozart|haydn|beethoven|clementi|hummel|salieri|boccherini|dussek|field)\b/.test(c)) return 'Classical';
    
    // Romantic (1820-1900)
    if (/\b(chopin|liszt|schumann|tchaikovsky|brahms|mendelssohn|schubert|verdi|wagner|dvorak|grieg|rachmaninoff|rachmaninov|strauss|puccini|mahler|bruckner|elgar|sibelius|rimsky|mussorgsky|borodin|saint-saens|bizet|faure|franck|paganini)\b/.test(c)) return 'Romantic';
    
    // Impressionist / Early Modern (1880-1930)
    if (/\b(debussy|ravel|satie|scriabin|delius|respighi|albeniz|granados)\b/.test(c)) return 'Impressionist';
    
    // 20th Century (1900-1970)
    if (/\b(stravinsky|bartok|prokofiev|shostakovich|copland|gershwin|bernstein|britten|hindemith|poulenc|milhaud|messiaen|villa-lobos|barber|kodaly|orff|holst|vaughan williams|walton)\b/.test(c)) return '20th Century';
    
    // Modern / Contemporary (1950+)
    if (/\b(glass|reich|adams|part|arvo|pärt|ligeti|cage|boulez|stockhausen|xenakis|berio|nono|feldman|riley|young|tavener|górecki|rutter|whitacre|einaudi|yiruma|zimmer|williams|morricone|sakamoto)\b/.test(c)) return 'Contemporary';
    
    // Folk / Traditional
    if (/\b(traditional|folk|anonymous|anon|trad)\b/.test(c)) return 'Traditional';
    
    // Hymn writers / Sacred
    if (/\b(kirkpatrick|doane|sankey|bliss|crosby|bradbury|mason|root|webb|mcgranahan|stebbins|gabriel|lowry|knapp|sweney|excell|fischer)\b/.test(c)) return 'Sacred/Hymn';
    
    return '';
  }

  async saveSong(metadata: Song, xmlData: string, layoutBundle?: any | null): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName, this.deletedStore], 'readwrite');
      // Ensure ID is a string for consistent indexing and normalize metadata
      const finalMetadata = { ...this.normalizeSongMetadata(metadata), id: String(metadata.id) };
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
        // Clean up local SVS render cache
        import('./AudioBlobCache').then(({ AudioBlobCache }) => {
          AudioBlobCache.deleteSongCache(String(id));
        }).catch(() => {});
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
        // Clean up local SVS render cache
        import('./AudioBlobCache').then(({ AudioBlobCache }) => {
          AudioBlobCache.deleteSongCache(String(id));
        }).catch(() => {});
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
  async getSong(id: string): Promise<StoredSong | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const request = db.transaction([this.storeName], 'readonly').objectStore(this.storeName).get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllSongs(): Promise<StoredSong[]> {
    const db = await this.init();
    return new Promise((resolve) => {
      const request = db.transaction([this.storeName], 'readonly').objectStore(this.storeName).getAll();
      request.onsuccess = () => {
        const results = request.result || [];
        // Group legacy eras into 'Classic'
        results.forEach((song: StoredSong) => {
          if (song.metadata) {
            const era = song.metadata.era || song.metadata.category;
            if (era) {
              const lowerEra = era.toLowerCase();
              if (['baroque', 'classical', 'classic', 'romantic', 'impressionist'].includes(lowerEra)) {
                song.metadata.era = 'Classic';
                song.metadata.category = 'Classic';
              }
            }
          }
        });
        resolve(results);
      };
    });
  }

  async saveMemo(memo: MusicalMemo): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.memoStore], 'readwrite');
      transaction.objectStore(this.memoStore).put(memo);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteMemo(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.memoStore], 'readwrite');
      transaction.objectStore(this.memoStore).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
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
    return new Promise((resolve, reject) => {
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
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Favorite Management ──────────────────────────────────────────
  async toggleFavorite(songId: string): Promise<boolean> {
    const db = await this.init();
    const tx = db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(songId);
      request.onsuccess = () => {
        const song = request.result;
        if (song) {
          song.metadata.isFavorite = !song.metadata.isFavorite;
          store.put(song);
          resolve(song.metadata.isFavorite);
        } else resolve(false);
      };
      request.onerror = () => reject(request.error);
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
    return new Promise((resolve, reject) => {
      const request = store.get(songId);
      request.onsuccess = () => {
        const song = request.result;
        if (song) {
          song.metadata.folderId = folderId;
          store.put(song);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ── Update Song Metadata (partial) ───────────────────────────────
  async updateSongMetadata(songId: string, updates: Partial<Song>): Promise<void> {
    const db = await this.init();
    const tx = db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(songId);
      request.onsuccess = () => {
        const song = request.result;
        if (song) {
          song.metadata = { ...song.metadata, ...updates };
          store.put(song);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
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
    const ignoreTombstones = existingKeys.size === 0; // ถ้าคลังว่างเปล่า ให้เพิกเฉยต่อประวัติการลบ เพื่อโหลดเพลงทั้งหมดกลับมาใหม่
    const newSongs: any[] = [];
    for (const s of songsToImport) {
      const rawId = s.metadata?.id || s.id;
      if (!rawId) continue;
      const idStr = String(rawId);

      if (existingKeys.has(idStr) || (!ignoreTombstones && deletedKeys.has(idStr))) {
        continue; // ข้ามเพลงที่มีอยู่แล้ว หรือเพลงที่ผู้ใช้ลบไปแล้ว
      }

      if (s.metadata && s.metadata.id) {
        newSongs.push({
          ...s,
          metadata: {
            ...this.normalizeSongMetadata(s.metadata),
            id: idStr
          }
        });
      } else if (s.id && s.title) {
        newSongs.push({
          metadata: {
            ...this.normalizeSongMetadata(s),
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

  /**
   * [LIGHTWEIGHT INDEX IMPORT V1.0]
   * Fast-path import for manifest_index.json — contains metadata only (no xmlData).
   * Sets xmlData to '' for every entry. Skips songs already in DB or in deleted list.
   * Much faster than importNeuralCore because entries are ~100x smaller.
   */
  async importLightweightIndex(jsonStringOrObject: string | any, onProgress?: (percent: number) => void): Promise<void> {
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

    // Extract songs array — same flexible logic as importNeuralCore
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

    // Fetch existing keys and deleted IDs to avoid duplicates
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

    const ignoreTombstones = existingKeys.size === 0;
    const newSongs: StoredSong[] = [];

    for (const s of songsToImport) {
      // Each entry in the index may be a flat object (id, title, artist, ...)
      // or wrapped in { metadata: {...} }
      const meta = s.metadata || s;
      const rawId = meta.id;
      if (!rawId) continue;
      const idStr = String(rawId);

      if (existingKeys.has(idStr) || (!ignoreTombstones && deletedKeys.has(idStr))) {
        continue;
      }

      newSongs.push({
        metadata: {
          ...this.normalizeSongMetadata(meta),
          id: idStr
        } as Song,
        xmlData: '' // No xmlData in the index — will be loaded lazily via chunks
      });
    }

    console.log(`[importLightweightIndex] Found ${newSongs.length} new songs out of ${songsToImport.length} total.`);
    if (newSongs.length === 0) return;

    // Batch-write in chunks of 5,000 — same strategy as importNeuralCore
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

      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  /**
   * [BATCH RE-GRADE V1.0]
   * Re-grade songs that have a generic difficulty (e.g. 'Intermediate') 
   * by downloading their .mxl file, parsing it, and running SongGradingEngine.
   * Processes in small batches to avoid blocking the UI.
   */
  async batchRegrade(
    onProgress?: (done: number, total: number, currentGrade?: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{ regraded: number, failed: number, total: number }> {
    const { SongGradingEngine } = await import('./SongGradingEngine');
    const db = await this.init();
    
    // Get all songs
    const allSongs: StoredSong[] = await new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    
    // Filter songs that need re-grading (have generic 'Intermediate' or empty grade)
    const needsRegrade = allSongs.filter(s => {
      const m = s.metadata as any;
      const grade = m.difficulty_grade || m.difficulty || '';
      const isGeneric = !grade || grade === 'Intermediate' || grade === 'intermediate';
      // Must have xmlData that is a URL (starts with http)
      const hasXmlUrl = s.xmlData && s.xmlData.startsWith('http');
      return isGeneric && hasXmlUrl;
    });
    
    console.log(`[batchRegrade] Found ${needsRegrade.length} songs needing re-grade out of ${allSongs.length} total.`);
    
    if (needsRegrade.length === 0) {
      return { regraded: 0, failed: 0, total: allSongs.length };
    }
    
    let regraded = 0;
    let failed = 0;
    const BATCH_SIZE = 50; // Process 50 songs at a time
    const CONCURRENT = 5;  // Download 5 at a time
    
    for (let i = 0; i < needsRegrade.length; i += BATCH_SIZE) {
      if (abortSignal?.aborted) break;
      
      const batch = needsRegrade.slice(i, i + BATCH_SIZE);
      const updates: { id: string; grade: string }[] = [];
      
      // Process in concurrent groups
      for (let j = 0; j < batch.length; j += CONCURRENT) {
        if (abortSignal?.aborted) break;
        
        const group = batch.slice(j, j + CONCURRENT);
        const results = await Promise.allSettled(
          group.map(async (song) => {
            try {
              const xmlUrl = song.xmlData;
              const response = await fetch(xmlUrl, { signal: abortSignal });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              
              // Handle .mxl (compressed ZIP) or .xml
              let xmlText: string;
              if (xmlUrl.endsWith('.mxl')) {
                const JSZip = (await import('jszip')).default;
                const arrayBuffer = await response.arrayBuffer();
                const zip = await JSZip.loadAsync(arrayBuffer);
                // Find the first .xml file in the archive
                let xmlFile: any = null;
                zip.forEach((relativePath, file) => {
                  if (!xmlFile && (relativePath.endsWith('.xml') || relativePath.endsWith('.musicxml')) && !relativePath.startsWith('META-INF')) {
                    xmlFile = file;
                  }
                });
                if (!xmlFile) throw new Error('No XML file found in .mxl archive');
                xmlText = await xmlFile.async('text');
              } else {
                xmlText = await response.text();
              }
              
              // Parse XML
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
              
              if (xmlDoc.querySelector('parsererror')) {
                throw new Error('XML parse error');
              }
              
              // Extract notes and grade
              const notes = SongGradingEngine.extractNotesFromXmlDoc(xmlDoc);
              if (notes.length === 0) throw new Error('No notes found');
              
              const bpm = song.metadata.bpm || 120;
              const fifthsEl = xmlDoc.querySelector('fifths');
              const fifths = fifthsEl ? parseInt(fifthsEl.textContent || '0') : 0;
              
              const result = SongGradingEngine.gradeSong(notes, { bpm, fifths });
              return { id: song.metadata.id, grade: result.grade };
            } catch (e) {
              throw e;
            }
          })
        );
        
        for (const r of results) {
          if (r.status === 'fulfilled') {
            updates.push(r.value);
            regraded++;
          } else {
            failed++;
          }
        }
      }
      
      // Write batch updates to IndexedDB
      if (updates.length > 0) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([this.storeName], 'readwrite');
          const store = tx.objectStore(this.storeName);
          
          let processed = 0;
          updates.forEach(u => {
            const req = store.get(u.id);
            req.onsuccess = () => {
              const song = req.result;
              if (song) {
                (song.metadata as any).difficulty_grade = u.grade;
                (song.metadata as any).difficulty = u.grade;
                store.put(song);
              }
              processed++;
            };
          });
          
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
      
      if (onProgress) {
        onProgress(i + batch.length, needsRegrade.length, updates[updates.length - 1]?.grade);
      }
      
      // Yield to main thread
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log(`[batchRegrade] Complete! Regraded: ${regraded}, Failed: ${failed}`);
    return { regraded, failed, total: allSongs.length };
  }
}

export const songStorage = new SongStorage();
