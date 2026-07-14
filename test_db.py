import os
import sys
sys.path.append(os.path.abspath('vocalido_server'))
from vocalido_server.main import supabase

res = supabase.table('rendered_vocals').select('song_id, song_key').execute()
data = res.data
print(f"Total rows: {len(data)}")
grouped = {}
for row in data:
    sid = row['song_id']
    grouped.setdefault(sid, set()).add(row['song_key'])

for sid, keys in grouped.items():
    print(f"{sid}: {len(keys)} keys")
