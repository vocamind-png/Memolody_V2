import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Mic, MicOff, X, MessageCircle } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';

interface Message {
    role: 'user' | 'nimo';
    content: string;
    timestamp: number;
}

interface FloatingNimoProps {
    isOpenProp?: boolean;
    setIsOpenProp?: (open: boolean) => void;
    voiceType?: 'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man';
    preferredLanguage?: 'th' | 'en';
}

export const FloatingNimo: React.FC<FloatingNimoProps> = ({
    isOpenProp,
    setIsOpenProp,
    voiceType = 'teen_girl',
    preferredLanguage = 'en',
}) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen;
    const setIsOpen = setIsOpenProp ?? setInternalOpen;

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [kbOffset, setKbOffset] = useState(0);    // keyboard height
    const [audioLevel, setAudioLevel] = useState<number[]>([3, 5, 3, 5, 3]); // waveform

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const nimoTsRef = useRef<number>(0);              // fix: track nimoTs across closure
    const waveTimerRef = useRef<any>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number>(0);

    // ── Welcome message ──
    useEffect(() => {
        setMessages([{
            role: 'nimo',
            content: preferredLanguage === 'en'
                ? "Hi! I'm Nimo 🎵 Ask me about music theory or how to use the app!"
                : "สวัสดีค่ะ! ถามเรื่องดนตรีหรือวิธีใช้แอพได้เลยนะคะ 🎵",
            timestamp: Date.now(),
        }]);
    }, [preferredLanguage]);

    // ── Auto-scroll ──
    useEffect(() => {
        setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 50);
    }, [messages, isTyping]);

    // ── Keyboard avoidance via visualViewport ──
    useEffect(() => {
        if (!isOpen) { setKbOffset(0); return; }
        const vv = window.visualViewport;
        if (!vv) return;
        const onVV = () => {
            const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
            setKbOffset(offset);
        };
        vv.addEventListener('resize', onVV);
        vv.addEventListener('scroll', onVV);
        onVV();
        return () => {
            vv.removeEventListener('resize', onVV);
            vv.removeEventListener('scroll', onVV);
        };
    }, [isOpen]);

    // ── Waveform animation when listening ──
    const startWaveform = useCallback(() => {
        waveTimerRef.current = setInterval(() => {
            setAudioLevel(analyserRef.current ? getRealLevels() : getFakeLevels());
        }, 80);
    }, []);

    const stopWaveform = useCallback(() => {
        clearInterval(waveTimerRef.current);
        setAudioLevel([3, 5, 3, 5, 3]);
    }, []);

    const getFakeLevels = () => Array.from({ length: 5 }, () => Math.random() * 28 + 4);
    const getRealLevels = () => {
        if (!analyserRef.current) return getFakeLevels();
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const step = Math.floor(data.length / 5);
        return Array.from({ length: 5 }, (_, i) => Math.max(3, (data[i * step] / 255) * 32));
    };

    // ── Mic / Speech recognition ──
    const stopMic = useCallback(() => {
        recognitionRef.current?.stop();
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {});
            audioCtxRef.current = null;
            analyserRef.current = null;
        }
        cancelAnimationFrame(animFrameRef.current);
        stopWaveform();
        setIsListening(false);
    }, [stopWaveform]);

    // Setup recognition — reinit when language changes
    useEffect(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        const rec = new SR();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = preferredLanguage === 'en' ? 'en-US' : 'th-TH';
        rec.onresult = (e: any) => {
            const t = e.results[0][0].transcript;
            setInput(t);
            // Send via ref so always latest handleSend
            handleSendFn(t);
            stopMic();
        };
        rec.onerror = () => stopMic();
        rec.onend = () => { if (isListening) stopMic(); };
        recognitionRef.current = rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preferredLanguage, stopMic]);

    const toggleListen = async () => {
        if (isListening) { stopMic(); return; }
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            alert(preferredLanguage === 'en'
                ? 'Use Chrome on Android for voice input.'
                : 'กรุณาใช้ Chrome บน Android สำหรับฟีเจอร์เสียงค่ะ');
            return;
        }
        try {
            // Get microphone stream for real waveform
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            analyserRef.current = analyser;
            ctx.createMediaStreamSource(stream).connect(analyser);
            recognitionRef.current?.start();
            setIsListening(true);
            startWaveform();
        } catch {
            // Fallback: start recognition without waveform (browser will ask permission)
            try {
                recognitionRef.current?.start();
                setIsListening(true);
                startWaveform();
            } catch { stopMic(); }
        }
    };

    // ── TTS ──
    const speak = useCallback((text: string) => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = preferredLanguage === 'en' ? 'en-US' : 'th-TH';
        utt.pitch = isMale ? 0.9 : 1.2;
        utt.rate = 1.0;
        window.speechSynthesis.speak(utt);
    }, [voiceType, preferredLanguage]);

    // ── Send to Gemini ──
    const handleSendFn = useCallback(async (textToProcess?: string) => {
        const userMsg = (textToProcess ?? input).trim();
        if (!userMsg) return;
        if (isTyping) return;

        setInput('');
        setIsTyping(true);
        window.speechSynthesis.cancel();

        const userTs = Date.now();
        const nimoTs = userTs + 1;
        nimoTsRef.current = nimoTs;  // store in ref for catch block

        setMessages(prev => [
            ...prev,
            { role: 'user', content: userMsg, timestamp: userTs },
            { role: 'nimo', content: '...', timestamp: nimoTs },
        ]);

        try {
            const apiKey = process.env.GEMINI_API_KEY || '';
            if (!apiKey) throw new Error('No API key configured');

            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const p = isMale ? 'ครับ' : 'ค่ะ';
            const sys = preferredLanguage === 'en'
                ? 'You are Nimo, a helpful AI music assistant for Memolody app. Reply in English. Short answers (2-3 sentences). No markdown.'
                : `คุณคือ Nimo ผู้ช่วย AI เรื่องดนตรีของแอพ Memolody ตอบภาษาไทย สั้น กระชับ ลงท้ายด้วย${p} ไม่ใช้ markdown`;

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent?alt=sse&key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: sys }] },
                        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                        generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
                    }),
                }
            );

            if (!res.ok) throw new Error(`Gemini ${res.status}`);
            const reader = res.body?.getReader();
            if (!reader) throw new Error('No reader');

            let full = '';
            const dec = new TextDecoder();
            const ts = nimoTsRef.current;

            outer: while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of dec.decode(value, { stream: true }).split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const s = line.slice(6).trim();
                    if (s === '[DONE]') break outer;
                    try {
                        const part = JSON.parse(s)?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                        if (part) {
                            full += part;
                            setMessages(prev => prev.map(m =>
                                m.timestamp === ts ? { ...m, content: full } : m
                            ));
                        }
                    } catch { /* malformed SSE chunk */ }
                }
            }
            if (!full) {
                const isMale2 = voiceType === 'teen_boy' || voiceType === 'adult_man';
                const p2 = isMale2 ? 'ครับ' : 'ค่ะ';
                full = preferredLanguage === 'en' ? 'Sorry, no response. Try again!' : `ขอโทษ${p2} ไม่ได้รับการตอบกลับนะ${p2}`;
            }
            speak(full);

        } catch (err) {
            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const p = isMale ? 'ครับ' : 'ค่ะ';
            const msg = preferredLanguage === 'en'
                ? 'Connection issue. Check your internet and try again.'
                : `เชื่อมต่อไม่ได้${p} ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่นะ${p}`;
            const ts = nimoTsRef.current;
            setMessages(prev => prev.map(m =>
                m.timestamp === ts ? { ...m, content: msg } : m
            ));
            console.error('[Nimo]', err);
        } finally {
            setIsTyping(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, isTyping, voiceType, preferredLanguage, speak]);

    // ── Drag (desktop only) ──
    const mobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const dragRef = useRef<{ sx: number; sy: number; ix: number; iy: number } | null>(null);
    useEffect(() => {
        setPos({ x: Math.max(0, window.innerWidth - 360), y: Math.max(80, window.innerHeight - 530) });
    }, []);

    const onPD = (e: React.PointerEvent) => {
        if (mobile || (e.target as HTMLElement).closest('.nimo-no-drag')) return;
        dragRef.current = { sx: e.clientX, sy: e.clientY, ix: pos.x, iy: pos.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onPM = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        setPos({ x: dragRef.current.ix + e.clientX - dragRef.current.sx, y: dragRef.current.iy + e.clientY - dragRef.current.sy });
    };
    const onPU = (e: React.PointerEvent) => {
        dragRef.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    // ── FAB when closed ──
    if (!isOpen) return (
        <button
            onClick={() => setIsOpen(true)}
            className="fixed z-[40000] bottom-20 right-4 w-14 h-14 bg-black border-2 border-cyan-500 rounded-full overflow-hidden flex items-center justify-center active:scale-95 transition-transform"
            style={{ boxShadow: '0 0 20px rgba(0,229,255,0.35)' }}
        >
            <img src={NIMO_IDENTITY_IMAGE} className="absolute inset-0 w-full h-full object-cover object-top opacity-60" alt="" />
            <MessageCircle className="text-white relative z-10" size={22} />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-cyan-400 rounded-full animate-ping opacity-75" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-cyan-500 rounded-full" />
        </button>
    );

    // ── Chat window ──
    return (
        <div
            className="fixed z-[40000] flex flex-col bg-[#0d0d0f] border border-white/8 shadow-2xl overflow-hidden"
            style={mobile ? {
                left: 0, right: 0, bottom: kbOffset,
                maxHeight: `calc(100dvh - 56px - ${kbOffset}px)`,
                minHeight: 320,
                borderRadius: '20px 20px 0 0',
                borderBottom: 'none',
            } : {
                width: 340, height: 520,
                left: pos.x, top: pos.y,
                borderRadius: 24,
                touchAction: 'none',
            }}
        >
            {/* Drag handle (mobile) */}
            {mobile && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/15 rounded-full z-10 pointer-events-none" />
            )}

            {/* Header */}
            <div
                className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/5"
                style={{ cursor: mobile ? 'default' : 'move' }}
                onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU}
            >
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-cyan-500/40 shrink-0">
                        <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover object-top" alt="Nimo" />
                    </div>
                    <div className="pointer-events-none">
                        <p className="text-white font-black italic uppercase text-xs tracking-tighter leading-none">NIMO AI</p>
                        <p className="text-cyan-400 text-[9px] font-bold">
                            {isListening ? '🎙 กำลังฟัง...' : isTyping ? '⟳ กำลังคิด...' : '● พร้อมช่วยเหลือ'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="nimo-no-drag w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
                >
                    <X size={15} />
                </button>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 space-y-2"
                style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
            >
                {messages.map((msg, i) => (
                    <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'nimo' && (
                            <div className="w-6 h-6 rounded-full overflow-hidden border border-cyan-500/30 shrink-0 mb-0.5">
                                <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover object-top" alt="" />
                            </div>
                        )}
                        <div className={`max-w-[78%] px-3 py-2 text-sm leading-relaxed rounded-2xl ${msg.role === 'user'
                            ? 'bg-zinc-700/80 text-white rounded-br-sm'
                            : msg.content === '...'
                                ? 'bg-cyan-950/60 border border-cyan-500/20 text-zinc-400 text-xs rounded-bl-sm flex items-center gap-1.5 px-4'
                                : 'bg-cyan-950/60 border border-cyan-500/20 text-cyan-50 rounded-bl-sm'
                        }`}>
                            {msg.content === '...'
                                ? <><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" /><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" /><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" /></>
                                : msg.content
                            }
                        </div>
                    </div>
                ))}
            </div>

            {/* Voice Waveform (Gemini-style) */}
            {isListening && (
                <div className="shrink-0 px-4 py-3 bg-black/30 border-t border-white/5 flex items-center gap-3">
                    <div className="flex items-center gap-1 h-8">
                        {audioLevel.map((h, i) => (
                            <div
                                key={i}
                                className="w-1.5 bg-cyan-400 rounded-full transition-all duration-75"
                                style={{ height: h, opacity: 0.7 + (h / 40) * 0.3 }}
                            />
                        ))}
                    </div>
                    <span className="text-cyan-300 text-xs font-bold flex-1">
                        {preferredLanguage === 'en' ? 'Listening...' : 'กำลังฟัง...'}
                    </span>
                    <button onClick={stopMic} className="text-red-400 text-xs font-bold active:scale-90">
                        ✕ {preferredLanguage === 'en' ? 'Cancel' : 'ยกเลิก'}
                    </button>
                </div>
            )}

            {/* Input */}
            {!isListening && (
                <div className="shrink-0 p-2.5 border-t border-white/5 nimo-no-drag">
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 focus-within:border-cyan-500/40 transition-colors">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey && input.trim() && !isTyping) {
                                    e.preventDefault();
                                    handleSendFn();
                                }
                            }}
                            onFocus={() => setTimeout(() => {
                                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                            }, 350)}
                            placeholder={preferredLanguage === 'en' ? 'Ask Nimo...' : 'ถาม Nimo...'}
                            className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-zinc-600 min-w-0"
                            autoComplete="off"
                            autoCorrect="off"
                        />
                        <button
                            onClick={toggleListen}
                            className="nimo-no-drag w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-cyan-400 active:scale-90 transition-all shrink-0"
                        >
                            <Mic size={16} />
                        </button>
                        <button
                            onPointerDown={e => e.stopPropagation()}
                            onClick={() => { if (input.trim() && !isTyping) handleSendFn(); }}
                            className={`nimo-no-drag w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 active:scale-90 ${input.trim() && !isTyping ? 'bg-cyan-500 text-black' : 'bg-white/5 text-zinc-600'}`}
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FloatingNimo;
