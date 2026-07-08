import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nxueprpjcwcwljpmhgak.supabase.co';
// Using anon public key if configured, or fallback standard key template placeholder.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dWVwcnBqY3djd2xqcG1oZ2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODIxMzcsImV4cCI6MjA4OTU1ODEzN30.OCvad3oUN_7n4VZ2WtXX435PtA3QCVHiC1CgMbfnb_E';


export const supabase = createClient(supabaseUrl, supabaseAnonKey);
