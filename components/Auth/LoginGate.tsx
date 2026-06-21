/**
 * LoginGate.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the entire app. Shows login/register screen if user is not authenticated.
 * 
 * USAGE (in App.tsx when ready):
 *   import { LoginGate } from './components/Auth/LoginGate';
 *   <AuthProvider><LoginGate><App /></LoginGate></AuthProvider>
 */
import React, { useState } from 'react';
import { Zap, Mail, Lock, User, Eye, EyeOff, Loader2, Music2, ArrowRight, ChevronRight } from 'lucide-react';
import { useAuthContext } from '../../lib/AuthContext';

type AuthTab = 'signin' | 'signup';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, signIn, signUp } = useAuthContext();

  // Pass through if already logged in
  if (isLoading) return <LoadingScreen />;
  if (user) return <>{children}</>;
  return <AuthScreen />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading screen while session is being restored
// ─────────────────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#050507] flex flex-col items-center justify-center gap-4 z-[99999]">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <Zap size={28} className="text-cyan-400" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#050507] flex items-center justify-center">
          <Loader2 size={12} className="text-cyan-500 animate-spin" />
        </div>
      </div>
      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.3em]">กำลังโหลด...</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth screen (Login / Register)
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const { signIn, signUp } = useAuthContext();
  const [tab, setTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (tab === 'signin') {
        const { error: err } = await signIn(email, password);
        if (err) setError(err);
      } else {
        const { error: err } = await signUp(email, password, name);
        if (err) setError(err);
        else setSuccess('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับครับ 🎉');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#050507] flex overflow-hidden z-[99999]">
      {/* ── Left panel: branding ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-gradient-to-br from-[#050507] via-[#080818] to-[#050507] border-r border-white/5 p-12 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Zap size={20} className="text-cyan-400" />
          </div>
          <div>
            <p className="text-white font-black text-sm tracking-tight">MEMOLODY</p>
            <p className="text-[8px] text-zinc-600 font-black uppercase tracking-[0.3em]">AI Voice Notation</p>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="relative z-10 space-y-6">
          <h2 className="text-4xl font-black text-white italic tracking-tighter leading-tight uppercase">
            ร้องโน้ตด้วย<br /><span className="text-cyan-400">AI Voice</span>
          </h2>
          <div className="space-y-3">
            {[
              { icon: '🎵', text: 'แสดงโน้ตพร้อมสระ Solfège ทุกระบบ' },
              { icon: '🎙️', text: 'Render เสียงร้อง AI ความละเอียดสูง' },
              { icon: '📦', text: 'Export Stem แยกไฟล์ WAV / MP3 (Premium)' },
              { icon: '💾', text: 'MemoRender จำ render แต่ละคนแยกกัน' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-[11px] text-zinc-400 font-bold">
                <span className="text-base">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        {/* Tier preview */}
        <div className="relative z-10 flex gap-2">
          {['Free', 'Starter', 'Pro', 'Premium'].map((t, i) => (
            <div key={t} className={`flex-1 rounded-xl p-2 border text-center ${
              i === 3
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : i === 2
                  ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                  : i === 1
                    ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                    : 'bg-white/5 border-white/10 text-zinc-500'
            }`}>
              <p className="text-[7px] font-black uppercase tracking-widest">{t}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: auth form ── */}
      <div className="flex-1 flex flex-col p-6 pb-24 lg:pb-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto mt-4 lg:my-auto flex-shrink-0">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Zap size={16} className="text-cyan-400" />
            <span className="text-[11px] font-black text-zinc-400 tracking-[0.2em]">
              MEMOLODY <span className="text-cyan-400">V2</span>
            </span>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-white/[0.03] border border-white/5 rounded-2xl p-1 mb-8">
            {(['signin', 'signup'] as AuthTab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); setSuccess(null); }}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  tab === t
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
              </button>
            ))}
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-1">
              {tab === 'signin' ? 'ยินดีต้อนรับกลับ' : 'สร้างบัญชีฟรี'}
            </h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
              {tab === 'signin'
                ? 'เข้าสู่ระบบเพื่อใช้งาน Memolody'
                : 'ทดลองฟรี 3 เพลง/วัน — ไม่ต้องใช้บัตรเครดิต'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'signup' && (
              <InputField
                icon={<User size={15} />}
                type="text"
                placeholder="ชื่อของคุณ..."
                value={name}
                onChange={setName}
                required
              />
            )}
            <InputField
              icon={<Mail size={15} />}
              type="email"
              placeholder="อีเมล..."
              value={email}
              onChange={setEmail}
              required
            />
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-cyan-400 transition-colors">
                <Lock size={15} />
              </div>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)..."
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full h-12 bg-white/[0.03] border border-white/[0.08] rounded-2xl pl-11 pr-12 text-[11px] font-bold text-white placeholder:text-zinc-700 outline-none focus:border-cyan-500/40 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {/* Error / Success */}
            {error && (
              <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-[10px] font-black text-rose-400 uppercase tracking-wide">
                ⚠️ {error}
              </div>
            )}
            {success && (
              <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-[10px] font-black text-emerald-400 uppercase tracking-wide">
                ✅ {success}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-13 py-3.5 bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-black font-black uppercase tracking-widest text-[11px] rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> กำลังดำเนินการ...</>
                : tab === 'signin'
                  ? <><span>เข้าสู่ระบบ</span><ArrowRight size={16} strokeWidth={3} /></>
                  : <><span>สมัครสมาชิกฟรี</span><ArrowRight size={16} strokeWidth={3} /></>
              }
            </button>
          </form>

          {/* Free tier note */}
          {tab === 'signup' && (
            <p className="mt-6 text-center text-[9px] text-zinc-600 font-bold uppercase tracking-widest leading-relaxed">
              บัญชีฟรี · 3 เพลง/วัน · 3 Render/เพลง<br />
              <span className="text-zinc-700">อัพเกรดได้ทุกเมื่อใน Settings</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared input field component
// ─────────────────────────────────────────────────────────────────────────────
function InputField({
  icon, type, placeholder, value, onChange, required
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-cyan-400 transition-colors">
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full h-12 bg-white/[0.03] border border-white/[0.08] rounded-2xl pl-11 pr-4 text-[11px] font-bold text-white placeholder:text-zinc-700 outline-none focus:border-cyan-500/40 transition-colors"
      />
    </div>
  );
}
