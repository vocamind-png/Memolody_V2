import os
import urllib.request
import json

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    with open(".env", "r") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                api_key = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                break

if api_key:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            models = [m['name'] for m in data.get('models', []) if 'gemini' in m['name'].lower()]
            print("Available models:")
            for m in models:
                print(m)
    except Exception as e:
        print(f"Error: {e}")
else:
    print("No API key found.")
