/**
 * QuotaModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown when a user hits their render quota limit.
 * Displays current usage and links to the Pricing / Upgrade page.
 *
 * USAGE:
 *   <QuotaModal
 *     isOpen={showQuota}
 *     onClose={() => setShowQuota(false)}
 *     onUpgrade={() => navigate('subscription')}
 *     reason="เพลงนี้ถูก Render ครบ 3 ครั้งแล้ว"
 *     status={{ rendersForThisSong: 3, rendersPerSong: 3, songsRenderedToday: 3, dailySongQuota: 3 }}
 *   />
 */
import React from 'react';
import { X, Zap, TrendingUp, Lock } from 'lucide-react';
import type { QuotaStatus } from '../../lib/MemoRenderStorage';

interface QuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  reason?: string;
  status?: Pick<QuotaStatus, 'rendersForThisSong' | 'rendersPerSong' | 'songsRenderedToday' | 'dailySongQuota'>;
}

export function QuotaModal({ isOpen, onClose, onUpgrade, reason, status }: QuotaModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99998] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-[#111115] border border-white/10 rounded-[40px] p-8 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
          <Lock size={24} className="text-amber-400" />
        </div>

        {/* Heading */}
        <h2 className="text-xl font-black text-white italic tracking-tighter uppercase mb-2">
          Render Quota เต็มแล้ว
        </h2>
        {reason && (
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wide leading-relaxed mb-6">
            {reason}
          </p>
        )}

        {/* Usage bars */}
        {status && (
          <div className="space-y-3 mb-6 p-4 bg-black/40 rounded-2xl border border-white/5">
            <UsageBar
              label="Render / เพลงนี้"
              used={status.rendersForThisSong}
              max={status.rendersPerSong}
              color="bg-rose-500"
            />
            <UsageBar
              label="เพลงที่ Render วันนี้"
              used={status.songsRenderedToday}
              max={status.dailySongQuota}
              color="bg-amber-500"
            />
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onUpgrade}
          className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black uppercase tracking-widest text-[11px] rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-amber-500/20"
        >
          <TrendingUp size={16} />
          อัพเกรดเพื่อ Render เพิ่ม
        </button>
        <button
          onClick={onClose}
          className="w-full mt-3 py-2.5 text-[9px] font-black text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
        >
          ปิด — รอพรุ่งนี้
        </button>
      </div>
    </div>
  );
}

function UsageBar({ label, used, max, color }: {
  label: string; used: number; max: number; color: string;
}) {
  const pct = Math.min(100, (used / max) * 100);
  const isFull = pct >= 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">{label}</span>
        <span className={`text-[9px] font-black ${isFull ? 'text-rose-400' : 'text-white'}`}>
          {used}/{max}
        </span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isFull ? 'bg-rose-500' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
