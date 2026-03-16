
import React, { useState, useEffect, useMemo } from 'react';
import {
    ShieldCheck, RefreshCcw,
    Cpu, Settings, Music, Plus, CloudSync,
    ArrowUpCircle, ArrowUpRight, Globe, Clock,
    BrainCircuit, LayoutGrid, Share2, ChevronRight,
    Database, Play
} from 'lucide-react';
import { songStorage, NeuralStats } from '../../lib/SongStorage';
import { CloudSyncService } from '../../lib/CloudSyncService';
import { Song } from '../../types';

interface ProfilePageProps {
    onEnterForge: () => void;
    userLibrary: { metadata: Song, xmlData: string }[];
    onSongSelect: (song: Song, xml?: string, mode?: 'listen') => void;
    onTriggerSync: () => Promise<void>;
    isSyncing: boolean;
    onRefresh: () => void;
    preferredLanguage: 'th' | 'en';
    setPreferredLanguage: (lang: 'th' | 'en') => void;
    userCountry: string;
    setUserCountry: (country: string) => void;
    userInstrument: string;
    setUserInstrument: (inst: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
    onEnterForge, userLibrary = [], onSongSelect, onTriggerSync, isSyncing, onRefresh,
    preferredLanguage, setPreferredLanguage,
    userCountry, setUserCountry,
    userInstrument, setUserInstrument
}) => {
    const [stats, setStats] = useState<NeuralStats | null>(null);
    const [isRefreshingStats, setIsRefreshingStats] = useState(false);
    const [cloudSongCount, setCloudSongCount] = useState(0);
    const [repoStatus, setRepoStatus] = useState<'synced' | 'pending' | 'checking'>('checking');
    const [syncStatus, setSyncStatus] = useState<'online' | 'offline'>('online');

    const recentSongs = useMemo(() => [...userLibrary].reverse().slice(0, 4), [userLibrary]);

    useEffect(() => {
        loadStats();
        checkSyncStatus();
    }, [userLibrary.length]);

    const checkSyncStatus = async () => {
        try {
            const stats = await CloudSyncService.getCloudStats();
            setCloudSongCount(stats.total);
            setRepoStatus(userLibrary.length < stats.total ? 'pending' : 'synced');
            setSyncStatus('online');
        } catch (e) {
            setRepoStatus('synced');
            setSyncStatus('offline');
        }
    };

    const loadStats = async () => {
        setIsRefreshingStats(true);
        const data = await songStorage.getUsageStats();
        setStats(data);
        setTimeout(() => setIsRefreshingStats(false), 800);
    };

    const handlePushToCloud = async () => {
        try {
            const manifestData = await songStorage.exportNeuralCore();
            const blob = new Blob([manifestData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `manifest.json`;
            link.click();
            URL.revokeObjectURL(url);
            alert("นีโมเตรียมไฟล์ manifest.json สำหรับ Push ให้แล้วค่ะ!");
        } catch (e) { alert("Export failed."); }
    };

    const handleManualPull = async () => {
        try {
            await onTriggerSync();
            onRefresh();
        } catch (e) { }
    };

    const totalSpent = (stats?.spentVocal || 0);
    const usagePercent = Math.min(100, (totalSpent / (stats?.totalLimit || 1000000)) * 100);

    return (
        <div className="h-full flex flex-col bg-[#050507] overflow-y-auto no-scrollbar pb-32">
            <style>{`
        .matrix-card { background: rgba(12, 12, 14, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 40px; }
        .lcd-text { font-family: 'JetBrains Mono', monospace; }
        .song-capsule {
            background: rgba(255, 255, 255, 0.005);
            border: 1px solid rgba(255, 255, 255, 0.03);
            border-radius: 100px;
            padding: 8px 24px;
            display: flex;
            align-items: center;
            gap: 16px;
            transition: all 0.3s;
            cursor: pointer;
        }
        .song-capsule:hover { background: rgba(255, 255, 255, 0.03); transform: translateX(8px); }
        .stat-box { background: black; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 28px; padding: 20px; }
      `}</style>

            {/* PROFILE HEADER */}
            <div className="relative h-48 shrink-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050507]" />
                <div className="absolute bottom-0 left-0 right-0 p-8 flex items-end gap-6">
                    <div className="flex-1 space-y-1">
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Neural Maestro</h2>
                        <p className="text-zinc-500 text-[8px] font-bold uppercase tracking-[0.3em]">AI COMPOSER • LEVEL 5</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5 h-8`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`} />
                        <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">{syncStatus}</span>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-8 max-w-7xl mx-auto w-full">

                {/* ROW 1: REPOSITORY & DISPATCH (FROM SCREENSHOT) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`md:col-span-2 matrix-card p-8 flex flex-col sm:flex-row items-center gap-8 relative overflow-hidden ${repoStatus === 'pending' ? 'border-amber-500/30 bg-amber-500/[0.02]' : ''}`}>
                        <div className="relative shrink-0">
                            <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-700 ${repoStatus === 'synced' ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : repoStatus === 'pending' ? 'border-amber-500 animate-pulse' : 'border-zinc-800'}`}>
                                <CloudSync size={32} className={repoStatus === 'synced' ? 'text-emerald-500/40' : repoStatus === 'pending' ? 'text-amber-400' : 'text-zinc-600'} />
                            </div>
                        </div>
                        <div className="flex-1 text-center sm:text-left space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter leading-tight">
                                    {repoStatus === 'synced' ? 'REPOSITORY SYNCED' : repoStatus === 'pending' ? 'NEW SEEDS DETECTED' : 'CHECKING REPOSITORY...'}
                                </h3>
                                <div className="flex justify-center sm:justify-start gap-1">
                                    <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-400">
                                        {userLibrary.length} LOCAL
                                    </div>
                                    <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border bg-white/5 border-white/10 text-zinc-500">
                                        {cloudSongCount} CLOUD
                                    </div>
                                </div>
                            </div>
                            <p className="text-zinc-500 text-[9px] font-medium leading-relaxed max-w-sm uppercase tracking-wider">
                                {repoStatus === 'synced'
                                    ? 'Matrix local storage is consistent with cloud repository.'
                                    : 'นีโมพบเพลงใหม่บนเมฆที่ยังไม่ได้ดึงลงเครื่องค่ะ กดปุ่มเพื่ออัปเดตคลังแสงของคุณนะคะ'}
                            </p>
                        </div>
                        <button
                            onClick={handleManualPull}
                            disabled={isSyncing}
                            className={`w-full sm:w-auto h-12 px-6 rounded-3xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all ${repoStatus === 'pending' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-white/5 text-zinc-500'}`}
                        >
                            {isSyncing ? <RefreshCcw size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                            {isSyncing ? 'SYNCING...' : 'CHECK FOR UPDATES'}
                        </button>
                    </div>

                    <div onClick={handlePushToCloud} className="matrix-card p-8 flex flex-col justify-between group cursor-pointer hover:bg-white/[0.02] transition-all border-indigo-500/20">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                                <ArrowUpCircle size={20} />
                            </div>
                            <ArrowUpRight size={18} className="text-zinc-700" />
                        </div>
                        <div>
                            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest block mb-1">DATA DISPATCH</span>
                            <h4 className="text-md font-black text-white italic uppercase tracking-tighter leading-none">EXPORT MANIFEST</h4>
                            <p className="text-[8px] text-zinc-500 font-bold mt-2 uppercase tracking-widest leading-tight">PREPARE LOCAL SEEDS TO PUSH BACK TO GLOBAL CLOUD</p>
                        </div>
                    </div>
                </div>

                {/* ROW 2: RECENT SEEDS & GLOBAL ACTIVITY (FROM SCREENSHOT) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <section className="space-y-6">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-3">
                                <Clock size={20} className="text-zinc-600" />
                                <h2 className="text-sm font-black text-white uppercase italic tracking-widest">RECENT SEEDS</h2>
                            </div>
                            <button className="text-[9px] font-black text-cyan-500 uppercase tracking-widest flex items-center gap-1 hover:text-white transition-colors">
                                VIEW VAULT <ChevronRight size={12} />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {recentSongs.length === 0 ? (
                                <div className="h-40 matrix-card border-dashed flex items-center justify-center text-zinc-800">
                                    <span className="text-[10px] font-black uppercase tracking-widest italic">Awaiting first import...</span>
                                </div>
                            ) : (
                                recentSongs.map((item) => (
                                    <div key={item.metadata.id} onClick={() => onSongSelect(item.metadata, item.xmlData, 'studio')} className="song-capsule">
                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-black shrink-0 border border-white/5 relative">
                                            <img src={item.metadata.coverUrl} className="w-full h-full object-cover opacity-60" alt="" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[12px] font-black text-white uppercase italic truncate leading-none mb-1">{item.metadata.title}</h4>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[6px] font-bold text-zinc-600 uppercase tracking-widest truncate">{item.metadata.artist}</span>
                                                <div className="w-0.5 h-0.5 bg-zinc-800 rounded-full" />
                                                <span className="text-[6px] font-black text-zinc-700 uppercase tracking-widest">{item.metadata.category}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0 pl-4 border-l border-white/5">
                                            <span className="text-[10px] font-black text-zinc-800 lcd-text leading-none">{item.metadata.bpm}</span>
                                            <span className="text-[5px] font-black text-zinc-700 uppercase">BPM</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-3">
                                <Globe size={20} className="text-zinc-600" />
                                <h2 className="text-sm font-black text-white uppercase italic tracking-widest">GLOBAL ACTIVITY</h2>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">LIVE LINK</span>
                            </div>
                        </div>
                        <div className="matrix-card p-8 flex flex-col gap-8 bg-gradient-to-br from-indigo-600/[0.03] to-transparent">
                            <div className="flex items-start gap-6 p-6 bg-white/[0.02] rounded-[32px] border border-white/5">
                                <div className="w-14 h-14 rounded-[22px] bg-black border border-indigo-500/30 flex items-center justify-center shrink-0">
                                    <BrainCircuit size={28} className="text-indigo-400" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-[14px] font-black text-white uppercase italic mb-1.5 tracking-widest">COLLABORATIVE REPOSITORY</h4>
                                    <p className="text-[10px] text-zinc-500 font-medium leading-relaxed uppercase tracking-wider">
                                        นีโมทำการซิงค์คลังเพลงของเพื่อนๆ ให้อัตโนมัติ ทุกครั้งที่มีการอิมพอร์ตเพลงใหม่ อย่าลืมกด <b>PUSH</b> เพื่อส่งต่อให้คนอื่นด้วยนะคะ
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="stat-box flex flex-col gap-2 group hover:border-cyan-500/30 transition-all">
                                    <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 group-hover:text-cyan-400 transition-colors"><LayoutGrid size={18} /></div>
                                    <div>
                                        <span className="text-[24px] font-black text-white lcd-text">250k+</span>
                                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest block">Neural Assets</span>
                                    </div>
                                </div>
                                <div className="stat-box flex flex-col gap-2 group hover:border-indigo-500/30 transition-all">
                                    <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 group-hover:text-indigo-400 transition-colors"><Share2 size={18} /></div>
                                    <div>
                                        <span className="text-[24px] font-black text-white lcd-text">1.5k</span>
                                        <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest block">Daily Syncs</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* ROW 3: NEURAL PERFORMANCE STATS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-[#0c0c0e] rounded-[40px] p-8 border border-white/5 shadow-2xl flex items-center gap-10">
                        <div className="relative w-32 h-32 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(#00e5ff ${usagePercent}%, rgba(255,255,255,0.05) 0%)` }}>
                            <div className="absolute inset-2 bg-[#0c0c0e] rounded-full flex flex-col items-center justify-center">
                                <span className="text-xl font-black text-white lcd-font">{Math.round(100 - usagePercent)}%</span>
                                <span className="text-[6px] font-black text-zinc-600 uppercase tracking-widest">FUEL</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-4 w-full">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2"><ShieldCheck size={16} className="text-cyan-400" /> NEURAL PERFORMANCE</h3>
                                <button onClick={loadStats} className={isRefreshingStats ? 'animate-spin' : ''}><RefreshCcw size={14} className="text-zinc-600" /></button>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <span className="text-[7px] font-bold text-zinc-600 uppercase block mb-1">Vocal Synthesis</span>
                                    <span className="text-xs font-black text-white lcd-font">{stats?.spentVocal.toLocaleString()} <span className="text-[8px] text-zinc-700">Tokens</span></span>
                                </div>
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <span className="text-[7px] font-bold text-zinc-600 uppercase block mb-1">AI Logic Core</span>
                                    <span className="text-xs font-black text-white lcd-font">{stats?.spentNimo.toLocaleString()} <span className="text-[8px] text-zinc-700">Tokens</span></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#0c0c0e] rounded-[40px] p-8 border border-white/5 shadow-2xl flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <Globe size={20} className="text-zinc-600" />
                                <h3 className="text-sm font-black text-white uppercase italic tracking-widest">IDENTITY & LANGUAGE</h3>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-2">Your Country</label>
                                <select
                                    value={userCountry}
                                    onChange={(e) => setUserCountry(e.target.value)}
                                    className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-white text-xs outline-none focus:border-cyan-500 transition-colors"
                                >
                                    <option value="Thailand" className="text-black">ไทย / Thailand</option>
                                    <option value="USA" className="text-black">USA</option>
                                    <option value="UK" className="text-black">United Kingdom</option>
                                    <option value="Japan" className="text-black">Japan</option>
                                    <option value="Other" className="text-black">Other</option>
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-2">Preferred Language</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPreferredLanguage('en')}
                                        className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${preferredLanguage === 'en' ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-white/5 text-zinc-500 border-white/5 hover:border-white/10'}`}
                                    >
                                        ENGLISH
                                    </button>
                                    <button
                                        onClick={() => setPreferredLanguage('th')}
                                        className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${preferredLanguage === 'th' ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-white/5 text-zinc-500 border-white/5 hover:border-white/10'}`}
                                    >
                                        ไทย / THAI
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3 mt-4">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-2">Your Music Instrument</label>
                                <select
                                    value={userInstrument}
                                    onChange={(e) => setUserInstrument(e.target.value)}
                                    className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-white text-xs outline-none focus:border-cyan-500 transition-colors"
                                >
                                    <option value="" disabled className="text-black">Choose Instrument...</option>
                                    <option value="Piano" className="text-black">Piano / Keyboard</option>
                                    <option value="Guitar" className="text-black">Guitar</option>
                                    <option value="Bass" className="text-black">Bass</option>
                                    <option value="Drums" className="text-black">Drums / Percussion</option>
                                    <option value="Vocals" className="text-black">Vocals</option>
                                    <option value="Violin" className="text-black">Violin / Strings</option>
                                    <option value="Saxophone" className="text-black">Saxophone / Woodwinds</option>
                                    <option value="Other" className="text-black">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
