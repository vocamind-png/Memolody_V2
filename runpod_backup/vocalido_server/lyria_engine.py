import os
from google import genai
import concurrent.futures

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)

def _get_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        api_key = line.split("=")[1].strip().strip('"').strip("'")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment.")
    return api_key

import json

def analyze_melody_for_blueprint(abc_data: str, key: str, bpm: int, style: str) -> dict:
    """
    Uses Gemini text model to analyze the melody and create a Musical Arranger Blueprint + Chords ABC.
    """
    api_key = _get_api_key()
    client = genai.Client(api_key=api_key)
    
    prompt = f"""
You are a Master Music Theorist and Arranger. I need you to analyze the following melody (provided in ABC Notation).

Melody Key: {key}
Tempo: {bpm} BPM
Requested Style: {style}

Melody ABC Notation:
{abc_data}

Instructions:
1. Analyze the melody's contour, rhythm, and implied phrasing.
2. Design a beautiful, cohesive Chord Progression that perfectly fits the melody and strongly reflects the requested style ({style}).
3. Determine the structural dynamics (where should the arrangement build up, where should it be sparse).
4. Outline the instrumentation roles and rhythmic feel.
5. STRICT TIMELINE: You MUST output a precise, measure-by-measure timeline of chords and structural changes.

CRITICAL OUTPUT FORMAT:
You must output ONLY a valid JSON object with no markdown formatting. The JSON object must have exactly one key:
- "blueprint": A highly descriptive string containing the arranger blueprint and the strict measure-by-measure chord timeline.

Output only the JSON object.
"""
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt],
            config={"response_mime_type": "application/json"}
        )
        data = json.loads(response.text)
        return data
    except Exception as e:
        print(f"[Blueprint Error] {e}")
        return {
            "blueprint": "Blueprint generation failed, proceed with generic arrangement based on the melody."
        }

def generate_lyria_audio(melody_abc: str, style_prompt: str, blueprint: str = "", lyrics: str = "") -> bytes:
    """
    Calls Google Lyria-3-Pro-Preview using the correct google-genai library
    and returns the raw audio bytes (MP3).
    """
    api_key = _get_api_key()
    client = genai.Client(api_key=api_key)
    
    # Check if lyrics are provided to alter the prompt behavior
    has_lyrics = len(lyrics.strip()) > 0
    vocals_instruction = "1. THIS IS A BACKING TRACK (MINUS-ONE). The provided ABC Notation is the LEAD MELODY. DO NOT sing or play this main lead melody. Your job is to create an accompaniment/backing track that perfectly harmonizes with, and matches the rhythm, tempo, and key of this exact lead melody."
    if has_lyrics:
        vocals_instruction = f"1. THIS IS A FULL SONG WITH VOCALS. The provided ABC Notation is the LEAD MELODY. You must sing the following lyrics: \"{lyrics}\", exactly following the rhythm, tempo, and key of the lead melody."

    # Construct the final prompt
    full_prompt = f"""
You are a master music arranger producing a highly professional musical composition based on the structure defined in the following ABC Notation.

CRITICAL INSTRUCTIONS:
{vocals_instruction}
2. DO NOT just take a short snippet and loop it. You MUST arrange the entire duration from start to finish. The duration and structure of the arrangement must exactly match the length implied by the provided melody notes.
3. Use the provided Arranger Blueprint for structural and chordal guidance.
4. Style instruction: {style_prompt}
5. The accompaniment must blend naturally with the provided melody's rhythm and phrasing.

MUSICAL ARRANGER BLUEPRINT (Guidance for chords and structure):
{blueprint}

LEAD MELODY ABC NOTATION (Your arrangement MUST fit perfectly around this):
{melody_abc}
"""

    def _call_api():
        for attempt in range(3):
            response = client.models.generate_content(
                model='lyria-3-pro-preview',
                contents=[full_prompt]
            )
            if response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    for p in candidate.content.parts:
                        if p.inline_data and p.inline_data.data:
                            return p.inline_data.data
                
                # If we get here, it didn't return audio.
                if attempt < 2 and str(candidate.finish_reason) == "FinishReason.OTHER":
                    print(f"[Lyria Engine] Attempt {attempt+1} failed with OTHER. Retrying...")
                    continue
                    
                raise RuntimeError(f"Lyria failed. Finish reason: {candidate.finish_reason}. Content: {candidate.content}")
                
        raise RuntimeError("Lyria response did not contain audio data or candidates.")

    try:
        future = _executor.submit(_call_api)
        # Wait for the actual AI to finish processing
        return future.result()
            
    except Exception as e:
        print(f"[Lyria Engine Error] {e}")
        raise RuntimeError(f"Failed to generate Lyria audio: {str(e)}")
