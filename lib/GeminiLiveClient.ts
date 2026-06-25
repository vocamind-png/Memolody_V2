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
      
      if (!this.micStream) {
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
    
    const sysInst = this.options.language === 'th' 
        ? "คุณคือ Nimo ผู้ช่วย AI ของแอพ Memolody พูดคุยอย่างเป็นธรรมชาติและสั้นกระชับ ใช้ฟังก์ชันต่างๆ เพื่อควบคุมแอพเมื่อจำเป็น ถ้าผู้ใช้เจอปัญหา บ่น หรือขอฟีเจอร์ที่ไม่มี ให้รับทราบปัญหาและใช้ฟังก์ชัน report_feedback ทันที ถ้าเป็นฟีเจอร์ที่สามารถแก้ได้ด้วยการเขียน JavaScript ให้ใช้ propose_dynamic_action สร้างให้เลย" 
        : "You are Nimo, an AI assistant for Memolody. Be extremely concise. Talk like a friendly human. Execute tools to navigate the app when asked. If the user complains, reports a bug, or requests a feature, acknowledge it and ALWAYS use report_feedback. If you can solve it by writing a new JS action script, use propose_dynamic_action.";

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
      
      let props = {};
      try {
        if (action.meta.params) {
           props = JSON.parse(action.meta.params);
        }
      } catch(e) {}
      
      const desc = this.options.language === 'th' 
        ? (action.meta.custom_th || action.meta.th) 
        : (action.meta.custom_en || action.meta.en);
        
      const cleanName = action.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Fix empty parameters for Gemini API schema
      const parameters = Object.keys(props).length > 0 ? {
        type: "OBJECT",
        properties: props
      } : {
        type: "OBJECT",
        properties: { "ignored": { type: "STRING", description: "Ignore this" } }
      };

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
      const pcm16 = this.downsampleAndEncodeToPCM16Base64(e.data, 24000, 16000);
      
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
    this.workletNode.connect(this.audioContext.destination);
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
        const result = await this.options.nimoBrain.executeAction(call.name, call.args || {});
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
