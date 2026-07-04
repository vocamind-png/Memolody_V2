import os
import io
from google import genai
from dotenv import load_dotenv
from pydub import AudioSegment
from pydub.generators import Sine

# Load from parent directory
load_dotenv(dotenv_path="../.env")

def run_lyria_test():
    api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    print("\nAttempting to call lyria-3-pro-preview with AUDIO + TEXT...")
    
    # Create 2 seconds of a sine wave (beep)
    beep = Sine(440).to_audio_segment(duration=2000)
    buf = io.BytesIO()
    beep.export(buf, format="mp3")
    audio_bytes = buf.getvalue()
    
    try:
        response = client.models.generate_content(
            model='lyria-3-pro-preview',
            contents=[
                genai.types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type='audio/mp3',
                ),
                "Use the melody from this audio and turn it into a 15-second cinematic orchestral song."
            ]
        )
        print("Response received!")
        
        if response.candidates and response.candidates[0].content.parts:
            for p in response.candidates[0].content.parts:
                if p.inline_data:
                    print("Found inline data:", p.inline_data.mime_type)
                    with open("lyria_output_with_audio.mp3", "wb") as f:
                        f.write(p.inline_data.data)
                    print("Saved lyria_output_with_audio.mp3")
                elif p.text:
                    print("Text part:", p.text[:100])
                    
    except Exception as e:
        print("Generation failed:", e)

if __name__ == "__main__":
    run_lyria_test()
