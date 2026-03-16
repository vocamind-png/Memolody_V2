
import React, { useMemo, useState } from 'react';
import { ArrowLeft, User, Share2, Play, Radio, Calendar, MessageCircle, Star, Music, Award } from 'lucide-react';
import { Song, ScheduleSlot } from '../../types';

interface ChannelPageProps {
  channelId: string;
  onSongSelect: (song: Song, xml?: string, mode?: any, fromMarket?: boolean) => void;
  onBack: () => void;
}

const ChannelPage: React.FC<ChannelPageProps> = ({ channelId, onSongSelect, onBack }) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'schedule'>('matrix');

  const channelSongs: Song[] = useMemo(() => [
    { id: 'ext-1', title: 'Eternal Moonlight', artist: 'Beethoven', bpm: 54, key: 'C#m', duration: 320, audioUrl: '', coverUrl: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400', isPremium: true, category: 'Classical', difficulty: 'Advanced', views: 4523, likes: 890, isForSale: true, salePrice: 1200 },
    { id: 'ext-2', title: 'Moonlight Cyber', artist: 'Beethoven', bpm: 120, key: 'C#m', duration: 180, audioUrl: '', coverUrl: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=400', isPremium: false, category: 'Modern', difficulty: 'Intermediate', views: 2310, likes: 450 }
  ], []);

  const schedule: ScheduleSlot[] = [
    { id: 's1', day: 'MON', time: '18:00', activity: 'Live Composing', isPublic: true },
    { id: 's2', day: 'WED', time: '20:00', activity: 'Neural Review', isPublic: true },
    { id: 's3', day: 'FRI', time: '14:00', activity: 'Open Performance', isPublic: true },
  ];

  return (
    <div className="h-full flex flex-col bg-[#050507] overflow-y-auto no-scrollbar pb-32 select-none">
      <header className="relative h-64 shrink-0 overflow-hidden">
        <img src="https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=800" className="w-full h-full object-cover grayscale opacity-20 blur-xl scale-110" alt="" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050507]" />
        
        <button onClick={onBack} className="absolute top-6 left-6 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white transition-all z-10">
          <ArrowLeft size={20} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col md:flex-row items-end gap-6">
           <div className="w-24 h-24 rounded-[32px] border-4 border-cyan-500 p-1 shadow-2xl bg-black relative shrink-0">
             <img src="https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400" className="w-full h-full object-cover rounded-[26px]" alt="" />
             <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-4 border-[#050507] animate-pulse shadow-[0_0_15px_#10b981]" />
           </div>
           
           <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                 <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">Maestro Ludwig</h2>
                 <span className="bg-cyan-500/10 text-cyan-400 text-[8px] font-black px-3 py-1 rounded-full border border-cyan-400/20 uppercase tracking-widest">Maestro Elite</span>
              </div>
              <p className="text-zinc-500 text-xs font-medium max-w-lg leading-relaxed italic">"Pioneer of Neural Symphonies. Exploring the boundaries of Classical and Cyberpunk."</p>
           </div>

           <div className="flex gap-3 shrink-0">
              <button className="h-12 px-8 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl transition-all active:scale-95">Follow</button>
              <button className="h-12 w-12 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl flex items-center justify-center transition-all"><MessageCircle size={20}/></button>
           </div>
        </div>
      </header>

      <nav className="flex items-center justify-center gap-10 py-8 border-b border-white/5 sticky top-0 bg-[#050507]/80 backdrop-blur-xl z-[200]">
        {['matrix', 'schedule'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} className={`text-[10px] font-black uppercase tracking-[0.3em] transition-all relative ${activeTab === tab ? 'text-white' : 'text-zinc-600'}`}>
            {tab.toUpperCase()}
            {activeTab === tab && <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-1 bg-cyan-500 rounded-full" />}
          </button>
        ))}
      </nav>

      <div className="p-8 max-w-5xl mx-auto w-full">
        {activeTab === 'matrix' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {channelSongs.map(song => (
              <div key={song.id} onClick={() => onSongSelect(song, undefined, 'listen', true)} className="bg-[#0c0c0e] p-4 rounded-[32px] flex items-center gap-4 cursor-pointer border border-white/5 group hover:border-cyan-500/30 transition-all">
                <div className="w-12 aspect-video rounded-lg overflow-hidden bg-black shrink-0 border border-white/5">
                   <img src={song.coverUrl} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-500" alt="" />
                </div>
                <div className="flex-1 min-w-0">
                   <h4 className="text-[12px] font-black text-white uppercase italic truncate leading-none mb-1.5">{song.title}</h4>
                   <div className="flex items-center gap-3 text-[7px] font-bold text-zinc-600 uppercase tracking-widest">
                      <span>{song.views?.toLocaleString()} VIEWS</span>
                      <div className="w-0.5 h-0.5 bg-zinc-800 rounded-full" />
                      <span>{song.category}</span>
                   </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                   <Play size={12} fill="currentColor" className="ml-0.5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
             <h3 className="text-xl font-black italic uppercase text-white tracking-tighter flex items-center gap-3"><Radio size={24} className="text-rose-500 animate-pulse" /> Weekly Availability</h3>
             <div className="grid grid-cols-1 gap-3">
                {schedule.map(s => (
                  <div key={s.id} className="bg-[#0c0c0e] p-6 rounded-[32px] border border-white/5 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                     <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white/5 rounded-2xl flex flex-col items-center justify-center border border-white/5">
                           <span className="text-[10px] font-black text-white">{s.day}</span>
                        </div>
                        <div>
                           <span className="text-[14px] font-black text-cyan-400 lcd-font block mb-1">{s.time}</span>
                           <h4 className="text-[12px] font-bold text-white uppercase tracking-wider">{s.activity}</h4>
                        </div>
                     </div>
                     <button className="px-6 h-10 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase text-zinc-500 hover:text-white transition-all">Set Reminder</button>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelPage;
