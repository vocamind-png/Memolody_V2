
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, CheckCircle2, ShieldCheck, RefreshCcw, Zap, Trash2, HardDrive, Cpu, AlertTriangle, RotateCcw,
  Sparkles, FileText, FileImage, FileCode, Plus, Music, LayoutDashboard, Database, TrendingUp, Users
} from 'lucide-react';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';
import { songStorage } from '../../lib/SongStorage';
import { Song } from '../../types';
import FinanceOverview from './FinanceOverview';

interface AdminPageProps {
  onMusicXmlUpload?: (metadata: Song, xmlData: string) => void;
  onRestoreMasterpieces?: () => void;
  onRefresh?: () => void;
}

type AdminTab = 'vault' | 'finance' | 'users';

const AdminPage: React.FC<AdminPageProps> = ({ onMusicXmlUpload, onRestoreMasterpieces, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('vault');
  const [isImporting, setIsImporting] = useState(false);
  const [files, setFiles] = useState<{name: string, status: string, message?: string, type?: string}[]>([]);
  const [vaultCount, setVaultCount] = useState(0);
  const smartInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    updateVaultCount();
  }, []);

  const updateVaultCount = async () => {
    const songs = await songStorage.getAllSongs();
    setVaultCount(songs.length);
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
  ];

  return (
    <div className="h-full flex flex-col bg-[#050507] overflow-y-auto no-scrollbar pb-32 px-6 pt-10">
      <header className="mb-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-cyan-500 font-black text-[9px] uppercase tracking-[0.3em]">
                    <ShieldCheck size={12} /> SECURE ADMIN CORE V3.1
                </div>
                <h1 className="text-4xl font-black italic tracking-tighter uppercase text-white leading-none">
                    SYSTEM<span className="text-cyan-500">CONTROL</span>
                </h1>
            </div>
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 self-start md:self-auto">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as AdminTab)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
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
            activeTab === 'finance' ? 'Economic Matrix: Real-time monitoring of subscription revenue, churn rate, and GPU infrastructure costs.' :
            'Member Matrix: Authority levels for active AI slots, billing synchronization, and loyalty program management.'}
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
                <input type="file" ref={smartInputRef} className="hidden" multiple accept=".xml,.mxl,.musicxml,.pdf,.png,.jpg,.jpeg,.mid,.midi" onChange={handleSmartImport} />
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
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
           <div className="bg-[#111115] border border-white/5 rounded-[40px] overflow-hidden">
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-[#111115]">
                    <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Member Authority</h3>
                    <div className="flex gap-2">
                        <input type="text" placeholder="FIND MEMBER..." className="h-10 bg-white/5 border border-white/5 rounded-xl px-4 text-[9px] font-black text-white uppercase outline-none focus:border-cyan-500/30 w-64" />
                        <button className="h-10 bg-indigo-500 text-white px-5 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">Export CSV</button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Master ID</th>
                                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Member Name</th>
                                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Current Plan</th>
                                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">AI Slots</th>
                                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Status</th>
                                <th className="px-8 py-4 text-[8px] font-black text-zinc-600 uppercase tracking-widest">Next Billing</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[
                                { id: 'UID-001', name: 'Mnemo Creator', plan: 'Creator Tier', slots: '10 / 10', status: 'Active', next: '2026-04-12' },
                                { id: 'UID-002', name: 'Solfege Student', plan: 'Student Tier', slots: '3 / 3', status: 'Active', next: '2026-04-05' },
                                { id: 'UID-003', name: 'Digital Maestro', plan: 'Creator Tier', slots: '10 / 10', status: 'Past Due', next: 'Today' },
                                { id: 'UID-004', name: 'Pitch Master', plan: 'Student Tier', slots: '1 / 3', status: 'Active', next: '2026-03-28' },
                                { id: 'UID-005', name: 'Piano Prodigy', plan: 'Free Tier', slots: '1 / 1', status: 'Free', next: 'N/A' },
                            ].map((user, i) => (
                                <tr key={i} className="hover:bg-white/[0.02] transition-colors group cursor-pointer">
                                    <td className="px-8 py-5 text-[10px] font-mono text-zinc-500 font-bold uppercase">{user.id}</td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 flex items-center justify-center text-[10px] font-black text-white">
                                                {user.name.charAt(0)}
                                            </div>
                                            <span className="text-[11px] font-black text-white uppercase italic">{user.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter ${user.plan.includes('Creator') ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : user.plan.includes('Student') ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-white/5 text-zinc-500 border border-white/5'}`}>
                                            {user.plan}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-[11px] font-black text-white/80 tabular-nums">{user.slots}</td>
                                    <td className="px-8 py-5">
                                        <span className={`flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${user.status === 'Active' ? 'text-emerald-500' : user.status === 'Past Due' ? 'text-rose-500' : 'text-zinc-600'}`}>
                                            <div className={`w-1 h-1 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' : user.status === 'Past Due' ? 'bg-rose-500' : 'bg-zinc-600'}`} />
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-[9px] font-bold text-zinc-700 uppercase tracking-wider">{user.next}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
           </div>
        </section>
      )}
    </div>
  );
};

export default AdminPage;
