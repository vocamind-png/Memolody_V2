
import React, { useEffect, useState } from 'react';
import { Mic, Zap, Cpu, Waves, ChevronRight, Play, Star, ShieldCheck } from 'lucide-react';

interface BrandingPageProps {
    onEnter: () => void;
    backgroundImage?: string;
}

const BrandingPage: React.FC<BrandingPageProps> = ({ onEnter, backgroundImage }) => {
    const [scrolled, setScrolled] = useState(false);
    const [showSpecs, setShowSpecs] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 100);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[#050507] text-white selection:bg-cyan-500 selection:text-black font-['Outfit'] overflow-x-hidden">
            {/* Immersive Hero */}
            <section className="relative h-screen flex flex-col items-center justify-center p-6 text-center overflow-hidden">
                {backgroundImage && (
                    <>
                        <img
                            src={backgroundImage}
                            className="absolute inset-0 w-full h-screen object-cover opacity-60 scale-105 blur-[2px] transition-transform duration-[60s] linear"
                            style={{ transform: 'scale(1.1) translateX(-5%)' }}
                            alt=""
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-transparent to-[#050507]/80" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#050507]/90 via-transparent to-[#050507]/90" />
                    </>
                )}

                <div className="relative z-10 max-w-4xl stagger-in space-y-8">
                    <div className="flex flex-col items-center gap-4">
                        <div className="px-5 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-3xl text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 floating shadow-[0_0_30px_rgba(0,229,255,0.2)]">
                            Music Practice Platform
                        </div>
                        <h1 className="text-6xl md:text-8xl font-black text-white italic uppercase tracking-tighter leading-none">
                            MEMO<span className="text-gradient">LODY</span>
                        </h1>
                        <div className="h-[2px] w-32 bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
                    </div>

                    <p className="text-2xl md:text-3xl font-black text-white/95 max-w-2xl mx-auto leading-snug italic tracking-tight"
                        style={{ textShadow: '0 0 40px rgba(0,229,255,0.35), 0 0 80px rgba(0,229,255,0.15)' }}>
                        Wisdom of Play by Ear,{' '}<span className="text-cyan-400">and Hear by Eye.</span>
                    </p>
                    <p className="text-base md:text-lg text-zinc-500 font-medium max-w-xl mx-auto leading-relaxed">
                        Revolutionizing music practice through <span className="text-white">Neural Intelligence</span> and the <span className="text-cyan-400">Kodály Method</span>.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
                        <button
                            onClick={onEnter}
                            className="group relative h-16 px-12 bg-white text-black rounded-full font-black text-sm uppercase tracking-[0.2em] transition-all hover:scale-110 active:scale-95 shadow-[0_20px_40px_rgba(255,255,255,0.2)]"
                        >
                            <div className="absolute inset-0 bg-cyan-400 rounded-full blur-[20px] opacity-0 group-hover:opacity-40 transition-opacity" />
                            <span className="relative flex items-center gap-3">
                                Launch Studio <ChevronRight size={18} strokeWidth={3} />
                            </span>
                        </button>

                        <button className="h-16 px-10 border border-white/10 bg-white/5 backdrop-blur-xl rounded-full font-black text-sm uppercase tracking-[0.2em] transition-all hover:bg-white/10 flex items-center gap-3">
                            <Play size={16} fill="currentColor" /> Watch Vision
                        </button>
                    </div>

                    <div className="pt-6">
                        <button 
                            onClick={() => setShowSpecs(!showSpecs)}
                            className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2 mx-auto"
                        >
                            <Cpu size={12} />
                            {showSpecs ? "Hide System Requirements (ซ่อนความต้องการระบบ)" : "Show System Requirements (แสดงความต้องการระบบ)"}
                        </button>
                        
                        {showSpecs && (
                            <div className="mt-6 max-w-xl mx-auto bg-black/60 backdrop-blur-3xl border border-white/10 p-6 rounded-[2rem] text-left space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-2.5 flex items-center gap-1.5">
                                        <Cpu size={12} /> Minimum Specifications (ความต้องการขั้นต่ำ)
                                    </h4>
                                    <ul className="text-[10px] text-zinc-400 space-y-1.5 list-disc pl-4 font-medium leading-relaxed uppercase tracking-wider">
                                        <li><strong>PC/Mac:</strong> Intel Core i5 / Apple Silicon M1, RAM 8GB ขึ้นไป, Chrome/Edge/Safari (รุ่นล่าสุด)</li>
                                        <li><strong>Mobile:</strong> iOS 16 (iPhone 12 ขึ้นไป) หรือ Android 11 (RAM 6GB ขึ้นไป)</li>
                                        <li><strong>SVS Vocal Rendering:</strong> แนะนำให้ใช้โหมด <strong>Server-Side (Vocalido)</strong> เพื่อความเสถียร</li>
                                    </ul>
                                </div>
                                <div className="h-px bg-white/10" />
                                <div>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2.5 flex items-center gap-1.5">
                                        <Zap size={12} /> Recommended Specifications (ข้อแนะนำเพื่อประสิทธิภาพสูงสุด)
                                    </h4>
                                    <ul className="text-[10px] text-zinc-400 space-y-1.5 list-disc pl-4 font-medium leading-relaxed uppercase tracking-wider">
                                        <li><strong>PC/Mac:</strong> Intel Core i7 / Apple Silicon M2, RAM 16GB ขึ้นไป, GPU แยก (Nvidia GTX 1660 / AMD RX 5500 ขึ้นไป)</li>
                                        <li><strong>Mobile:</strong> iPhone 14 ขึ้นไป หรือ Android ระดับเรือธง (RAM 8GB/12GB ขึ้นไป)</li>
                                        <li><strong>SVS Vocal Rendering:</strong> รองรับการใช้ <strong>On-Device (Browser AI SVS)</strong> ประมวลผลด่วนบนเครื่อง</li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-30">
                    <span className="text-[10px] font-black uppercase tracking-widest">Scroll to Explore</span>
                    <div className="w-[1px] h-12 bg-gradient-to-b from-cyan-500 to-transparent" />
                </div>
            </section>

            {/* Features Showcase */}
            <section className="max-w-7xl mx-auto px-6 py-32 space-y-40">

                {/* INTELLIGENT TUTORING */}
                <div className="grid md:grid-cols-2 gap-20 items-center">
                    <div className="space-y-8">
                        <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                            <Cpu size={32} />
                        </div>
                        <h2 className="text-5xl font-black italic uppercase tracking-tighter">
                            Neural <span className="text-cyan-400 underline decoration-cyan-500/50 underline-offset-8">Music AI</span>
                        </h2>
                        <p className="text-lg text-zinc-400 leading-relaxed">
                            Experience the power of studio-grade music intelligence. Nimo AI provides real-time guidance, analyzing your scores to apply Kodály-aware interval accuracy and musical theory insights exactly when you need them.
                        </p>
                        <ul className="space-y-4">
                            {[
                                'Intelligent score analysis',
                                ' Kodály-aware interval accuracy',
                                'Real-time theory guidance',
                                'Interactive AI music tutor'
                            ].map((text, i) => (
                                <li key={i} className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-zinc-500">
                                    <ShieldCheck size={16} className="text-cyan-500" /> {text}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="relative group">
                        <div className="absolute -inset-10 bg-cyan-500/20 blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                        <div className="glass-card relative overflow-hidden aspect-video flex items-center justify-center border-white/5">
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10" />
                            <Waves size={80} className="text-cyan-400 animate-pulse" />
                            <div className="absolute bottom-8 right-8 px-4 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest">
                                Processing Musical Logic...
                            </div>
                        </div>
                    </div>
                </div>

                {/* KODALY METHOD */}
                <div className="grid md:grid-cols-2 gap-20 items-center flex-row-reverse">
                    <div className="md:order-2 space-y-8">
                        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
                            <Star size={32} />
                        </div>
                        <h2 className="text-5xl font-black italic uppercase tracking-tighter">
                            The <span className="text-amber-400">Kodály Method</span> <br /> Mastered.
                        </h2>
                        <p className="text-lg text-zinc-400 leading-relaxed">
                            Play by Ear, Hear by Eye. Memolody applies the centuries-old method of relative solfège (Movable Do) to modern digital learning, training your inner ear to <span className="text-white">hear intervals visually</span> — the foundation of all true musicianship.
                        </p>
                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <div className="p-6 bg-white/5 border border-white/10 rounded-[32px] space-y-2">
                                <span className="text-2xl font-black text-white italic">0.01Hz</span>
                                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Pitch Precision</p>
                            </div>
                            <div className="p-6 bg-white/5 border border-white/10 rounded-[32px] space-y-2">
                                <span className="text-2xl font-black text-white italic">74+</span>
                                <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Neural Seeds</p>
                            </div>
                        </div>
                    </div>
                    <div className="md:order-1 glass-card p-12 aspect-[4/5] flex flex-col justify-between border-white/5">
                        <div className="space-y-1">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500">Neural Matrix</h4>
                            <div className="text-3xl font-black text-white italic uppercase">Vault of Creation</div>
                        </div>
                        <div className="space-y-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="h-12 bg-white/5 border border-white/5 rounded-2xl flex items-center px-4 gap-4 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
                                    <div className="w-8 h-8 rounded-lg bg-white/5" />
                                    <div className="flex-1 h-2 bg-white/10 rounded-full" />
                                    <Mic size={14} className="text-zinc-700" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer / CTA */}
            <section className="py-40 bg-gradient-to-t from-cyan-500/10 to-transparent flex flex-col items-center justify-center gap-12 text-center px-6">
                <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter max-w-2xl">
                    Wisdom of Play by Ear,<br /><span className="text-cyan-400">and Hear by Eye.</span>
                </h2>
                <button
                    onClick={onEnter}
                    className="h-20 px-16 bg-white text-black rounded-full font-black text-sm uppercase tracking-[0.3em] hover:scale-105 transition-all shadow-2xl active:scale-95"
                >
                    Enter Memolody Studio
                </button>

                <div className="flex items-center gap-12 pt-20">
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-2xl font-black">74+</span>
                        <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Available Tracks</span>
                    </div>
                    <div className="w-[1px] h-12 bg-white/10" />
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-2xl font-black">Kodály</span>
                        <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Validated Core</span>
                    </div>
                    <div className="w-[1px] h-12 bg-white/10" />
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-2xl font-black">GCS</span>
                        <span className="text-[8px] font-black uppercase text-zinc-500 tracking-widest">Secure Cloud Vault</span>
                    </div>
                </div>
            </section>

            <footer className="p-12 border-t border-white/5 text-center space-y-4">
                <div className="brand-text text-xl font-black text-white/20 italic tracking-[1em]">MEMOLODY</div>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">© 2026 Vocamind AI. All Neural Rights Reserved.</p>
            </footer>
        </div>
    );
};

export default BrandingPage;
