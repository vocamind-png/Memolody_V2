import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Music, MessageSquare, Bot, Sparkles, ChevronRight, Music2, Mic, MicOff } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';
import { Song } from '../../types';
import ScoreLensBar from '../ScoreLens/ScoreLensBar';
import { useScoreLens, ScoreLensResult } from '../ScoreLens/useScoreLens';
import { nimoBrain } from '../../lib/NimoBrain';

interface Message {
    role: 'user' | 'nimo';
    content: string;
    imageUrl?: string;  // Optional image preview in chat bubble
    timestamp: number;
    actionData?: { song: any, xmlData: string }; // Optional action button to open song
}

interface NimoPageProps {
    selectedSong?: any;
    xmlData?: string | null;
    preferredLanguage?: 'th' | 'en';
    onSongSelect?: (song: Song, xml: string, mode?: 'listen' | 'studio') => void;
    onRefresh?: () => void;
    initialFile?: File | null;  // File passed from Home Import → auto-process
}

const NimoPage: React.FC<NimoPageProps> = ({ selectedSong, xmlData, preferredLanguage = 'en', onSongSelect, onRefresh, initialFile }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');

    // ScoreLens state
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const { processImage, isProcessing, progress, error } = useScoreLens();

    // Voice & Hands-free States
    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [handsFree, setHandsFree] = useState(() => localStorage.getItem('nimo_hands_free') === 'true');
    const [status, setStatus] = useState('');
    const [permState, setPermState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
    const [isTyping, setIsTyping] = useState(false);

    const usedMic = useRef(false);
    const recRef = useRef<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const handsFreeRef = useRef(handsFree);
    const isTypingRef = useRef(isTyping);
    const speakingRef = useRef(speaking);

    useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
    useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);
    useEffect(() => { speakingRef.current = speaking; }, [speaking]);

    // Initial permission check for mic
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

    // Setup welcome message
    useEffect(() => {
        setMessages([
            {
                role: 'nimo',
                content: preferredLanguage === 'en'
                    ? "Hi! I'm Nimo, your AI music assistant 🎵 Ask me anything about music theory, chords, or tap 📷 to scan sheet music!"
                    : "สวัสดีค่ะ! Nimo พร้อมช่วยนำทางและตอบคำถามแล้วค่ะ กด 📷 เพื่อสแกนโน้ตเพลงได้เลยนะคะ!",
                timestamp: Date.now()
            }
        ]);
    }, [preferredLanguage]);

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
            handleSend(t);
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
            if (handsFreeRef.current && !isTypingRef.current && !speakingRef.current) {
                setTimeout(() => {
                    startListening();
                }, 500);
            }
        };
        recRef.current = r;
    }, [preferredLanguage]);

    const startListening = () => {
        if (listening || speakingRef.current || isTypingRef.current) return;
        try {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            recRef.current?.start();
        } catch (e) {
            console.warn('[startListening Error]', e);
        }
    };

    const toggleMic = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setStatus(preferredLanguage === 'th' ? '⚠️ ต้องใช้ Chrome หรือบราวเซอร์ที่รองรับ Speech Recognition' : '⚠️ Speech Recognition not supported on this browser');
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

    const toggleHandsFree = () => {
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
    };

    const fixPronunciation = (text: string) => 
        text.replace(/Memolody/gi, 'เมมโมโลดี้').replace(/Nimo/gi, 'นิโม่');

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // ── ScoreLens: Handle file selection ──────────────────────────────
    const handleFileSelected = useCallback((file: File) => {
        setPendingFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
    }, []);

    const handleClearPreview = useCallback(() => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPendingFile(null);
    }, [previewUrl]);

    // ── ScoreLens: Handle clipboard paste (Ctrl+V / Cmd+V) ───────────
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    handleFileSelected(file);
                }
                return;
            }
        }
    }, [handleFileSelected]);

    // ── ScoreLens: Handle drag & drop ────────────────────────────────
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer?.types?.includes('Files')) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const isImageOrPdf = file.type.startsWith('image/') || file.type === 'application/pdf';
        const isMusicFile = file.name.toLowerCase().endsWith('.emk') || 
                           file.name.toLowerCase().endsWith('.mid') || 
                           file.name.toLowerCase().endsWith('.midi') ||
                           file.name.toLowerCase().endsWith('.xml') ||
                           file.name.toLowerCase().endsWith('.musicxml') ||
                           file.name.toLowerCase().endsWith('.mxl');

        if (isImageOrPdf || isMusicFile) {
            handleFileSelected(file);
        }
    }, [handleFileSelected]);

    // ── ScoreLens: Handle process image when user sends ────────────────────
    const handleScoreLensSend = useCallback(async () => {
        if (!pendingFile) return;

        const imageUrl = previewUrl;

        // Add user message with image preview
        setMessages(prev => [...prev, {
            role: 'user',
            content: preferredLanguage === 'th' ? '📷 สแกนโน้ตเพลงจากภาพ' : '📷 Scan sheet music from image',
            imageUrl: imageUrl || undefined,
            timestamp: Date.now()
        }]);

        // Clear preview
        setPendingFile(null);
        setPreviewUrl(null);

        // Add Nimo processing message
        setMessages(prev => [...prev, {
            role: 'nimo',
            content: preferredLanguage === 'th'
                ? '🔍 ดิฉันกำลังอ่านโน้ตเพลงในภาพค่ะ... กรุณารอสักครู่นะคะ'
                : '🔍 Reading the sheet music in your image... Please wait a moment.',
            timestamp: Date.now()
        }]);

        setIsTyping(true);

        // Capture the file before clearing
        const fileToProcess = pendingFile!;
        const result = await processImage(fileToProcess, preferredLanguage);

        setIsTyping(false);

        if (result && 'song' in result) {
            // Count notes for info
            const noteCount = (result.xmlData.match(/<note/g) || []).length;
            
            // Success — show result and offer to play
            const successContent = preferredLanguage === 'th'
                ? `✅ แปลงสำเร็จค่ะ! เพลง **"${result.song.title}"** โดย ${result.song.artist} 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | โน้ต: ${noteCount} ตัว\n\nระบบจะพาคุณไปหน้า Player โดยอัตโนมัติ หรือกดปุ่มด้านล่างเพื่อฟังได้เลยค่ะ ▶️`
                : `✅ Done! Song **"${result.song.title}"** by ${result.song.artist} 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | Notes: ${noteCount}\n\nAuto-navigating to Player, or tap below to listen ▶️`;

            setMessages(prev => [...prev, {
                role: 'nimo',
                content: successContent,
                timestamp: Date.now(),
                actionData: { song: result.song, xmlData: result.xmlData }
            }]);

            // Speak success
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const speechText = preferredLanguage === 'th' 
                    ? `แปลงสำเร็จแล้วค่ะ เพลง ${result.song.title} โดย ${result.song.artist || 'สโกเลนส์ เอไอ'}`
                    : `Conversion complete. ${result.song.title} by ${result.song.artist || 'ScoreLens AI'}`;
                const u = new SpeechSynthesisUtterance(preferredLanguage === 'th' ? fixPronunciation(speechText) : speechText);
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

            // Trigger refresh so the song appears in My Songs
            onRefresh?.();

            // Auto-navigate to player after a short delay
            setTimeout(async () => {
                try {
                    await onSongSelect?.(result.song, result.xmlData, 'listen');
                } catch (err) {
                    console.error('[ScoreLens] Auto-navigate failed:', err);
                }
            }, 3000);

        } else {
            // Error — get error message directly from result
            const errMsg = result && 'error' in result ? result.error : 'Unknown error';
            const failContent = preferredLanguage === 'th'
                ? `❌ ไม่สามารถแปลงได้ค่ะ: ${errMsg}\n\nลองถ่ายภาพใหม่ให้ชัดขึ้น หรือใช้ภาพที่มีความละเอียดสูงนะคะ`
                : `❌ Could not convert: ${errMsg}\n\nTry a clearer photo or higher resolution image.`;

            setMessages(prev => [...prev, {
                role: 'nimo',
                content: failContent,
                timestamp: Date.now()
            }]);

            // Speak failure
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const speechText = preferredLanguage === 'th' 
                    ? `ขออภัยค่ะ ไม่สามารถแปลงโน้ตได้สำเร็จ กรุณาลองใหม่อีกครั้งนะคะ`
                    : `Sorry, could not convert. Please try again.`;
                const u = new SpeechSynthesisUtterance(preferredLanguage === 'th' ? fixPronunciation(speechText) : speechText);
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
        }
    }, [pendingFile, previewUrl, preferredLanguage, processImage, onSongSelect, onRefresh, handsFree]);

    // ── Auto-process file passed from Home Import ──────────────────────
    const initialFileProcessed = useRef(false);
    useEffect(() => {
        if (initialFile && !initialFileProcessed.current) {
            initialFileProcessed.current = true;
            console.log('[NimoPage] Auto-processing file from Home:', initialFile.name);
            setPendingFile(initialFile);
            setPreviewUrl(URL.createObjectURL(initialFile));
            setTimeout(() => {
                handleScoreLensSend();
            }, 300);
        }
    }, [initialFile, handleScoreLensSend]);

    // ── Send Handler (text or ScoreLens) ─────────────────────────────
    const handleSend = async (override?: string) => {
        if (pendingFile && !override) {
            await handleScoreLensSend();
            return;
        }

        const text = (override ?? input).trim();
        if (!text || isTyping) return;

        const wasVoice = usedMic.current;
        usedMic.current = false;

        setInput('');
        setIsTyping(true);
        setStatus('');
        setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);

        // Check for secret command override
        if (typeof window !== 'undefined' && window.NimoBrain && window.NimoBrain.processSecretCommand(text)) {
            const confirmationText = preferredLanguage === 'th' 
                ? 'ดำเนินการคำสั่งลับสำเร็จแล้วค่ะ'
                : 'Secret command override executed.';
                
            setMessages(prev => [...prev, { role: 'nimo', content: confirmationText, timestamp: Date.now() }]);
            setIsTyping(false);

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
            // @ts-ignore
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
            if (!apiKey) throw new Error('System: API Key missing');

            const appState = typeof window !== 'undefined' && window.NimoBrain 
                ? window.NimoBrain.getState() 
                : {};
            const appStateStr = JSON.stringify(appState, null, 2);

            const suffix = preferredLanguage === 'th' ? 'ค่ะ' : '';

            // System instructions
            const sys = preferredLanguage === 'th'
                ? `คุณคือ Nimo AI ผู้ช่วยอัจฉริยะส่วนกลางของแอพพลิเคชัน Memolody V2
คุณทำหน้าที่เป็นแกนสมองหลัก ควบคุม UI ปุ่มกด และการเล่นดนตรีผ่านคำสั่งเสียงของผู้ใช้

สถานะปัจจุบันของแอพพลิเคชัน (Application State):
${appStateStr}

ข้อมูลความรู้เกี่ยวกับฟังก์ชันปรับแต่งเสียงของ Vocalido (Timbre Designer):
1. Speed: ยืดหรือหดความยาวของไฟล์เสียงทั้งหมด
2. SVS Timing Feel: ปรับตำแหน่งเวลาในการออกเสียงพยัญชนะ (0 = หุ่นยนต์ตรงจังหวะเป๊ะ, 50 = มนุษย์ทั่วไป, 100 = ร้องคร่อมจังหวะ/เลย์แบ็ค)
3. Pitch Shift: ปรับระดับเสียงคีย์เพลงให้สูงขึ้นหรือต่ำลง (เหมือนเปลี่ยนคีย์เพลง ทำให้เสียงเหมือนชิปมังค์เมื่อปรับสูง)
4. Formant: เปลี่ยนคาแรคเตอร์เสียง (เช่น แปลงเสียงผู้ชายเป็นผู้หญิง) โดยไม่เปลี่ยนคีย์เพลง (เปลี่ยนขนาดช่องคอจำลอง)
5. Portamento (Glide): การลากโน้ต/ดัดเสียง ให้เสียงสไลด์หากันอย่างนุ่มนวลระหว่าง 2 โน้ต
6. Warmth / Brightness: ปรับ EQ (Warmth เพิ่มความหนา, Brightness เพิ่มความสว่างใส)
(หมายเหตุ: ไม่มีปุ่มไหนที่ทำงานซ้ำซ้อนกันในทางเทคนิคหรือคณิตศาสตร์)

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

Knowledge Base - Vocalido Timbre Designer Parameters:
1. Speed: Time-stretches the entire audio.
2. SVS Timing Feel: Adjusts consonant borrowing and phoneme timing (0 = robotic, 50 = natural human, 100 = lazy/jazz).
3. Pitch Shift: Shifts fundamental frequency (chipmunk effect when high).
4. Formant: Shifts spectral envelope without changing musical key (changes vocal tract size, male to female).
5. Portamento (Glide): Smooth pitch curve interpolation between two notes.
6. Warmth / Brightness: EQ adjustments (Warmth boosts low-mids, Brightness boosts high frequencies).
(Note: None of these parameters are technically redundant mathematically.)

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

            // Direct API call
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
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
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
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
            setMessages(prev => [...prev, { role: 'nimo', content: cleanReply, timestamp: Date.now() }]);

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

        } catch (error: any) {
            console.error("Gemini Error:", error);
            const errMsg = preferredLanguage === 'th' 
                ? `ขออภัยค่ะ พอดีขัดข้องนิดหน่อย: ${error.message}` 
                : `Sorry, there was an issue: ${error.message}`;
            setMessages(prev => [...prev, { role: 'nimo', content: errMsg, timestamp: Date.now() }]);
            if (handsFree) {
                setTimeout(() => startListening(), 500);
            }
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div
            className="min-h-screen bg-[#050507] flex flex-col items-center pb-32 font-sans overflow-hidden relative w-full"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                .chat-msg { animation: slideIn 0.3s ease-out; }
                @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .typing-dot { animation: blink 1.4s infinite; }
                @keyframes blink { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .drop-zone-pulse { animation: dropPulse 1.5s ease-in-out infinite; }
                @keyframes dropPulse { 0%, 100% { border-color: rgba(0,229,255,0.3); } 50% { border-color: rgba(0,229,255,0.8); } }
                @keyframes wave {
                    0%, 100% { transform: scaleY(0.3); }
                    50% { transform: scaleY(1.3); }
                }
                .animate-wave {
                    animation: wave 0.8s ease-in-out infinite;
                    transform-origin: center;
                }
            `}</style>

            {/* Drop Zone Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                    <div className="w-72 h-72 border-4 border-dashed border-cyan-500 rounded-[40px] flex flex-col items-center justify-center gap-4 drop-zone-pulse">
                        <div className="text-6xl">🎵</div>
                        <p className="text-cyan-400 text-sm font-black uppercase tracking-widest">Drop Sheet Music</p>
                        <p className="text-zinc-500 text-[10px] font-bold">PNG, JPEG, PDF</p>
                    </div>
                </div>
            )}

            <div className="w-full max-w-xl px-4 py-8 flex flex-col gap-6 h-[calc(100vh-80px)]">
                {/* Header */}
                <div className="text-center shrink-0">
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-cyan-500" />
                        <span className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.4em]">Neural Music Engine</span>
                        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-cyan-500" />
                    </div>
                    <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase">NIMO AI</h1>
                    <p className="text-sm text-zinc-500 font-bold italic mt-1">"Wisdom of Play by Ear and Hear by Eye"</p>
                </div>

                {/* Identity Card */}
                <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-[32px] p-5 flex items-center justify-between backdrop-blur-xl shrink-0 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(0,229,255,0.2)] shrink-0">
                            <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover object-top scale-125" alt="Nimo" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-white italic uppercase">Nimo v2.0</span>
                                <div className="px-2 py-0.5 bg-cyan-500 text-[8px] font-bold text-black rounded-full uppercase tracking-tighter">Central Control</div>
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">System brain active. Scan sheet music 📷 or command with voice 🎙️</p>
                        </div>
                    </div>
                    
                    {/* Hands free switch */}
                    <button
                        onClick={toggleHandsFree}
                        className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 shrink-0 ${
                            handsFree 
                                ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]' 
                                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300'
                        }`}
                        title={preferredLanguage === 'th' ? 'โหมดคุยต่อเนื่องแฮนด์ฟรี' : 'Hands-Free Continuous Mode'}
                    >
                        <Sparkles size={10} />
                        {preferredLanguage === 'th' ? 'คุยต่อเนื่อง' : 'Hands-free'}
                    </button>
                </div>

                {/* Chat Container */}
                <div
                    ref={scrollRef}
                    className="flex-1 bg-white/[0.02] border border-white/5 rounded-[40px] p-6 overflow-y-auto no-scrollbar flex flex-col gap-4"
                >
                    {messages.map((msg, i) => (
                        <div key={msg.timestamp + i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} chat-msg`}>
                            <div className={`max-w-[85%] px-5 py-3.5 rounded-[24px] text-[13px] leading-relaxed ${msg.role === 'user'
                                ? 'bg-zinc-800 text-white rounded-br-none'
                                : 'bg-cyan-500/10 text-cyan-100 border border-cyan-500/20 rounded-bl-none'
                                }`}>
                                {/* Image preview in chat bubble */}
                                {msg.imageUrl && (
                                    <div className="mb-3 rounded-xl overflow-hidden border border-white/10 w-40 h-40">
                                        <img src={msg.imageUrl} alt="Sheet music" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                                {msg.actionData && (
                                    <button 
                                        onClick={() => onSongSelect?.(msg.actionData!.song, msg.actionData!.xmlData, 'listen')}
                                        className="mt-3 w-full bg-cyan-500 hover:bg-cyan-400 text-black py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] active:scale-95"
                                    >
                                        <Music2 size={14} /> 
                                        {preferredLanguage === 'th' ? 'เปิดฟังเพลง (Listen)' : 'Open in Player'}
                                    </button>
                                )}
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
                    {permState === 'prompt' && !isTyping && (
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
                                onClick={() => {
                                    setPermState('granted');
                                    startListening();
                                }}
                                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black uppercase rounded-xl shadow-[0_4px_20px_rgba(0,229,255,0.4)] active:scale-95 transition-all"
                            >
                                {preferredLanguage === 'th' ? '👉 เปิดใช้งานไมค์ที่นี่ 👈' : '👉 Enable Microphone Now 👈'}
                            </button>
                        </div>
                    )}

                    {/* ScoreLens processing progress */}
                    {isProcessing && progress && (
                        <div className="flex justify-start chat-msg">
                            <div className="bg-amber-500/10 border border-amber-500/20 px-5 py-3 rounded-[20px] rounded-bl-none text-[12px] text-amber-200 font-bold animate-pulse">
                                {progress}
                            </div>
                        </div>
                    )}

                    {isTyping && (
                        <div className="flex justify-start chat-msg">
                            <div className="bg-cyan-500/5 border border-cyan-500/10 px-5 py-3 rounded-[20px] rounded-bl-none flex gap-1">
                                <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full typing-dot" />
                                <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full typing-dot [animation-delay:0.2s]" />
                                <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full typing-dot [animation-delay:0.4s]" />
                            </div>
                        </div>
                    )}
                    
                    {status && <p className="text-center text-[10px] text-amber-500 font-bold uppercase tracking-wider py-2 animate-pulse">{status}</p>}
                </div>

                {/* Input Area with ScoreLens & Mic Buttons */}
                <div className="shrink-0 flex flex-col">
                    {/* Image preview above input bar */}
                    {previewUrl && (
                        <ScoreLensBar
                            onFileSelected={handleFileSelected}
                            isProcessing={isProcessing}
                            previewUrl={previewUrl}
                            onClearPreview={handleClearPreview}
                        />
                    )}

                    <div className="bg-white/5 border border-white/10 rounded-[32px] p-2 flex items-center gap-1 focus-within:border-cyan-500/50 transition-all shadow-2xl backdrop-blur-2xl mb-4">
                        {/* ScoreLens: Camera & File buttons */}
                        {!previewUrl && (
                            <ScoreLensBar
                                onFileSelected={handleFileSelected}
                                isProcessing={isProcessing}
                                previewUrl={null}
                                onClearPreview={handleClearPreview}
                            />
                        )}

                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            onPaste={handlePaste}
                            placeholder={previewUrl
                                ? (preferredLanguage === 'th' ? 'กด Send เพื่อสแกนโน้ต...' : 'Press Send to scan...')
                                : (preferredLanguage === 'th' ? 'สั่ง Nimo ด้วยเสียงหรือพิมพ์...' : 'Command Nimo with voice or text...')}
                            className="flex-1 bg-transparent border-none outline-none text-white px-3 py-2 text-sm placeholder:text-zinc-600 disabled:opacity-50"
                            disabled={isProcessing}
                        />

                        {/* Mic Trigger */}
                        <button 
                            onClick={toggleMic}
                            disabled={isProcessing || isTyping}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 ${
                                listening ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-zinc-500 hover:text-cyan-400'
                            }`}
                        >
                            {listening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        <button
                            onClick={() => handleSend()}
                            disabled={(!input.trim() && !pendingFile) || isTyping || isProcessing}
                            className={`w-12 h-12 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 shrink-0 ${
                                pendingFile ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]' : 'bg-white text-black'
                            }`}
                        >
                            {pendingFile ? <Music2 size={18} /> : <Send size={18} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NimoPage;
