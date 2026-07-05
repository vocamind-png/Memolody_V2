import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('songs').select('metadata');
  if (error) console.error(error);
  
  const grades = data.map(d => {
      const m = d.metadata || {};
      return m.difficulty_grade || m.difficultyGrade || m.difficulty || m.grade || 'NONE';
  });
  
  const unique = [...new Set(grades)];
  console.log('Unique Grades in DB:', unique);
}
run();
