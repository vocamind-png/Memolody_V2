
import React from 'react';
import { 
  TrendingUp, Users, CreditCard, DollarSign, ArrowUpRight, ArrowDownRight, 
  Activity, PieChart, ShieldCheck, Zap
} from 'lucide-react';

const FinanceOverview: React.FC = () => {
  // Mock data for the dashboard
  const kpis = [
    { label: 'Total Revenue', value: '$42,500.00', change: '+12.5%', isUp: true, icon: DollarSign, color: 'text-emerald-400' },
    { label: 'Active Subscribers', value: '1,280', change: '+5.2%', isUp: true, icon: Users, color: 'text-cyan-400' },
    { label: 'Churn Rate', value: '2.4%', change: '-0.8%', isUp: false, icon: Activity, color: 'text-rose-500' },
    { label: 'AI Support Costs', value: '$8,240.00', change: '+15.1%', isUp: true, icon: Zap, color: 'text-amber-400' },
  ];

  const recentTransactions = [
    { id: 'TX-9021', user: 'Mnemo Creator', plan: 'Creator Tier', amount: '$29.00', status: 'Success', date: '2 mins ago' },
    { id: 'TX-9020', user: 'Solfege Student', plan: 'Student Tier', amount: '$9.00', status: 'Success', date: '15 mins ago' },
    { id: 'TX-9019', user: 'Digital Maestro', plan: 'Creator Tier', amount: '$29.00', status: 'Failed', date: '1 hour ago' },
    { id: 'TX-9018', user: 'Pitch Master', plan: 'Student Tier', amount: '$9.00', status: 'Success', date: '3 hours ago' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-[#111115] border border-white/5 p-6 rounded-[32px] group hover:border-white/10 transition-all">
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
        {/* Revenue Chart Placeholder */}
        <div className="lg:col-span-2 bg-[#111115] border border-white/5 p-8 rounded-[40px] relative overflow-hidden">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Revenue Stream</h3>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Global subscriptions last 30 days</p>
            </div>
            <div className="flex gap-2">
               <button className="px-4 py-1.5 rounded-full bg-white/5 text-[9px] font-black text-zinc-400 hover:text-white transition-colors">1W</button>
               <button className="px-4 py-1.5 rounded-full bg-cyan-500/10 text-[9px] font-black text-cyan-400">1M</button>
               <button className="px-4 py-1.5 rounded-full bg-white/5 text-[9px] font-black text-zinc-400 hover:text-white transition-colors">YTD</button>
            </div>
          </div>
          
          <div className="h-48 flex items-end gap-2 group">
             {[35, 45, 30, 60, 80, 55, 90, 75, 100, 85, 95, 110].map((h, i) => (
               <div key={i} className="flex-1 bg-white/5 rounded-t-lg relative group/bar hover:bg-cyan-500/20 transition-all" style={{ height: `${h}%` }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-cyan-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity">
                    ${(h * 10).toLocaleString()}
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

        {/* Plan Distribution */}
        <div className="bg-[#111115] border border-white/5 p-8 rounded-[40px]">
          <h3 className="text-lg font-black text-white italic tracking-tight uppercase mb-8">Plan Mix</h3>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-indigo-400">
                <span>Creator Tier ($29)</span>
                <span>45%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-[45%]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-cyan-400">
                <span>Student Tier ($9)</span>
                <span>35%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 w-[35%]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-zinc-600">
                <span>Free Tier ($0)</span>
                <span>20%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-white/10 w-[20%]" />
              </div>
            </div>
          </div>
          
          <div className="mt-12 p-6 rounded-[24px] bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20">
             <div className="flex items-center gap-3 mb-3">
               <ShieldCheck size={18} className="text-indigo-400" />
               <span className="text-[10px] font-black text-white uppercase tracking-widest">Growth Forecast</span>
             </div>
             <p className="text-[9px] font-bold text-zinc-500 leading-relaxed uppercase">
               Predicted +12% MRR growth next month based on current conversion rates.
             </p>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-[#111115] border border-white/5 rounded-[40px] overflow-hidden">
        <div className="p-8 border-b border-white/5 flex justify-between items-center">
            <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Recent Ledger</h3>
            <button className="flex items-center gap-2 text-[9px] font-black text-cyan-500 uppercase tracking-widest hover:text-cyan-400 transition-colors">
               View Full History <CreditCard size={12} />
            </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Transaction ID</th>
                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Member</th>
                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Plan</th>
                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Amount</th>
                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Status</th>
                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {recentTransactions.map((tx, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-8 py-5 text-[10px] font-mono text-zinc-500 font-bold uppercase">{tx.id}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[8px] font-black text-zinc-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-400 transition-colors">
                        {tx.user.charAt(0)}
                      </div>
                      <span className="text-[10px] font-black text-white uppercase italic">{tx.user}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 shadow-inner">
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter ${tx.plan.includes('Creator') ? 'bg-indigo-500/10 text-indigo-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                      {tx.plan}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-[11px] font-black text-white tracking-tight">{tx.amount}</td>
                  <td className="px-8 py-5">
                    <span className={`flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${tx.status === 'Success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      <div className={`w-1 h-1 rounded-full ${tx.status === 'Success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-[9px] font-bold text-zinc-700 uppercase tracking-wider">{tx.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinanceOverview;
