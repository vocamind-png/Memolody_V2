
import { supabase, songActions } from './supabase';
import { songStorage } from './SongStorage';

export class SupabaseSyncService {
  /**
   * PUSH: ส่งข้อมูลจาก Local ไปที่ Supabase
   */
  public static async pushLocalToCloud(): Promise<{ success: boolean; message: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false, message: 'กรุณาล็อกอินก่อนทำการ Sync ค่ะ' };

      const localSongs = await songStorage.getAllSongs();
      if (localSongs.length === 0) return { success: true, message: 'ไม่มีเพลงในเครื่องให้ Sync ค่ะ' };

      const result = await songActions.syncSongs(localSongs);
      if (result?.error) throw result.error;

      return { success: true, message: `Sync สำเร็จ! มวลเพลง ${localSongs.length} รายการถูกเก็บไว้บน Cloud แล้วค่ะ` };
    } catch (error: any) {
      console.error("[Supabase Sync Push Error]", error);
      return { success: false, message: `การ Sync ขัดข้อง: ${error.message}` };
    }
  }

  /**
   * PULL: ดึงข้อมูลจาก Supabase มาลงเครื่อง (Local)
   */
  public static async pullCloudToLocal(): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false, count: 0, message: 'กรุณาล็อกอินก่อนค่ะ' };

      const { data: cloudSongs, error } = await songActions.getCloudSongs();
      if (error) throw error;
      if (!cloudSongs || cloudSongs.length === 0) return { success: true, count: 0, message: 'ไม่พบเพลงบน Cloud ค่ะ' };

      // แปลงข้อมูลจาก Supabase กลับเป็นรูปแบบที่ SongStorage เข้าใจ
      const formattedSongs = cloudSongs.map((s: any) => ({
        metadata: {
          id: s.id,
          title: s.title,
          artist: s.artist,
          duration: s.duration,
          isFavorite: s.is_favorite,
          isDeleted: s.is_deleted,
          origin: s.origin,
          folderId: s.folder_id,
          createdAt: s.created_at
        },
        xmlData: s.xml_data
      }));

      await songStorage.importNeuralCore(formattedSongs);
      return { success: true, count: cloudSongs.length, message: `ดึงข้อมูลสำเร็จ! พบเพลง ${cloudSongs.length} รายการบน Cloud ค่ะ` };
    } catch (error: any) {
      console.error("[Supabase Sync Pull Error]", error);
      return { success: false, count: 0, message: `ดึงข้อมูลขัดข้อง: ${error.message}` };
    }
  }

  /**
   * FULL SYNC: ทำทั้ง Pull และ Push บาลานซ์ข้อมูล
   */
  public static async performFullSync(): Promise<{ success: boolean; message: string }> {
    const pull = await this.pullCloudToLocal();
    if (!pull.success) return { success: false, message: pull.message };
    const push = await this.pushLocalToCloud();
    return push;
  }

  /**
   * UPDATE PROFILE: อัปเดตข้อมูล Metadata ใน DB
   */
  public static async updateProfile(updates: { country?: string; language?: string; instrument?: string }): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from('profiles').update({
        country: updates.country,
        language: updates.language,
        instrument: updates.instrument,
        updated_at: new Date().toISOString()
      }).eq('id', session.user.id);
    } catch (e) {
      console.error("[Profile Sync Error]", e);
    }
  }
}
