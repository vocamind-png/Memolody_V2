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
    
    // usedMic tracks if the last message was voice input
    const usedMic = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);
    const recRef = useRef<any>(null);

    // Welcome message initialization
    useEffect(() => {
        setMsgs([{ 
            role: 'nimo', 
            text: preferredLanguage === 'th'
                ? 'สวัสดีค่ะ! Nimo พร้อมช่วยแล้ว ถามเรื่องแอพหรือดนตรีได้เลยนะคะ 🎵'
                : "Hi! I'm Nimo 🎵 Ask me about the app or music theory!" 
        }]);
    }, [preferredLanguage]);

    // Force scroll to bottom when messages change
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [msgs, busy]);

    // Setup speech recognition
    useEffect(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        const r = new SR();
        r.continuous = false;
        r.interimResults = false;
        r.lang = preferredLanguage === 'th' ? 'th-TH' : 'en-US';
        r.onresult = (e: any) => {
            const t = Array.from(e.results).map((res: any) => res[0].transcript).join('');
            setInput(t);
            setListening(false);
            usedMic.current = true; // Mark as voice to potentially speak back
            sendMsg(t);
        };
        r.onerror = () => setListening(false);
        r.onend = () => setListening(false);
        recRef.current = r;
    }, [preferredLanguage]);

    const toggleMic = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setStatus(preferredLanguage === 'th' ? '⚠️ กรุณาใช้ Chrome บน Android' : '⚠️ Use Chrome on Android');
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

    // Fix Thai/Brand pronunciation for speech synthesis
    const fixPronunciation = (text: string) => 
        text.replace(/Memolody/gi, 'เมมโมโลดี้').replace(/Nimo/gi, 'นิโม่');

    // Simple keyword detection for explicit speech requests
    const checkSpeechReq = (text: string) => 
        /พูด|อ่านให้ฟัง|ออกเสียง|speak|read.?aloud|say.?it/i.test(text);

    const sendMsg = async (override?: string) => {
        const text = (override ?? input).trim();
        if (!text || busy) return;

        const wasVoice = usedMic.current;
        const wantSpeech = checkSpeechReq(text);
        usedMic.current = false; // Reset for next

        setInput('');
        setBusy(true);
        setStatus('');
        setMsgs(prev => [...prev, { role: 'user', text }]);

        try {
            const key = process.env.GEMINI_API_KEY || '';
            if (!key) throw new Error('System: API Key missing');

            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const suffix = isMale ? 'ครับ' : 'ค่ะ';
            
            // System instructions
            const sys = preferredLanguage === 'th'
                ? `คุณคือ Nimo ผู้ช่วย AI ของแอพ เมมโมโลดี้ (Memolody)
แอพนี้ใช้ฝึกอ่านตัวโน้ตด้วยระบบ Solfege (Movable Do / Fixed Do)
ฟีเจอร์หลัก: 1. ดูโน้ต XML 2. ฟังเสียง MIDI 3. ฝึกร้อง 4. Piano Roll 5. บันทึกเพลง
แนวทางการตอบ: ตอบภาษาไทยให้ครบถ้วน ชัดเจน ห้ามตัดจบกลางคำ ลงท้ายด้วย${suffix} เสมอ`
                : `You are Nimo, AI for Memolody app.
The app is a music notation/sight-reading tool using Solfege.
Features: XML Viewer, MIDI engine, Pitch training, Piano Roll, Saved songs.
Instructions: Reply in English, be complete and helpful. Never cut off mid-sentence.`;

            // Use gemini-1.5-flash which is standard and stable
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: sys }] },
                        contents: [{ role: 'user', parts: [{ text: text }] }],
                        generationConfig: {
                            maxOutputTokens: 1024, // High limit to prevent truncation
                            temperature: 0.7,
                            topP: 0.95,
                        }
                    })
                }
            );

            if (!res.ok) {
                const errJson = await res.json();
                throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
            }

            const json = await res.json();
            const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!reply) throw new Error('AI returned no response');

            setMsgs(prev => [...prev, { role: 'nimo', text: reply }]);

            // TTS Logic: ONLY if user explicitly asked OR used voice AND user settings allow
            // For now, we only speak if user explicitly says "speak" or similar.
            if (wantSpeech && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(preferredLanguage === 'th' ? fixPronunciation(reply) : reply);
                u.lang = preferredLanguage === 'th' ? 'th-TH' : 'en-US';
                u.rate = 1.0;
                window.speechSynthesis.speak(u);
            }

        } catch (e: any) {
            console.error('[Nimo Error]', e);
            const errMsg = preferredLanguage === 'th' ? `⚠️ ผิดพลาด: ${e.message}` : `⚠️ Error: ${e.message}`;
            setMsgs(prev => [...prev, { role: 'nimo', text: errMsg }]);
        } finally {
            setBusy(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed z-[40000] bottom-20 right-4 w-14 h-14 bg-black border-2 border-cyan-500 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.4)] overflow-hidden flex items-center justify-center active:scale-95 transition-transform"
            >
                <img src={NIMO_IDENTITY_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                <MessageCircle className="relative z-10 text-white" size={24} />
                <span className="absolute top-0 right-0 w-3 h-3 bg-cyan-500 rounded-full border border-black shadow-[0_0_10px_#00e5ff]" />
            </button>
        );
    }

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    return (
        <div 
            className="fixed z-[40000] flex flex-col bg-[#0d0d0f] border border-white/10 shadow-2xl overflow-hidden"
            style={isMobile 
                ? { left: 0, right: 0, bottom: 0, height: '80dvh', borderRadius: '24px 24px 0 0' } 
                : { bottom: 24, right: 24, width: 360, height: 560, borderRadius: 28 }
            }
        >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/30">
                        <img src={NIMO_IDENTITY_IMAGE} alt="Nimo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <p className="text-white font-black italic uppercase text-xs tracking-tighter">NIMO AI</p>
                        <p className="text-cyan-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-amber-500 animate-pulse' : 'bg-cyan-500'}`} />
                            {busy ? 'Processing...' : 'Online'}
                        </p>
                    </div>
                </div>
                <button 
                    onClick={() => setIsOpen(false)} 
                    className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white active:scale-75 transition-all"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Chat List */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
                {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                        {m.role === 'nimo' && (
                            <div className="w-7 h-7 rounded-full overflow-hidden border border-cyan-500/20 shrink-0">
                                <img src={NIMO_IDENTITY_IMAGE} alt="" className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed rounded-2xl shadow-sm ${
                            m.role === 'user' 
                                ? 'bg-zinc-800 text-white rounded-br-sm' 
                                : 'bg-cyan-950/40 text-cyan-50 border border-cyan-500/10 rounded-bl-sm'
                        }`}>
                            {m.text}
                        </div>
                    </div>
                ))}
                {busy && (
                    <div className="flex items-center gap-2 px-9">
                        <span className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                )}
                {status && <p className="text-center text-[10px] text-amber-500 font-bold uppercase tracking-wider py-2">{status}</p>}
            </div>

            {/* Input Bar */}
            <div className="shrink-0 p-4 border-t border-white/5 bg-black/20">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full pl-4 pr-1 py-1 focus-within:border-cyan-500/30 transition-colors">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !busy && sendMsg()}
                        placeholder={preferredLanguage === 'th' ? "ถาม Nimo ได้เลย..." : "Ask Nimo something..."}
                        disabled={busy}
                        className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-zinc-600 disabled:opacity-50 min-w-0"
                    />
                    <button 
                        onClick={toggleMic}
                        disabled={busy}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                            listening ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-zinc-500 hover:text-cyan-400'
                        }`}
                    >
                        {listening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    <button 
                        onClick={() => sendMsg()}
                        disabled={!input.trim() || busy}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                            input.trim() ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'bg-white/5 text-zinc-700'
                        }`}
                    >
                        <Send size={18} />
                    </button>
                </div>
                {/* Safe area for mobile */}
                <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
            </div>
        </div>
    );
};

export default FloatingNimo;
