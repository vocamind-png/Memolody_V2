import React, { useEffect, useState, useRef } from 'react';
import { Users, Cpu, Clock, Wifi, WifiOff, X } from 'lucide-react';
import { startPolling, stopPolling, cancelJob, type QueueStatus } from '../../lib/RenderQueueService';

interface RenderQueueCardProps {
  jobId: string;
  songTitle: string;
  trackName: string;
  voiceName: string;
  onReadyToRender: () => void;  // called when position becomes 0 and GPU is free
  onCancel: () => void;
}

function formatWait(seconds: number): string {
  if (seconds <= 0) return 'Any moment now...';
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins} min`;
}

export const RenderQueueCard: React.FC<RenderQueueCardProps> = ({
  jobId,
  songTitle,
  trackName,
  voiceName,
  onReadyToRender,
  onCancel,
}) => {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const hasTriggeredRender = useRef(false);

  useEffect(() => {
    startPolling(jobId, (s) => {
      setStatus(s);
      // When we reach position 0 (our turn) and GPU becomes idle → trigger render
      if (!hasTriggeredRender.current && s.position === 0 && s.gpuStatus === 'idle') {
        hasTriggeredRender.current = true;
        stopPolling();
        onReadyToRender();
      }
    });
    return () => stopPolling();
  }, [jobId]);

  const handleCancel = async () => {
    stopPolling();
    await cancelJob(jobId);
    onCancel();
  };

  const pos = status?.position ?? 1;
  const waiting = status?.totalWaiting ?? 0;
  const gpuBusy = status?.gpuStatus === 'busy';
  const waitSecs = status?.estimatedWaitSeconds ?? 0;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" />
      <div className="relative z-10 pointer-events-auto w-[320px] bg-zinc-950/98 border border-zinc-800 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Cpu size={14} className="text-cyan-400" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">GPU Queue</span>
          </div>
          <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider ${gpuBusy ? 'text-amber-400' : 'text-emerald-400'}`}>
            {gpuBusy ? <WifiOff size={10} /> : <Wifi size={10} />}
            {gpuBusy ? 'GPU Busy' : 'GPU Ready'}
          </div>
        </div>

        {/* Queue position */}
        <div className="px-5 py-5">
          {pos === 0 ? (
            /* Starting render */
            <div className="flex flex-col items-center text-center gap-3">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" />
                <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-black font-black text-xl shadow-[0_0_30px_rgba(6,182,212,0.5)]">
                  ✓
                </div>
              </div>
              <div>
                <div className="text-base font-black text-white">Your Turn!</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Starting AI synthesis...</div>
              </div>
            </div>
          ) : (
            /* Waiting in queue */
            <div className="flex items-center gap-4">
              {/* Position badge */}
              <div className="relative w-[72px] h-[72px] flex-shrink-0">
                <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                  <circle
                    cx="36" cy="36" r="30" fill="none"
                    stroke="url(#queueGrad)" strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 30}`}
                    strokeDashoffset={`${2 * Math.PI * 30 * (1 - 1 / Math.max(pos, 2))}`}
                    className="transition-all duration-1000"
                  />
                  <defs>
                    <linearGradient id="queueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[22px] font-black text-white leading-none">{pos}</span>
                  <span className="text-[8px] text-zinc-500 font-bold uppercase">in line</span>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black text-white truncate">{songTitle}</div>
                <div className="text-[10px] text-zinc-500 truncate mt-0.5">{trackName} · {voiceName}</div>

                <div className="flex items-center gap-3 mt-2.5">
                  <div className="flex items-center gap-1.5">
                    <Clock size={10} className="text-cyan-400" />
                    <span className="text-[10px] font-bold text-cyan-300">{formatWait(waitSecs)}</span>
                  </div>
                  {waiting > 1 && (
                    <div className="flex items-center gap-1.5">
                      <Users size={10} className="text-zinc-500" />
                      <span className="text-[10px] text-zinc-500">{waiting} waiting</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* GPU Status row */}
        <div className="px-5 pb-4">
          <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">GPU-1 · RTX 3090</span>
              <div className={`w-1.5 h-1.5 rounded-full ${gpuBusy ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            </div>
            {gpuBusy && status?.currentJob ? (
              <div className="text-[9px] text-zinc-500 truncate">
                Rendering: <span className="text-zinc-300">{status.currentJob.songTitle}</span>
              </div>
            ) : (
              <div className="text-[9px] text-emerald-400 font-medium">Available</div>
            )}
            <div className="mt-1.5 text-[9px] text-zinc-700 italic">GPU-2 · Coming soon</div>
          </div>
        </div>

        {/* Cancel button */}
        <div className="px-5 pb-5">
          <button
            onClick={handleCancel}
            className="w-full py-2.5 bg-transparent border border-zinc-800 hover:border-rose-500/40 text-zinc-500 hover:text-rose-400 font-black text-[9px] uppercase tracking-widest rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5"
          >
            <X size={10} />
            Leave Queue
          </button>
        </div>
      </div>
    </div>
  );
};

export default RenderQueueCard;
