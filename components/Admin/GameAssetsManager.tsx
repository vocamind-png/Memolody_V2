import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, Plus, Trash2, Save, Image as ImageIcon, Music, RefreshCw, X } from 'lucide-react';

export interface GameTheme {
  id: string;
  theme_id: string;
  title: string;
  subtitle: string;
  icon_name: string;
  color_class: string;
  gradient_class: string;
  image_url: string;
  bgm_url?: string;
  sfx_urls?: string[];
  is_active: boolean;
}

export const GameAssetsManager: React.FC = () => {
  const [themes, setThemes] = useState<GameTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<GameTheme>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('game_themes')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching themes:', error);
    } else {
      setThemes(data || []);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'image_url' | 'bgm_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${field === 'image_url' ? 'images' : 'audio'}/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('game-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('game-assets')
        .getPublicUrl(filePath);

      setEditForm(prev => ({ ...prev, [field]: urlData.publicUrl }));
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Ensure you have admin permissions and the bucket exists.');
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = async () => {
    if (!editForm.theme_id || !editForm.title) {
      alert('Theme ID and Title are required');
      return;
    }

    try {
      if (editingId === 'new') {
        const { error } = await supabase.from('game_themes').insert([editForm]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('game_themes')
          .update(editForm)
          .eq('id', editingId);
        if (error) throw error;
      }
      
      setEditingId(null);
      setEditForm({});
      fetchThemes();
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save theme.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this theme?')) return;
    try {
      const { error } = await supabase.from('game_themes').delete().eq('id', id);
      if (error) throw error;
      fetchThemes();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white">Game Themes & Assets</h3>
        <button 
          onClick={() => { setEditingId('new'); setEditForm({ is_active: true }); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Theme
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {themes.map(theme => (
            <div key={theme.id} className={`bg-gray-800/80 border ${theme.is_active ? 'border-gray-700' : 'border-red-900/50 opacity-70'} rounded-xl overflow-hidden`}>
              <div 
                className="h-32 bg-cover bg-center relative" 
                style={{ backgroundImage: `url(${theme.image_url})` }}
              >
                <div className={`absolute inset-0 bg-gradient-to-r ${theme.gradient_class} opacity-80`}></div>
                <div className="absolute inset-0 p-4 flex flex-col justify-end">
                  <h4 className="text-lg font-bold text-white">{theme.title}</h4>
                  <p className="text-sm text-gray-200">{theme.subtitle}</p>
                </div>
              </div>
              <div className="p-4 flex justify-between items-center bg-gray-800">
                <div className="flex items-center space-x-4">
                  {theme.bgm_url ? (
                    <span className="flex items-center text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                      <Music className="w-3 h-3 mr-1" /> BGM Added
                    </span>
                  ) : (
                    <span className="flex items-center text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                      <Music className="w-3 h-3 mr-1" /> No BGM
                    </span>
                  )}
                  {!theme.is_active && (
                    <span className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded">Inactive</span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => { setEditingId(theme.id); setEditForm(theme); }}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(theme.id)}
                    className="p-2 bg-red-900/30 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">
                {editingId === 'new' ? 'Create New Theme' : 'Edit Theme'}
              </h3>
              <button onClick={() => { setEditingId(null); setEditForm({}); }} className="text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Theme ID (e.g. space, forest)</label>
                  <input type="text" value={editForm.theme_id || ''} onChange={e => setEditForm({...editForm, theme_id: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Icon Name (Lucide React)</label>
                  <input type="text" value={editForm.icon_name || ''} onChange={e => setEditForm({...editForm, icon_name: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                  <input type="text" value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Subtitle</label>
                  <input type="text" value={editForm.subtitle || ''} onChange={e => setEditForm({...editForm, subtitle: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Color Class</label>
                  <input type="text" value={editForm.color_class || ''} onChange={e => setEditForm({...editForm, color_class: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" placeholder="text-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Gradient Class</label>
                  <input type="text" value={editForm.gradient_class || ''} onChange={e => setEditForm({...editForm, gradient_class: e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white" placeholder="from-indigo-600/40 to-purple-900/60" />
                </div>
              </div>

              <div className="space-y-2 p-4 bg-gray-900 rounded-lg border border-gray-700">
                <label className="block text-sm font-medium text-gray-300">Background Image URL</label>
                <div className="flex space-x-2">
                  <input type="text" value={editForm.image_url || ''} onChange={e => setEditForm({...editForm, image_url: e.target.value})} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                  <label className="bg-indigo-600 hover:bg-indigo-500 cursor-pointer text-white px-4 py-2 rounded-lg flex items-center transition-colors whitespace-nowrap">
                    {uploadingField === 'image_url' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploadingField === 'image_url' ? 'Uploading...' : 'Upload Image'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, 'image_url')} disabled={!!uploadingField} />
                  </label>
                </div>
                {editForm.image_url && (
                  <div className="mt-2 h-24 bg-cover bg-center rounded" style={{ backgroundImage: `url(${editForm.image_url})` }}></div>
                )}
              </div>

              <div className="space-y-2 p-4 bg-gray-900 rounded-lg border border-gray-700">
                <label className="block text-sm font-medium text-gray-300">Background Music (BGM) URL</label>
                <div className="flex space-x-2">
                  <input type="text" value={editForm.bgm_url || ''} onChange={e => setEditForm({...editForm, bgm_url: e.target.value})} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                  <label className="bg-emerald-600 hover:bg-emerald-500 cursor-pointer text-white px-4 py-2 rounded-lg flex items-center transition-colors whitespace-nowrap">
                    {uploadingField === 'bgm_url' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploadingField === 'bgm_url' ? 'Uploading...' : 'Upload Audio'}
                    <input type="file" accept="audio/*" className="hidden" onChange={e => handleFileUpload(e, 'bgm_url')} disabled={!!uploadingField} />
                  </label>
                </div>
                {editForm.bgm_url && (
                  <audio controls src={editForm.bgm_url} className="w-full mt-2 h-8" />
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  id="is_active" 
                  checked={editForm.is_active || false} 
                  onChange={e => setEditForm({...editForm, is_active: e.target.checked})}
                  className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-indigo-500 focus:ring-indigo-500" 
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-300">Theme is active and visible to users</label>
              </div>

            </div>

            <div className="mt-8 flex justify-end space-x-3">
              <button 
                onClick={() => { setEditingId(null); setEditForm({}); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center transition-colors"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Theme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
