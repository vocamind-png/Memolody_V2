
import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';

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
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isFirebaseConfigured || !auth) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    let authUser: AuthUser | null = null;
    let role: UserRole = 'guest';

    if (user) {
        if (user.email === 'paisan.jeam@gmail.com' || user.email === 'headadmin@memolody.com') {
            role = 'owner';
        } else if (user.email === 'admin@memolody.com') {
            role = 'admin';
        } else {
            role = 'user';
        }

        authUser = {
            id: user.uid,
            email: user.email || '',
            fullName: user.displayName || user.email?.split('@')[0] || 'User',
            avatarUrl: user.photoURL || '',
            role,
            membershipTier: 'free',
            maxAiSlots: 3
        };
    }

    return { authUser, role, loading, isFirebaseConfigured };
};

export const hasAccess = (role: UserRole | undefined | null, requiredRole: UserRole) => {
    if (!role) return false;
    const userLevel = ROLE_LEVEL[role] ?? 0;
    const reqLevel = ROLE_LEVEL[requiredRole] ?? 0;
    return userLevel >= reqLevel;
};

export const authActions = {
    signIn: async (email: string, pass: string) => {
        if (!auth) throw new Error('Firebase not configured');
        const res = await signInWithEmailAndPassword(auth, email, pass);
        return { user: res.user, error: null };
    },
    signUp: async (email: string, pass: string) => {
        if (!auth) throw new Error('Firebase not configured');
        const res = await createUserWithEmailAndPassword(auth, email, pass);
        return { user: res.user, error: null };
    },
    signOut: async () => {
        if (!auth) return;
        await firebaseSignOut(auth);
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
