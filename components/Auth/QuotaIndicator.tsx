/**
 * QuotaIndicator.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact quota display to embed inside PlayerPage toolbar.
 * Shows: "Renders today: 2/3 | This song: 1/3"
 *
 * USAGE (in PlayerPage when ready):
 *   import { QuotaIndicator } from '../Auth/QuotaIndicator';
 *
 *   <QuotaIndicator
 *     userId={user?.id}
 *     songId={song?.id}
 *     rendersPerSong={user?.rendersPerSong ?? 3}
 *     dailySongQuota={user?.dailySongQuota ?? 3}
 *     tier={user?.tier ?? 'free'}
 *     onUpgradeClick={() => navigate('subscription')}
 *   />
 */
import React, { useEffect, useState } from 'react';
import { Zap, TrendingUp } from 'lucide-react';
import {
  loadUserRenders,
  type QuotaStatus,
  checkRenderQuota,
} from '../../lib/MemoRenderStorage';
import type { MemberTier } from '../../lib/AuthContext';

interface QuotaIndicatorProps {
  userId: string | undefined;
  songId: string | undefined;
  rendersPerSong: number;
  dailySongQuota: number;
  tier: MemberTier;
  onUpgradeClick?: () => void;
  /** Pass a refresh counter to force re-read after each render */
  refreshKey?: number;
}

export function QuotaIndicator({
  userId,
  songId,
  rendersPerSong,
  dailySongQuota,
  tier,
  onUpgradeClick,
  refreshKey = 0,
}: QuotaIndicatorProps) {
  const [status, setStatus] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    if (!userId || !songId) return;
    const s = checkRenderQuota(userId, songId, rendersPerSong, dailySongQuota);
    setStatus(s);
  }, [userId, songId, rendersPerSong, dailySongQuota, refreshKey]);

  if (!status || !userId) return null;

  // Unlimited tiers — show nothing
  if (rendersPerSong >= 9999) return null;

  const songPct = Math.min(100, (status.rendersForThisSong / status.rendersPerSong) * 100);
  const dayPct  = Math.min(100, (status.songsRenderedToday / status.dailySongQuota) * 100);
  const isWarning = songPct >= 66 || dayPct >= 66;
  const isFull    = !status.allowed;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-wider transition-all ${
        isFull
          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          : isWarning
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            : 'bg-white/[0.03] border-white/[0.06] text-zinc-500'
      }`}
    >
      <Zap size={10} className={isFull ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-zinc-600'} />

      {/* Song renders */}
      <div className="flex items-center gap-1.5">
        <span>เพลงนี้</span>
        <MiniBar used={status.rendersForThisSong} max={status.rendersPerSong} />
        <span>{status.rendersForThisSong}/{status.rendersPerSong}</span>
      </div>

      <span className="text-zinc-700">·</span>

      {/* Daily */}
      <div className="flex items-center gap-1.5">
        <span>วันนี้</span>
        <MiniBar used={status.songsRenderedToday} max={status.dailySongQuota} />
        <span>{status.songsRenderedToday}/{status.dailySongQuota}</span>
      </div>

      {/* Upgrade link */}
      {(isFull || isWarning) && onUpgradeClick && (
        <button
          onClick={onUpgradeClick}
          className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-all"
        >
          <TrendingUp size={8} />
          อัพเกรด
        </button>
      )}
    </div>
  );
}

function MiniBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, (used / max) * 100);
  return (
    <div className="w-10 h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          pct >= 100 ? 'bg-rose-500' : pct >= 66 ? 'bg-amber-500' : 'bg-emerald-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
