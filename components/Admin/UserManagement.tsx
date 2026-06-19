import React, { useState, useEffect } from 'react';
import {
  Shield, Crown, Briefcase, User as UserIcon, Search,
  RefreshCcw, Ban, CheckCircle, ChevronDown, Music,
  TrendingUp, Users, AlertTriangle, Key, Gift
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { UserRole, ROLE_CONFIG, hasAccess } from '../../lib/useAuth';

interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  token_balance: number;
  created_at: string;
}

const ROLE_ICON = { owner: Crown, executive: Briefcase, admin: Shield, user: UserIcon, guest: UserIcon, moderator: Shield };

interface UserManagementProps {
  currentUserRole: UserRole;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUserRole }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const canEditRoles = hasAccess(currentUserRole, 'admin');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, role, token_balance, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch(e) {
      console.error('[UserManagement] Could not load profiles from Supabase:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      alert('Failed to change role on Supabase: ' + (e as any).message);
    }
    setEditingRole(null);
  };

  const handleRewardTokens = async (userId: string) => {
    const amountStr = prompt("Enter tokens to reward or deduct (e.g. 100 or -50):");
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount === 0) {
      alert("Invalid token amount");
      return;
    }

    try {
      const userToUpdate = users.find(u => u.id === userId);
      if (!userToUpdate) return;

      const newBalance = Math.max(0, (userToUpdate.token_balance || 0) + amount);

      // Start transaction ledger logging
      const { error: ledgerError } = await supabase
        .from('token_transactions')
        .insert({
          user_id: userId,
          amount: amount,
          source: amount > 0 ? 'admin_reward' : 'admin_adjustment',
          description: amount > 0 ? 'Tokens credited by Administrator' : 'Tokens deducted by Administrator'
        });

      if (ledgerError) throw ledgerError;

      // Update profile balance
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ token_balance: newBalance })
        .eq('id', userId);

      if (profileError) throw profileError;

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, token_balance: newBalance } : u));
      alert(`Successfully updated tokens! (New Balance: ${newBalance} T)`);
    } catch (e) {
      alert("Failed to adjust tokens: " + (e as any).message);
    }
  };

  const filtered = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => ['owner','executive','admin','moderator'].includes(u.role)).length,
    tokens: users.reduce((sum, u) => sum + (u.token_balance || 0), 0)
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Users', value: stats.total, icon: Users, color: 'text-cyan-400' },
          { label: 'Staff Members', value: stats.admins, icon: Shield, color: 'text-violet-400' },
          { label: 'Circulating Tokens', value: stats.tokens.toLocaleString() + ' T', icon: Gift, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="backdrop-blur-md bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <div className="text-xl font-black text-white mt-1">{s.value}</div>
              <div className="text-[7px] text-zinc-600 uppercase tracking-widest">{s.label}</div>
            </div>
            <div className={`p-2.5 rounded-xl bg-white/5 ${s.color}`}>
              <s.icon size={16} />
            </div>
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
            placeholder="SEARCH SUPABASE PROFILES..."
            className="w-full h-10 bg-white/[0.03] border border-white/5 rounded-xl pl-9 pr-4 text-[10px] font-black text-white uppercase placeholder:text-zinc-800 outline-none focus:border-cyan-500/30"
          />
        </div>
        <button onClick={loadUsers} className="w-10 h-10 bg-white/5 border border-white/5 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white transition-colors">
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* User Table */}
      <div className="backdrop-blur-md bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-12 px-6 py-3 border-b border-white/5 text-[7px] font-black text-zinc-600 uppercase tracking-widest">
          <div className="col-span-4">User profile</div>
          <div className="col-span-3">Role Authority</div>
          <div className="col-span-3">Token balance</div>
          <div className="col-span-2">Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCcw size={16} className="animate-spin text-cyan-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-[8px] text-zinc-700 uppercase tracking-widest">No profiles found in Supabase</div>
        ) : (
          filtered.map(user => {
            const userRole: UserRole = (user.role as any) || 'user';
            const roleConf = ROLE_CONFIG[userRole] || ROLE_CONFIG.user;
            const RoleIcon = ROLE_ICON[userRole] || UserIcon;
            return (
              <div key={user.id} className="grid grid-cols-12 px-6 py-4 border-b border-white/[0.03] items-center hover:bg-white/[0.02]">
                {/* User Info */}
                <div className="col-span-4 min-w-0 pr-2">
                  <p className="text-[10px] font-black text-white truncate">{user.display_name || 'System User'}</p>
                  <p className="text-[7px] text-zinc-600 truncate">{user.email}</p>
                </div>

                {/* Role Badge + Dropdown */}
                <div className="col-span-3 relative">
                  <button
                    disabled={!canEditRoles}
                    onClick={() => setEditingRole(editingRole === user.id ? null : user.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[7px] font-black uppercase border transition-all ${roleConf.bg} ${roleConf.border} ${roleConf.color} ${canEditRoles ? 'hover:opacity-85 cursor-pointer' : 'cursor-default'}`}
                  >
                    <RoleIcon size={9} />
                    {userRole}
                    {canEditRoles && <ChevronDown size={8} />}
                  </button>

                  {editingRole === user.id && canEditRoles && (
                    <>
                      <div className="fixed inset-0 z-[1000]" onClick={() => setEditingRole(null)} />
                      <div className="absolute left-0 top-full mt-1 w-36 bg-[#111] border border-white/10 rounded-xl overflow-hidden z-[1001] shadow-2xl">
                        {(['owner', 'executive', 'admin', 'user'] as UserRole[]).map(r => (
                          <button
                            key={r}
                            onClick={() => handleRoleChange(user.id, r)}
                            className={`w-full px-3 py-2.5 text-[8px] font-black uppercase text-left flex items-center gap-2 hover:bg-white/5 transition-colors ${ROLE_CONFIG[r].color} ${userRole === r ? 'bg-white/5' : ''}`}
                          >
                            {ROLE_CONFIG[r].label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Balance */}
                <div className="col-span-3">
                  <span className="text-[10px] font-black text-white bg-white/5 border border-white/5 rounded-lg px-2.5 py-1">
                    {(user.token_balance || 0).toLocaleString()} T
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex gap-1">
                  {canEditRoles && (
                    <button
                      onClick={() => handleRewardTokens(user.id)}
                      className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase bg-cyan-500 text-black hover:bg-cyan-400 transition-colors shadow-md"
                      title="Adjust Member Tokens"
                    >
                      Credit T
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
          You need Admin role or higher to manage users and credit rewards
        </p>
      )}
    </div>
  );
};

export default UserManagement;
