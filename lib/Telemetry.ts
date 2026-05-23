// lib/Telemetry.ts

export type TelemetryEventType = 'app_open' | 'song_play' | 'vocalido_render' | 'session_end';

export interface TelemetryEvent {
  id: string;
  user_id: string;
  event_type: TelemetryEventType;
  event_data: any;
  created_at: string;
}

class TelemetryService {
  private events: TelemetryEvent[] = [];
  private currentSessionStart: number | null = null;
  private userId: string | null = null;

  constructor() {
    this.loadFromStorage();
    if (this.events.length === 0) {
      this.seedMockData();
    }
    
    // Auto-track session start
    this.currentSessionStart = Date.now();
    this.userId = localStorage.getItem('mock_user_id') || 'guest';
    this.track('app_open', { userAgent: navigator.userAgent });

    // Listen to local mock auth changes
    window.addEventListener('auth_change', () => {
      this.userId = localStorage.getItem('mock_user_id') || 'guest';
    });

    // Try to track session end when window closes
    window.addEventListener('beforeunload', () => {
      if (this.currentSessionStart) {
         const durationSec = Math.round((Date.now() - this.currentSessionStart) / 1000);
         this.track('session_end', { durationSeconds: durationSec });
      }
    });
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('memolody_telemetry');
      if (stored) {
        this.events = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Telemetry load failed', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem('memolody_telemetry', JSON.stringify(this.events));
    } catch (e) {
      console.warn('Telemetry save failed', e);
    }
  }

  public track(event_type: TelemetryEventType, event_data: any = {}) {
    const event: TelemetryEvent = {
      id: Math.random().toString(36).substr(2, 9),
      user_id: this.userId || 'guest',
      event_type,
      event_data,
      created_at: new Date().toISOString()
    };
    
    this.events.push(event);
    this.saveToStorage();
  }

  // Used by the Admin Dashboard
  public getEvents(): TelemetryEvent[] {
    return this.events;
  }
  
  public clearEvents() {
    this.events = [];
    this.saveToStorage();
  }

  // --- MOCK DATA FOR DEMO PURPOSES ---
  private seedMockData() {
    console.log('[Telemetry] Seeding mock data for Head Admin Dashboard...');
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Generate events for the last 30 days
    for (let i = 0; i < 30; i++) {
        const dateStr = new Date(now - (i * dayMs)).toISOString();
        
        // Random 5-20 app opens per day
        const opens = 5 + Math.floor(Math.random() * 15);
        for(let j=0; j<opens; j++) {
            this.events.push({ id: Math.random().toString(), user_id: 'user_'+j, event_type: 'app_open', event_data: {}, created_at: dateStr });
            this.events.push({ id: Math.random().toString(), user_id: 'user_'+j, event_type: 'session_end', event_data: { durationSeconds: 300 + Math.random() * 3000 }, created_at: dateStr });
        }
        
        // Random 10-50 song plays
        const plays = 10 + Math.floor(Math.random() * 40);
        const popularSongs = ['Auld Lang Syne', 'Twinkle Twinkle', 'Beethoven Virus', 'Ode to Joy', 'Canon in D'];
        for(let j=0; j<plays; j++) {
            const song = popularSongs[Math.floor(Math.random() * popularSongs.length)];
            this.events.push({ id: Math.random().toString(), user_id: 'user_'+j, event_type: 'song_play', event_data: { songTitle: song }, created_at: dateStr });
        }
        
        // Random 5-30 Vocalido renders
        const renders = 5 + Math.floor(Math.random() * 25);
        for(let j=0; j<renders; j++) {
            // Render duration 5s to 25s
            const renderSec = 5 + Math.random() * 20;
            this.events.push({ id: Math.random().toString(), user_id: 'user_'+j, event_type: 'vocalido_render', event_data: { renderSeconds: renderSec }, created_at: dateStr });
        }
    }
    
    this.saveToStorage();
  }
}

export const telemetry = new TelemetryService();
