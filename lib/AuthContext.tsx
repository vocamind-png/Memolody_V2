/**
 * AuthContext.tsx — Provider-agnostic authentication layer
 *
 * ┌───────────────────────────────────────────────────────────────────┐
 * │  Phase 1: LOCAL STUB (saves to localStorage)                      │
 * │  Phase 2: Swap ADAPTER section with Supabase / Firebase / etc.   │
 * └───────────────────────────────────────────────────────────────────┘
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type MemberTier = 'free' | 'pro' | 'premium' | 'admin';

export interface AuthUserCore {
  id: string;
  email: string;
  displayName: string;
  tier: MemberTier;
  /** Render quota: max renders per song before upgrade prompt */
  rendersPerSong: number;
  /** Render quota: max unique songs rendered per day */
  dailySongQuota: number;
}

interface AuthContextType {
  user: AuthUserCore | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier definitions (edit here to change quotas)
// ─────────────────────────────────────────────────────────────────────────────
//
//  free     → ทดลองใช้ฟรี 1 เดือนแรก (จำกัดเฉพาะในเครื่อง)
//  pro      → จ่ายเงิน ซ้อมดนตรีส่วนบุคคล (จำกัด 100 render/เดือน, sync cloud 50 เพลง)
//  premium  → จ่ายเงิน สตูดิโอ/ครูสอน (เรนเดอร์ไม่จำกัด, sync cloud ไม่จำกัด)
//  admin    → ทีมงาน ไม่จำกัด
//
export const TIER_QUOTAS: Record<MemberTier, Pick<AuthUserCore, 'rendersPerSong' | 'dailySongQuota'>> = {
  free:    { rendersPerSong: 30,   dailySongQuota: 10   },  // ทดลองใช้งานฟรี
  pro:     { rendersPerSong: 100,  dailySongQuota: 50   },  // สำหรับบุคคลทั่วไป
  premium: { rendersPerSong: 9999, dailySongQuota: 9999 },  // สำหรับครูและสตูดิโอ
  admin:   { rendersPerSong: 9999, dailySongQuota: 9999 },  // ทีมงาน
};

// ─────────────────────────────────────────────────────────────────────────────
// Pricing table — monthly & yearly
// yearly = monthly × 12 × (1 - yearlyDiscountPct/100)
// ─────────────────────────────────────────────────────────────────────────────
export interface TierPrice {
  label: string;
  description: string;
  monthlyThb: number | null;   // null = ฟรี
  yearlyThb: number | null;    // null = ฟรี
  yearlyDiscountPct: number;   // % ส่วนลดจ่ายรายปี
  badge?: string;              // e.g. "Most Popular"
  color: string;               // Tailwind text color class
  accentBg: string;            // Tailwind bg class for card highlight
  features: string[];
}

export const TIER_PRICING: Record<Exclude<MemberTier, 'admin'>, TierPrice> = {
  free: {
    label: 'Free Trial',
    description: 'ทดลองใช้งานฟรี 7 วันแรก',
    monthlyThb: null,
    yearlyThb: null,
    yearlyDiscountPct: 0,
    color: 'text-zinc-400',
    accentBg: 'bg-zinc-800/60',
    features: [
      'ทดลองเล่นฟรี 7 วันทุกฟีเจอร์ในแอป',
      'เล่น/ซ้อมผ่านแอปพลิเคชันเท่านั้น',
      'เก็บข้อมูลเฉพาะในเครื่อง (No Backup)',
      'จำกัดการดาวน์โหลดหรือส่งออกเสียง',
    ],
  },
  pro: {
    label: 'Pro Plan',
    description: 'สำหรับซ้อมดนตรีส่วนบุคคล',
    monthlyThb: 149,
    yearlyThb: 990,
    yearlyDiscountPct: 45,
    badge: 'คุ้มค่าที่สุด',
    color: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    features: [
      'เรนเดอร์เสียงร้อง AI 100 ครั้ง / เดือน',
      'สำรองข้อมูลคลาวด์สูงสุด 50 เพลง',
      'ซิงก์ข้อมูลข้ามเครื่องมือถือ/คอมพิวเตอร์',
      'ใช้งาน AI Voice Models ทั้งหมด (Lotte V)',
      'ส่งออกไฟล์โน้ตเพลงและไฟล์เสียงพื้นฐาน',
    ],
  },
  premium: {
    label: 'Studio Plan',
    description: 'สำหรับครูและโรงเรียนสอนดนตรี',
    monthlyThb: 399,
    yearlyThb: 2900,
    yearlyDiscountPct: 40,
    badge: '✦ Professional',
    color: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    features: [
      'เรนเดอร์เสียงร้อง AI ไม่จำกัด (VIP Queue)',
      'สำรองข้อมูลคลาวด์ไม่จำกัดจำนวนเพลง',
      'ส่งออกแยกแทร็กไฟล์เสียง (WAV/MP3 Stems)',
      'แชร์ลิงก์ส่งการบ้านหรือการสอนให้ผู้เรียน',
      'ไม่มีโฆษณาและการเชื่อมต่อจำกัด',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature capability flags — check before gating features in UI
// Usage: canDo(user?.tier, 'exportStems')
// ─────────────────────────────────────────────────────────────────────────────
export type AppFeature =
  | 'renderVocal'       // Trigger AI vocal render
  | 'memoRenderHistory' // Per-user render history cache
  | 'stems'             // View stem mixer (listen only)
  | 'exportStems'       // 📦 Export stems as WAV / MP3 (Premium only)
  | 'allVoiceModels'    // Access all installed voice models
  | 'priorityGpu'       // Priority GPU queue
  | 'earlyAccess';      // Early-access beta features

const _FEATURE_MATRIX: Record<AppFeature, MemberTier[]> = {
  renderVocal:       ['free', 'pro', 'premium', 'admin'],
  memoRenderHistory: ['free', 'pro', 'premium', 'admin'],
  stems:             ['pro', 'premium', 'admin'],
  exportStems:       ['premium', 'admin'],           // WAV / MP3 export
  allVoiceModels:    ['pro', 'premium', 'admin'],
  priorityGpu:       ['premium', 'admin'],
  earlyAccess:       ['premium', 'admin'],
};

/** Returns true if the given tier has access to the feature */
export function canDo(tier: MemberTier | undefined | null, feature: AppFeature): boolean {
  if (!tier) return false;
  return _FEATURE_MATRIX[feature].includes(tier);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL STUB ADAPTER (Phase 1)
// Replace this section with a real provider adapter in Phase 2.
// ─────────────────────────────────────────────────────────────────────────────
const LS_KEY = 'memo_auth_session';

interface StubSession {
  id: string;
  email: string;
  displayName: string;
  tier: MemberTier;
  passwordHash: string; // NOT real hashing — stub only
}

function _stubHash(s: string) {
  // Very lightweight hash for stub — NOT production-safe
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
}

function _loadUsers(): Record<string, StubSession> {
  try { return JSON.parse(localStorage.getItem('memo_stub_users') || '{}'); } catch { return {}; }
}
function _saveUsers(u: Record<string, StubSession>) {
  try { localStorage.setItem('memo_stub_users', JSON.stringify(u)); } catch {}
}
function _loadSession(): StubSession | null {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}
function _saveSession(s: StubSession | null) {
  try {
    if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
    else localStorage.removeItem(LS_KEY);
  } catch {}
}
function _toAuthUser(s: StubSession): AuthUserCore {
  const q = TIER_QUOTAS[s.tier] ?? TIER_QUOTAS.free;
  return { id: s.id, email: s.email, displayName: s.displayName, tier: s.tier, ...q };
}

const stubAdapter = {
  getSession: async (): Promise<AuthUserCore | null> => {
    const s = _loadSession();
    return s ? _toAuthUser(s) : null;
  },
  signIn: async (email: string, password: string): Promise<{ user?: AuthUserCore; error?: string }> => {
    const users = _loadUsers();
    const found = Object.values(users).find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!found) return { error: 'ไม่พบอีเมลนี้ในระบบ — กรุณาสมัครสมาชิกก่อนครับ' };
    if (found.passwordHash !== _stubHash(password)) return { error: 'รหัสผ่านไม่ถูกต้อง' };
    _saveSession(found);
    return { user: _toAuthUser(found) };
  },
  signUp: async (email: string, password: string, name: string): Promise<{ user?: AuthUserCore; error?: string }> => {
    if (password.length < 6) return { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
    const users = _loadUsers();
    const exists = Object.values(users).some(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) return { error: 'อีเมลนี้ถูกสมัครไปแล้ว — กรุณาเข้าสู่ระบบแทนครับ' };
    const session: StubSession = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email,
      displayName: name.trim() || email.split('@')[0],
      tier: 'free',
      passwordHash: _stubHash(password),
    };
    users[session.id] = session;
    _saveUsers(users);
    _saveSession(session);
    return { user: _toAuthUser(session) };
  },
  signOut: async () => {
    _saveSession(null);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserCore | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    stubAdapter.getSession().then(u => {
      setUser(u);
      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: u, error } = await stubAdapter.signIn(email, password);
    if (u) setUser(u);
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { user: u, error } = await stubAdapter.signUp(email, password, name);
    if (u) setUser(u);
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await stubAdapter.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>');
  return ctx;
}
