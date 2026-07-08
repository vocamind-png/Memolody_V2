import re

with open("components/Home/HomePage.tsx", "r") as f:
    content = f.read()

# Fix BGM logic
if "minuet_in_g.ogg" not in content:
    # Add audio element at the top level
    content = content.replace("return (", "return (\n    <>\n      <audio id=\"bgmAudio\" loop src=\"/audio/minuet_in_g.ogg\" preload=\"auto\" />")
    content = content.replace("export default function HomePage", "export default function HomePage")
    # Where does it set isProcessing/isUploading?
    # I'll just find all places setting isImporting
    
# Fix Top Charts Matrix click and layout
content = content.replace(
    '          <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-2">\n            {topSongs.map((item, index) => (\n              <div key={item.song_id} onClick={() => {\n                const songItem = userLibrary.find(s => s.metadata.id === item.song_id);\n                if (songItem) onSongSelect(songItem.metadata, songItem.xmlData, \'listen\');\n              }}',
    '          <div className="grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto overflow-y-auto no-scrollbar px-1 pb-2 max-h-[400px]">\n            {topSongs.map((item, index) => (\n              <div key={item.song_id} onClick={() => {\n                const songItem = userLibrary.find(s => s.metadata.id === item.song_id) || CLASSICAL_SCORES.find(s => s.metadata.id === item.song_id);\n                if (songItem) {\n                  onSongSelect(songItem.metadata, songItem.xmlData, \'listen\');\n                } else {\n                  alert(\'Song XML not available locally. Please import it first.\');\n                }\n              }}'
)

# Fix Top Classical Hits layout
content = content.replace(
    '      {topClassicalSongs.length > 0 && (\n        <div className="space-y-2 mb-6">\n          <div className="flex items-center justify-between px-1">\n            <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest italic">Top Classical Hits</span>\n            <span className="text-[8px] font-mono text-rose-500/70">{topClassicalSongs.length} songs</span>\n          </div>\n          <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-2">',
    '      {topClassicalSongs.length > 0 && (\n        <div className="space-y-2 mb-6">\n          <div className="flex items-center justify-between px-1">\n            <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest italic">Top Classical Hits</span>\n            <span className="text-[8px] font-mono text-rose-500/70">{topClassicalSongs.length} songs</span>\n          </div>\n          <div className="grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto overflow-y-auto no-scrollbar px-1 pb-2 max-h-[400px]">'
)

with open("components/Home/HomePage.tsx", "w") as f:
    f.write(content)

