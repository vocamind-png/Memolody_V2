// NimoBrain Command & Action Registry for Memolody_V2
// Allows dynamic registration of page/component specific actions that can be triggered by Nimo AI via voice commands.

export interface NimoAction {
  id: string;
  handler: (params?: any) => void | Promise<void>;
}

// Light symmetric encryption using XOR + Base64
export function encryptString(str: string, key: string): string {
  if (typeof window === 'undefined') return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return window.btoa(result);
}

export function decryptString(b64: string, key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const str = window.atob(b64);
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch (e) {
    return '';
  }
}

export class NimoBrainRegistry {
  private actions: Map<string, (params?: any) => void | Promise<void>> = new Map();
  private state: Record<string, any> = {};
  private listeners: Set<(state: Record<string, any>) => void> = new Set();
  
  // Remote polling status
  private pollingActive = false;
  private processedCommandIds: Set<string> = new Set();

  registerAction(id: string, handler: (params?: any) => void | Promise<void>) {
    this.actions.set(id, handler);
    console.log(`[NimoBrain] Action registered: ${id}`);
    return () => this.unregisterAction(id);
  }

  unregisterAction(id: string) {
    this.actions.delete(id);
    console.log(`[NimoBrain] Action unregistered: ${id}`);
  }

  hasAction(id: string): boolean {
    return this.actions.has(id);
  }

  async executeAction(id: string, params?: any) {
    const handler = this.actions.get(id);
    if (!handler) {
      console.warn(`[NimoBrain] Action not found: ${id}`);
      return;
    }
    console.log(`[NimoBrain] Executing action: ${id}`, params);
    try {
      await handler(params);
    } catch (err) {
      console.error(`[NimoBrain] Error executing action: ${id}`, err);
    }
  }

  updateState(key: string, value: any) {
    this.state[key] = value;
    this.notifyListeners();
  }

  getState() {
    return { ...this.state };
  }

  subscribe(listener: (state: Record<string, any>) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const currentState = this.getState();
    this.listeners.forEach(l => l(currentState));
  }

  // --- Secret Override & Remote Control ---

  // Checks input text. Returns true if it was recognized as a secret override command prefix
  // (which means Nimo shouldn't send this to Gemini AI).
  processSecretCommand(inputText: string): boolean {
    const trimmed = inputText.trim();
    
    // Check for "paisan:" (case-insensitive)
    if (!trimmed.toLowerCase().startsWith('paisan:')) {
      return false;
    }

    console.log("[NimoBrain] Secret command prefix detected:", trimmed);

    // Get active passcode from localStorage (default: 'paisan123')
    const passcode = typeof window !== 'undefined'
      ? window.localStorage.getItem('nimo_remote_passcode') || 'paisan123'
      : 'paisan123';

    // Format splits:
    // 1. paisan:enc:<base64_cipher>
    // 2. paisan:<plaintext_passcode>:<command>
    const parts = trimmed.split(':');
    if (parts.length < 2) {
      console.warn("[NimoBrain] Invalid secret command format.");
      return true; 
    }

    let commandString = '';

    if (parts[1].toLowerCase() === 'enc') {
      const ciphertext = parts.slice(2).join(':');
      commandString = decryptString(ciphertext, passcode);
      if (!commandString) {
        console.error("[NimoBrain] Decryption failed. Passcode mismatch?");
        this.showToastNotification("คำสั่งลับ: ถอดรหัสล้มเหลว (รหัสผ่านไม่ถูกต้อง)", "#EF4444");
        return true;
      }
      console.log("[NimoBrain] Decrypted command:", commandString);
    } else {
      const enteredPasscode = parts[1];
      if (enteredPasscode !== passcode) {
        console.error("[NimoBrain] Passcode mismatch.");
        this.showToastNotification("คำสั่งลับ: รหัสผ่านไม่ถูกต้อง", "#EF4444");
        return true;
      }
      commandString = parts.slice(2).join(':');
    }

    this.executeParsedCommand(commandString);
    return true;
  }

  executeParsedCommand(commandString: string) {
    try {
      const qIndex = commandString.indexOf('?');
      let actionName = commandString;
      let params: Record<string, any> = {};

      if (qIndex !== -1) {
        actionName = commandString.substring(0, qIndex);
        const queryStr = commandString.substring(qIndex + 1);
        const searchParams = new URLSearchParams(queryStr);
        searchParams.forEach((value, key) => {
          if (value === 'true') params[key] = true;
          else if (value === 'false') params[key] = false;
          else if (!isNaN(Number(value))) params[key] = Number(value);
          else params[key] = value;
        });
      }

      console.log(`[NimoBrain] Direct Action Override: ${actionName}`, params);
      this.showToastNotification(`Direct Override: ${actionName}`, "#10B981");
      this.executeAction(actionName, params);
    } catch (err) {
      console.error("[NimoBrain] Error parsing direct command:", err);
      this.showToastNotification("ล้มเหลวในการแกะคำสั่ง", "#EF4444");
    }
  }

  showToastNotification(msg: string, bgColor: string = '#10B981') {
    if (typeof document !== 'undefined') {
      const toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.bottom = '80px';
      toast.style.right = '20px';
      toast.style.backgroundColor = bgColor;
      toast.style.color = '#FFF';
      toast.style.padding = '12px 24px';
      toast.style.borderRadius = '8px';
      toast.style.zIndex = '9999';
      toast.style.fontWeight = 'bold';
      toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      toast.style.transition = 'all 0.3s ease';
      toast.innerText = msg;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  }

  startRemotePolling() {
    if (typeof window === 'undefined') return;
    if (this.pollingActive) return;
    this.pollingActive = true;
    console.log("[NimoBrain] Starting remote control queue polling on /vocalido/api/remote/commands...");

    const poll = async () => {
      if (!this.pollingActive) return;
      try {
        const res = await fetch('/vocalido/api/remote/commands');
        if (res.ok) {
          const data = await res.json();
          const commands = data.commands || [];
          const newCommands = commands.filter((c: any) => !this.processedCommandIds.has(c.id));
          
          if (newCommands.length > 0) {
            const clearedIds: string[] = [];
            const passcode = localStorage.getItem('nimo_remote_passcode') || 'paisan123';

            for (const c of newCommands) {
              this.processedCommandIds.add(c.id);
              clearedIds.push(c.id);

              if (c.passcode === passcode) {
                console.log(`[NimoBrain] Executing remote command: ${c.command}`);
                const cmdText = c.command.startsWith('paisan:') ? c.command : `paisan:enc:${c.command}`;
                this.processSecretCommand(cmdText);
              } else {
                console.warn(`[NimoBrain] Remote command passcode mismatch: ${c.passcode} !== ${passcode}`);
                this.showToastNotification("Remote command rejected: Passcode incorrect", "#EF4444");
              }
            }

            if (clearedIds.length > 0) {
              await fetch('/vocalido/api/remote/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command_ids: clearedIds })
              });
            }
          }
        }
      } catch (err) {
        // Silent connection warnings to prevent console spam
      }
      setTimeout(poll, 1500);
    };

    poll();
  }
}

// Attach to window
declare global {
  interface Window {
    NimoBrain: NimoBrainRegistry;
  }
}

if (typeof window !== 'undefined') {
  (window as any).NimoBrain = (window as any).NimoBrain || new NimoBrainRegistry();
}

export const nimoBrain = typeof window !== 'undefined' 
  ? ((window as any).NimoBrain as NimoBrainRegistry) 
  : new NimoBrainRegistry();
