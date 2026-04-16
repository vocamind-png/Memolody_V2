import React, { useState, useEffect, useCallback, useRef } from 'react';

/** Vocalido DiffSinger Training Status Card — with Train/Import/Switch controls */

type EngineMode = 'sampler' | 'diffsinger';

const VocalidoTrainingCard: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [projectPct, setProjectPct] = useState(25);
  const [trainingPct, setTrainingPct] = useState(0);
  const [status, setStatus] = useState<'preparing' | 'training' | 'exporting' | 'done' | 'error'>('preparing');
  const [engineMode, setEngineMode] = useState<EngineMode>('sampler');
  const [importing, setImporting] = useState(false);
  const [autoShutdown, setAutoShutdown] = useState(true);
  const [gpuActive, setGpuActive] = useState(false);
  const [estCost, setEstCost] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const MILESTONES = [
    { name: 'Voice Recordings', done: true },
    { name: 'Dataset (78 files)', done: true },
    { name: 'DiffSinger Framework', done: true },
    { name: 'Colab Notebook', done: true },
    { name: 'Training Dashboard', done: true },
    { name: 'Phoneme Alignment', done: false, current: status === 'preparing' },
    { name: 'Model Training', done: status === 'done', current: status === 'training' },
    { name: 'ONNX Export', done: status === 'done', current: status === 'exporting' },
    { name: 'Server Integration', done: status === 'done' },
    { name: 'Live Singing!', done: status === 'done' },
  ];

  const completedCount = MILESTONES.filter(m => m.done).length;

  // Poll training progress
  const pollProgress = useCallback(async () => {
    try {
      const resp = await fetch('http://localhost:5001/training/status');
      if (resp.ok) {
        const data = await resp.json();
        if (data.projectPct !== undefined) setProjectPct(data.projectPct);
        if (data.trainingPct !== undefined) setTrainingPct(data.trainingPct);
        if (data.status) setStatus(data.status);
        if (data.engine) setEngineMode(data.engine);
        if (data.gpu_active !== undefined) setGpuActive(data.gpu_active);
        if (data.est_cost_usd !== undefined) setEstCost(data.est_cost_usd);
      }
    } catch { /* server might not have endpoint */ }
  }, []);

  useEffect(() => {
    pollProgress();
    const timer = setInterval(pollProgress, 30000);
    return () => clearInterval(timer);
  }, [pollProgress]);

  // ── Train: Open Colab ──
  const handleTrain = () => {
    window.open('https://colab.research.google.com/drive/', '_blank');
  };

  // ── Import ONNX models ──
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportStatus('Uploading...');

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('models', files[i]);
    }

    try {
      const resp = await fetch('http://localhost:5001/training/import-onnx', {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        const data = await resp.json();
        setImportStatus(`✅ ${data.count || files.length} models imported!`);
        setStatus('done');
        setProjectPct(100);
        setEngineMode('diffsinger');
      } else {
        setImportStatus('❌ Import failed');
      }
    } catch (err) {
      setImportStatus('❌ Server not reachable');
    }
    setImporting(false);
  };

  // ── Switch Engine ──
  const handleEngineSwitch = async (mode: EngineMode) => {
    setEngineMode(mode);
    try {
      await fetch('http://localhost:5001/training/set-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: mode }),
      });
    } catch { /* ignore */ }
  };

  const gaugeColor = projectPct < 30 ? '#f59e0b' : projectPct < 60 ? '#06b6d4' : projectPct < 90 ? '#7c3aed' : '#10b981';
  const remaining = 100 - projectPct;
  const fuelColor = remaining > 60 ? '#10b981' : remaining > 30 ? '#f59e0b' : '#ef4444';

  const statusLabels: Record<string, string> = {
    preparing: '⏳ Data ready — Open Colab to start training',
    training: '🧠 Training on Colab...',
    exporting: '📤 Exporting ONNX models...',
    done: '✅ Neural SVS ready!',
    error: '❌ Error — Check dashboard',
  };

  return (
    <div className="rounded-[28px] border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-cyan-500/5 overflow-hidden transition-all">
      {/* ── Header Bar ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-all"
      >
        {/* Mini Gauge */}
        <div className="relative w-11 h-11 flex-shrink-0">
          <svg viewBox="0 0 44 44" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle cx="22" cy="22" r="18" fill="none" stroke={gaugeColor} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 18}`} strokeDashoffset={`${2 * Math.PI * 18 * (1 - projectPct / 100)}`}
              style={{ transition: 'all 0.8s ease', filter: `drop-shadow(0 0 4px ${gaugeColor})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black" style={{ color: gaugeColor }}>{projectPct}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-black uppercase tracking-widest text-white">DiffSinger SVS</span>
            <span className="text-[8px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold uppercase tracking-wider">
              {completedCount}/{MILESTONES.length}
            </span>
            {/* Engine badge */}
            <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              engineMode === 'diffsinger' ? 'bg-green-500/20 text-green-300' : 'bg-zinc-500/20 text-zinc-400'
            }`}>
              {engineMode === 'diffsinger' ? '🧠 AI' : '🎙️ Sampler'}
            </span>
          </div>
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider truncate">
            {statusLabels[status]}
          </p>
        </div>

        {/* Fuel indicator */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <div className="w-5 h-10 border border-zinc-700 rounded-sm bg-zinc-900 relative overflow-hidden">
            <div className="absolute bottom-0 left-0 right-0 transition-all duration-700"
              style={{ height: `${remaining}%`, background: fuelColor }}
            />
          </div>
          <span className="text-[7px] text-zinc-600 font-mono">{remaining}%</span>
        </div>

        <svg className={`w-4 h-4 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Expanded Content ── */}
      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-4">

          {/* ── Engine Switch ── */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mr-auto">Engine</span>
            
            {/* Real-time Estimated Cost */}
            {estCost > 0 && (
              <div className="flex items-center px-2 py-1 rounded-md text-[9px] font-mono border bg-amber-500/10 text-amber-400 border-amber-500/20 mr-1">
                ${estCost.toFixed(2)}
              </div>
            )}

            {/* GPU Status Indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[8px] font-bold uppercase tracking-widest border mr-2 transition-all ${
              gpuActive 
                ? 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${gpuActive ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}></div>
              GPU {gpuActive ? 'ON' : 'OFF'}
            </div>

            <button
              onClick={() => handleEngineSwitch('sampler')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                engineMode === 'sampler'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              🎙️ Sampler
            </button>
            <button
              onClick={() => handleEngineSwitch('diffsinger')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                engineMode === 'diffsinger'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              🧠 DiffSinger AI
            </button>
          </div>

          {/* ── Progress bar ── */}
          <div>
            <div className="flex justify-between text-[8px] text-zinc-500 uppercase tracking-widest mb-1.5">
              <span>Data Prep</span><span>Training</span><span>Export</span><span>Done</span>
            </div>
            <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${projectPct}%`, background: `linear-gradient(90deg, #10b981, ${gaugeColor})`,
                  boxShadow: `0 0 8px ${gaugeColor}40` }}
              />
            </div>
          </div>

          {/* ── Milestones grid ── */}
          <div className="grid grid-cols-2 gap-1.5">
            {MILESTONES.map((m, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] transition-all ${
                m.done ? 'bg-emerald-500/8 border border-emerald-500/15 text-emerald-400'
                : m.current ? 'bg-purple-500/8 border border-purple-500/20 text-purple-300'
                : 'bg-zinc-900/50 border border-zinc-800 text-zinc-600'
              }`}>
                <span className="text-xs">{m.done ? '✅' : m.current ? '🔄' : '⬜'}</span>
                <span className="font-semibold tracking-wide">{m.name}</span>
              </div>
            ))}
          </div>

          {/* ── Action Buttons ── */}
          <div className="grid grid-cols-3 gap-2">
            {/* Train Button */}
            <button
              onClick={handleTrain}
              className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-gradient-to-b from-purple-500/15 to-purple-500/5 border border-purple-500/20 text-purple-300 hover:bg-purple-500/25 transition-all group"
            >
              <span className="text-lg group-hover:scale-110 transition-transform">🚀</span>
              <span className="text-[8px] font-bold uppercase tracking-widest">Train</span>
              <span className="text-[7px] text-zinc-500">Open Colab</span>
            </button>

            {/* Import Button */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-gradient-to-b from-cyan-500/15 to-cyan-500/5 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/25 transition-all group disabled:opacity-50"
            >
              <span className="text-lg group-hover:scale-110 transition-transform">
                {importing ? '⏳' : '📥'}
              </span>
              <span className="text-[8px] font-bold uppercase tracking-widest">Import</span>
              <span className="text-[7px] text-zinc-500">ONNX Models</span>
            </button>
            <input ref={fileRef} type="file" multiple accept=".onnx,.zip" className="hidden" onChange={handleImport} />

            {/* Dashboard Button */}
            <a
              href="/training-dashboard.html"
              target="_blank"
              rel="noopener"
              className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-gradient-to-b from-amber-500/15 to-amber-500/5 border border-amber-500/20 text-amber-300 hover:bg-amber-500/25 transition-all group"
            >
              <span className="text-lg group-hover:scale-110 transition-transform">📊</span>
              <span className="text-[8px] font-bold uppercase tracking-widest">Dashboard</span>
              <span className="text-[7px] text-zinc-500">Full Monitor</span>
            </a>
          </div>

          {/* Import Status */}
          {importStatus && (
            <div className={`text-[9px] px-3 py-2 rounded-lg font-medium ${
              importStatus.includes('✅') ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : importStatus.includes('❌') ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}>
              {importStatus}
            </div>
          )}

          {/* Google Cloud $300 Credit Info */}
          <div className="text-[8px] text-zinc-600 px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-800 my-2 flex items-center justify-between">
            <div>
              💡 <strong className="text-zinc-400">Tip:</strong> ใช้ Google Cloud $300 Free Trial — A100 ~$3/ชม. เทรนฟรี ~100 ชม.!
              <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener" className="text-cyan-500 ml-1 hover:underline">Setup Billing →</a>
            </div>
          </div>

          <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
            autoShutdown ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-zinc-900/80 border-zinc-800'
          }`} onClick={() => setAutoShutdown(!autoShutdown)}>
            <div className="flex items-center gap-2">
              <div className={`text-lg transition-transform ${autoShutdown ? 'text-emerald-400 scale-110' : 'text-zinc-600 grayscale'}`}>🛑</div>
              <div>
                <div className={`text-[9px] font-bold uppercase tracking-widest ${autoShutdown ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  Auto-Shutdown GPU
                </div>
                <div className="text-[7px] text-zinc-500 mt-0.5">Disconnect instance automatically when training finishes to save billing quota</div>
              </div>
            </div>
            {/* Toggle */}
            <div className={`relative w-8 h-4 rounded-full transition-all flex items-center p-0.5 ${autoShutdown ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
               <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${autoShutdown ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default VocalidoTrainingCard;
