import { AudioBlobCache } from './AudioBlobCache';
import { getChromaticSolfege } from './SolfegeLogic';
import { musicEngine } from './MusicEngine';
import { ParsedNote, Song, LyricMode } from '../types';
import { CLASSICAL_RANKING, getClassicalRank } from './classicalRanking';

// ── Types ──
export interface BatchRenderJob {
  songId: string;
  songTitle: string;
  transpose: number;
  status: 'pending' | 'rendering' | 'done' | 'error' | 'skipped';
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface BatchRenderProgress {
  isRunning: boolean;
  isPaused: boolean;
  currentJob: BatchRenderJob | null;
  jobs: BatchRenderJob[];
  completed: number;
  total: number;
  errors: number;
  skipped: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  statusText: string;
}

type ProgressListener = (progress: BatchRenderProgress) => void;

// ── Helpers ──
const getDirectServerUrl = (path: string) => {
  let cleanPath = path;
  if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const port = window.location.port;
    const isLocalIp = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local') || /^192\.168\./.test(hostname);
    
    if (isLocalIp && port === '3100') return cleanPath;
    if (isLocalIp) {
      const base = hostname === 'localhost' ? 'http://127.0.0.1:5001' : `http://${hostname}:5001`;
      if (cleanPath.startsWith('/vocalido/')) cleanPath = cleanPath.substring('/vocalido'.length);
      return `${base}${cleanPath}`;
    }
    
    const customUrl = localStorage.getItem('memolody_custom_backend_url')?.trim().replace(/\/$/, '');
    if (customUrl) {
      if (cleanPath.startsWith('/vocalido/')) cleanPath = cleanPath.substring('/vocalido'.length);
      return `${customUrl}${cleanPath}`;
    }
  }
  return cleanPath;
};

const svsFetch = (url: string, options?: RequestInit) => {
  const headers = new Headers(options?.headers || {});
  headers.set('serveo-skip-browser-warning', 'true');
  headers.set('bypass-tunnel-reminder', 'true');
  return fetch(url, { ...options, headers });
};

const fixAudioUrl = (u: string) => {
  if (typeof u !== 'string') return u;
  if (u.startsWith('blob:') || u.startsWith('data:')) return u;
  let url = u;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try { const p = new URL(url); url = p.pathname + p.search; } catch {}
  }
  if (url.startsWith('/vocalido/audio/')) url = url.replace('/vocalido/audio/', '/studio/audio/');
  else if (url.startsWith('/audio/')) url = url.replace('/audio/', '/studio/audio/');
  else if (url.startsWith('/song_')) url = '/studio/audio' + url;
  if (!url.startsWith('/studio/audio/')) {
    const fn = url.split('/').pop() || '';
    if (fn.startsWith('song_')) url = `/studio/audio/${fn}`;
  }
  const customUrl = (typeof window !== 'undefined') ? localStorage.getItem('memolody_custom_backend_url')?.trim().replace(/\/$/, '') : '';
  if (customUrl) return `${customUrl}${url}`;
  return url;
};

// ── Persistence (localStorage — legacy, still works as fallback) ──
const BATCH_RENDERED_KEY = 'batch_rendered_songs';

export function getBatchRenderedSongs(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(BATCH_RENDERED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveBatchRendered(songId: string, transpose: number) {
  const data = getBatchRenderedSongs();
  if (!data[songId]) data[songId] = [];
  if (!data[songId].includes(transpose)) data[songId].push(transpose);
  localStorage.setItem(BATCH_RENDERED_KEY, JSON.stringify(data));
}

// ── Cloud Render Status (Supabase catalog — shared community cache) ──
// Queries the rendered_vocals table in Supabase to check if a render
// already exists on GCS. Results are cached in memory for performance.
const _cloudRenderCache: Record<string, { keys: number[]; gcsUrls: Record<number, string>; fetchedAt: number }> = {};
const CLOUD_CACHE_TTL = 60_000; // 1 minute TTL

export async function fetchCloudRenderStatus(songId: string): Promise<{ keys: number[]; gcsUrls: Record<number, string> }> {
  // Check memory cache
  const cached = _cloudRenderCache[songId];
  if (cached && Date.now() - cached.fetchedAt < CLOUD_CACHE_TTL) {
    return { keys: cached.keys, gcsUrls: cached.gcsUrls };
  }
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase
      .from('rendered_vocals')
      .select('song_key, gcs_url')
      .eq('song_id', songId);
    const keys: number[] = [];
    const gcsUrls: Record<number, string> = {};
    if (data) {
      for (const row of data) {
        if (!keys.includes(row.song_key)) keys.push(row.song_key);
        gcsUrls[row.song_key] = row.gcs_url;
      }
    }
    keys.sort((a, b) => a - b);
    _cloudRenderCache[songId] = { keys, gcsUrls, fetchedAt: Date.now() };
    return { keys, gcsUrls };
  } catch (e) {
    console.warn('[BatchRender] Cloud status fetch failed:', e);
    return { keys: [], gcsUrls: {} };
  }
}

export async function fetchCloudRenderStatusBulk(songIds: string[]): Promise<Record<string, { keys: number[]; fullyRendered: boolean }>> {
  // Disabled to prevent API rate limiting / ERR_INSUFFICIENT_RESOURCES
  // Use fetchAllCloudRenderedSongsFull() instead to get the full catalog in 1 request.
  return {};
}

// ── Fetch All Cloud Rendered Songs ──
export interface CloudRenderedSong {
  songId: string;
  keys: number[];
  gcsUrls: Record<number, string>;
  voice: string;
  fullyRendered: boolean;
  // Derived from GCS url
  titleHint?: string;
}

export async function fetchAllCloudRenderedSongs(): Promise<Record<string, number[]>> {
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase
      .from('rendered_vocals')
      .select('song_id, song_key, gcs_url, voice');
    
    const grouped: Record<string, number[]> = {};
    if (data) {
      for (const row of data) {
        const sid = row.song_id;
        if (!grouped[sid]) grouped[sid] = [];
        if (!grouped[sid].includes(row.song_key)) grouped[sid].push(row.song_key);
        // Update cloud cache with gcs_url too
        if (!_cloudRenderCache[sid]) {
          _cloudRenderCache[sid] = { keys: [], gcsUrls: {}, fetchedAt: Date.now() };
        }
        _cloudRenderCache[sid].gcsUrls[row.song_key] = row.gcs_url;
      }
    }
    for (const sid in grouped) {
      grouped[sid].sort((a, b) => a - b);
      if (_cloudRenderCache[sid]) {
        _cloudRenderCache[sid].keys = grouped[sid];
        _cloudRenderCache[sid].fetchedAt = Date.now();
      } else {
        _cloudRenderCache[sid] = { keys: grouped[sid], gcsUrls: {}, fetchedAt: Date.now() };
      }
    }
    return grouped;
  } catch (e) {
    console.warn('[BatchRender] Failed to fetch all cloud songs:', e);
    return {};
  }
}

export async function fetchAllCloudRenderedSongsFull(): Promise<CloudRenderedSong[]> {
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase
      .from('rendered_vocals')
      .select('song_id, song_key, gcs_url, voice')
      .neq('song_id', 'test_song');
    
    const grouped: Record<string, CloudRenderedSong> = {};
    if (data) {
      for (const row of data) {
        const sid = row.song_id; // e.g. "song_QmbhyVJ5..."
        if (!grouped[sid]) {
          grouped[sid] = { songId: sid, keys: [], gcsUrls: {}, voice: row.voice || '', fullyRendered: false };
        }
        if (!grouped[sid].keys.includes(row.song_key)) grouped[sid].keys.push(row.song_key);
        grouped[sid].gcsUrls[row.song_key] = row.gcs_url;
      }
    }
    const result: CloudRenderedSong[] = [];
    for (const sid in grouped) {
      const entry = grouped[sid];
      entry.keys.sort((a, b) => a - b);
      entry.fullyRendered = entry.keys.length >= 12;

      // Populate cloud cache with BOTH variants so any local ID format can match:
      // "song_Qm..." (primary) and "Qm..." (without prefix)
      const cacheEntry = { keys: entry.keys, gcsUrls: entry.gcsUrls, fetchedAt: Date.now() };
      _cloudRenderCache[sid] = cacheEntry;
      if (sid.startsWith('song_')) {
        _cloudRenderCache[sid.replace(/^song_/, '')] = cacheEntry; // also register without prefix
      } else {
        _cloudRenderCache['song_' + sid] = cacheEntry; // also register with prefix
      }

      result.push(entry);
    }
    return result;
  } catch (e) {
    console.warn('[BatchRender] Failed to fetch full cloud songs:', e);
    return [];
  }
}

// ── Combined status: localStorage + Cloud ──
export function isSongFullyRendered(songId: string, keys: number[] = [-5,-4,-3,-2,-1,0,1,2,3,4,5,6]): boolean {
  // Check localStorage first (instant)
  const local = getBatchRenderedSongs();
  if (local[songId] && keys.every(k => local[songId].includes(k))) return true;
  // Check cloud cache (if available, non-blocking)
  const cloud = _cloudRenderCache[songId];
  if (cloud && keys.every(k => cloud.keys.includes(k))) return true;
  return false;
}

export function getSongRenderedKeyCount(songId: string): number {
  const local = getBatchRenderedSongs();
  const localKeys = new Set(local[songId] || []);
  const cloud = _cloudRenderCache[songId];
  if (cloud) cloud.keys.forEach(k => localKeys.add(k));
  return localKeys.size;
}

export function getSongRenderedKeys(songId: string): number[] {
  const local = getBatchRenderedSongs();
  const keys = new Set(local[songId] || []);
  const cloud = _cloudRenderCache[songId];
  if (cloud) cloud.keys.forEach(k => keys.add(k));
  return Array.from(keys).sort((a, b) => a - b);
}


// ── Main Service ──
export class BatchRenderService {
  private listeners: ProgressListener[] = [];
  private jobs: BatchRenderJob[] = [];
  private isRunning = false;
  private isPaused = false;
  private abortController: AbortController | null = null;
  private startTime = 0;
  private completed = 0;
  private errors = 0;
  private skipped = 0;
  private currentJob: BatchRenderJob | null = null;
  private statusText = '';
  private avgRenderTime = 180_000; // 3 min initial estimate
  private generation = 0; // guards against stale workers from previous runs

  subscribe(listener: ProgressListener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify() {
    const progress: BatchRenderProgress = {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentJob: this.currentJob,
      jobs: [...this.jobs],
      completed: this.completed,
      total: this.jobs.length,
      errors: this.errors,
      skipped: this.skipped,
      elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
      estimatedRemainingMs: this.completed > 0
        ? (this.avgRenderTime * (this.jobs.length - this.completed - this.skipped - this.errors))
        : (this.avgRenderTime * this.jobs.length),
      statusText: this.statusText,
    };
    this.listeners.forEach(l => l(progress));
  }

  buildQueue(songs: { song: Song; xmlData: string }[], transposeRange: number[] = [-5,-4,-3,-2,-1,0,1,2,3,4,5,6]) {
    this.jobs = [];
    this.completed = 0;
    this.errors = 0;
    this.skipped = 0;
    const rendered = getBatchRenderedSongs();

    for (const { song } of songs) {
      for (const tp of transposeRange) {
        if (rendered[song.id]?.includes(tp)) {
          this.jobs.push({ songId: song.id, songTitle: song.title || 'Untitled', transpose: tp, status: 'skipped' });
          this.skipped++;
        } else {
          this.jobs.push({ songId: song.id, songTitle: song.title || 'Untitled', transpose: tp, status: 'pending' });
        }
      }
    }
    this.notify();
  }

  async start(songs: { song: Song; xmlData: string }[]) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.abortController = new AbortController();
    const gen = ++this.generation; // capture generation for stale-run detection
    
    const stepMap: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    
    const activeVoiceName = localStorage.getItem('vocalido_active_voice') || 'Nico';
    const trackEngineId = localStorage.getItem('vocalido_active_engine') || 'nico';
    const svsSteps = parseInt(localStorage.getItem('vocalido_svs_steps') || '10');
    const svsTimingFeel = parseInt(localStorage.getItem('vocalido_svs_timing_feel') || '50');
    const svsPortamento = parseInt(localStorage.getItem('vocalido_portamento') || '120');
    const svsVibratoDepth = parseInt(localStorage.getItem('vocalido_vibrato_depth') || '0');
    const svsVibratoSpeed = parseFloat(localStorage.getItem('vocalido_vibrato_speed') || '4.8');
    const svsVibratoStart = parseInt(localStorage.getItem('vocalido_vibrato_start') || '100');
    const svsPitchBlend = parseFloat(localStorage.getItem('vocalido_pitch_blend') || '0');
    const lyricMode: LyricMode = (localStorage.getItem('vocalido_lyric_mode') as LyricMode) || 'Solfege';
    
    const songMap = new Map<string, { song: Song; xmlData: string }>();
    for (const s of songs) songMap.set(s.song.id, s);

    let jobIndex = 0;
    
    const worker = async (workerId: number) => {
      while (this.isRunning && !this.abortController?.signal.aborted && gen === this.generation) {
        // Handle pause
        if (this.isPaused) {
          if (workerId === 0) {
            this.statusText = '⏸️ Paused';
            this.notify();
          }
          await new Promise<void>(resolve => {
            const check = setInterval(() => {
              if (!this.isPaused || !this.isRunning) { clearInterval(check); resolve(); }
            }, 500);
          });
          if (!this.isRunning) break;
        }

        // atomically pick next job
        let job: BatchRenderJob | null = null;
        while (jobIndex < this.jobs.length) {
          const next = this.jobs[jobIndex++];
          if (next.status === 'pending') {
            job = next;
            break;
          }
        }
        if (!job) break; // no more pending jobs

        if (workerId === 0) this.currentJob = job; // mostly for UI tracking
        job.status = 'rendering';
        job.startedAt = Date.now();
        if (workerId === 0) {
          this.statusText = `🎤 Rendering: ${job.songTitle} (key ${job.transpose >= 0 ? '+' : ''}${job.transpose}) [concurrent: 3]`;
          this.notify();
        }

        try {
          const songEntry = songMap.get(job.songId);
          if (!songEntry) { job.status = 'error'; job.error = 'Song not found'; this.errors++; continue; }

          let { song, xmlData } = songEntry;
          let finalXml = xmlData;
          if ((!finalXml || !finalXml.includes('<score-partwise')) && !finalXml.startsWith('http') && String(song.id).length > 20) {
            finalXml = `https://storage.googleapis.com/memolody-vault/pdmx-vault/${song.id}.mxl`;
          }
          if (finalXml && finalXml.startsWith('http')) {
            try {
              const url = finalXml.split('?')[0];
              const isMxl = url.endsWith('.mxl');
              const resp = await fetch(finalXml);
              if (resp.ok) {
                if (isMxl) {
                  const blob = await resp.blob();
                  const JSZip = (await import('jszip')).default || await import('jszip');
                  const jszipInstance = new (JSZip as any)();
                  const zip = await jszipInstance.loadAsync(blob);
                  for (const [name, file] of Object.entries(zip.files)) {
                    if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
                      finalXml = await (file as any).async('string');
                      break;
                    }
                  }
                } else {
                  finalXml = await resp.text();
                }
                songEntry.xmlData = finalXml; // Cache for subsequent transpose keys
              }
            } catch (e) {
              console.warn(`[BatchRender] Failed to fetch XML for ${song.id}:`, e);
            }
          }

          const parsed = musicEngine.parseMusicXml(finalXml);
          if (!parsed.notes.length) { job.status = 'error'; job.error = 'No notes'; this.errors++; continue; }

          const songKey = parsed.metadata.key || 'C';
          const songFifths = parsed.metadata.fifths ?? 0;
          const bpm = parsed.metadata.bpm || 120;
          const transposeSemitones = job.transpose;
          const allTrackIds = [...new Set(parsed.notes.map(n => n.trackId))];
          const sourceNotes = [...parsed.notes].sort((a, b) => a.startTime - b.startTime);

          const notesToSynthesize = sourceNotes.map(n => {
            let lyric = 'Doh';
            try {
              const computed = getChromaticSolfege(n.step || 'C', n.alter || 0, songKey, lyricMode, n.duration / (parsed.timeSignature.beats || 4), songFifths, transposeSemitones);
              lyric = computed || n.solfege || 'Doh';
            } catch {}
            const safeStep = (n.step || 'C').toUpperCase();
            const rawMidi = (n.octave + 1) * 12 + (stepMap[safeStep] || 0) + (n.alter || 0);
            const transposedMidi = Math.max(24, Math.min(108, rawMidi + transposeSemitones));
            return { pitch: transposedMidi, midi: transposedMidi, duration: isNaN(n.duration) ? 0.5 : n.duration, startTime: isNaN(n.startTime) ? 0 : n.startTime, lyric, trackId: n.trackId || allTrackIds[0] || 'P1', staff: n.staff ?? 1, voice: n.voice ?? 1 };
          });

          const synthParams = { singer: activeVoiceName, bpm, transpose: 0, voice: trackEngineId, return_stems: false, collapse_chords: true, steps: svsSteps, timing_feel: svsTimingFeel, portamento: svsPortamento, vibrato_start: svsVibratoStart, vibrato_depth: svsVibratoDepth, vibrato_speed: svsVibratoSpeed, pitch_blend: svsPitchBlend };

          const noteHash = notesToSynthesize.slice(0, 8).map(n => n.midi).join('-');
          const payload = { notes: notesToSynthesize, song_id: `${song.id}_batch_tp${transposeSemitones}_bpm${bpm}_${noteHash}`, song_key: songKey, bpm_pct: 100, lyric_mode: lyricMode, is_public: true, owner_id: '', params: synthParams };

          // Send to server
          const asyncUrl = getDirectServerUrl('/studio/preview-async');
          const pollBase = getDirectServerUrl('/studio/job/');
          
          let submitRes: Response;
          try {
            submitRes = await svsFetch(asyncUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: this.abortController!.signal });
          } catch { submitRes = { ok: false, status: 0 } as Response; }

          if (!submitRes.ok) {
            const syncUrl = getDirectServerUrl('/studio/preview');
            const syncRes = await svsFetch(syncUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: this.abortController!.signal });
            if (!syncRes.ok) throw new Error(`Server ${syncRes.status}`);
            const data = await syncRes.json();
            if (data.error) throw new Error(data.error);
            await this.saveResult(song, data, transposeSemitones, songKey, bpm, lyricMode, activeVoiceName, trackEngineId, svsTimingFeel, allTrackIds);
          } else {
            const { job_id } = await submitRes.json();
            if (!job_id) throw new Error('No job_id');
            const pollStart = Date.now();
            while (Date.now() - pollStart < 3_600_000) {
              if (this.abortController?.signal.aborted) throw new DOMException('Aborted', 'AbortError');
              await new Promise(r => setTimeout(r, 3000));
              if (workerId === 0) {
                this.statusText = `🎤 ${job.songTitle} (key ${job.transpose >= 0 ? '+' : ''}${job.transpose}) — GPU ${Math.round((Date.now() - pollStart) / 1000)}s`;
                this.notify();
              }
              const pollRes = await svsFetch(`${pollBase}${job_id}`, { signal: this.abortController!.signal });
              if (!pollRes.ok) continue;
              const data = await pollRes.json();
              if (data.status === 'done') { if (data.error) throw new Error(data.error); await this.saveResult(song, data, transposeSemitones, songKey, bpm, lyricMode, activeVoiceName, trackEngineId, svsTimingFeel, allTrackIds); break; }
              if (data.status === 'error') throw new Error(data.error || 'Render error');
            }
          }

          job.status = 'done';
          job.completedAt = Date.now();
          this.completed++;
          if (job.startedAt && job.completedAt) this.avgRenderTime = Math.round((this.avgRenderTime + (job.completedAt - job.startedAt)) / 2);
          saveBatchRendered(job.songId, job.transpose);
          console.log(`[BatchRender] ✅ ${job.songTitle} key=${job.transpose} (${this.completed}/${this.jobs.length}) [Worker ${workerId}]`);
        } catch (err: any) {
          if (err.name === 'AbortError') { job.status = 'pending'; break; }
          job.status = 'error';
          job.error = err.message || 'Unknown error';
          this.errors++;
          console.error(`[BatchRender] ❌ ${job.songTitle} key=${job.transpose}:`, err);
        }
        this.notify();
      }
    };

    const CONCURRENT_WORKERS = 3;
    const workerPromises = Array.from({ length: CONCURRENT_WORKERS }).map((_, i) => worker(i));
    await Promise.all(workerPromises);

    // Only update state if this run is still the active generation (not superseded by stop/restart)
    if (gen === this.generation) {
      this.isRunning = false;
      this.currentJob = null;
      this.statusText = this.completed > 0 ? `✅ Done! ${this.completed} rendered, ${this.errors} errors, ${this.skipped} skipped.` : '⏹️ Stopped';
      this.notify();
    }
  }

  private async saveResult(song: Song, data: any, transpose: number, songKey: string, bpm: number, lyricMode: LyricMode, voiceName: string, engineId: string, timingFeel: number, trackIds: string[]) {
    let blob: Blob | null = null;
    if (data.audio_b64) {
      const mime = data.mime_type || 'audio/wav';
      const binary = atob(data.audio_b64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
      blob = new Blob([array], { type: mime });
    } else if (data.audio_url || data.saved_url) {
      const audioUrl = fixAudioUrl(data.saved_url || data.audio_url);
      const resp = await svsFetch(audioUrl);
      if (resp.ok) blob = await resp.blob();
    }
    if (blob && blob.size > 0) {
      const entryKey = `100_${songKey}_${engineId}_${lyricMode}_${voiceName}_tf${timingFeel}_tp${transpose}_tr${trackIds.join(',')}_v2`;
      const cacheKey = `vocal_render_${song.id}_${entryKey}`;
      await AudioBlobCache.set(cacheKey, blob);
      console.log(`[BatchRender] 💾 ${cacheKey} (${(blob.size/1024).toFixed(0)} KB)`);
    }
  }

  pause() { this.isPaused = true; this.statusText = '⏸️ Pausing...'; this.notify(); }
  resume() { this.isPaused = false; }
  stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.generation++; // invalidate any in-flight workers
    this.abortController?.abort();
    this.abortController = null;
    this.currentJob = null;
    this.jobs = [];
    this.completed = 0;
    this.errors = 0;
    this.skipped = 0;
    // Stop server-side batch if running
    if (this.serverBatchId) {
      const stopUrl = getDirectServerUrl(`/studio/batch-render/${this.serverBatchId}/stop`);
      svsFetch(stopUrl, { method: 'POST' }).catch(() => {});
      this.serverBatchId = null;
    }
    if (this.serverPollInterval) {
      clearInterval(this.serverPollInterval);
      this.serverPollInterval = null;
    }
    this.statusText = '⏹️ Stopped';
    this.notify();
  }

  // ── Server-Side Batch Render (10x faster — renders on GPU locally) ──
  private serverBatchId: string | null = null;
  private serverPollInterval: ReturnType<typeof setInterval> | null = null;

  async startServerSide(songIds: string[]) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.completed = 0;
    this.errors = 0;
    this.skipped = 0;
    this.jobs = [];
    this.statusText = '🚀 Starting server-side batch render...';
    this.notify();

    const activeVoiceName = localStorage.getItem('vocalido_active_voice') || 'Nico';
    const trackEngineId = localStorage.getItem('vocalido_active_engine') || 'nico';
    const lyricMode = localStorage.getItem('vocalido_lyric_mode') || 'Solfege';
    const svsSteps = parseInt(localStorage.getItem('vocalido_svs_steps') || '10');
    const svsTimingFeel = parseInt(localStorage.getItem('vocalido_svs_timing_feel') || '50');
    const svsPortamento = parseInt(localStorage.getItem('vocalido_portamento') || '120');
    const svsVibratoDepth = parseInt(localStorage.getItem('vocalido_vibrato_depth') || '0');
    const svsVibratoSpeed = parseFloat(localStorage.getItem('vocalido_vibrato_speed') || '4.8');
    const svsVibratoStart = parseInt(localStorage.getItem('vocalido_vibrato_start') || '100');
    const svsPitchBlend = parseInt(localStorage.getItem('vocalido_pitch_blend') || '0');

    try {
      const url = getDirectServerUrl('/studio/batch-render');
      const res = await svsFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song_ids: songIds,
          transpose_range: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6],
          params: {
            singer: activeVoiceName,
            voice: trackEngineId,
            lyric_mode: lyricMode,
            steps: svsSteps,
            timing_feel: svsTimingFeel,
            portamento: svsPortamento,
            vibrato_depth: svsVibratoDepth,
            vibrato_speed: svsVibratoSpeed,
            vibrato_start: svsVibratoStart,
            pitch_blend: svsPitchBlend,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        this.statusText = `❌ ${err.error || 'Failed to start server batch'}`;
        this.isRunning = false;
        this.notify();
        return;
      }

      const data = await res.json();
      this.serverBatchId = data.batch_id;
      const total = data.total_jobs || songIds.length * 12;

      // Create placeholder jobs for UI
      for (const sid of songIds) {
        for (let tp = -5; tp <= 6; tp++) {
          this.jobs.push({ songId: sid, songTitle: sid.slice(0, 12) + '...', transpose: tp, status: 'pending' });
        }
      }
      this.statusText = `⚡ Server-side rendering: 0/${total}`;
      this.notify();

      // Poll progress every 5 seconds
      this.serverPollInterval = setInterval(async () => {
        if (!this.serverBatchId || !this.isRunning) {
          if (this.serverPollInterval) clearInterval(this.serverPollInterval);
          return;
        }

        try {
          const pollUrl = getDirectServerUrl(`/studio/batch-render/${this.serverBatchId}`);
          const pollRes = await svsFetch(pollUrl);
          if (!pollRes.ok) return;

          const progress = await pollRes.json();
          this.completed = progress.completed || 0;
          this.errors = progress.errors || 0;
          this.skipped = progress.skipped || 0;

          // Update job statuses for UI
          const completedCount = this.completed + this.errors + this.skipped;
          this.jobs.forEach((j, i) => {
            if (i < completedCount) {
              j.status = i < this.completed ? 'done' : 'error';
            } else if (i === completedCount) {
              j.status = 'rendering';
              this.currentJob = j;
            }
          });

          const elapsed = Math.round(progress.elapsed_seconds || 0);
          const remaining = Math.round(progress.estimated_remaining_seconds || 0);
          const remainStr = remaining > 60 ? `~${Math.ceil(remaining / 60)}m` : `~${remaining}s`;
          const keyStr = progress.current_key >= 0 ? `+${progress.current_key}` : `${progress.current_key}`;
          this.statusText = `⚡ GPU Rendering: ${this.completed}/${progress.total} (key ${keyStr}) — ${remainStr} left`;

          // Mark rendered songs in localStorage
          for (const doneId of (progress.songs_done || [])) {
            for (let tp = -5; tp <= 6; tp++) {
              saveBatchRendered(doneId, tp);
            }
          }

          this.notify();

          // Check if done
          if (progress.status === 'done' || progress.status === 'stopped') {
            if (this.serverPollInterval) clearInterval(this.serverPollInterval);
            this.serverPollInterval = null;
            this.serverBatchId = null;
            this.isRunning = false;
            this.currentJob = null;
            this.statusText = progress.status === 'done'
              ? `✅ Server render done! ${this.completed} rendered, ${this.errors} errors in ${Math.round(elapsed / 60)}m`
              : '⏹️ Stopped';
            this.notify();
          }
        } catch (e) {
          console.warn('[BatchRender] Poll error:', e);
        }
      }, 5000);

    } catch (err: any) {
      this.statusText = `❌ ${err.message || 'Connection failed'}`;
      this.isRunning = false;
      this.notify();
    }
  }
}

export const batchRenderService = new BatchRenderService();

