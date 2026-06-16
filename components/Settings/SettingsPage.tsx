import React, { useState } from 'react';
import * as Tone from 'tone';
import { Settings2, Volume2, Cpu, Mic, Activity, Keyboard, MonitorSpeaker, Command, Monitor, Zap, Bot, Play, Sparkles, Lock, Key, Copy, Check } from 'lucide-react';
import VocalidoTrainingCard from './VocalidoTrainingCard';
import CreditsCard from './CreditsCard';
import OpenSourceCreditsCard from './OpenSourceCreditsCard';
import AudioEngineSettings from './AudioEngineSettings';
import OMRSettingsCard from './OMRSettingsCard';
import { encryptString } from '../../lib/NimoBrain';

interface SettingsPageProps {
    onBack?: () => void;
    performanceMode: boolean;
    onTogglePerformanceMode: (enabled: boolean) => void;
    nimoEnabled: boolean;
    onToggleNimoEnabled: (enabled: boolean) => void;
    nimoVoice: 'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man';
    onChangeNimoVoice: (voice: 'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man') => void;
    vocalidoAutoRender: boolean;
    onToggleVocalidoAutoRender: (enabled: boolean) => void;
    renderCardStyle?: 'compact' | 'large';
    onSelectRenderCardStyle?: (style: 'compact' | 'large') => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, performanceMode, onTogglePerformanceMode, nimoEnabled, onToggleNimoEnabled, nimoVoice, onChangeNimoVoice, vocalidoAutoRender, onToggleVocalidoAutoRender, renderCardStyle = 'compact', onSelectRenderCardStyle }) => {
    const [activeTab, setActiveTab] = useState<'audio' | 'midi' | 'shortcuts' | 'visual' | 'ai'>('audio');

    // Audio Settings State
    const [audioInput, setAudioInput] = useState('default');
    const [audioOutput, setAudioOutput] = useState('default');
    const [sampleRate, setSampleRate] = useState('auto');
    const [bufferSize, setBufferSize] = useState('256');

    // Remote Passcode & Command Encrypter State
    const [passcode, setPasscode] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.localStorage.getItem('nimo_remote_passcode') || 'paisan123';
        }
        return 'paisan123';
    });
    const [actionToEncrypt, setActionToEncrypt] = useState('');
    const [passcodeToEncrypt, setPasscodeToEncrypt] = useState(passcode);
    const [encryptedResult, setEncryptedResult] = useState('');
    const [copied, setCopied] = useState(false);

    const handleSavePasscode = (newPasscode: string) => {
        setPasscode(newPasscode);
        setPasscodeToEncrypt(newPasscode);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('nimo_remote_passcode', newPasscode);
        }
    };

    const handleEncrypt = () => {
        if (!actionToEncrypt) return;
        const cipher = encryptString(actionToEncrypt, passcodeToEncrypt);
        setEncryptedResult(`paisan:enc:${cipher}`);
        setCopied(false);
    };

    const handleCopy = () => {
        if (!encryptedResult) return;
        navigator.clipboard.writeText(encryptedResult);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const PRESETS = [
        { label: 'เล่นเพลง (Play)', value: 'play' },
        { label: 'หยุดชั่วคราว (Pause)', value: 'pause' },
        { label: 'หน้าเล่นเพลง (View Player)', value: 'navigate_to_page?view=player' },
        { label: 'หน้าแต่งเพลง (View Forge)', value: 'navigate_to_page?view=forge' },
        { label: 'เพิ่มความเร็ว (Tempo 140)', value: 'set_tempo?tempo=140' },
        { label: 'ปรับเสียง (Volume 80%)', value: 'set_volume?volume=0.8' },
    ];

    // Dynamic Device Lists
    const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);
    const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');

    const refreshDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setDeviceList(devices);

            // Check if we have labels (meaning permission granted)
            if (devices.some(d => d.label !== "")) {
                setPermissionStatus('granted');
            } else {
                // Proactive check for already granted permissions
                if (navigator.permissions && (navigator.permissions as any).query) {
                    try {
                        const result = await navigator.permissions.query({ name: 'microphone' as any });
                        if (result.state === 'granted') {
                            setPermissionStatus('granted');
                            const updated = await navigator.mediaDevices.enumerateDevices();
                            setDeviceList(updated);
                        } else {
                            setPermissionStatus(result.state);
                        }
                    } catch (e) { /* fallback if query fails */ }
                }
            }
        } catch (err) {
            console.error("Device Enum Error:", err);
        }
    };

    const requestPermission = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            setPermissionStatus('granted');
            await refreshDevices();
        } catch (err) {
            setPermissionStatus('denied');
            console.error("Permission Denied:", err);
        }
    };

    React.useEffect(() => {
        // Initial auto-scan on mount
        refreshDevices();

        // Auto-scan on hardware change (USB/HDMI)
        navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    }, []);

    const inputDevices = deviceList.filter(d => d.kind === 'audioinput');
    const outputDevices = deviceList.filter(d => d.kind === 'audiooutput');

    // MIDI Settings State
    const [midiInput, setMidiInput] = useState('all');

    return (
        <div className="w-full h-full bg-black text-white p-4 md:p-8 flex flex-col pt-[20px] pb-8 overflow-hidden">
            <div className="max-w-4xl mx-auto w-full relative z-10 flex-col flex h-full overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30">
                        <Settings2 className="text-cyan-400" size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">
                            System Setup
                        </h1>
                        <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">Configure your creative environment</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-[#0a0a0f] p-1 rounded-2xl border border-white/5 mb-8 overflow-x-auto no-scrollbar shrink-0">
                    {[
                        { id: 'audio', label: 'Audio Engine', icon: Volume2 },
                        { id: 'midi', label: 'MIDI Devices', icon: Activity },
                        { id: 'visual', label: 'Visuals', icon: Monitor },
                        { id: 'ai', label: 'AI Assistant', icon: Bot },
                        { id: 'shortcuts', label: 'Key Commands', icon: Keyboard },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            id={`tab-${tab.id}`}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                                : 'text-zinc-500 hover:text-white hover:bg-white/5 border border-transparent'
                                }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-[#0a0a0f]/80 backdrop-blur-xl rounded-3xl border border-white/5 p-6 md:p-10 shadow-2xl relative overflow-y-auto custom-scrollbar">
                    {/* Subtle glow effect */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

                    {activeTab === 'audio' && (
                        <div className="space-y-8 relative z-10">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-[28px] mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                                        <MonitorSpeaker size={24} className="text-cyan-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-black uppercase tracking-widest text-white">Device Connectivity</h2>
                                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
                                            {permissionStatus === 'granted'
                                                ? "All hardware identified and ready for use"
                                                : "Browser is protecting device names (Privacy Mode)"}
                                        </p>
                                    </div>
                                </div>
                                {permissionStatus !== 'granted' ? (
                                    <button
                                        onClick={requestPermission}
                                        className="px-6 py-2.5 bg-cyan-400 text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-95"
                                    >
                                        Unlock Device Names
                                    </button>
                                ) : (
                                    <button
                                        onClick={refreshDevices}
                                        className="px-6 py-2.5 bg-white/5 border border-white/10 text-zinc-300 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-white/10 transition-all"
                                    >
                                        Re-Scan Hardware
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="group space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500/70 ml-1 flex items-center gap-2">
                                        <Mic size={12} /> Audio Input
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={audioInput}
                                            onChange={e => setAudioInput(e.target.value)}
                                            className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all appearance-none cursor-pointer hover:bg-white/[0.02]"
                                        >
                                            <option value="default">System Default Input</option>
                                            {inputDevices.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Unknown Input (${d.deviceId.slice(0, 5)}...)`}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
                                            <Monitor size={14} />
                                        </div>
                                    </div>
                                </div>

                                <div className="group space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500/70 ml-1 flex items-center gap-2">
                                        <Volume2 size={12} /> Audio Output
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={audioOutput}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setAudioOutput(val);
                                                if ((Tone.getContext().rawContext as any).setSinkId) {
                                                    (Tone.getContext().rawContext as any).setSinkId(val === 'default' ? '' : val);
                                                }
                                            }}
                                            className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all appearance-none cursor-pointer hover:bg-white/[0.02]"
                                        >
                                            <option value="default">System Default Output</option>
                                            {outputDevices.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Unknown Output (${d.deviceId.slice(0, 5)}...)`}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
                                            <MonitorSpeaker size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {permissionStatus !== 'granted' && (
                                <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-4 leading-relaxed bg-black/40 p-4 rounded-2xl border border-white/5 italic">
                                    <strong className="text-zinc-400 not-italic mr-1">Pro Tip:</strong>
                                    To see device names (like "Apple TV" or "HDMI"), click "Unlock Device Names". This allows the browser to identify your hardware.
                                </p>
                            )}

                            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />

                            <h2 className="text-lg font-black uppercase tracking-widest text-zinc-300 flex items-center gap-3">
                                <Cpu size={20} className="text-cyan-400" /> Engine Quality
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Sample Rate</label>
                                    <select
                                        value={sampleRate}
                                        onChange={e => setSampleRate(e.target.value)}
                                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                                    >
                                        <option value="auto">Auto (System Default)</option>
                                        <option value="44100">44.1 kHz (CD Quality)</option>
                                        <option value="48000">48.0 kHz (Studio Default)</option>
                                        <option value="96000">96.0 kHz (High-Res)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Bit Depth</label>
                                    <select disabled className="w-full bg-black border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-600 appearance-none opacity-50 cursor-not-allowed">
                                        <option>32-bit float (Engine Default)</option>
                                    </select>
                                    <p className="text-[9px] text-zinc-600 mt-2 uppercase tracking-wide">Fixed internal processing resolution</p>
                                </div>
                            </div>

                            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />

                            <h2 className="text-lg font-black uppercase tracking-widest text-zinc-300 flex items-center gap-3">
                                <Activity size={20} className="text-cyan-400" /> Performance
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Audio Buffer Size</label>
                                    <select
                                        value={bufferSize}
                                        onChange={e => setBufferSize(e.target.value)}
                                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                                    >
                                        <option value="64">64 Samples (Lowest Latency)</option>
                                        <option value="128">128 Samples</option>
                                        <option value="256">256 Samples (Recommended)</option>
                                        <option value="512">512 Samples</option>
                                        <option value="1024">1024 Samples (Safest for CPU)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Estimated Latency</label>
                                    <div className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-cyan-400 font-mono flex items-center justify-between">
                                        <span>Round-trip:</span>
                                        <span className="font-bold">
                                            {bufferSize === '64' ? '~2.9ms' :
                                                bufferSize === '128' ? '~5.8ms' :
                                                    bufferSize === '256' ? '~11.6ms' :
                                                        bufferSize === '512' ? '~23.2ms' : '~46.4ms'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8" />

                            <h2 className="text-lg font-black uppercase tracking-widest text-zinc-300 flex items-center gap-3 mb-4">
                                <Zap size={20} className="text-orange-400" /> Cache & Data Management
                            </h2>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-6 leading-relaxed">
                                Clear cached data to ensure you're using the latest version. Use after app updates or if audio sounds incorrect.
                            </p>

                            <div className="space-y-4">
                                {/* Clear Render History */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 bg-black/40 border border-white/5 rounded-2xl">
                                    <div className="flex-1">
                                        <h3 className="text-xs font-bold text-white mb-1">Clear Vocal Render Cache</h3>
                                        <p className="text-[9px] text-zinc-500 leading-relaxed">Remove all cached vocal renders. You'll need to re-render songs after clearing.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const keys = Object.keys(localStorage);
                                            let count = 0;
                                            keys.forEach(k => {
                                                if (k.startsWith('memo_render_history_') || 
                                                    k.startsWith('active_render_key_') ||
                                                    k.startsWith('vocalido_render_cache_') ||
                                                    k.startsWith('audio_blob_cache_')) {
                                                    localStorage.removeItem(k);
                                                    count++;
                                                }
                                            });
                                            // Clear IndexedDB audio cache
                                            try {
                                                indexedDB.deleteDatabase('memolody_audio_cache');
                                            } catch (e) {}
                                            alert(`✅ Cleared ${count} render cache entries + audio blob cache`);
                                        }}
                                        className="px-5 py-2.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500/20 transition-all active:scale-95 whitespace-nowrap"
                                    >
                                        Clear Renders
                                    </button>
                                </div>

                                {/* Clear All App Data */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 bg-black/40 border border-white/5 rounded-2xl">
                                    <div className="flex-1">
                                        <h3 className="text-xs font-bold text-white mb-1">Clear All App Data & Reload</h3>
                                        <p className="text-[9px] text-zinc-500 leading-relaxed">
                                            Full reset: clears ALL localStorage, IndexedDB, and browser cache. The app will reload with a clean state.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (!confirm('⚠️ This will clear ALL app data including settings, render history, and cached audio. The app will reload.\n\nContinue?')) return;
                                            
                                            // 1. Clear localStorage
                                            localStorage.clear();
                                            
                                            // 2. Clear all IndexedDB databases
                                            try {
                                                indexedDB.deleteDatabase('memolody_audio_cache');
                                                indexedDB.deleteDatabase('keyval-store');
                                            } catch (e) {}
                                            
                                            // 3. Unregister service workers
                                            if ('serviceWorker' in navigator) {
                                                navigator.serviceWorker.getRegistrations().then(regs => {
                                                    regs.forEach(reg => reg.unregister());
                                                });
                                            }
                                            
                                            // 4. Clear caches API
                                            if ('caches' in window) {
                                                caches.keys().then(names => {
                                                    names.forEach(name => caches.delete(name));
                                                });
                                            }
                                            
                                            // 5. Force hard reload after short delay
                                            setTimeout(() => {
                                                window.location.href = window.location.origin + '?cache_bust=' + Date.now();
                                            }, 500);
                                        }}
                                        className="px-5 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-500/20 transition-all active:scale-95 whitespace-nowrap"
                                    >
                                        Full Reset & Reload
                                    </button>
                                </div>

                                {/* App Version Info */}
                                <div className="p-4 bg-black/20 border border-white/5 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">App Build</span>
                                    </div>
                                    <span className="text-[10px] text-zinc-400 font-mono">{new Date().toISOString().split('T')[0]} · v2.4</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'visual' && (
                        <div className="space-y-8 relative z-10 animate-fade-in">
                            <h2 className="text-lg font-black uppercase tracking-widest text-zinc-300 flex items-center gap-3">
                                <Monitor size={20} className="text-cyan-400" /> Visual Engine
                            </h2>

                            <div className="flex flex-col gap-6">
                                <div className={`p-6 rounded-[28px] border transition-all ${performanceMode ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-white/5 border-white/10'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Zap size={16} className={performanceMode ? 'text-cyan-400' : 'text-zinc-500'} />
                                                <h3 className="text-sm font-black uppercase tracking-widest text-white">Performance Mode</h3>
                                            </div>
                                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">
                                                {performanceMode
                                                    ? "Mobile optimization active: Blur effects disabled, simplified animations, and power-saving UI."
                                                    : "Normal mode: Full visual fidelity with glassmorphism and real-time animations."}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onTogglePerformanceMode(!performanceMode)}
                                            className={`relative w-14 h-7 rounded-full transition-all flex items-center p-1 ${performanceMode ? 'bg-cyan-500' : 'bg-white/10'}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform transition-transform ${performanceMode ? 'translate-x-7' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-5 border border-white/5 rounded-2xl bg-black/40">
                                        <h4 className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-3">UI Effects</h4>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between opacity-50">
                                                <span className="text-[10px] uppercase font-bold">Backdrop Blur</span>
                                                <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{performanceMode ? 'OFF' : 'ON'}</span>
                                            </div>
                                            <div className="flex items-center justify-between opacity-50">
                                                <span className="text-[10px] uppercase font-bold">Glassmorphism</span>
                                                <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{performanceMode ? 'OFF' : 'ON'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-5 border border-white/5 rounded-2xl bg-black/40">
                                        <h4 className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-3">Score Engine</h4>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between opacity-50">
                                                <span className="text-[10px] uppercase font-bold">Real-time Laser Tail</span>
                                                <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{performanceMode ? 'SIMPLIFIED' : 'HIGH-RES'}</span>
                                            </div>
                                            <div className="flex items-center justify-between opacity-50">
                                                <span className="text-[10px] uppercase font-bold">Note Glow Effect</span>
                                                <span className="text-[8px] uppercase font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{performanceMode ? 'SUBTLE' : 'VIVID'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-[10px] text-zinc-600 uppercase tracking-widest leading-relaxed italic bg-white/5 p-4 rounded-xl border border-white/5">
                                    <strong className="text-cyan-400/80 not-italic mr-1">Mobile Note:</strong>
                                    If you experience stuttering playback or slow loading on mid-range devices (e.g. nubia, Moto, Pixel a-series), we strongly recommend enabling Performance Mode.
                                </p>

                                <div className="p-6 rounded-[24px] bg-black/40 border border-white/5 space-y-5">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                                        <Cpu size={14} className="text-cyan-400" />
                                        System Requirements (ความต้องการระบบ)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <h4 className="text-[9px] font-black uppercase tracking-wider text-cyan-400/80 flex items-center gap-1.5">
                                                <Cpu size={12} /> Minimum Specs (ความต้องการขั้นต่ำ)
                                            </h4>
                                            <ul className="text-[10px] text-zinc-400 space-y-1.5 list-disc pl-4 uppercase tracking-wider leading-relaxed">
                                                <li><strong>PC/Mac:</strong> Intel Core i5 / Apple M1, RAM 8GB ขึ้นไป, Chrome/Edge/Safari (รุ่นล่าสุด)</li>
                                                <li><strong>Mobile:</strong> iOS 16 (iPhone 12 ขึ้นไป) หรือ Android 11 (RAM 6GB ขึ้นไป)</li>
                                                <li><strong>SVS Rendering:</strong> แนะนำให้ใช้โหมด <strong>Server-Side (Vocalido)</strong> เพื่อความเสถียร</li>
                                            </ul>
                                        </div>
                                        <div className="space-y-3">
                                            <h4 className="text-[9px] font-black uppercase tracking-wider text-amber-400/80 flex items-center gap-1.5">
                                                <Zap size={12} /> Recommended Specs (ข้อแนะนำเพื่อประสิทธิภาพสูงสุด)
                                            </h4>
                                            <ul className="text-[10px] text-zinc-400 space-y-1.5 list-disc pl-4 uppercase tracking-wider leading-relaxed">
                                                <li><strong>PC/Mac:</strong> Intel Core i7 / Apple Silicon M2, RAM 16GB ขึ้นไป, GPU แยก (Nvidia GTX 1660 / AMD RX 5500 ขึ้นไป)</li>
                                                <li><strong>Mobile:</strong> iPhone 14 ขึ้นไป หรือ Android ระดับเรือธง (RAM 8GB/12GB ขึ้นไป)</li>
                                                <li><strong>SVS Rendering:</strong> รองรับการใช้ <strong>On-Device (Browser AI SVS)</strong> ประมวลผลด่วนบนเครื่อง</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'midi' && (
                        <div className="space-y-8 relative z-10">
                            <h2 className="text-lg font-black uppercase tracking-widest text-zinc-300 flex items-center gap-3">
                                <Keyboard size={20} className="text-cyan-400" /> MIDI Inputs
                            </h2>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Available Devices</label>
                                <select
                                    value={midiInput}
                                    onChange={e => setMidiInput(e.target.value)}
                                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                                >
                                    <option value="all">Listen to ALL connected devices (Omni)</option>
                                    <option value="none">None (Disabled)</option>
                                </select>
                                <p className="text-[10px] text-zinc-500 mt-4 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                                    <strong className="text-cyan-400">Note:</strong> Memolody AI Studio automatically detects connected USB MIDI keyboards. Ensure your device is connected before launching the browser. Chrome/Edge natively supports Web MIDI API.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'shortcuts' && (
                        <div className="space-y-6 relative z-10 w-full h-full flex flex-col">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-black uppercase tracking-widest text-zinc-300 flex items-center gap-3">
                                    <Command size={20} className="text-cyan-400" /> Key Commands
                                </h2>
                                <div className="flex gap-2">
                                    <div className="px-3 py-1 bg-white/10 text-[9px] font-black tracking-widest uppercase rounded-lg border border-white/10">Mac</div>
                                    <div className="px-3 py-1 bg-transparent text-zinc-500 text-[9px] font-black tracking-widest uppercase rounded-lg border border-transparent">Win</div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto pr-2 custom-scrollbar space-y-2">
                                {[
                                    { action: 'Play / Pause', keys: ['Space'] },
                                    { action: 'Return to Start', keys: ['Return'] },
                                    { action: 'Zoom In', keys: ['⌘', '↑', 'or', '→'] },
                                    { action: 'Zoom Out', keys: ['⌘', '↓', 'or', '←'] },
                                    { action: 'Save Project', keys: ['⌘', 'S'] },
                                    { action: 'Undo', keys: ['⌘', 'Z'] },
                                    { action: 'Redo', keys: ['⌘', '⇧', 'Z'] },
                                    { action: 'Delete Selected Note', keys: ['⌫'] },
                                    { action: 'Select All', keys: ['⌘', 'A'] },
                                    { action: 'Copy', keys: ['⌘', 'C'] },
                                    { action: 'Paste', keys: ['⌘', 'V'] },
                                    { action: 'Toggle Loop', keys: ['L'] },
                                ].map((sc, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                        <span className="text-sm font-medium text-zinc-300">{sc.action}</span>
                                        <div className="flex items-center gap-1.5">
                                            {sc.keys.map((k, j) => (
                                                <span key={j} className={`
                          ${k === 'or' ? 'text-zinc-600 text-[10px] px-1 font-black uppercase mx-1' : 'px-2 py-1 bg-white/10 border border-white/20 rounded shadow-sm text-xs font-mono text-zinc-200 min-w-[24px] text-center'}
                        `}>
                                                    {k}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'ai' && (
                        <div className="space-y-8 relative z-10 animate-fade-in">
                            <h2 className="text-lg font-black uppercase tracking-widest text-zinc-300 flex items-center gap-3">
                                <Bot size={20} className="text-cyan-400" /> Nimo AI Co-Pilot
                            </h2>

                            <div className="flex flex-col gap-6">
                {/* Audio AI Engine Settings moved to PlayerPage Vocalido Setup Modal */}
                                <div className={`p-6 rounded-[28px] border transition-all ${nimoEnabled ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-white/5 border-white/10'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Bot size={16} className={nimoEnabled ? 'text-cyan-400' : 'text-zinc-500'} />
                                                <h3 className="text-sm font-black uppercase tracking-widest text-white">Nimo AI Enabled</h3>
                                            </div>
                                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">
                                                {nimoEnabled
                                                    ? "Nimo is active and ready to assist you. Disabling this will remove Nimo from the interface entirely."
                                                    : "Nimo is currently disabled. Toggle to enable AI musical assistance."}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onToggleNimoEnabled(!nimoEnabled)}
                                            className={`relative w-14 h-7 rounded-full transition-all flex items-center p-1 ${nimoEnabled ? 'bg-cyan-500' : 'bg-white/10'}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform transition-transform ${nimoEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className={`p-6 rounded-[28px] border transition-all ${vocalidoAutoRender ? 'bg-rose-500/10 border-rose-500/30' : 'bg-white/5 border-white/10'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Mic size={16} className={vocalidoAutoRender ? 'text-rose-400' : 'text-zinc-500'} />
                                                <h3 className="text-sm font-black uppercase tracking-widest text-white">Vocalido Auto-Render</h3>
                                            </div>
                                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">
                                                {vocalidoAutoRender
                                                    ? "AI will automatically render singing voices when a song is loaded. This may take a few seconds."
                                                    : "Manual Vocal Synthesis: You must trigger rendering from the Voice Studio."}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onToggleVocalidoAutoRender(!vocalidoAutoRender)}
                                            className={`relative w-14 h-7 rounded-full transition-all flex items-center p-1 ${vocalidoAutoRender ? 'bg-rose-500' : 'bg-white/10'}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform transition-transform ${vocalidoAutoRender ? 'translate-x-7' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>

                                <div className={`transition-all duration-300 ${!nimoEnabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Vocalido Render Card Style</label>
                                    <select
                                        value={renderCardStyle}
                                        onChange={e => onSelectRenderCardStyle?.(e.target.value as any)}
                                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                                    >
                                        <option value="compact">แบบกะทัดรัด (Compact Floating Card)</option>
                                        <option value="large">แบบดั้งเดิม (Large Classic Modal)</option>
                                    </select>
                                </div>

                                {/* ── Vocalido DiffSinger Training Status ── */}
                                <VocalidoTrainingCard />
                <CreditsCard />
                <OpenSourceCreditsCard />

                                <div className={`transition-all duration-300 ${!nimoEnabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Voice Identity & Personality</label>
                                    <select
                                        value={nimoVoice}
                                        onChange={e => onChangeNimoVoice(e.target.value as any)}
                                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                                    >
                                        <option value="teen_girl">วัยรุ่นหญิง (Teen Girl - สดใส ร่าเริง)</option>
                                        <option value="adult_woman">ผู้ใหญ่หญิง (Adult Woman - สุขุม มืออาชีพ)</option>
                                        <option value="teen_boy">วัยรุ่นชาย (Teen Boy - เป็นกันเอง สนุกสนาน)</option>
                                        <option value="adult_man">ผู้ชายผู้ใหญ่ (Adult Man - เป็นทางการ มั่นคง)</option>
                                    </select>

                                    <button
                                        onClick={() => {
                                            if ('speechSynthesis' in window) {
                                                window.speechSynthesis.cancel();
                                                let text = '';
                                                let pitch = 1.0;
                                                let rate = 1.0;
                                                let voiceTypeSearch = '';
                                                let fallbackSearch = '';

                                                switch (nimoVoice) {
                                                    case 'teen_girl':
                                                        text = "สวัสดีค่ะ Nimo พร้อมช่วยแล้วค่ะ";
                                                        pitch = 1.3; rate = 1.05; voiceTypeSearch = 'Female'; fallbackSearch = 'หญิง';
                                                        break;
                                                    case 'adult_woman':
                                                        text = "สวัสดีค่ะ ผู้ช่วยอัจฉริยะพร้อมให้บริการค่ะ";
                                                        pitch = 1.0; rate = 0.95; voiceTypeSearch = 'Female'; fallbackSearch = 'หญิง';
                                                        break;
                                                    case 'teen_boy':
                                                        text = "สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ";
                                                        pitch = 1.2; rate = 1.05; voiceTypeSearch = 'Male'; fallbackSearch = 'ชาย';
                                                        break;
                                                    case 'adult_man':
                                                        text = "สวัสดีครับ ระบบ AI พร้อมให้คำแนะนำครับ";
                                                        pitch = 0.9; rate = 0.95; voiceTypeSearch = 'Male'; fallbackSearch = 'ชาย';
                                                        break;
                                                }
                                                const utterance = new SpeechSynthesisUtterance(text);
                                                utterance.lang = 'th-TH';
                                                utterance.pitch = pitch;
                                                utterance.rate = rate;

                                                const voices = window.speechSynthesis.getVoices();
                                                let thaiVoice = voices.find(v => v.lang.includes('th') && (v.name.includes(voiceTypeSearch) || v.name.includes(fallbackSearch)));
                                                if (!thaiVoice) thaiVoice = voices.find(v => v.lang.includes('th'));
                                                if (thaiVoice) utterance.voice = thaiVoice;
                                                window.speechSynthesis.speak(utterance);
                                            }
                                        }}
                                        className="mt-4 px-6 py-2.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-cyan-500 hover:text-black transition-all shadow-[0_0_20px_rgba(6,182,212,0.1)] flex items-center justify-center gap-2 w-full sm:w-auto"
                                    >
                                        <Play size={12} /> Test Voice Sample
                                    </button>
                                </div>
                            </div>

                            {/* OMR Score Scanner */}
                            <div className="mt-8">
                                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4 flex items-center gap-2">
                                    <span>🎼 OMR Score Scanner</span>
                                    <div className="h-px flex-1 bg-zinc-800" />
                                </div>
                                <OMRSettingsCard />
                            </div>

                            {/* ── Nimo Remote Control & Security ── */}
                            <div className="mt-12 p-6 rounded-[28px] bg-gradient-to-br from-zinc-950/80 via-black/90 to-zinc-950/80 border border-cyan-500/20 hover:border-cyan-500/40 transition-all shadow-[0_0_30px_rgba(6,182,212,0.05)] relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none group-hover:bg-cyan-500/10 transition-all" />
                                
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                                        <Lock size={18} className="text-cyan-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest text-white italic">Nimo Remote Control & Security</h3>
                                        <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">ระบบควบคุมระยะไกลและการเข้าถึงพิเศษสำหรับคุณ paisan</p>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Polling Active</span>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Passcode input */}
                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 block flex items-center gap-2">
                                            <Key size={12} className="text-cyan-400" />
                                            รหัสผ่านลับควบคุม (Passcode)
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={passcode} 
                                                onChange={(e) => handleSavePasscode(e.target.value)}
                                                placeholder="ใส่รหัสผ่านลับ เช่น paisan123..."
                                                className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/50 transition-all font-mono tracking-widest"
                                            />
                                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                        </div>
                                        <p className="text-[8px] text-zinc-500 uppercase tracking-wider mt-2">
                                            บันทึกอัตโนมัติลงใน LocalStorage (ใช้สำหรับสั่งการผ่านช่องแชทด้วยคำนำหน้า <span className="text-zinc-300 font-mono">paisan:&lt;รหัส&gt;:&lt;คำสั่ง&gt;</span> หรือควบคุมผ่าน API ระยะไกล)
                                        </p>
                                    </div>

                                    {/* Encrypter Utility */}
                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
                                        <div>
                                            <h4 className="text-xs font-black uppercase tracking-widest text-zinc-300">Command Encrypter Utility</h4>
                                            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1">เครื่องมือช่วยเข้ารหัสคำสั่ง (XOR + Base64) สำหรับใช้เป็นคำสั่งลับลับสุดยอด</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-[8px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">คำสั่งระบบ (Action String)</label>
                                                    <input 
                                                        type="text" 
                                                        value={actionToEncrypt}
                                                        onChange={(e) => setActionToEncrypt(e.target.value)}
                                                        placeholder="เช่น play, pause, navigate_to_page?view=forge"
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-[8px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">รหัสผ่านที่ใช้เข้ารหัส (Encryption Passcode)</label>
                                                    <input 
                                                        type="text" 
                                                        value={passcodeToEncrypt}
                                                        onChange={(e) => setPasscodeToEncrypt(e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-cyan-500/50 transition-all font-mono tracking-widest"
                                                    />
                                                </div>

                                                <button
                                                    onClick={handleEncrypt}
                                                    disabled={!actionToEncrypt}
                                                    className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 disabled:from-cyan-500/20 disabled:to-blue-500/20 text-black disabled:text-zinc-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer border-0"
                                                >
                                                    <Lock size={12} /> เข้ารหัสคำสั่ง (Encrypt Action)
                                                </button>
                                            </div>

                                            <div className="flex flex-col justify-between">
                                                <div className="flex-1 flex flex-col">
                                                    <label className="text-[8px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 block">ผลลัพธ์คำสั่งลับเข้ารหัส (Encrypted Output)</label>
                                                    <textarea 
                                                        readOnly
                                                        value={encryptedResult}
                                                        placeholder="ผลลัพธ์ที่แปลงแล้วจะแสดงที่นี่..."
                                                        className="flex-1 min-h-[80px] w-full bg-black/60 border border-white/10 rounded-xl p-3 text-[10px] text-zinc-300 font-mono focus:outline-none resize-none"
                                                    />
                                                </div>

                                                {encryptedResult && (
                                                    <button
                                                        onClick={handleCopy}
                                                        className={`mt-2 w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border transition-all ${copied ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'}`}
                                                    >
                                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                                        {copied ? 'คัดลอกสำเร็จ (Copied!)' : 'คัดลอกลงคลิปบอร์ด (Copy Command)'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Presets suggestions */}
                                        <div className="pt-2 border-t border-white/5">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">คลิกเพื่อเลือกคำสั่งด่วน (Preset Actions)</span>
                                            <div className="flex flex-wrap gap-2">
                                                {PRESETS.map((p, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setActionToEncrypt(p.value)}
                                                        className="px-2.5 py-1 bg-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-white/5 rounded-lg text-[9px] text-zinc-400 hover:text-cyan-400 transition-all font-mono cursor-pointer"
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── NEW: Neural Link Advanced Settings ── */}
                            <div className="mt-12 mb-12 border-t border-white/5 pt-12">
                                <div className="text-[10px] font-black uppercase tracking-widest text-cyan-500/50 mb-6 flex items-center gap-2">
                                    <span>🧠 Neural Link Advanced Config</span>
                                    <div className="h-px flex-1 bg-cyan-500/10" />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Zap size={16} className="text-cyan-400" />
                                            <span className="text-[11px] font-black uppercase tracking-widest text-white italic">Neural Processing Priority</span>
                                        </div>
                                        <p className="text-[9px] text-zinc-500 uppercase leading-relaxed mb-4">Allocation of local CPU resources for AI inference tasks.</p>
                                        <div className="flex gap-2">
                                            {['Energy Save', 'Balanced', 'Turbo'].map(mode => (
                                                <button key={mode} className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-tighter border ${mode === 'Balanced' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'border-white/5 text-zinc-600'}`}>
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Activity size={16} className="text-emerald-400" />
                                            <span className="text-[11px] font-black uppercase tracking-widest text-white italic">Real-time Analysis</span>
                                        </div>
                                        <p className="text-[9px] text-zinc-500 uppercase leading-relaxed mb-4">Nimo's reactivity speed to MIDI and audio input changes.</p>
                                        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
                                            <div className="w-4/5 h-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                        </div>
                                        <div className="flex justify-between items-center text-[7px] font-mono text-zinc-600 uppercase">
                                            <span>Low Latency</span>
                                            <span className="text-emerald-400">80ms Responsive</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Creative Exploration Policy */}
                                <div className="mt-4 p-6 rounded-[24px] bg-gradient-to-r from-cyan-500/5 to-purple-500/5 border border-white/5">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <div className="text-[11px] font-black uppercase tracking-widest text-white italic flex items-center gap-2">
                                                <Sparkles size={14} className="text-purple-400" />
                                                Creative Entropy (AI Temperature)
                                            </div>
                                            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1">Higher entropy results in more experimental chord and melody suggestions.</p>
                                        </div>
                                        <span className="text-xs font-mono text-purple-400 font-bold">0.82</span>
                                    </div>
                                    <input type="range" className="w-full accent-purple-500 h-1 rounded-full bg-zinc-800" />
                                </div>
                            </div>
                            
                            <div className="text-center py-12 opacity-30">
                                <div className="h-px w-24 bg-gradient-to-r from-transparent via-zinc-500 to-transparent mx-auto mb-4" />
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">End of AI Configuration</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
