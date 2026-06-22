// NimoBrain Command & Action Registry for Memolody_V2
// Allows dynamic registration of page/component specific actions that can be triggered by Nimo AI via voice commands.
import { supabase } from './supabase';

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
      throw new Error(`Action unregistered: ${id}`);
    }

    // Role Security Boundary check for Nimo agent actions
    const currentUserId = localStorage.getItem('mock_user_id');
    if (currentUserId) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUserId)
          .single();

        const role = profile?.role || 'member';

        // Restrict administrative actions from being processed by Member role Nimos
        const adminOnlyActions = ['adjust_tokens', 'disable_promotion', 'approve_redemption', 'deep_purge'];
        if (adminOnlyActions.includes(id) && role !== 'admin' && role !== 'owner') {
          console.warn(`[Nimo Security] Blocked Nimo action "${id}" due to insufficient member permissions (Role: ${role})`);
          this.showToastNotification("Nimo: สิทธิ์ในการสั่งการไม่เพียงพอสำหรับตำแหน่งนี้ค่ะ", "#EF4444");
          return;
        }
      } catch (e) {
        console.error('[Nimo Security] Failed fetching profile details for RLS role verification:', e);
      }
    }

    console.log(`[NimoBrain] Executing action: ${id}`, params);
    
    let displayMsg = `Nimo: กำลังทำงาน... (${id})`;
    if (id === 'play_song' && params?.songTitle) {
      displayMsg = `Nimo: กำลังเล่นเพลง ${params.songTitle}`;
    } else if (id === 'navigate_to_page' && params?.view) {
      displayMsg = `Nimo: กำลังเปิดหน้า ${params.view}`;
    } else if (id === 'change_instrument' && params?.instrument) {
      displayMsg = `Nimo: เปลี่ยนเสียงเป็น ${params.instrument}`;
    } else if (id === 'set_transpose' && params?.transpose !== undefined) {
      displayMsg = `Nimo: เปลี่ยนคีย์เป็น ${params.transpose > 0 ? '+'+params.transpose : params.transpose}`;
    } else if (id === 'set_tempo' && params?.bpm) {
      displayMsg = `Nimo: ปรับจังหวะเป็น ${params.bpm} BPM`;
    } else if (id === 'play') {
      displayMsg = `Nimo: เล่นเพลง`;
    } else if (id === 'pause') {
      displayMsg = `Nimo: หยุดเพลง`;
    }
    
    this.showToastNotification(displayMsg, '#8B5CF6'); // Purple Nimo color
    this.triggerMagicEffect(id, params);

    try {
      await handler(params);
    } catch (err: any) {
      console.error(`[NimoBrain] Error executing action: ${id}`, err);
      this.showToastNotification(`Nimo: ผิดพลาด (${err.message || 'Error'})`, '#EF4444');
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

  triggerMagicEffect(actionId: string, params?: any) {
    if (typeof document === 'undefined') return;
    
    // First try to find a specific target for this action
    let targetEl = document.querySelector(`[data-nimo-target="${actionId}"]`) as HTMLElement;
    
    // Special handling for navigation to match the ID
    if (!targetEl && (actionId === 'navigate_to_page' || actionId === 'navigate')) {
      const view = params?.view || params?.page || params?.target || params?.name;
      if (view) {
        targetEl = document.getElementById(`nav-${view}`) as HTMLElement;
      }
    }
    
    // If not found, fall back to Nimo avatar
    let fallbackToAvatar = false;
    if (!targetEl) {
      targetEl = document.querySelector('[data-nimo-target="nimo-avatar"]') as HTMLElement;
      fallbackToAvatar = true;
    }
    
    if (!targetEl) return; // nowhere to cast magic

    // Find source (Nimo avatar)
    const sourceEl = document.querySelector('[data-nimo-target="nimo-avatar"]') as HTMLElement;
    
    const targetRect = targetEl.getBoundingClientRect();
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    
    const sourceRect = sourceEl ? sourceEl.getBoundingClientRect() : null;
    const sourceX = sourceRect ? (sourceRect.left + sourceRect.width / 2) : targetX;
    const sourceY = sourceRect ? (sourceRect.top + sourceRect.height / 2) : targetY;

    // 1. Create Magic Wand (ไม้กายสิทธิ์) at the source (Nimo avatar)
    if (sourceEl) {
      const wand = document.createElement('div');
      wand.className = 'nimo-magic-wand';
      wand.style.setProperty('--sourceX', `${sourceX}px`);
      wand.style.setProperty('--sourceY', `${sourceY}px`);
      
      // Beautiful wood wand with glowing yellow star SVG
      wand.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.8));">
          <line x1="19" y1="5" x2="5" y2="19" stroke="#b45309" stroke-width="3"/>
          <line x1="19" y1="5" x2="14" y2="10" stroke="#f59e0b" stroke-width="2"/>
          <path d="M19 2l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z" fill="#facc15" stroke="#facc15" stroke-width="0.5"/>
        </svg>
      `;
      document.body.appendChild(wand);
      setTimeout(() => wand.remove(), 500); // Remove after waving
    }

    // Delay the flying projectile slightly to match the wand waving
    setTimeout(() => {
      // 2. Create Flying Shooting Star Projectiles (ดาวไม้วิเศษ)
      // We will create a primary large star and 3 smaller trailing stars to make it look gorgeous
      const flyDuration = '0.7s';
      const numStars = fallbackToAvatar ? 1 : 4; // Only 1 if exploding in place
      
      for (let i = 0; i < numStars; i++) {
        setTimeout(() => {
          const star = document.createElement('div');
          star.className = 'nimo-magic-projectile';
          if (i > 0) {
            star.style.width = '16px';
            star.style.height = '16px';
            star.style.opacity = '0.8';
          }
          
          star.style.setProperty('--startX', `${sourceX}px`);
          star.style.setProperty('--startY', `${sourceY}px`);
          star.style.setProperty('--endX', `${targetX}px`);
          star.style.setProperty('--endY', `${targetY}px`);
          star.style.setProperty('--flyDuration', flyDuration);
          
          // Glowing star SVG
          star.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="#facc15" stroke="#eab308" stroke-width="1.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          `;
          
          document.body.appendChild(star);
          setTimeout(() => star.remove(), 750); // Remove after flight
        }, i * 70); // Delayed sequence for trail effect
      }
      
      // 3. When the projectiles hit the target button (after travel duration):
      const flightMs = fallbackToAvatar ? 0 : 650; // Instant if local, otherwise match flying time
      setTimeout(() => {
        // Target Button Pop animation
        if (!fallbackToAvatar && targetEl) {
          targetEl.classList.add('nimo-target-pop');
          setTimeout(() => {
            targetEl.classList.remove('nimo-target-pop');
          }, 500);
        }

        // Glow Effect
        const magicContainer = document.createElement('div');
        magicContainer.style.position = 'fixed';
        magicContainer.style.left = `${targetX}px`;
        magicContainer.style.top = `${targetY}px`;
        magicContainer.style.width = '0px';
        magicContainer.style.height = '0px';
        magicContainer.style.zIndex = '10000';
        magicContainer.style.pointerEvents = 'none';

        const glow = document.createElement('div');
        glow.className = 'nimo-magic-glow';
        glow.style.width = `${Math.max(100, targetRect.width * 2)}px`;
        glow.style.height = `${Math.max(100, targetRect.height * 2)}px`;
        magicContainer.appendChild(glow);
        document.body.appendChild(magicContainer);
        setTimeout(() => magicContainer.remove(), 1500);

        // Spawn a spectacular starburst explosion (15 sparkling stars)
        const colors = ['#facc15', '#a855f7', '#06b6d4']; // Gold, Purple, Cyan
        for (let j = 0; j < 15; j++) {
          const particle = document.createElement('div');
          particle.className = 'nimo-hit-particle';
          
          const angle = (j * 24 * Math.PI) / 180; // Spread evenly
          const speed = 40 + Math.random() * 50; // Random distance
          const dx = `${Math.cos(angle) * speed}px`;
          const dy = `${Math.sin(angle) * speed}px`;
          const pAngle = `${(Math.random() - 0.5) * 720}deg`;
          const pSize = `${6 + Math.random() * 10}px`;
          const pDuration = `${0.6 + Math.random() * 0.6}s`;
          const pColor = colors[Math.floor(Math.random() * colors.length)];
          
          particle.style.setProperty('--targetX', `${targetX}px`);
          particle.style.setProperty('--targetY', `${targetY}px`);
          particle.style.setProperty('--dx', dx);
          particle.style.setProperty('--dy', dy);
          particle.style.setProperty('--angle', pAngle);
          particle.style.setProperty('--size', pSize);
          particle.style.setProperty('--duration', pDuration);
          particle.style.setProperty('--particleColor', pColor);
          
          document.body.appendChild(particle);
          setTimeout(() => particle.remove(), 1200);
        }
      }, flightMs);

    }, 300); // Wait for wand waving before launching projectiles
  }


  startRemotePolling() {
    if (typeof window === 'undefined') return;
    if (this.pollingActive) return;
    this.pollingActive = true;
    console.log("[NimoBrain] Starting remote control queue polling on /vocalido/api/remote/commands...");

    let failCount = 0;

    const poll = async () => {
      if (!this.pollingActive) return;
      try {
        const res = await fetch('/vocalido/api/remote/commands');
        if (res.ok) {
          failCount = 0;
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
        } else {
          failCount++;
        }
      } catch (err) {
        // Silent connection warnings to prevent console spam
        failCount++;
      }
      
      // Exponential backoff if server is down (max 30 seconds)
      const nextDelay = failCount === 0 ? 1500 : Math.min(1500 * Math.pow(1.5, failCount), 30000);
      setTimeout(poll, nextDelay);
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
