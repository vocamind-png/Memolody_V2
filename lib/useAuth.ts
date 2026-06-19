import { useState, useEffect } from 'react';
import { supabase } from './supabase';

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

export const useAuth = (): { authUser: AuthUser | null; role: UserRole; loading: boolean; isFirebaseConfigured: boolean } => {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<UserRole>('guest');
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (sessionUser: any) => {
    if (!sessionUser) {
      setUser(null);
      setRole('guest');
      setLoading(false);
      return;
    }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', sessionUser.id)
        .single();

      const userRole = (profile?.role as UserRole) || 'user';
      setRole(userRole);
      setUser(sessionUser);
    } catch (e) {
      console.warn('Failed parsing Supabase profile role in useAuth hook:', e);
      setRole('user');
      setUser(sessionUser);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchProfile(session?.user ?? null);
    });

    // 2. Listen to state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchProfile(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  let authUser: AuthUser | null = null;
  if (user) {
    const storedTier = typeof window !== 'undefined' ? localStorage.getItem('mock_membership_tier') : null;
    authUser = {
      id: user.id,
      email: user.email || '',
      fullName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
      avatarUrl: user.user_metadata?.avatar_url || '',
      role: role,
      membershipTier: storedTier || 'free',
      maxAiSlots: 3
    };
  }

  return { authUser, role, loading, isFirebaseConfigured: false };
};

export const hasAccess = (role: UserRole | undefined | null, requiredRole: UserRole) => {
  if (!role) return false;
  const userLevel = ROLE_LEVEL[role] ?? 0;
  const reqLevel = ROLE_LEVEL[requiredRole] ?? 0;
  return userLevel >= reqLevel;
};

export const authActions = {
  signIn: async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  },
  signUp: async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: {
          display_name: email.split('@')[0],
          full_name: email.split('@')[0]
        }
      }
    });
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  },
  signOut: async () => {
    await supabase.auth.signOut();
  }
};

// Role badge config for UI
export const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; border: string }> = {
  owner:     { label: '👑 Owner',     color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  executive: { label: '💼 Executive', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  admin:     { label: '🛡️ Admin',     color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20' },
  user:      { label: '🎵 User',      color: 'text-zinc-400',   bg: 'bg-zinc-500/10',   border: 'border-zinc-500/20' },
  guest:     { label: '👤 Guest',     color: 'text-zinc-600',   bg: 'bg-zinc-800/20',   border: 'border-zinc-700/20' },
};
