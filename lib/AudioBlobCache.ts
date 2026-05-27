export class AudioBlobCache {
  private static dbName = 'MemolodyAudioCache';
  private static storeName = 'audio_blobs';
  private static db: IDBDatabase | null = null;

  private static async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = (e: any) => {
        this.db = e.target.result;
        resolve(this.db!);
      };
      request.onerror = () => reject('AudioBlobCache IndexedDB failed to open');
    });
  }

  static async get(key: string): Promise<Blob | null> {
    try {
      const db = await this.init();
      return new Promise((resolve) => {
        const tx = db.transaction([this.storeName], 'readonly');
        const request = tx.objectStore(this.storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('[AudioBlobCache] get failed:', e);
      return null;
    }
  }

  static async set(key: string, blob: Blob): Promise<void> {
    try {
      const db = await this.init();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction([this.storeName], 'readwrite');
        tx.objectStore(this.storeName).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[AudioBlobCache] set failed:', e);
    }
  }

  static async delete(key: string): Promise<void> {
    try {
      const db = await this.init();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction([this.storeName], 'readwrite');
        tx.objectStore(this.storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[AudioBlobCache] delete failed:', e);
    }
  }

  static async deleteSongCache(songId: string): Promise<void> {
    try {
      const db = await this.init();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.openKeyCursor();
        
        request.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            const key = String(cursor.key);
            if (key.startsWith(`vocal_render_${songId}`)) {
              store.delete(key);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('[AudioBlobCache] deleteSongCache failed:', e);
    }
  }

  static async clearAllVocalRenders(): Promise<void> {
    try {
      const db = await this.init();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.openKeyCursor();
        
        request.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            const key = String(cursor.key);
            if (key.startsWith('vocal_render_')) {
              store.delete(key);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('[AudioBlobCache] clearAllVocalRenders failed:', e);
    }
  }
}
