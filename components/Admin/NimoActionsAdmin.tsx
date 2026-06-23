import React, { useState, useEffect } from 'react';
import { Sparkles, Save, Plus, Trash2, Power, Code2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth, hasAccess } from '../../lib/useAuth';

interface DynamicAction {
  id: string;
  name: string;
  description: string;
  parameters: any;
  script: string;
  is_active: boolean;
}

const NimoActionsAdmin: React.FC = () => {
  const { role } = useAuth();
  const [actions, setActions] = useState<DynamicAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parameters, setParameters] = useState('{}');
  const [script, setScript] = useState('// Your JS code here\n// Accessible args: params, nimoBrain');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchActions();
  }, []);

  const fetchActions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('nimo_dynamic_actions')
        .select('*')
        .order('name');
      
      if (!error && data) {
        setActions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setParameters('{}');
    setScript('// Your JS code here\n// Accessible args: params, nimoBrain');
    setIsActive(true);
  };

  const handleEdit = (action: DynamicAction) => {
    setEditingId(action.id);
    setName(action.name);
    setDescription(action.description);
    setParameters(JSON.stringify(action.parameters, null, 2));
    setScript(action.script);
    setIsActive(action.is_active);
  };

  const handleSave = async () => {
    if (!name.trim() || !description.trim() || !script.trim()) {
      alert("Name, description, and script are required.");
      return;
    }
    
    let parsedParams = {};
    try {
      parsedParams = JSON.parse(parameters);
    } catch (e) {
      alert("Parameters must be valid JSON.");
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('nimo_dynamic_actions')
          .update({
            name: name.trim(),
            description: description.trim(),
            parameters: parsedParams,
            script: script,
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);
        
        if (error) throw error;
        alert("Action updated successfully!");
      } else {
        const { error } = await supabase
          .from('nimo_dynamic_actions')
          .insert({
            name: name.trim(),
            description: description.trim(),
            parameters: parsedParams,
            script: script,
            is_active: isActive
          });
        
        if (error) throw error;
        alert("Action created successfully!");
      }
      
      resetForm();
      fetchActions();
    } catch (e: any) {
      alert("Error saving action: " + e.message);
    }
  };

  const handleDelete = async (id: string, actionName: string) => {
    if (!window.confirm(`Are you sure you want to delete the action '${actionName}'?`)) return;
    try {
      const { error } = await supabase
        .from('nimo_dynamic_actions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchActions();
    } catch (e: any) {
      alert("Error deleting action: " + e.message);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('nimo_dynamic_actions')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      if (error) throw error;
      fetchActions();
    } catch (e: any) {
      alert("Error updating status: " + e.message);
    }
  };

  if (!hasAccess(role, 'admin')) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Editor Form */}
        <div className="lg:col-span-1 bg-white/[0.02] border border-white/5 rounded-2xl p-6 h-fit">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white font-black uppercase italic tracking-tighter flex items-center gap-2">
              <Code2 size={16} className="text-fuchsia-400" />
              {editingId ? 'Edit Action' : 'New Action'}
            </h2>
            {editingId && (
              <button onClick={resetForm} className="text-[10px] text-zinc-500 uppercase font-black hover:text-white transition-colors">
                Cancel
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1.5">Action Name (Key)</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="e.g. adjust_eq_bass"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/50 transition-colors font-mono"
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1.5">AI Description</label>
              <textarea 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                placeholder="Tell Nimo when and how to use this action..."
                className="w-full h-24 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/50 transition-colors resize-none"
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1.5">Parameters (JSON Schema)</label>
              <textarea 
                value={parameters} 
                onChange={e => setParameters(e.target.value)} 
                className="w-full h-24 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-emerald-400 placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/50 transition-colors font-mono resize-none"
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-1.5 flex justify-between">
                <span>Execution Script (JS)</span>
                <span className="text-zinc-600">params, nimoBrain</span>
              </label>
              <textarea 
                value={script} 
                onChange={e => setScript(e.target.value)} 
                className="w-full h-40 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-fuchsia-300 placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/50 transition-colors font-mono resize-none"
              />
            </div>
            
            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isActive} 
                  onChange={e => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded bg-white/5 border-white/10 text-fuchsia-500 focus:ring-fuchsia-500 focus:ring-offset-black"
                />
                <span className="text-xs text-zinc-400 uppercase font-black">Active</span>
              </label>
              
              <button 
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-fuchsia-500 hover:bg-fuchsia-400 text-black text-[10px] font-black uppercase rounded-xl shadow-[0_0_20px_rgba(217,70,239,0.2)] transition-all"
              >
                <Save size={14} /> {editingId ? 'Update Action' : 'Save New Action'}
              </button>
            </div>
          </div>
        </div>

        {/* Actions List */}
        <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white font-black uppercase italic tracking-tighter flex items-center gap-2">
              <Sparkles size={16} className="text-fuchsia-400" />
              Dynamic Action Registry
            </h2>
            <button onClick={fetchActions} className="text-[10px] text-zinc-500 hover:text-white uppercase font-black transition-colors">
              Refresh
            </button>
          </div>
          
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <p className="text-center py-10 text-xs text-zinc-600 font-bold uppercase tracking-widest animate-pulse">Loading Matrix...</p>
            ) : actions.length === 0 ? (
              <div className="text-center py-16 px-4 bg-black/40 rounded-xl border border-white/5">
                <Sparkles size={24} className="text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500 text-xs uppercase font-black tracking-widest mb-1">No dynamic actions found</p>
                <p className="text-[10px] text-zinc-600">Create one to teach Nimo new tricks automatically.</p>
              </div>
            ) : actions.map(action => (
              <div key={action.id} className={`p-4 rounded-xl border transition-colors ${editingId === action.id ? 'bg-fuchsia-500/10 border-fuchsia-500/30' : 'bg-black/40 border-white/5 hover:bg-white/[0.02]'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-mono text-white font-bold">{action.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${action.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {action.is_active ? 'Active' : 'Pending / Disabled'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 mb-3 leading-relaxed">{action.description}</p>
                    <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-500">
                      <span>{Object.keys(action.parameters).length} Params</span>
                      <span>{action.script.split('\n').length} Lines of Code</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={() => handleToggleStatus(action.id, action.is_active)}
                      className={`p-2 rounded-lg transition-colors ${action.is_active ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-zinc-600 hover:bg-zinc-800'}`}
                      title={action.is_active ? "Disable" : "Enable"}
                    >
                      <Power size={14} />
                    </button>
                    <button 
                      onClick={() => handleEdit(action)}
                      className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title="Edit Action"
                    >
                      <Code2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(action.id, action.name)}
                      className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Delete Action"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default NimoActionsAdmin;
