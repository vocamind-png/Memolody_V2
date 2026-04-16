import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

interface CreditInfo {
  available: number;
  monthly: number;
  used: number;
  usedPercentage: number;
  remainingPercentage: number;
  isUnlimited: boolean;
  planQuotaSource: string;
}

const CreditsCard: React.FC = () => {
  const [credits, setCredits] = useState<CreditInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const res = await fetch('/vocalido/api/credits/status');
        if (!res.ok) throw new Error('Failed to fetch credits');
        const data = await res.json();
        setCredits(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCredits();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-400">
        <Loader2 className="animate-spin" size={16} /> Loading credits...
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-sm">⚠️ {error}</div>;
  }

  if (!credits) return null;

  return (
    <div className="p-6 rounded-[28px] bg-cyan-500/10 border border-cyan-500/30">
      <div className="flex items-center gap-3 mb-4">
        <CreditCard size={20} className="text-cyan-400" />
        <h3 className="text-sm font-black uppercase text-white">AI Credits</h3>
      </div>
      <p className="text-[10px] text-zinc-200 mb-2">
        Available: <span className="font-mono">{credits.available}</span> / {credits.monthly}
      </p>
      <p className="text-[10px] text-zinc-200">
        Used: <span className="font-mono">{credits.used}</span> ({credits.usedPercentage}%)
      </p>
    </div>
  );
};

export default CreditsCard;
