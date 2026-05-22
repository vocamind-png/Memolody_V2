/**
 * MemoRenderStorage.ts
 * Per-user, per-song render history + quota tracking
 */
import type { MemberTier } from './AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface MemoRenderEntry {
  bpmPercent: number;
  songKey: string;
  audioUrl: string;
  label: string;
  filename?: string;
  lyricMode?: string;
  engineId?: string;
  voiceName?: string;
  savedStemUrls?: string[];
  renderedAt?: string;
}

export interface QuotaStatus {
  allowed: boolean;
  reason?: string;
  songsRenderedToday: number;
  rendersForThisSong: number;
  dailySongQuota: number;
  rendersPerSong: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Keys
// ─────────────────────────────────────────────────────────────────────────────
// Per-user, per-song history
function historyKey(userId: string, songId: string) {
  return `memo_render_u${userId}_s${songId}`;
}
// Daily usage tracking (resets at midnight)
function dailyKey(userId: string) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `memo_daily_u${userId}_${today}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core functions
// ─────────────────────────────────────────────────────────────────────────────
export function loadUserRenders(userId: string, songId: string): MemoRenderEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(userId, songId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserRenders(userId: string, songId: string, history: MemoRenderEntry[]): void {
  try {
    localStorage.setItem(historyKey(userId, songId), JSON.stringify(history.slice(0, 12)));
  } catch {}
}

export function clearUserRenders(userId: string, songId: string): void {
  try {
    localStorage.removeItem(historyKey(userId, songId));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily quota tracking
// ─────────────────────────────────────────────────────────────────────────────
interface DailyRecord {
  songsRendered: string[]; // unique songIds rendered today
}

function loadDailyRecord(userId: string): DailyRecord {
  try {
    const raw = localStorage.getItem(dailyKey(userId));
    return raw ? JSON.parse(raw) : { songsRendered: [] };
  } catch {
    return { songsRendered: [] };
  }
}

function saveDailyRecord(userId: string, rec: DailyRecord): void {
  try {
    localStorage.setItem(dailyKey(userId), JSON.stringify(rec));
  } catch {}
}

/** Call this AFTER a successful render to record usage */
export function recordDailyRender(userId: string, songId: string): void {
  const rec = loadDailyRecord(userId);
  if (!rec.songsRendered.includes(songId)) {
    rec.songsRendered.push(songId);
  }
  saveDailyRecord(userId, rec);
}

// ─────────────────────────────────────────────────────────────────────────────
// Quota check
// ─────────────────────────────────────────────────────────────────────────────
export function checkRenderQuota(
  userId: string,
  songId: string,
  rendersPerSong: number,
  dailySongQuota: number,
): QuotaStatus {
  const history = loadUserRenders(userId, songId);
  const daily = loadDailyRecord(userId);
  const rendersForThisSong = history.length;
  const songsRenderedToday = daily.songsRendered.length;

  // Check per-song limit
  if (rendersForThisSong >= rendersPerSong) {
    return {
      allowed: false,
      reason: `เพลงนี้ถูก Render ครบ ${rendersPerSong} ครั้งแล้ว (${rendersForThisSong}/${rendersPerSong}) — อัพเกรดเพื่อ Render เพิ่มครับ`,
      songsRenderedToday,
      rendersForThisSong,
      dailySongQuota,
      rendersPerSong,
    };
  }

  // Check daily song limit (only if this is a NEW song for today)
  const isNewSongToday = !daily.songsRendered.includes(songId);
  if (isNewSongToday && songsRenderedToday >= dailySongQuota) {
    return {
      allowed: false,
      reason: `วันนี้ Render ครบ ${dailySongQuota} เพลงแล้ว — อัพเกรดเพื่อ Render เพิ่มครับ`,
      songsRenderedToday,
      rendersForThisSong,
      dailySongQuota,
      rendersPerSong,
    };
  }

  return {
    allowed: true,
    songsRenderedToday,
    rendersForThisSong,
    dailySongQuota,
    rendersPerSong,
  };
}

/** Migrate old global localStorage history for a song to user-scoped key */
export function migrateGlobalHistory(userId: string, songId: string): void {
  const oldKey = `memo_render_history_${songId}`;
  try {
    const old = localStorage.getItem(oldKey);
    if (!old) return;
    const existing = loadUserRenders(userId, songId);
    if (existing.length > 0) {
      // User already has data — skip migration to avoid duplicates
      localStorage.removeItem(oldKey);
      return;
    }
    const parsed: MemoRenderEntry[] = JSON.parse(old);
    saveUserRenders(userId, songId, parsed);
    localStorage.removeItem(oldKey);
    console.log(`[MemoStorage] ✅ Migrated ${parsed.length} renders for song ${songId} to user ${userId}`);
  } catch {
    // silent fail
  }
}
