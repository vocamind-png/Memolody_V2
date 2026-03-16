import React, { useState } from 'react';
import { CalendarDays, Clock, Play, Plus, Trash2, Edit3, Target } from 'lucide-react';

interface PracticeRoutine {
    id: string;
    name: string;
    startBar: number;
    endBar: number;
    color: string;
    schedule: string; // e.g., "Mon, Wed, Fri 18:00"
    durationMinutes: number;
}

const MemoPractice: React.FC<{
    totalBars?: number;
    onActivateLoop?: (startBar: number, endBar: number, color: string) => void;
    currentBar?: number;
}> = ({ totalBars = 100, onActivateLoop, currentBar = 1 }) => {
    const [routines, setRoutines] = useState<PracticeRoutine[]>([
        { id: '1', name: 'Intro Arpeggio', startBar: 1, endBar: 8, color: '#00e5ff', schedule: 'Everyday 18:00', durationMinutes: 15 },
        { id: '2', name: 'Chorus Syncopation', startBar: 33, endBar: 40, color: '#f472b6', schedule: 'Tue, Thu 19:30', durationMinutes: 30 },
    ]);

    const [isCreating, setIsCreating] = useState(false);
    const [newRoutine, setNewRoutine] = useState<Partial<PracticeRoutine>>({
        name: '', startBar: 1, endBar: 4, color: '#00e5ff', schedule: '', durationMinutes: 15
    });

    const colors = ['#00e5ff', '#f472b6', '#a855f7', '#2dd4bf', '#fbbf24'];

    const handleCreate = () => {
        if (newRoutine.name && newRoutine.startBar && newRoutine.endBar) {
            setRoutines([...routines, { ...newRoutine, id: Date.now().toString() } as PracticeRoutine]);
            setIsCreating(false);
            setNewRoutine({ name: '', startBar: 1, endBar: 4, color: '#00e5ff', schedule: '', durationMinutes: 15 });
        }
    };

    const deleteRoutine = (id: string) => {
        setRoutines(routines.filter(r => r.id !== id));
    };

    const playRoutine = (r: PracticeRoutine) => {
        if (onActivateLoop) {
            onActivateLoop(r.startBar, r.endBar, r.color);
        }
    };

    return (
        <div className="w-full h-full flex flex-col p-6 overflow-y-auto no-scrollbar pb-32">
            <div className="max-w-4xl w-full mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-end justify-between border-b border-white/10 pb-4">
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter flex items-center gap-3">
                            <Target className="text-cyan-400" size={32} /> Memo Practice
                        </h2>
                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs mt-2">
                            Strategic loop scheduling & mastery tracking
                        </p>
                    </div>
                    <button
                        onClick={() => setIsCreating(!isCreating)}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                    >
                        <Plus size={14} /> New Routine
                    </button>
                </div>

                {/* Create/Edit Panel */}
                {isCreating && (
                    <div className="bg-[#121215] border border-cyan-500/30 rounded-[24px] p-6 shadow-2xl animate-in slide-in-from-top-4">
                        <h3 className="text-white font-black uppercase text-sm mb-4">Define Practice Loop</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Routine Name</label>
                                    <input
                                        type="text"
                                        value={newRoutine.name}
                                        onChange={(e) => setNewRoutine({ ...newRoutine, name: e.target.value })}
                                        placeholder="e.g. Difficult Solo Section"
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none transition-all"
                                    />
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Start Bar</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={newRoutine.startBar}
                                            onChange={(e) => setNewRoutine({ ...newRoutine, startBar: parseInt(e.target.value) })}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xl font-mono text-center text-white focus:border-cyan-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">End Bar</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={newRoutine.endBar}
                                            onChange={(e) => setNewRoutine({ ...newRoutine, endBar: parseInt(e.target.value) })}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xl font-mono text-center text-white focus:border-cyan-500 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Highlight Color</label>
                                    <div className="flex gap-3">
                                        {colors.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setNewRoutine({ ...newRoutine, color: c })}
                                                className={`w-8 h-8 rounded-full border-2 transition-all ${newRoutine.color === c ? 'border-white scale-110 shadow-[0_0_10px_currentColor]' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                                style={{ backgroundColor: c, color: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Schedule (Optional)</label>
                                    <div className="relative">
                                        <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                        <input
                                            type="text"
                                            value={newRoutine.schedule}
                                            onChange={(e) => setNewRoutine({ ...newRoutine, schedule: e.target.value })}
                                            placeholder="e.g. Mon, Wed, Fri 18:00"
                                            className="w-full bg-black/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Duration (Minutes)</label>
                                    <div className="relative">
                                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                        <input
                                            type="number"
                                            value={newRoutine.durationMinutes}
                                            onChange={(e) => setNewRoutine({ ...newRoutine, durationMinutes: parseInt(e.target.value) })}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end gap-3">
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        className="px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={!newRoutine.name}
                                        className="bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-black px-8 py-3 rounded-full font-black text-[12px] uppercase tracking-widest shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all hover:scale-105"
                                    >
                                        Save Routine
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Routines List */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {routines.map(r => (
                        <div key={r.id} className="bg-[#121215] border border-white/5 hover:border-white/20 rounded-[20px] p-5 transition-all group overflow-hidden relative">
                            <div
                                className="absolute left-0 top-0 bottom-0 w-1 opacity-50 group-hover:opacity-100 transition-opacity"
                                style={{ backgroundColor: r.color }}
                            />

                            <div className="flex justify-between items-start mb-4 pl-3">
                                <div>
                                    <h4 className="text-white font-black text-lg">{r.name}</h4>
                                    <div className="flex items-center gap-3 mt-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                                        <span className="flex items-center gap-1.5"><Target size={12} /> Bar {r.startBar} - {r.endBar}</span>
                                        <span className="flex items-center gap-1.5"><Clock size={12} /> {r.durationMinutes}m</span>
                                    </div>
                                    {r.schedule && (
                                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-400 font-medium">
                                            <CalendarDays size={10} /> {r.schedule}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
                                        <Edit3 size={14} />
                                    </button>
                                    <button onClick={() => deleteRoutine(r.id)} className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-between pl-3">
                                {/* Visual Loop Representation */}
                                <div className="flex-1 h-2 bg-black rounded-full relative overflow-hidden mr-6">
                                    {/* Total track background */}
                                    <div
                                        className="absolute h-full rounded-full opacity-60"
                                        style={{
                                            backgroundColor: r.color,
                                            left: `${Math.max(0, (r.startBar / totalBars) * 100)}%`,
                                            width: `${Math.max(1, ((r.endBar - r.startBar + 1) / totalBars) * 100)}%`
                                        }}
                                    />
                                    {/* Current playback indicator (if within loop) */}
                                    {currentBar >= r.startBar && currentBar <= r.endBar && (
                                        <div
                                            className="absolute h-full w-1 bg-white shadow-[0_0_8px_#fff]"
                                            style={{ left: `${(currentBar / totalBars) * 100}%` }}
                                        />
                                    )}
                                </div>

                                <button
                                    onClick={() => playRoutine(r)}
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-black shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 active:scale-95"
                                    style={{ backgroundColor: r.color }}
                                >
                                    <Play size={16} fill="black" className="ml-1" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {routines.length === 0 && !isCreating && (
                        <div className="col-span-full py-12 text-center text-zinc-500 border border-dashed border-white/10 rounded-[24px]">
                            <Target className="mx-auto mb-4 opacity-50" size={32} />
                            <p className="font-bold uppercase tracking-widest text-xs">No practice routines defined.</p>
                            <p className="text-[10px] mt-2 max-w-sm mx-auto opacity-70">Define specific measure loops to focus your daily practice sessions.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MemoPractice;
