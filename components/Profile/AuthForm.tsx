
import React, { useState } from 'react';
import { Mail, Lock, User, ShieldCheck, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { authActions } from '../../lib/useAuth';

const AuthForm: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      if (isSignUp) {
        const { error: signUpError } = await authActions.signUp(email, password);
        if (signUpError) throw signUpError;
        alert("Account created successfully!");
        onComplete();
      } else {
        const { error: signInError } = await authActions.signIn(email, password);
        if (signInError) throw signInError;
        onComplete();
      }
    } catch (err: any) {
      setError(err.message || "An authentication error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-10 bg-[#111115] border border-white/5 rounded-[48px] shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-700">
      <div className="absolute top-0 right-0 p-8 opacity-5"><Zap size={120} /></div>
      
      <div className="space-y-4 mb-2">
         <div className="flex items-center gap-2 text-cyan-500 font-black text-[10px] uppercase tracking-[0.4em]">
           <ShieldCheck size={14} /> AUTHORIZATION CORE
         </div>
         <h2 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none mb-1">
           {isSignUp ? 'SIGN' : 'SYSTEM'}<span className="text-cyan-500">{isSignUp ? 'UP' : 'LOGIN'}</span>
         </h2>
         <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest max-w-xs leading-relaxed">
            Verify your neural link to access the global cloud matrix.
         </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-4">
        {isSignUp && (
          <div className="relative group">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-cyan-400" />
            <input 
              required
              type="text" 
              placeholder="FULL NAME..." 
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-4 text-[10px] font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800 uppercase"
            />
          </div>
        )}
        <div className="relative group">
          <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-cyan-400" />
          <input 
            required
            type="email" 
            placeholder="NEURAL EMAIL..." 
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-4 text-[10px] font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800 uppercase"
          />
        </div>
        <div className="relative group">
          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-cyan-400" />
          <input 
            required
            type="password" 
            placeholder="ACCESS CODE..." 
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-4 text-[10px] font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800 uppercase"
          />
        </div>

        {error && <p className="text-rose-500 text-[9px] font-black uppercase text-center py-2 bg-rose-500/10 rounded-xl">{error}</p>}

        <button 
          disabled={isLoading}
          type="submit"
          className="w-full h-14 bg-cyan-500 text-black rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl hover:shadow-cyan-500/20 disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : (isSignUp ? 'SIGN UP' : 'LOGIN')}
          {!isLoading && <ArrowRight size={18} strokeWidth={3} />}
        </button>
      </form>

      <div className="my-6 flex items-center gap-4 text-zinc-800">
         <div className="h-px flex-1 bg-white/5" />
         <span className="text-[9px] font-black uppercase text-zinc-700">Email Only for Now</span>
         <div className="h-px flex-1 bg-white/5" />
      </div>

      <div className="mt-8 flex justify-center">
        <button 
          onClick={() => setIsSignUp(!isSignUp)}
          className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/40 text-[10px] font-black text-zinc-300 hover:text-cyan-400 uppercase tracking-widest transition-all active:scale-95 shadow-md flex items-center gap-2"
        >
          {isSignUp ? (
            <>
              Already have an account? <span className="text-cyan-400">→ Sign In</span>
            </>
          ) : (
            <>
              No account yet? <span className="text-cyan-400">→ Sign Up Free</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AuthForm;
