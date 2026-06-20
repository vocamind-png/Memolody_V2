import React, { useEffect, useState } from 'react';
import { SongAnalyticsService } from '../../lib/SongAnalyticsService';
import { BarChart3, Globe, Music, RefreshCw, Star, Heart } from 'lucide-react';

export default function AdminAnalytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const result = await SongAnalyticsService.getAnalyticsDashboard();
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 h-full">
        <RefreshCw size={24} className="animate-spin mb-4" />
        <p className="text-[10px] uppercase tracking-widest font-black">Loading Analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-zinc-500 text-[10px] uppercase tracking-widest font-black">
        Failed to load analytics data.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
          <BarChart3 className="text-cyan-400" />
          Engagement Analytics
        </h2>
        <button 
          onClick={fetchAnalytics}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10 text-zinc-400 hover:text-white"
          title="Refresh Analytics"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Songs */}
        <div className="bg-[#0c0c0e] rounded-2xl border border-white/5 p-5 shadow-xl">
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <Music size={16} className="text-rose-400" />
            Top 10 Songs All Time
          </h3>
          <div className="space-y-3">
            {data.topSongs.map((song: any, index: number) => (
              <div key={song.song_id} className="flex items-center gap-4 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                <div className="w-6 h-6 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center text-[10px] font-black shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{song.title}</div>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest truncate">{song.artist}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-end">
                    <div className="text-[10px] font-black text-cyan-400">{song.play_count || 0}</div>
                    <div className="text-[7px] text-zinc-600 uppercase tracking-widest">Plays</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-[10px] font-black text-rose-400 flex items-center gap-0.5"><Heart size={8} />{song.likes_count || 0}</div>
                    <div className="text-[7px] text-zinc-600 uppercase tracking-widest">Likes</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-[10px] font-black text-amber-400 flex items-center gap-0.5"><Star size={8} />{song.favorites_count || 0}</div>
                    <div className="text-[7px] text-zinc-600 uppercase tracking-widest">Favs</div>
                  </div>
                </div>
              </div>
            ))}
            {data.topSongs.length === 0 && (
              <div className="text-center py-4 text-[10px] text-zinc-600 uppercase tracking-widest font-black">
                No play data available yet
              </div>
            )}
          </div>
        </div>

        {/* Listeners by Country */}
        <div className="bg-[#0c0c0e] rounded-2xl border border-white/5 p-5 shadow-xl">
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <Globe size={16} className="text-indigo-400" />
            Global Listeners
          </h3>
          <div className="space-y-3">
            {data.countries.map((c: any, index: number) => (
              <div key={c.country_code || 'Unknown'} className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{c.country_code === 'TH' ? '🇹🇭' : c.country_code === 'US' ? '🇺🇸' : c.country_code === 'GB' ? '🇬🇧' : c.country_code === 'JP' ? '🇯🇵' : c.country_code === 'Unknown' ? '🌍' : '📍'}</span>
                  <span className="text-xs font-bold text-white uppercase tracking-widest">{c.country_code || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <div className="text-xs font-black text-indigo-400">{c.unique_listeners}</div>
                    <div className="text-[7px] text-zinc-600 uppercase tracking-widest">Listeners</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-xs font-black text-cyan-400">{c.total_plays}</div>
                    <div className="text-[7px] text-zinc-600 uppercase tracking-widest">Plays</div>
                  </div>
                </div>
              </div>
            ))}
            {data.countries.length === 0 && (
              <div className="text-center py-4 text-[10px] text-zinc-600 uppercase tracking-widest font-black">
                No location data available yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
