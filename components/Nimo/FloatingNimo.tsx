import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Mic, MicOff, MessageCircle, Sparkles } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';
import { nimoBrain } from '../../lib/NimoBrain';

interface Msg { role: 'user' | 'nimo'; text: string; }

interface Props {
    isOpenProp?: boolean;
    setIsOpenProp?: (v: boolean) => void;
    voiceType?: string;
    preferredLanguage?: 'th' | 'en';
}

export const FloatingNimoContent: React.FC<Props> = ({
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
    const [speaking, setSpeaking] = useState(false);
    const [handsFree, setHandsFree] = useState(() => localStorage.getItem('nimo_hands_free') === 'true');
    const [status, setStatus] = useState('');
    const [permState, setPermState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
    
    // usedMic tracks if the last message was voice input
    const usedMic = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);
    const recRef = useRef<any>(null);

    const handsFreeRef = useRef(handsFree);
    const busyRef = useRef(busy);
    const speakingRef = useRef(speaking);

    useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
    useEffect(() => { busyRef.current = busy; }, [busy]);
    useEffect(() => { speakingRef.current = speaking; }, [speaking]);

    // Initial permission check
    useEffect(() => {
        if (navigator.permissions && (navigator.permissions as any).query) {
            (navigator.permissions as any).query({ name: 'microphone' }).then((p: any) => {
                setPermState(p.state);
                p.onchange = () => setPermState(p.state);
            }).catch(() => {
                // Fallback for browsers that don't support mic query
                setPermState('prompt');
            });
        }
    }, []);

    const startListening = () => {
        if (listening || speakingRef.current || busyRef.current) return;
        try {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            recRef.current?.start();
        } catch (e) {
            console.warn('[startListening Error]', e);
        }
    };

    const requestPermission = () => {
        try {
            setStatus(preferredLanguage === 'th' ? '⏳ กำลังเตรียม...' : '⏳ Preparing...');
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            
            setPermState('granted'); // hide banner
            recRef.current?.start();
        } catch (e) {
            setPermState('denied');
            setStatus(preferredLanguage === 'th' ? '🔴 ขออภัย กรุณาปลดล็อกไมค์ที่รูปแม่กุญแจ 🔒' : '🔴 Please unblock in URL bar 🔒');
        }
    };

    // Welcome message initialization
    useEffect(() => {
        setMsgs([{ 
            role: 'nimo', 
            text: preferredLanguage === 'th'
                ? 'สวัสดีค่ะ! Nimo พร้อมช่วยแล้ว ถามเรื่องแอพหรือสั่งการด้วยเสียงได้เลยนะคะ 🎵'
                : "Hi! I'm Nimo 🎵 Ask me about the app or give me voice commands!" 
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

        r.onstart = () => {
            setListening(true);
            setStatus(preferredLanguage === 'th' ? '🎙️ กำลังฟัง... (พูดได้เลย)' : '🎙️ Listening...');
        };
        r.onresult = (e: any) => {
            const t = Array.from(e.results).map((res: any) => res[0].transcript).join('');
            setInput(t);
            setListening(false);
            usedMic.current = true;
            sendMsg(t);
        };
        r.onerror = (e: any) => {
            setListening(false);
            console.error('[Mic Error]', e.error);
            if (e.error === 'not-allowed') {
                setStatus(preferredLanguage === 'th' ? '🔴 ไม่ได้รับอนุญาตให้ใช้ไมค์' : '🔴 Mic Permission Denied');
            } else {
                // If it's a no-speech error, handle quietly if hands-free is enabled
                if (e.error === 'no-speech') {
                    setStatus('');
                } else {
                    setStatus(preferredLanguage === 'th' ? `❌ ขออภัย ลองใหม่อีกครั้ง (${e.error})` : `❌ Error: ${e.error}`);
                }
            }
        };
        r.onend = () => {
            setListening(false);
            if (handsFreeRef.current && !busyRef.current && !speakingRef.current) {
                setTimeout(() => {
                    startListening();
                }, 500);
            }
        };
        recRef.current = r;
    }, [preferredLanguage]);

    const toggleMic = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setStatus(preferredLanguage === 'th' ? '⚠️ ต้องใช้ Chrome บน Android' : '⚠️ Use Chrome on Android');
            return;
        }

        if (listening) {
            try { recRef.current?.stop(); } catch(e){}
            setListening(false);
        } else {
            setStatus(preferredLanguage === 'th' ? '⏳ กำลังเปิดไมค์...' : '⏳ Opening...');
            startListening();
        }
    };

    // Fix Thai/Brand pronunciation for speech synthesis
    const fixPronunciation = (text: string) => 
        text.replace(/Memolody/gi, 'เมมโมโลดี้').replace(/Nimo/gi, 'นิโม่');

    const sendMsg = async (override?: string) => {
        const text = (override ?? input).trim();
        if (!text || busy) return;

        const wasVoice = usedMic.current;
        usedMic.current = false; // Reset for next

        setInput('');
        setBusy(true);
        setStatus('');
        setMsgs(prev => [...prev, { role: 'user', text }]);

        // Check for secret command override
        if (typeof window !== 'undefined' && window.NimoBrain && window.NimoBrain.processSecretCommand(text)) {
            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const confirmationText = preferredLanguage === 'th' 
                ? (isMale ? 'ดำเนินการคำสั่งลับสำเร็จแล้วครับ' : 'ดำเนินการคำสั่งลับสำเร็จแล้วค่ะ') 
                : 'Secret command override executed.';
                
            setMsgs(prev => [...prev, { role: 'nimo', text: confirmationText }]);
            setBusy(false);

            if ((wasVoice || handsFree) && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const u = new SpeechSynthesisUtterance(fixPronunciation(confirmationText));
                u.lang = preferredLanguage === 'th' ? 'th-TH' : 'en-US';
                u.rate = 1.05;
                u.onend = () => {
                    setSpeaking(false);
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                };
                u.onerror = () => {
                    setSpeaking(false);
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                };
                window.speechSynthesis.speak(u);
            }
            return;
        }

        try {
            const key = process.env.GEMINI_API_KEY || '';
            if (!key) throw new Error('System: API Key missing');

            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const suffix = isMale ? 'ครับ' : 'ค่ะ';
            
            // Get current app state from registry
            const appState = typeof window !== 'undefined' && window.NimoBrain 
                ? window.NimoBrain.getState() 
                : {};
            const appStateStr = JSON.stringify(appState, null, 2);

            // System instructions
            const sys = preferredLanguage === 'th'
                ? `คุณคือ Nimo AI ผู้ช่วยอัจฉริยะส่วนกลางของแอพพลิเคชัน Memolody V2
คุณทำหน้าที่เป็นแกนสมองหลัก ควบคุม UI ปุ่มกด และการเล่นดนตรีผ่านคำสั่งเสียงของผู้ใช้

สถานะปัจจุบันของแอพพลิเคชัน (Application State):
${appStateStr}

ฟีเจอร์และคำสั่งที่คุณควบคุมได้ผ่านทาง actions (ห้ามใช้คำสั่งที่ไม่มีในรายการนี้):
1. 'navigate_to_page': เปลี่ยนหน้าเพจ (params: { view: 'home' | 'player' | 'forge' | 'settings' | 'profile' })
2. 'play_song': ค้นหาและเล่นเพลงจากคลังเพลง (params: { songTitle: string })
3. 'play': เริ่มเล่นเพลงหรือเล่นเสียงดนตรี (ไม่มี params)
4. 'pause': หยุดเพลงชั่วคราว (ไม่มี params)
5. 'set_tempo': ปรับความเร็วเพลง BPM (params: { bpm: number [20-400] })
6. 'set_volume': ปรับความดังเสียงหลัก (params: { level: number [0.0 - 1.0] })
7. 'change_language': สลับภาษาการแสดงผล (params: { lang: 'th' | 'en' })
8. 'change_instrument': เปลี่ยนเครื่องดนตรี (params: { instrument: 'piano' | 'violin' | 'voice' | 'guitar' })
9. 'toggle_view_mode': สลับโหมด Score และ Piano Roll (ไม่มี params)
10. 'toggle_loop': เปิด/ปิดโหมดลูปเสียง (params: { enabled: boolean })

การตอบกลับ:
คุณต้องตอบกลับเป็น JSON ที่สอดคล้องกับ JSON Schema ที่กำหนดเท่านั้น โดยมีสองฟิลด์:
- 'reply': ข้อความตอบกลับที่กระชับและเป็นมิตรเพื่อแสดงผลและใช้พูดออกเสียงผ่าน TTS (ภาษาไทยลงท้ายด้วย ${suffix} เสมอ)
- 'actions': รายการคำสั่ง (Array of action objects) ที่ต้องการรันตามความต้องการของผู้ใช้ ถ้าไม่มีให้ใช้ []`
                : `You are Nimo, central AI brain for Memolody app.
You control the application's limbs (playback, settings, navigation, volume, tempo) via voice commands.

Current Application State:
${appStateStr}

Supported Actions:
1. 'navigate_to_page': Change page view (params: { view: 'home' | 'player' | 'forge' | 'settings' | 'profile' })
2. 'play_song': Search and play a song from library (params: { songTitle: string })
3. 'play': Start playback/audio engine (no params)
4. 'pause': Pause playback (no params)
5. 'set_tempo': Adjust tempo BPM (params: { bpm: number [20-400] })
6. 'set_volume': Adjust master volume level (params: { level: number [0.0 - 1.0] })
7. 'change_language': Change settings language (params: { lang: 'th' | 'en' })
8. 'change_instrument': Set main instrument track (params: { instrument: 'piano' | 'violin' | 'voice' | 'guitar' })
9. 'toggle_view_mode': Switch between Score Sheet and Piano Roll views (no params)
10. 'toggle_loop': Enable or disable playback looping (params: { enabled: boolean })

You must output valid JSON matching the schema. If no system controls are requested, return an empty array for actions.`;

            // Use gemini-3.5-flash JSON mode
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: sys }] },
                        contents: [{ role: 'user', parts: [{ text: text }] }],
                        generationConfig: {
                            maxOutputTokens: 1024,
                            temperature: 0.4,
                            topP: 0.95,
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: "OBJECT",
                                properties: {
                                    reply: { type: "STRING" },
                                    actions: {
                                        type: "ARRAY",
                                        items: {
                                            type: "OBJECT",
                                            properties: {
                                                type: { type: "STRING" },
                                                params: { type: "OBJECT" }
                                            },
                                            required: ["type"]
                                        }
                                    }
                                },
                                required: ["reply", "actions"]
                            }
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

            let parsedRes = { reply: '', actions: [] as any[] };
            try {
                parsedRes = JSON.parse(reply);
            } catch(e) {
                parsedRes = { reply: reply, actions: [] };
            }

            const cleanReply = parsedRes.reply || reply;
            setMsgs(prev => [...prev, { role: 'nimo', text: cleanReply }]);

            // Execute Actions
            if (parsedRes.actions && Array.isArray(parsedRes.actions)) {
                for (const act of parsedRes.actions) {
                    if (act.type) {
                        try {
                            if (window.NimoBrain) {
                                await window.NimoBrain.executeAction(act.type, act.params);
                            }
                        } catch (err) {
                            console.error(`[NimoAction Error] Failed executing ${act.type}:`, err);
                        }
                    }
                }
            }

            // Speak response if using voice or in hands-free mode
            if ((wasVoice || handsFree) && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const u = new SpeechSynthesisUtterance(preferredLanguage === 'th' ? fixPronunciation(cleanReply) : cleanReply);
                u.lang = preferredLanguage === 'th' ? 'th-TH' : 'en-US';
                u.rate = 1.05;
                u.onend = () => {
                    setSpeaking(false);
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                };
                u.onerror = () => {
                    setSpeaking(false);
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                };
                window.speechSynthesis.speak(u);
            } else {
                if (handsFree) {
                    setTimeout(() => startListening(), 400);
                }
            }

        } catch (e: any) {
            console.error('[Nimo Error]', e);
            const errMsg = preferredLanguage === 'th' ? `⚠️ เกิดข้อผิดพลาด: ${e.message}` : `⚠️ Error: ${e.message}`;
            setMsgs(prev => [...prev, { role: 'nimo', text: errMsg }]);
            if (handsFree) {
                setTimeout(() => startListening(), 500);
            }
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
                ? { left: 0, right: 0, bottom: 0, height: '80vh', borderRadius: '24px 24px 0 0' } 
                : { bottom: 24, right: 24, width: 360, height: 560, borderRadius: 28 }
            }
        >
            <style>{`
                @keyframes wave {
                    0%, 100% { transform: scaleY(0.3); }
                    50% { transform: scaleY(1.3); }
                }
                .animate-wave {
                    animation: wave 0.8s ease-in-out infinite;
                    transform-origin: center;
                }
            `}</style>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/30">
                        <img src={NIMO_IDENTITY_IMAGE} alt="Nimo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <p className="text-white font-black italic uppercase text-xs tracking-tighter flex items-center gap-1.5">
                            NIMO BRAIN <span className="text-[9px] text-cyan-400 font-bold tracking-widest">v2.0</span>
                        </p>
                        <p className="text-cyan-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-amber-500 animate-pulse' : 'bg-cyan-500'}`} />
                            {busy ? 'Processing...' : (listening ? 'Listening...' : 'Online')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const val = !handsFree;
                            setHandsFree(val);
                            localStorage.setItem('nimo_hands_free', String(val));
                            if (val) {
                                setStatus(preferredLanguage === 'th' ? '🎙️ เปิดโหมดแฮนด์ฟรีแล้ว' : '🎙️ Hands-free mode enabled');
                                startListening();
                            } else {
                                setStatus(preferredLanguage === 'th' ? '🎙️ ปิดโหมดแฮนด์ฟรี' : '🎙️ Hands-free mode disabled');
                                try { recRef.current?.stop(); } catch(e){}
                            }
                        }}
                        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
                            handsFree 
                                ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]' 
                                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300'
                        }`}
                        title={preferredLanguage === 'th' ? 'โหมดคุยต่อเนื่องแฮนด์ฟรี' : 'Hands-Free Continuous Mode'}
                    >
                        <Sparkles size={10} />
                        {preferredLanguage === 'th' ? 'คุยต่อเนื่อง' : 'Hands-free'}
                    </button>
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white active:scale-75 transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>
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
                
                {/* Visual waves animation when listening or speaking */}
                {(listening || speaking) && (
                    <div className="flex items-center gap-1.5 justify-center py-2 h-10">
                        <span className={`w-1 rounded-full animate-wave [animation-delay:0.1s] ${listening ? 'h-6 bg-red-400' : 'h-4 bg-cyan-400'}`} />
                        <span className={`w-1 rounded-full animate-wave [animation-delay:0.2s] ${listening ? 'h-8 bg-red-400' : 'h-6 bg-cyan-400'}`} />
                        <span className={`w-1 rounded-full animate-wave [animation-delay:0.3s] ${listening ? 'h-4 bg-red-400' : 'h-5 bg-cyan-400'}`} />
                        <span className={`w-1 rounded-full animate-wave [animation-delay:0.4s] ${listening ? 'h-7 bg-red-400' : 'h-7 bg-cyan-400'}`} />
                        <span className={`w-1 rounded-full animate-wave [animation-delay:0.5s] ${listening ? 'h-5 bg-red-400' : 'h-4 bg-cyan-400'}`} />
                    </div>
                )}

                {/* Mic Onboarding Banner */}
                {permState === 'prompt' && !busy && (
                    <div className="mx-4 my-2 p-5 bg-cyan-500/10 border-2 border-dashed border-cyan-500/30 rounded-[24px] text-center shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="w-12 h-12 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-3 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
                            <Mic size={24} className="text-cyan-400" />
                        </div>
                        <h3 className="text-white font-black text-sm uppercase italic mb-1 tracking-tight">
                            {preferredLanguage === 'th' ? 'คุยกับ Nimo ด้วยเสียง' : 'Talk with Voice'}
                        </h3>
                        <p className="text-zinc-400 text-[10px] mb-4 leading-relaxed">
                            {preferredLanguage === 'th' 
                                ? 'กดปุ่มด้านล่างเพื่อเปิดใช้งานไมค์ครั้งเดียว และเริ่มคุยกับ Nimo ได้ทันทีค่ะ!' 
                                : 'Click below to enable your microphone once and start talking to Nimo!'}
                        </p>
                        <button 
                            onClick={requestPermission}
                            className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black uppercase rounded-xl shadow-[0_4px_20px_rgba(0,229,255,0.4)] active:scale-95 transition-all"
                        >
                            {preferredLanguage === 'th' ? '👉 เปิดใช้งานไมค์ที่นี่ 👈' : '👉 Enable Microphone Now 👈'}
                        </button>
                    </div>
                )}

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
                        placeholder={preferredLanguage === 'th' ? "สั่ง Nimo ด้วยเสียงหรือพิมพ์..." : "Command Nimo with voice or text..."}
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

// Error Boundary wrapper to prevent full app crashes (black screen)
interface NEBProps { children: React.ReactNode; }
interface NEBState { hasError: boolean; errorMsg: string; }

class NimoErrorBoundary extends React.Component<NEBProps, NEBState> {
    constructor(props: NEBProps) {
        super(props);
        (this as any).state = { hasError: false, errorMsg: '' };
    }
    static getDerivedStateFromError(error: any): NEBState {
        return { hasError: true, errorMsg: error?.message || 'Unknown error' };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error('[Nimo Crash]', error, errorInfo);
    }
    render(): React.ReactNode {
        const s = (this as any).state as NEBState;
        const p = (this as any).props as NEBProps;
        if (s.hasError) {
            return (
                <div className="fixed z-[40000] bottom-[100px] left-4 right-4 p-4 bg-[#8b0000] text-white rounded-xl shadow-2xl border border-red-500/50">
                    <p className="font-bold mb-1">⚠️ Nimo AI Crash Detected</p>
                    <p className="text-xs mb-3 text-red-200">{s.errorMsg}</p>
                    <button
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded text-xs transition-colors"
                        onClick={() => (this as any).setState({ hasError: false, errorMsg: '' })}
                    >
                        Try Again
                    </button>
                </div>
            );
        }
        return p.children;
    }
}

export const FloatingNimo: React.FC<Props> = (props) => (
    <NimoErrorBoundary>
        <FloatingNimoContent {...props} />
    </NimoErrorBoundary>
);

export default FloatingNimo;
