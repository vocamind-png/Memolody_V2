
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Music, MessageSquare, Bot, Sparkles, ChevronRight, Music2 } from 'lucide-react';
import { NIMO_IDENTITY_IMAGE } from '../../constants';

import { Song } from '../../types';
import ScoreLensBar from '../ScoreLens/ScoreLensBar';
import { useScoreLens, ScoreLensResult } from '../ScoreLens/useScoreLens';

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

    // Update welcome message when language changes
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
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initialize Gemini (API Key from vite.config definition)


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

    // ── ScoreLens: Process image when user sends ────────────────────
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
            setMessages(prev => [...prev, {
                role: 'nimo',
                content: preferredLanguage === 'th'
                    ? `✅ แปลงสำเร็จค่ะ! เพลง **"${result.song.title}"** โดย ${result.song.artist} 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | โน้ต: ${noteCount} ตัว\n\nระบบจะพาคุณไปหน้า Player โดยอัตโนมัติ หรือกดปุ่มด้านล่างเพื่อฟังได้เลยค่ะ ▶️`
                    : `✅ Done! Song **"${result.song.title}"** by ${result.song.artist} 🎶\n\n📊 Key: ${result.song.key} | BPM: ${result.song.bpm} | Notes: ${noteCount}\n\nAuto-navigating to Player, or tap below to listen ▶️`,
                timestamp: Date.now(),
                actionData: { song: result.song, xmlData: result.xmlData }
            }]);

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
            setMessages(prev => [...prev, {
                role: 'nimo',
                content: preferredLanguage === 'th'
                    ? `❌ ไม่สามารถแปลงได้ค่ะ: ${errMsg}\n\nลองถ่ายภาพใหม่ให้ชัดขึ้น หรือใช้ภาพที่มีความละเอียดสูงนะคะ`
                    : `❌ Could not convert: ${errMsg}\n\nTry a clearer photo or higher resolution image.`,
                timestamp: Date.now()
            }]);
        }
    }, [pendingFile, previewUrl, preferredLanguage, processImage, onSongSelect, onRefresh]);

    // ── Auto-process file passed from Home Import ──────────────────────
    const initialFileProcessed = useRef(false);
    useEffect(() => {
        if (initialFile && !initialFileProcessed.current) {
            initialFileProcessed.current = true;
            console.log('[NimoPage] Auto-processing file from Home:', initialFile.name);
            // Set file and preview first
            setPendingFile(initialFile);
            setPreviewUrl(URL.createObjectURL(initialFile));
            // Then trigger processing after a tick
            setTimeout(() => {
                handleScoreLensSend();
            }, 300);
        }
    }, [initialFile, handleScoreLensSend]);

    // ── Send Handler (text or ScoreLens) ─────────────────────────────
    const handleSend = async () => {
        // If there's a pending image, process with ScoreLens
        if (pendingFile) {
            await handleScoreLensSend();
            return;
        }

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

            // Direct API call (key is unrestricted)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
            return "สวัสดีค่ะ! ยินดีที่ได้พบคุณนะคะ วันนี้อยากให้ Nimo ช่วยแนะนำหรือวิเคราะห์เพลงไหนเป็นพิเศษไหมคะ? หรือจะถ่ายรูปโน้ตเพลงมาให้ช่วยแปลงเป็น XML ก็ได้ค่ะ 📷🎵";
        }

        if (lower.includes('เพลง') || lower.includes('วิเคราะห์') || lower.includes('song')) {
            if (selectedSong) {
                return `จากการวิเคราะห์เพลง "${selectedSong.title}" โดยคุณ ${selectedSong.artist} พบว่าเป็นแนว ${selectedSong.category} ค่ะ มี Tempo ที่ ${selectedSong.bpm} BPM ซึ่งเหมาะกับการฝึกซ้อมแบบเน้นจังหวะนะคะ 🎵`;
            }
            return "หากคุณเลือกเพลงจากหน้า Home หรือ Matrix ฉันจะสามารถช่วยวิเคราะห์โครงสร้างเพลงให้ได้ละเอียดขึ้นนะคะ!";
        }

        if (lower.includes('scan') || lower.includes('สแกน') || lower.includes('โน้ต') || lower.includes('ภาพ')) {
            return "หากคุณต้องการสแกนภาพโน้ตเพลง ให้กดปุ่ม 📷 กล้อง หรือ 📎 แนบไฟล์ โน้ต PDF/PNG/JPEG ได้เลยค่ะ ดิฉันจะแปลงเป็น MusicXML ให้อัตโนมัติเลยนะคะ! 🎶";
        }

        return "ขอบคุณสำหรับคำถามนะคะ! Nimo กำลังเรียนรู้ภาษาดนตรีของคุณอยู่ค่ะ ลองถามเรื่อง คอร์ด, สเกล หรือกด 📷 เพื่อสแกนโน้ตเพลงจากภาพก็ได้นะคะ ❤️";
    };

    return (
        <div
            className="min-h-screen bg-[#050507] flex flex-col items-center pb-32 font-sans overflow-hidden relative"
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
                            <div className="px-2 py-0.5 bg-cyan-500 text-[8px] font-bold text-black rounded-full uppercase tracking-tighter">ScoreLens</div>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Music Intelligence Core active. Tap 📷 to scan sheet music or ask anything about music.</p>
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

                    {/* ScoreLens processing progress */}
                    {isProcessing && progress && (
                        <div className="flex justify-start chat-msg">
                            <div className="bg-amber-500/10 border border-amber-500/20 px-5 py-3 rounded-[20px] rounded-bl-none text-[12px] text-amber-200 font-bold">
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
                </div>

                {/* Input Area with ScoreLens Buttons */}
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
                                : (preferredLanguage === 'th' ? 'วางภาพ (Ctrl+V) หรือถาม Nimo...' : 'Paste image (Ctrl+V) or ask Nimo...')}
                            className="flex-1 bg-transparent border-none outline-none text-white px-3 py-2 text-sm placeholder:text-zinc-600"
                            disabled={isProcessing}
                        />
                        <button
                            onClick={handleSend}
                            disabled={(!input.trim() && !pendingFile) || isTyping || isProcessing}
                            className={`w-12 h-12 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 ${
                                pendingFile ? 'bg-cyan-500 text-black' : 'bg-white text-black'
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
