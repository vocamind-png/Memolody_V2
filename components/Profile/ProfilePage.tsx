
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    ShieldCheck, RefreshCcw, Clock, Globe,
    LogOut, User as UserIcon, Camera, ImagePlus, Check,
    CloudLightning, Music, Cpu
} from 'lucide-react';
import { songStorage, NeuralStats } from '../../lib/SongStorage';
import { SupabaseSyncService } from '../../lib/SupabaseSyncService';
import { supabase } from '../../lib/supabase';
import { Song } from '../../types';
import AuthForm from './AuthForm';

// ─── Background presets ───────────────────────────────────────────
const BG_PRESETS = [
    { id: 'default', style: 'bg-[#050507]', label: 'Void' },
    { id: 'cyber', style: 'bg-gradient-to-br from-[#050507] via-[#0a0a1a] to-[#0d0520]', label: 'Cyber' },
    { id: 'ocean', style: 'bg-gradient-to-br from-[#050507] via-[#051520] to-[#052530]', label: 'Ocean' },
    { id: 'ember', style: 'bg-gradient-to-br from-[#050507] via-[#1a0505] to-[#200a0a]', label: 'Ember' },
    { id: 'forest', style: 'bg-gradient-to-br from-[#050507] via-[#051505] to-[#0a200a]', label: 'Forest' },
    { id: 'rose', style: 'bg-gradient-to-br from-[#050507] via-[#1a0510] to-[#20051a]', label: 'Rose' },
];

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
    preferredLanguage, setPreferredLanguage, userCountry, setUserCountry, userInstrument, setUserInstrument
}) => {
    const [user, setUser] = useState<any>(null);
    const [stats, setStats] = useState<NeuralStats | null>(null);
    const [cloudSongCount, setCloudSongCount] = useState(0);
    const [syncMessage, setSyncMessage] = useState('');
    const [isSyncingCloud, setIsSyncingCloud] = useState(false);

    // Avatar & Background
    const [avatarUrl, setAvatarUrl] = useState<string>('');
    const [customBgUrl, setCustomBgUrl] = useState<string>('');
    const [selectedBg, setSelectedBg] = useState(() => localStorage.getItem('profile_bg') || 'default');
    const [showBgPicker, setShowBgPicker] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bgInputRef = useRef<HTMLInputElement>(null);

    const recentSongs = useMemo(() => [...userLibrary].filter(s => !s.metadata.isDeleted).reverse().slice(0, 3), [userLibrary]);
    const bgPreset = BG_PRESETS.find(b => b.id === selectedBg) || BG_PRESETS[0];

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
            if (session?.user) {
                const storedAvatar = localStorage.getItem(`avatar_${session.user.id}`);
                if (storedAvatar) setAvatarUrl(storedAvatar);
                const storedBgUrl = localStorage.getItem(`bgurl_${session.user.id}`);
                if (storedBgUrl) setCustomBgUrl(storedBgUrl);

                const { count } = await supabase.from('songs')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', session.user.id);
                setCloudSongCount(count || 0);
            }
        };
        getSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        const loadStats = async () => {
            const data = await songStorage.getUsageStats();
            setStats(data);
        };
        loadStats();

        return () => subscription.unsubscribe();
    }, []);

    // Avatar upload (stored in localStorage as base64)
    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            setAvatarUrl(base64);
            if (user) localStorage.setItem(`avatar_${user.id}`, base64);
        };
        reader.readAsDataURL(file);
    };

    // Custom background upload
    const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            setCustomBgUrl(base64);
            setSelectedBg('custom');
            if (user) localStorage.setItem(`bgurl_${user.id}`, base64);
            localStorage.setItem('profile_bg', 'custom');
            setShowBgPicker(false);
        };
        reader.readAsDataURL(file);
    };

    const handleSelectBg = (id: string) => {
        setSelectedBg(id);
        localStorage.setItem('profile_bg', id);
        if (id !== 'custom') setCustomBgUrl('');
        setShowBgPicker(false);
    };

    const handleSync = async () => {
        if (!user) { await onTriggerSync(); onRefresh(); return; }
        setIsSyncingCloud(true);
        const res = await SupabaseSyncService.performFullSync();
        setSyncMessage(res.message);
        onRefresh();
        setIsSyncingCloud(false);
        setTimeout(() => setSyncMessage(''), 3000);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    // Inline bg style
    const bgStyle: React.CSSProperties = (selectedBg === 'custom' && customBgUrl)
        ? { backgroundImage: `url(${customBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : {};

    const totalSpent = stats?.spentVocal || 0;
    const usagePercent = Math.min(100, (totalSpent / (stats?.totalLimit || 1000000)) * 100);

    if (!user) {
        return (
            <div className="h-full flex items-center justify-center bg-[#050507] p-6">
                <AuthForm onComplete={() => window.location.reload()} />
            </div>
        );
    }

    return (
        <div
            className={`h-full flex flex-col overflow-y-auto no-scrollbar pb-32 relative ${selectedBg !== 'custom' ? bgPreset.style : ''}`}
            style={bgStyle}
        >
            {/* Background blur overlay when custom bg */}
            {selectedBg === 'custom' && customBgUrl && (
                <div className="absolute inset-0 backdrop-blur-[2px] bg-black/60 z-0 pointer-events-none" />
            )}
            <div className="relative z-10">

                {/* ── HEADER ── */}
                <div className="relative shrink-0 pt-8 pb-6 px-6 flex flex-col items-center gap-4 border-b border-white/5">
                    {/* BG picker button */}
                    <button
                        onClick={() => setShowBgPicker(v => !v)}
                        className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black text-zinc-500 uppercase tracking-widest hover:text-cyan-400 hover:border-cyan-500/30 transition-all"
                    >
                        <ImagePlus size={10} />
                        BG
                    </button>

                    {/* Sign Out */}
                    <button
                        onClick={handleSignOut}
                        className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[8px] font-black text-rose-400 uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                    >
                        <LogOut size={10} />
                        Sign Out
                    </button>

                    {/* Avatar */}
                    <div className="relative group">
                        <div
                            className="w-24 h-24 rounded-full border-2 border-cyan-500/30 overflow-hidden bg-zinc-900 flex items-center justify-center shadow-lg shadow-cyan-500/10 cursor-pointer"
                            onClick={() => avatarInputRef.current?.click()}
                        >
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                            ) : user.user_metadata?.avatar_url ? (
                                <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                                <UserIcon size={40} className="text-zinc-600" />
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                <Camera size={20} className="text-white" />
                            </div>
                        </div>
                        <button
                            onClick={() => avatarInputRef.current?.click()}
                            className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                        >
                            <Camera size={12} />
                        </button>
                        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </div>

                    {/* Username */}
                    <div className="text-center space-y-1">
                        <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">
                            {user.user_metadata?.full_name || user.email?.split('@')[0]}
                        </h2>
                        <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-[0.3em]">
                            {user.email}
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-1">
                            <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                FREE TIER
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-zinc-500">
                                {userLibrary.length} Songs
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── BG PICKER PANEL ── */}
                {showBgPicker && (
                    <div className="mx-4 mt-4 p-4 bg-[#111]/90 border border-white/10 rounded-3xl space-y-3">
                        <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Choose Background</p>
                        <div className="grid grid-cols-3 gap-2">
                            {BG_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => handleSelectBg(preset.id)}
                                    className={`h-10 rounded-xl relative overflow-hidden border transition-all ${selectedBg === preset.id ? 'border-cyan-500 scale-105' : 'border-white/10 hover:border-white/20'} ${preset.style}`}
                                >
                                    {selectedBg === preset.id && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Check size={14} className="text-cyan-400" />
                                        </div>
                                    )}
                                    <span className="absolute bottom-1 left-0 right-0 text-center text-[7px] font-bold text-zinc-400 uppercase">{preset.label}</span>
                                </button>
                            ))}
                            {/* Custom upload btn */}
                            <button
                                onClick={() => bgInputRef.current?.click()}
                                className={`h-10 rounded-xl border border-dashed border-white/20 hover:border-cyan-500/40 flex items-center justify-center gap-1 text-zinc-600 hover:text-cyan-400 transition-all ${selectedBg === 'custom' ? 'border-cyan-500 text-cyan-400' : ''}`}
                            >
                                <ImagePlus size={12} />
                                <span className="text-[7px] font-bold uppercase">Upload</span>
                            </button>
                            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
                        </div>
                    </div>
                )}

                <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">

                    {/* ── CLOUD SYNC CARD ── */}
                    <div className="bg-black/40 border border-white/5 rounded-3xl p-5 flex flex-col sm:flex-row items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                            <CloudLightning size={22} className="text-cyan-400" />
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                            <h3 className="text-xs font-black text-white uppercase italic tracking-tighter">Cloud Sync</h3>
                            <div className="flex justify-center sm:justify-start gap-2 mt-1">
                                <span className="text-[7px] font-black uppercase tracking-widest bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-zinc-400">
                                    {userLibrary.length} Local
                                </span>
                                <span className="text-[7px] font-black uppercase tracking-widest bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-zinc-400">
                                    {cloudSongCount} Cloud
                                </span>
                            </div>
                            {syncMessage && <p className="text-[8px] text-emerald-400 mt-1">{syncMessage}</p>}
                        </div>
                        <button
                            onClick={handleSync}
                            disabled={isSyncingCloud}
                            className="h-10 px-5 rounded-2xl bg-cyan-500 text-black text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-cyan-400 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <RefreshCcw size={12} className={isSyncingCloud ? 'animate-spin' : ''} />
                            {isSyncingCloud ? 'Syncing...' : 'Sync Now'}
                        </button>
                    </div>

                    {/* ── STATS ── */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: 'Songs', value: userLibrary.length, icon: Music, color: 'text-cyan-400' },
                            { label: 'AI Used', value: totalSpent.toLocaleString(), icon: Cpu, color: 'text-violet-400' },
                            { label: 'Cloud', value: cloudSongCount, icon: ShieldCheck, color: 'text-emerald-400' },
                        ].map(stat => (
                            <div key={stat.label} className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                                <stat.icon size={14} className={stat.color} />
                                <span className="text-[18px] font-black text-white leading-none">{stat.value}</span>
                                <span className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest">{stat.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* ── RECENT SONGS ── */}
                    {recentSongs.length > 0 && (
                        <div className="bg-black/40 border border-white/5 rounded-3xl overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                                <Clock size={12} className="text-zinc-600" />
                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Recent Songs</span>
                            </div>
                            {recentSongs.map(item => (
                                <div
                                    key={item.metadata.id}
                                    onClick={() => onSongSelect(item.metadata, item.xmlData, 'listen')}
                                    className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-colors last:border-b-0"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-white uppercase italic truncate">{item.metadata.title}</p>
                                        <p className="text-[7px] text-zinc-600 uppercase tracking-wider truncate">{item.metadata.artist}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── IDENTITY SETTINGS ── */}
                    <div className="bg-black/40 border border-white/5 rounded-3xl p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <Globe size={14} className="text-zinc-600" />
                            <h3 className="text-[9px] font-black text-white uppercase italic tracking-widest">Identity & Language</h3>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Country</label>
                            <select
                                value={userCountry}
                                onChange={e => setUserCountry(e.target.value)}
                                className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-[11px] outline-none focus:border-cyan-500 transition-colors"
                            >
                                <option value="Thailand" className="text-black">🇹🇭 Thailand</option>
                                <option value="USA" className="text-black">🇺🇸 USA</option>
                                <option value="Japan" className="text-black">🇯🇵 Japan</option>
                                <option value="UK" className="text-black">🇬🇧 United Kingdom</option>
                                <option value="Other" className="text-black">🌍 Other</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Language</label>
                            <div className="flex gap-2">
                                {(['en', 'th'] as const).map(lang => (
                                    <button
                                        key={lang}
                                        onClick={() => setPreferredLanguage(lang)}
                                        className={`flex-1 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border ${preferredLanguage === lang ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-white/5 text-zinc-500 border-white/5 hover:border-white/10'}`}
                                    >
                                        {lang === 'en' ? 'English' : 'ภาษาไทย'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Instrument</label>
                            <select
                                value={userInstrument}
                                onChange={e => setUserInstrument(e.target.value)}
                                className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-white text-[11px] outline-none focus:border-cyan-500 transition-colors"
                            >
                                <option value="" disabled className="text-black">Choose...</option>
                                <option value="Piano" className="text-black">🎹 Piano / Keyboard</option>
                                <option value="Guitar" className="text-black">🎸 Guitar</option>
                                <option value="Bass" className="text-black">🎸 Bass</option>
                                <option value="Drums" className="text-black">🥁 Drums</option>
                                <option value="Vocals" className="text-black">🎤 Vocals</option>
                                <option value="Violin" className="text-black">🎻 Violin / Strings</option>
                                <option value="Saxophone" className="text-black">🎷 Saxophone</option>
                                <option value="Other" className="text-black">🎵 Other</option>
                            </select>
                        </div>
                    </div>

                    {/* ── AI FUEL METER ── */}
                    <div className="bg-black/40 border border-white/5 rounded-3xl p-5 flex items-center gap-6">
                        <div
                            className="relative w-20 h-20 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: `conic-gradient(#00e5ff ${usagePercent}%, rgba(255,255,255,0.05) 0%)` }}
                        >
                            <div className="absolute inset-1.5 bg-[#050507] rounded-full flex flex-col items-center justify-center">
                                <span className="text-base font-black text-white">{Math.round(100 - usagePercent)}%</span>
                                <span className="text-[5px] font-black text-zinc-600 uppercase tracking-widest">FUEL</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-[9px] font-black text-white uppercase italic tracking-widest flex items-center gap-1.5 mb-2">
                                <Cpu size={12} className="text-cyan-400" /> Neural Performance
                            </h3>
                            <div className="space-y-1.5">
                                <div className="bg-black/40 rounded-xl px-3 py-2 flex justify-between items-center">
                                    <span className="text-[7px] text-zinc-600 uppercase">Vocal Tokens</span>
                                    <span className="text-[9px] font-black text-white">{stats?.spentVocal.toLocaleString() || 0}</span>
                                </div>
                                <div className="bg-black/40 rounded-xl px-3 py-2 flex justify-between items-center">
                                    <span className="text-[7px] text-zinc-600 uppercase">AI Logic</span>
                                    <span className="text-[9px] font-black text-white">{stats?.spentNimo.toLocaleString() || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
