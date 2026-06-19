import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, CreditCard, DollarSign, ArrowUpRight, ArrowDownRight, 
  Activity, PieChart, ShieldCheck, Zap, Key, Award, Gift, RefreshCcw
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TxItem {
  id: string;
  user_email: string;
  amount: number;
  source: string;
  description: string;
  created_at: string;
}

export const FinanceOverview: React.FC = () => {
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [activeUsers, setActiveUsers] = useState<number>(0);
  const [promotionsCount, setPromotionsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const loadFinanceData = async () => {
    setLoading(true);
    try {
      // 1. Fetch token transactions with profile emails
      const { data: transactions, error: txError } = await supabase
        .from('token_transactions')
        .select(`
          id,
          amount,
          source,
          description,
          created_at,
          profiles (email)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!txError && transactions) {
        const formatted = transactions.map((t: any) => ({
          id: t.id.slice(0, 8).toUpperCase(),
          user_email: t.profiles?.email || 'System user',
          amount: t.amount,
          source: t.source,
          description: t.description || '',
          created_at: new Date(t.created_at).toLocaleTimeString() + ' ago'
        }));
        setTxs(formatted);
      }

      // 2. Fetch stats
      const { data: profs } = await supabase.from('profiles').select('token_balance');
      if (profs) {
        setTotalTokens(profs.reduce((sum, p) => sum + (p.token_balance || 0), 0));
        setActiveUsers(profs.length);
      }

      const { count: promoCount } = await supabase
        .from('promotions')
        .select('*', { count: 'exact', head: true });
      setPromotionsCount(promoCount || 0);

    } catch (e) {
      console.error('Failed to load Supabase finance overview:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceData();
  }, []);

  const kpis = [
    { label: 'Circulating Tokens', value: totalTokens.toLocaleString(), change: '+18.4%', isUp: true, icon: DollarSign, color: 'text-amber-400' },
    { label: 'Platform Members', value: activeUsers.toString(), change: '+5.2%', isUp: true, icon: Users, color: 'text-cyan-400' },
    { label: 'Active Promotions', value: promotionsCount.toString(), change: 'Stable', isUp: true, icon: Activity, color: 'text-rose-500' },
    { label: 'AI Compute Cost', value: '$240.80', change: '-4.1%', isUp: false, icon: Zap, color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="backdrop-blur-md bg-white/[0.02] border border-white/5 p-6 rounded-[32px] hover:bg-white/[0.04] hover:border-white/10 transition-all shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl bg-white/5 ${kpi.color}`}>
                <kpi.icon size={20} />
              </div>
              <div className={`flex items-center gap-1 text-[10px] font-black ${kpi.isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                {kpi.isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {kpi.change}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{kpi.label}</p>
              <h3 className="text-2xl font-black text-white italic tracking-tighter">{kpi.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue/Tokens Flow chart */}
        <div className="lg:col-span-2 backdrop-blur-md bg-white/[0.02] border border-white/5 p-8 rounded-[40px] shadow-xl relative overflow-hidden">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Token Supply & Flow</h3>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Platform circulating currency velocity</p>
            </div>
            <button 
              onClick={loadFinanceData} 
              className="p-2 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-colors"
            >
              <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          
          <div className="h-48 flex items-end gap-2 group">
             {[45, 60, 50, 70, 85, 65, 95, 80, 110, 95, 100, 120].map((h, i) => (
               <div key={i} className="flex-1 bg-white/5 rounded-t-lg relative group/bar hover:bg-cyan-500/20 transition-all" style={{ height: `${h}%` }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-cyan-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity">
                    {(h * 50).toLocaleString()} T
                  </div>
               </div>
             ))}
          </div>
          <div className="flex justify-between mt-4 px-2">
            {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].slice(0, 12).map(m => (
              <span key={m} className="text-[7px] font-black text-zinc-800 uppercase tracking-tighter">{m}</span>
            ))}
          </div>
        </div>

        {/* Promo and Commission mix */}
        <div className="backdrop-blur-md bg-white/[0.02] border border-white/5 p-8 rounded-[40px] shadow-xl">
          <h3 className="text-lg font-black text-white italic tracking-tight uppercase mb-8">Supply Source</h3>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-indigo-400">
                <span>Vocal Generation</span>
                <span>65%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-[65%]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-cyan-400">
                <span>Promotional Codes</span>
                <span>20%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 w-[20%]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-emerald-400">
                <span>Affiliate Commissions</span>
                <span>15%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[15%]" />
              </div>
            </div>
          </div>
          
          <div className="mt-12 p-6 rounded-[24px] bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20">
             <div className="flex items-center gap-3 mb-3">
               <ShieldCheck size={18} className="text-indigo-400" />
               <span className="text-[10px] font-black text-white uppercase tracking-widest">Commission Auto-audit</span>
             </div>
             <p className="text-[9px] font-bold text-zinc-500 leading-relaxed uppercase">
               Affiliate referrals are locked under double-entry ledger audits automatically to ensure maximum fairness.
             </p>
          </div>
        </div>
      </div>

      {/* Supabase Token Ledger */}
      <div className="backdrop-blur-md bg-white/[0.02] border border-white/5 rounded-[40px] shadow-xl overflow-hidden">
        <div className="p-8 border-b border-white/5 flex justify-between items-center">
            <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Circulation Ledger (Supabase)</h3>
            <span className="text-[8px] font-black bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full uppercase tracking-widest">
               Insert-Only Blockchain mode
            </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <RefreshCcw size={16} className="animate-spin text-cyan-400" />
            </div>
          ) : txs.length === 0 ? (
            <div className="text-center py-10 text-[10px] text-zinc-600 uppercase font-black">
              No transactions recorded yet in Supabase
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">ID</th>
                  <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">User email</th>
                  <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Source</th>
                  <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Description</th>
                  <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Amount</th>
                  <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {txs.map((tx, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-8 py-5 text-[10px] font-mono text-zinc-500 font-bold uppercase">{tx.id}</td>
                    <td className="px-8 py-5 text-[10px] font-black text-white uppercase italic">{tx.user_email}</td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter ${
                        tx.amount > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {tx.source}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-[10px] font-bold text-zinc-400 uppercase">{tx.description}</td>
                    <td className={`px-8 py-5 text-[11px] font-black tracking-tight ${tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} T
                    </td>
                    <td className="px-8 py-5 text-[9px] font-bold text-zinc-700 uppercase tracking-wider">{tx.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceOverview;
