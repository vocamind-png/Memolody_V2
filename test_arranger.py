import urllib.request
import urllib.error
import json
import os

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    with open(".env", "r") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                api_key = line.strip().split("=", 1)[1].strip('"\'')
                break

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    result = json.loads(response.read().decode("utf-8"))
    for m in result.get("models", []):
        if "gemini" in m["name"]:
            print(m["name"])
