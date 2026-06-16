import urllib.request
import urllib.error
import json
import os

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    with open(".env", "r") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                api_key = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                break

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key={api_key}"

prompt = "Make it pop"

system_instruction = (
    "You are an expert music arranger. The user will provide a musical brief or prompt. "
    f"The current key is C and time signature is 4/4. "
    "Generate a suitable chord progression (in Roman numerals like I IV V I, or standard chords like C F G C) "
    "and corresponding duration list (in beats, separated by spaces, like 1 1 1 1). "
    "Return ONLY a JSON object with 'chord_progression' and 'durations' keys. Do not include markdown formatting or extra text."
)

payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "systemInstruction": {"parts": [{"text": system_instruction}]},
    "generationConfig": {
        "responseMimeType": "application/json",
        "temperature": 0.7
    }
}

req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode("utf-8"))
        print(json.dumps(result, indent=2))
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'):
        print(e.read().decode("utf-8"))
