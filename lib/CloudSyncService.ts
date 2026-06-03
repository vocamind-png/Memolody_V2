
import { Song } from '../types';
import { songStorage } from './SongStorage';

/**
 * [NEURAL CLOUD SYNC SERVICE V2.9 - CORS RESILIENT]
 * อัปเกรดระบบตรวจจับข้อผิดพลาดเครือข่ายและนโยบายความปลอดภัย
 */
export class CloudSyncService {
  private static GLOBAL_MANIFEST_URL = 'https://storage.googleapis.com/memolody-vault/manifest.json';

  /**
   * PULL: ดึงข้อมูลจากคลาวด์แบบตรวจเช็ค CORS
   */
  public static async syncWithGlobalCloud(onProgress?: (percent: number) => void): Promise<{ added: number, total: number, message: string }> {
    try {
      console.log("[Neural Link] Initiating High-Priority Fetch...");

      const cacheBuster = `v=${Date.now()}`;
      const baseUrl = (import.meta as any).env?.DEV ? '/api/manifest' : this.GLOBAL_MANIFEST_URL;
      const fetchUrl = `${baseUrl}?${cacheBuster}`;


      // Wrapping fetch in try-catch directly for better async/await flow
      let response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

        response = await fetch(fetchUrl, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new Error("TIMEOUT: การเชื่อมต่อคลาวด์ใช้เวลานานเกินไปค่ะ (120s)");
        }
        // This catch handles network errors (e.g., DNS, connection refused, CORS preflight failures)
        throw new Error("NETWORK_FAILURE: การเชื่อมต่อคลาวด์ขัดข้องค่ะ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือนโยบายความปลอดภัย (CORS) นะคะ");
      }

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          throw new Error(`ACCESS_DENIED: ไฟล์ manifest.json ไม่ได้เปิดเป็น Public ค่ะ`);
        }
        if (response.status === 404) {
          throw new Error(`NOT_FOUND: ไม่พบไฟล์ manifest.json ใน Bucket 'memolody-vault' ค่ะ`);
        }
        throw new Error(`HTTP_ERROR_${response.status}: การเชื่อมต่อขัดข้อง`);
      }

      const rawData = await response.json();
      console.log("[Neural Link] Matrix Data Received and Parsed Successfully.");

      await songStorage.importNeuralCore(rawData, onProgress);
      const finalSongs = await songStorage.getAllSongs();

      return {
        added: 0,
        total: finalSongs.length,
        message: `Neural Link Established! เชื่อมต่อสำเร็จ พบเพลงทั้งหมด ${finalSongs.length} รายการค่ะ ✨`
      };
    } catch (error: any) {
      console.warn("[Neural Link Error]", error.message);
      throw error;
    }
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
