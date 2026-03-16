import React, { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { EFFECT_LIBRARY } from '../../data/effects';
import { PluginDefinition } from '../../types';

interface PluginBrowserModalProps {
  onSelect: (plugin: PluginDefinition) => void;
  onClose: () => void;
}

const PluginBrowserModal: React.FC<PluginBrowserModalProps> = ({ onSelect, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState(EFFECT_LIBRARY[0].name);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLibrary = useMemo(() => {
    if (!searchQuery) return EFFECT_LIBRARY;
    const lowerCaseQuery = searchQuery.toLowerCase();
    return EFFECT_LIBRARY.map(category => ({
      ...category,
      plugins: category.plugins.filter(plugin =>
        plugin.name.toLowerCase().includes(lowerCaseQuery) ||
        plugin.description.toLowerCase().includes(lowerCaseQuery)
      ),
    })).filter(category => category.plugins.length > 0);
  }, [searchQuery]);

  const activeCategoryPlugins = filteredLibrary.find(c => c.name === selectedCategory)?.plugins || [];

  return (
    <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl h-[70vh] bg-[#111115] border border-white/10 rounded-[40px] shadow-2xl flex flex-col overflow-hidden">
        <header className="p-4 flex items-center justify-between border-b border-white/5 bg-black/30 shrink-0">
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Search Plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/5 rounded-full py-1.5 pl-8 pr-3 text-[9px] font-black text-white outline-none focus:border-cyan-500/30"
            />
          </div>
          <button onClick={onClose} className="p-2 text-zinc-600 hover:text-white bg-white/5 rounded-full">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <aside className="w-48 bg-black/20 border-r border-white/5 overflow-y-auto no-scrollbar p-2">
            <nav className="flex flex-col gap-1">
              {filteredLibrary.map(category => (
                <button
                  key={category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${selectedCategory === category.name ? 'bg-cyan-600/20 text-cyan-300' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`}
                >
                  {category.name}
                </button>
              ))}
            </nav>
          </aside>

          <main className="flex-1 overflow-y-auto no-scrollbar p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeCategoryPlugins.map(plugin => (
                <button
                  key={plugin.id}
                  onClick={() => onSelect(plugin)}
                  className="p-4 rounded-2xl bg-black/30 border border-white/5 flex flex-col gap-2 text-left group hover:bg-cyan-900/40 hover:border-cyan-500/50 transition-all"
                >
                  <h3 className="text-sm font-black text-white italic uppercase tracking-tighter group-hover:text-cyan-300">{plugin.name}</h3>
                  <p className="text-[9px] font-medium text-zinc-500 leading-relaxed flex-1">{plugin.description}</p>
                </button>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default PluginBrowserModal;
