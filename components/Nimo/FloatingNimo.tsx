import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, X, MessageCircle, Sparkles } from 'lucide-react';
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
    preferredLanguage = 'en'
}) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen;
    const setIsOpen = setIsOpenProp || setInternalOpen;

    const isMobile = () => window.innerWidth < 640;

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useState(false);
    // visualViewport bottom offset for keyboard avoidance
    const [kbOffset, setKbOffset] = useState(0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const handleSendRef = useRef<(text?: string) => void>(() => {});

    // Welcome message
    useEffect(() => {
        setMessages([{
            role: 'nimo',
            content: preferredLanguage === 'en'
                ? "Hi! I'm Nimo 🎵 Ask me anything about music or how to use the app!"
                : "สวัสดีค่ะ! Nimo พร้อมช่วยแล้วค่ะ ถามมาได้เลยนะคะ!",
            timestamp: Date.now()
        }]);
    }, [preferredLanguage]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // ── visualViewport: push chat above keyboard on mobile ──
    useEffect(() => {
        if (!isOpen) { setKbOffset(0); return; }
        const vv = window.visualViewport;
        if (!vv) return;
        const update = () => {
            const windowH = window.innerHeight;
            const vvH = vv.height + vv.offsetTop;
            const offset = Math.max(0, windowH - vvH);
            setKbOffset(offset);
            // scroll chat to bottom when keyboard opens
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 50);
        };
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        update();
        return () => {
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
        };
    }, [isOpen]);

    // ── Speech Recognition ──
    useEffect(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        const rec = new SR();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = preferredLanguage === 'en' ? 'en-US' : 'th-TH';
        rec.onresult = (e: any) => {
            const t = e.results[0][0].transcript;
            handleSendRef.current(t);
            setIsListening(false);
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => setIsListening(false);
        recognitionRef.current = rec;
    }, [preferredLanguage]);

    // ── TTS ──
    const speak = (text: string) => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = preferredLanguage === 'en' ? 'en-US' : 'th-TH';
        utterance.pitch = isMale ? 0.9 : 1.2;
        utterance.rate = preferredLanguage === 'en' ? 1.0 : 0.95;
        window.speechSynthesis.speak(utterance);
    };

    // ── Mic toggle ──
    const toggleListen = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            alert(preferredLanguage === 'en'
                ? 'Voice input needs Chrome browser on Android.'
                : 'กรุณาใช้ Chrome บน Android สำหรับพูดคุยค่ะ');
            return;
        }
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            try {
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                setIsListening(false);
            }
        }
    };

    // ── Gemini Streaming ──
    const handleSend = async (textToProcess?: string) => {
        const userMsg = textToProcess || input.trim();
        if (!userMsg || isTyping) return;
        setInput('');
        setIsTyping(true);
        window.speechSynthesis.cancel();

        const userTs = Date.now();
        const nimoTs = userTs + 1;
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userMsg, timestamp: userTs },
            { role: 'nimo', content: '...', timestamp: nimoTs }
        ]);

        try {
            const apiKey = process.env.GEMINI_API_KEY || '';
            if (!apiKey) throw new Error('No API key');

            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const p = isMale ? 'ครับ' : 'ค่ะ';
            const sys = preferredLanguage === 'en'
                ? `You are Nimo, a friendly music assistant for the Memolody app. Reply in English. Be short and helpful (max 3 sentences). No markdown.`
                : `คุณคือ Nimo ผู้ช่วย AI ดนตรีของแอพ Memolody ตอบภาษาไทย สั้น กระชับ ลงท้ายด้วย${p} ไม่ใช้ markdown`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent?alt=sse&key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: sys }] },
                    contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                    generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const reader = res.body?.getReader();
            if (!reader) throw new Error('No reader');

            let full = '';
            const dec = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of dec.decode(value, { stream: true }).split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const s = line.slice(6).trim();
                    if (s === '[DONE]') break;
                    try {
                        const part = JSON.parse(s)?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (part) {
                            full += part;
                            setMessages(prev => prev.map(m =>
                                m.timestamp === nimoTs ? { ...m, content: full } : m
                            ));
                        }
                    } catch { /* skip */ }
                }
            }
            if (!full) full = preferredLanguage === 'en' ? 'Sorry, try again!' : `ขอโทษ${p} ลองอีกครั้งนะ${p}`;
            speak(full);
        } catch {
            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const p = isMale ? 'ครับ' : 'ค่ะ';
            const err = preferredLanguage === 'en' ? 'Connection issue, try again!' : `เชื่อมต่อไม่ได้${p} ลองใหม่นะ${p}`;
            setMessages(prev => prev.map(m =>
                m.timestamp === (Date.now() - 1) ? { ...m, content: err } : m
            ));
        } finally {
            setIsTyping(false);
        }
    };

    // Keep ref fresh
    handleSendRef.current = handleSend;

    // ── Drag (desktop only) ──
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const dragRef = useRef<{ sx: number; sy: number; ix: number; iy: number } | null>(null);
    useEffect(() => {
        setPosition({ x: Math.max(0, window.innerWidth - 360), y: Math.max(80, window.innerHeight - 520) });
    }, []);

    const onDragStart = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('.nimo-no-drag')) return;
        if (isMobile()) return;
        dragRef.current = { sx: e.clientX, sy: e.clientY, ix: position.x, iy: position.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onDragMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        setPosition({
            x: dragRef.current.ix + e.clientX - dragRef.current.sx,
            y: dragRef.current.iy + e.clientY - dragRef.current.sy
        });
    };
    const onDragEnd = (e: React.PointerEvent) => {
        dragRef.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    // ── Bubble FAB (when closed) ──
    if (!isOpen) return (
        <button
            onClick={() => setIsOpen(true)}
            className="fixed z-[40000] bottom-20 right-4 w-14 h-14 bg-black border-2 border-cyan-500 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.4)] overflow-hidden flex items-center justify-center group active:scale-95 transition-transform"
        >
            <img src={NIMO_IDENTITY_IMAGE} className="absolute inset-0 w-full h-full object-cover object-top opacity-50 group-hover:opacity-100 transition-opacity" alt="" />
            <MessageCircle className="text-white relative z-10" size={22} />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-500 rounded-full" />
        </button>
    );

    // ── Chat Window ──
    const mobile = isMobile();

    return (
        <div
            className="fixed z-[40000] flex flex-col bg-[#0c0c0e]/98 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden"
            style={mobile ? {
                // Mobile: full-width bottom sheet above keyboard
                left: 0, right: 0,
                bottom: kbOffset,
                height: `min(80dvh, ${window.innerHeight - kbOffset - 48}px)`,
                borderRadius: '24px 24px 0 0',
            } : {
                // Desktop: floating window
                width: '340px',
                height: '520px',
                left: position.x,
                top: position.y,
                borderRadius: '28px',
                touchAction: 'none',
            }}
        >
            {/* Header */}
            <div
                className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/5 bg-white/[0.03]"
                style={{ cursor: mobile ? 'default' : 'move' }}
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
            >
                {/* Mobile drag handle */}
                {mobile && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full" />
                )}
                <div className="flex items-center gap-2 pointer-events-none">
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-cyan-500/50 shrink-0">
                        <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover object-top" alt="Nimo" />
                    </div>
                    <div>
                        <span className="font-black text-white italic tracking-tighter uppercase text-xs">NIMO AI</span>
                        <span className="ml-2 text-[9px] text-cyan-400 font-bold uppercase">● Online</span>
                    </div>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="nimo-no-drag p-1.5 text-zinc-500 hover:text-white active:scale-90 transition-all rounded-full hover:bg-white/10"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'nimo' && (
                            <div className="w-6 h-6 rounded-full overflow-hidden border border-cyan-500/30 mr-2 mt-1 shrink-0">
                                <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover object-top" alt="" />
                            </div>
                        )}
                        <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                            ? 'bg-zinc-800 text-white rounded-br-sm'
                            : msg.content === '...'
                                ? 'bg-cyan-500/10 border border-cyan-500/20 text-zinc-400 italic text-xs rounded-bl-sm'
                                : 'bg-cyan-500/10 text-cyan-50 border border-cyan-500/20 rounded-bl-sm'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/5 nimo-no-drag">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 focus-within:border-cyan-500/40 transition-colors">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        onFocus={() => {
                            // Scroll to bottom when keyboard opens
                            setTimeout(() => {
                                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                            }, 300);
                        }}
                        placeholder={preferredLanguage === 'en' ? 'Ask Nimo...' : 'ถาม Nimo...'}
                        className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-zinc-600 min-w-0"
                    />
                    <button
                        onClick={toggleListen}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                            isListening ? 'bg-red-500 text-white animate-pulse' : 'text-zinc-500 hover:text-cyan-400 active:scale-90'
                        }`}
                    >
                        {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isTyping}
                        className="w-8 h-8 bg-cyan-500 text-black rounded-full flex items-center justify-center active:scale-90 transition-all disabled:opacity-30 shrink-0"
                    >
                        <Send size={14} />
                    </button>
                </div>
                {mobile && <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />}
            </div>
        </div>
    );
};

export default FloatingNimo;
