
import React, { useState } from 'react';
import { Mail, Lock, User, ShieldCheck, Zap, ArrowRight, Loader2, Eye, EyeOff, Chrome } from 'lucide-react';
import { authActions } from '../../lib/useAuth';

const AuthForm: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        alert("สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลของคุณ (รวมถึงกล่องจดหมายขยะ/Spam) เพื่อกดยืนยันตัวตนก่อนเข้าสู่ระบบครับ\\n\\nAccount created successfully! Please check your email to verify your account.");
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

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: googleError } = await authActions.signInWithGoogle();
      if (googleError) throw googleError;
      // Note: OAuth redirects, so onComplete might not run immediately here.
    } catch (err: any) {
      setError(err.message || "Google sign in failed.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-6 sm:p-10 bg-[#111115] border border-white/5 rounded-[32px] sm:rounded-[48px] shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-700 flex-shrink-0">
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
            type={showPassword ? "text" : "password"} 
            placeholder="ACCESS CODE..." 
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full h-12 bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-12 text-[10px] font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800 uppercase"
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-cyan-400 focus:outline-none"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && <p className="text-rose-500 text-[9px] font-black uppercase text-center py-2 bg-rose-500/10 rounded-xl">{error}</p>}

        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center gap-2 text-black font-black text-[12px] tracking-[0.2em] uppercase hover:brightness-110 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all disabled:opacity-50 mt-2"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <>{isSignUp ? 'SIGN UP' : 'SIGN IN'} <ArrowRight size={16} /></>}
        </button>

        <div className="relative flex items-center py-4">
          <div className="flex-grow border-t border-white/5"></div>
          <span className="flex-shrink-0 mx-4 text-zinc-600 text-[9px] font-black tracking-widest uppercase">OR CONNECT WITH</span>
          <div className="flex-grow border-t border-white/5"></div>
        </div>

        <button 
          type="button" 
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full h-12 bg-white text-black rounded-2xl flex items-center justify-center gap-3 font-black text-[11px] tracking-[0.1em] uppercase hover:bg-gray-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)]"
        >
          <Chrome size={18} className="text-black" />
          CONTINUE WITH GOOGLE
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
          className="px-6 py-3.5 rounded-2xl bg-cyan-500/10 border-2 border-cyan-500/30 hover:border-cyan-500 hover:bg-cyan-500/20 text-xs font-black text-white hover:text-cyan-300 uppercase tracking-widest transition-all active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.15)] flex items-center gap-2"
        >
          {isSignUp ? (
            <>
              Already have an account? <span className="text-cyan-400 font-extrabold underline decoration-2 underline-offset-4">→ Sign In</span>
            </>
          ) : (
            <>
              No account yet? <span className="text-cyan-300 font-extrabold text-[13px] tracking-wide animate-pulse">→ Sign Up Free</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AuthForm;
