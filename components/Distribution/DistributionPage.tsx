
import React, { useState, useMemo } from 'react';
import { ArrowLeft, Share2, TrendingUp, DollarSign, Eye, ShieldCheck, Store, Info, Activity } from 'lucide-react';
import { Song } from '../../types';
import { songStorage } from '../../lib/SongStorage';

interface DistributionPageProps {
  userLibrary: { metadata: Song, xmlData: string }[];
  onRefresh: () => void;
  onBack: () => void;
}

const DistributionPage: React.FC<DistributionPageProps> = ({ userLibrary = [], onRefresh, onBack }) => {
  const [filterMode, setFilterMode] = useState<'all' | 'listed' | 'private'>('all');

  const filteredList = useMemo(() => {
    let list = [...userLibrary];
    if (filterMode === 'listed') list = list.filter(i => i.metadata.isForSale);
    if (filterMode === 'private') list = list.filter(i => !i.metadata.isForSale);
    return list.reverse();
  }, [userLibrary, filterMode]);

  const toggleSale = async (item: {metadata: Song, xmlData: string}) => {
    const updated = { ...item.metadata, isForSale: !item.metadata.isForSale, isPublic: true };
    await songStorage.saveSong(updated, item.xmlData);
    onRefresh();
  };

  const updatePrice = async (item: {metadata: Song, xmlData: string}, price: number) => {
    const updated = { ...item.metadata, salePrice: price };
    await songStorage.saveSong(updated, item.xmlData);
    onRefresh();
  };

  return (
    <div className="h-full flex flex-col bg-[#050507] p-8 overflow-y-auto no-scrollbar pb-32 select-none">
      <header className="flex items-center gap-6 mb-12">
        <button onClick={onBack} className="p-3 bg-white/5 text-zinc-400 rounded-2xl hover:text-white shrink-0"><ArrowLeft size={20}/></button>
        <div className="flex-1">
          <h1 className="text-3xl font-black italic text-white uppercase tracking-tighter">DISTRIBUTION <span className="text-cyan-400">HUB</span></h1>
          <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.4em] mt-1">NEURAL MARKETPLACE INVENTORY</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-xl">
           {['all', 'listed', 'private'].map(m => (
             <button key={m} onClick={() => setFilterMode(m as any)} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${filterMode === m ? 'bg-white text-black shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}>{m}</button>
           ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3">
        {filteredList.map((item) => {
          const master = item.metadata.origin === 'create';
          const uploaderName = master ? 'ME' : (item.metadata.ownerName || 'MAESTRO');
          return (
            <div key={item.metadata.id} className="bg-[#0c0c0e] border border-white/5 p-4 rounded-[32px] flex flex-col sm:flex-row items-center gap-6 group hover:border-cyan-500/30 transition-all shadow-xl">
               <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
                  <div className="relative shrink-0 w-12 aspect-video rounded-xl overflow-hidden bg-black border border-white/10">
                     <img src={item.metadata.coverUrl} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-500" alt="" />
                  </div>
                  <div className="min-w-0">
                     <h3 className="text-[12px] font-black text-white uppercase italic truncate mb-0.5">{item.metadata.title}</h3>
                     <div className="flex items-center gap-2">
                        <span className={`text-[6px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${master ? 'bg-cyan-500 text-black' : 'bg-white/5 text-zinc-600'}`}>{uploaderName}</span>
                        <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                        <span className="text-[6px] font-black text-zinc-700 italic">v1.5</span>
                     </div>
                  </div>
               </div>
               
               <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="flex flex-col items-center px-4 border-r border-white/5">
                     <span className="text-[7px] font-black text-zinc-600 uppercase tracking-widest mb-1">PLAYS</span>
                     <span className="text-[12px] font-black text-white lcd-font">{item.metadata.views || 0}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-black/40 p-2 rounded-2xl border border-white/5">
                      <button onClick={() => toggleSale(item)} className={`px-3 h-8 rounded-xl text-[8px] font-black uppercase transition-all ${item.metadata.isForSale ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-zinc-900 text-zinc-600'}`}>
                         {item.metadata.isForSale ? 'LISTED' : 'PRIVATE'}
                      </button>
                      <div className="flex items-center gap-1.5 px-2">
                         <DollarSign size={12} className={item.metadata.isForSale ? 'text-amber-500' : 'text-zinc-800'} />
                         <input type="number" disabled={!item.metadata.isForSale} value={item.metadata.salePrice || 0} onChange={(e) => updatePrice(item, parseInt(e.target.value) || 0)} className={`w-14 bg-transparent text-[11px] font-black text-white text-center outline-none ${!item.metadata.isForSale ? 'opacity-20' : ''}`} />
                      </div>
                  </div>
                  <button className="p-2 bg-white/5 text-zinc-500 rounded-xl hover:text-white transition-all"><TrendingUp size={18}/></button>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DistributionPage;
