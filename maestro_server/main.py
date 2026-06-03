import os
import tempfile
import asyncio
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil

app = FastAPI(title="Maestro Neural Server (DDSP)", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize midi-ddsp synthesizer globally to avoid loading weights on every request
synthesizer = None

@app.on_event("startup")
async def startup_event():
    global synthesizer
    print("Loading MIDI-DDSP weights...")
    try:
        # Import here to not block standard FastAPI startup errors if tf is broken
        from midi_ddsp import MIDIDDSP
        synthesizer = MIDIDDSP()
        print("MIDI-DDSP loaded successfully.")
    except Exception as e:
        print(f"Failed to load MIDI-DDSP: {e}")

@app.post("/render_midi")
async def render_midi(
    midi_file: UploadFile = File(...),
    instrument_preset: str = Form("0,0") # Format: "bank,program"
):
    """
    Renders an uploaded MIDI file to expressive WAV using MIDI-DDSP.
    """
    global synthesizer
    if synthesizer is None:
        raise HTTPException(status_code=500, detail="Neural Synthesizer is not initialized.")

    with tempfile.TemporaryDirectory() as tmpdir:
        midi_path = os.path.join(tmpdir, "input.mid")
        wav_path = os.path.join(tmpdir, "output.wav")
        
        # Save uploaded MIDI
        with open(midi_path, "wb") as f:
            shutil.copyfileobj(midi_file.file, f)
            
        try:
            # Run synthesis (blocks event loop, but okay for this specialized worker)
            # In production, use a ProcessPoolExecutor.
            from midi_ddsp.utils.midi_synthesis_utils import synthesize_midi
            from scipy.io import wavfile
            import numpy as np

            # synthesize_midi returns a dict with instrument outputs or a combined array.
            # Using synthesizer instance to synthesize
            output, synthesis_generator = synthesizer.synthesize_midi(midi_path)
            
            # Save the mix down
            if output is not None:
                wavfile.write(wav_path, 16000, output)
            else:
                raise Exception("MIDI-DDSP generated empty output.")
            
        except Exception as e:
            print(f"Neural Synthesis Error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Neural rendering failed: {str(e)}")

        if not os.path.exists(wav_path):
            raise HTTPException(status_code=500, detail="Output WAV file not generated.")
            
        render_dir = os.path.join(os.path.dirname(__file__), "renders")
        os.makedirs(render_dir, exist_ok=True)
        final_path = os.path.join(render_dir, f"render_{os.path.basename(tmpdir)}.wav")
        shutil.copy(wav_path, final_path)
        
        return FileResponse(final_path, media_type="audio/wav", filename="rendered_neural.wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
