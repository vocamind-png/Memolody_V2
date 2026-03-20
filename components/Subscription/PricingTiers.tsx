
import React from 'react';
import { Check, Zap, Sparkles, Shield, Music, Star, ChevronRight } from 'lucide-react';

const PricingTiers: React.FC = () => {
  const plans = [
    {
      name: 'Free Matrix',
      price: '$0',
      description: 'Foundational AI draft mode for essential notation.',
      slots: '1 Active AI Slot',
      features: [
        'Web Audio Draft Mode',
        'Basic MusicXML Export',
        'Community Forum Sync',
        'Nimo Basic Guidance'
      ],
      cta: 'Current Plan',
      isPremium: false,
      color: 'text-zinc-500',
      bgColor: 'bg-white/5',
      borderColor: 'border-white/5'
    },
    {
      name: 'Student Tier',
      price: '$9',
      unit: '/mo',
      description: 'Enhanced neural synthesis for active music learners.',
      slots: '3 Active AI Slots',
      features: [
        'Cloud SVS High Fidelity Render',
        '3 Active AI Vocal Tracks',
        'Teacher Dashboard Sync',
        'Advanced Solfege Training',
        'Nimo Pro Assistance'
      ],
      cta: 'Upgrade to Student',
      isPremium: true,
      popular: true,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/20'
    },
    {
      name: 'Creator Tier',
      price: '$29',
      unit: '/mo',
      description: 'Unlimited studio-grade production for professional composers.',
      slots: '10 Active AI Slots',
      features: [
        'Full AI Studio (10 Slots)',
        '10 Active Master Tracks',
        'Lossless WAV/STEMS Export',
        'Custom AI Vocal Personas',
        'Priority Neural GPU Queue',
        'Marketplace Selling License'
      ],
      cta: 'Go Creator Pro',
      isPremium: true,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20'
    }
  ];

  return (
    <div className="py-20 px-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="text-center mb-16 space-y-4">
         <div className="flex items-center justify-center gap-2 text-cyan-500 font-black text-[10px] uppercase tracking-[0.4em]">
           <Zap size={14} fill="currentColor" /> NEURAL ENGINE SUBSCRIPTIONS
         </div>
         <h2 className="text-5xl md:text-6xl font-black italic tracking-tighter uppercase text-white leading-none">
           UPGRADE TO <span className="text-cyan-500">HI-FI</span> SVS
         </h2>
         <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest max-w-lg mx-auto leading-relaxed">
            Unlock the power of Google Cloud GPU rendering. Transform your notation into studio-grade vocal performances.
         </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan, i) => (
          <div key={i} className={`relative p-8 rounded-[48px] border ${plan.borderColor} ${plan.bgColor} flex flex-col gap-8 transition-all hover:scale-[1.02] hover:bg-white/[0.08] backdrop-blur-xl group overflow-hidden`}>
             {plan.popular && (
                <div className="absolute top-0 right-0 p-8 h-full overflow-hidden pointer-events-none opacity-20">
                   <Sparkles size={200} className="text-cyan-400 -mr-20 -mt-20 group-hover:rotate-12 transition-transform duration-1000" />
                </div>
             )}
             
             <div className="space-y-2 relative">
                <div className={`p-4 w-14 h-14 rounded-2xl flex items-center justify-center bg-black/40 border border-white/5 mb-6 group-hover:scale-110 transition-transform ${plan.color}`}>
                   {plan.name.includes('Free') ? <Music size={24} /> : plan.name.includes('Student') ? <Star size={24} /> : <Zap size={24} />}
                </div>
                <h3 className="text-2xl font-black italic tracking-tighter uppercase text-white">{plan.name}</h3>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{plan.description}</p>
             </div>

             <div className="relative">
                <div className="flex items-baseline gap-1 mb-2">
                   <span className="text-4xl font-black text-white italic tracking-tighter">{plan.price}</span>
                   {plan.unit && <span className="text-xs font-black text-zinc-600 uppercase italic tracking-widest">{plan.unit}</span>}
                </div>
                <div className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${plan.color}`}>
                   <Shield size={12} /> {plan.slots}
                </div>
             </div>

             <div className="space-y-4 flex-1 relative">
                <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.3em]">INCLUDED FEATURES</p>
                <div className="space-y-3">
                   {plan.features.map((feature, j) => (
                      <div key={j} className="flex items-center gap-3">
                         <div className={`w-4 h-4 rounded-full flex items-center justify-center bg-black/40 border border-white/5 ${plan.color}`}>
                            <Check size={8} strokeWidth={4} />
                         </div>
                         <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">{feature}</span>
                      </div>
                   ))}
                </div>
             </div>

             <button className={`w-full py-5 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 relative overflow-hidden group/btn 
                ${plan.name.includes('Free') ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-cyan-500 hover:text-black shadow-xl hover:shadow-cyan-500/20'}`}>
                {plan.cta}
                <ChevronRight size={14} strokeWidth={3} className="group-hover/btn:translate-x-1 transition-transform" />
             </button>
          </div>
        ))}
      </div>
      
      <div className="mt-20 p-10 rounded-[48px] bg-[#111115] border border-white/5 flex flex-col md:flex-row items-center gap-10">
         <div className="w-20 h-20 shrink-0 rounded-3xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Shield size={40} />
         </div>
         <div className="flex-1 space-y-2 text-center md:text-left">
            <h4 className="text-xl font-black italic text-white uppercase tracking-tight">Enterprise Scale Authority</h4>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-relaxed">
               Need a classroom setup for 100+ students? We offer special institution rates with dedicated GPU node allocation.
            </p>
         </div>
         <button className="px-10 py-5 rounded-[24px] border border-white/10 text-[10px] font-black text-white hover:bg-white hover:text-black uppercase tracking-widest transition-all">
            Contact Authority
         </button>
      </div>
    </div>
  );
};

export default PricingTiers;
