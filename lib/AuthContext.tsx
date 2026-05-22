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
export type MemberTier = 'free' | 'starter' | 'pro' | 'premium' | 'admin';

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
//  free     → ทดลองใช้ จำกัดเข้ม
//  starter  → จ่ายเงิน ขั้นเริ่มต้น
//  pro      → จ่ายเงิน ขยายขีดจำกัด (แต่ยังมี cap)
//  premium  → จ่ายเงิน ไม่จำกัด (unlimited)
//  admin    → ทีมงาน ไม่จำกัด
//
export const TIER_QUOTAS: Record<MemberTier, Pick<AuthUserCore, 'rendersPerSong' | 'dailySongQuota'>> = {
  free:    { rendersPerSong: 3,    dailySongQuota: 3    },  // ทดลอง 3 เพลง/วัน, 3 render/เพลง
  starter: { rendersPerSong: 10,   dailySongQuota: 20   },  // TBD — ราคา + limit ยังต้องคำนวณ
  pro:     { rendersPerSong: 30,   dailySongQuota: 50   },  // TBD — render ได้เยอะขึ้น แต่มี cap
  premium: { rendersPerSong: 9999, dailySongQuota: 9999 },  // ไม่จำกัด
  admin:   { rendersPerSong: 9999, dailySongQuota: 9999 },  // ทีมงาน
};

// ─────────────────────────────────────────────────────────────────────────────
// Pricing table — monthly & yearly (TBD: fill after GPU cost calculation)
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
    label: 'Free',
    description: 'ทดลองใช้ฟรี',
    monthlyThb: null,
    yearlyThb: null,
    yearlyDiscountPct: 0,
    color: 'text-zinc-400',
    accentBg: 'bg-zinc-800/60',
    features: [
      '3 เพลง / วัน',
      '3 Render / เพลง',
      '1 Voice Model',
      'Score แสดงโน้ต',
    ],
  },
  starter: {
    label: 'Starter',
    description: 'เริ่มต้นสร้างเสียง',
    monthlyThb: 149,    // TBD — ตัวอย่าง ยังต้องคำนวณต้นทุนจริง
    yearlyThb: 1290,    // ≈ 107.5/เดือน (ประหยัด ~28%)
    yearlyDiscountPct: 28,
    color: 'text-cyan-400',
    accentBg: 'bg-cyan-500/10',
    features: [
      '20 เพลง / วัน',
      '10 Render / เพลง',
      '3 Voice Models',
      'MemoRender History',
      'Score + Piano Roll',
    ],
  },
  pro: {
    label: 'Pro',
    description: 'สำหรับนักดนตรีจริงจัง',
    monthlyThb: 349,    // TBD
    yearlyThb: 2990,    // ≈ 249/เดือน (ประหยัด ~29%)
    yearlyDiscountPct: 29,
    badge: 'Most Popular',
    color: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    features: [
      '50 เพลง / วัน',
      '30 Render / เพลง',
      'Voice Models ทั้งหมด',
      'MemoRender + Stems',
      'Score + Piano Roll',
      'Vocal Studio เต็มรูปแบบ',
    ],
  },
  premium: {
    label: 'Premium',
    description: 'ไม่มีข้อจำกัด',
    monthlyThb: 699,    // TBD
    yearlyThb: 5990,    // ≈ 499/เดือน (ประหยัด ~29%)
    yearlyDiscountPct: 29,
    badge: '✦ Unlimited',
    color: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    features: [
      '∞ เพลง / วัน',
      '∞ Render / เพลง',
      'Voice Models ทั้งหมด + ใหม่ก่อนใคร',
      'MemoRender + Stems',
      'Score + Piano Roll',
      'Vocal Studio เต็มรูปแบบ',
      'Priority GPU Queue',
      'Early Access Features',
      '📦 Export Stem แยกไฟล์ WAV / MP3',
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
  renderVocal:       ['free', 'starter', 'pro', 'premium', 'admin'],
  memoRenderHistory: ['free', 'starter', 'pro', 'premium', 'admin'],
  stems:             ['starter', 'pro', 'premium', 'admin'],
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
