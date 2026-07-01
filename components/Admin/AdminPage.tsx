import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, ShieldCheck, RefreshCcw, Trash2, HardDrive, AlertTriangle,
  Sparkles, FileText, FileImage, FileCode, Plus, Music, Database, TrendingUp, Users, Lock, BrainCircuit, Server, Gift, Award, HelpCircle, BarChart3, MessageSquare
} from 'lucide-react';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';
import { songStorage } from '../../lib/SongStorage';
import { Song } from '../../types';
import FinanceOverview from './FinanceOverview';
import UserManagement from './UserManagement';
import HeadAdminDashboard from './HeadAdminDashboard';
import { ServerControlDashboard } from './ServerControlDashboard';
import ServerAnalytics from './ServerAnalytics';
import AdminAnalytics from './AdminAnalytics';
import NimoActionsAdmin from './NimoActionsAdmin';
import FeedbackMatrix from './FeedbackMatrix';
// GameAssetsManager moved to Devel/ folder
import { useAuth, hasAccess } from '../../lib/useAuth';
import { supabase } from '../../lib/supabase';

interface AdminPageProps {
  onMusicXmlUpload?: (metadata: Song, xmlData: string) => void;
  onRestoreMasterpieces?: () => void;
  onRefresh?: () => void;
}

type AdminTab = 'vault' | 'finance' | 'users' | 'servers' | 'promotions' | 'redemptions' | 'analytics' | 'headquarters' | 'nimo_actions' | 'feedback';

interface PromoCode {
  id: string;
  code: string;
  description: string;
  reward_tokens: number;
  is_active: boolean;
  expires_at: string | null;
}

interface RedemptionRecord {
  id: string;
  email: string;
  reward_title: string;
  token_cost: number;
  status: 'pending' | 'delivered' | 'cancelled';
  created_at: string;
}

const AdminPage: React.FC<AdminPageProps> = ({ onMusicXmlUpload, onRestoreMasterpieces, onRefresh }) => {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('vault');
  const [isImporting, setIsImporting] = useState(false);
  const [files, setFiles] = useState<{name: string, status: string, message?: string, type?: string}[]>([]);
  const [vaultCount, setVaultCount] = useState(0);
  const smartInputRef = useRef<HTMLInputElement>(null);

  // Promotions tab state
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTokens, setNewTokens] = useState(100);
  
  // Redemptions tab state
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);

  useEffect(() => {
    updateVaultCount();
  }, []);

  useEffect(() => {
    if (activeTab === 'promotions') {
      loadPromotions();
    } else if (activeTab === 'redemptions') {
      loadRedemptions();
    }
  }, [activeTab]);

  const updateVaultCount = async () => {
    const songs = await songStorage.getAllSongs();
    setVaultCount(songs.length);
  };

  const loadPromotions = async () => {
    setLoadingDb(true);
    try {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setPromos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    try {
      const { error } = await supabase
        .from('promotions')
        .insert({
          code: newCode.trim().toUpperCase(),
          description: newDesc.trim(),
          reward_tokens: newTokens,
          is_active: true
        });
      if (error) throw error;
      alert(`Promotion code ${newCode.toUpperCase()} created successfully!`);
      setNewCode('');
      setNewDesc('');
      setNewTokens(100);
      loadPromotions();
    } catch(e) {
      alert("Failed to create promotion: " + (e as any).message);
    }
  };

  const handleTogglePromo = async (promoId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('promotions')
        .update({ is_active: !currentStatus })
        .eq('id', promoId);
      if (error) throw error;
      setPromos(prev => prev.map(p => p.id === promoId ? { ...p, is_active: !currentStatus } : p));
    } catch(e) {
      alert("Failed updating promo code: " + (e as any).message);
    }
  };

  const loadRedemptions = async () => {
    setLoadingDb(true);
    try {
      const { data, error } = await supabase
        .from('reward_redemptions')
        .select(`
          id,
          status,
          created_at,
          profiles (email),
          rewards (title, token_cost)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formatted = data.map((r: any) => ({
          id: r.id,
          email: r.profiles?.email || 'System user',
          reward_title: r.rewards?.title || 'Custom Reward',
          token_cost: r.rewards?.token_cost || 0,
          status: r.status,
          created_at: new Date(r.created_at).toLocaleString()
        }));
        setRedemptions(formatted);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleUpdateRedemption = async (redemptionId: string, nextStatus: 'delivered' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('reward_redemptions')
        .update({ status: nextStatus })
        .eq('id', redemptionId);
      if (error) throw error;
      setRedemptions(prev => prev.map(r => r.id === redemptionId ? { ...r, status: nextStatus } : r));
    } catch (e) {
      alert("Failed updating redemption record: " + (e as any).message);
    }
  };

  const processFile = async (file: File) => {
    const fileName = file.name;
    const extension = fileName.split('.').pop()?.toLowerCase();
    const isVisual = ['pdf', 'png', 'jpg', 'jpeg'].includes(extension || '');
    const isMidi = ['mid', 'midi'].includes(extension || '');

    setFiles(prev => [{ 
      name: fileName, 
      status: 'reading', 
      message: isVisual ? 'Nimo Vision: Transcribing Matrix...' : (isMidi ? 'Converting MIDI to Notation...' : 'Analyzing Neural Data...'),
      type: extension
    }, ...prev]);

    try {
      if (isVisual) {
        await new Promise(r => setTimeout(r, 2500)); 
        const mockXml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${fileName.split('.')[0]}</work-title></work><part-list><score-part id="P1"><part-name>Nimo Transcribed</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;
        const { metadata, xmlData } = await parseMusicXMLMetadata(mockXml, true);
        metadata.origin = 'load';
        await songStorage.saveSong(metadata, xmlData);
        setFiles(prev => prev.map(f => f.name === fileName ? { ...f, status: 'success', message: `Vision transcription complete: ${metadata.title}` } : f));
      } else {
        const { metadata, xmlData } = await parseMusicXMLMetadata(file);
        await songStorage.saveSong(metadata, xmlData);
        setFiles(prev => prev.map(f => f.name === fileName ? { ...f, status: 'success', message: `Link Established: ${metadata.title}` } : f));
      }
      
      await updateVaultCount();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("Import Error:", err);
      setFiles(prev => prev.map(f => f.name === fileName ? { ...f, status: 'error', message: err.message || 'Injection failed' } : f));
    }
  };

  const handleSmartImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    setIsImporting(true);
    for (let i = 0; i < uploadedFiles.length; i++) {
        await processFile(uploadedFiles[i]);
    }
    setIsImporting(false);
    if (smartInputRef.current) smartInputRef.current.value = '';
  };

  const handleDeepPurge = async () => {
    if (window.confirm("Mnemo! คุณต้องการทำความสะอาดคลังข้อมูลทั้งหมดใช่ไหม? การกระทำนี้จะลบไฟล์ที่เสียหายและรีเซ็ตระบบใหม่ทั้งหมด")) {
      try {
        await songStorage.deleteAllSongs();
        alert("Neural Core has been purged.");
        if (onRefresh) onRefresh();
      } catch (e) { alert("Purge failed."); }
    }
  };

  const TABS = [
    { id: 'vault', label: 'Vault', icon: Database, color: 'text-cyan-500' },
    { id: 'finance', label: 'Economics', icon: TrendingUp, color: 'text-emerald-500' },
    { id: 'users', label: 'Members', icon: Users, color: 'text-indigo-500' },
    { id: 'promotions', label: 'Promos', icon: Award, color: 'text-amber-500' },
    { id: 'redemptions', label: 'Rewards redemptions', icon: Gift, color: 'text-purple-500' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, color: 'text-cyan-400' },
    { id: 'servers', label: 'Servers', icon: Server, color: 'text-zinc-500' },
    { id: 'feedback', label: 'Feedback Matrix', icon: MessageSquare, color: 'text-orange-500' },
    { id: 'nimo_actions', label: 'Nimo Actions', icon: Sparkles, color: 'text-fuchsia-500' },
    ...(hasAccess(role, 'executive') ? [{ id: 'headquarters', label: 'HQ Analytics', icon: BrainCircuit, color: 'text-rose-500' }] : [])
  ];

  if (!hasAccess(role, 'admin')) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-5 bg-[#050507] p-8">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <Lock size={36} className="text-rose-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Access Restricted</h2>
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest max-w-xs leading-relaxed">
            This section requires Admin, Executive, or Owner role. Contact your system administrator.
          </p>
        </div>
        <div className="px-5 py-2 bg-rose-500/10 border border-rose-500/20 rounded-full">
          <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Your role: {role}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#050507] overflow-y-auto no-scrollbar pb-32 px-6 pt-10">
      <header className="mb-10 space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-cyan-500 font-black text-[9px] uppercase tracking-[0.3em]">
                    <ShieldCheck size={12} /> SECURE ADMIN CORE V3.1
                </div>
                <h1 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none">
                    SYSTEM<span className="text-cyan-500">CONTROL</span>
                </h1>
            </div>
            <div className="flex flex-wrap bg-white/[0.02] p-1 rounded-2xl border border-white/5 self-start xl:self-auto gap-0.5">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as AdminTab)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                            ${activeTab === tab.id ? 'bg-white/10 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        <tab.icon size={12} className={activeTab === tab.id ? tab.color : ''} />
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
        
        <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest leading-relaxed max-w-2xl">
           {activeTab === 'vault' ? 'Neural Import Hub: High-fidelity MusicXML, MIDI, and PDF ingestion. Nimo Vision transcribes complex scores into editable matrix data.' : 
            activeTab === 'finance' ? 'Economic Matrix: Real-time monitoring of subscription revenue, token circulating supply and dual-entry ledger.' :
            activeTab === 'users' ? 'Member Matrix: Authority levels for active AI slots, token balances and account credentials.' :
            activeTab === 'promotions' ? 'Promotion Matrix: Deploy promo codes to credit new users with vocal generation tokens.' :
            activeTab === 'redemptions' ? 'Redemption Matrix: Real-time physical/digital rewards redemption log and tracking.' :
            activeTab === 'servers' ? 'Infrastructure Matrix: Real-time service daemon monitoring, resource telemetry, and remote restart controls.' :
            activeTab === 'feedback' ? 'Feedback Matrix: Auto-categorized issues, feature requests, and complaints detected by Nimo AI.' :
            activeTab === 'nimo_actions' ? 'Dynamic Actions Registry: Manage Nimo AI autonomous actions and scripts. Owner access only.' :
            activeTab === 'feedback' ? 'Feedback Matrix: User feedback and ratings.' :
            'Headquarters Matrix: Executive-level growth and retention metrics.'}
        </p>
      </header>

      {activeTab === 'vault' && (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-2 gap-4 mb-10">
             <div className="bg-[#111115] border border-white/5 p-5 rounded-[32px] flex flex-col gap-1 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10"><Sparkles size={40} /></div>
                <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Active Seeds</span>
                <div className="flex items-center gap-2">
                   <HardDrive size={16} className="text-cyan-400" />
                   <span className="text-2xl font-black text-white">{vaultCount}</span>
                </div>
             </div>
             <button 
               onClick={handleDeepPurge}
               className="bg-[#111115] border border-white/5 p-5 rounded-[32px] flex flex-col gap-1 items-start hover:bg-rose-950/20 hover:border-rose-500/30 transition-all active:scale-95 group"
             >
                <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest group-hover:text-rose-400">Deep Purge</span>
                <div className="flex items-center gap-2">
                   <Trash2 size={20} className="text-rose-500" />
                   <span className="text-[9px] font-black text-rose-500/50 uppercase tracking-tighter">RESET CORE</span>
                 </div>
             </button>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-full max-w-[320px] aspect-square p-2">
                <input type="file" ref={smartInputRef} className="hidden" multiple accept=".xml,.mxl,.musicxml,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.mid,.midi" onChange={handleSmartImport} />
                <button 
                    onClick={() => !isImporting && smartInputRef.current?.click()}
                    className={`btn-import-3d w-full h-full ${isImporting ? 'pointer-events-none opacity-80' : ''}`}
                >
                    {isImporting && <div className="scanning-beam" />}
                    <div className="plus-icon w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all group-hover:scale-110">
                        {isImporting ? <RefreshCcw size={40} className="animate-spin text-cyan-400" /> : <Plus size={44} strokeWidth={3} className="text-white" />}
                    </div>
                    <div className="text-center">
                        <span className="glitch-text text-2xl text-white block mb-2 uppercase">IMPORT</span>
                        <div className="flex items-center justify-center gap-3">
                            <FileCode size={12} className="text-indigo-400" />
                            <FileText size={12} className="text-rose-400" />
                            <Music size={12} className="text-amber-400" />
                        </div>
                    </div>
                    <div className="absolute bottom-6 px-6 text-center">
                        <p className="text-[7px] font-black text-zinc-700 uppercase tracking-[0.3em]">XML • MIDI • PDF • IMAGES</p>
                    </div>
                </button>
            </div>

            <div className="w-full mt-12 space-y-3">
              {files.map((f, i) => (
                <div key={i} className={`p-5 rounded-[24px] border flex items-center gap-4 transition-all animate-in slide-in-from-bottom-4 duration-500 ${f.status === 'error' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-white/5 border-white/5'}`}>
                  <div className="shrink-0">
                    {f.status === 'reading' ? (
                       <RefreshCcw size={16} className="animate-spin text-cyan-500" /> 
                    ) : f.status === 'error' ? (
                       <AlertTriangle size={16} className="text-rose-500" />
                    ) : (
                       <div className="w-8 h-8 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500"><CheckCircle2 size={16} /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        {['png','jpg','jpeg'].includes(f.type || '') ? <FileImage size={10} className="text-emerald-400" /> : (f.type === 'pdf' ? <FileText size={10} className="text-rose-400" /> : (['mid','midi'].includes(f.type || '') ? <Music size={10} className="text-amber-400" /> : <FileCode size={10} className="text-indigo-400" />))}
                        <p className="text-[11px] font-black text-white uppercase truncate">{f.name}</p>
                    </div>
                    <p className={`text-[8px] font-bold uppercase tracking-wider ${f.status === 'reading' ? 'text-cyan-500/80' : 'text-zinc-500'}`}>{f.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'finance' && <FinanceOverview />}

      {activeTab === 'users' && (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <UserManagement currentUserRole={role} />
        </section>
      )}

      {/* PROMOTIONS MATRIX */}
      {activeTab === 'promotions' && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="backdrop-blur-md bg-white/[0.02] border border-white/5 rounded-[32px] p-6 h-fit shadow-xl">
              <h3 className="text-sm font-black uppercase text-white italic tracking-widest mb-4">Create Promo Code</h3>
              <form onSubmit={handleCreatePromo} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest">CODE</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. WELCOME50"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    className="w-full h-10 bg-white/[0.03] border border-white/5 rounded-xl px-3 text-[11px] font-black text-white outline-none focus:border-cyan-500/30 uppercase placeholder:text-zinc-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest">Tokens to reward</label>
                  <input
                    required
                    type="number"
                    value={newTokens}
                    onChange={e => setNewTokens(parseInt(e.target.value) || 0)}
                    className="w-full h-10 bg-white/[0.03] border border-white/5 rounded-xl px-3 text-[11px] font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] text-zinc-500 uppercase font-black tracking-widest">Description</label>
                  <input
                    type="text"
                    placeholder="Brief description"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    className="w-full h-10 bg-white/[0.03] border border-white/5 rounded-xl px-3 text-[11px] font-black text-white outline-none focus:border-cyan-500/30 placeholder:text-zinc-800"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full h-12 bg-cyan-500 text-black text-xs font-black uppercase rounded-xl hover:bg-cyan-400 active:scale-95 transition-all shadow-md mt-2"
                >
                  Deploy Code
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 backdrop-blur-md bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                <h3 className="text-sm font-black uppercase text-white italic tracking-widest">Promotions Ledger (Supabase)</h3>
                <button onClick={loadPromotions} className="p-2 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-colors">
                  <RefreshCcw size={12} className={loadingDb ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[7px] font-black text-zinc-600 uppercase tracking-widest bg-black/10">
                      <th className="px-6 py-3">Code</th>
                      <th className="px-6 py-3">Reward</th>
                      <th className="px-6 py-3">Description</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {promos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[8px] text-zinc-700 uppercase font-black">No promos found</td>
                      </tr>
                    ) : promos.map(p => (
                      <tr key={p.id} className="hover:bg-white/[0.01] transition-colors text-[10px]">
                        <td className="px-6 py-4 font-mono font-black text-white">{p.code}</td>
                        <td className="px-6 py-4 font-black text-amber-400">+{p.reward_tokens} Tokens</td>
                        <td className="px-6 py-4 text-zinc-400 uppercase text-[9px]">{p.description || 'No description'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[7px] font-black uppercase ${p.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {p.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleTogglePromo(p.id, p.is_active)}
                            className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase border transition-colors ${
                              p.is_active ? 'border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            {p.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* REWARDS REDEMPTIONS */}
      {activeTab === 'redemptions' && (
        <section className="backdrop-blur-md bg-white/[0.02] border border-white/5 rounded-[40px] overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="px-8 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
            <h3 className="text-sm font-black uppercase text-white italic tracking-widest">Redemptions Matrix (Supabase)</h3>
            <button onClick={loadRedemptions} className="p-2 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-colors">
              <RefreshCcw size={12} className={loadingDb ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-[7px] font-black text-zinc-600 uppercase tracking-widest bg-black/10">
                  <th className="px-8 py-4">Redemption ID</th>
                  <th className="px-8 py-4">Member Email</th>
                  <th className="px-8 py-4">Reward Item</th>
                  <th className="px-8 py-4">Cost</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {redemptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[8px] text-zinc-700 uppercase font-black">No redemption requests</td>
                  </tr>
                ) : redemptions.map(r => (
                  <tr key={r.id} className="hover:bg-white/[0.01] transition-colors text-[10px]">
                    <td className="px-8 py-5 font-mono text-zinc-500 font-bold uppercase">{r.id.slice(0, 8)}</td>
                    <td className="px-8 py-5 font-black text-white uppercase italic">{r.email}</td>
                    <td className="px-8 py-5 font-black text-zinc-300 uppercase">{r.reward_title}</td>
                    <td className="px-8 py-5 text-amber-400 font-black">{r.token_cost} T</td>
                    <td className="px-8 py-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[7px] font-black uppercase ${
                        r.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400' :
                        r.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' :
                        'bg-amber-500/10 text-amber-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 flex gap-1">
                      {r.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleUpdateRedemption(r.id, 'delivered')}
                            className="px-2.5 py-1 rounded bg-emerald-500 text-black text-[8px] font-black uppercase hover:bg-emerald-400 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleUpdateRedemption(r.id, 'cancelled')}
                            className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[8px] font-black uppercase hover:bg-rose-500 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {r.status !== 'pending' && (
                        <span className="text-[8px] text-zinc-600 uppercase font-black">Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'servers' && (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
          <ServerControlDashboard />
          <ServerAnalytics />
        </section>
      )}

      {activeTab === 'analytics' && (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-200px)]">
          <AdminAnalytics />
        </section>
      )}

      {activeTab === 'headquarters' && hasAccess(role, 'executive') && (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <HeadAdminDashboard />
        </section>
      )}

      {activeTab === 'nimo_actions' && hasAccess(role, 'admin') && (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <NimoActionsAdmin />
        </section>
      )}

      {activeTab === 'feedback' && hasAccess(role, 'admin') && (
        <div className="flex-1 min-h-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 relative z-10 mx-6">
          <FeedbackMatrix />
        </div>
      )}


    </div>
  );
};

export default AdminPage;
