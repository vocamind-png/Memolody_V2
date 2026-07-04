import os
from google import genai
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env")

def run_lyria_test():
    api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    print("\nAttempting to call lyria-3-pro-preview with ABC Notation...")
    
    abc_prompt = """
Compose an orchestral arrangement using the exact melody defined in the following ABC Notation.
Keep the melody identical and use a Grand Symphonic style.

X:1
T:Memolody Test
M:4/4
L:1/4
K:C
C D E F | G A B c | c B A G | F E D C |]
"""
    try:
        response = client.models.generate_content(
            model='lyria-3-pro-preview',
            contents=[abc_prompt]
        )
        print("Response received!")
        
        if response.candidates and response.candidates[0].content.parts:
            for p in response.candidates[0].content.parts:
                if p.inline_data:
                    print("Found inline data:", p.inline_data.mime_type)
                    with open("lyria_output_abc.mp3", "wb") as f:
                        f.write(p.inline_data.data)
                    print("Saved lyria_output_abc.mp3")
                elif p.text:
                    print("Text part:", p.text[:100])
                    
    except Exception as e:
        print("Generation failed:", e)

if __name__ == "__main__":
    run_lyria_test()
