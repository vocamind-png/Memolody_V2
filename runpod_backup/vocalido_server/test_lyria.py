import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    for m in genai.list_models():
        if "lyria" in m.name.lower() or "audio" in m.name.lower():
            print(m.name)
    print("Done listing.")
else:
    print("No GEMINI_API_KEY found.")
