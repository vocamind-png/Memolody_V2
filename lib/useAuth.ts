
import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

export type UserRole = 'owner' | 'executive' | 'admin' | 'user' | 'guest';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  role: UserRole;
  membershipTier: string;
  maxAiSlots: number;
}

// Role hierarchy — higher number = more access
const ROLE_LEVEL: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
  executive: 3,
  owner: 4,
};

export function hasAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

export function useAuth() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (userId: string, email: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role, membership_tier, max_ai_slots')
        .eq('id', userId)
        .single();

      setAuthUser({
        id: userId,
        email,
        fullName: data?.full_name || email.split('@')[0],
        avatarUrl: data?.avatar_url || '',
        role: (data?.role as UserRole) || 'user',
        membershipTier: data?.membership_tier || 'Free',
        maxAiSlots: data?.max_ai_slots || 1,
      });
    } catch {
      setAuthUser({
        id: userId,
        email,
        fullName: email.split('@')[0],
        avatarUrl: '',
        role: 'user',
        membershipTier: 'Free',
        maxAiSlots: 1,
      });
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id, session.user.email || '').finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsLoading(true);
        loadProfile(session.user.id, session.user.email || '').finally(() => setIsLoading(false));
      } else {
        setAuthUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { authUser, isLoading, role: authUser?.role ?? 'guest' };
}

// Role badge config for UI
export const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; border: string }> = {
  owner:     { label: '👑 Owner',     color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  executive: { label: '💼 Executive', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  admin:     { label: '🛡️ Admin',     color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20' },
  user:      { label: '🎵 User',      color: 'text-zinc-400',   bg: 'bg-zinc-500/10',   border: 'border-zinc-500/20' },
  guest:     { label: '👤 Guest',     color: 'text-zinc-600',   bg: 'bg-zinc-800/20',   border: 'border-zinc-700/20' },
};
