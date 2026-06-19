import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, RefreshCw, Cpu, HardDrive, Activity, 
  CheckCircle, AlertCircle, ShieldAlert, Network, 
  Database, Globe, Clock, RefreshCcw
} from 'lucide-react';

const getCustomBackendUrl = () => {
  if (typeof window === 'undefined') return '';
  const url = localStorage.getItem('memolody_custom_backend_url');
  if (!url) return '';
  let cleanUrl = url.trim();
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  return cleanUrl;
};

interface ServerStatus {
  status: 'online' | 'offline' | 'restarting';
  latency: number | null;
  version: string | null;
  uptime: number | null; // seconds
  cpuCount?: number;
  loadAvg?: number[];
  memory?: {
    total_mb: number;
    used_mb: number;
    available_mb: number;
    used_percent: number;
  };
  gpus?: {
    name: string;
    total_mem_mb: number;
    used_mem_mb: number;
    utilization_percent: number;
  }[];
  platform?: string;
  platformName?: string;
  pythonVersion?: string;
  nodeVersion?: string;
  errorMessage?: string;
}

export const ServerControlDashboard: React.FC = () => {
  const [vocalidoState, setVocalidoState] = useState<ServerStatus>({ status: 'offline', latency: null, version: null, uptime: null });
  const [omrState, setOmrState] = useState<ServerStatus>({ status: 'offline', latency: null, version: null, uptime: null });
  const [frontendState, setFrontendState] = useState<ServerStatus>({ status: 'online', latency: 0, version: '2.2.0', uptime: null });
  
  const [isRestartingVocalido, setIsRestartingVocalido] = useState(false);
  const [isRestartingOmr, setIsRestartingOmr] = useState(false);
  const [vocalidoTimer, setVocalidoTimer] = useState(0);
  const [omrTimer, setOmrTimer] = useState(0);
  
  const [confirmVocalido, setConfirmVocalido] = useState(false);
  const [confirmOmr, setConfirmOmr] = useState(false);

  const vocalidoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const omrIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initial ping
    pingAllServers();

    // Setup periodic health checks (every 10 seconds)
    const timer = setInterval(() => {
      if (!isRestartingVocalido) pingVocalido();
      if (!isRestartingOmr) pingOmr();
      pingFrontend();
    }, 10000);

    return () => {
      clearInterval(timer);
      if (vocalidoIntervalRef.current) clearInterval(vocalidoIntervalRef.current);
      if (omrIntervalRef.current) clearInterval(omrIntervalRef.current);
    };
  }, [isRestartingVocalido, isRestartingOmr]);

  const pingAllServers = () => {
    pingVocalido();
    pingOmr();
    pingFrontend();
  };

  const pingFrontend = () => {
    const start = Date.now();
    setFrontendState({
      status: 'online',
      latency: Date.now() - start,
      version: '2.2.0',
      uptime: Math.round(window.performance.now() / 1000),
      platform: navigator.platform
    });
  };

  const pingVocalido = async () => {
    const start = Date.now();
    const customUrl = getCustomBackendUrl();
    const baseUrl = customUrl ? customUrl : '/vocalido';
    const statusUrl = `${baseUrl}/system/status`;

    try {
      const res = await fetch(statusUrl, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(5000)
      });
      const elapsed = Date.now() - start;

      if (res.ok) {
        const data = await res.json();
        setVocalidoState({
          status: 'online',
          latency: elapsed,
          version: '5.1.0',
          uptime: data.timestamp ? Math.round(data.timestamp - (data.timestamp_started || (data.timestamp - 3600))) : null, // Fallback uptime estimate
          cpuCount: data.cpu_count,
          loadAvg: data.load_avg,
          memory: data.memory,
          gpus: data.gpus,
          platform: data.platform,
          platformName: data.platform_name,
          pythonVersion: data.python_version
        });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setVocalidoState({
        status: 'offline',
        latency: null,
        version: null,
        uptime: null,
        errorMessage: err.message || 'Connection Timeout'
      });
    }
  };

  const pingOmr = async () => {
    const start = Date.now();
    
    // Try /api/health (proxied via local dev server) first, then fallback to http://localhost:3003/health
    const urls = ['/api/health', 'http://localhost:3003/health'];
    let lastError = 'Offline';

    for (const url of urls) {
      try {
        const res = await fetch(url, { 
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' },
          signal: AbortSignal.timeout(3000)
        });
        const elapsed = Date.now() - start;

        if (res.ok) {
          const data = await res.json();
          setOmrState({
            status: 'online',
            latency: elapsed,
            version: data.version || '3.0.0',
            uptime: data.system?.uptime || null,
            cpuCount: data.system?.cpu_count,
            memory: data.system?.memory,
            loadAvg: data.system?.load_avg,
            platform: data.system?.platform,
            nodeVersion: data.system?.node_version
          });
          return; // Success, exit function
        } else {
          lastError = `HTTP ${res.status}`;
        }
      } catch (err: any) {
        lastError = err.message || 'Connection Timeout';
      }
    }

    setOmrState({
      status: 'offline',
      latency: null,
      version: null,
      uptime: null,
      errorMessage: lastError
    });
  };

  const handleRestartVocalido = async () => {
    if (!confirmVocalido) {
      setConfirmVocalido(true);
      return;
    }

    setConfirmVocalido(false);
    setIsRestartingVocalido(true);
    setVocalidoTimer(8); // Reconnect timer countdown
    setVocalidoState(prev => ({ ...prev, status: 'restarting' }));

    const customUrl = getCustomBackendUrl();
    const baseUrl = customUrl ? customUrl : '/vocalido';
    const restartUrl = `${baseUrl}/system/restart`;

    try {
      await fetch(restartUrl, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.warn("Triggered restart, fetch connection closed as expected.", err);
    }

    // Start countdown and polling
    let counter = 8;
    if (vocalidoIntervalRef.current) clearInterval(vocalidoIntervalRef.current);
    
    vocalidoIntervalRef.current = setInterval(async () => {
      counter--;
      setVocalidoTimer(counter);
      
      if (counter <= 0) {
        // Attempt to ping
        const customUrl = getCustomBackendUrl();
        const baseUrl = customUrl ? customUrl : '/vocalido';
        const statusUrl = `${baseUrl}/system/status`;

        try {
          const res = await fetch(statusUrl, { signal: AbortSignal.timeout(2000) });
          if (res.ok) {
            clearInterval(vocalidoIntervalRef.current!);
            setIsRestartingVocalido(false);
            pingVocalido();
          } else {
            // Wait another second
            counter = 2; 
          }
        } catch {
          // Wait another second
          counter = 2; 
        }
      }
    }, 1000);
  };

  const handleRestartOmr = async () => {
    if (!confirmOmr) {
      setConfirmOmr(true);
      return;
    }

    setConfirmOmr(false);
    setIsRestartingOmr(true);
    setOmrTimer(5); // Node restarts faster
    setOmrState(prev => ({ ...prev, status: 'restarting' }));

    const urls = ['/api/restart', 'http://localhost:3003/restart'];
    
    for (const url of urls) {
      try {
        await fetch(url, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        break;
      } catch (err) {
        console.warn("Triggered OMR restart, connection closed.", err);
      }
    }

    // Start countdown and polling
    let counter = 5;
    if (omrIntervalRef.current) clearInterval(omrIntervalRef.current);
    
    omrIntervalRef.current = setInterval(async () => {
      counter--;
      setOmrTimer(counter);
      
      if (counter <= 0) {
        // Attempt to ping OMR
        try {
          const res = await fetch('/api/health', { signal: AbortSignal.timeout(1000) });
          if (res.ok) {
            clearInterval(omrIntervalRef.current!);
            setIsRestartingOmr(false);
            pingOmr();
            return;
          }
        } catch {}
        
        try {
          const res = await fetch('http://localhost:3003/health', { signal: AbortSignal.timeout(1000) });
          if (res.ok) {
            clearInterval(omrIntervalRef.current!);
            setIsRestartingOmr(false);
            pingOmr();
            return;
          }
        } catch {}

        counter = 2; // Wait more
      }
    }, 1000);
  };

  const formatUptime = (seconds: number | null): string => {
    if (seconds === null) return 'Unknown';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ${seconds % 60}s`;
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ${hrs % 24}h`;
    return `${hrs}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      
      {/* HEADER CONTROLS */}
      <div className="flex justify-between items-center bg-[#111115] border border-white/5 p-5 rounded-3xl relative overflow-hidden">
        <div className="flex items-center gap-3 text-white">
          <Server className="text-amber-500 animate-pulse" size={24} />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest italic">Infrastructure Monitor</h2>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Global Daemon Manager & System Status</p>
          </div>
        </div>
        
        <button 
          onClick={pingAllServers}
          className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 hover:border-white/10 rounded-xl text-[9px] font-black text-zinc-300 uppercase tracking-widest transition-all"
        >
          <RefreshCcw size={10} />
          Refresh Status
        </button>
      </div>

      {/* SERVERS STATUS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 1. VOCALIDO SVS SERVER */}
        <div className={`bg-[#111115] border rounded-[40px] p-8 flex flex-col justify-between transition-all relative overflow-hidden ${
          vocalidoState.status === 'online' ? 'border-emerald-500/10' : (vocalidoState.status === 'restarting' ? 'border-amber-500/10' : 'border-rose-500/10')
        }`}>
          {/* Status Header */}
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Neural Audio Engine</span>
                <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Vocalido SVS</h3>
                <span className="text-[9px] font-mono text-zinc-600">Port 8888 (RunPod)</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  vocalidoState.status === 'online' ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 
                  (vocalidoState.status === 'restarting' ? 'bg-amber-500 animate-ping' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]')
                }`} />
                <span className={`text-[8px] font-black uppercase tracking-wider ${
                  vocalidoState.status === 'online' ? 'text-emerald-400' : 
                  (vocalidoState.status === 'restarting' ? 'text-amber-400' : 'text-rose-400')
                }`}>
                  {vocalidoState.status}
                </span>
              </div>
            </div>

            {/* Performance Indicators */}
            <div className="space-y-4 mb-8">
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Latency</span>
                <span className="text-white font-mono">{vocalidoState.latency !== null ? `${vocalidoState.latency} ms` : 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Uptime</span>
                <span className="text-white font-mono">{formatUptime(vocalidoState.uptime)}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">CPU Cores</span>
                <span className="text-white font-mono">{vocalidoState.cpuCount ? `${vocalidoState.cpuCount} Cores` : 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Platform</span>
                <span className="text-white truncate max-w-[150px] font-mono" title={vocalidoState.platformName || ''}>
                  {vocalidoState.platform || 'Linux'}
                </span>
              </div>

              {/* Memory Usage */}
              {vocalidoState.memory && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-500 uppercase font-bold">System Memory</span>
                    <span className="text-white font-mono">
                      {Math.round(vocalidoState.memory.used_mb / 1024)}GB / {Math.round(vocalidoState.memory.total_mb / 1024)}GB
                    </span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 rounded-full transition-all duration-500" 
                      style={{ width: `${vocalidoState.memory.used_percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* GPU Details */}
              {vocalidoState.gpus && vocalidoState.gpus.map((gpu, idx) => (
                <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Database size={12} />
                    <span className="text-[9px] font-black uppercase tracking-wider">{gpu.name}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>GPU utilization</span>
                    <span className="font-mono text-white font-bold">{gpu.utilization_percent}%</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-zinc-500">
                      <span>VRAM usage</span>
                      <span className="font-mono">
                        {(gpu.used_mem_mb / 1024).toFixed(1)}GB / {(gpu.total_mem_mb / 1024).toFixed(0)}GB
                      </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                        style={{ width: `${(gpu.used_mem_mb / gpu.total_mem_mb) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {vocalidoState.errorMessage && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-3 flex gap-2 text-rose-400 font-mono text-[9px] leading-tight">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>{vocalidoState.errorMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div>
            {isRestartingVocalido ? (
              <div className="flex flex-col items-center justify-center p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-amber-500 gap-2">
                <RefreshCw className="animate-spin" size={16} />
                <span className="text-[10px] font-black uppercase tracking-wider">
                  Reconnecting in {vocalidoTimer}s
                </span>
              </div>
            ) : (
              <button
                disabled={vocalidoState.status === 'restarting'}
                onClick={handleRestartVocalido}
                onMouseLeave={() => setConfirmVocalido(false)}
                className={`w-full py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-98 flex items-center justify-center gap-2
                  ${confirmVocalido 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                    : 'bg-white/5 hover:bg-white/10 text-white border border-white/5 hover:border-white/10'}`}
              >
                <RefreshCw size={12} className={confirmVocalido ? 'animate-spin' : ''} />
                {confirmVocalido ? 'Confirm Server Restart?' : 'Restart Vocalido SVS'}
              </button>
            )}
          </div>
        </div>

        {/* 2. OMR SERVER */}
        <div className={`bg-[#111115] border rounded-[40px] p-8 flex flex-col justify-between transition-all relative overflow-hidden ${
          omrState.status === 'online' ? 'border-emerald-500/10' : (omrState.status === 'restarting' ? 'border-amber-500/10' : 'border-rose-500/10')
        }`}>
          {/* Status Header */}
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Notation OCR Engine</span>
                <h3 className="text-lg font-black text-white italic tracking-tight uppercase">ScoreLens OMR</h3>
                <span className="text-[9px] font-mono text-zinc-600">Port 3003 (Local Node.js)</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  omrState.status === 'online' ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 
                  (omrState.status === 'restarting' ? 'bg-amber-500 animate-ping' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]')
                }`} />
                <span className={`text-[8px] font-black uppercase tracking-wider ${
                  omrState.status === 'online' ? 'text-emerald-400' : 
                  (omrState.status === 'restarting' ? 'text-amber-400' : 'text-rose-400')
                }`}>
                  {omrState.status}
                </span>
              </div>
            </div>

            {/* Performance Indicators */}
            <div className="space-y-4 mb-8">
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Latency</span>
                <span className="text-white font-mono">{omrState.latency !== null ? `${omrState.latency} ms` : 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Uptime</span>
                <span className="text-white font-mono">{formatUptime(omrState.uptime)}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">CPU Cores</span>
                <span className="text-white font-mono">{omrState.cpuCount ? `${omrState.cpuCount} Cores` : 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Platform</span>
                <span className="text-white font-mono uppercase">{omrState.platform || 'darwin (macOS)'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Node Version</span>
                <span className="text-white font-mono">{omrState.nodeVersion || 'N/A'}</span>
              </div>

              {/* Memory Usage */}
              {omrState.memory && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-500 uppercase font-bold">System Memory</span>
                    <span className="text-white font-mono">
                      {Math.round((omrState.memory.total_mb - omrState.memory.free_mb))}MB / {omrState.memory.total_mb}MB
                    </span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                      style={{ width: `${omrState.memory.used_percent}%` }}
                    />
                  </div>
                </div>
              )}

              {omrState.errorMessage && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-3 flex gap-2 text-rose-400 text-[9px] leading-tight">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span className="font-mono">{omrState.errorMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div>
            {isRestartingOmr ? (
              <div className="flex flex-col items-center justify-center p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-amber-500 gap-2">
                <RefreshCw className="animate-spin" size={16} />
                <span className="text-[10px] font-black uppercase tracking-wider">
                  Reconnecting in {omrTimer}s
                </span>
              </div>
            ) : (
              <button
                disabled={omrState.status === 'restarting'}
                onClick={handleRestartOmr}
                onMouseLeave={() => setConfirmOmr(false)}
                className={`w-full py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-98 flex items-center justify-center gap-2
                  ${confirmOmr 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                    : 'bg-white/5 hover:bg-white/10 text-white border border-white/5 hover:border-white/10'}`}
              >
                <RefreshCw size={12} className={confirmOmr ? 'animate-spin' : ''} />
                {confirmOmr ? 'Confirm Server Restart?' : 'Restart OMR Server'}
              </button>
            )}
          </div>
        </div>

        {/* 3. VERCEL FRONTEND */}
        <div className="bg-[#111115] border border-emerald-500/10 rounded-[40px] p-8 flex flex-col justify-between transition-all relative overflow-hidden">
          {/* Status Header */}
          <div>
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Client Application</span>
                <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Vercel Web App</h3>
                <span className="text-[9px] font-mono text-zinc-600">Static / Edge Serverless</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981]" />
                <span className="text-[8px] font-black uppercase text-emerald-400 tracking-wider">online</span>
              </div>
            </div>

            {/* Performance Indicators */}
            <div className="space-y-4 mb-8">
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Domain Latency</span>
                <span className="text-white font-mono">{frontendState.latency !== null ? `${frontendState.latency} ms` : 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Session Duration</span>
                <span className="text-white font-mono">{formatUptime(frontendState.uptime)}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Engine Version</span>
                <span className="text-white font-mono">{frontendState.version}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2 text-[10px]">
                <span className="text-zinc-500 uppercase font-bold">Client OS</span>
                <span className="text-white font-mono truncate max-w-[150px]" title={frontendState.platform || ''}>
                  {frontendState.platform || 'macOS (MacIntel)'}
                </span>
              </div>
              
              <div className="bg-[#10b981]/5 border border-emerald-500/20 rounded-3xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Globe size={14} />
                  <span className="text-[9px] font-black uppercase tracking-wider">Vercel Serverless Edge</span>
                </div>
                <p className="text-[8.5px] text-zinc-500 leading-normal uppercase">
                  Static files and edge functions are cached globally. No manual restarts are needed as instances auto-provision.
                </p>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div>
            <button
              disabled
              className="w-full py-3.5 bg-white/5 opacity-40 border border-white/5 rounded-2xl text-[9px] font-black uppercase tracking-widest text-zinc-600 flex items-center justify-center gap-2 cursor-not-allowed"
            >
              <Globe size={12} />
              Serverless Control
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
