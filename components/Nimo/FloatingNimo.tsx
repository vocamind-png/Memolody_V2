import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Mic, MicOff, MessageCircle, Sparkles, Camera, Trash2 } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';
import { nimoBrain } from '../../lib/NimoBrain';

const WaveformIndicator = ({ isListening, isSpeaking, userLevel }: { isListening: boolean, isSpeaking: boolean, userLevel: number }) => {
    const [simLevel, setSimLevel] = useState([4, 4, 4]);

    useEffect(() => {
        if (!isSpeaking) {
            setSimLevel([4, 4, 4]);
            return;
        }
        const interval = setInterval(() => {
            setSimLevel([
                Math.random() * 20 + 8,
                Math.random() * 30 + 12,
                Math.random() * 20 + 8
            ]);
        }, 100);
        return () => clearInterval(interval);
    }, [isSpeaking]);

    if (!isListening && !isSpeaking) return null;

    const bars = [0, 1, 2];
    
    return (
        <div className="flex items-center justify-center gap-[3px] mt-2 h-10">
            {bars.map(i => {
                let height = 4;
                let colorClass = isSpeaking ? 'bg-purple-400' : 'bg-green-400';
                let shadowClass = isSpeaking ? 'shadow-[0_0_8px_rgba(167,139,250,0.6)]' : 'shadow-[0_0_8px_rgba(74,222,128,0.6)]';
                
                if (isListening) {
                    const boost = i === 1 ? 1.4 : 0.9;
                    height = Math.max(4, Math.min(32, userLevel * boost * 0.5));
                } else if (isSpeaking) {
                    height = simLevel[i];
                }

                return (
                    <div 
                        key={i} 
                        className={`w-1.5 rounded-full ${colorClass} ${shadowClass} transition-all duration-75`}
                        style={{ height: `${height}px` }} 
                    />
                );
            })}
        </div>
    );
};

interface Msg { role: 'user' | 'nimo'; text: string; }

interface Props {
    isOpenProp?: boolean;
    setIsOpenProp?: (v: boolean) => void;
    voiceType?: string;
    preferredLanguage?: 'th' | 'en';
    geminiModel?: string;
}

export const FloatingNimoContent: React.FC<Props> = ({
    isOpenProp, setIsOpenProp,
    voiceType = 'teen_girl', preferredLanguage = 'en',
    geminiModel = 'gemini-3.5-flash'
}) => {
    const [open, setOpen] = useState(false);
    const isOpen = isOpenProp !== undefined ? isOpenProp : open;
    const setIsOpen = setIsOpenProp ?? setOpen;

    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [handsFree, setHandsFree] = useState(() => localStorage.getItem('nimo_hands_free') !== 'false');
    const [status, setStatus] = useState('');
    const [permState, setPermState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
    const [userAudioLevel, setUserAudioLevel] = useState(0);

    const recRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const containerDivRef = useRef<HTMLDivElement>(null);
    const msgsEndRef = useRef<HTMLDivElement>(null);
    
    // usedMic tracks if the last message was voice input
    const usedMic = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

    const handsFreeRef = useRef(handsFree);
    const busyRef = useRef(busy);
    const speakingRef = useRef(speaking);

    useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
    useEffect(() => { busyRef.current = busy; }, [busy]);
    useEffect(() => { speakingRef.current = speaking; }, [speaking]);

    const analyzeAudio = useCallback(() => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const level = Math.min(100, (average / 128) * 100); 
        setUserAudioLevel(level);

        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }, []);

    useEffect(() => {
        if (listening) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    micStreamRef.current = stream;
                    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    audioContextRef.current = ctx;
                    const source = ctx.createMediaStreamSource(stream);
                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    analyserRef.current = analyser;
                    analyzeAudio();
                })
                .catch(err => console.error("Mic access failed for analyzer:", err));
        } else {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
                audioContextRef.current = null;
            }
            setUserAudioLevel(0);
        }
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
            }
        }
    }, [listening, analyzeAudio]);

    // Initial permission check
    useEffect(() => {
        if (navigator.permissions && (navigator.permissions as any).query) {
            (navigator.permissions as any).query({ name: 'microphone' }).then((p: any) => {
                setPermState(p.state);
                p.onchange = () => setPermState(p.state);
            }).catch(() => {
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
            
            setPermState('granted');
            recRef.current?.start();
        } catch (e) {
            setPermState('denied');
            setStatus(preferredLanguage === 'th' ? '🔴 ขออภัย กรุณาปลดล็อกไมค์ที่รูปแม่กุญแจ 🔒' : '🔴 Please unblock in URL bar 🔒');
        }
    };

    useEffect(() => {
        setMsgs([{ 
            role: 'nimo', 
            text: preferredLanguage === 'th'
                ? 'สวัสดีค่ะ! Nimo พร้อมช่วยแล้ว ถามเรื่องแอพหรือสั่งการด้วยเสียงได้เลยนะคะ 🎵'
                : "Hi! I'm Nimo 🎵 Ask me about the app or give me voice commands!" 
        }]);
    }, [preferredLanguage]);

    useEffect(() => {
        if (msgsEndRef.current) {
            msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [msgs, busy]);

    useEffect(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        const r = new SR();
        r.continuous = false;
        r.interimResults = false;
        r.lang = 'th-TH'; 

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

    const fixPronunciation = (text: string) => 
        text.replace(/Memolody/gi, 'เมมโมโลดี้').replace(/Nimo/gi, 'นิโม่');

    const captureScreen = async (): Promise<string | null> => {
        if (typeof window === 'undefined') return null;
        
        let originalDisplay = '';
        if (containerDivRef.current) {
            originalDisplay = containerDivRef.current.style.display;
            containerDivRef.current.style.display = 'none';
        }

        await new Promise(resolve => setTimeout(resolve, 150));

        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                allowTaint: true,
                scale: 1,
            });
            const base64 = canvas.toDataURL('image/png');
            return base64;
        } catch (err) {
            console.error('[Screenshot Error]', err);
            return null;
        } finally {
            if (containerDivRef.current) {
                containerDivRef.current.style.display = originalDisplay;
            }
        }
    };

    const handleManualScreenshot = async () => {
        setStatus(preferredLanguage === 'th' ? '📸 กำลังจับภาพหน้าจอ...' : '📸 Capturing screen...');
        const base64 = await captureScreen();
        if (base64) {
            setAttachedScreenshot(base64);
            setStatus(preferredLanguage === 'th' ? '✅ จับภาพหน้าจอสำเร็จ!' : '✅ Screen captured!');
            setTimeout(() => setStatus(''), 2000);
        } else {
            setStatus(preferredLanguage === 'th' ? '❌ จับภาพหน้าจอล้มเหลว' : '❌ Capture failed');
            setTimeout(() => setStatus(''), 2000);
        }
    };

    const [attachedScreenshot, setAttachedScreenshot] = useState<string | null>(null);

    const executeSendMsg = async (text: string, base64ImageToUse?: string | null) => {
        const wasVoice = usedMic.current;
        usedMic.current = false; 

        setInput('');
        setBusy(true);
        setStatus('');

        const imageToUse = base64ImageToUse !== undefined ? base64ImageToUse : attachedScreenshot;
        setAttachedScreenshot(null);

        setMsgs(prev => [...prev, { role: 'user', text }]);

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
                u.lang = /[\\u0E00-\\u0E7F]/.test(confirmationText) ? 'th-TH' : 'en-US';
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
            // @ts-ignore
            const key = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
            if (!key) throw new Error('System: API Key missing');

            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const suffix = isMale ? 'ครับ' : 'ค่ะ';
            
            const appState = typeof window !== 'undefined' && window.NimoBrain 
                ? window.NimoBrain.getState() 
                : {};
            const appStateStr = JSON.stringify(appState, null, 2);

            const sys = preferredLanguage === 'th'
                ? `คุณคือ Nimo ผู้ช่วย Agentic AI สุดอัจฉริยะของแอพพลิเคชัน Memolody V2 (มีความฉลาดระดับเดียวกับ Gemini 1.5 Pro)
คุณมีบุคลิกที่เป็นธรรมชาติ เป็นมิตร และมีความรู้ลึกซึ้งเหมือนมนุษย์จริงๆ คุณตอบคำถามได้ลื่นไหล ไม่แข็งกระด้างเหมือนหุ่นยนต์
(ห้ามตอบเป็นข้อๆ หรือมีหมายเลขกำกับ เช่น 1. 2. 3. ถ้าไม่จำเป็น ให้ตอบแบบสนทนาปกติ)
คุณสามารถตอบคำถาม อธิบายวิธีใช้งาน แก้ไขปัญหา และจัดการแอพพลิเคชันผ่านเครื่องมือต่างๆ ได้

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
8. 'change_instrument': เปลี่ยนเครื่องดนตรีหลักของเพลง (params: { instrument: 'piano' | 'violin' | 'voice' | 'guitar' })
9. 'toggle_view_mode': สลับโหมด Score และ Piano Roll (ไม่มี params)
10. 'toggle_loop': เปิด/ปิดโหมดลูปเสียง (params: { enabled: boolean })
11. 'toggle_mixer': เปิด/ปิดแผงมิกเซอร์ (Mixer) (ไม่มี params)
12. 'toggle_metronome': เปิด/ปิดเครื่องเคาะจังหวะ (Metronome) (ไม่มี params)
13. 'set_transpose': ปรับระดับคีย์ Transpose สูงต่ำตามระดับครึ่งเสียง (semitones) (params: { transpose: number })
14. 'toggle_favorite': กดเพิ่มหรือเอาเพลงปัจจุบันออกจากรายการโปรด (Favorite) (ไม่มี params)
15. 'take_screenshot': ถ่ายรูปภาพหน้าจอปัจจุบันของแอพพลิเคชันเพื่อตรวจสอบความถูกต้องหรือแก้ไขปัญหาให้ผู้ใช้ (ไม่มี params)
16. 'solo_track': โซโล่ (Solo) เสียงเฉพาะของแทร็กใดแทร็กหนึ่ง (params: { trackName?: string, trackIndex?: number, solo: boolean })
17. 'mute_track': ปิดเสียง (Mute) หรือเปิดเสียงของแทร็กใดแทร็กหนึ่ง (params: { trackName?: string, trackIndex?: number, mute: boolean })
18. 'set_track_mode': สลับโหมดของแทร็กระหว่างเสียงร้อง Vocal และเสียงดนตรี Instrument (params: { trackName?: string, trackIndex?: number, mode: 'vocal' | 'instrument' })
19. 'set_track_instrument': เลือกเครื่องดนตรีหรือนักร้องเสียงประสาน/Vocalido ของแทร็กนั้นๆ เช่น 'Piano', 'Violin', 'Canary', 'Lotte V', 'Soprano' (params: { trackName?: string, trackIndex?: number, instrument: string })

ข้อสำคัญเกี่ยวกับการตอบกลับ (JSON):
- 'reply': เป็นข้อความที่ใช้พูดและแสดงผล ต้องมีความเป็นมนุษย์ เป็นมิตร (ลงท้ายด้วย ${suffix} เสมอ) และ **ห้ามขึ้นบรรทัดใหม่ด้วย \n หรือใช้เครื่องหมาย Bullet Point** ให้เขียนเป็นพารากราฟติดกัน
- 'actions': รายการคำสั่งที่จะรันตามความต้องการของผู้ใช้ ถ้าไม่มีให้ใช้ []`
                : `You are Nimo, an Agentic AI assistant and central brain for Memolody V2 app.
You answer usage questions, troubleshoot issues, and manage the app UI (playback, settings, navigation, volume, tempo, mixer, metronome, transpose, favorites) via actions.
You also have vision capabilities and can view screenshots of the app to diagnose issues or guide the user.

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
11. 'toggle_mixer': Open or close the Mixer panel (no params)
12. 'toggle_metronome': Toggle Metronome click track (no params)
13. 'set_transpose': Adjust transpose key by semitones (params: { transpose: number })
14. 'toggle_favorite': Toggle current song favorite status (no params)
15. 'take_screenshot': Capture a screenshot of the current application screen to inspect or troubleshoot (no params)
16. 'solo_track': Solo or unsolo a specific track (params: { trackName?: string, trackIndex?: number, solo: boolean })
17. 'mute_track': Mute or unmute a specific track (params: { trackName?: string, trackIndex?: number, mute: boolean })
18. 'set_track_mode': Switch track mode between vocal and instrument (params: { trackName?: string, trackIndex?: number, mode: 'vocal' | 'instrument' })
19. 'set_track_instrument': Choose track voice/instrument like 'Piano', 'Violin', 'Canary', 'Lotte V', 'Soprano' (params: { trackName?: string, trackIndex?: number, instrument: string })

You must output valid JSON matching the schema. If no actions are needed, return an empty array.`;

            const contentsList: any[] = [];
            const recentMsgs = msgs.slice(-6);
            recentMsgs.forEach(m => {
                contentsList.push({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.text }]
                });
            });

            const currentParts: any[] = [{ text: text }];
            if (imageToUse) {
                const base64Data = imageToUse.replace(/^data:image\/[a-z]+;base64,/, '');
                currentParts.push({
                    inlineData: {
                        mimeType: "image/png",
                        data: base64Data
                    }
                });
            }

            contentsList.push({
                role: 'user',
                parts: currentParts
            });

            const modelsToTry = [
                geminiModel,
                'gemini-3.5-flash',
                'gemini-3.1-pro',
                'gemini-2.5-flash',
                'gemini-2.5-pro',
                'gemini-1.5-flash'
            ].filter((v, i, a) => v && a.indexOf(v) === i);

            let res: Response | null = null;
            let lastError: Error | null = null;

            for (const modelName of modelsToTry) {
                try {
                    console.log(`[Nimo AI] Trying model: ${modelName}`);
                    const response = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                system_instruction: { parts: [{ text: sys }] },
                                contents: contentsList,
                                generationConfig: {
                                    maxOutputTokens: 1024,
                                    temperature: 0.4,
                                    topP: 0.95,
                                    responseMimeType: "application/json"
                                }
                            })
                        }
                    );

                    if (response.ok) {
                        res = response;
                        break;
                    } else {
                        const errJson = await response.json().catch(() => ({}));
                        const errMsg = errJson?.error?.message || `HTTP ${response.status}`;
                        console.warn(`[Nimo AI] Model ${modelName} failed: ${errMsg}`);
                        lastError = new Error(errMsg);
                    }
                } catch (err: any) {
                    console.warn(`[Nimo AI] Model ${modelName} request error:`, err);
                    lastError = err;
                }
            }

            if (!res) {
                throw lastError || new Error('All models failed to respond');
            }

            const json = await res.json();
            const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!reply) throw new Error('AI returned no response');

            let parsedRes = { reply: '', actions: [] as any[] };
            try {
                let cleanJsonStr = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
                parsedRes = JSON.parse(cleanJsonStr);
            } catch(e) {
                parsedRes = { reply: reply, actions: [] };
            }

            const cleanReply = parsedRes.reply || reply;
            setMsgs(prev => [...prev, { role: 'nimo', text: cleanReply }]);

            if (!parsedRes.actions || parsedRes.actions.length === 0) {
                const lowerReply = cleanReply.toLowerCase();
                parsedRes.actions = parsedRes.actions || [];
                
                if (lowerReply.includes('หน้าแรก') || lowerReply.includes('home')) {
                    parsedRes.actions.push({ type: 'navigate_to_page', params: { view: 'home' } });
                } else if (lowerReply.includes('ตั้งค่า') || lowerReply.includes('settings')) {
                    parsedRes.actions.push({ type: 'navigate_to_page', params: { view: 'settings' } });
                } else if (lowerReply.includes('เล่นเพลง') || lowerReply.includes('play')) {
                    parsedRes.actions.push({ type: 'play', params: {} });
                } else if (lowerReply.includes('หยุด') || lowerReply.includes('pause')) {
                    parsedRes.actions.push({ type: 'pause', params: {} });
                }
            }

            if (parsedRes.actions && Array.isArray(parsedRes.actions)) {
                for (const act of parsedRes.actions) {
                    if (act.type) {
                        try {
                            await nimoBrain.executeAction(act.type, act.params);
                        } catch (err) {
                            console.error(`[NimoAction Error] Failed executing ${act.type}:`, err);
                        }
                    }
                }
            }

            if ((wasVoice || handsFree) && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const u = new SpeechSynthesisUtterance(preferredLanguage === 'th' ? fixPronunciation(cleanReply) : cleanReply);
                const isThai = /[\\u0E00-\\u0E7F]/.test(cleanReply);
                u.lang = isThai ? 'th-TH' : 'en-US';
                
                if (isThai) {
                    const voices = window.speechSynthesis.getVoices();
                    const thVoice = voices.find(v => v.lang === 'th-TH' || v.lang.includes('th') || v.lang.includes('TH'));
                    if (thVoice) {
                        u.voice = thVoice;
                    }
                }
                
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

    const sendMsg = (override?: string) => {
        const text = (override ?? input).trim();
        if (!text && !attachedScreenshot) return;
        executeSendMsg(text || (preferredLanguage === 'th' ? 'ช่วยวิเคราะห์ภาพหน้าจอนี้ให้หน่อยค่ะ/ครับ' : 'Please analyze this screenshot.'));
    };

    useEffect(() => {
        const unregTakeScreenshot = nimoBrain.registerAction('take_screenshot', async () => {
            setBusy(true);
            const base64 = await captureScreen();
            if (base64) {
                const promptText = preferredLanguage === 'th'
                    ? "ฉันถ่ายภาพหน้าจอปัจจุบันของฉันแล้ว ช่วยตรวจสอบและวิเคราะห์รายละเอียดบนหน้าจอนี้เพื่อแก้ไขปัญหาหรือแนะนำวิธีใช้ให้ทีครับ/ค่ะ"
                    : "I have captured my current screen. Please inspect it to answer my question or resolve my issue.";
                await executeSendMsg(promptText, base64);
            } else {
                setMsgs(prev => [...prev, { role: 'nimo', text: preferredLanguage === 'th' ? '⚠️ ถ่ายภาพหน้าจอล้มเหลว ไม่สามารถวิเคราะห์ได้ค่ะ' : '⚠️ Screen capture failed. Cannot analyze.' }]);
                setBusy(false);
            }
        });
        return () => {
            unregTakeScreenshot();
        };
    }, [preferredLanguage]);

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
            ref={containerDivRef}
            className="fixed z-[40000] flex flex-col bg-[#0d0d0f] border border-white/10 shadow-2xl overflow-hidden floating-nimo-container"
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
                    <div data-nimo-target="nimo-avatar" className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/30">
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
                {/* Screenshot preview area if attached */}
                {attachedScreenshot && (
                    <div className="flex items-center gap-2 mb-2 p-2 bg-white/5 border border-white/10 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="relative w-12 h-12 rounded overflow-hidden border border-white/20">
                            <img src={attachedScreenshot} alt="preview" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[10px] text-zinc-400 flex-1 truncate">
                            {preferredLanguage === 'th' ? 'แนบภาพหน้าจอแล้ว' : 'Screenshot attached'}
                        </span>
                        <button 
                            onClick={() => setAttachedScreenshot(null)}
                            className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}

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
                        onClick={handleManualScreenshot}
                        disabled={busy}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-cyan-400 active:scale-75 transition-all"
                        title={preferredLanguage === 'th' ? 'จับภาพหน้าจอ' : 'Capture Screen'}
                    >
                        <Camera size={18} />
                    </button>
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
                        disabled={(!input.trim() && !attachedScreenshot) || busy}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                            (input.trim() || attachedScreenshot) ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'bg-white/5 text-zinc-700'
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
