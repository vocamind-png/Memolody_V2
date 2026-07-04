import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Mic, MicOff, MessageCircle, Sparkles, Camera, Trash2, Volume2, VolumeX, Maximize2, Copy, Check, PlusCircle } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';
import { NimoBrainRegistry, nimoBrain } from '../../lib/NimoBrain';
import { GeminiLiveClient } from '../../lib/GeminiLiveClient';
import { useScoreLens } from '../ScoreLens/useScoreLens';

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

const matchLocalCommand = (transcript: string, lang: 'th' | 'en'): { action: string; params: any; reply: string } | null => {
    const text = transcript.toLowerCase().trim().replace(/[.?]/g, '');
    
    // Playback Play
    if (/^(play|start play|เล่นเพลง|เล่นดนตรี|เล่น)$/.test(text) || text.includes('เล่นเพลง')) {
        return {
            action: 'play',
            params: {},
            reply: lang === 'th' ? 'กำลังเล่นเพลงค่ะ' : 'Playing music.'
        };
    }
    // Playback Pause
    if (/^(pause|stop play|หยุดเพลง|หยุด)$/.test(text) || text.includes('หยุดเพลง') || text.includes('หยุดก่อน') || text.includes('หยุดเล่น')) {
        return {
            action: 'pause',
            params: {},
            reply: lang === 'th' ? 'หยุดเล่นเพลงแล้วค่ะ' : 'Paused music.'
        };
    }
    // Navigation
    if (/^(go home|go to home|ไปหน้าแรก|กลับหน้าแรก|หน้าแรก)$/.test(text) || text.includes('หน้าแรก')) {
        return {
            action: 'navigate_to_page',
            params: { view: 'home' },
            reply: lang === 'th' ? 'กำลังเปิดหน้าแรกค่ะ' : 'Opening home page.'
        };
    }
    if (/^(go to player|ไปหน้าเครื่องเล่น|เครื่องเล่น|เพลเยอร์)$/.test(text) || text.includes('เครื่องเล่น') || text.includes('หน้าเครื่องเล่น')) {
        return {
            action: 'navigate_to_page',
            params: { view: 'player' },
            reply: lang === 'th' ? 'กำลังเปิดหน้าเครื่องเล่นค่ะ' : 'Opening player page.'
        };
    }
    if (/^(go to settings|ไปหน้าตั้งค่า|ตั้งค่า)$/.test(text) || text.includes('ตั้งค่า') || text.includes('หน้าตั้งค่า')) {
        return {
            action: 'navigate_to_page',
            params: { view: 'settings' },
            reply: lang === 'th' ? 'กำลังเปิดหน้าตั้งค่าค่ะ' : 'Opening settings page.'
        };
    }
    if (/^(go to forge|go to studio|ไปหน้าสตูดิโอ|ไปหน้าฟอร์จ|หน้าสตูดิโอ)$/.test(text) || text.includes('สตูดิโอ') || text.includes('หน้าฟอร์จ')) {
        return {
            action: 'navigate_to_page',
            params: { view: 'forge' },
            reply: lang === 'th' ? 'กำลังเปิดหน้าสตูดิโอค่ะ' : 'Opening studio page.'
        };
    }
    
    // Arrange
    if (text.includes('arrange') || text.includes('เรียบเรียง')) {
        return {
            action: 'arrange_song',
            params: {},
            reply: lang === 'th' ? 'กำลังพาไปเรียบเรียงเพลงค่ะ' : 'Preparing to arrange song.'
        };
    }
    
    // Teach
    if (text.includes('teach me') || text.includes('สอนหน่อย') || text.includes('แบบฝึกหัด')) {
        return {
            action: 'teach_me',
            params: {},
            reply: lang === 'th' ? 'กำลังเปิดโหมดแบบฝึกหัดค่ะ' : 'Opening practice mode.'
        };
    }

    // MusicGen Send Lyric Trigger
    if (text.includes('ส่งไปที่ musicgen') || text.includes('ส่งเนื้อเพลงไป musicgen') || text.includes('ส่งเนื้อเพลง') || text.includes('send to musicgen')) {
        return {
            action: 'send_to_musicgen_local',
            params: {},
            reply: lang === 'th' ? 'กำลังส่งเนื้อเพลงไปที่ MusicGen และเปิดหน้าสตูดิโอค่ะ' : 'Sending lyrics to MusicGen and opening studio.'
        };
    }

    return null;
};

const extractLastLyrics = (messageList: Msg[]): string => {
    for (let i = messageList.length - 1; i >= 0; i--) {
        const m = messageList[i];
        if (m.role === 'nimo' && m.text.includes('\n') && m.text.length > 25) {
            return m.text;
        }
    }
    return '';
};

interface Props {
    isOpenProp?: boolean;
    setIsOpenProp?: (v: boolean) => void;
    voiceType?: string;
    preferredLanguage?: 'th' | 'en';
    geminiModel?: string;
    isSidebarMode?: boolean;
    position?: 'left' | 'right';
}

export const FloatingNimoContent: React.FC<Props> = ({
    isOpenProp, setIsOpenProp,
    voiceType = 'teen_girl', preferredLanguage = 'en',
    geminiModel = 'gemini-3.5-flash', isSidebarMode = false, position = 'right'
}) => {
    const [open, setOpen] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const isOpen = isOpenProp !== undefined ? isOpenProp : open;
    const setIsOpen = setIsOpenProp ?? setOpen;

    const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
    const nimoAvatarUrl = isMale ? '/NimoBoy.jpg' : '/Nimo.png';

    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [handsFree, setHandsFree] = useState(() => localStorage.getItem('nimo_hands_free') !== 'false');
    const [status, setStatus] = useState('');
    const [permState, setPermState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
    const [userAudioLevel, setUserAudioLevel] = useState(0);
    const [nimoAudioLevel, setNimoAudioLevel] = useState(0);

    const [wokenUp, setWokenUp] = useState(false);
    const [refSpeakerVolume, setRefSpeakerVolume] = useState<number | null>(null);
    const [lockStatus, setLockStatus] = useState<string>('');
    const peakVolumeRef = useRef<number>(0);
    const [speakerMuted, setSpeakerMuted] = useState(() => localStorage.getItem('nimo_speaker_muted') === 'true');

    const recRef = useRef<any>(null);
    const isRecognitionRunningRef = useRef(false);
    const hasPermissionErrorRef = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const containerDivRef = useRef<HTMLDivElement>(null);
    const msgsEndRef = useRef<HTMLDivElement>(null);
    const liveClientRef = useRef<GeminiLiveClient | null>(null);
    const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error'>('idle');
    
    // OMR Camera and Music Import refs
    const omrCameraRef = useRef<HTMLInputElement>(null);
    const musicImportRef = useRef<HTMLInputElement>(null);
    
    // usedMic tracks if the last message was voice input
    const usedMic = useRef(false);
    const activeAudioRef = useRef<HTMLAudioElement | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const handsFreeRef = useRef(handsFree);
    const busyRef = useRef(busy);
    const speakingRef = useRef(speaking);
    const wokenUpRef = useRef(wokenUp);
    const refSpeakerVolumeRef = useRef(refSpeakerVolume);
    const preferredLanguageRef = useRef(preferredLanguage);
    const msgsRef = useRef(msgs);
    const speakerMutedRef = useRef(speakerMuted);

    const { processImage, isProcessing: omrProcessing, progress: omrProgress, error: omrError } = useScoreLens();

    useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
    useEffect(() => { busyRef.current = busy; }, [busy]);
    useEffect(() => { speakingRef.current = speaking; }, [speaking]);
    useEffect(() => { wokenUpRef.current = wokenUp; }, [wokenUp]);
    useEffect(() => { refSpeakerVolumeRef.current = refSpeakerVolume; }, [refSpeakerVolume]);
    useEffect(() => { preferredLanguageRef.current = preferredLanguage; }, [preferredLanguage]);
    useEffect(() => { msgsRef.current = msgs; }, [msgs]);
    useEffect(() => { speakerMutedRef.current = speakerMuted; }, [speakerMuted]);

    useEffect(() => {
        if (omrProgress) setStatus(omrProgress);
        else if (omrProcessing) setStatus(preferredLanguage === 'th' ? 'กำลังประมวลผล...' : 'Processing...');
        else setStatus('');
    }, [omrProgress, omrProcessing, preferredLanguage]);

    useEffect(() => {
        if (omrError) {
            setMsgs(prev => [...prev, { role: 'nimo', text: preferredLanguage === 'th' ? `❌ ไม่สามารถอ่านโน้ตเพลงได้: ${omrError}` : `❌ Failed to read sheet music: ${omrError}` }]);
            setStatus('');
        }
    }, [omrError, preferredLanguage]);

    useEffect(() => {
        if (isOpen) {
            setWokenUp(true);
        }
    }, [isOpen]);

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

        if (level > peakVolumeRef.current) {
            peakVolumeRef.current = level;
        }

        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }, []);

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

    const startLiveMode = (stream?: MediaStream, ctx?: AudioContext) => {
        if (liveClientRef.current) return;
        
        // @ts-ignore
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        let proxyUrl = undefined;
        const apiKey = localStorage.getItem('gemini_api_key') || undefined;

        if (supabaseUrl) {
            const wsBase = supabaseUrl.replace(/^http/, 'ws');
            proxyUrl = `${wsBase}/functions/v1/gemini-live`;
        }

        if (!proxyUrl && !apiKey) {
            setStatus(preferredLanguage === 'th' ? '⚠️ กรุณาตั้งค่า Gemini API Key หรือเปิดใช้งาน Supabase' : '⚠️ Please set Gemini API Key or enable Supabase');
            return;
        }

        const client = new GeminiLiveClient({
            apiKey,
            proxyUrl,
            nimoBrain,
            language: preferredLanguage,
            audioContext: ctx,
            micStream: stream,
            enableMic: !!stream,
            onStateChange: (state) => {
                setLiveState(state);
                if (state === 'listening' || state === 'connected') {
                    setStatus(preferredLanguage === 'th' ? '🟢 Live Mode (พูดได้เลย)' : '🟢 Live Mode (Speak now)');
                    setListening(true);
                    setSpeaking(false);
                } else if (state === 'speaking') {
                    setStatus(preferredLanguage === 'th' ? '🔊 กำลังพูด...' : '🔊 Speaking...');
                    setSpeaking(true);
                    setListening(false);
                } else if (state === 'idle' || state === 'error') {
                    setListening(false);
                    setSpeaking(false);
                    setStatus(preferredLanguage === 'th' ? '💤 สแตนด์บาย' : '💤 Standby');
                }
            },
            onVolumeChange: (micVol, speakerVol) => {
                setUserAudioLevel(micVol);
                setNimoAudioLevel(speakerVol);
            },
            onMessage: (role, text) => {
                setMsgs(prev => [...prev, { role, text }]);
            },
            onLog: (msg) => {
                console.log(`[Nimo Live] ${msg}`);
            }
        });
        
        liveClientRef.current = client;
        client.connect();
    };

    const stopLiveMode = () => {
        if (liveClientRef.current) {
            liveClientRef.current.disconnect();
            liveClientRef.current = null;
        }
        setLiveState('idle');
        setListening(false);
        setSpeaking(false);
        setStatus(preferredLanguage === 'th' ? '💤 สแตนด์บาย' : '💤 Standby');
    };

    const startListening = () => {
        if (liveClientRef.current) return; // Do not use old mic if live mode is active
        if (isRecognitionRunningRef.current || speakingRef.current || busyRef.current) return;
        try {
            stopSpeaking();
            isRecognitionRunningRef.current = true;
            recRef.current?.start();
        } catch (e) {
            isRecognitionRunningRef.current = false;
            console.warn('[startListening Error]', e);
        }
    };

    const requestPermission = () => {
        setStatus(preferredLanguage === 'th' ? '⏳ กำลังเตรียม...' : '⏳ Preparing...');
        stopSpeaking();
        
        hasPermissionErrorRef.current = false;
        isRecognitionRunningRef.current = true;
        try {
            recRef.current?.start();
        } catch (e) {
            isRecognitionRunningRef.current = false;
        }

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    stream.getTracks().forEach(track => track.stop());
                    setPermState('granted');
                    if (!isRecognitionRunningRef.current) {
                        try {
                            isRecognitionRunningRef.current = true;
                            recRef.current?.start();
                        } catch(e) {}
                    }
                })
                .catch(err => {
                    isRecognitionRunningRef.current = false;
                    setPermState('denied');
                    setStatus(preferredLanguage === 'th' ? '🔴 ขออภัย กรุณาปลดล็อกไมค์ 🔒' : '🔴 Please unblock mic 🔒');
                });
        } else {
            setPermState('granted');
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
        let lastStart = 0;

        r.onstart = () => {
            isRecognitionRunningRef.current = true;
            setListening(true);
            lastStart = Date.now();
            if (wokenUpRef.current) {
                setStatus(preferredLanguageRef.current === 'th' ? '🎙️ กำลังฟัง... (พูดได้เลย)' : '🎙️ Listening...');
            } else {
                setStatus(preferredLanguageRef.current === 'th' ? '💤 สแตนด์บาย (พูด "Hey Nimo")' : '💤 Standby (Say "Hey Nimo")');
            }
        };
        r.onresult = (e: any) => {
            const t = Array.from(e.results).map((res: any) => res[0].transcript).join('');
            const text = t.trim();
            if (!text) {
                setListening(false);
                return;
            }

            const peakVol = peakVolumeRef.current;
            peakVolumeRef.current = 0; // reset
            const lowerText = text.toLowerCase();
            const lang = preferredLanguageRef.current;

            // 1. Wake word detection in standby
            const wakeWords = ["hey nimo", "hello nimo", "hi nimo", "เฮ้ นิโม", "เฮ้ นิโม่", "ฮัลโหล นิโม", "ฮัลโหล นิโม่", "ไฮ นิโม", "ไฮ นิโม่"];
            const isWakeWord = wakeWords.some(w => lowerText.includes(w));

            if (!wokenUpRef.current) {
                if (isWakeWord) {
                    setWokenUp(true);
                    setIsOpen(true);
                    setListening(false);
                    try { recRef.current?.stop(); } catch(e){}
                    startLiveMode();
                } else {
                    setListening(false);
                }
                return;
            }

            // 2. Speaker validation if already woken up
            if (refSpeakerVolumeRef.current !== null) {
                const threshold = refSpeakerVolumeRef.current * 0.45;
                if (peakVol < threshold && peakVol > 0) {
                    console.log(`[Nimo Lock-on] Ignored background voice. Peak: ${peakVol}, Threshold: ${threshold}`);
                    setStatus(lang === 'th' ? '🔊 ข้ามเสียงรบกวนพื้นหลัง (ล็อกผู้ใช้หลัก)' : '🔊 Background speech ignored');
                    setListening(false);
                    setTimeout(() => startListening(), 800);
                    return;
                }
            } else {
                if (peakVol > 5) {
                    setRefSpeakerVolume(peakVol);
                    setLockStatus(lang === 'th' ? `🔒 ล็อกเสียงผู้ใช้ (ระดับ: ${Math.round(peakVol)}%)` : `🔒 Locked to User (Level: ${Math.round(peakVol)}%)`);
                }
            }

            // 3. Deactivation commands (Fallback if using text mode)
            const byeWords = ["bye nimo", "bye bye", "see ya", "bye,see ya", "see you around", "บายนิโม่", "บาย นิโม", "บ๊ายบาย", "บายๆ", "ลาก่อน"];
            const isByeWord = byeWords.some(w => lowerText.includes(w));
            if (isByeWord) {
                setWokenUp(false);
                setIsOpen(false);
                setRefSpeakerVolume(null);
                setLockStatus('');
                setListening(false);
                stopLiveMode();
                setMsgs(prev => [...prev, { role: 'user', text }]);
                setMsgs(prev => [...prev, { role: 'nimo', text: lang === 'th' ? 'พักผ่อนนะ เดี๋ยวเจอกัน!' : 'Alright, taking a nap. See ya!' }]);
                
                if (!speakerMutedRef.current) {
                    const byeReply = lang === 'th' ? 'พักผ่อนนะ เดี๋ยวเจอกัน!' : 'Alright, taking a nap. See ya!';
                    playVoiceSpeech(byeReply, lang);
                }
                return;
            }

            // 4. Intercept Local Fast-Path Command
            const localCmd = matchLocalCommand(text, lang);
            if (localCmd) {
                console.log("[Nimo Fast-Path] Local command matched:", localCmd);
                setListening(false);
                setMsgs(prev => [...prev, { role: 'user', text }]);
                
                if (localCmd.action === 'send_to_musicgen_local') {
                    const lyrics = extractLastLyrics(msgsRef.current);
                    if (lyrics) {
                        nimoBrain.executeAction('musicgen_set_lyrics', { lyrics });
                        nimoBrain.executeAction('navigate_to_page', { view: 'forge' });
                    } else {
                        localCmd.reply = lang === 'th' ? 'ไม่พบเนื้อเพลงในประวัติการสนทนาค่ะ' : 'No lyrics found in chat history.';
                    }
                } else {
                    nimoBrain.executeAction(localCmd.action, localCmd.params);
                }

                setMsgs(prev => [...prev, { role: 'nimo', text: localCmd.reply }]);
                
                if (!speakerMutedRef.current) {
                    playVoiceSpeech(localCmd.reply, lang, () => {
                        setTimeout(() => startListening(), 400);
                    }, () => {
                        setTimeout(() => startListening(), 400);
                    });
                } else {
                    setTimeout(() => startListening(), 400);
                }
                return;
            }

            setInput(text);
            setListening(false);
            usedMic.current = true;
            sendMsg(text);
        };
        r.onerror = (e: any) => {
            isRecognitionRunningRef.current = false;
            setListening(false);
            console.error('[Mic Error]', e.error);
            if (e.error === 'not-allowed') {
                hasPermissionErrorRef.current = true;
                setStatus(preferredLanguageRef.current === 'th' ? '🔴 ไม่ได้รับอนุญาตให้ใช้ไมค์' : '🔴 Mic Permission Denied');
                // Auto-clear the status after 3 seconds so it doesn't block UI when user types
                setTimeout(() => setStatus(''), 3000);
            } else {
                if (e.error === 'no-speech') {
                    setStatus('');
                } else {
                    setStatus(preferredLanguageRef.current === 'th' ? `❌ ขออภัย ลองใหม่อีกครั้ง (${e.error})` : `❌ Error: ${e.error}`);
                }
            }
        };
        r.onend = () => {
            isRecognitionRunningRef.current = false;
            setListening(false);
            
            if (hasPermissionErrorRef.current) {
                console.log('[Nimo] Mic loop paused due to permission denial.');
                return;
            }
            
            // On mobile devices, continuous restart will freeze the browser.
            const runDuration = Date.now() - lastStart;
            if (runDuration < 1000) {
                console.warn('[Nimo] Mic stopped too quickly, aborting loop to prevent freeze.');
                return; // Stop the infinite loop!
            }
            
            if ((handsFreeRef.current || !wokenUpRef.current) && !busyRef.current && !speakingRef.current) {
                setTimeout(() => {
                    startListening();
                }, 500);
            }
        };
        recRef.current = r;
    }, []);

    useEffect(() => {
        if (permState === 'granted' && !listening && !speaking && !busy) {
            startListening();
        }
    }, [permState, listening, speaking, busy]);

    const toggleMic = async () => {
        hasPermissionErrorRef.current = false;
        
        if (liveClientRef.current) {
            stopLiveMode();
        } else {
            setStatus(preferredLanguage === 'th' ? '⏳ กำลังเปิดไมค์...' : '⏳ Opening...');
            
            try {
                // Must be executed synchronously in the click handler for iOS Safari
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioContextClass({ sampleRate: 24000 });
                if (ctx.state === 'suspended') {
                    await ctx.resume();
                }

                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("HTTPS_REQUIRED");
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }});

                setPermState('granted');
                startLiveMode(stream, ctx);
            } catch (err: any) {
                console.error('[Mic Access Error]', err);
                setPermState('denied');
                
                const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
                const isInAppBrowser = (ua.indexOf("Line/") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Instagram") > -1);

                if (isInAppBrowser) {
                    setStatus(preferredLanguage === 'th' ? '⚠️ เปิดในแอป LINE ไม่ได้ กรุณากดปุ่ม ⠇ เลือก "เปิดในเบราว์เซอร์"' : '⚠️ In-app browser not supported. Please open in Safari/Chrome.');
                } else if (err.message === "HTTPS_REQUIRED" || err.name === "NotAllowedError") {
                    if (err.message === "HTTPS_REQUIRED") {
                        setStatus(preferredLanguage === 'th' ? '⚠️ ต้องใช้ HTTPS หรือ Localhost' : '⚠️ Requires HTTPS or Localhost');
                    } else {
                        setStatus(preferredLanguage === 'th' ? '🔴 กรุณาอนุญาตไมค์ในการตั้งค่าเบราว์เซอร์' : '🔴 Please allow mic in browser settings');
                    }
                } else {
                    setStatus(`🔴 Mic Error: ${err.name || err.message || 'Unknown'}`);
                }
            }
        }
    };

    const prepareTextForSpeech = (text: string): string => {
        let clean = text;
        
        // Remove markdown formatting
        clean = clean.replace(/\*\*|\*/g, '');
        
        // Remove code blocks and backticks
        clean = clean.replace(/`[^`]+`/g, '').replace(/`/g, '');
        
        // Remove parentheses and brackets and their contents (e.g. (vocal), [Home])
        clean = clean.replace(/\([^)]*\)/g, '');
        clean = clean.replace(/\[[^\]]*\]/g, '');
        
        // Remove emojis and special symbols
        clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
        
        // Translate technical terms to natural Thai speech if Thai
        if (preferredLanguage === 'th') {
            clean = clean.replace(/Memolody/gi, 'เมมโมโลดี้')
                         .replace(/Nimo/gi, 'นิโม่')
                         .replace(/vocalido/gi, 'โวคาลิโด')
                         .replace(/vocal/gi, 'โวคอล')
                         .replace(/instrument/gi, 'อินสตรูเมนท์')
                         .replace(/solo/gi, 'โซโล่')
                         .replace(/mute/gi, 'มิวท์')
                         .replace(/play/gi, 'เล่น')
                         .replace(/pause/gi, 'หยุด')
                         .replace(/settings/gi, 'ตั้งค่า')
                         .replace(/studio/gi, 'สตูดิโอ')
                         .replace(/forge/gi, 'ฟอร์จ')
                         .replace(/home/gi, 'โฮม')
                         .replace(/player/gi, 'เครื่องเล่น');
        }
        
        // Clean multiple spaces
        clean = clean.replace(/\s+/g, ' ').trim();
        return clean;
    };

    const detectLanguageCode = (text: string): string => {
        if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
        if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) return 'ja';
        if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
        if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
        return preferredLanguage || 'en';
    };

    const detectAndApplyUserGender = (userText: string) => {
        const isOverride = localStorage.getItem('nimo_voice_override') === 'true';
        const lowerText = userText.toLowerCase().trim();
        const changeToMale = [
            'เปลี่ยนเป็นเสียงผู้ชาย', 'เปลี่ยนเป็นผู้ชาย', 'คุยกับผู้ชาย', 'ขอเสียงผู้ชาย', 'ขอผู้ชาย', 
            'เปลี่ยนเป็นนีโมผู้ชาย', 'อยากคุยกับนีโมผู้ชาย', 'change to male voice', 'switch to male voice',
            'change to boy voice', 'เปลี่ยนเป็นเพศชาย', 'เปลี่ยนเสียงเป็นผู้ชาย'
        ];
        const changeToFemale = [
            'เปลี่ยนเป็นเสียงผู้หญิง', 'เปลี่ยนเป็นผู้หญิง', 'คุยกับผู้หญิง', 'ขอเสียงผู้หญิง', 'ขอผู้หญิง', 
            'เปลี่ยนเป็นนีโมผู้หญิง', 'อยากคุยกับนีโมผู้หญิง', 'change to female voice', 'switch to female voice',
            'change to girl voice', 'เปลี่ยนเป็นเพศหญิง', 'เปลี่ยนเสียงเป็นผู้หญิง'
        ];

        if (changeToMale.some(phrase => lowerText.includes(phrase))) {
            localStorage.setItem('nimo_voice', 'teen_boy');
            localStorage.setItem('nimo_voice_override', 'true');
            window.dispatchEvent(new Event('nimo_voice_changed'));
            return;
        }

        if (changeToFemale.some(phrase => lowerText.includes(phrase))) {
            localStorage.setItem('nimo_voice', 'teen_girl');
            localStorage.setItem('nimo_voice_override', 'true');
            window.dispatchEvent(new Event('nimo_voice_changed'));
            return;
        }

        if (isOverride) return;

        const maleMarkers = ['ครับ', 'นะครับ', 'ผม', 'กระผม', 'ครับผม', 'ฮะ'];
        const femaleMarkers = ['ค่ะ', 'คะ', 'นะคะ', 'หนู', 'ดิฉัน', 'จ้า', 'ค่ะแม่'];

        const hasMale = maleMarkers.some(m => lowerText.includes(m));
        const hasFemale = femaleMarkers.some(f => lowerText.includes(f));

        if (hasMale && !hasFemale) {
            localStorage.setItem('nimo_voice', 'teen_girl');
            window.dispatchEvent(new Event('nimo_voice_changed'));
        } else if (hasFemale && !hasMale) {
            localStorage.setItem('nimo_voice', 'teen_boy');
            window.dispatchEvent(new Event('nimo_voice_changed'));
        }
    };

    const playVoiceSpeech = (text: string, onEnd?: () => void, onError?: () => void) => {
        stopSpeaking();
        const cleanedText = prepareTextForSpeech(text);
        if (!cleanedText) {
            onEnd?.();
            return;
        }

        const tl = detectLanguageCode(cleanedText);
        const gender = (voiceType === 'teen_girl' || voiceType === 'adult_woman') ? 'female' : 'male';

        setSpeaking(true);

        // 1. Try our high-quality Cloud Neural TTS API via the Vocalido python backend
        fetch('/vocalido/api/ai/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanedText, gender, lang: tl })
        })
        .then(res => {
            if (!res.ok) throw new Error('Cloud TTS endpoint error');
            return res.json();
        })
        .then(data => {
            if (!data.url) throw new Error('No URL returned');
            
            const audio = new Audio(data.url);
            activeAudioRef.current = audio;
            
            // Speed adjustments (neural voices sound very good, minor speed up for teens)
            if (voiceType === 'teen_girl') {
                audio.playbackRate = 1.05;
            } else if (voiceType === 'teen_boy') {
                audio.playbackRate = 1.05;
            }

            audio.onended = () => {
                setSpeaking(false);
                activeAudioRef.current = null;
                onEnd?.();
            };
            audio.onerror = () => {
                activeAudioRef.current = null;
                fallbackSpeakGoogleTranslate(cleanedText, tl, onEnd, onError);
            };
            audio.play().catch(() => {
                fallbackSpeakGoogleTranslate(cleanedText, tl, onEnd, onError);
            });
        })
        .catch(err => {
            console.log('[Cloud TTS API Fallback]', err);
            fallbackSpeakGoogleTranslate(cleanedText, tl, onEnd, onError);
        });
    };

    const fallbackSpeakGoogleTranslate = (cleanedText: string, tl: string, onEnd?: () => void, onError?: () => void) => {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${tl}&client=tw-ob&q=${encodeURIComponent(cleanedText)}`;
        const audio = new Audio(url);
        activeAudioRef.current = audio;

        if (voiceType === 'teen_girl') {
            audio.playbackRate = 1.15;
        } else if (voiceType === 'teen_boy') {
            audio.playbackRate = 1.12;
        }

        audio.onended = () => {
            setSpeaking(false);
            activeAudioRef.current = null;
            onEnd?.();
        };

        audio.onerror = () => {
            activeAudioRef.current = null;
            fallbackSpeakLocal(cleanedText, tl, onEnd, onError);
        };

        audio.play().catch(() => {
            fallbackSpeakLocal(cleanedText, tl, onEnd, onError);
        });
    };

    const fallbackSpeakLocal = (cleanedText: string, langCode: string, onEnd?: () => void, onError?: () => void) => {
        if (!('speechSynthesis' in window)) {
            setSpeaking(false);
            onError?.();
            return;
        }
        setSpeaking(true);
        const u = new SpeechSynthesisUtterance(cleanedText);
        u.lang = langCode === 'th' ? 'th-TH' : (langCode === 'ja' ? 'ja-JP' : (langCode === 'zh' ? 'zh-CN' : (langCode === 'ko' ? 'ko-KR' : 'en-US')));
        if (langCode === 'th') {
            const thVoice = getBestThaiVoice();
            if (thVoice) u.voice = thVoice;
        }
        applyVoiceSettings(u);
        u.onend = () => {
            setSpeaking(false);
            onEnd?.();
        };
        u.onerror = () => {
            setSpeaking(false);
            onError?.();
        };
        window.speechSynthesis.speak(u);
    };

    const getBestThaiVoice = (): SpeechSynthesisVoice | null => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return null;
        const voices = window.speechSynthesis.getVoices();
        
        // 1. Try saved user-selected voice
        const savedVoiceName = localStorage.getItem('nimo_browser_voice_name');
        if (savedVoiceName) {
            const savedVoice = voices.find(v => v.name === savedVoiceName);
            if (savedVoice) return savedVoice;
        }

        // 2. Fallbacks
        const thVoices = voices.filter(v => v.lang === 'th-TH' || v.lang.toLowerCase().includes('th'));
        if (thVoices.length === 0) return null;

        const googleVoice = thVoices.find(v => v.name.includes('Google ภาษาไทย') || v.name.includes('Google'));
        const premwadeeVoice = thVoices.find(v => v.name.toLowerCase().includes('premwadee'));
        const kanyaVoice = thVoices.find(v => v.name.toLowerCase().includes('kanya'));
        const narisaVoice = thVoices.find(v => v.name.toLowerCase().includes('narisa'));
        
        return googleVoice || premwadeeVoice || kanyaVoice || narisaVoice || thVoices[0];
    };

    const applyVoiceSettings = (u: SpeechSynthesisUtterance) => {
        switch (voiceType) {
            case 'teen_girl':
                u.pitch = 1.7; // Very high pitch, bright, teen girl!
                u.rate = 1.25;  // Cheerful, fast-paced speed
                break;
            case 'adult_woman':
                u.pitch = 1.05; // Natural adult woman
                u.rate = 0.95;
                break;
            case 'teen_boy':
                u.pitch = 1.25;  // Teen boy
                u.rate = 1.1;
                break;
            case 'adult_man':
                u.pitch = 0.85; // Deep male voice
                u.rate = 0.95;
                break;
            default:
                u.pitch = 1.0;
                u.rate = 1.05;
        }
    };



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

    const [attachedScreenshot, setAttachedScreenshot] = useState<string | null>(null);

    const executeSendMsg = async (text: string, base64ImageToUse?: string | null) => {
        detectAndApplyUserGender(text);
        const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
        const wasVoice = usedMic.current;
        usedMic.current = false; 

        setInput('');
        setBusy(true);
        setStatus('');

        const imageToUse = base64ImageToUse !== undefined ? base64ImageToUse : attachedScreenshot;
        setAttachedScreenshot(null);

        setMsgs(prev => [...prev, { role: 'user', text }]);

        // NATIVE YOUTUBE TRANSCRIPTION INTERCEPTOR
        if ((text.includes('youtube.com/') || text.includes('youtu.be/')) && 
            (text.includes('แกะ') || text.includes('เนื้อเพลง') || text.includes('transcribe') || text.includes('lyrics'))) {
            const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
                const url = urlMatch[0];
                setMsgs(prev => [...prev, { role: 'nimo', text: preferredLanguage === 'th' ? 'กำลังดาวน์โหลดและแกะเนื้อเพลงจาก YouTube ให้ค่ะ รอสักครู่นะคะ...' : 'Transcribing YouTube video, please wait...' }]);
                
                try {
                    const res = await fetch('/vocalido/api/ai/transcribe-audio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ youtube_url: url })
                    });
                    const data = await res.json();
                    if (data.success) {
                        const successMsg = preferredLanguage === 'th' ? `✨ ได้เนื้อเพลงมาแล้วค่ะ คุณสามารถก๊อปปี้ไปวางในหน้า Composer ได้เลยนะคะ:\n\n${data.data.lyrics}` : `✨ Here are the lyrics. You can copy and paste them into the Composer:\n\n${data.data.lyrics}`;
                        setMsgs(prev => [...prev, { role: 'nimo', text: successMsg }]);
                        window.NimoBrain?.updateState('transcribed_lyrics', data.data.lyrics);
                    } else {
                        throw new Error(data.message);
                    }
                } catch (err: any) {
                    const errMsg = preferredLanguage === 'th' ? `❌ ไม่สามารถแกะเนื้อเพลงได้: ${err.message}` : `❌ Transcription failed: ${err.message}`;
                    setMsgs(prev => [...prev, { role: 'nimo', text: errMsg }]);
                } finally {
                    setBusy(false);
                    if (handsFree) {
                        setTimeout(() => startListening(), 500);
                    }
                }
                return;
            }
        }
        
        if (liveClientRef.current) {
            // Forward to Live API if active
            liveClientRef.current.sendTextMessage(text);
            setBusy(false);
            return;
        }

        if (typeof window !== 'undefined' && window.NimoBrain && window.NimoBrain.processSecretCommand(text)) {
            const confirmationText = preferredLanguage === 'th' 
                ? (isMale ? 'ดำเนินการคำสั่งลับสำเร็จแล้วครับ' : 'ดำเนินการคำสั่งลับสำเร็จแล้วค่ะ') 
                : 'Secret command override executed.';
                
            setMsgs(prev => [...prev, { role: 'nimo', text: confirmationText }]);
            setBusy(false);

            if ((wasVoice || handsFree) && !speakerMutedRef.current) {
                const isThai = /[\u0E00-\u0E7F]/.test(confirmationText);
                playVoiceSpeech(confirmationText, isThai ? 'th' : 'en', () => {
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                }, () => {
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                });
            } else {
                if (handsFree) {
                    setTimeout(() => startListening(), 400);
                }
            }
            return;
        }

        try {
            // @ts-ignore
            const key = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
            if (!key) throw new Error('System: API Key missing');

            const suffix = isMale ? 'ครับ' : 'ค่ะ';
            const pronoun = isMale ? 'ฉัน' : 'หนู';
            
            const appState = typeof window !== 'undefined' && window.NimoBrain 
                ? window.NimoBrain.getState() 
                : {};
            const appStateStr = JSON.stringify(appState, null, 2);

            const sys = preferredLanguage === 'th'
                ? `คุณคือ Nimo เพื่อนและผู้ช่วยอัจฉริยะของแอพพลิเคชัน Memolody V2
คุณต้องแทนตัวเองว่า "${pronoun}" เสมอ และใช้คำลงท้ายที่เหมาะสมกับเพศสภาพของคุณคือ "${suffix}" เสมอ ห้ามสับสนสลับกันเด็ดขาด (เช่น ห้ามใช้คำแทนตัวว่า "ฉัน" คู่กับหางเสียง "ครับ" หรือ ห้ามสลับคำลงท้ายผิดลักษณะเพศสภาพ)

คุยสนุก เป็นธรรมชาติเหมือนมนุษย์คุยกันจริงๆ ห้ามแข็งทื่อแบบหุ่นยนต์ และห้ามตอบแบบระบุหมายเลขข้อ (เช่น 1. 2. 3. หรือ - หัวข้อ) ถ้าไม่จำเป็น ให้คุยตอบรับกันสั้นๆ เป็นพารากราฟธรรมดา

ข้อกำหนดเพิ่มเติมสำหรับการแต่งเพลงหรือเขียนเนื้อเพลง (Song Lyrics):
- หากผู้ใช้ขอให้ช่วยแต่งเพลง ให้ทำการขึ้นบรรทัดใหม่ตามปกติในเนื้อเพลงแต่ละวรรค และแบ่งท่อนให้เห็นชัดเจน เช่น [ท่อนเวิร์ส 1], [ท่อนฮุค], [ท่อนเวิร์ส 2] เพื่อความสวยงามและอ่านง่าย ห้ามนำเนื้อเพลงมารวมเป็นบรรทัดเดียวหรือยัดรวมเป็นพารากราฟเดียวเด็ดขาด

สำคัญมากเกี่ยวกับการเปล่งเสียงพูด (TTS):
ในฟิลด์ 'reply' ห้ามใส่สัญลักษณ์ใดๆ ที่ระบบอ่านเสียงสังเคราะห์จะอ่านออกมาแล้วสะดุดหรือไม่เป็นธรรมชาติ เช่น:
- ห้ามใช้ Emojis ทุกชนิด (เช่น 🎙️, ⏸️, 🔁, 🎵)
- ห้ามใส่วงเล็บคำอธิบายหรือคำชี้แจงด้านเทคนิค เช่น (vocal), (Mute), (params: ...)
- ห้ามใส่เครื่องหมายพิเศษ เช่น เครื่องหมายคำพูดเดี่ยว หรือเครื่องหมายคำพูดคู่ซ้อน หรือสัญลักษณ์มาร์กดาวน์ เช่น ** (ตัวหนา) หรือ * (ตัวเอียง)
ให้ใช้เฉพาะข้อความอักษรภาษาไทยหรืออังกฤษปกติเท่านั้น เพื่อให้เสียงพูดออกมาเป็นธรรมชาติที่สุด

เมื่อผู้ใช้สั่งงานหรือขอให้ทำอะไร:
คุณต้องสร้างคำสั่งลงในฟิลด์ 'actions' เสมอให้ตรงกับความต้องการของผู้ใช้ (เช่น หากผู้ใช้พูดว่า "เล่นเพลง" หรือ "ปิดเสียงแทร็กแรก" คุณต้องส่ง action ที่เหมาะสมไปทันที ห้ามลืมเด็ดขาด)

สถานะปัจจุบันของแอพพลิเคชัน (Application State):
${appStateStr}

ฟีเจอร์และคำสั่งที่คุณควบคุมได้ผ่านทาง actions (ห้ามใช้คำสั่งที่ไม่มีในรายการนี้):
${typeof window !== 'undefined' && window.NimoBrain ? window.NimoBrain.generateActionPrompt('th') : ''}


หมายเหตุสำคัญเรื่อง Transpose (เปลี่ยนคีย์):
- เมื่อผู้ใช้เลื่อนเปลี่ยนคีย์ ระบบใช้ PitchShift แบบ real-time เปลี่ยน pitch ทันทีโดยไม่กระทบความเร็ว
- ถ้าเปลี่ยน 1 ถึง 3 semitones เสียงจะดี แต่ถ้ามากกว่านั้นอาจมี artifacts เสียงเป็นหุ่นยนต์เล็กน้อย
- ถ้าผู้ใช้ต้องการเสียงดีที่สุดหลังเปลี่ยนคีย์ ให้แนะนำกด Render ใหม่ เพราะ Vocalido จะสังเคราะห์เสียงร้องใหม่ที่คีย์ใหม่โดยตรง ได้เสียงธรรมชาติไม่มี artifacts
- สรุป PitchShift เอาไว้พรีวิวเร็ว ส่วน Re-render คือคุณภาพสูงสุด
- คำสั่ง set_transpose ใช้เปลี่ยนคีย์ real-time ค่า transpose เป็น semitones ตั้งแต่ ลบ 12 ถึง บวก 12
- คำสั่ง render_vocal ใช้สั่ง Vocalido สังเคราะห์เสียงใหม่ที่คีย์ปัจจุบัน

หมายเหตุสำคัญ: เมื่อผู้ใช้ขอให้แต่งเพลงใหม่ ห้ามใช้ arrange_song เด็ดขาด ต้องใช้ musicgen actions ตามลำดับนี้เสมอ:
1. navigate_to_page กับ view='forge' (เปิดหน้า Studio ก่อน)
2. studio_set_tab กับ tab='composer' (สลับไปแท็บ Composer เท่านั้น ห้ามไปแท็บ arranger)
3. musicgen_set_mood / musicgen_set_tempo / musicgen_set_prompt (ตั้งค่าตามที่ผู้ใช้ต้องการ)
4. musicgen_generate (สั่งสร้างเพลง)
ข้อห้าม: ห้ามใช้ arrange_song สำหรับการแต่งเพลงใหม่ เพราะจะเปิดหน้า Arranger แทน Composer

ข้อสำคัญเกี่ยวกับการตอบกลับ (JSON):
คุณต้องตอบกลับเป็นรูปแบบ JSON ที่ถูกต้องเสมอ (Strict JSON) ตามโครงสร้างนี้:
{
  "reply": "ข้อความที่จะพูดและแสดงผล ห้ามใช้ Markdown ห้ามมีวงเล็บ ห้ามใช้อีโมจิ (ต้องลงท้ายอย่างเป็นธรรมชาติด้วย ${suffix})",
  "actions": [
    {
      "type": "ชื่อของ action ที่ตรงกับรายการด้านบน",
      "params": { "พารามิเตอร์ของ action นั้นๆ" }
    }
  ]
}
ถ้าไม่มี action ให้ส่ง "actions": []`
                : `You are Nimo, a friendly, human-like AI companion and central brain for the Memolody V2 app.
Speak naturally, keep your responses conversational, and do not use bullet points or numbered lists. 

CRITICAL FOR SPEECH SYNTHESIS (TTS):
In the 'reply' field, NEVER include emojis (e.g. 🎙️, ⏸️), markdown formatting (like **bold** or *italic*), or content inside parentheses (like (vocal), (Mute)) which makes the synthesized voice sound awkward. Use only plain text.

If the user gives a command, you MUST include the corresponding action in the 'actions' array.

Current Application State:
${appStateStr}

Supported Actions:
${typeof window !== 'undefined' && window.NimoBrain ? window.NimoBrain.generateActionPrompt('en') : ''}


IMPORTANT: When user asks to compose/create a new song, you MUST use musicgen actions in this order (NEVER use arrange_song for new songs):
1. navigate_to_page with view='forge' (open Studio first)
2. studio_set_tab with tab='composer' (MUST be 'composer', NOT 'arranger')
3. musicgen_set_mood / musicgen_set_tempo / musicgen_set_prompt (configure as requested)
4. musicgen_generate (trigger generation)
DO NOT use 'arrange_song' for composing new songs — it opens the wrong tab.

Transpose Knowledge:
- When user changes key using Transpose, the system uses real-time PitchShift which changes pitch instantly without affecting speed.
- For 1 to 3 semitones quality is good, but larger intervals may produce artifacts with slightly robotic sound.
- For best quality after key change, recommend pressing Render again because Vocalido will re-synthesize vocals at the new key natively producing natural sound without artifacts.
- Summary: PitchShift equals quick preview, Re-render equals best quality.
- Use set_transpose to change key in real-time with semitones from -12 to +12.
- Use render_vocal to re-synthesize vocals at the current key.

You must output valid JSON matching this exact schema:
{
  "reply": "Text to speak/display. No markdown. No emojis.",
  "actions": [
    {
      "type": "action_name_from_supported_actions_list",
      "params": { ... }
    }
  ]
}
If no actions are needed, return "actions": []`;

            const contentsList: any[] = [];
            const recentMsgs = msgs.slice(-24);
            recentMsgs.forEach(m => {
                contentsList.push({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.text }]
                });
            });

            const currentParts: any[] = [{ text: text }];
            if (imageToUse) {
                const match = imageToUse.match(/^data:([^;]+);base64,(.*)$/);
                let mimeType = "image/png";
                let base64Data = imageToUse;
                if (match) {
                    mimeType = match[1];
                    base64Data = match[2];
                } else {
                    base64Data = imageToUse.replace(/^data:image\/[a-z]+;base64,/, '');
                }
                currentParts.push({
                    inlineData: {
                        mimeType: mimeType,
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
                // Extract JSON block in case AI added conversational text before it
                const jsonMatch = reply.match(/\{[\s\S]*\}/);
                let cleanJsonStr = (jsonMatch ? jsonMatch[0] : reply)
                    .replace(/```json/gi, '')
                    .replace(/```/g, '')
                    .replace(/,\s*([\}\]])/g, '$1') // Remove trailing commas
                    .trim();
                parsedRes = JSON.parse(cleanJsonStr);
            } catch(e) {
                console.error("[Nimo] Failed to parse JSON:", reply);
                // Attempt to salvage the reply string using Regex if JSON parsing fails completely
                const replyMatch = reply.match(/"reply"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
                const salvagedReply = replyMatch ? replyMatch[1] : (preferredLanguage === 'th' ? "รับทราบค่ะ กำลังดำเนินการให้ทันทีค่ะ" : "Understood. Executing now.");
                
                // Salvage compose action if we detected compose keywords
                let salvagedActions = [];
                if (input.includes('แต่งเพลง') || input.toLowerCase().includes('compose') || input.includes('สร้างเพลง')) {
                     salvagedActions = [
                        { type: 'navigate_to_page', params: { view: 'forge' } },
                        { type: 'studio_set_tab', params: { tab: 'composer' } },
                        { type: 'musicgen_generate', params: {} }
                     ] as any;
                }

                parsedRes = { reply: salvagedReply, actions: salvagedActions };
            }

            let cleanReply = parsedRes.reply || "หนูทำตามคำสั่งเรียบร้อยแล้วค่ะ";

            // Programmatic Suffix & Pronoun Enforcement (force correct gender)
            if (isMale) {
                // Force male: ค่ะ/คะ→ครับ, นะคะ→นะครับ, หนู/ผม→ฉัน
                cleanReply = cleanReply
                    .replace(/นะคะ/g, 'นะครับ')
                    .replace(/ค่ะ/g, 'ครับ')
                    .replace(/คะ/g, 'ครับ')
                    .replace(/หนู/g, 'ฉัน')
                    .replace(/ผม/g, 'ฉัน');
            } else {
                // Force female: ครับ→ค่ะ, นะครับ→นะคะ, ผม/ฉัน→หนู
                cleanReply = cleanReply
                    .replace(/นะครับ/g, 'นะคะ')
                    .replace(/ครับ/g, 'ค่ะ')
                    .replace(/ผม/g, 'หนู')
                    .replace(/ฉัน/g, 'หนู');
            }

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
                    const actionType = act.type || act.name; // Fallback just in case
                    if (actionType) {
                        try {
                            // For musicgen actions, retry if not registered yet (ComposerPage may still be mounting)
                            if (actionType.startsWith('musicgen_')) {
                                let retries = 0;
                                const maxRetries = 5;
                                while (retries < maxRetries) {
                                    try {
                                        await nimoBrain.executeAction(actionType, act.params);
                                        break; // Success
                                    } catch (err: any) {
                                        if (err?.message?.includes('unregistered') || err?.message?.includes('not registered')) {
                                            retries++;
                                            console.log(`[NimoAction] ${actionType} not ready, retry ${retries}/${maxRetries}...`);
                                            await new Promise(resolve => setTimeout(resolve, 500));
                                        } else {
                                            throw err; // Different error, don't retry
                                        }
                                    }
                                }
                            } else {
                                await nimoBrain.executeAction(actionType, act.params);
                            }
                            // After navigation/tab change, wait for the new page to mount and register actions
                            if (actionType === 'navigate_to_page' || actionType === 'studio_set_tab') {
                                await new Promise(resolve => setTimeout(resolve, 800));
                            }
                        } catch (err) {
                            console.error(`[NimoAction Error] Failed executing ${actionType}:`, err);
                        }
                    }
                }
            }

            if ((wasVoice || handsFree) && !speakerMutedRef.current) {
                const isThai = /[\u0E00-\u0E7F]/.test(cleanReply);
                playVoiceSpeech(cleanReply, isThai ? 'th' : 'en', () => {
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                }, () => {
                    if (handsFreeRef.current) {
                        setTimeout(() => startListening(), 400);
                    }
                });
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
        setStatus(''); // Clear mic error or any status when user types
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
        }, { th: 'ถ่ายภาพหน้าจอเพื่อตรวจสอบ', en: 'Capture screenshot for inspection', category: 'system' });
        return () => {
            unregTakeScreenshot();
        };
    }, [preferredLanguage]);

    if (!isOpen && !isSidebarMode) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed z-[40000] bottom-20 ${position === 'left' ? 'left-4' : 'right-4'} w-14 h-14 bg-black border-2 border-cyan-500 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.4)] overflow-hidden flex items-center justify-center active:scale-95 transition-transform`}
            >
                <img src={nimoAvatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                <MessageCircle className="relative z-10 text-white" size={24} />
                <span className="absolute top-0 right-0 w-3 h-3 bg-cyan-500 rounded-full border border-black shadow-[0_0_10px_#00e5ff]" />
            </button>
        );
    }

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    return (
        <div 
            ref={containerDivRef}
            className={`flex flex-col bg-[#0d0d0f] border-white/10 shadow-2xl overflow-hidden floating-nimo-container ${
                isSidebarMode ? 'w-full h-full relative border-r' : 'fixed z-[40000] border'
            }`}
            style={isSidebarMode ? {} : (isMobile 
                ? { left: 0, right: 0, bottom: 0, height: '80vh', borderRadius: '24px 24px 0 0' } 
                : { bottom: 24, ...(position === 'left' ? { left: 24 } : { right: 24 }), width: 360, height: 560, borderRadius: 28 }
            )}
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
                @keyframes blob-spin {
                    0% { border-radius: 40% 60% 60% 40% / 40% 40% 60% 60%; transform: rotate(0deg); }
                    33% { border-radius: 60% 40% 40% 60% / 60% 60% 40% 40%; }
                    66% { border-radius: 40% 60% 60% 40% / 60% 40% 60% 40%; }
                    100% { border-radius: 40% 60% 60% 40% / 40% 40% 60% 60%; transform: rotate(360deg); }
                }
                .animate-blob {
                    animation: blob-spin 4s linear infinite;
                }
                .animate-blob-reverse {
                    animation: blob-spin 5s linear infinite reverse;
                }
            `}</style>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div data-nimo-target="nimo-avatar" className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/30">
                        <img src={nimoAvatarUrl} alt="Nimo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <p className="text-white font-black italic uppercase text-xs tracking-tighter flex items-center gap-1.5">
                            NIMO BRAIN <span className="text-[9px] text-cyan-400 font-bold tracking-widest">v2.2</span>
                        </p>
                        <p className="text-cyan-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-amber-500 animate-pulse' : (listening ? 'bg-red-500 animate-ping' : 'bg-cyan-500')}`} />
                            {busy ? 'Processing...' : (listening ? 'Listening...' : 'Online')}
                        </p>
                        {lockStatus && (
                            <p className="text-[8px] text-zinc-400 font-medium tracking-tight mt-0.5 animate-pulse flex items-center gap-1">
                                <span className="inline-block w-1 h-1 rounded-full bg-emerald-500" />
                                {lockStatus}
                            </p>
                        )}
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
                        onClick={() => {
                            const val = !speakerMuted;
                            setSpeakerMuted(val);
                            localStorage.setItem('nimo_speaker_muted', String(val));
                            if (val) {
                                stopSpeaking();
                            }
                        }}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                            speakerMuted 
                                ? 'text-rose-400 hover:text-rose-300 bg-rose-500/10' 
                                : 'text-zinc-500 hover:text-white'
                        }`}
                        title={speakerMuted ? (preferredLanguage === 'th' ? 'เปิดเสียงพูด Nimo' : 'Unmute Nimo Voice') : (preferredLanguage === 'th' ? 'ปิดเสียงพูด Nimo' : 'Mute Nimo Voice')}
                    >
                        {speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    {/* Copy All Button */}
                    <button
                        onClick={() => {
                            const allText = msgs.map(m => `${m.role === 'user' ? 'You' : 'Nimo'}: ${m.text}`).join('\n\n');
                            navigator.clipboard.writeText(allText).then(() => {
                                setCopiedId('all');
                                setTimeout(() => setCopiedId(null), 2000);
                            });
                        }}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                            copiedId === 'all' ? 'text-green-400' : 'text-zinc-500 hover:text-white'
                        }`}
                        title={preferredLanguage === 'th' ? 'คัดลอกทั้งหมด' : 'Copy All'}
                    >
                        {copiedId === 'all' ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                    {!isSidebarMode && (
                        <>
                            <button
                                onClick={() => {
                                    nimoBrain.executeAction('navigate_to_page', { view: 'nimo' });
                                    setIsOpen(false);
                                }}
                                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white active:scale-75 transition-all"
                                title={preferredLanguage === 'th' ? 'ขยายหน้าต่าง' : 'Expand to Full Page'}
                            >
                                <Maximize2 size={16} />
                            </button>
                            <button 
                                onClick={() => setIsOpen(false)} 
                                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white active:scale-75 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Chat List */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
                {msgs.map((m, i) => (
                    <div key={i} className={`group relative flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                        {m.role === 'nimo' && (
                            <div className="w-7 h-7 rounded-full overflow-hidden border border-cyan-500/20 shrink-0">
                                <img src={nimoAvatarUrl} alt="" className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className={`relative max-w-[85%] px-4 py-2.5 text-sm leading-relaxed rounded-2xl shadow-sm ${
                            m.role === 'user' 
                                ? 'bg-zinc-800 text-white rounded-br-sm' 
                                : 'bg-cyan-950/40 text-cyan-50 border border-cyan-500/10 rounded-bl-sm'
                        }`}>
                            {/* Copy single message button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(m.text).then(() => {
                                        setCopiedId(String(i));
                                        setTimeout(() => setCopiedId(null), 2000);
                                    });
                                }}
                                className={`absolute ${m.role === 'user' ? '-left-8' : '-right-8'} bottom-1 p-1.5 rounded-md transition-all ${
                                    copiedId === String(i)
                                        ? 'text-green-400'
                                        : 'text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100'
                                }`}
                                title={preferredLanguage === 'th' ? 'คัดลอกข้อความ' : 'Copy message'}
                            >
                                {copiedId === String(i) ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            {m.role === 'nimo' && m.text.includes('\n') && (m.text.includes('[') || m.text.includes(']') || m.text.split('\n').length >= 4) ? (
                                <div className="space-y-3">
                                    <div className="font-serif italic text-center whitespace-pre-line text-zinc-100 bg-black/40 p-4 rounded-xl border border-white/5 shadow-inner leading-loose tracking-wide">
                                        {m.text}
                                    </div>
                                    <button
                                        onClick={() => {
                                            nimoBrain.executeAction('musicgen_set_lyrics', { lyrics: m.text });
                                            nimoBrain.executeAction('navigate_to_page', { view: 'forge' });
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase rounded-lg shadow-md active:scale-95 transition-all"
                                    >
                                        <Sparkles size={12} />
                                        {preferredLanguage === 'th' ? '🎹 ส่งไปที่ MusicGen' : '🎹 Send to MusicGen'}
                                    </button>
                                </div>
                            ) : (
                                m.text
                            )}
                        </div>
                    </div>
                ))}
                
                {/* Gemini-style Dynamic Waveform */}
                {(listening || speaking) && (
                    <div className="relative flex items-center justify-center py-6 h-28 overflow-hidden w-full transition-opacity duration-300">
                        {/* Container that scales based on audio level */}
                        <div 
                            className="relative flex items-center justify-center transition-transform duration-75 ease-out"
                            style={{ transform: `scale(${1 + (speaking ? nimoAudioLevel : userAudioLevel) / 40})` }}
                        >
                            {/* Base Glow */}
                            <div className={`absolute w-24 h-24 rounded-full blur-2xl opacity-50 transition-colors duration-500 ${speaking ? 'bg-cyan-500' : 'bg-rose-500'}`} />
                            
                            {/* Blob 1 */}
                            <div className={`absolute w-16 h-16 mix-blend-screen opacity-80 animate-blob transition-colors duration-500 ${speaking ? 'bg-gradient-to-tr from-cyan-400 to-blue-500' : 'bg-gradient-to-tr from-rose-400 to-orange-400'}`} />
                            
                            {/* Blob 2 */}
                            <div className={`absolute w-16 h-16 mix-blend-screen opacity-70 animate-blob-reverse transition-colors duration-500 ${speaking ? 'bg-gradient-to-bl from-indigo-500 to-purple-500' : 'bg-gradient-to-bl from-pink-500 to-rose-500'}`} />

                            {/* Core Highlight */}
                            <div className="absolute w-8 h-8 bg-white rounded-full blur-[6px] opacity-90 mix-blend-overlay" />
                        </div>
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
                        <div className="relative w-12 h-12 rounded overflow-hidden border border-white/20 flex items-center justify-center bg-black">
                            {attachedScreenshot.startsWith('data:application/pdf') ? (
                                <span className="text-[10px] font-bold text-zinc-400">PDF</span>
                            ) : (
                                <img src={attachedScreenshot} alt="preview" className="w-full h-full object-cover" />
                            )}
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

                <div className="flex items-center gap-0 bg-white/5 border border-white/10 rounded-full pl-2 pr-1 py-1 focus-within:border-cyan-500/30 transition-colors">
                    {/* Hidden file inputs for OMR Camera and Music Import */}
                    <input
                        ref={omrCameraRef}
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        capture="environment"
                        className="hidden"
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            setMsgs(prev => [...prev, { role: 'user', text: preferredLanguage === 'th' ? `📷 สแกนภาพ: ${file.name}` : `📷 Scan: ${file.name}` }]);
                            const result = await processImage(file, preferredLanguage);
                            
                            if (result && !('error' in result)) {
                                setMsgs(prev => [...prev, { role: 'nimo', text: preferredLanguage === 'th' ? '✨ สแกนโน้ตเพลงสำเร็จ! กำลังเปิดหน้าเล่นเพลง...' : '✨ Scan successful! Opening player...' }]);
                                setTimeout(() => {
                                    window.NimoBrain?.executeAction('load_song_data', { metadata: result.song, xmlData: result.xmlData });
                                }, 1000);
                            }
                            
                            e.target.value = '';
                        }}
                    />
                    <input
                        ref={musicImportRef}
                        type="file"
                        // Accept image, pdf, audio, and common music file extensions
                        accept="image/*,application/pdf,.pdf,.emk,.mid,.midi,.xml,.musicxml,.mxl,audio/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const isImageOrPdf = file.type.startsWith('image/') || file.type === 'application/pdf';
                            const isAudio = file.type.startsWith('audio/');
                            
                            if (isImageOrPdf) {
                                // Treat like OMR – preview image and set scan message
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    setAttachedScreenshot(reader.result as string);
                                    setInput(preferredLanguage === 'th' ? '📷 สแกนโน้ตเพลงจากภาพ' : '📷 Scan sheet music from photo');
                                };
                                reader.readAsDataURL(file);
                            } else if (isAudio) {
                                // Audio transcription via Nimo
                                setMsgs(prev => [...prev, { role: 'user', text: preferredLanguage === 'th' ? `🎵 แกะเนื้อเพลง: ${file.name}` : `🎵 Transcribe: ${file.name}` }]);
                                setBusy(true);
                                const reader = new FileReader();
                                reader.onloadend = async () => {
                                    try {
                                        const base64 = (reader.result as string).split(',')[1];
                                        const res = await fetch('/vocalido/api/ai/transcribe-audio', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ audio_base64: base64 })
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                            const successMsg = preferredLanguage === 'th' ? `✨ ได้เนื้อเพลงมาแล้วค่ะ คุณสามารถก๊อปปี้ไปวางในหน้า Composer ได้เลยนะคะ:\n\n${data.data.lyrics}` : `✨ Here are the lyrics. You can copy and paste them into the Composer:\n\n${data.data.lyrics}`;
                                            setMsgs(prev => [...prev, { role: 'nimo', text: successMsg }]);
                                            // Also update state in case other components want it
                                            window.NimoBrain?.updateState('transcribed_lyrics', data.data.lyrics);
                                        } else {
                                            throw new Error(data.message);
                                        }
                                    } catch (err: any) {
                                        const errorString = err?.message || String(err) || 'Unknown error';
                                        const errMsg = preferredLanguage === 'th' ? `❌ ไม่สามารถแกะเนื้อเพลงได้: ${errorString}` : `❌ Transcription failed: ${errorString}`;
                                        setMsgs(prev => [...prev, { role: 'nimo', text: errMsg }]);
                                    } finally {
                                        setBusy(false);
                                    }
                                };
                                reader.readAsDataURL(file);
                            } else {
                                // Music import – show import message and auto‑send
                                setInput(preferredLanguage === 'th' ? `📥 นำเข้า: ${file.name}` : `📥 Import: ${file.name}`);
                                setTimeout(() => sendMsg(), 100);
                            }
                            e.target.value = '';
                        }}
                    />
                    {/* Import Music File (+) Button */}
                    <button 
                        onClick={() => musicImportRef.current?.click()}
                        disabled={busy}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-emerald-400 active:scale-75 transition-all shrink-0"
                        title={preferredLanguage === 'th' ? '📥 นำเข้าไฟล์เพลง (.emk, .mid, .musicxml)' : '📥 Import Music File'}
                    >
                        <PlusCircle size={18} />
                    </button>
                    {/* OMR Camera Button — Opens device camera to photograph sheet music */}
                    <button 
                        onClick={() => omrCameraRef.current?.click()}
                        disabled={busy}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-cyan-400 active:scale-75 transition-all shrink-0"
                        title={preferredLanguage === 'th' ? '📷 OMR: ถ่ายภาพโน้ตเพลง' : '📷 OMR: Take Photo of Sheet Music'}
                    >
                        <Camera size={18} />
                    </button>
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
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                            listening ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-zinc-500 hover:text-cyan-400'
                        }`}
                    >
                        {listening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    <button 
                        onClick={() => sendMsg()}
                        disabled={(!input.trim() && !attachedScreenshot) || busy}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
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
