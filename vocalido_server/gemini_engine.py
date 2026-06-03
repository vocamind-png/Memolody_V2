import os
import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import List, Optional
from dotenv import load_dotenv

# Load environment variables (like GEMINI_API_KEY) from .env
load_dotenv()

# Initialize Gemini Client
try:
    client = genai.Client()
    GENAI_AVAILABLE = True
    print("[Gemini] ✅ Google GenAI client initialized successfully.")
except Exception as e:
    print(f"[Gemini] ⚠️ Failed to initialize Google GenAI client: {e}")
    GENAI_AVAILABLE = False

class ChordProgression(BaseModel):
    chords: List[str] = Field(description="List of chords for the section, e.g. ['C', 'G', 'Am', 'F']")

class ArrangementResponse(BaseModel):
    style: str = Field(description="The applied musical style")
    bpm: int = Field(description="The suggested BPM for this arrangement")
    sections: List[ChordProgression] = Field(description="Chord progressions for each requested section")
    instruments: List[str] = Field(description="List of recommended instruments for this style")

def generate_arrangement(prompt: str, style: str, key: str, bpm: int, num_sections: int = 1) -> dict:
    if not GENAI_AVAILABLE:
        return {"error": "Gemini API is not configured or available. Please check GEMINI_API_KEY."}
        
    system_instruction = (
        "You are 'Nimo', an expert Agentic AI Arranger and Music Producer. "
        "Your task is to analyze the user's brief, style, key, and tempo, and generate a professional chord progression and arrangement plan. "
        "Return the result as a structured JSON object."
    )
    
    user_prompt = (
        f"Brief: {prompt}\n"
        f"Style: {style}\n"
        f"Key: {key}\n"
        f"Tempo: {bpm} BPM\n"
        f"Number of sections needed: {num_sections}\n\n"
        "Please generate the optimal chord progression and arrangement."
    )

    try:
        # Use gemini-3.1-pro for "Agentic AI" logic
        response = client.models.generate_content(
            model='gemini-3.1-pro',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=ArrangementResponse,
                temperature=0.2, # Low temp for logical arrangement
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"[Gemini] Error in generate_arrangement: {e}")
        return {"error": str(e)}

def generate_lyrics(prompt: str, melody_xml: str) -> dict:
    if not GENAI_AVAILABLE:
        return {"error": "Gemini API is not configured or available. Please check GEMINI_API_KEY."}
        
    system_instruction = (
        "You are an elite, award-winning lyricist. Your task is to write lyrics that perfectly match the emotion, theme, and rhythm described by the user. "
        "Be extremely creative, use beautiful metaphors, and ensure the lyrics are emotionally resonant."
    )
    
    user_prompt = (
        f"Theme / Brief:\n{prompt}\n\n"
        f"Melody Structure (Optional XML representation):\n{melody_xml}\n\n"
        "Write the full lyrics. Do not return JSON, just return the raw text of the lyrics with clear verse/chorus sections."
    )

    try:
        # Use gemini-3.5-high for "Creative AI"
        response = client.models.generate_content(
            model='gemini-3.5-high',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.9, # High temp for creativity
            ),
        )
        return {"lyrics": response.text}
    except Exception as e:
        print(f"[Gemini] Error in generate_lyrics: {e}")
        return {"error": str(e)}
