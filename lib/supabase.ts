
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// ในการใช้งานจริง ให้ก๊อปปี้ค่าจาก Supabase Console (Settings > API) 
// แนะนำให้ใช้ .env variable เมื่อทำการ Deploy
const supabaseUrl = 'YOUR_SUPABASE_PROJECT_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const authActions = {
  signUp: async (email: string, pass: string, fullName: string) => {
    return await supabase.auth.signUp({ 
        email, password: pass, 
        options: { data: { full_name: fullName } } 
    });
  },
  signIn: async (email: string, pass: string) => {
    return await supabase.auth.signInWithPassword({ email, password: pass });
  },
  signOut: async () => {
    return await supabase.auth.signOut();
  },
  getSession: async () => {
    return await supabase.auth.getSession();
  }
};

export const songActions = {
  syncSongs: async (songs: any[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    // Upsert songs batch
    const mapped = songs.map(s => ({
      user_id: user.id,
      title: s.metadata.title,
      artist: s.metadata.artist,
      xml_data: s.xmlData,
      is_favorite: s.metadata.isFavorite,
      is_deleted: s.metadata.isDeleted,
      origin: s.metadata.origin,
      folder_id: s.metadata.folderId
    }));
    
    return await supabase.from('songs').upsert(mapped, { onConflict: 'id' });
  },
  
  getCloudSongs: async () => {
    return await supabase.from('songs').select('*').order('updated_at', { ascending: false });
  }
};

export const profileActions = {
  getProfile: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return await supabase.from('profiles').select('*').eq('id', user.id).single();
  },
  updateTier: async (tier: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return await supabase.from('profiles').update({ membership_tier: tier }).eq('id', user.id);
  }
};
