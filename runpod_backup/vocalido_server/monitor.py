import os, time, datetime
from collections import Counter

RENDER_DIR = "/app/memolody/vocalido_server/renders"

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

while True:
    if not os.path.exists(RENDER_DIR):
        print("Waiting for renders directory to be created...")
        time.sleep(2)
        continue

    files = [f for f in os.listdir(RENDER_DIR) if f.endswith('.mp3') and not 'stem' in f]
    
    total_renders = len(files)
    voices = Counter()
    songs = Counter()
    recent = []

    for f in files:
        mtime = os.path.getmtime(os.path.join(RENDER_DIR, f))
        recent.append((mtime, f))
        
        parts = f.replace('.mp3', '').split('_')
        if f.startswith('song_'):
            # song_owner_id_key_bpm_lyric_voice_tf.mp3
            if len(parts) >= 6:
                song_id = parts[2] if len(parts[2]) > 2 else "Unknown"
                voice = parts[-2]
                songs[song_id] += 1
                voices[voice] += 1
        elif f.startswith('render_'):
            songs["Quick Preview"] += 1

    recent.sort(reverse=True)
    
    clear_screen()
    print("="*50)
    print(" 🎤 VOCALIDO LIVE RENDER MONITOR 🎤 ".center(50))
    print("="*50)
    print(f"⏰ Time: {datetime.datetime.now().strftime('%H:%M:%S')}")
    print(f"📊 Total Renders Completed: {total_renders}")
    print("-" * 50)
    
    print("🌟 TOP VOICES USED:")
    for v, count in voices.most_common(3):
        print(f"  - {v}: {count} renders")
        
    print("\\n🎵 POPULAR SONGS/TESTS:")
    for s, count in songs.most_common(5):
        print(f"  - {s}: {count} renders")

    print("-" * 50)
    print("🕒 5 MOST RECENT RENDERS:")
    for mtime, f in recent[:5]:
        t_str = datetime.datetime.fromtimestamp(mtime).strftime('%H:%M:%S')
        name = f.split('_')[2][:15] if f.startswith('song_') and len(f.split('_')) > 2 else f[:15]
        print(f"  [{t_str}] {name}...")
        
    print("="*50)
    print("Updating every 3 seconds... (Press Ctrl+C to exit)")
    time.sleep(3)
