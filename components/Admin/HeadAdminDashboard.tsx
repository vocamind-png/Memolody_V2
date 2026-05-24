import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Users, Zap, Clock, Activity, 
  BarChart3, Calendar, ListMusic, BrainCircuit,
  PieChart, ServerCrash
} from 'lucide-react';
import { telemetry, TelemetryEvent } from '../../lib/Telemetry';

const RUNPOD_COST_PER_SECOND = 0.0004; // $0.0004 per second for L4/RTX A5000

const HeadAdminDashboard: React.FC = () => {
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month'>('month');
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchEvents = async () => {
      const cloudEvents = await telemetry.getEventsFromCloud();
      if (isMounted) {
        setEvents(cloudEvents);
        setIsLoading(false);
        
        // Setup mock realtime update every 10s (if desired)
        const interval = setInterval(async () => {
          const fresh = await telemetry.getEventsFromCloud();
          if (isMounted) setEvents(fresh);
        }, 10000);
        return () => clearInterval(interval);
      }
    };
    fetchEvents();
    return () => { isMounted = false; };
  }, []);

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    let cutoff = now;
    if (timeFilter === 'day') cutoff = now - (24 * 60 * 60 * 1000);
    else if (timeFilter === 'week') cutoff = now - (7 * 24 * 60 * 60 * 1000);
    else if (timeFilter === 'month') cutoff = now - (30 * 24 * 60 * 60 * 1000);
    
    return events.filter(e => new Date(e.created_at).getTime() > cutoff);
  }, [events, timeFilter]);

  // --- Metrics Calculation ---
  const stats = useMemo(() => {
    const activeUsers = new Set(filteredEvents.map(e => e.user_id)).size;
    const songPlays = filteredEvents.filter(e => e.event_type === 'song_play').length;
    
    const renders = filteredEvents.filter(e => e.event_type === 'vocalido_render');
    const renderCount = renders.length;
    
    // Total render seconds
    const totalRenderSeconds = renders.reduce((acc, curr) => {
        return acc + (curr.event_data?.renderSeconds || 0);
    }, 0);
    
    // Cost calculation
    const estimatedCost = totalRenderSeconds * RUNPOD_COST_PER_SECOND;

    // Session durations
    const sessions = filteredEvents.filter(e => e.event_type === 'session_end');
    const totalSessionSeconds = sessions.reduce((acc, curr) => acc + (curr.event_data?.durationSeconds || 0), 0);
    const avgSessionMinutes = sessions.length > 0 ? (totalSessionSeconds / sessions.length) / 60 : 0;

    return {
        activeUsers,
        songPlays,
        renderCount,
        totalRenderSeconds,
        estimatedCost,
        avgSessionMinutes,
        totalSessionHours: totalSessionSeconds / 3600
    };
  }, [filteredEvents]);

  // --- Popular Songs ---
  const popularSongs = useMemo(() => {
     const plays = filteredEvents.filter(e => e.event_type === 'song_play');
     const counts: Record<string, number> = {};
     plays.forEach(p => {
         const title = p.event_data?.songTitle || 'Unknown';
         counts[title] = (counts[title] || 0) + 1;
     });
     
     return Object.entries(counts)
         .map(([title, count]) => ({ title, count }))
         .sort((a, b) => b.count - a.count)
         .slice(0, 5); // Top 5
  }, [filteredEvents]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* HEADER CONTROLS */}
      <div className="flex justify-between items-center bg-[#111115] border border-white/5 p-4 rounded-3xl">
        <div className="flex items-center gap-3 text-white">
          <BrainCircuit className="text-cyan-400" size={24} />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest italic">Omni-Analytics</h2>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Headquarters Telemetry Feed</p>
          </div>
        </div>
        
        <div className="flex gap-1 bg-black/50 p-1 rounded-xl border border-white/5">
           {(['day', 'week', 'month'] as const).map(tf => (
               <button
                 key={tf}
                 onClick={() => setTimeFilter(tf)}
                 className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                     timeFilter === tf ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
                 }`}
               >
                   {tf === 'day' ? '24H' : tf === 'week' ? '7D' : '30D'}
               </button>
           ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-cyan-500 gap-4">
           <Activity className="animate-spin" size={32} />
           <p className="text-[10px] font-black uppercase tracking-widest">Syncing with Neural Core...</p>
        </div>
      ) : (
        <>
          {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         <div className="bg-gradient-to-br from-indigo-500/10 to-[#111115] border border-indigo-500/20 p-6 rounded-[32px]">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400"><Users size={16} /></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400/80">Active Users</span>
            </div>
            <h3 className="text-4xl font-black text-white italic tracking-tighter">{stats.activeUsers.toLocaleString()}</h3>
            <p className="text-[10px] text-zinc-500 mt-2 font-bold uppercase">Unique in period</p>
         </div>

         <div className="bg-gradient-to-br from-emerald-500/10 to-[#111115] border border-emerald-500/20 p-6 rounded-[32px]">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400"><ListMusic size={16} /></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/80">Songs Played</span>
            </div>
            <h3 className="text-4xl font-black text-white italic tracking-tighter">{stats.songPlays.toLocaleString()}</h3>
            <p className="text-[10px] text-zinc-500 mt-2 font-bold uppercase">Total sessions</p>
         </div>

         <div className="bg-gradient-to-br from-amber-500/10 to-[#111115] border border-amber-500/20 p-6 rounded-[32px]">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400"><Zap size={16} /></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/80">AI Renders</span>
            </div>
            <h3 className="text-4xl font-black text-white italic tracking-tighter">{stats.renderCount.toLocaleString()}</h3>
            <p className="text-[10px] text-amber-500/60 mt-2 font-bold uppercase">~{(stats.totalRenderSeconds/60).toFixed(1)} mins GPU time</p>
         </div>

         <div className="bg-gradient-to-br from-rose-500/10 to-[#111115] border border-rose-500/20 p-6 rounded-[32px]">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-rose-500/20 rounded-xl text-rose-400"><TrendingUp size={16} /></div>
                <span className="text-[9px] font-black uppercase tracking-widest text-rose-400/80">Est. RunPod Cost</span>
            </div>
            <h3 className="text-4xl font-black text-rose-400 italic tracking-tighter">${stats.estimatedCost.toFixed(3)}</h3>
            <p className="text-[10px] text-rose-500/60 mt-2 font-bold uppercase">@ $0.0004 / sec</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* POPULAR SONGS */}
         <div className="bg-[#111115] border border-white/5 p-8 rounded-[40px]">
            <div className="flex items-center gap-3 mb-8">
               <Activity className="text-cyan-400" size={20} />
               <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Trending Tracks</h3>
            </div>
            
            <div className="space-y-4">
                {popularSongs.length === 0 ? (
                   <p className="text-[10px] text-zinc-500 uppercase tracking-widest">No data available in this period.</p>
                ) : popularSongs.map((song, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-4">
                            <span className="text-2xl font-black italic text-zinc-700 group-hover:text-cyan-500/30 transition-colors">#{i+1}</span>
                            <span className="text-xs font-black text-white uppercase tracking-wider">{song.title}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-cyan-500/10 px-3 py-1 rounded-full text-cyan-400">
                            <ListMusic size={12} />
                            <span className="text-[10px] font-black">{song.count} plays</span>
                        </div>
                    </div>
                ))}
            </div>
         </div>

         {/* TIME SPENT */}
         <div className="bg-[#111115] border border-white/5 p-8 rounded-[40px] flex flex-col">
            <div className="flex items-center gap-3 mb-8">
               <Clock className="text-indigo-400" size={20} />
               <h3 className="text-lg font-black text-white italic tracking-tight uppercase">User Engagement</h3>
            </div>
            
            <div className="flex-1 flex flex-col justify-center gap-8">
                <div className="text-center p-8 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Average Session Time</p>
                    <h4 className="text-5xl font-black text-white italic tracking-tighter">
                       {Math.floor(stats.avgSessionMinutes)}<span className="text-2xl text-zinc-500 ml-1">m</span>
                       <span className="text-cyan-500 mx-2">:</span>
                       {Math.floor((stats.avgSessionMinutes % 1) * 60)}<span className="text-2xl text-zinc-500 ml-1">s</span>
                    </h4>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="p-6 bg-white/5 rounded-[24px] border border-white/5 text-center">
                       <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Total Hours Played</p>
                       <p className="text-2xl font-black text-white italic">{stats.totalSessionHours.toFixed(1)} <span className="text-sm text-zinc-500">HRS</span></p>
                   </div>
                   <div className="p-6 bg-white/5 rounded-[24px] border border-white/5 text-center">
                       <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Avg Renders / User</p>
                       <p className="text-2xl font-black text-white italic">
                          {stats.activeUsers > 0 ? (stats.renderCount / stats.activeUsers).toFixed(1) : 0}
                       </p>
                   </div>
                </div>
            </div>
         </div>
      </div>
      </>
      )}
    </div>
  );
};

export default HeadAdminDashboard;
