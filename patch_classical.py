import re

with open("components/Home/HomePage.tsx", "r") as f:
    content = f.read()

# Restore Top Classical Hits block
old_block = """      {/* Top 500 Classical Hits */}
      {topClassicalSongs.length > 0 && (
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between px-1">
            <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest italic">Top Classical Hits</span>
            <span className="text-[8px] font-mono text-rose-500/70">{topClassicalSongs.length} songs</span>
          </div>
          <div className="grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto overflow-y-auto no-scrollbar px-1 pb-2 max-h-[400px]">
            {topClassicalSongs.map((item, index) => (
              <div key={item.id} onClick={() => onSongSelect(item, undefined, 'listen')}
                className="shrink-0 w-[140px] flex flex-col gap-1.5 group/card cursor-pointer">"""

new_block = """      {/* Top 500 Classical Hits */}
      {topClassicalSongs.length > 0 && (
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between px-1">
            <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest italic">Top Classical Hits</span>
            <span className="text-[8px] font-mono text-rose-500/70">{topClassicalSongs.length} songs</span>
          </div>
          <div className="grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto overflow-y-auto no-scrollbar px-1 pb-2 max-h-[400px]">
            {topClassicalSongs.map((item, index) => (
              <div key={item.metadata.id} onClick={() => onSongSelect(item.metadata, item.xmlData, 'listen')}
                className="shrink-0 w-[140px] flex flex-col gap-1.5 group/card cursor-pointer">"""

content = content.replace(old_block, new_block)

# Also fix the title and artist for classical hits which got corrupted:
content = content.replace(
    """                {/* Title Area */}
                <div className="px-0.5">
                  <p className="text-[10px] leading-tight font-black text-white uppercase italic truncate">{item.title || 'Untitled Song'}</p>
                  <p className="text-[8px] leading-tight text-zinc-500 uppercase tracking-wider truncate mt-0.5">{item.artist || item.composer || 'Unknown Artist'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Matrix""",
    """                {/* Title Area */}
                <div className="px-0.5">
                  <p className="text-[10px] leading-tight font-black text-white uppercase italic truncate">{item.metadata.title || 'Untitled Song'}</p>
                  <p className="text-[8px] leading-tight text-zinc-500 uppercase tracking-wider truncate mt-0.5">{item.metadata.artist || item.metadata.composer || 'Unknown Artist'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Matrix"""
)

# And fix the play button onClick:
content = content.replace(
    """                  {/* Default small play button */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center justify-center pointer-events-none">
                    <div 
                      className="w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 group-hover/card:text-rose-400 group-hover/card:bg-rose-500/20 transition-colors pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSongSelect(item, undefined, 'play');
                      }}""",
    """                  {/* Default small play button */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center justify-center pointer-events-none">
                    <div 
                      className="w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 group-hover/card:text-rose-400 group-hover/card:bg-rose-500/20 transition-colors pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSongSelect(item.metadata, item.xmlData, 'play');
                      }}"""
)

# And fix favorite icon:
content = content.replace("item.isFavorite && <Heart", "item.metadata.isFavorite && <Heart")
content = content.replace("item.title || item.id", "item.metadata.title || item.metadata.id")


with open("components/Home/HomePage.tsx", "w") as f:
    f.write(content)
