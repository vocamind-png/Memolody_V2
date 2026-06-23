import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MessageSquare, Bug, Lightbulb, ThumbsUp, AlertTriangle, RefreshCcw, Trash2, CheckCircle2 } from 'lucide-react';

interface Feedback {
  id: string;
  user_email: string | null;
  category: 'bug' | 'feature_request' | 'complaint' | 'praise' | 'other';
  title: string;
  content: string;
  sentiment_score: number;
  urgency_level: number;
  similar_count: number;
  status: 'open' | 'investigating' | 'resolved' | 'ignored';
  created_at: string;
}

const FeedbackMatrix: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('nimo_feedback')
        .select('*')
        .order('urgency_level', { ascending: false })
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setFeedbacks(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('nimo_feedback')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status: newStatus as any } : f));
    } catch (e) {
      alert("Update failed: " + (e as any).message);
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'bug': return <Bug size={14} className="text-rose-500" />;
      case 'feature_request': return <Lightbulb size={14} className="text-amber-500" />;
      case 'complaint': return <AlertTriangle size={14} className="text-orange-500" />;
      case 'praise': return <ThumbsUp size={14} className="text-emerald-500" />;
      default: return <MessageSquare size={14} className="text-blue-500" />;
    }
  };

  const getSentimentColor = (score: number) => {
    if (score < -0.5) return 'text-rose-500';
    if (score < 0) return 'text-orange-500';
    if (score > 0.5) return 'text-emerald-500';
    return 'text-zinc-400';
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-6 rounded-[32px] backdrop-blur-md">
        <div>
          <h2 className="text-xl font-black text-white uppercase italic tracking-widest">Feedback Matrix</h2>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">
            Auto-categorized issues & feature requests detected by Nimo AI
          </p>
        </div>
        <button onClick={fetchFeedback} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors">
          <RefreshCcw size={16} className={`text-cyan-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {feedbacks.map(f => (
          <div key={f.id} className="bg-white/[0.02] border border-white/5 rounded-[24px] p-6 hover:bg-white/[0.04] transition-all relative overflow-hidden">
            {/* Urgency indicator */}
            <div className={`absolute top-0 left-0 w-1 h-full ${f.urgency_level >= 8 ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]' : f.urgency_level >= 5 ? 'bg-amber-500' : 'bg-cyan-500'}`} />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pl-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-[9px] font-black uppercase tracking-widest">
                    {getCategoryIcon(f.category)}
                    <span>{f.category.replace('_', ' ')}</span>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-wider ${f.status === 'open' ? 'text-rose-400' : f.status === 'investigating' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    • {f.status}
                  </span>
                  {f.similar_count > 1 && (
                    <span className="text-[10px] font-bold text-rose-300 bg-rose-500/20 px-2 rounded-full">
                      {f.similar_count} occurrences
                    </span>
                  )}
                </div>
                
                <h3 className="text-lg font-bold text-white">{f.title}</h3>
                <p className="text-sm text-zinc-400 line-clamp-2">{f.content}</p>
                
                <div className="flex items-center gap-4 text-[10px] uppercase font-black tracking-widest pt-2">
                  <span className="text-zinc-500">By: <span className="text-zinc-300">{f.user_email || 'Anonymous'}</span></span>
                  <span className="text-zinc-500">Urgency: <span className={f.urgency_level >= 8 ? 'text-rose-500' : 'text-zinc-300'}>{f.urgency_level}/10</span></span>
                  <span className="text-zinc-500">Sentiment: <span className={getSentimentColor(f.sentiment_score)}>{f.sentiment_score > 0 ? '+' : ''}{f.sentiment_score}</span></span>
                  <span className="text-zinc-600">{new Date(f.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-row lg:flex-col gap-2 shrink-0">
                {f.status !== 'resolved' && (
                  <button onClick={() => updateStatus(f.id, 'resolved')} className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                    <CheckCircle2 size={14} /> Resolve
                  </button>
                )}
                {f.status !== 'investigating' && f.status !== 'resolved' && (
                  <button onClick={() => updateStatus(f.id, 'investigating')} className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                    <AlertTriangle size={14} /> Investigate
                  </button>
                )}
                {f.status !== 'ignored' && (
                  <button onClick={() => updateStatus(f.id, 'ignored')} className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                    <Trash2 size={14} /> Ignore
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {feedbacks.length === 0 && !loading && (
          <div className="text-center py-12 text-zinc-500 text-sm font-bold uppercase tracking-widest">
            No feedback found in the matrix
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackMatrix;
