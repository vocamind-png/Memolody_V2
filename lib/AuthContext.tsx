import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type MemberTier = 'free' | 'pro' | 'premium' | 'admin';

export interface AuthUserCore {
  id: string;
  email: string;
  displayName: string;
  tier: MemberTier;
  rendersPerSong: number;
  dailySongQuota: number;
}

interface AuthContextType {
  user: AuthUserCore | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export const TIER_QUOTAS: Record<MemberTier, Pick<AuthUserCore, 'rendersPerSong' | 'dailySongQuota'>> = {
  free:    { rendersPerSong: 30,   dailySongQuota: 10   },
  pro:     { rendersPerSong: 100,  dailySongQuota: 50   },
  premium: { rendersPerSong: 9999, dailySongQuota: 9999 },
  admin:   { rendersPerSong: 9999, dailySongQuota: 9999 },
};

export interface TierPrice {
  label: string;
  description: string;
  monthlyThb: number | null;
  yearlyThb: number | null;
  yearlyDiscountPct: number;
  badge?: string;
  color: string;
  accentBg: string;
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

export type AppFeature =
  | 'renderVocal'
  | 'memoRenderHistory'
  | 'stems'
  | 'exportStems'
  | 'allVoiceModels'
  | 'priorityGpu'
  | 'earlyAccess';

const _FEATURE_MATRIX: Record<AppFeature, MemberTier[]> = {
  renderVocal:       ['free', 'pro', 'premium', 'admin'],
  memoRenderHistory: ['free', 'pro', 'premium', 'admin'],
  stems:             ['pro', 'premium', 'admin'],
  exportStems:       ['premium', 'admin'],
  allVoiceModels:    ['pro', 'premium', 'admin'],
  priorityGpu:       ['premium', 'admin'],
  earlyAccess:       ['premium', 'admin'],
};

export function canDo(tier: MemberTier | undefined | null, feature: AppFeature): boolean {
  if (!tier) return false;
  return _FEATURE_MATRIX[feature].includes(tier);
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Authentication Adapter (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserCore | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync Supabase Auth Session
  const syncSession = useCallback(async (sessionUser: any) => {
    if (!sessionUser) {
      setUser(null);
      localStorage.removeItem('mock_user_id');
      localStorage.removeItem('mock_user_email');
      return;
    }

    try {
      // Query profiles table to retrieve user tier/role metadata
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', sessionUser.id)
        .single();

      // Mapping Supabase role values to billing tiers
      const userRole = profile?.role || 'member';
      let tier: MemberTier = 'free';
      if (userRole === 'admin' || userRole === 'owner') {
        tier = 'admin';
      } else {
        const storedTier = localStorage.getItem('mock_membership_tier') as MemberTier;
        tier = storedTier || 'free';
      }

      const quotas = TIER_QUOTAS[tier] ?? TIER_QUOTAS.free;
      const parsedUser: AuthUserCore = {
        id: sessionUser.id,
        email: sessionUser.email || '',
        displayName: sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'User',
        tier,
        ...quotas
      };

      setUser(parsedUser);
      localStorage.setItem('mock_user_id', sessionUser.id);
      localStorage.setItem('mock_user_email', sessionUser.email || '');
    } catch (e) {
      console.warn('Failed parsing Supabase profile metadata:', e);
    }
  }, []);

  useEffect(() => {
    // 1. Check initial active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSession(session?.user ?? null);
      setIsLoading(false);
    });

    // 2. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session?.user ?? null);
      setIsLoading(false);
      window.dispatchEvent(new Event('auth_change'));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      await syncSession(data.user);
    }
    return {};
  }, [syncSession]);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          full_name: name
        }
      }
    });

    if (error) return { error: error.message };
    if (data.user) {
      await syncSession(data.user);
    }
    return {};
  }, [syncSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('mock_user_id');
    localStorage.removeItem('mock_user_email');
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
