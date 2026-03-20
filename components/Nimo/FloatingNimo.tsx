import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Mic, MicOff, MessageCircle } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';

interface Msg { role: 'user' | 'nimo'; text: string; }

interface Props {
    isOpenProp?: boolean;
    setIsOpenProp?: (v: boolean) => void;
    voiceType?: string;
    preferredLanguage?: 'th' | 'en';
}

export const FloatingNimo: React.FC<Props> = ({
    isOpenProp, setIsOpenProp,
    voiceType = 'teen_girl', preferredLanguage = 'en'
}) => {
    const [open, setOpen] = useState(false);
    const isOpen = isOpenProp !== undefined ? isOpenProp : open;
    const setIsOpen = setIsOpenProp ?? setOpen;

    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [listening, setListening] = useState(false);
    const [status, setStatus] = useState('');
    const usedMic = useRef(false); // track whether last message was voice
    const listRef = useRef<HTMLDivElement>(null);
    const recRef = useRef<any>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Welcome
    useEffect(() => {
        setMsgs([{ role: 'nimo', text: preferredLanguage === 'th'
            ? 'สวัสดีค่ะ! ถามเรื่องดนตรีหรือการใช้งานแอพได้เลยนะคะ 🎵'
            : "Hi! I'm Nimo 🎵 Ask me about music or how to use the app!" }]);
    }, [preferredLanguage]);

    // Scroll to bottom
    const scrollBottom = () => {
        setTimeout(() => {
            if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        }, 80);
    };
    useEffect(scrollBottom, [msgs, busy]);

    // Setup speech recognition
    useEffect(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        const r = new SR();
        r.continuous = false;
        r.interimResults = false;
        r.lang = preferredLanguage === 'th' ? 'th-TH' : 'en-US';
        r.onresult = (e: any) => {
            const t = e.results[0][0].transcript;
            setInput(t);
            setListening(false);
            usedMic.current = true;  // mark as voice input
            sendMsg(t);
        };
        r.onerror = () => setListening(false);
        r.onend   = () => setListening(false);
        recRef.current = r;
    }, [preferredLanguage]);

    const toggleMic = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setStatus(preferredLanguage === 'th'
                ? '⚠️ ต้องใช้ Chrome บน Android'
                : '⚠️ Use Chrome on Android for voice');
            return;
        }
        if (listening) {
            recRef.current?.stop();
            setListening(false);
        } else {
            setStatus('');
            recRef.current?.start();
            setListening(true);
        }
    };

    // Fix pronunciation: replace brand names before TTS
    const fixPronunciation = (text: string) =>
        text
            .replace(/Memolody/gi, 'เมมโมโลดี้')
            .replace(/Nimo/gi, 'นิโม่');

    // Check if user explicitly requests speech (e.g. "พูดให้ฟัง", "speak", "อ่านให้ฟัง")
    const wantsSpeech = (text: string) =>
        /พูด|อ่านให้ฟัง|ออกเสียง|speak|read.?aloud|say.?it/i.test(text);

    const sendMsg = async (override?: string) => {
        const text = (override ?? input).trim();
        if (!text || busy) return;

        const wasVoice = usedMic.current;    // capture before reset
        const speakReq = wantsSpeech(text);  // user asked for speech?
        usedMic.current = false;             // reset for next message

        setInput('');
        setBusy(true);
        setStatus('');

        setMsgs(prev => [...prev, { role: 'user', text }]);

        try {
            const key = process.env.GEMINI_API_KEY || '';
            if (!key) throw new Error('API key missing');

            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const p = isMale ? 'ครับ' : 'ค่ะ';
            const sys = preferredLanguage === 'th'
                ? `คุณคือ Nimo ผู้ช่วย AI ดนตรีของแอพ เมมโมโลดี้ ตอบไทย 2-3 ประโยค สั้นกระชับ ลงท้าย${p}`
                : 'You are Nimo, AI music assistant for Memolody app. Reply in English. 2-3 sentences max. No markdown.';

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: sys }] },
                        contents: [{ role: 'user', parts: [{ text }] }],
                        generationConfig: { maxOutputTokens: 200 }
                    })
                }
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);

            const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (!reply) throw new Error('Empty response');

            setMsgs(prev => [...prev, { role: 'nimo', text: reply }]);

            // TTS: ONLY when user explicitly types "พูด" / "speak" etc.
            if (speakReq && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const speakText = preferredLanguage === 'th'
                    ? fixPronunciation(reply)
                    : reply;
                const u = new SpeechSynthesisUtterance(speakText);
                u.lang = preferredLanguage === 'th' ? 'th-TH' : 'en-US';
                const isMale2 = voiceType === 'teen_boy' || voiceType === 'adult_man';
                u.pitch = isMale2 ? 0.9 : 1.2;
                u.rate = 0.95;
                window.speechSynthesis.speak(u);
            }
        } catch (e: any) {
            console.error('[Nimo]', e);
            const errMsg = preferredLanguage === 'th'
                ? `⚠️ เชื่อมต่อไม่ได้: ${e.message}`
                : `⚠️ Error: ${e.message}`;
            setMsgs(prev => [...prev, { role: 'nimo', text: errMsg }]);
        } finally {
            setBusy(false);
        }
    };

    // ── FAB ──
    if (!isOpen) return (
        <button
            onClick={() => setIsOpen(true)}
            className="fixed z-[40000] bottom-20 right-4 w-14 h-14 bg-black border-2 border-cyan-500 rounded-full overflow-hidden flex items-center justify-center active:scale-90 transition-transform"
            style={{ boxShadow: '0 0 20px rgba(0,229,255,0.4)' }}
        >
            <img src={NIMO_IDENTITY_IMAGE} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="" />
            <MessageCircle className="relative z-10 text-white" size={22} />
            <span className="absolute top-0 right-0 w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
            <span className="absolute top-0 right-0 w-3 h-3 bg-cyan-500 rounded-full" />
        </button>
    );

    // ── Full-screen on mobile, floating on desktop ──
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    return (
        <div
            className="fixed z-[40000] flex flex-col bg-[#0d0d0f] border border-white/10 shadow-2xl"
            style={isMobile ? {
                // Bottom-sheet: rises from bottom, NOT full screen (avoids black overlay bug)
                left: 0, right: 0, bottom: 0,
                height: '75dvh',
                minHeight: 380,
                borderRadius: '20px 20px 0 0',
                borderBottom: 'none',
            } : {
                bottom: 20, right: 20,
                width: 340, height: 520,
                borderRadius: 20,
            }}
        >
            {/* Header */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/40">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/40 shrink-0">
                    <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover" alt="Nimo" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-black italic uppercase text-sm leading-none">NIMO AI</p>
                    <p className="text-cyan-400 text-[10px] mt-0.5">
                        {busy ? '⟳ กำลังคิด...' : listening ? '🎙 กำลังฟัง...' : '● พร้อม'}
                    </p>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white active:scale-90 rounded-full hover:bg-white/10"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Messages */}
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                        {m.role === 'nimo' && (
                            <div className="w-7 h-7 rounded-full overflow-hidden border border-cyan-500/30 shrink-0">
                                <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover" alt="" />
                            </div>
                        )}
                        <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            m.role === 'user'
                                ? 'bg-zinc-700 text-white rounded-br-sm'
                                : 'bg-cyan-950/80 text-cyan-50 border border-cyan-500/20 rounded-bl-sm'
                        }`}>
                            {m.text}
                        </div>
                    </div>
                ))}
                {busy && (
                    <div className="flex items-end gap-2">
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-cyan-500/30 shrink-0">
                            <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover" alt="" />
                        </div>
                        <div className="bg-cyan-950/80 border border-cyan-500/20 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
                            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0ms]" />
                            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:150ms]" />
                            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                    </div>
                )}
                {status && <p className="text-center text-xs text-amber-400 py-1">{status}</p>}
            </div>

            {/* Input bar */}
            <div className="shrink-0 p-3 border-t border-white/10 bg-black/20">
                <div className="flex gap-2 items-center">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !busy && sendMsg()}
                        placeholder={preferredLanguage === 'th' ? 'ถาม Nimo...' : 'Ask Nimo...'}
                        disabled={busy}
                        className="flex-1 min-w-0 h-11 bg-white/5 border border-white/10 rounded-full px-4 text-white text-sm outline-none focus:border-cyan-500/50 placeholder:text-zinc-600 disabled:opacity-50"
                        autoComplete="off"
                    />
                    {/* Mic button */}
                    <button
                        onClick={toggleMic}
                        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                            listening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 border border-white/10 text-zinc-400'
                        }`}
                    >
                        {listening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    {/* Send button — BIG for mobile */}
                    <button
                        onClick={() => sendMsg()}
                        disabled={!input.trim() || busy}
                        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-40 bg-cyan-500 text-black font-bold"
                    >
                        <Send size={18} />
                    </button>
                </div>
                {/* Safe area spacer for iPhone */}
                <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
            </div>
        </div>
    );
};

export default FloatingNimo;
