import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Mic, MicOff, MessageCircle, Sparkles, Camera, Trash2, Volume2, VolumeX, Maximize2 } from 'lucide-react';
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
    
    // usedMic tracks if the last message was voice input
    const usedMic = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

    const handsFreeRef = useRef(handsFree);
    const busyRef = useRef(busy);
    const speakingRef = useRef(speaking);
    const wokenUpRef = useRef(wokenUp);
    const refSpeakerVolumeRef = useRef(refSpeakerVolume);
    const preferredLanguageRef = useRef(preferredLanguage);
    const msgsRef = useRef(msgs);
    const speakerMutedRef = useRef(speakerMuted);

    useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);
    useEffect(() => { busyRef.current = busy; }, [busy]);
    useEffect(() => { speakingRef.current = speaking; }, [speaking]);
    useEffect(() => { wokenUpRef.current = wokenUp; }, [wokenUp]);
    useEffect(() => { refSpeakerVolumeRef.current = refSpeakerVolume; }, [refSpeakerVolume]);
    useEffect(() => { preferredLanguageRef.current = preferredLanguage; }, [preferredLanguage]);
    useEffect(() => { msgsRef.current = msgs; }, [msgs]);
    useEffect(() => { speakerMutedRef.current = speakerMuted; }, [speakerMuted]);

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

    // Commented out to prevent microphone resource capture conflict with SpeechRecognition API on Chrome/macOS
    /*
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
    */

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
        if (isRecognitionRunningRef.current || speakingRef.current || busyRef.current) return;
        try {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            isRecognitionRunningRef.current = true;
            recRef.current?.start();
        } catch (e) {
            isRecognitionRunningRef.current = false;
            console.warn('[startListening Error]', e);
        }
    };

    const requestPermission = () => {
        try {
            setStatus(preferredLanguage === 'th' ? '⏳ กำลังเตรียม...' : '⏳ Preparing...');
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            
            hasPermissionErrorRef.current = false;
            setPermState('granted');
            isRecognitionRunningRef.current = true;
            recRef.current?.start();
        } catch (e) {
            isRecognitionRunningRef.current = false;
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
            isRecognitionRunningRef.current = true;
            setListening(true);
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
                    const cleanPeak = peakVol > 0 ? peakVol : 45;
                    setRefSpeakerVolume(cleanPeak);
                    setLockStatus(lang === 'th' ? `🔒 ล็อกเสียงผู้ใช้ (ระดับ: ${Math.round(cleanPeak)}%)` : `🔒 Locked to User (Level: ${Math.round(cleanPeak)}%)`);
                    
                    const greeting = lang === 'th'
                        ? 'สวัสดีค่ะ! Nimo พร้อมช่วยแล้ว ถามเรื่องแอพหรือสั่งการด้วยเสียงได้เลยนะคะ 🎵'
                        : 'Hi! I am Nimo 🎵 Ask me about the app or give me voice commands!';
                        
                    setMsgs(prev => [...prev, { role: 'nimo', text: greeting }]);
                    setListening(false);
                    
                    if ('speechSynthesis' in window && !speakerMutedRef.current) {
                        window.speechSynthesis.cancel();
                        setSpeaking(true);
                        const u = new SpeechSynthesisUtterance(greeting);
                        u.lang = lang === 'th' ? 'th-TH' : 'en-US';
                        if (lang === 'th') {
                            const thVoice = getBestThaiVoice();
                            if (thVoice) u.voice = thVoice;
                        }
                        u.onend = () => {
                            setSpeaking(false);
                            setTimeout(() => startListening(), 400);
                        };
                        u.onerror = () => {
                            setSpeaking(false);
                            setTimeout(() => startListening(), 400);
                        };
                        window.speechSynthesis.speak(u);
                    } else {
                        setTimeout(() => startListening(), 400);
                    }
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

            // 3. Deactivation commands
            const byeWords = ["bye nimo", "bye bye", "see ya", "bye,see ya", "see you around", "บายนิโม่", "บาย นิโม", "บ๊ายบาย", "บายๆ", "ลาก่อน"];
            const isByeWord = byeWords.some(w => lowerText.includes(w));
            if (isByeWord) {
                setWokenUp(false);
                setRefSpeakerVolume(null);
                setLockStatus('');
                setListening(false);
                const byeReply = lang === 'th' ? 'ไว้เจอกันใหม่นะคะ บ๊ายบายค่ะ!' : 'Goodbye! See you around!';
                setMsgs(prev => [...prev, { role: 'nimo', text: byeReply }]);
                
                if ('speechSynthesis' in window && !speakerMutedRef.current) {
                    window.speechSynthesis.cancel();
                    setSpeaking(true);
                    const u = new SpeechSynthesisUtterance(byeReply);
                    u.lang = lang === 'th' ? 'th-TH' : 'en-US';
                    if (lang === 'th') {
                        const thVoice = getBestThaiVoice();
                        if (thVoice) u.voice = thVoice;
                    }
                    u.onend = () => setSpeaking(false);
                    u.onerror = () => setSpeaking(false);
                    window.speechSynthesis.speak(u);
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
                
                if ('speechSynthesis' in window && !speakerMutedRef.current) {
                    window.speechSynthesis.cancel();
                    setSpeaking(true);
                    const u = new SpeechSynthesisUtterance(localCmd.reply);
                    u.lang = lang === 'th' ? 'th-TH' : 'en-US';
                    if (lang === 'th') {
                        const thVoice = getBestThaiVoice();
                        if (thVoice) u.voice = thVoice;
                    }
                    u.onend = () => {
                        setSpeaking(false);
                        setTimeout(() => startListening(), 400);
                    };
                    u.onerror = () => {
                        setSpeaking(false);
                        setTimeout(() => startListening(), 400);
                    };
                    window.speechSynthesis.speak(u);
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

    const toggleMic = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setStatus(preferredLanguage === 'th' ? '⚠️ ต้องใช้ Chrome บน Android' : '⚠️ Use Chrome on Android');
            return;
        }

        hasPermissionErrorRef.current = false;
        if (listening) {
            try { 
                isRecognitionRunningRef.current = false;
                recRef.current?.stop(); 
            } catch(e){}
            setListening(false);
        } else {
            setStatus(preferredLanguage === 'th' ? '⏳ กำลังเปิดไมค์...' : '⏳ Opening...');
            startListening();
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

    const getBestThaiVoice = (): SpeechSynthesisVoice | null => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return null;
        const voices = window.speechSynthesis.getVoices();
        const thVoices = voices.filter(v => v.lang === 'th-TH' || v.lang.toLowerCase().includes('th'));
        if (thVoices.length === 0) return null;

        const googleVoice = thVoices.find(v => v.name.includes('Google ภาษาไทย') || v.name.includes('Google'));
        const premwadeeVoice = thVoices.find(v => v.name.toLowerCase().includes('premwadee'));
        const kanyaVoice = thVoices.find(v => v.name.toLowerCase().includes('kanya'));
        const narisaVoice = thVoices.find(v => v.name.toLowerCase().includes('narisa'));
        
        return googleVoice || premwadeeVoice || kanyaVoice || narisaVoice || thVoices[0];
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
        const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
        const wasVoice = usedMic.current;
        usedMic.current = false; 

        setInput('');
        setBusy(true);
        setStatus('');

        const imageToUse = base64ImageToUse !== undefined ? base64ImageToUse : attachedScreenshot;
        setAttachedScreenshot(null);

        setMsgs(prev => [...prev, { role: 'user', text }]);

        if (typeof window !== 'undefined' && window.NimoBrain && window.NimoBrain.processSecretCommand(text)) {
            const confirmationText = preferredLanguage === 'th' 
                ? (isMale ? 'ดำเนินการคำสั่งลับสำเร็จแล้วครับ' : 'ดำเนินการคำสั่งลับสำเร็จแล้วค่ะ') 
                : 'Secret command override executed.';
                
            setMsgs(prev => [...prev, { role: 'nimo', text: confirmationText }]);
            setBusy(false);

            if ((wasVoice || handsFree) && 'speechSynthesis' in window && !speakerMutedRef.current) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const u = new SpeechSynthesisUtterance(prepareTextForSpeech(confirmationText));
                const isThai = /[\\u0E00-\\u0E7F]/.test(confirmationText);
                u.lang = isThai ? 'th-TH' : 'en-US';
                if (isThai) {
                    const thVoice = getBestThaiVoice();
                    if (thVoice) u.voice = thVoice;
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
            return;
        }

        try {
            // @ts-ignore
            const key = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
            if (!key) throw new Error('System: API Key missing');

            const suffix = isMale ? 'ครับ' : 'ค่ะ';
            const pronoun = isMale ? 'ผม' : 'หนู';
            
            const appState = typeof window !== 'undefined' && window.NimoBrain 
                ? window.NimoBrain.getState() 
                : {};
            const appStateStr = JSON.stringify(appState, null, 2);

            const sys = preferredLanguage === 'th'
                ? `คุณคือ Nimo เพื่อนและผู้ช่วยอัจฉริยะของแอพพลิเคชัน Memolody V2
คุณต้องแทนตัวเองว่า "${pronoun}" เสมอ และใช้คำลงท้ายที่เหมาะสมกับเพศสภาพของคุณคือ "${suffix}" เสมอ ห้ามสับสนสลับกันเด็ดขาด (เช่น ห้ามใช้คำแทนตัวว่า "ผม" คู่กับหางเสียง "ค่ะ" โดยเด็ดขาด หรือกลับกัน)

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
19. 'set_track_instrument': เลือกเครื่องดนตรีหรือนักร้องเสียงประสาน/Vocalido ของแทร็กนั้นๆ เช่น 'Piano', 'Violin', 'Canary', 'Lotte V', 'Soprano' (params: { trackName?: string, trackIndex?: number, instrument: string })
20. 'arrange_song': ส่งเนื้อเพลงหรือเพลงไปเรียบเรียงประสานเสียงใน MusicGen หรือ Studio (params: { text?: string })
21. 'teach_me': เริ่มโหมดแบบฝึกหัดหรือการสอนดนตรี (params: { topic?: string })
22. 'musicgen_set_mood': ตั้ง Mood ของเพลงใหม่ (params: { mood: 'Happy' | 'Sad' | 'Energetic' | 'Chill' | 'Aggressive' | 'Dreamy' })
23. 'musicgen_set_tempo': ตั้งจังหวะของเพลงใหม่ (params: { tempo: 'Slow' | 'Medium' | 'Fast' | 'Very Fast' })
24. 'musicgen_set_prompt': ตั้งคำอธิบายเพลงที่ต้องการ (params: { prompt: string })
25. 'musicgen_set_lyrics': ใส่เนื้อร้องสำหรับเพลงใหม่ (params: { lyrics: string })
26. 'musicgen_generate': สั่ง AI แต่งเพลงใหม่ทันที (ไม่มี params — ต้องเปิดหน้า Studio ก่อนโดยใช้ navigate_to_page กับ view='forge')

หมายเหตุสำคัญ: เมื่อผู้ใช้ขอให้แต่งเพลงใหม่ ต้องทำตามลำดับนี้เสมอ:
1. navigate_to_page กับ view='forge' (เปิดหน้า Studio ก่อน)
2. musicgen_set_mood / musicgen_set_tempo / musicgen_set_prompt (ตั้งค่าตามที่ผู้ใช้ต้องการ)
3. musicgen_generate (สั่งสร้างเพลง)

ข้อสำคัญเกี่ยวกับการตอบกลับ (JSON):
- 'reply': ข้อความที่จะพูดและแสดงผล ต้องลงท้ายอย่างเป็นธรรมชาติด้วย ${suffix}
- 'actions': รายการคำสั่งที่จะรันตามความต้องการของผู้ใช้ ถ้าไม่มีให้ใช้ []`
                : `You are Nimo, a friendly, human-like AI companion and central brain for the Memolody V2 app.
Speak naturally, keep your responses conversational, and do not use bullet points or numbered lists. 

CRITICAL FOR SPEECH SYNTHESIS (TTS):
In the 'reply' field, NEVER include emojis (e.g. 🎙️, ⏸️), markdown formatting (like **bold** or *italic*), or content inside parentheses (like (vocal), (Mute)) which makes the synthesized voice sound awkward. Use only plain text.

If the user gives a command, you MUST include the corresponding action in the 'actions' array.

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
20. 'arrange_song': Send lyrics or song to be arranged in MusicGen or Studio (params: { text?: string })
21. 'teach_me': Start a lesson or practice mode (params: { topic?: string })
22. 'musicgen_set_mood': Set mood for new song (params: { mood: 'Happy' | 'Sad' | 'Energetic' | 'Chill' | 'Aggressive' | 'Dreamy' })
23. 'musicgen_set_tempo': Set tempo for new song (params: { tempo: 'Slow' | 'Medium' | 'Fast' | 'Very Fast' })
24. 'musicgen_set_prompt': Set description/prompt for new song (params: { prompt: string })
25. 'musicgen_set_lyrics': Set lyrics for new song (params: { lyrics: string })
26. 'musicgen_generate': Trigger AI to compose a new song NOW (no params — MUST navigate to Studio first via navigate_to_page with view='forge')

IMPORTANT: When user asks to compose/create a new song, you MUST send actions in this order:
1. navigate_to_page with view='forge' (open Studio first)
2. musicgen_set_mood / musicgen_set_tempo / musicgen_set_prompt (configure as requested)
3. musicgen_generate (trigger generation)

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

            let cleanReply = parsedRes.reply || reply;

            // Programmatic Suffix Enforcement (force correct gender suffix)
            if (isMale) {
                cleanReply = cleanReply.replace(/ค่ะ/g, 'ครับ').replace(/คะ/g, 'ครับ');
            } else {
                cleanReply = cleanReply.replace(/ครับ/g, 'ค่ะ');
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
                    if (act.type) {
                        try {
                            await nimoBrain.executeAction(act.type, act.params);
                        } catch (err) {
                            console.error(`[NimoAction Error] Failed executing ${act.type}:`, err);
                        }
                    }
                }
            }

            if ((wasVoice || handsFree) && 'speechSynthesis' in window && !speakerMutedRef.current) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const u = new SpeechSynthesisUtterance(prepareTextForSpeech(cleanReply));
                const isThai = /[\\u0E00-\\u0E7F]/.test(cleanReply);
                u.lang = isThai ? 'th-TH' : 'en-US';
                
                if (isThai) {
                    const thVoice = getBestThaiVoice();
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

    if (!isOpen && !isSidebarMode) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed z-[40000] bottom-20 ${position === 'left' ? 'left-4' : 'right-4'} w-14 h-14 bg-black border-2 border-cyan-500 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.4)] overflow-hidden flex items-center justify-center active:scale-95 transition-transform`}
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
                                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
