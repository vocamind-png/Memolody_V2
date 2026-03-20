
import React, { useState } from 'react';
import { Check, Zap, Sparkles, Shield, Music, Star, X, ExternalLink, ChevronRight } from 'lucide-react';

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    description: 'Foundational AI draft mode for essential notation.',
    slots: '1 Active AI Slot',
    features: ['Web Audio Draft Mode', 'Basic MusicXML Export', 'Community Forum Sync', 'Nimo Basic Guidance'],
    cta: 'Current Plan',
    disabled: true,
    color: 'text-zinc-500',
    bgColor: 'bg-white/5',
    borderColor: 'border-white/5',
  },
  {
    name: 'Student',
    price: '$9',
    unit: '/mo',
    description: 'Enhanced neural synthesis for active music learners.',
    slots: '3 Active AI Slots',
    features: ['Cloud SVS High Fidelity Render', '3 Active AI Vocal Tracks', 'Teacher Dashboard Sync', 'Advanced Solfege Training', 'Nimo Pro Assistance'],
    cta: 'Upgrade to Student',
    popular: true,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
  },
  {
    name: 'Creator',
    price: '$29',
    unit: '/mo',
    description: 'Unlimited studio-grade production for professional composers.',
    slots: '10 Active AI Slots',
    features: ['Full AI Studio (10 Slots)', '10 Active Master Tracks', 'Lossless WAV/STEMS Export', 'Custom AI Vocal Personas', 'Priority Neural GPU Queue', 'Marketplace Selling License'],
    cta: 'Go Creator Pro',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
  },
];

const SubscribeModal: React.FC<{ plan: typeof PLANS[0]; onClose: () => void }> = ({ plan, onClose }) => (
  <div className="fixed inset-0 z-[30000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
    <div className="w-full max-w-sm bg-[#111115] border border-white/10 rounded-[40px] p-8 relative" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-5 right-5 text-zinc-600 hover:text-white transition-colors"><X size={18} /></button>
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${plan.bgColor} border ${plan.borderColor}`}>
        {plan.name === 'Student' ? <Star size={24} className={plan.color} /> : <Zap size={24} className={plan.color} />}
      </div>
      <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-1">{plan.name} Plan</h3>
      <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">{plan.slots}</p>
      <div className="flex items-baseline gap-1 mb-6">
        <span className="text-4xl font-black text-white">{plan.price}</span>
        {plan.unit && <span className="text-zinc-600 text-sm font-black uppercase">{plan.unit}</span>}
      </div>
      <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-6 leading-relaxed">
        ระบบชำระเงินอยู่ระหว่างการพัฒนา (Coming Soon) เชื่อมต่อกับ Stripe/Apple Pay กรุณาติดต่อทีมงานเพื่อสมัครแบบ Manual ก่อนนะครับ
      </p>
      <div className="space-y-3">
        <a
          href="mailto:support@memolody.app?subject=Subscription: Memolody ${plan.name} Plan"
          className="w-full h-12 bg-cyan-500 text-black rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-cyan-400 active:scale-95 transition-all"
        >
          <ExternalLink size={14} /> Contact to Subscribe
        </a>
        <button
          onClick={onClose}
          className="w-full h-11 bg-white/5 border border-white/10 text-zinc-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:text-white transition-colors"
        >
          Maybe Later
        </button>
      </div>
    </div>
  </div>
);

const PricingTiers: React.FC = () => {
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null);

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-[#0A0A0B]">
      <div className="py-16 px-6 max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-14 space-y-4">
          <div className="flex items-center justify-center gap-2 text-cyan-500 font-black text-[10px] uppercase tracking-[0.4em]">
            <Zap size={14} fill="currentColor" /> Neural Engine Subscriptions
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
          {PLANS.map((plan, i) => (
            <div
              key={i}
              className={`relative p-7 rounded-[40px] border ${plan.borderColor} ${plan.bgColor} flex flex-col gap-6 transition-all backdrop-blur-xl group overflow-hidden hover:scale-[1.02]`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-cyan-500 text-black text-[7px] font-black uppercase tracking-widest rounded-full">
                  Most Popular
                </div>
              )}
              {plan.popular && (
                <div className="absolute top-0 right-0 p-6 h-full overflow-hidden pointer-events-none opacity-10">
                  <Sparkles size={180} className="text-cyan-400" />
                </div>
              )}

              {/* Icon + Name */}
              <div>
                <div className={`p-3 w-12 h-12 rounded-2xl flex items-center justify-center bg-black/40 border border-white/5 mb-4 ${plan.color}`}>
                  {i === 0 ? <Music size={20} /> : i === 1 ? <Star size={20} /> : <Zap size={20} />}
                </div>
                <h3 className="text-xl font-black italic tracking-tighter uppercase text-white">{plan.name}</h3>
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">{plan.description}</p>
              </div>

              {/* Price */}
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white italic">{plan.price}</span>
                  {plan.unit && <span className="text-[10px] font-black text-zinc-600 uppercase italic">{plan.unit}</span>}
                </div>
                <div className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 mt-1 ${plan.color}`}>
                  <Shield size={10} /> {plan.slots}
                </div>
              </div>

              {/* Features */}
              <div className="flex-1 space-y-2">
                <p className="text-[7px] font-black text-zinc-700 uppercase tracking-[0.3em]">Included Features</p>
                {plan.features.map((f, j) => (
                  <div key={j} className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center bg-black/40 border border-white/5 shrink-0 ${plan.color}`}>
                      <Check size={8} strokeWidth={4} />
                    </div>
                    <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wide">{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                disabled={'disabled' in plan && plan.disabled}
                onClick={() => !('disabled' in plan && plan.disabled) && setSelectedPlan(plan)}
                className={`w-full py-4 rounded-[20px] text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2
                  ${'disabled' in plan && plan.disabled
                    ? 'bg-zinc-800 text-zinc-600 cursor-default'
                    : 'bg-white text-black hover:bg-cyan-500 hover:shadow-lg hover:shadow-cyan-500/20 active:scale-95 cursor-pointer'
                  }`}
              >
                {plan.cta}
                {!('disabled' in plan && plan.disabled) && <ChevronRight size={12} strokeWidth={3} />}
              </button>
            </div>
          ))}
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

        {/* FAQ */}
        <div className="mt-10 space-y-3">
          <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.3em] text-center">Common Questions</p>
          {[
            { q: 'What is an AI Slot?', a: 'Each AI Slot allows one Song to be rendered into vocal audio simultaneously using our GPU cloud infrastructure.' },
            { q: 'Can I cancel anytime?', a: 'Yes. You can cancel or downgrade your plan at any time. Your access continues until the end of the billing period.' },
            { q: 'What payment methods are accepted?', a: 'We support credit cards, Apple Pay, and Google Pay via Stripe. More options coming soon.' },
          ].map((faq, i) => (
            <details key={i} className="group bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer text-[10px] font-black text-zinc-300 uppercase tracking-wider list-none">
                {faq.q}
                <ChevronRight size={12} className="text-zinc-600 group-open:rotate-90 transition-transform" />
              </summary>
              <p className="px-5 pb-4 text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>

        <div className="h-10" />
      </div>

      {selectedPlan && <SubscribeModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}
    </div>
  );
};

export default PricingTiers;
