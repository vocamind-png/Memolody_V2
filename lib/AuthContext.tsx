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
  simulateSubscription: (tier: MemberTier) => Promise<void>;
}

export const TIER_QUOTAS: Record<MemberTier, Pick<AuthUserCore, 'rendersPerSong' | 'dailySongQuota'>> = {
  free:    { rendersPerSong: 5,    dailySongQuota: 5    },
  pro:     { rendersPerSong: 200,  dailySongQuota: 200  },
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
    label: 'Starter Plan',
    description: 'ลองสัมผัสประสบการณ์ Nimo AI ได้ทุกวัน',
    monthlyThb: null,
    yearlyThb: null,
    yearlyDiscountPct: 0,
    color: 'text-zinc-400',
    accentBg: 'bg-zinc-800/60',
    features: [
      'Render ทำนอง/เสียงร้อง 5 ครั้ง/วัน (ท่อนสั้น)',
      'ใช้งานหน้าต่างแต่งเพลงพื้นฐาน',
      'เก็บข้อมูลโปรเจกต์ 3 เพลง (Local/Cloud)',
      'ฟังพรีวิวในแอป (ไม่สามารถ Export Stems ได้)',
      'ทดลองคุยกับ Nimo AI 20 ข้อความ/วัน'
    ],
  },
  pro: {
    label: 'Pro Plan',
    description: 'สำหรับนักสร้างสรรค์ ปลดล็อกไฟล์แยกชิ้นไปทำงานต่อ',
    monthlyThb: 149,
    yearlyThb: 1490,
    yearlyDiscountPct: 15,
    badge: 'คุ้มค่าที่สุด',
    color: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    features: [
      'ปลดล็อก True Stems (WAV/MP3) นำไปมิกซ์ต่อได้',
      'Render ทำนอง/เสียงร้อง 200 ครั้ง/เดือน (เพลงเต็ม 3 นาที)',
      'ซิงค์คลาวด์สูงสุด 50 โปรเจกต์',
      'ใช้งาน AI Voice Models แบบครบถ้วน',
      'สิทธิ์การใช้งานเชิงพาณิชย์ (Commercial Use)',
    ],
  },
  premium: {
    label: 'Studio Plan',
    description: 'ไร้ขีดจำกัด คิวประมวลผลด่วนพิเศษ สำหรับมืออาชีพ',
    monthlyThb: 399,
    yearlyThb: 3990,
    yearlyDiscountPct: 15,
    badge: '✦ Professional',
    color: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
    features: [
      'Render ทำนอง & เสียงร้อง ไม่จำกัดจำนวนครั้ง',
      'VIP Queue คิวประมวลผล GPU ก่อนใคร',
      'ใช้งาน Nimo AI Agentic อย่างอิสระ',
      'สำรองข้อมูลคลาวด์ไม่จำกัดจำนวนเพลง',
      'ส่งออกแยกแทร็ก True Stems คุณภาพสูงสุด (Lossless)',
      'แชร์ลิงก์ส่งการบ้านหรือทำงานร่วมกับทีม'
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
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
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

  const simulateSubscription = useCallback(async (tier: MemberTier) => {
    localStorage.setItem('mock_membership_tier', tier);
    
    // Attempt to refresh the session so state updates
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      await syncSession(session.user);
    } else {
      // If no supabase session, manually patch the user state directly
      setUser(prev => prev ? {
        ...prev,
        tier,
        ...TIER_QUOTAS[tier]
      } : {
        id: 'mock_guest',
        email: 'guest@example.com',
        displayName: 'Guest User',
        tier,
        ...TIER_QUOTAS[tier]
      });
    }
  }, [syncSession]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut, simulateSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>');
  return ctx;
}
