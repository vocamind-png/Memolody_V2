/**
 * RenderQueueService
 * Manages GPU render queue via Supabase for fair, ordered access to the Vocalido server.
 */

export interface QueueJob {
  id: string;
  user_id: string;
  user_email?: string;
  song_title: string;
  track_name: string;
  status: 'waiting' | 'rendering' | 'done' | 'failed' | 'cancelled';
  gpu_id: string;
  position: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface QueueStatus {
  jobId: string | null;
  position: number;        // 0 = currently rendering, 1+ = in queue
  totalWaiting: number;
  estimatedWaitSeconds: number;
  isRendering: boolean;
  gpuStatus: 'idle' | 'busy';
  currentJob?: { songTitle: string; trackName: string } | null;
}

const TABLE = 'render_queue';
const POLL_INTERVAL_MS = 5000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 min timeout

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _currentJobId: string | null = null;
let _onStatusChange: ((status: QueueStatus) => void) | null = null;

async function getSupabase() {
  try {
    const mod = await import('./supabase');
    return mod.supabase || null;
  } catch {
    return null;
  }
}


async function fetchQueueStatus(myJobId: string | null): Promise<QueueStatus> {
  const sb = await getSupabase();
  if (!sb) {
    return { jobId: myJobId, position: 0, totalWaiting: 0, estimatedWaitSeconds: 0, isRendering: false, gpuStatus: 'idle' };
  }

  try {
    const { data: jobs, error } = await sb
      .from(TABLE)
      .select('id, user_id, song_title, track_name, status, created_at')
      .in('status', ['waiting', 'rendering'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    const allJobs: QueueJob[] = jobs || [];
    const renderingJob = allJobs.find((j: QueueJob) => j.status === 'rendering');
    const waitingJobs = allJobs.filter((j: QueueJob) => j.status === 'waiting');

    let position = 0;
    if (myJobId) {
      const myJob = allJobs.find((j: QueueJob) => j.id === myJobId);
      if (myJob) {
        if (myJob.status === 'rendering') {
          position = 0;
        } else {
          position = waitingJobs.filter((j: QueueJob) => j.created_at < myJob.created_at).length + 1;
        }
      }
    }

    const avgSecondsPerJob = 180;
    return {
      jobId: myJobId,
      position,
      totalWaiting: waitingJobs.length,
      estimatedWaitSeconds: position > 0 ? position * avgSecondsPerJob : 0,
      isRendering: !!renderingJob,
      gpuStatus: renderingJob ? 'busy' : 'idle',
      currentJob: renderingJob ? { songTitle: renderingJob.song_title, trackName: renderingJob.track_name } : null,
    };
  } catch (err) {
    console.warn('[RenderQueue] fetchQueueStatus failed:', err);
    return { jobId: myJobId, position: 0, totalWaiting: 0, estimatedWaitSeconds: 0, isRendering: false, gpuStatus: 'idle' };
  }
}

export async function joinQueue(params: {
  userId: string;
  userEmail?: string;
  songTitle: string;
  trackName: string;
}): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;

  const jobId = crypto.randomUUID();
  try {
    // Cancel stale jobs from this user
    await sb
      .from(TABLE)
      .update({ status: 'cancelled' })
      .eq('user_id', params.userId)
      .in('status', ['waiting', 'rendering'])
      .lt('created_at', new Date(Date.now() - JOB_TIMEOUT_MS).toISOString());

    const { error } = await sb.from(TABLE).insert({
      id: jobId,
      user_id: params.userId,
      user_email: params.userEmail || null,
      song_title: params.songTitle,
      track_name: params.trackName,
      status: 'waiting',
      gpu_id: 'gpu-1',
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
    _currentJobId = jobId;
    console.log('[RenderQueue] ✅ Joined queue:', jobId);
    return jobId;
  } catch (err) {
    console.error('[RenderQueue] joinQueue failed:', err);
    return null;
  }
}

export async function markJobRendering(jobId: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb || !jobId) return;
  try {
    await sb.from(TABLE).update({ status: 'rendering', started_at: new Date().toISOString() }).eq('id', jobId);
  } catch (err) {
    console.warn('[RenderQueue] markJobRendering failed:', err);
  }
}

export async function markJobDone(jobId: string): Promise<void> {
  const sb = await getSupabase();
  if (!sb || !jobId) return;
  try {
    await sb.from(TABLE).update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', jobId);
    _currentJobId = null;
  } catch (err) {
    console.warn('[RenderQueue] markJobDone failed:', err);
  }
}

export async function cancelJob(jobId: string | null): Promise<void> {
  const sb = await getSupabase();
  if (!sb || !jobId) return;
  try {
    await sb.from(TABLE).update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', jobId);
    _currentJobId = null;
  } catch (err) {
    console.warn('[RenderQueue] cancelJob failed:', err);
  }
}

export function startPolling(jobId: string, onStatusChange: (status: QueueStatus) => void): void {
  _onStatusChange = onStatusChange;
  _currentJobId = jobId;
  fetchQueueStatus(jobId).then(onStatusChange);
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(async () => {
    const status = await fetchQueueStatus(_currentJobId);
    if (_onStatusChange) _onStatusChange(status);
  }, POLL_INTERVAL_MS);
}

export function stopPolling(): void {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  _onStatusChange = null;
}

export async function getQueueStatus(): Promise<QueueStatus> {
  return fetchQueueStatus(_currentJobId);
}

export async function getAdminQueueData(): Promise<QueueJob[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from(TABLE).select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[RenderQueue] getAdminQueueData failed:', err);
    return [];
  }
}

export const renderQueueService = {
  joinQueue,
  markJobRendering,
  markJobDone,
  cancelJob,
  getQueueStatus,
  startPolling,
  stopPolling,
  getAdminQueueData,
  getCurrentJobId: () => _currentJobId,
};
