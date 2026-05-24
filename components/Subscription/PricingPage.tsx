/**
 * PricingPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription plan selection page with monthly / yearly toggle.
 * Prices & limits are driven from AuthContext.TIER_PRICING — edit there.
 *
 * USAGE (in App.tsx renderPage when ready):
 *   case 'subscription':
 *     return <PricingPage onSelectPlan={(tier, cycle) => handleUpgrade(tier, cycle)} />;
 */
import React, { useState } from 'react';
import { Check, Zap, Star, Crown, Sparkles, ArrowRight, RefreshCcw } from 'lucide-react';
import { TIER_PRICING, type MemberTier } from '../../lib/AuthContext';

type BillingCycle = 'monthly' | 'yearly';

const TIER_ICONS: Record<string, React.ReactNode> = {
  free:    <Zap size={18} />,
  pro:     <Sparkles size={18} />,
  premium: <Crown size={18} />,
};

interface PricingPageProps {
  currentTier?: MemberTier;
  onSelectPlan?: (tier: Exclude<MemberTier, 'admin'>, cycle: BillingCycle) => void;
}

export default function PricingPage({ currentTier = 'free', onSelectPlan }: PricingPageProps) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const tiers = Object.entries(TIER_PRICING) as [
    Exclude<MemberTier, 'admin'>,
    typeof TIER_PRICING[keyof typeof TIER_PRICING]
  ][];

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-[#050507] pb-32">
      <div className="max-w-5xl mx-auto px-4 pt-12">

        {/* Header */}
        <div className="text-center mb-10 space-y-3">
          <div className="flex items-center justify-center gap-2 text-cyan-500 text-[9px] font-black uppercase tracking-[0.3em]">
            <Zap size={12} /> Subscription Plans
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none">
            เลือก<span className="text-cyan-400">แพลน</span>ของคุณ
          </h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
            เริ่มต้นฟรี — อัพเกรดได้ทุกเมื่อ ไม่มีสัญญาผูกมัด
          </p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mb-10">
          <div className="flex bg-white/[0.03] border border-white/5 rounded-2xl p-1 gap-1">
            {(['monthly', 'yearly'] as BillingCycle[]).map(c => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`relative px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  cycle === c
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {c === 'monthly' ? 'รายเดือน' : 'รายปี'}
                {c === 'yearly' && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[7px] font-black">
                    ประหยัดสูงสุด 45%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {tiers.map(([tierId, plan]) => {
            const isCurrent = tierId === currentTier;
            const isFeatured = !!plan.badge;
            const price = cycle === 'monthly' ? plan.monthlyThb : plan.yearlyThb;
            const perMonth = cycle === 'yearly' && plan.yearlyThb
              ? Math.round(plan.yearlyThb / 12)
              : plan.monthlyThb;

            return (
              <div
                key={tierId}
                className={`relative flex flex-col rounded-[32px] border p-6 transition-all ${
                  isFeatured
                    ? 'border-indigo-500/30 bg-gradient-to-b from-indigo-500/5 to-transparent shadow-xl shadow-indigo-500/5'
                    : tierId === 'premium'
                      ? 'border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent'
                      : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${plan.color} border ${
                      tierId === 'premium' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-indigo-500/10 border-indigo-500/30'
                    }`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Icon + label */}
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-4 ${plan.accentBg} border border-white/5 ${plan.color}`}>
                  {TIER_ICONS[tierId]}
                </div>

                <h3 className={`text-lg font-black italic uppercase tracking-tight ${plan.color} mb-1`}>
                  {plan.label}
                </h3>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-4">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mb-6">
                  {price === null ? (
                    <p className="text-3xl font-black text-white italic tracking-tighter">ฟรี</p>
                  ) : (
                    <>
                      <div className="flex items-end gap-1">
                        <span className="text-3xl font-black text-white italic tracking-tighter">
                          ฿{cycle === 'yearly' ? perMonth?.toLocaleString() : price.toLocaleString()}
                        </span>
                        <span className="text-[9px] text-zinc-500 font-bold uppercase mb-1">/เดือน</span>
                      </div>
                      {cycle === 'yearly' && plan.yearlyThb && (
                        <p className="text-[9px] text-emerald-400 font-black mt-0.5">
                          ฿{plan.yearlyThb.toLocaleString()} / ปี
                          <span className="ml-1 text-emerald-600">(ประหยัด {plan.yearlyDiscountPct}%)</span>
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2 flex-1 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[10px] text-zinc-300 font-bold">
                      <Check size={12} className={`mt-0.5 shrink-0 ${plan.color}`} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="w-full py-2.5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">
                    แผนปัจจุบัน ✓
                  </div>
                ) : price === null ? (
                  <button
                    onClick={() => onSelectPlan?.(tierId, cycle)}
                    className="w-full py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black text-zinc-300 uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all"
                  >
                    เริ่มใช้ฟรี <ArrowRight size={12} />
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectPlan?.(tierId, cycle)}
                    className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                      tierId === 'premium'
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20'
                        : tierId === 'pro'
                          ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/20'
                    }`}
                  >
                    เลือกแพลนนี้ <ArrowRight size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-[9px] text-zinc-700 font-bold uppercase tracking-widest mt-10 leading-relaxed">
          ราคาอาจมีการเปลี่ยนแปลงตามต้นทุน GPU · ยกเลิกได้ทุกเมื่อ · ไม่มีค่าธรรมเนียมซ่อนเร้น
        </p>
      </div>
    </div>
  );
}
