import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nxueprpjcwcwljpmhgak.supabase.co';
// Using anon public key if configured, or fallback standard key template placeholder.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dWVwcnBqY3djd2xqcG1oZ2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQ2NjI0MDAsImV4cCI6MjAyMDc5ODQwMH0.placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
