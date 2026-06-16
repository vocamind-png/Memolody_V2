import urllib.request
import urllib.error
import json

url = "http://localhost:3100/vocalido/api/arrange"
payload = {
    "engine": "gemini",
    "leadMelody": [{"step": "C", "alter": 0, "octave": 4, "startTime": 0, "duration": 4}],
    "config": {
        "prompt": "Make it pop",
        "style": "Pop",
        "key": "C",
        "bpm": 120,
        "num_sections": 1,
        "is_simple_mode": False
    }
}
req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    print("Requesting...")
    with urllib.request.urlopen(req, timeout=120) as response:
        result = json.loads(response.read().decode("utf-8"))
        print(json.dumps(result, indent=2)[:500])
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'):
        print(e.read().decode("utf-8"))
