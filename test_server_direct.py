#!/usr/bin/env python3
"""Test: Send known-correct notes to RunPod server and save the audio."""
import requests
import json
import base64
import sys

SERVER = "https://u2txyroyplqko8-8888.proxy.runpod.net"
ENDPOINT = f"{SERVER}/studio/preview"

# Simple C major scale - Doh Re Mi Fa Sol La Ti Doh
test_notes = [
    {"midi": 60, "pitch": 60, "duration": 1.0, "startTime": 0.0, "lyric": "Doh"},
    {"midi": 62, "pitch": 62, "duration": 1.0, "startTime": 1.0, "lyric": "Re"},
    {"midi": 64, "pitch": 64, "duration": 1.0, "startTime": 2.0, "lyric": "Mi"},
    {"midi": 65, "pitch": 65, "duration": 1.0, "startTime": 3.0, "lyric": "Fah"},
    {"midi": 67, "pitch": 67, "duration": 1.0, "startTime": 4.0, "lyric": "Sol"},
    {"midi": 69, "pitch": 69, "duration": 1.0, "startTime": 5.0, "lyric": "Lah"},
    {"midi": 71, "pitch": 71, "duration": 1.0, "startTime": 6.0, "lyric": "Ti"},
    {"midi": 72, "pitch": 72, "duration": 1.0, "startTime": 7.0, "lyric": "Doh"},
]

payload = {
    "notes": test_notes,
    "song_id": "test_scale_direct",
    "song_key": "C",
    "bpm_pct": 100,
    "lyric_mode": "British Fixed Doh",
    "is_public": True,
    "owner_id": "",
    "params": {
        "singer": "default",
        "bpm": 120,
        "transpose": 0,
        "voice": "default",
        "return_stems": False,
        "collapse_chords": True,
        "steps": 100,
        "timing_feel": 50,
        "portamento": 80,
        "vibrato_start": 0.25,
        "vibrato_depth": 40,
        "vibrato_speed": 5.5
    }
}

print(f"🎤 Sending {len(test_notes)} notes to {ENDPOINT}")
print(f"📊 MIDI: {[n['midi'] for n in test_notes]}")
print(f"📊 Lyrics: {[n['lyric'] for n in test_notes]}")
print()

try:
    response = requests.post(ENDPOINT, json=payload, timeout=120)
    print(f"📥 HTTP {response.status_code}")
    
    data = response.json()
    print(f"📥 Engine: {data.get('engine', 'unknown')}")
    print(f"📥 Cached: {data.get('cached', False)}")
    print(f"📥 Notes: {data.get('notes', 'N/A')}")
    print(f"📥 Duration: {data.get('duration', 'N/A')}")
    print(f"📥 Saved URL: {data.get('saved_url', 'N/A')}")
    print(f"📥 Label: {data.get('label', 'N/A')}")
    
    if data.get('error'):
        print(f"❌ ERROR: {data['error']}")
        sys.exit(1)
    
    # Try to download and save audio
    if data.get('audio_b64'):
        audio_bytes = base64.b64decode(data['audio_b64'])
        ext = 'mp3' if 'mpeg' in data.get('mime_type', '') else 'wav'
        filename = f"/tmp/test_server_audio.{ext}"
        with open(filename, 'wb') as f:
            f.write(audio_bytes)
        print(f"✅ Saved audio: {filename} ({len(audio_bytes)} bytes)")
    elif data.get('saved_url'):
        audio_url = data['saved_url']
        if audio_url.startswith('/'):
            audio_url = f"{SERVER}{audio_url}"
        print(f"🔗 Audio URL: {audio_url}")
        audio_resp = requests.get(audio_url, timeout=30)
        if audio_resp.ok:
            filename = "/tmp/test_server_audio.mp3"
            with open(filename, 'wb') as f:
                f.write(audio_resp.content)
            print(f"✅ Downloaded audio: {filename} ({len(audio_resp.content)} bytes)")
        else:
            print(f"❌ Failed to download audio: HTTP {audio_resp.status_code}")
    else:
        print("⚠️ No audio_b64 or saved_url in response")
        print(f"Full response keys: {list(data.keys())}")
        
except requests.exceptions.ConnectionError as e:
    print(f"❌ Connection failed: {e}")
except requests.exceptions.Timeout:
    print("❌ Request timed out (120s)")
except Exception as e:
    print(f"❌ Error: {e}")
