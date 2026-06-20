import { supabase } from './supabase';

export interface EngagementStatus {
  isLiked: boolean;
  isFavorite: boolean;
}

export class SongAnalyticsService {
  
  /**
   * Helper to guess country code from browser locale
   */
  private static guessCountryCode(): string {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Simple fallback mapper, ideally we'd use a real geo-IP service, but this works for client-side
      if (timezone.includes('Bangkok')) return 'TH';
      if (timezone.includes('Tokyo')) return 'JP';
      if (timezone.includes('Seoul')) return 'KR';
      if (timezone.includes('Taipei')) return 'TW';
      if (timezone.includes('Manila')) return 'PH';
      if (timezone.includes('Jakarta')) return 'ID';
      if (timezone.includes('Singapore')) return 'SG';
      if (timezone.includes('Kuala_Lumpur')) return 'MY';
      
      const locale = navigator.language;
      const parts = locale.split('-');
      if (parts.length > 1) {
        return parts[1].toUpperCase();
      }
      return 'UNKNOWN';
    } catch (e) {
      return 'UNKNOWN';
    }
  }

  static async recordPlayEvent(songId: string, userId?: string): Promise<void> {
    try {
      const countryCode = this.guessCountryCode();
      
      const { error } = await supabase
        .from('song_play_events')
        .insert({
          song_id: songId,
          user_id: userId || null,
          country_code: countryCode
        });
        
      if (error) throw error;
    } catch (error) {
      console.error('Failed to record play event:', error);
    }
  }

  static async recordServerRender(
    modelType: 'Vocalido' | 'Instrumento',
    provider: 'runpod' | 'colab' | 'browser',
    status: 'success' | 'error',
    durationSec: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      const countryCode = this.guessCountryCode();
      const userId = localStorage.getItem('mock_user_id') || 'guest';
      
      await supabase.from('server_render_logs').insert({
        user_id: userId,
        model_type: modelType,
        provider: provider,
        status: status,
        duration_sec: durationSec,
        country_code: countryCode,
        error_message: errorMessage || null
      });
    } catch (error) {
      // Non-blocking telemetry
      console.warn('Failed to record server render metric:', error);
    }
  }

  static async checkUserEngagement(songId: string, userId: string): Promise<EngagementStatus> {
    try {
      const [likeRes, favRes] = await Promise.all([
        supabase.from('song_likes').select('user_id').eq('song_id', songId).eq('user_id', userId).single(),
        supabase.from('song_favorites').select('user_id').eq('song_id', songId).eq('user_id', userId).single()
      ]);

      return {
        isLiked: !likeRes.error && !!likeRes.data,
        isFavorite: !favRes.error && !!favRes.data
      };
    } catch (error) {
      console.error('Failed to check user engagement:', error);
      return { isLiked: false, isFavorite: false };
    }
  }

  static async toggleLike(songId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
    try {
      if (currentlyLiked) {
        const { error } = await supabase
          .from('song_likes')
          .delete()
          .eq('song_id', songId)
          .eq('user_id', userId);
        if (error) throw error;
        return false;
      } else {
        const { error } = await supabase
          .from('song_likes')
          .insert({ song_id: songId, user_id: userId });
        if (error) throw error;
        return true;
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
      throw error;
    }
  }

  static async toggleFavorite(songId: string, userId: string, currentlyFavorited: boolean): Promise<boolean> {
    try {
      if (currentlyFavorited) {
        const { error } = await supabase
          .from('song_favorites')
          .delete()
          .eq('song_id', songId)
          .eq('user_id', userId);
        if (error) throw error;
        return false;
      } else {
        const { error } = await supabase
          .from('song_favorites')
          .insert({ song_id: songId, user_id: userId });
        if (error) throw error;
        return true;
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      throw error;
    }
  }

  static async getTopSongs(limit: number = 10): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('view_top_songs_all_time')
        .select('*')
        .limit(limit);
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get top songs:', error);
      return [];
    }
  }

  static async getAnalyticsByCountry(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('view_analytics_by_country')
        .select('*');
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get country analytics:', error);
      return [];
    }
  }

  static async getAnalyticsDashboard(): Promise<any> {
    try {
      const [topSongs, countries] = await Promise.all([
        this.getTopSongs(10),
        this.getAnalyticsByCountry()
      ]);
      return { topSongs, countries };
    } catch (error) {
      console.error('Failed to get dashboard analytics:', error);
      return { topSongs: [], countries: [] };
    }
  }

  static async getServerPerformanceDashboard(): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('view_render_concurrency_hourly')
        .select('*')
        .limit(24);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get server performance:', error);
      return [];
    }
  }

  static async getSystemSetting(key: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .single();
      if (error) return null;
      return data?.value;
    } catch (e) {
      return null;
    }
  }

  static async updateSystemSetting(key: string, value: any): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error(`Failed to update setting ${key}:`, e);
      return false;
    }
  }
}
