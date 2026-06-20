import React, { useEffect, useState } from 'react';
import { SongAnalyticsService } from '../../lib/SongAnalyticsService';
import { Server, Activity, Clock, Zap, AlertTriangle, ShieldAlert } from 'lucide-react';

export default function ServerAnalytics() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isServerlessEmergency, setIsServerlessEmergency] = useState(false);

  const fetchPerformance = async () => {
    setLoading(true);
    try {
      const [result, setting] = await Promise.all([
        SongAnalyticsService.getServerPerformanceDashboard(),
        SongAnalyticsService.getSystemSetting('force_serverless')
      ]);
      setData(result);
      setIsServerlessEmergency(setting === true || setting === 'true');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleEmergencyServerless = async () => {
    const newValue = !isServerlessEmergency;
    setIsServerlessEmergency(newValue);
    await SongAnalyticsService.updateSystemSetting('force_serverless', newValue);
  };

  useEffect(() => {
    fetchPerformance();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 h-full">
        <Activity size={24} className="animate-pulse mb-4" />
        <p className="text-[10px] uppercase tracking-widest font-black">Loading Server Data...</p>
      </div>
    );
  }

  // Calculate some aggregates
  const totalRenders = data.reduce((acc, curr) => acc + (curr.total_renders || 0), 0);
  const totalErrors = data.reduce((acc, curr) => acc + (curr.error_count || 0), 0);
  const errorRate = totalRenders > 0 ? ((totalErrors / totalRenders) * 100).toFixed(1) : 0;
  
  // Find peak hour
  let peakHour = 'N/A';
  let peakRenders = 0;
  data.forEach(d => {
    if ((d.total_renders || 0) > peakRenders) {
      peakRenders = d.total_renders;
      peakHour = new Date(d.hour_bucket).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
  });

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Server className="text-cyan-400" />
          Server Performance Report
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleEmergencyServerless}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              isServerlessEmergency 
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse' 
                : 'bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            <ShieldAlert size={14} />
            Emergency Serverless: {isServerlessEmergency ? 'ON' : 'OFF'}
          </button>
          <button 
            onClick={fetchPerformance}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10 text-zinc-400 hover:text-white"
          >
            <Activity size={14} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0c0c0e] rounded-2xl border border-white/5 p-4 shadow-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Zap size={14} className="text-cyan-400" />
            <span className="text-[9px] uppercase tracking-widest font-bold">Total Renders (24h)</span>
          </div>
          <div className="text-2xl font-black text-white">{totalRenders}</div>
        </div>

        <div className="bg-[#0c0c0e] rounded-2xl border border-white/5 p-4 shadow-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Clock size={14} className="text-indigo-400" />
            <span className="text-[9px] uppercase tracking-widest font-bold">Peak Hour</span>
          </div>
          <div className="text-2xl font-black text-white">{peakHour}</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">{peakRenders} requests</div>
        </div>

        <div className="bg-[#0c0c0e] rounded-2xl border border-white/5 p-4 shadow-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <AlertTriangle size={14} className={totalErrors > 0 ? "text-rose-400" : "text-emerald-400"} />
            <span className="text-[9px] uppercase tracking-widest font-bold">Error Rate</span>
          </div>
          <div className="text-2xl font-black text-white">{errorRate}%</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">{totalErrors} errors</div>
        </div>
      </div>

      {/* Hourly Table */}
      <div className="bg-[#0c0c0e] rounded-2xl border border-white/5 p-5 shadow-xl">
        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">
          Hourly Concurrency (Last 24 Hours)
        </h3>
        
        {data.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-[10px] uppercase tracking-widest font-black">
            No server data logged yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[9px] text-zinc-500 uppercase tracking-widest">
                  <th className="pb-3 pr-4 font-black">Time</th>
                  <th className="pb-3 pr-4 font-black">Model</th>
                  <th className="pb-3 pr-4 font-black">Provider</th>
                  <th className="pb-3 pr-4 font-black">Total Renders</th>
                  <th className="pb-3 pr-4 font-black">Avg Duration</th>
                  <th className="pb-3 pr-4 font-black">Success</th>
                  <th className="pb-3 font-black">Errors</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {data.map((row, idx) => (
                  <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4 font-bold text-white">
                      {new Date(row.hour_bucket).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      <span className="bg-white/10 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {row.model_type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-400 text-[10px] uppercase tracking-widest">{row.provider}</td>
                    <td className="py-3 pr-4 font-black text-cyan-400">{row.total_renders}</td>
                    <td className="py-3 pr-4 text-indigo-300">{Number(row.avg_duration_sec || 0).toFixed(1)}s</td>
                    <td className="py-3 pr-4 text-emerald-400 font-bold">{row.success_count}</td>
                    <td className={`py-3 font-bold ${row.error_count > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                      {row.error_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
