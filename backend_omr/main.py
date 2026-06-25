from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import subprocess
import shutil
import uuid

app = FastAPI(title="Memolody OMR API", description="Open Source OMR processing via Oemer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.post("/api/omr/process")
async def process_omr(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.pdf')):
        raise HTTPException(status_code=400, detail="Only PNG, JPG, or PDF files are supported.")

    job_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")
    
    # Save the uploaded file
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # Run Oemer (Open-source end-to-end OMR)
        # Assuming oemer is installed in the python environment: pip install oemer
        # Usage: oemer <image_path> -o <output_dir>
        process = subprocess.run(
            ["oemer", input_path, "-o", OUTPUT_DIR],
            capture_output=True,
            text=True,
            check=False
        )

        if process.returncode != 0:
            print("Oemer Error:", process.stderr)
            raise HTTPException(status_code=500, detail="OMR Processing failed. Please check the image quality.")

        # Oemer outputs a MusicXML file typically named <original_name>.musicxml
        expected_xml = os.path.join(OUTPUT_DIR, f"{job_id}.musicxml")
        
        # If Oemer adds its own suffix, find the xml in the output dir
        found_xml = None
        for f in os.listdir(OUTPUT_DIR):
            if f.startswith(job_id) and f.endswith(".musicxml"):
                found_xml = os.path.join(OUTPUT_DIR, f)
                break
                
        if not found_xml or not os.path.exists(found_xml):
            raise HTTPException(status_code=500, detail="OMR succeeded but MusicXML file was not generated.")

        with open(found_xml, "r", encoding="utf-8") as xml_file:
            xml_data = xml_file.read()

        # Clean up
        os.remove(input_path)
        os.remove(found_xml)

        return {"status": "success", "xmlData": xml_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
