// lib/Telemetry.ts
import { db, isFirebaseConfigured, auth } from './firebase';
import { collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';

export type TelemetryEventType = 'app_open' | 'song_play' | 'vocalido_render' | 'session_end';

export interface TelemetryEvent {
  id?: string;
  user_id: string;
  event_type: TelemetryEventType;
  event_data: any;
  created_at: string;
}

class TelemetryService {
  private events: TelemetryEvent[] = [];
  private currentSessionStart: number | null = null;

  constructor() {
    this.currentSessionStart = Date.now();
    this.track('app_open', { userAgent: navigator.userAgent });

    window.addEventListener('beforeunload', () => {
      if (this.currentSessionStart) {
         const durationSec = Math.round((Date.now() - this.currentSessionStart) / 1000);
         this.track('session_end', { durationSeconds: durationSec });
      }
    });
  }

  public async track(event_type: TelemetryEventType, event_data: any = {}) {
    const user_id = auth?.currentUser?.uid || localStorage.getItem('mock_user_id') || 'guest';
    const event: TelemetryEvent = {
      user_id,
      event_type,
      event_data,
      created_at: new Date().toISOString()
    };
    
    // Always keep a local copy for quick UI updates if needed
    this.events.push(event);

    if (isFirebaseConfigured && db) {
      try {
        await addDoc(collection(db, 'telemetry_events'), event);
      } catch (e) {
        console.warn('Telemetry save failed (Firestore)', e);
      }
    }
  }

  // Used by the Admin Dashboard to fetch stats
  public async getEventsFromCloud(): Promise<TelemetryEvent[]> {
    if (!isFirebaseConfigured || !db) return this.events;
    
    try {
      const q = query(collection(db, 'telemetry_events'), orderBy('created_at', 'desc'), limit(1000));
      const querySnapshot = await getDocs(q);
      const cloudEvents: TelemetryEvent[] = [];
      querySnapshot.forEach((doc) => {
        cloudEvents.push({ id: doc.id, ...doc.data() } as TelemetryEvent);
      });
      return cloudEvents;
    } catch (e) {
      console.error("Could not load telemetry from cloud:", e);
      return this.events;
    }
  }
}

export const telemetry = new TelemetryService();
