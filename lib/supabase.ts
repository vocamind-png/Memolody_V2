import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nxueprpjcwcwljpmhgak.supabase.co';
// Using anon public key if configured, or fallback standard key template placeholder.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_pMOMU-ZoB71ICsNFRv7DnQ_ixTdNbB4';


export const supabase = createClient(supabaseUrl, supabaseAnonKey);
