
import React, { useState, useEffect, useMemo } from 'react';
import {
    ShieldCheck, RefreshCcw,
    Cpu, Settings, Music, Plus, CloudSync,
    ArrowUpCircle, ArrowUpRight, Globe, Clock,
    BrainCircuit, LayoutGrid, Share2, ChevronRight,
    Database, Play, LogOut, User as UserIcon
} from 'lucide-react';
import { songStorage, NeuralStats } from '../../lib/SongStorage';
import { CloudSyncService } from '../../lib/CloudSyncService';
import { SupabaseSyncService } from '../../lib/SupabaseSyncService';
import { supabase } from '../../lib/supabase';
import { Song } from '../../types';
import AuthForm from './AuthForm';

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
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [stats, setStats] = useState<NeuralStats | null>(null);
    const [isRefreshingStats, setIsRefreshingStats] = useState(false);
    const [cloudSongCount, setCloudSongCount] = useState(0);
    const [repoStatus, setRepoStatus] = useState<'synced' | 'pending' | 'checking'>('checking');
    const [syncStatus, setSyncStatus] = useState<'online' | 'offline'>('online');

    const recentSongs = useMemo(() => [...userLibrary].reverse().slice(0, 4), [userLibrary]);

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
            if (session?.user) {
                const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                setProfile(data);
            }
        };
        getSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        loadStats();
        checkSyncStatus();
    }, [userLibrary.length, user]);

    const checkSyncStatus = async () => {
        try {
            if (user) {
               const { count } = await supabase.from('songs').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
               setCloudSongCount(count || 0);
               setRepoStatus(userLibrary.length < (count || 0) ? 'pending' : 'synced');
            } else {
               const stats = await CloudSyncService.getCloudStats();
               setCloudSongCount(stats.total);
               setRepoStatus(userLibrary.length < stats.total ? 'pending' : 'synced');
            }
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

    const handleSync = async () => {
        if (!user) {
            await onTriggerSync();
            onRefresh();
            return;
        }
        
        try {
            const res = await SupabaseSyncService.performFullSync();
            alert(res.message);
            onRefresh();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
    };

    if (!user) {
        return (
            <div className="h-full flex items-center justify-center bg-[#050507] p-6">
                <AuthForm onComplete={() => window.location.reload()} />
            </div>
        );
    }

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
                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center overflow-hidden">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <UserIcon size={32} className="text-cyan-400" />
                        )}
                    </div>
                    <div className="flex-1 space-y-1">
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                            {user.user_metadata?.full_name || user.email?.split('@')[0]}
                        </h2>
                        <p className="text-zinc-500 text-[8px] font-bold uppercase tracking-[0.3em]">
                            {profile?.membership_tier || 'FREE MATRIX'} • LEVEL {userLibrary.length > 10 ? '5' : '1'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleSignOut} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 hover:bg-rose-500 hover:text-white transition-all">
                            <LogOut size={16} />
                        </button>
                        <div className={`flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5 h-8`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">{syncStatus}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-8 max-w-7xl mx-auto w-full">

                {/* ROW 1: REPOSITORY & DISPATCH */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`md:col-span-2 matrix-card p-8 flex flex-col sm:flex-row items-center gap-8 relative overflow-hidden ${repoStatus === 'pending' ? 'border-amber-500/30 bg-amber-500/[0.02]' : ''}`}>
                        <div className="relative shrink-0">
                            <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-700 ${repoStatus === 'synced' ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : repoStatus === 'pending' ? 'border-amber-500 animate-pulse' : 'border-zinc-800'}`}>
                                <CloudSync size={32} className={repoStatus === 'synced' ? 'text-emerald-500/40' : repoStatus === 'pending' ? 'text-amber-400' : 'text-zinc-600'} />
                            </div>
                        </div>
                        <div className="flex-1 text-center sm:text-left space-y-2">
                             <h3 className="text-xl font-black text-white italic uppercase tracking-tighter leading-tight">
                                    {repoStatus === 'synced' ? 'NEURAL SYNC CORE ACTIVE' : 'CLOUD SEEDS DETECTED'}
                             </h3>
                             <div className="flex justify-center sm:justify-start gap-1">
                                    <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border bg-cyan-500/10 border-cyan-500/20 text-cyan-400">
                                        {userLibrary.length} LOCAL MATRIX
                                    </div>
                                    <div className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border bg-white/5 border-white/10 text-zinc-500">
                                        {cloudSongCount} CLOUD VAULT
                                    </div>
                             </div>
                             <p className="text-zinc-500 text-[9px] font-medium leading-relaxed max-w-sm uppercase tracking-wider">
                                {user ? 'Your neural library is being managed by Supabase Cloud Matrix.' : 'Matrix local storage is consistent with cloud repository.'}
                             </p>
                        </div>
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className={`w-full sm:w-auto h-12 px-6 rounded-3xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all ${repoStatus === 'pending' ? 'bg-amber-500 text-black' : 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'}`}
                        >
                            {isSyncing ? <RefreshCcw size={16} className="animate-spin" /> : <CloudSync size={16} />}
                            {isSyncing ? 'SYNCING...' : 'FULL CLOUD SYNC'}
                        </button>
                    </div>

                    <div className="matrix-card p-8 flex flex-col justify-between group cursor-not-allowed opacity-50 border-indigo-500/20">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                <ArrowUpCircle size={20} />
                            </div>
                            <ShieldCheck size={18} className="text-emerald-500" />
                        </div>
                        <div>
                            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest block mb-1">AUTOMATIC MODE</span>
                            <h4 className="text-md font-black text-white italic uppercase tracking-tighter leading-none">REAL-TIME SYNC</h4>
                            <p className="text-[8px] text-zinc-500 font-bold mt-2 uppercase tracking-widest leading-tight">SUPABASE IS NOW MANAGING YOUR DATA DISPATCH</p>
                        </div>
                    </div>
                </div>

                {/* ROW 2: RECENT SEEDS & GLOBAL ACTIVITY */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <section className="space-y-6">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-3">
                                <Clock size={20} className="text-zinc-600" />
                                <h2 className="text-sm font-black text-white uppercase italic tracking-widest">RECENT SEEDS</h2>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {recentSongs.length === 0 ? (
                                <div className="h-40 matrix-card border-dashed flex items-center justify-center text-zinc-800">
                                    <span className="text-[10px] font-black uppercase tracking-widest italic">Awaiting first import...</span>
                                </div>
                            ) : (
                                recentSongs.map((item) => (
                                    <div key={item.metadata.id} onClick={() => onSongSelect(item.metadata, item.xmlData, 'studio')} className="song-capsule">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[12px] font-black text-white uppercase italic truncate leading-none mb-1">{item.metadata.title}</h4>
                                            <span className="text-[6px] font-bold text-zinc-600 uppercase tracking-widest truncate">{item.metadata.artist}</span>
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
                        </div>
                        <div className="matrix-card p-8 flex flex-col gap-8 bg-gradient-to-br from-indigo-600/[0.03] to-transparent">
                            <div className="flex items-start gap-6 p-6 bg-white/[0.02] rounded-[32px] border border-white/5">
                                <div className="w-14 h-14 rounded-[22px] bg-black border border-indigo-500/30 flex items-center justify-center shrink-0">
                                    <ShieldCheck size={28} className="text-cyan-400" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-[14px] font-black text-white uppercase italic mb-1.5 tracking-widest">PROTECTED VAULT</h4>
                                    <p className="text-[10px] text-zinc-500 font-medium leading-relaxed uppercase tracking-wider">
                                        Your neural music assets are now protected by Supabase Row Level Security (RLS). Only your account can access these seeds.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* ROW 3: IDENTITY & SETTINGS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="bg-[#0c0c0e] rounded-[40px] p-8 border border-white/5 shadow-2xl flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <Globe size={20} className="text-zinc-600" />
                                <h3 className="text-sm font-black text-white uppercase italic tracking-widest">IDENTITY & LANGUAGE</h3>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-2">Your Country</label>
                                <select value={userCountry} onChange={(e) => setUserCountry(e.target.value)} className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-4 text-white text-xs outline-none focus:border-cyan-500 transition-colors">
                                    <option value="Thailand" className="text-black">ไทย / Thailand</option>
                                    <option value="USA" className="text-black">USA</option>
                                    <option value="Other" className="text-black">Other</option>
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-2">Preferred Language</label>
                                <div className="flex gap-2">
                                    {['en', 'th'].map(lang => (
                                        <button key={lang} onClick={() => setPreferredLanguage(lang as 'th'|'en')} className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${preferredLanguage === lang ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-white/5 text-zinc-500 border-white/5'}`}>
                                            {lang === 'en' ? 'ENGLISH' : 'ไทย'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#0c0c0e] rounded-[40px] p-8 border border-white/5 shadow-2xl flex items-center gap-10">
                        <div className="relative w-32 h-32 rounded-full flex items-center justify-center" style={{ background: `conic-gradient(#00e5ff ${usagePercent}%, rgba(255,255,255,0.05) 0%)` }}>
                            <div className="absolute inset-2 bg-[#0c0c0e] rounded-full flex flex-col items-center justify-center">
                                <span className="text-xl font-black text-white lcd-font">{Math.round(100 - usagePercent)}%</span>
                                <span className="text-[6px] font-black text-zinc-600 uppercase tracking-widest">FUEL</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-4 w-full">
                            <h3 className="text-sm font-black text-white uppercase italic flex items-center gap-2"><Cpu size={16} className="text-cyan-400" /> NEURAL STATS</h3>
                            <div className="grid grid-cols-1 gap-2">
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
                </div>
            </div>
        </div>
    );
};
