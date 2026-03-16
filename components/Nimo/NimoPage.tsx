
import React, { useState, useEffect, useRef } from 'react';
import { Send, Music, MessageSquare, Bot, Sparkles, ChevronRight } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';
import { GoogleGenAI } from "@google/genai";

interface Message {
    role: 'user' | 'nimo';
    content: string;
    timestamp: number;
}

interface NimoPageProps {
    selectedSong?: any;
    xmlData?: string | null;
    preferredLanguage?: 'th' | 'en';
}

const NimoPage: React.FC<NimoPageProps> = ({ selectedSong, xmlData, preferredLanguage = 'en' }) => {
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
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initialize Gemini (API Key from vite.config definition)
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    // Note: GoogleGenAI class from @google/genai often uses a slightly different structure than @google/generative-ai
    // Checking VocalEngine.ts, it uses `new GoogleGenAI({ apiKey: ... })` then `ai.models.generateContent`
    // However, NimoPage needs a chat session. I'll adapt to the project's existing pattern.

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }]);

        setIsTyping(true);

        try {
            if (!process.env.GEMINI_API_KEY) {
                // Fallback to local logic if no API key
                setTimeout(() => {
                    const response = generateMockResponse(userMsg);
                    setMessages(prev => [...prev, { role: 'nimo', content: response, timestamp: Date.now() }]);
                    setIsTyping(false);
                }, 1000);
                return;
            }

            // @ts-ignore (Vite replaces this at build time, ignore TS error)
            const apiKey = process.env.GEMINI_API_KEY || "";

            // Build language-aware prompt
            const langInstruction = preferredLanguage === 'en'
                ? `You MUST respond entirely in English. Do NOT use Thai language at all. Be friendly and use music emojis.`
                : `Thai language is preferred. End sentences with 'ค่ะ' or 'นะคะ'. Use emojis to be expressive.`;

            const prompt = `You are Nimo, an expert female AI music tutor for the Memolody platform.
Personality: Friendly, encouraging, professional but casual.
Expertise: Music theory, chords, scales, songwriting, and Memolody app help.
Current Context: The user is looking at a song called "${selectedSong?.title || 'Unknown'}" by "${selectedSong?.artist || 'Unknown'}" in ${selectedSong?.category || 'Unknown'} style. BPM: ${selectedSong?.bpm || 'auto'}.
Language Rule: ${langInstruction}

Conversation History:
${messages.slice(-5).map(m => `${m.role === 'nimo' ? 'Nimo' : 'User'}: ${m.content}`).join('\n')}

New Message: ${userMsg}`;

            // Use native fetch to bypass SDK browser/CORS issues
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(`Gemini API Error: ${res.status} HTTP - ${JSON.stringify(errorData)}`);
            }

            const data = await res.json();

            // Extract text from parts
            let responseText = "";
            const candidate = data.candidates?.[0];
            if (candidate?.content?.parts) {
                responseText = candidate.content.parts
                    .filter((p: any) => p.text)
                    .map((p: any) => p.text)
                    .join("");
            }

            if (!responseText) {
                responseText = (preferredLanguage === 'en' ? "Sorry, Nimo couldn't respond right now. Please try again!" : "ขออภัยค่ะ Nimo มึนหัวนิดหน่อย ลองถามใหม่นะคะ");
            }

            setMessages(prev => [...prev, { role: 'nimo', content: responseText, timestamp: Date.now() }]);
        } catch (error) {
            console.error("Gemini Error:", error);
            setMessages(prev => [...prev, { role: 'nimo', content: "ขออภัยค่ะ พอดีการเชื่อมต่อ Neural Link ขัดข้องนิดหน่อย ลองถามใหม่อีกครั้งนะคะ", timestamp: Date.now() }]);
        } finally {
            setIsTyping(false);
        }
    };

    const generateMockResponse = (text: string): string => {
        const lower = text.toLowerCase();

        if (lower.includes('คอร์ด') || lower.includes('chord')) {
            if (lower.includes('c')) return "คอร์ด C Major ประกอบด้วยโน้ต Do (C), Mi (E), และ Sol (G) ค่ะ เป็นคอร์ดพื้นฐานที่สำคัญที่สุดเลยค่ะ! 🎹";
            if (lower.includes('g')) return "คอร์ด G Major ประกอบด้วย G, B, D ค่ะ มีความสว่างและมักใช้เป็นคอร์ด Dominant (V) ใน Key C คะ ✨";
            if (lower.includes('f')) return "คอร์ด F Major ประกอบด้วย F, A, C ค่ะ เป็นคอร์ด Sub-dominant (IV) ที่ให้ความรู้สึกมั่นคงค่ะ";
            return "ในทฤษฎีดนตรี คอร์ดคือการนำโน้ตตั้งแต่ 3 ตัวขึ้นไปมาวางทับซ้อนกันค่ะ ลองถามเจาะจงเป็นชื่อคอร์ดดูไหมคะ?";
        }

        if (lower.includes('สวัสดี') || lower.includes('hi') || lower.includes('hello')) {
            return "สวัสดีค่ะ! ยินดีที่ได้พบคุณนะคะ วันนี้อยากให้ Nimo ช่วยแนะนำหรือวิเคราะห์เพลงไหนเป็นพิเศษไหมคะ? 😊";
        }

        if (lower.includes('เพลง') || lower.includes('วิเคราะห์') || lower.includes('song')) {
            if (selectedSong) {
                return `จากการวิเคราะห์เพลง "${selectedSong.title}" โดยคุณ ${selectedSong.artist} พบว่าเป็นแนว ${selectedSong.category} ค่ะ มี Tempo ที่ ${selectedSong.bpm} BPM ซึ่งเหมาะกับการฝึกซ้อมแบบเน้นจังหวะนะคะ 🎵`;
            }
            return "หากคุณเลือกเพลงจากหน้า Home หรือ Matrix ฉันจะสามารถช่วยวิเคราะห์โครงสร้างเพลงให้ได้ละเอียดขึ้นนะคะ!";
        }

        return "ขอบคุณสำหรับคำถามนะคะ! Nimo กำลังเรียนรู้ภาษาดนตรีของคุณอยู่ค่ะ ลองถามเรื่อง คอร์ด, สเกล หรือให้ช่วยวิเคราะห์เพลงปัจจุบันของคุณดูนะคะ ❤️";
    };

    return (
        <div className="min-h-screen bg-[#050507] flex flex-col items-center pb-32 font-sans overflow-hidden">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                .chat-msg { animation: slideIn 0.3s ease-out; }
                @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .typing-dot { animation: blink 1.4s infinite; }
                @keyframes blink { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>

            <div className="w-full max-w-xl px-4 py-8 flex flex-col gap-6 h-[calc(100vh-80px)]">
                {/* Header */}
                <div className="text-center shrink-0">
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-cyan-500" />
                        <span className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.4em]">Neural Music Engine</span>
                        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-cyan-500" />
                    </div>
                    <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase">NIMO AI</h1>
                    <p className="text-sm text-zinc-500 font-bold italic mt-1 italic">"Wisdom of Play by Ear and Hear by Eye"</p>
                </div>

                {/* Identity Card */}
                <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-[32px] p-5 flex items-center gap-5 backdrop-blur-xl shrink-0">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(0,229,255,0.2)] shrink-0">
                        <img src={NIMO_IDENTITY_IMAGE} className="w-full h-full object-cover object-top scale-125" alt="Nimo" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white italic uppercase">Nimo v1.8</span>
                            <div className="px-2 py-0.5 bg-cyan-500 text-[8px] font-bold text-black rounded-full uppercase tracking-tighter">Live Support</div>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Music Intelligence Core active. Ready to analyze your melodies and harmonic structures.</p>
                    </div>
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
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="flex justify-start chat-msg">
                            <div className="bg-cyan-500/5 border border-cyan-500/10 px-5 py-3 rounded-[20px] rounded-bl-none flex gap-1">
                                <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full typing-dot" />
                                <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full typing-dot [animation-delay:0.2s]" />
                                <div className="w-1.5 h-1.5 bg-cyan-500/60 rounded-full typing-dot [animation-delay:0.4s]" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="shrink-0 bg-white/5 border border-white/10 rounded-[32px] p-2 flex items-center gap-2 focus-within:border-cyan-500/50 transition-all shadow-2xl backdrop-blur-2xl mb-4">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="ถาม Nimo เรื่องดนตรีหรือวิธีใช้แอพ..."
                        className="flex-1 bg-transparent border-none outline-none text-white px-4 py-2 text-sm placeholder:text-zinc-600"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isTyping}
                        className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NimoPage;
