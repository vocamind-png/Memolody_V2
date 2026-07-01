import React, { useState } from 'react';
import { Check, Zap, Sparkles, Shield, Music, Star, X, ExternalLink, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthContext, TIER_PRICING, MemberTier, TierPrice } from '../../lib/AuthContext';

const SubscribeModal: React.FC<{ planId: MemberTier; plan: TierPrice; onClose: () => void }> = ({ planId, plan, onClose }) => {
  const { simulateSubscription, user } = useAuthContext();
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const isCurrentPlan = user?.tier === planId;

  const handleSimulate = async () => {
    setIsProcessing(true);
    // Simulate network delay for payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    await simulateSubscription(planId);
    setIsProcessing(false);
    setSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[30000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#111115] border border-white/10 rounded-[40px] p-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 text-zinc-600 hover:text-white transition-colors"><X size={18} /></button>
        
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${plan.accentBg} border border-white/5`}>
          {planId === 'premium' ? <Star size={24} className={plan.color} /> : <Zap size={24} className={plan.color} />}
        </div>
        
        <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-1">{plan.label}</h3>
        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-6 leading-relaxed">
          {plan.description}
        </p>
        
        {success ? (
          <div className="py-6 flex flex-col items-center justify-center gap-3 animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-2">
              <Check size={32} strokeWidth={3} />
            </div>
            <p className="text-white font-black text-lg">Subscription Active!</p>
            <p className="text-zinc-400 text-xs text-center">Your tier has been successfully updated.</p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-black text-white">{plan.monthlyThb ? `฿${plan.monthlyThb}` : 'Free'}</span>
              {plan.monthlyThb && <span className="text-zinc-600 text-sm font-black uppercase">/mo</span>}
            </div>
            
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-6 leading-relaxed">
              *นี่คือระบบจำลองการสมัครใช้งาน (Mock Checkout) สำหรับทดสอบระบบ โดยจะไม่มีการหักเงินจริง
            </p>

            <div className="space-y-3">
              {isCurrentPlan ? (
                <button
                  disabled
                  className="w-full h-12 bg-zinc-800 text-zinc-500 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 cursor-default"
                >
                  Current Plan Active
                </button>
              ) : (
                <button
                  onClick={handleSimulate}
                  disabled={isProcessing}
                  className={`w-full h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                    isProcessing 
                      ? 'bg-cyan-500/50 text-black/50 cursor-not-allowed' 
                      : 'bg-cyan-500 text-black hover:bg-cyan-400 active:scale-95'
                  }`}
                >
                  {isProcessing ? <><Loader2 size={14} className="animate-spin" /> Processing...</> : 'Simulate Payment'}
                </button>
              )}
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="w-full h-11 bg-white/5 border border-white/10 text-zinc-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const PricingTiers: React.FC = () => {
  const { user } = useAuthContext();
  const [selectedPlan, setSelectedPlan] = useState<{ id: MemberTier; plan: TierPrice } | null>(null);

  const planEntries = Object.entries(TIER_PRICING) as [Exclude<MemberTier, 'admin'>, TierPrice][];

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-[#0A0A0B]">
      <div className="py-16 px-6 max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-14 space-y-4">
          <div className="flex items-center justify-center gap-2 text-cyan-500 font-black text-[10px] uppercase tracking-[0.4em]">
            <Zap size={14} fill="currentColor" /> Memolody Subscriptions
          </div>
          <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter uppercase text-white leading-none">
            UPGRADE TO <span className="text-cyan-500">HI-FI</span> SVS
          </h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest max-w-lg mx-auto leading-relaxed">
            Unlock the power of Google Cloud GPU rendering. Transform your notation into studio-grade vocal performances.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          {planEntries.map(([id, plan], i) => {
            const isPopular = id === 'pro';
            const isCurrentPlan = user?.tier === id;
            
            return (
              <div
                key={id}
                className={`relative p-7 rounded-[40px] border border-white/5 ${plan.accentBg} flex flex-col gap-6 transition-all backdrop-blur-xl group overflow-hidden hover:scale-[1.02] ${isCurrentPlan ? 'ring-2 ring-cyan-500/30' : ''}`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-cyan-500 text-black text-[7px] font-black uppercase tracking-widest rounded-full">
                    Most Popular
                  </div>
                )}
                {isPopular && (
                  <div className="absolute top-0 right-0 p-6 h-full overflow-hidden pointer-events-none opacity-10">
                    <Sparkles size={180} className="text-cyan-400" />
                  </div>
                )}
                {plan.badge && !isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-amber-500 text-black text-[7px] font-black uppercase tracking-widest rounded-full">
                    {plan.badge}
                  </div>
                )}

                {/* Icon + Name */}
                <div>
                  <div className={`p-3 w-12 h-12 rounded-2xl flex items-center justify-center bg-black/40 border border-white/5 mb-4 ${plan.color}`}>
                    {i === 0 ? <Music size={20} /> : i === 1 ? <Zap size={20} /> : <Star size={20} />}
                  </div>
                  <h3 className="text-xl font-black italic tracking-tighter uppercase text-white">{plan.label}</h3>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">{plan.description}</p>
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white italic">{plan.monthlyThb ? `฿${plan.monthlyThb}` : 'Free'}</span>
                    {plan.monthlyThb && <span className="text-[10px] font-black text-zinc-600 uppercase italic">/mo</span>}
                  </div>
                </div>

                {/* Features */}
                <div className="flex-1 space-y-2">
                  <p className="text-[7px] font-black text-zinc-700 uppercase tracking-[0.3em]">Included Features</p>
                  {plan.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2.5">
                      <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-black/40 border border-white/5 shrink-0 ${plan.color}`}>
                        <Check size={8} strokeWidth={4} />
                      </div>
                      <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wide leading-relaxed">{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => setSelectedPlan({ id, plan })}
                  className={`w-full py-4 rounded-[20px] text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2
                    ${isCurrentPlan
                      ? 'bg-zinc-800 text-zinc-400 cursor-default border border-white/10'
                      : 'bg-white text-black hover:bg-cyan-500 hover:shadow-lg hover:shadow-cyan-500/20 active:scale-95 cursor-pointer'
                    }`}
                >
                  {isCurrentPlan ? 'Current Plan' : `Upgrade to ${plan.label.split(' ')[0]}`}
                  {!isCurrentPlan && <ChevronRight size={12} strokeWidth={3} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Enterprise Banner */}
        <div className="p-8 rounded-[40px] bg-[#111115] border border-white/5 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Shield size={32} />
          </div>
          <div className="flex-1 space-y-1 text-center sm:text-left">
            <h4 className="text-lg font-black italic text-white uppercase tracking-tight">Enterprise Scale Authority</h4>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-relaxed">
              Need a classroom setup for 100+ students? Special institution rates with dedicated GPU node allocation.
            </p>
          </div>
          <a
            href="mailto:support@memolody.app?subject=Enterprise Inquiry"
            className="px-8 py-4 rounded-[20px] border border-white/10 text-[9px] font-black text-white hover:bg-white hover:text-black uppercase tracking-widest transition-all flex items-center gap-2 shrink-0"
          >
            <ExternalLink size={12} /> Contact Us
          </a>
        </div>

        <div className="h-10" />
      </div>

      {selectedPlan && <SubscribeModal planId={selectedPlan.id} plan={selectedPlan.plan} onClose={() => setSelectedPlan(null)} />}
    </div>
  );
};

export default PricingTiers;
