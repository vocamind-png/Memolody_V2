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

// ── Persistence ──
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

export function isSongFullyRendered(songId: string, keys: number[] = [-5,-4,-3,-2,-1,0,1,2,3,4,5,6]): boolean {
  const data = getBatchRenderedSongs();
  if (!data[songId]) return false;
  return keys.every(k => data[songId].includes(k));
}

export function getSongRenderedKeyCount(songId: string): number {
  const data = getBatchRenderedSongs();
  return data[songId]?.length || 0;
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
    
    const stepMap: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    
    const activeVoiceName = localStorage.getItem('vocalido_active_voice') || 'Lotte';
    const trackEngineId = localStorage.getItem('vocalido_active_engine') || 'lotte_v_ai_dol';
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
      while (this.isRunning && !this.abortController?.signal.aborted) {
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

          const { song, xmlData } = songEntry;
          const parsed = musicEngine.parseMusicXml(xmlData);
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

    this.isRunning = false;
    this.currentJob = null;
    this.statusText = this.completed > 0 ? `✅ Done! ${this.completed} rendered, ${this.errors} errors, ${this.skipped} skipped.` : '⏹️ Stopped';
    this.notify();
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
  stop() { this.isRunning = false; this.isPaused = false; this.abortController?.abort(); this.abortController = null; this.statusText = '⏹️ Stopped'; this.notify(); }
}

export const batchRenderService = new BatchRenderService();
