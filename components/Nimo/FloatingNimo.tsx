import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Mic, MicOff, X, MessageCircle } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';

// Helper: safe initial position for mobile/desktop
const getInitialPosition = () => ({
    x: Math.max(0, window.innerWidth - 360),
    y: Math.max(0, window.innerHeight - 520)
});

interface Message {
    role: 'user' | 'nimo';
    content: string;
    timestamp: number;
}

interface TourStep {
    selector: string;
    message: string;
}

interface FloatingNimoProps {
    isOpenProp?: boolean;
    setIsOpenProp?: (open: boolean) => void;
    voiceType?: 'teen_girl' | 'adult_woman' | 'teen_boy' | 'adult_man';
    preferredLanguage?: 'th' | 'en';
}

export const FloatingNimo: React.FC<FloatingNimoProps> = ({ isOpenProp, setIsOpenProp, voiceType = 'teen_girl', preferredLanguage = 'en' }) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen;
    const setIsOpen = setIsOpenProp || setInternalOpen;

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');

    // Update welcome message when language changes
    useEffect(() => {
        setMessages([
            {
                role: 'nimo',
                content: preferredLanguage === 'en'
                    ? "Hi! I'm Nimo, your AI music assistant 🎵 Ask me anything about music theory, chords, or how to use the app!"
                    : "สวัสดีค่ะ! Nimo พร้อมช่วยนำทางและตอบคำถามแล้วค่ะ ถามมาได้เลยนะคะ!",
                timestamp: Date.now()
            }
        ]);
    }, [preferredLanguage]);
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [activeTour, setActiveTour] = useState<TourStep[] | null>(null);
    const [currentTourIndex, setCurrentTourIndex] = useState(0);

    const isMobile = window.innerWidth < 640;
    const [position, setPosition] = useState(getInitialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    // genAI will be initialized in handleSend to prevent load errors

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping, isOpen]);

    // Fix stale closure: keep ref to latest handleSend
    const handleSendRef = useRef<(text?: string) => void>(() => {});

    // Setup Speech Recognition - with up-to-date handleSend via ref
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = preferredLanguage === 'en' ? 'en-US' : 'th-TH';
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            // Use ref so always latest handleSend
            handleSendRef.current(transcript);
            setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
    }, [preferredLanguage]);

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();

            const isEnglish = preferredLanguage === 'en';
            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';

            // For Thai: fix gender particles
            let spokenText = text;
            if (!isEnglish && isMale) {
                spokenText = spokenText.replace(/ค่ะ/g, 'ครับ').replace(/คะ/g, 'ครับ').replace(/นะคะ/g, 'นะครับ');
            }

            const utterance = new SpeechSynthesisUtterance(spokenText);

            if (isEnglish) {
                // American English voice
                utterance.lang = 'en-US';
                utterance.pitch = isMale ? 0.9 : 1.15;
                utterance.rate = isMale ? 0.95 : 1.0;

                const voices = window.speechSynthesis.getVoices();
                // Prefer Samantha (macOS) or Google US English or any en-US
                const enVoice =
                    voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha')) ||
                    voices.find(v => v.lang === 'en-US' && v.name.toLowerCase().includes(isMale ? 'male' : 'female')) ||
                    voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                    voices.find(v => v.lang.startsWith('en-US')) ||
                    voices.find(v => v.lang.startsWith('en'));
                if (enVoice) utterance.voice = enVoice;
            } else {
                // Thai voice
                utterance.lang = 'th-TH';
                let targetPitch = 1.0;
                let targetRate = 1.0;
                let searchGender = 'Female';
                let fallbackGender = 'หญิง';

                switch (voiceType) {
                    case 'teen_girl': targetPitch = 1.3; targetRate = 1.05; searchGender = 'Female'; fallbackGender = 'หญิง'; break;
                    case 'adult_woman': targetPitch = 1.0; targetRate = 0.95; searchGender = 'Female'; fallbackGender = 'หญิง'; break;
                    case 'teen_boy': targetPitch = 1.2; targetRate = 1.05; searchGender = 'Male'; fallbackGender = 'ชาย'; break;
                    case 'adult_man': targetPitch = 0.9; targetRate = 0.95; searchGender = 'Male'; fallbackGender = 'ชาย'; break;
                }
                utterance.pitch = targetPitch;
                utterance.rate = targetRate;

                const voices = window.speechSynthesis.getVoices();
                let thaiVoice = voices.find(v => v.lang.includes('th') && (v.name.includes(searchGender) || v.name.includes(fallbackGender)))
                    || voices.find(v => v.lang.includes('th'));
                if (thaiVoice) utterance.voice = thaiVoice;
            }

            window.speechSynthesis.speak(utterance);
        }
    };

    const toggleListen = async () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert(preferredLanguage === 'en'
                ? 'Microphone not supported on this browser. Try Chrome on Android.'
                : 'เบราว์เซอร์นี้ไม่รองรับไมโครโฟน ลองใช้ Chrome บน Android นะคะ');
            return;
        }
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            try {
                // Request mic permission explicitly first (important for mobile)
                await navigator.mediaDevices.getUserMedia({ audio: true });
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                console.error('Microphone error', e);
                alert(preferredLanguage === 'en'
                    ? 'Microphone permission denied. Please allow mic access.'
                    : 'กรุณาอนุญาตการใช้ไมโครโฟน แล้วลองอีกครั้ง');
                setIsListening(false);
            }
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('.nimo-no-drag')) return;
        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: position.x,
            initialY: position.y
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPosition({
            x: dragRef.current.initialX + dx,
            y: dragRef.current.initialY + dy
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        dragRef.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const handleSend = async (textToProcess?: string) => {
        const userMsg = textToProcess || input.trim();
        if (!userMsg || isTyping) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }]);
        setIsTyping(true);
        setActiveTour(null);
        window.speechSynthesis.cancel();

        // Streaming placeholder
        const nimoMsgId = Date.now();
        setMessages(prev => [...prev, { role: 'nimo', content: '...', timestamp: nimoMsgId }]);

        try {
            const apiKey = process.env.GEMINI_API_KEY || '';
            if (!apiKey) throw new Error('API key missing');

            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const particle = isMale ? 'ครับ' : 'ค่ะ';
            const langRule = preferredLanguage === 'en'
                ? 'Reply in English only. Be concise (2-3 sentences max).'
                : `ตอบเป็นภาษาไทย สั้น กระชับ ลงท้ายด้วย${particle}`;

            const systemPrompt = `You are Nimo, a friendly AI music assistant for Memolody app. ${langRule} Help with music theory, reading notes, and app usage. No markdown, no emojis in replies.`;

            // Use streaming API
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent?alt=sse&key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                    generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
                })
            });

            if (!res.ok) throw new Error(`API Error ${res.status}`);

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream reader');

            let fullText = '';
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                // Parse SSE lines
                for (const line of chunk.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (jsonStr === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const part = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (part) {
                            fullText += part;
                            // Update message in real-time (streaming effect)
                            setMessages(prev => prev.map(m =>
                                m.timestamp === nimoMsgId ? { ...m, content: fullText } : m
                            ));
                        }
                    } catch { /* skip malformed chunks */ }
                }
            }

            if (!fullText) fullText = preferredLanguage === 'en' ? 'Sorry, try again!' : `ขอโทษ${particle} ลองอีกครั้งนะ${particle}`;
            speak(fullText);

        } catch (error) {
            console.error('Nimo error:', error);
            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            const p = isMale ? 'ครับ' : 'ค่ะ';
            const fallback = preferredLanguage === 'en'
                ? 'Connection issue. Please try again!'
                : `เชื่อมต่อไม่ได้${p} ลองใหม่อีกครั้งนะ${p}`;
            setMessages(prev => prev.map(m =>
                m.timestamp === nimoMsgId ? { ...m, content: fallback } : m
            ));
        } finally {
            setIsTyping(false);
        }
    };

    // Keep ref updated so speech recognition always uses latest handleSend
    handleSendRef.current = handleSend;

    const nextTourStep = () => {
        if (!activeTour) return;
        if (currentTourIndex < activeTour.length - 1) {
            setCurrentTourIndex(prev => prev + 1);
            const nextStepMsg = activeTour[currentTourIndex + 1].message;
            if (nextStepMsg) speak(nextStepMsg);
        } else {
            setActiveTour(null);
            const isMale = voiceType === 'teen_boy' || voiceType === 'adult_man';
            speak(`จบการนำทางแล้ว${isMale ? 'ครับ' : 'ค่ะ'} มีอะไรให้ Nimo ช่วยอีกไหม${isMale ? 'ครับ' : 'คะ'}?`);
        }
    };

    // Calculate highlight overlay position
    const getTargetRect = () => {
        if (!activeTour) return null;
        const selector = activeTour[currentTourIndex].selector;
        const el = document.querySelector(selector);
        if (el) {
            return el.getBoundingClientRect();
        }
        return null;
    };

    const targetRect = getTargetRect();

    return (
        <>
            {/* Tour Overlay System */}
            {activeTour && targetRect && (
                <div className="fixed inset-0 z-[50000] pointer-events-none">
                    {/* Circle Highlight */}
                    <div
                        className="absolute border-4 border-cyan-500 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.8)] animate-pulse transition-all duration-500 ease-in-out flex items-center justify-center pointer-events-auto cursor-pointer bg-cyan-500/10 backdrop-blur-[2px]"
                        style={{
                            top: targetRect.top - 10,
                            left: targetRect.left - 10,
                            width: targetRect.width + 20,
                            height: targetRect.height + 20,
                        }}
                        onClick={(e) => {
                            // Simulate click on the actual element
                            const el = document.querySelector(activeTour[currentTourIndex].selector) as HTMLElement;
                            if (el) el.click();
                            nextTourStep();
                        }}
                    >
                        {/* Pointer Arrow and Text */}
                        <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 min-w-[200px] flex flex-col items-center pointer-events-none">
                            <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[15px] border-b-cyan-500 mb-2 drop-shadow-[0_0_10px_rgba(0,229,255,0.8)]" />
                            <div className="bg-black/80 border border-cyan-500/50 backdrop-blur-xl p-3 rounded-2xl shadow-2xl text-center">
                                <p className="text-sm font-bold text-white mb-2">{activeTour[currentTourIndex].message}</p>
                                <button className="nimo-no-drag px-4 py-1.5 bg-cyan-500 text-black text-[10px] font-black uppercase rounded-full pointer-events-auto hover:scale-105 active:scale-95 transition-transform shadow-[0_0_15px_rgba(0,229,255,0.4)]" onClick={(e) => { e.stopPropagation(); nextTourStep(); }}>
                                    {currentTourIndex < activeTour.length - 1 ? 'NEXT STEP' : 'FINISH'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bubble Button when Closed */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed z-[40000] bottom-24 right-6 w-14 h-14 bg-black border-2 border-cyan-500 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.4)] overflow-hidden hover:scale-110 transition-transform flex items-center justify-center group"
                >
                    <img src={NIMO_IDENTITY_IMAGE} className="absolute inset-0 w-full h-full object-cover object-top opacity-50 group-hover:opacity-100 transition-opacity" alt="" />
                    <MessageCircle className="text-white relative z-10 drop-shadow-md" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse border border-black"></span>
                </button>
            )}

            {/* Floating Chat Window */}
            {isOpen && (
                <div
                    className="fixed z-[40000] flex flex-col bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-2xl overflow-hidden transition-all duration-300"
                    style={{
                        width: '340px',
                        height: '500px',
                        left: position.x,
                        top: position.y,
                        touchAction: 'none'
                    }}
                >
                    {/* Header bar for dragging */}
                    <div
                        className="h-14 shrink-0 bg-white/5 border-b border-white/10 flex items-center justify-between px-4 cursor-move"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    >
                        <div className="flex items-center gap-2 pointer-events-none">
                            <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/50">
                                <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover object-top" alt="Nimo" />
                            </div>
                            <span className="font-black text-white italic tracking-tighter uppercase text-sm">NIMO AI</span>
                        </div>
                        <div className="flex items-center gap-2 nimo-no-drag">
                            <button onClick={() => setIsOpen(false)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                        {messages.map((msg, i) => (
                            <div key={msg.timestamp + i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] px-4 py-2.5 rounded-[20px] text-xs leading-relaxed ${msg.role === 'user'
                                    ? 'bg-zinc-800 text-white rounded-br-none'
                                    : 'bg-cyan-500/10 text-cyan-50 border border-cyan-500/30 rounded-bl-none shadow-[0_0_10px_rgba(0,229,255,0.05)]'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex justify-start">
                                <div className="bg-cyan-500/5 border border-cyan-500/10 px-4 py-2 rounded-[20px] rounded-bl-none flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-pulse" />
                                    <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-pulse [animation-delay:0.2s]" />
                                    <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full animate-pulse [animation-delay:0.4s]" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="shrink-0 p-3 bg-white/5 border-t border-white/10 nimo-no-drag">
                        <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-full p-1 pl-4 focus-within:border-cyan-500/50 transition-colors">
                            <input
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder={preferredLanguage === 'en' ? "Ask Nimo about music or app features..." : "ถาม Nimo หรือให้ช่วยคลิก..."}
                                className="flex-1 bg-transparent border-none outline-none text-white text-xs placeholder:text-zinc-600"
                            />
                            <button
                                onClick={toggleListen}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            >
                                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                            </button>
                            <button
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isTyping}
                                className="w-8 h-8 bg-cyan-500 text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
