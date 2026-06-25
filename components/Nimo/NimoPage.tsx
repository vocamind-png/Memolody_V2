import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Music, MessageSquare, Bot, Sparkles, ChevronRight, Music2, Mic, MicOff, Volume2, VolumeX, Square, Settings, Sliders, Copy, Check, Share2 } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';
import { Song } from '../../types';
import ScoreLensBar from '../ScoreLens/ScoreLensBar';
import { useScoreLens, ScoreLensResult } from '../ScoreLens/useScoreLens';
import { nimoBrain } from '../../lib/NimoBrain';
import { useAuth } from '../../lib/useAuth';

interface Message {
    role: 'user' | 'nimo';
    content: string;
    imageUrl?: string;  // Optional image preview in chat bubble
    timestamp: number;
    actionData?: { song: any, xmlData: string }; // Optional action button to open song
}

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

const extractLastLyrics = (messageList: Message[]): string => {
    for (let i = messageList.length - 1; i >= 0; i--) {
        const m = messageList[i];
        if (m.role === 'nimo' && m.content.includes('\n') && m.content.length > 25) {
            return m.content;
        }
    }
    return '';
};

interface NimoPageProps {
    selectedSong?: any;
    xmlData?: string | null;
    preferredLanguage?: 'th' | 'en';
    onSongSelect?: (song: Song, xml: string, mode?: 'listen' | 'studio') => void;
    onRefresh?: () => void;
    initialFile?: File | null;  // File passed from Home Import → auto-process
    voiceType?: string;
}

interface VoiceProfile {
    avgPitch: number;
    pitchMin: number;
    pitchMax: number;
    name: string;
}

// Autocorrelation Pitch Detector (F0 estimation)
const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
    const SIZE = buffer.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.008) return -1; // Too quiet

    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buffer[i]) < thres) {
            r1 = i;
            break;
        }
    }
    for (let i = SIZE - 1; i >= SIZE / 2; i--) {
        if (Math.abs(buffer[i]) < thres) {
            r2 = i;
            break;
        }
    }

    const buf = buffer.subarray(r1, r2);
    const len = buf.length;
    if (len === 0) return -1;

    const correlations = new Float32Array(len);
    for (let i = 0; i < len; i++) {
        for (let j = 0; j < len - i; j++) {
            correlations[i] += buf[j] * buf[j + i];
        }
    }

    let d = 0;
    while (d < len - 1 && correlations[d] > correlations[d + 1]) {
        d++;
    }

    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < len; i++) {
        if (correlations[i] > maxval) {
            maxval = correlations[i];
            maxpos = i;
        }
    }

    const T0 = maxpos;
    if (T0 > 0) {
        const pitch = sampleRate / T0;
        if (pitch >= 65 && pitch <= 450) { // Standard vocal range
            return pitch;
        }
    }
    return -1;
};

const NimoPage: React.FC<NimoPageProps> = ({ selectedSong, xmlData, preferredLanguage = 'en', onSongSelect, onRefresh, initialFile, voiceType = 'teen_girl' }) => {
    const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
    const suffixKa = isMale ? 'ครับ' : 'ค่ะ';
    const suffixNaKa = isMale ? 'นะครับ' : 'นะคะ';
    const helloKa = isMale ? 'สวัสดีครับ' : 'สวัสดีค่ะ';

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
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Wake Word & Speaker Lock-on
    const [wokenUp, setWokenUp] = useState(false);
    const [refSpeakerVolume, setRefSpeakerVolume] = useState<number | null>(null);
    const [lockStatus, setLockStatus] = useState<string>('');
    const peakVolumeRef = useRef<number>(0);

    // Speaker & Audio Settings
    const [speakerMuted, setSpeakerMuted] = useState(() => localStorage.getItem('nimo_speaker_muted') === 'true');
    const [showNimoSettings, setShowNimoSettings] = useState(false);
    const [noiseReductionEnabled, setNoiseReductionEnabled] = useState(() => localStorage.getItem('nimo_noise_reduction') === 'true');
    const [voiceRecognitionEnabled, setVoiceRecognitionEnabled] = useState(() => localStorage.getItem('nimo_voice_recognition') === 'true');
    const [allowOthers, setAllowOthers] = useState(() => localStorage.getItem('nimo_allow_others') === 'true');

    // Voice Enrollment
    const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
    const [enrolling, setEnrolling] = useState(false);
    const [enrollCountdown, setEnrollCountdown] = useState(0);
    const [enrollPitchSampleCount, setEnrollPitchSampleCount] = useState(0);

    const enrollingRef = useRef(enrolling);
    const listeningRef = useRef(listening);
    const collectedPitchSamplesRef = useRef<number[]>([]);
    const activePitchSamplesRef = useRef<number[]>([]);
    const wokenUpRef = useRef(wokenUp);
    const refSpeakerVolumeRef = useRef(refSpeakerVolume);
    const preferredLanguageRef = useRef(preferredLanguage);
    const messagesRef = useRef(messages);
    const speakerMutedRef = useRef(speakerMuted);

    useEffect(() => { enrollingRef.current = enrolling; }, [enrolling]);
    useEffect(() => { listeningRef.current = listening; }, [listening]);
    useEffect(() => { wokenUpRef.current = wokenUp; }, [wokenUp]);
    useEffect(() => { refSpeakerVolumeRef.current = refSpeakerVolume; }, [refSpeakerVolume]);
    useEffect(() => { preferredLanguageRef.current = preferredLanguage; }, [preferredLanguage]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { speakerMutedRef.current = speakerMuted; }, [speakerMuted]);

    const { authUser } = useAuth();
    const userId = authUser ? authUser.id : 'guest';

    // Load user-specific voice profile
    useEffect(() => {
        const stored = localStorage.getItem(`nimo_voice_profile_${userId}`);
        if (stored) {
            try {
                setVoiceProfile(JSON.parse(stored));
            } catch (e) {
                setVoiceProfile(null);
            }
        } else {
            setVoiceProfile(null);
        }
    }, [userId]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const isRecognitionRunningRef = useRef(false);
    const hasPermissionErrorRef = useRef(false);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const analyzeAudio = useCallback(() => {
        if (!analyserRef.current || !audioContextRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Real-time pitch tracking for voice identification
        const buffer = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buffer);
        const sampleRate = audioContextRef.current.sampleRate;
        const pitch = autoCorrelate(buffer, sampleRate);

        if (pitch > 0) {
            if (enrollingRef.current) {
                collectedPitchSamplesRef.current.push(pitch);
                setEnrollPitchSampleCount(collectedPitchSamplesRef.current.length);
            } else if (listeningRef.current) {
                activePitchSamplesRef.current.push(pitch);
            }
        }

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const level = Math.min(100, (average / 128) * 100); 

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
                    analyser.fftSize = 1024; // Better resolution for pitch autocorrelation

                    let lastNode: AudioNode = source;
                    if (noiseReductionEnabled) {
                        const hpFilter = ctx.createBiquadFilter();
                        hpFilter.type = 'highpass';
                        hpFilter.frequency.setValueAtTime(80, ctx.currentTime);
                        lastNode.connect(hpFilter);
                        lastNode = hpFilter;

                        const lpFilter = ctx.createBiquadFilter();
                        lpFilter.type = 'lowpass';
                        lpFilter.frequency.setValueAtTime(8000, ctx.currentTime);
                        lastNode.connect(lpFilter);
                        lastNode = lpFilter;

                        const compressor = ctx.createDynamicsCompressor();
                        compressor.threshold.setValueAtTime(-45, ctx.currentTime);
                        compressor.knee.setValueAtTime(12, ctx.currentTime);
                        compressor.ratio.setValueAtTime(12, ctx.currentTime);
                        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
                        compressor.release.setValueAtTime(0.25, ctx.currentTime);
                        lastNode.connect(compressor);
                        lastNode = compressor;
                    }

                    lastNode.connect(analyser);
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
        }
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
            }
        }
    }, [listening, analyzeAudio, noiseReductionEnabled]);
    */

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
        r.lang = 'th-TH'; // Always default to Thai for Speech Recognition

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
            if (enrollingRef.current) {
                setListening(false);
                return;
            }
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
                    const cleanPeak = peakVol > 0 ? peakVol : 45;
                    setRefSpeakerVolume(cleanPeak);
                    setLockStatus(lang === 'th' ? `🔒 ล็อกเสียงผู้ใช้ (ระดับ: ${Math.round(cleanPeak)}%)` : `🔒 Locked to User (Level: ${Math.round(cleanPeak)}%)`);
                    
                    const greeting = lang === 'th'
                        ? 'สวัสดีค่ะ! Nimo พร้อมช่วยแล้ว ถามเรื่องแอพหรือสั่งการด้วยเสียงได้เลยนะคะ 🎵'
                        : 'Hi! I am Nimo 🎵 Ask me about the app or give me voice commands!';
                        
                    setMessages(prev => [...prev, { role: 'nimo', content: greeting, timestamp: Date.now() }]);
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

            // 2. Speaker validation (volume lock-on) if already woken up
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

            // Keep original Voice Lock pitch correlation check if enabled
            if (voiceRecognitionEnabled && voiceProfile && !allowOthers) {
                const samples = activePitchSamplesRef.current.filter(p => p > 50 && p < 450);
                if (samples.length > 0) {
                    const avgActivePitch = samples.reduce((a, b) => a + b, 0) / samples.length;
                    if (avgActivePitch < voiceProfile.pitchMin || avgActivePitch > voiceProfile.pitchMax) {
                        setListening(false);
                        setStatus(lang === 'th' ? '🔇 กรองเสียงผู้อื่น/เสียงรบกวนออก' : '🔇 Ignored non-user voice');
                        setTimeout(() => setStatus(''), 3000);
                        activePitchSamplesRef.current = [];
                        return;
                    }
                } else {
                    setListening(false);
                    setStatus(lang === 'th' ? '🔇 กรองเสียงรบกวนรอบข้างออก' : '🔇 Ignored background noise');
                    setTimeout(() => setStatus(''), 3000);
                    activePitchSamplesRef.current = [];
                    return;
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
                setMessages(prev => [...prev, { role: 'nimo', content: byeReply, timestamp: Date.now() }]);
                
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
                setListening(false);
                setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
                
                if (localCmd.action === 'send_to_musicgen_local') {
                    const lyrics = extractLastLyrics(messagesRef.current);
                    if (lyrics) {
                        nimoBrain.executeAction('musicgen_set_lyrics', { lyrics });
                        nimoBrain.executeAction('navigate_to_page', { view: 'forge' });
                    } else {
                        localCmd.reply = lang === 'th' ? 'ไม่พบเนื้อเพลงในประวัติการสนทนาค่ะ' : 'No lyrics found in chat history.';
                    }
                } else {
                    nimoBrain.executeAction(localCmd.action, localCmd.params);
                }

                setMessages(prev => [...prev, { role: 'nimo', content: localCmd.reply, timestamp: Date.now() }]);
                
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

            activePitchSamplesRef.current = [];
            setInput(text);
            setListening(false);
            usedMic.current = true;
            handleSend(text);
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
            if ((handsFreeRef.current || !wokenUpRef.current) && !isTypingRef.current && !speakingRef.current && !enrollingRef.current) {
                setTimeout(() => {
                    startListening();
                }, 500);
            }
        };
        recRef.current = r;
    }, []);

    useEffect(() => {
        if (permState === 'granted' && !listening && !speaking && !isTyping) {
            startListening();
        }
    }, [permState, listening, speaking, isTyping]);

    const startListening = () => {
        if (isRecognitionRunningRef.current || speakingRef.current || isTypingRef.current) return;
        try {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            isRecognitionRunningRef.current = true;
            recRef.current?.start();
        } catch (e) {
            isRecognitionRunningRef.current = false;
            console.warn('[startListening Error]', e);
        }
    };

    const toggleMic = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setStatus(preferredLanguage === 'th' ? '⚠️ ต้องใช้ Chrome หรือบราวเซอร์ที่รองรับ Speech Recognition' : '⚠️ Speech Recognition not supported on this browser');
            return;
        }

        hasPermissionErrorRef.current = false;
        if (listening) {
            if (handsFree) {
                setHandsFree(false);
                localStorage.setItem('nimo_hands_free', 'false');
            }
            try { 
                isRecognitionRunningRef.current = false;
                recRef.current?.stop(); 
            } catch(e){}
            setListening(false);
            setStatus(preferredLanguage === 'th' ? '🎙️ ปิดไมค์แล้ว' : '🎙️ Mic off');
        } else {
            setStatus(preferredLanguage === 'th' ? '⏳ กำลังเปิดไมค์...' : '⏳ Opening...');
            startListening();
        }
    };

    const stopListeningAndHandsFree = () => {
        setHandsFree(false);
        localStorage.setItem('nimo_hands_free', 'false');
        setListening(false);
        try { 
            isRecognitionRunningRef.current = false;
            recRef.current?.stop(); 
        } catch(e){}
        setStatus(preferredLanguage === 'th' ? '🎙️ หยุดรับเสียงแล้ว' : '🎙️ Microphone stopped');
        setTimeout(() => setStatus(''), 2000);
    };

    const toggleSpeakerMute = () => {
        const nextState = !speakerMuted;
        setSpeakerMuted(nextState);
        localStorage.setItem('nimo_speaker_muted', String(nextState));
        if (nextState && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            setSpeaking(false);
        }
    };

    const toggleNoiseReduction = (val: boolean) => {
        setNoiseReductionEnabled(val);
        localStorage.setItem('nimo_noise_reduction', String(val));
        if (listening) {
            try { recRef.current?.stop(); } catch(e){}
            setTimeout(() => startListening(), 200);
        }
    };

    const toggleVoiceRecognition = (val: boolean) => {
        setVoiceRecognitionEnabled(val);
        localStorage.setItem('nimo_voice_recognition', String(val));
    };

    const startVoiceEnrollment = () => {
        if (enrolling) return;
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        try { recRef.current?.stop(); } catch(e){}

        setEnrolling(true);
        setEnrollCountdown(4);
        setEnrollPitchSampleCount(0);
        collectedPitchSamplesRef.current = [];

        setListening(true);
        setStatus(preferredLanguage === 'th' ? '🎙️ กรุณาพูดแนะนำตัวอย่างต่อเนื่อง...' : '🎙️ Please speak continuously...');

        const interval = setInterval(() => {
            setEnrollCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    setEnrolling(false);
                    setListening(false);

                    const samples = collectedPitchSamplesRef.current.filter(p => p > 50 && p < 450);
                    if (samples.length >= 8) {
                        const sum = samples.reduce((a, b) => a + b, 0);
                        const avg = sum / samples.length;
                        const pitchMin = Math.max(50, Math.round(avg * 0.75));
                        const pitchMax = Math.min(450, Math.round(avg * 1.35));

                        const profile = {
                            avgPitch: avg,
                            pitchMin,
                            pitchMax,
                            name: authUser?.fullName || 'Guest'
                        };

                        localStorage.setItem(`nimo_voice_profile_${userId}`, JSON.stringify(profile));
                        setVoiceProfile(profile);
                        setVoiceRecognitionEnabled(true);
                        localStorage.setItem('nimo_voice_recognition', 'true');
                        setStatus(preferredLanguage === 'th' ? '✅ ลงทะเบียนเสียงสำเร็จ!' : '✅ Voice enrolled successfully!');
                    } else {
                        setStatus(preferredLanguage === 'th' ? '❌ ลงทะเบียนไม่สำเร็จ ลองพูดดังขึ้น' : '❌ Enrollment failed. Speak louder.');
                    }
                    setTimeout(() => setStatus(''), 3000);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
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

    // ── ScoreLens: Handle music file import (.emk, .mid, .musicxml) ──
    const handleMusicFileImported = useCallback(async (file: File) => {
        // Music files should be processed immediately (no need for preview)
        setMessages(prev => [...prev, {
            role: 'user',
            content: preferredLanguage === 'th' ? `📥 นำเข้าไฟล์: ${file.name}` : `📥 Import file: ${file.name}`,
            timestamp: Date.now()
        }]);

        setIsTyping(true);
        setMessages(prev => [...prev, {
            role: 'nimo',
            content: preferredLanguage === 'th'
                ? `🎵 กำลังประมวลผลไฟล์เพลง "${file.name}"... กรุณารอสักครู่${suffixKa}`
                : `🎵 Processing music file "${file.name}"... Please wait.`,
            timestamp: Date.now()
        }]);

        const result = await processImage(file, preferredLanguage);
        setIsTyping(false);

        if (result && 'song' in result) {
            const noteCount = (result.xmlData.match(/<note/g) || []).length;
            setMessages(prev => [...prev, {
                role: 'nimo',
                content: preferredLanguage === 'th'
                    ? `✅ นำเข้าสำเร็จ${suffixKa}! เพลง **"${result.song.title}"** 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | โน้ต: ${noteCount} ตัว\n\nกดปุ่มด้านล่างเพื่อฟังเลย${suffixKa} ▶️`
                    : `✅ Import success! Song **"${result.song.title}"** 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | Notes: ${noteCount}\n\nTap below to listen ▶️`,
                timestamp: Date.now(),
                actionData: { song: result.song, xmlData: result.xmlData }
            }]);
            onRefresh?.();
            setTimeout(async () => {
                try { await onSongSelect?.(result.song, result.xmlData, 'listen'); } catch {}
            }, 3000);
        } else {
            setMessages(prev => [...prev, {
                role: 'nimo',
                content: preferredLanguage === 'th'
                    ? `❌ ไม่สามารถประมวลผลไฟล์ได้${suffixKa} กรุณาตรวจสอบรูปแบบไฟล์`
                    : `❌ Could not process the file. Please check the file format.`,
                timestamp: Date.now()
            }]);
        }
    }, [preferredLanguage, processImage, onSongSelect, onRefresh]);

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

        if (isMusicFile) {
            handleMusicFileImported(file);
        } else if (isImageOrPdf) {
            handleFileSelected(file);
        }
    }, [handleFileSelected, handleMusicFileImported]);

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
                ? `🔍 ดิฉันกำลังอ่านโน้ตเพลงในภาพ${suffixKa}... กรุณารอสักครู่นะคะ`
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
                ? `✅ แปลงสำเร็จ${suffixKa}! เพลง **"${result.song.title}"** โดย ${result.song.artist} 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | โน้ต: ${noteCount} ตัว\n\nระบบจะพาคุณไปหน้า Player โดยอัตโนมัติ หรือกดปุ่มด้านล่างเพื่อฟังได้เลย${suffixKa} ▶️`
                : `✅ Done! Song **"${result.song.title}"** by ${result.song.artist} 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | Notes: ${noteCount}\n\nAuto-navigating to Player, or tap below to listen ▶️`;

            setMessages(prev => [...prev, {
                role: 'nimo',
                content: successContent,
                timestamp: Date.now(),
                actionData: { song: result.song, xmlData: result.xmlData }
            }]);

            // Speak success
            if (!speakerMuted && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const speechText = preferredLanguage === 'th' 
                    ? `แปลงสำเร็จแล้ว${suffixKa} เพลง ${result.song.title} โดย ${result.song.artist || 'สโกเลนส์ เอไอ'}`
                    : `Conversion complete. ${result.song.title} by ${result.song.artist || 'ScoreLens AI'}`;
                const u = new SpeechSynthesisUtterance(prepareTextForSpeech(speechText));
                const isThai = /[\\u0E00-\\u0E7F]/.test(speechText);
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
                ? `❌ ไม่สามารถแปลงได้${suffixKa}: ${errMsg}\n\nลองถ่ายภาพใหม่ให้ชัดขึ้น หรือใช้ภาพที่มีความละเอียดสูง${suffixNaKa}`
                : `❌ Could not convert: ${errMsg}\n\nTry a clearer photo or higher resolution image.`;

            setMessages(prev => [...prev, {
                role: 'nimo',
                content: failContent,
                timestamp: Date.now()
            }]);

            // Speak failure
            if (!speakerMuted && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeaking(true);
                const speechText = preferredLanguage === 'th' 
                    ? `ขออภัย${suffixKa} ไม่สามารถแปลงโน้ตได้สำเร็จ กรุณาลองใหม่อีกครั้ง${suffixNaKa}`
                    : `Sorry, could not convert. Please try again.`;
                const u = new SpeechSynthesisUtterance(prepareTextForSpeech(speechText));
                const isThai = /[\\u0E00-\\u0E7F]/.test(speechText);
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
                ? `ดำเนินการคำสั่งลับสำเร็จแล้ว${suffixKa}`
                : 'Secret command override executed.';
                
            setMessages(prev => [...prev, { role: 'nimo', content: confirmationText, timestamp: Date.now() }]);
            setIsTyping(false);

            if (!speakerMuted && (wasVoice || handsFree) && 'speechSynthesis' in window) {
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
            }
            return;
        }

        try {
            // @ts-ignore
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
            if (!apiKey) throw new Error('System: API Key missing');

            const appState = typeof window !== 'undefined' && window.NimoBrain 
                ? window.NimoBrain.getState() 
                : {};
            const appStateStr = JSON.stringify(appState, null, 2);

            const suffix = suffixKa;
            const pronoun = isMale ? 'ผม' : 'หนู';

            // Construct chat history list for Gemini context
            const contentsList: any[] = [];
            // Keep up to 6 recent messages from history
            const recentMsgs = messages.slice(-6);
            recentMsgs.forEach(m => {
                contentsList.push({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                });
            });
            // Append current message
            contentsList.push({
                role: 'user',
                parts: [{ text: text }]
            });

            // Ensure system instructions contain actions 20-27
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
${typeof window !== 'undefined' && window.NimoBrain ? window.NimoBrain.generateActionPrompt('th') : ''}


หมายเหตุสำคัญ: เมื่อผู้ใช้ขอให้แต่งเพลงใหม่ หรือสร้างเพลงใหม่ ห้ามใช้ arrange_song เด็ดขาด ต้องใช้ musicgen actions ตามลำดับนี้เสมอ:
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
1. navigate_to_page with view='forge'
2. studio_set_tab with tab='composer' (MUST be 'composer', NOT 'arranger')
3. musicgen_set_mood / musicgen_set_tempo / musicgen_set_prompt (configure as requested)
4. musicgen_generate (trigger generation)
DO NOT use 'arrange_song' for composing new songs — it opens the wrong tab.

You must output valid JSON matching the schema. If no actions are needed, return an empty array.`;

            // Direct API call
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: sys }] },
                    contents: contentsList,
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
                let cleanJsonStr = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
                parsedRes = JSON.parse(cleanJsonStr);
            } catch(e) {
                parsedRes = { reply: reply, actions: [] };
            }

            let cleanReply = parsedRes.reply || reply;

            // Programmatic Suffix & Pronoun Enforcement (force correct gender)
            if (isMale) {
                // Force male: ค่ะ/คะ→ครับ, นะคะ→นะครับ, หนู→ผม
                cleanReply = cleanReply
                    .replace(/นะคะ/g, 'นะครับ')
                    .replace(/ค่ะ/g, 'ครับ')
                    .replace(/คะ/g, 'ครับ')
                    .replace(/หนู/g, 'ผม');
            } else {
                // Force female: ครับ→ค่ะ, นะครับ→นะคะ, ผม→หนู
                cleanReply = cleanReply
                    .replace(/นะครับ/g, 'นะคะ')
                    .replace(/ครับ/g, 'ค่ะ')
                    .replace(/ผม/g, 'หนู');
            }

            setMessages(prev => [...prev, { role: 'nimo', content: cleanReply, timestamp: Date.now() }]);

            // Execute Actions
            if (parsedRes.actions && Array.isArray(parsedRes.actions)) {
                for (const act of parsedRes.actions) {
                    const actionType = act.type || act.name; // Fallback just in case
                    if (actionType) {
                        try {
                            if (window.NimoBrain) {
                                // For musicgen actions, retry if not registered yet (ComposerPage may still be mounting)
                                if (actionType.startsWith('musicgen_')) {
                                    let retries = 0;
                                    const maxRetries = 5;
                                    while (retries < maxRetries) {
                                        try {
                                            await window.NimoBrain.executeAction(actionType, act.params);
                                            break; // Success
                                        } catch (err: any) {
                                            if (err?.message?.includes('unregistered') || err?.message?.includes('not registered')) {
                                                retries++;
                                                console.log(`[NimoAction] ${actionType} not ready, retry ${retries}/${maxRetries}...`);
                                                await new Promise(resolve => setTimeout(resolve, 500));
                                            } else {
                                                throw err;
                                            }
                                        }
                                    }
                                } else {
                                    await window.NimoBrain.executeAction(actionType, act.params);
                                }
                            }
                            // Wait after page or tab change to let components mount & register actions
                            if (actionType === 'navigate_to_page' || actionType === 'studio_set_tab') {
                                await new Promise(resolve => setTimeout(resolve, 800));
                            }
                        } catch (err) {
                            console.error(`[NimoAction Error] Failed executing ${actionType}:`, err);
                        }
                    }
                }
            }

            // Speak response if using voice or in hands-free mode
            if (!speakerMuted && (wasVoice || handsFree) && 'speechSynthesis' in window) {
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

        } catch (error: any) {
            console.error("Gemini Error:", error);
            const errMsg = preferredLanguage === 'th' 
                ? `ขออภัย${suffixKa} พอดีขัดข้องนิดหน่อย: ${error.message}` 
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
                        <div data-nimo-target="nimo-avatar" className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(0,229,255,0.2)] shrink-0">
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
                    
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {/* Copy All Button */}
                        <button
                            onClick={() => {
                                const allText = messages.map(m => `${m.role === 'user' ? 'You' : 'Nimo'}: ${m.content}`).join('\n\n');
                                navigator.clipboard.writeText(allText).then(() => {
                                    setCopiedId('all');
                                    setTimeout(() => setCopiedId(null), 2000);
                                });
                            }}
                            className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
                            title={preferredLanguage === 'th' ? 'คัดลอกทั้งหมด' : 'Copy All'}
                        >
                            {copiedId === 'all' ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                            {preferredLanguage === 'th' ? (copiedId === 'all' ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด') : (copiedId === 'all' ? 'Copied!' : 'Copy All')}
                        </button>

                        {/* Share Button */}
                        <button
                            onClick={async () => {
                                const allText = messages.map(m => `${m.role === 'user' ? 'You' : 'Nimo'}: ${m.content}`).join('\n\n');
                                if (navigator.share) {
                                    try {
                                        await navigator.share({ title: 'Nimo Chat - Memolody V2', text: allText });
                                    } catch (e) { /* user cancelled */ }
                                } else {
                                    navigator.clipboard.writeText(allText).then(() => {
                                        setCopiedId('share');
                                        setTimeout(() => setCopiedId(null), 2000);
                                    });
                                }
                            }}
                            className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
                            title={preferredLanguage === 'th' ? 'แชร์บทสนทนา' : 'Share Chat'}
                        >
                            {copiedId === 'share' ? <Check size={10} className="text-green-400" /> : <Share2 size={10} />}
                            {preferredLanguage === 'th' ? (copiedId === 'share' ? 'คัดลอกแล้ว' : 'แชร์') : (copiedId === 'share' ? 'Copied!' : 'Share')}
                        </button>

                        {/* Settings Button */}
                        <button 
                            onClick={() => setShowNimoSettings(!showNimoSettings)}
                            className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
                                showNimoSettings 
                                    ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]' 
                                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300'
                            }`}
                            title="Nimo Voice Settings"
                        >
                            <Settings size={10} />
                            {preferredLanguage === 'th' ? 'ตั้งค่าเสียง' : 'Voice Settings'}
                        </button>

                        {/* Hands free switch */}
                        <button
                            onClick={toggleHandsFree}
                            className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1 ${
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
                </div>

                {/* Chat Container */}
                <div
                    ref={scrollRef}
                    className="flex-1 bg-white/[0.02] border border-white/5 rounded-[40px] p-6 overflow-y-auto no-scrollbar flex flex-col gap-4 relative"
                >
                    {showNimoSettings && (
                        <div className="absolute inset-0 bg-[#0d0d0f]/95 backdrop-blur-md z-30 p-6 flex flex-col justify-between overflow-y-auto rounded-[40px]">
                            <div>
                                {/* Header of settings */}
                                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                                    <h3 className="text-white font-black uppercase italic text-xs tracking-wider flex items-center gap-2">
                                        <Sliders size={14} className="text-cyan-400" />
                                        {preferredLanguage === 'th' ? 'ตั้งค่าระบบเสียง Nimo' : 'Nimo Voice Settings'}
                                    </h3>
                                    <button 
                                        onClick={() => setShowNimoSettings(false)} 
                                        className="text-zinc-500 hover:text-white text-xs font-bold"
                                    >
                                        {preferredLanguage === 'th' ? 'ปิด' : 'Close'}
                                    </button>
                                </div>

                                {/* Settings items */}
                                <div className="space-y-4">
                                    {/* Noise Reduction Toggle */}
                                    <div className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl">
                                        <div>
                                            <p className="text-xs font-bold text-white">
                                                {preferredLanguage === 'th' ? 'ลดเสียงรบกวน (Noise Reduction)' : 'Noise Reduction'}
                                            </p>
                                            <p className="text-[9px] text-zinc-500 mt-0.5">
                                                {preferredLanguage === 'th' ? 'กรองเสียงรบกวนรอบข้างด้วยฟิลเตอร์' : 'Filter out ambient background noise'}
                                            </p>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            checked={noiseReductionEnabled} 
                                            onChange={e => toggleNoiseReduction(e.target.checked)}
                                            className="w-4 h-4 accent-cyan-500"
                                        />
                                    </div>

                                    {/* Voice Recognition / User Speaker ID Toggle */}
                                    <div className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl">
                                        <div>
                                            <p className="text-xs font-bold text-white">
                                                {preferredLanguage === 'th' ? 'จำกัดเสียงผู้ใช้หลัก (User Voice Lock)' : 'User Voice Lock'}
                                            </p>
                                            <p className="text-[9px] text-zinc-500 mt-0.5">
                                                {preferredLanguage === 'th' ? 'ฟังและทำตามคำสั่งเฉพาะเสียงของคุณเท่านั้น' : 'Only process voice commands from your voice'}
                                            </p>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            checked={voiceRecognitionEnabled} 
                                            onChange={e => toggleVoiceRecognition(e.target.checked)}
                                            disabled={!voiceProfile}
                                            className="w-4 h-4 accent-cyan-500 disabled:opacity-30"
                                        />
                                    </div>

                                    {/* Voice Enrollment Section */}
                                    <div className="p-4 bg-cyan-950/20 border border-cyan-500/10 rounded-2xl space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-black text-white uppercase tracking-tight">
                                                {preferredLanguage === 'th' ? 'โปรไฟล์เสียงผู้ใช้' : 'Voice Profile'}
                                            </p>
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                                                voiceProfile 
                                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                            }`}>
                                                {voiceProfile 
                                                    ? (preferredLanguage === 'th' ? 'ลงทะเบียนแล้ว' : 'Enrolled')
                                                    : (preferredLanguage === 'th' ? 'ยังไม่ได้ลงทะเบียน' : 'Not Enrolled')
                                                }
                                            </span>
                                        </div>

                                        {voiceProfile && (
                                            <div className="text-[10px] text-zinc-400 space-y-1 bg-black/30 p-2 rounded-lg">
                                                <p>{preferredLanguage === 'th' ? `บัญชี: ${authUser?.fullName || 'Guest'}` : `Account: ${authUser?.fullName || 'Guest'}`}</p>
                                                <p>{preferredLanguage === 'th' ? `ความถี่เฉลี่ย: ${Math.round(voiceProfile.avgPitch)} Hz` : `Avg Frequency: ${Math.round(voiceProfile.avgPitch)} Hz`}</p>
                                                <p>{preferredLanguage === 'th' ? `ช่วงความถี่ที่ยอมรับ: ${Math.round(voiceProfile.pitchMin)} Hz - ${Math.round(voiceProfile.pitchMax)} Hz` : `Range: ${Math.round(voiceProfile.pitchMin)}Hz - ${Math.round(voiceProfile.pitchMax)}Hz`}</p>
                                            </div>
                                        )}

                                        {enrolling ? (
                                            <div className="text-center py-3 bg-cyan-500/15 rounded-xl border border-cyan-500/20 animate-pulse">
                                                <p className="text-xs font-bold text-cyan-400 animate-bounce">
                                                    🎙️ {preferredLanguage === 'th' ? 'กรุณาพูดใส่ไมค์อย่างต่อเนื่อง...' : 'Please speak continuously...'}
                                                </p>
                                                <p className="text-[10px] text-zinc-400 mt-1">
                                                    {preferredLanguage === 'th' ? `เหลือเวลาอีก ${enrollCountdown} วินาที` : `${enrollCountdown}s remaining`}
                                                </p>
                                                {enrollPitchSampleCount > 0 && (
                                                    <p className="text-[9px] text-green-400 mt-0.5">
                                                        {preferredLanguage === 'th' ? `วิเคราะห์สัญญาณแล้ว ${enrollPitchSampleCount} ตัวอย่าง...` : `Analyzed ${enrollPitchSampleCount} samples...`}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={startVoiceEnrollment}
                                                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black uppercase rounded-xl transition-all active:scale-95 shadow-[0_2px_10px_rgba(0,229,255,0.2)]"
                                            >
                                                {voiceProfile 
                                                    ? (preferredLanguage === 'th' ? '👉 ลงทะเบียนเสียงใหม่ 👈' : '👉 Re-enroll Voice 👈')
                                                    : (preferredLanguage === 'th' ? '👉 เริ่มลงทะเบียนเสียง 👈' : '👉 Enroll Voice Now 👈')
                                                }
                                            </button>
                                        )}
                                    </div>

                                    {/* Allow Others Toggle */}
                                    {voiceRecognitionEnabled && (
                                        <div className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl">
                                            <div>
                                                <p className="text-xs font-bold text-white">
                                                    {preferredLanguage === 'th' ? 'อนุญาตเสียงผู้อื่นที่ได้รับอนุญาต' : 'Allow Authorized Others'}
                                                </p>
                                                <p className="text-[9px] text-zinc-500 mt-0.5">
                                                    {preferredLanguage === 'th' ? 'ยอมรับคำสั่งเสียงจากบุคคลอื่นด้วย' : 'Accept commands from other voices as well'}
                                                </p>
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={allowOthers} 
                                                onChange={e => setAllowOthers(e.target.checked)}
                                                className="w-4 h-4 accent-cyan-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <p className="text-[9px] text-zinc-500 leading-relaxed text-center">
                                    {preferredLanguage === 'th' 
                                        ? 'ระบบ Voice Lock ใช้การวิเคราะห์ความถี่เสียงหลัก (Fundamental Frequency) ในเบราว์เซอร์ เพื่อความปลอดภัยและเป็นส่วนตัวแบบ 100%' 
                                        : 'Voice Lock uses browser-based fundamental frequency estimation for 100% private and secure processing.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={msg.timestamp + i} className={`group/msg flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} chat-msg`}>
                            <div className={`relative max-w-[85%] px-5 py-3.5 rounded-[24px] text-[13px] leading-relaxed ${msg.role === 'user'
                                ? 'bg-zinc-800 text-white rounded-br-none'
                                : 'bg-cyan-500/10 text-cyan-100 border border-cyan-500/20 rounded-bl-none'
                                }`}>
                                {/* Copy single message button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(msg.content).then(() => {
                                            setCopiedId(String(msg.timestamp) + i);
                                            setTimeout(() => setCopiedId(null), 2000);
                                        });
                                    }}
                                    className={`absolute ${msg.role === 'user' ? 'left-2' : 'right-2'} bottom-1.5 p-1 rounded-md transition-all ${
                                        copiedId === String(msg.timestamp) + i
                                            ? 'text-green-400'
                                            : 'text-zinc-500 hover:text-zinc-300 opacity-40 hover:opacity-100'
                                    }`}
                                    title={preferredLanguage === 'th' ? 'คัดลอกข้อความ' : 'Copy message'}
                                >
                                    {copiedId === String(msg.timestamp) + i
                                        ? <Check size={11} />
                                        : <Copy size={11} />
                                    }
                                </button>
                                {/* Image preview in chat bubble */}
                                {msg.imageUrl && (
                                    <div className="mb-3 rounded-xl overflow-hidden border border-white/10 w-40 h-40">
                                        <img src={msg.imageUrl} alt="Sheet music" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                {msg.role === 'nimo' && msg.content.includes('\n') && (msg.content.includes('[') || msg.content.includes(']') || msg.content.split('\n').length >= 4) ? (
                                    <div className="space-y-3">
                                        <div className="font-serif italic text-center whitespace-pre-line text-zinc-100 bg-black/40 p-5 rounded-2xl border border-white/5 shadow-inner leading-loose tracking-wide">
                                            {msg.content}
                                        </div>
                                        <button
                                            onClick={() => {
                                                nimoBrain.executeAction('musicgen_set_lyrics', { lyrics: msg.content });
                                                nimoBrain.executeAction('navigate_to_page', { view: 'forge' });
                                            }}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase rounded-xl shadow-md active:scale-95 transition-all"
                                        >
                                            <Sparkles size={14} />
                                            {preferredLanguage === 'th' ? '🎹 ส่งไปที่ MusicGen' : '🎹 Send to MusicGen'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                                )}
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
                    {lockStatus && (
                        <p className="text-center text-[9px] text-emerald-400 font-bold uppercase tracking-wider py-1 animate-pulse flex items-center justify-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {lockStatus}
                        </p>
                    )}
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
                            onMusicFileImported={handleMusicFileImported}
                        />
                    )}

                    <div className="bg-white/5 border border-white/10 rounded-[32px] p-1 flex items-center gap-0 focus-within:border-cyan-500/50 transition-all shadow-2xl backdrop-blur-2xl mb-4">
                        {/* ScoreLens: Camera & File buttons */}
                        {!previewUrl && (
                            <ScoreLensBar
                                onFileSelected={handleFileSelected}
                                isProcessing={isProcessing}
                                previewUrl={null}
                                onClearPreview={handleClearPreview}
                                onMusicFileImported={handleMusicFileImported}
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

                        {listening && (
                            <button 
                                onClick={stopListeningAndHandsFree}
                                className="w-8 h-8 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(244,63,94,0.4)] active:scale-75 transition-all shrink-0 animate-pulse"
                                title={preferredLanguage === 'th' ? "หยุดฟังเสียงไมค์" : "Stop Listening"}
                            >
                                <Square size={16} fill="white" />
                            </button>
                        )}

                        <button 
                            onClick={toggleSpeakerMute}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-cyan-400 transition-all shrink-0"
                            title={speakerMuted ? (preferredLanguage === 'th' ? 'เปิดเสียงพูด Nimo' : 'Unmute Nimo Voice') : (preferredLanguage === 'th' ? 'ปิดเสียงพูด Nimo' : 'Mute Nimo Voice')}
                        >
                            {speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        {/* Mic Trigger */}
                        <button 
                            onClick={toggleMic}
                            disabled={isProcessing || isTyping}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                                listening ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'text-zinc-500 hover:text-cyan-400'
                            }`}
                        >
                            {listening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        <button
                            onClick={() => handleSend()}
                            disabled={(!input.trim() && !pendingFile) || isTyping || isProcessing}
                            className={`w-8 h-8 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 shrink-0 ${
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
