
import { Song } from '../types';
import { songStorage } from './SongStorage';

/**
 * [NEURAL CLOUD SYNC SERVICE V3.0 - SPLIT MANIFEST + CORS RESILIENT]
 * Lightweight index-first loading (~1.5MB) with fallback to full manifest (~138MB).
 * Supports lazy chunk loading for on-demand xmlData retrieval.
 */
export class CloudSyncService {
  private static GLOBAL_MANIFEST_URL = 'https://storage.googleapis.com/memolody-vault/manifest.json';
  private static GLOBAL_INDEX_URL = 'https://storage.googleapis.com/memolody-vault/manifest_index.json';
  private static GLOBAL_CHUNK_URL_PREFIX = 'https://storage.googleapis.com/memolody-vault/manifest_chunk_';

  /**
   * Helper: build the correct base URL for dev vs production.
   */
  private static getBaseUrl(): string {
    return (import.meta as any).env?.DEV ? '/api' : 'https://storage.googleapis.com/memolody-vault';
  }

  /**
   * Helper: fetch a URL with an abort-controller timeout.
   * Returns the Response on success, throws on network/timeout errors.
   */
  private static async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`TIMEOUT: การเชื่อมต่อคลาวด์ใช้เวลานานเกินไปค่ะ (${Math.round(timeoutMs / 1000)}s)`);
      }
      throw new Error("NETWORK_FAILURE: การเชื่อมต่อคลาวด์ขัดข้องค่ะ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือนโยบายความปลอดภัย (CORS) นะคะ");
    }
  }

  /**
   * PULL (FAST PATH): Try lightweight manifest_index.json (~1.5MB, metadata only, no xmlData).
   * Falls back to full manifest.json (~138MB) if the index file doesn't exist.
   */
  public static async syncWithGlobalCloud(onProgress?: (percent: number) => void): Promise<{ added: number, total: number, message: string }> {
    try {
      console.log("[Neural Link V3] Initiating High-Priority Fetch...");

      const cacheBuster = `v=${Date.now()}`;
      const base = this.getBaseUrl();
      const isDev = (import.meta as any).env?.DEV;

      // ── Step 1: Try lightweight index first (30s timeout) ──
      const indexUrl = isDev
        ? `${base}/manifest_index?${cacheBuster}`
        : `${this.GLOBAL_INDEX_URL}?${cacheBuster}`;

      let usedIndex = false;
      let rawData: any = null;

      try {
        console.log("[Neural Link V3] Attempting lightweight index...");
        const indexResponse = await this.fetchWithTimeout(indexUrl, 30000);

        if (indexResponse.ok) {
          rawData = await indexResponse.json();
          usedIndex = true;
          console.log("[Neural Link V3] Lightweight index loaded successfully.");
        } else if (indexResponse.status !== 404) {
          // Non-404 errors (403, 500, etc.) — still try full manifest as fallback
          console.warn(`[Neural Link V3] Index returned HTTP ${indexResponse.status}, falling back to full manifest.`);
        }
      } catch (indexErr: any) {
        console.warn("[Neural Link V3] Index fetch failed, falling back to full manifest:", indexErr.message);
      }

      // ── Step 2: Fallback to full manifest (120s timeout) ──
      if (!rawData) {
        console.log("[Neural Link V3] Loading full manifest (fallback)...");
        const fullUrl = isDev
          ? `${base}/manifest?${cacheBuster}`
          : `${this.GLOBAL_MANIFEST_URL}?${cacheBuster}`;

        const response = await this.fetchWithTimeout(fullUrl, 120000);

        if (!response.ok) {
          if (response.status === 403 || response.status === 401) {
            throw new Error(`ACCESS_DENIED: ไฟล์ manifest.json ไม่ได้เปิดเป็น Public ค่ะ`);
          }
          if (response.status === 404) {
            throw new Error(`NOT_FOUND: ไม่พบไฟล์ manifest.json ใน Bucket 'memolody-vault' ค่ะ`);
          }
          throw new Error(`HTTP_ERROR_${response.status}: การเชื่อมต่อขัดข้อง`);
        }

        rawData = await response.json();
        console.log("[Neural Link V3] Full manifest loaded (fallback).");
      }

      // ── Step 3: Import into IndexedDB ──
      if (usedIndex) {
        // Index file contains metadata only (no xmlData) — use fast import path
        await songStorage.importLightweightIndex(rawData, onProgress);
      } else {
        // Full manifest — use existing full import
        await songStorage.importNeuralCore(rawData, onProgress);
      }

      const finalSongs = await songStorage.getAllSongs();
      const source = usedIndex ? 'index' : 'full';

      return {
        added: 0,
        total: finalSongs.length,
        message: `Neural Link Established! เชื่อมต่อสำเร็จ (${source}) พบเพลงทั้งหมด ${finalSongs.length} รายการค่ะ ✨`
      };
    } catch (error: any) {
      console.warn("[Neural Link Error]", error.message);
      throw error;
    }
  }

  /**
   * Lazy-load a single chunk file containing full song entries (with xmlData).
   * Chunk files are named manifest_chunk_0.json, manifest_chunk_1.json, etc.
   */
  public static async fetchSongChunk(chunkIndex: number, onProgress?: (percent: number) => void): Promise<{ added: number, total: number }> {
    const cacheBuster = `v=${Date.now()}`;
    const isDev = (import.meta as any).env?.DEV;
    const base = this.getBaseUrl();

    const chunkUrl = isDev
      ? `${base}/manifest_chunk_${chunkIndex}?${cacheBuster}`
      : `${this.GLOBAL_CHUNK_URL_PREFIX}${chunkIndex}.json?${cacheBuster}`;

    console.log(`[Neural Link V3] Fetching chunk ${chunkIndex}...`);
    const response = await this.fetchWithTimeout(chunkUrl, 120000);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`CHUNK_NOT_FOUND: ไม่พบไฟล์ chunk ${chunkIndex} ค่ะ`);
      }
      throw new Error(`HTTP_ERROR_${response.status}: ดาวน์โหลด chunk ${chunkIndex} ขัดข้อง`);
    }

    const rawData = await response.json();
    await songStorage.importNeuralCore(rawData, onProgress);
    const finalSongs = await songStorage.getAllSongs();

    console.log(`[Neural Link V3] Chunk ${chunkIndex} imported.`);
    return { added: 0, total: finalSongs.length };
  }

  public static async checkUpdateAvailability(): Promise<boolean> {
    try {
      const baseUrl = (import.meta as any).env?.DEV ? '/api/manifest' : this.GLOBAL_MANIFEST_URL;
      const response = await fetch(`${baseUrl}?t=${Date.now()}`, {
        method: 'GET',
        mode: 'cors'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public static async getCloudStats(): Promise<{ total: number }> {
    try {
      const baseUrl = (import.meta as any).env?.DEV ? '/api/manifest' : this.GLOBAL_MANIFEST_URL;
      const response = await fetch(`${baseUrl}?t=${Date.now()}`, {
        mode: 'cors'
      });
      if (!response.ok) return { total: 0 };
      const data = await response.json();
      const songs = Array.isArray(data) ? data : (data?.data?.songs || data?.songs || []);
      return { total: songs.length };
    } catch {
      return { total: 0 };
    }
  }
}
