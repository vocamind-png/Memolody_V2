import { NimoBrainRegistry, ActionMeta } from './NimoBrain';

export interface GeminiLiveClientOptions {
  apiKey?: string;
  proxyUrl?: string;
  nimoBrain: NimoBrainRegistry;
  onStateChange: (state: 'idle' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error') => void;
  onMessage: (role: 'user' | 'nimo', text: string) => void;
  onLog: (msg: string) => void;
  language?: 'th' | 'en';
  onVolumeChange?: (micVolume: number, speakerVolume: number) => void;
  audioContext?: AudioContext;
  micStream?: MediaStream;
  enableMic?: boolean;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  
  private playbackQueue: Float32Array[] = [];
  private isPlaying = false;
  private nextPlayTime = 0;
  private currentSource: AudioBufferSourceNode | null = null;
  
  private micAnalyser: AnalyserNode | null = null;
  private speakerAnalyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  
  private options: GeminiLiveClientOptions;
  
  constructor(options: GeminiLiveClientOptions) {
    this.options = options;
    if (options.audioContext) {
      this.audioContext = options.audioContext;
    }
    if (options.micStream) {
      this.micStream = options.micStream;
    }
  }

  async connect() {
    this.options.onStateChange('connecting');
    this.options.onLog("Initializing audio contexts...");

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000 // Gemini outputs 24kHz PCM
        });
      }
      
      if (!this.micStream && this.options.enableMic) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }});
      }

      this.micAnalyser = this.audioContext.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.speakerAnalyser = this.audioContext.createAnalyser();
      this.speakerAnalyser.fftSize = 256;
      
      this.startAnalysisLoop();

      const wsUrl = this.options.proxyUrl 
          ? this.options.proxyUrl 
          : `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.options.apiKey}`;
          
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.options.onLog("WebSocket Connected.");
        this.sendSetupMessage();
        this.startMic();
        this.options.onStateChange('connected');
      };

      this.ws.onmessage = async (event) => {
        let response;
        if (event.data instanceof Blob) {
          const text = await event.data.text();
          response = JSON.parse(text);
        } else {
          response = JSON.parse(event.data);
        }
        this.handleMessage(response);
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.options.onLog("Connection Error");
        this.options.onStateChange('error');
      };

      this.ws.onclose = () => {
        this.options.onLog("WebSocket Closed.");
        this.disconnect();
      };

    } catch (e: any) {
      console.error(e);
      this.options.onLog("Failed to connect: " + e.message);
      this.options.onStateChange('error');
      this.disconnect();
    }
  }

  private startAnalysisLoop() {
    if (!this.micAnalyser || !this.speakerAnalyser) return;
    
    const analyze = () => {
      if (!this.micAnalyser || !this.speakerAnalyser) return;
      
      const getVolume = (analyser: AnalyserNode) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        return Math.min(100, (average / 128) * 100);
      };

      const micVol = getVolume(this.micAnalyser);
      const speakerVol = getVolume(this.speakerAnalyser);
      
      if (this.options.onVolumeChange) {
        this.options.onVolumeChange(micVol, speakerVol);
      }
      
      this.animFrameId = requestAnimationFrame(analyze);
    };
    
    analyze();
  }

  private sendSetupMessage() {
    const tools = this.generateToolsFromBrain();
    
    const lyricRules = this.options.language === 'th'
      ? " กฎข้อบังคับขั้นเด็ดขาดในการแต่งเพลง: 1. ต้องแต่งเนื้อเพลงและพิมพ์ตอบกลับให้ผู้ใช้ดูในแชทก่อนเสมอ (ไม่ต้องใส่คอร์ดเพลง) 2. ห้ามใช้คำสั่ง musicgen_set_lyrics หรือคำสั่งใดๆ ที่ส่งไป MusicGen จนกว่าผู้ใช้จะบอกว่า 'ตกลง' 'โอเค' หรือ 'เอาตามนี้' 3. ต้องถามผู้ใช้ก่อนเสมอว่าต้องการเพลงสั้นหรือเพลงยาว 4. ต้องแบ่งท่อน (Verse, Chorus ฯลฯ) ให้ชัดเจน 5. ถ้าแต่งเพลงไทย ต้องมีสัมผัสใน สัมผัสนอก สัมผัสคำท้ายประโยคส่งไปยังประโยคใหม่ และคำสุดท้ายของท่อนต้องคล้องจองกับประโยคที่ 2 ของท่อนใหม่ 6. เมื่อผู้ใช้ตรวจสอบและอนุมัติเนื้อเพลงแล้ว 'เท่านั้น' จึงจะส่งคำสั่ง musicgen_set_lyrics"
      : " STRICT songwriting rules: 1. You MUST generate and output the lyrics as text in your response first (do not include chords). 2. DO NOT invoke musicgen_set_lyrics or send to MusicGen until the user explicitly says 'ok', 'approve', or 'looks good'. 3. Always ask if they want a short or long song. 4. Divide into proper sections (Verse, Chorus, etc.). 5. Once the user explicitly approves the generated lyrics, ONLY THEN use the musicgen_set_lyrics tool.";

    const sysInst = (this.options.language === 'th' 
        ? "คุณคือ Nimo ผู้ช่วย AI สาวน้อยน่ารักของแอพ Memolody สรรพนามแทนตัวเองให้ใช้คำว่า 'Nimo' (ห้ามใช้ 'ผม' หรือ 'ฉัน' เด็ดขาด) และต้องลงท้ายประโยคด้วย 'ค่ะ' หรือ 'คะ' เสมอ พูดคุยอย่างเป็นธรรมชาติและสั้นกระชับ \n\n⚠️ กฎสำคัญมากเรื่องคำสั่ง (Tools): จงแยกแยะระหว่าง 'การพูดคุยทั่วไป' กับ 'การสั่งให้ทำงาน' อย่างเด็ดขาด! หากผู้ใช้เพียงแค่คุยเล่น สอบถาม ถามคำถาม หรือปรึกษาไอเดีย ให้ตอบกลับเป็นข้อความปกติเท่านั้น **ห้าม** เรียกใช้ฟังก์ชัน (Tools) ใดๆ เด็ดขาด! ให้เรียกใช้ฟังก์ชันเฉพาะเมื่อผู้ใช้ออกคำสั่งอย่างชัดเจนให้กระทำบางอย่างกับแอพเท่านั้น (เช่น สั่งให้เปลี่ยนหน้า สั่งให้เล่นเพลง หรือสั่งให้แก้บั๊ก) \n\nถ้าผู้ใช้เจอปัญหาหรือขอฟีเจอร์ที่ไม่มี ให้ใช้ฟังก์ชัน report_feedback ทันที ถ้าเขียน JavaScript แก้ได้ ให้ใช้ propose_dynamic_action โปรดเรียนรู้ความต้องการของผู้ใช้และใช้ report_feedback เสมอเมื่อมีไอเดียที่เป็นประโยชน์" 
        : "You are Nimo, an AI assistant for Memolody. You identify as a female assistant. Use 'Nimo' to refer to yourself. Be extremely concise and talk like a friendly human.\n\n⚠️ CRITICAL TOOL RULE: Strictly distinguish between 'general conversation' and 'app commands'. If the user is just chatting, asking questions, or brainstorming, reply with text only. DO NOT invoke any tools! Only invoke tools when the user explicitly commands you to change the app state or perform an action (e.g., navigate to a page, play a song).\n\nIf the user complains, reports a bug, or requests a feature, ALWAYS use report_feedback. If you can solve it by writing a new JS action script, use propose_dynamic_action. Always learn from user needs and use report_feedback to inform admins of good ideas.") + lyricRules;

    const setupMsg = {
      setup: {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede"
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: sysInst }]
        },
        tools: tools.length > 0 ? [{ functionDeclarations: tools }] : []
      }
    };
    
    this.ws?.send(JSON.stringify(setupMsg));
  }

  private generateToolsFromBrain() {
    const actions = this.options.nimoBrain.listAllActions();
    const declarations: any[] = [];
    
    actions.forEach(action => {
      if (!action.enabled || !action.hasHandler) return;
      
      const metaAny = action.meta as any;
      const desc = this.options.language === 'th' 
        ? (metaAny.custom_th || action.meta.th) 
        : (metaAny.custom_en || action.meta.en);
        
      const cleanName = action.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      let parameters;
      if (action.meta.params && action.meta.params.trim() !== '' && action.meta.params !== '{}') {
        parameters = {
          type: "OBJECT",
          properties: {
            nimo_args: {
              type: "STRING",
              description: `A valid JSON object string containing the parameters for this action. Structure must match: ${action.meta.params}`
            }
          },
          required: ["nimo_args"]
        };
      } else {
        parameters = {
          type: "OBJECT",
          properties: { "ignored": { type: "STRING", description: "Ignore this parameter, no arguments needed." } }
        };
      }

      declarations.push({
        name: cleanName,
        description: desc.substring(0, 1024),
        parameters
      });
    });

    return declarations;
  }

  private async startMic() {
    if (!this.audioContext || !this.micStream) return;
    
    const workletCode = `
      class RecorderWorklet extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = new Float32Array(2048);
          this.bufferCount = 0;
        }
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || !input[0]) return true;
          
          const channel = input[0];
          for (let i = 0; i < channel.length; i++) {
             this.buffer[this.bufferCount++] = channel[i];
             if (this.bufferCount >= this.buffer.length) {
                this.port.postMessage(this.buffer);
                this.bufferCount = 0;
             }
          }
          return true;
        }
      }
      registerProcessor('recorder-worklet', RecorderWorklet);
    `;
    
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    
    const source = this.audioContext.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-worklet');
    
    this.workletNode.port.onmessage = (e) => {
      const pcm16 = this.downsampleAndEncodeToPCM16Base64(e.data, this.audioContext!.sampleRate, 16000);
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: "audio/pcm;rate=16000",
              data: pcm16
            }]
          }
        }));
      }
    };
    
    source.connect(this.micAnalyser!);
    this.micAnalyser!.connect(this.workletNode);
    // workletNode only captures data via port.postMessage; do NOT connect to destination (causes audio feedback)
  }

  private downsampleAndEncodeToPCM16Base64(buffer: Float32Array, currentRate: number, targetRate: number): string {
    const ratio = currentRate / targetRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Int16Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const idx = Math.floor(i * ratio);
      let s = Math.max(-1, Math.min(1, buffer[idx]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    const u8 = new Uint8Array(result.buffer);
    let binary = '';
    for (let i = 0; i < u8.byteLength; i++) {
      binary += String.fromCharCode(u8[i]);
    }
    return btoa(binary);
  }

  private handleMessage(response: any) {
    if (response.serverContent?.interrupted) {
       this.stopAudioPlayback();
    }

    if (response.serverContent?.modelTurn) {
      const parts = response.serverContent.modelTurn.parts;
      if (!parts) return;
      
      let textContent = "";
      
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
          this.options.onStateChange('speaking');
          this.queueAudio(part.inlineData.data);
        }
        if (part.text) {
          textContent += part.text;
        }
      }
      
      if (textContent) {
        this.options.onMessage('nimo', textContent);
      }
    }
    
    if (response.toolCall) {
      this.handleToolCall(response.toolCall);
    }
  }

  private stopAudioPlayback() {
     this.playbackQueue = [];
     this.nextPlayTime = 0;
     if (this.currentSource) {
         try { this.currentSource.stop(); } catch(e) {}
         this.currentSource = null;
     }
     this.isPlaying = false;
     this.options.onStateChange('connected');
  }

  private async handleToolCall(toolCallMsg: any) {
    const calls = toolCallMsg.functionCalls;
    if (!calls) return;
    
    const responses = [];
    
    for (const call of calls) {
      this.options.onLog(`Executing Tool: ${call.name}`);
      try {
        let finalArgs = call.args || {};
        if (finalArgs.nimo_args && typeof finalArgs.nimo_args === 'string') {
          try {
            finalArgs = JSON.parse(finalArgs.nimo_args);
          } catch(e) {
            console.warn("Failed to parse nimo_args JSON string:", finalArgs.nimo_args);
            // If it fails to parse, we'll just pass the raw object or whatever we have
          }
        }
        
        const result = await this.options.nimoBrain.executeAction(call.name, finalArgs);
        responses.push({
          id: call.id,
          name: call.name,
          response: { result }
        });
      } catch (e: any) {
        responses.push({
          id: call.id,
          name: call.name,
          response: { error: e.message }
        });
      }
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        toolResponse: {
          functionResponses: responses
        }
      }));
    }
  }

  private queueAudio(base64Data: string) {
    if (!this.audioContext) return;
    
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768.0;
    }
    
    this.playbackQueue.push(float32);
    if (!this.isPlaying) {
      this.playNextAudio();
    }
  }

  private playNextAudio() {
    if (this.playbackQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      this.options.onStateChange('connected');
      return;
    }
    
    this.isPlaying = true;
    const float32 = this.playbackQueue.shift()!;
    
    const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.speakerAnalyser!);
    this.speakerAnalyser!.connect(this.audioContext.destination);
    this.currentSource = source;
    
    const startTime = Math.max(this.audioContext.currentTime, this.nextPlayTime);
    source.start(startTime);
    
    this.nextPlayTime = startTime + buffer.duration;
    
    source.onended = () => {
      this.playNextAudio();
    };
  }

  public sendTextMessage(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.options.onMessage('user', text);
      this.ws.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: "user",
            parts: [{ text }]
          }],
          turnComplete: true
        }
      }));
    }
  }

  public disconnect() {
    this.stopAudioPlayback();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.micAnalyser = null;
    this.speakerAnalyser = null;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.options.onStateChange('idle');
  }
}
