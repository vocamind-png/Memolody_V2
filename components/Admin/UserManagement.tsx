
import React, { useState, useEffect } from 'react';
import {
  Shield, Crown, Briefcase, User as UserIcon, Search,
  RefreshCcw, Ban, CheckCircle, ChevronDown, Music,
  TrendingUp, Users, AlertTriangle
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { UserRole, ROLE_CONFIG, hasAccess } from '../../lib/useAuth';

interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  membership_tier: string;
  is_banned: boolean;
  song_count: number;
  total_revenue: number;
  created_at: string;
  last_seen_at: string | null;
}

const ROLE_ICON = { owner: Crown, executive: Briefcase, admin: Shield, user: UserIcon, guest: UserIcon };

interface UserManagementProps {
  currentUserRole: UserRole;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUserRole }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const canEditRoles = hasAccess(currentUserRole, 'admin');
  const canSeeRevenue = hasAccess(currentUserRole, 'executive');

  const loadUsers = async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_user_overview')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setUsers(data as UserRecord[]);
    } catch(e) {
      console.warn('[UserManagement] Could not load users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    }
    setEditingRole(null);
  };

  const handleBanToggle = async (userId: string, isBanned: boolean) => {
    await supabase.from('profiles').update({ is_banned: !isBanned }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: !isBanned } : u));
  };

  const filtered = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => ['owner','executive','admin'].includes(u.role)).length,
    revenue: users.reduce((s, u) => s + (u.total_revenue || 0), 0),
    banned: users.filter(u => u.is_banned).length,
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle size={32} className="text-amber-400" />
        <p className="text-[9px] text-amber-400 uppercase tracking-widest text-center">
          Supabase not configured.<br />Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Vercel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: stats.total, icon: Users, color: 'text-cyan-400' },
          { label: 'Staff', value: stats.admins, icon: Shield, color: 'text-violet-400' },
          { label: 'Banned', value: stats.banned, icon: Ban, color: 'text-rose-400' },
          { label: 'Revenue', value: canSeeRevenue ? `$${stats.revenue.toFixed(0)}` : '—', icon: TrendingUp, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-black/40 border border-white/5 rounded-2xl p-4">
            <s.icon size={14} className={s.color} />
            <div className="text-xl font-black text-white mt-2">{s.value}</div>
            <div className="text-[7px] text-zinc-600 uppercase tracking-widest">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="SEARCH USERS..."
            className="w-full h-10 bg-white/[0.03] border border-white/5 rounded-xl pl-9 pr-4 text-[10px] font-black text-white uppercase placeholder:text-zinc-800 outline-none focus:border-cyan-500/30"
          />
        </div>
        <button onClick={loadUsers} className="w-10 h-10 bg-white/5 border border-white/5 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white transition-colors">
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* User Table */}
      <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 border-b border-white/5 text-[7px] font-black text-zinc-600 uppercase tracking-widest">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-2">{canSeeRevenue ? 'Revenue' : 'Songs'}</div>
          <div className="col-span-2">Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCcw size={16} className="animate-spin text-zinc-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-[8px] text-zinc-700 uppercase tracking-widest">No users found</div>
        ) : (
          filtered.map(user => {
            const roleConf = ROLE_CONFIG[user.role] || ROLE_CONFIG.user;
            const RoleIcon = ROLE_ICON[user.role] || UserIcon;
            return (
              <div key={user.id} className={`grid grid-cols-12 px-4 py-3 border-b border-white/[0.03] items-center hover:bg-white/[0.02] ${user.is_banned ? 'opacity-40' : ''}`}>
                {/* User Info */}
                <div className="col-span-4 min-w-0 pr-2">
                  <p className="text-[10px] font-black text-white truncate">{user.full_name || 'Unknown'}</p>
                  <p className="text-[7px] text-zinc-600 truncate">{user.email}</p>
                </div>

                {/* Role Badge + Dropdown */}
                <div className="col-span-2 relative">
                  <button
                    disabled={!canEditRoles}
                    onClick={() => setEditingRole(editingRole === user.id ? null : user.id)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[7px] font-black uppercase border transition-all ${roleConf.bg} ${roleConf.border} ${roleConf.color} ${canEditRoles ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                  >
                    <RoleIcon size={8} />
                    {user.role}
                    {canEditRoles && <ChevronDown size={8} />}
                  </button>

                  {editingRole === user.id && canEditRoles && (
                    <>
                      <div className="fixed inset-0 z-[1000]" onClick={() => setEditingRole(null)} />
                      <div className="absolute left-0 top-full mt-1 w-36 bg-[#111] border border-white/10 rounded-xl overflow-hidden z-[1001] shadow-2xl">
                        {(['owner','executive','admin','user'] as UserRole[]).map(r => (
                          <button
                            key={r}
                            onClick={() => handleRoleChange(user.id, r)}
                            className={`w-full px-3 py-2 text-[8px] font-black uppercase text-left flex items-center gap-2 hover:bg-white/5 transition-colors ${ROLE_CONFIG[r].color} ${user.role === r ? 'bg-white/5' : ''}`}
                          >
                            {ROLE_CONFIG[r].label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Plan */}
                <div className="col-span-2">
                  <span className="text-[8px] text-zinc-400 uppercase">{user.membership_tier || 'Free'}</span>
                </div>

                {/* Revenue or Songs */}
                <div className="col-span-2">
                  <span className="text-[8px] font-black text-white">
                    {canSeeRevenue ? `$${(user.total_revenue || 0).toFixed(2)}` : `${user.song_count || 0} 🎵`}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex gap-1">
                  {canEditRoles && (
                    <button
                      onClick={() => handleBanToggle(user.id, user.is_banned)}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-[8px] transition-colors ${user.is_banned ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'}`}
                      title={user.is_banned ? 'Unban User' : 'Ban User'}
                    >
                      {user.is_banned ? <CheckCircle size={12} /> : <Ban size={12} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!canEditRoles && (
        <p className="text-center text-[8px] text-zinc-700 uppercase tracking-widest">
          You need Admin role or higher to manage user roles
        </p>
      )}
    </div>
  );
};

export default UserManagement;
