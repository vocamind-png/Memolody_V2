"""
Lightweight YouTube Download Server v2
- Bypasses YouTube bot detection with player_client options
- Runs on port 5001
"""
from fastapi import FastAPI, Body
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

app = FastAPI(title="Vocalido YouTube Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("renders", exist_ok=True)
os.makedirs("renders/stems", exist_ok=True)

app.mount("/audio", StaticFiles(directory="renders"), name="audio")
app.mount("/vocalido/audio", StaticFiles(directory="renders"), name="vocalido_audio")

@app.get("/")
async def root():
    return {"status": "ok", "service": "youtube-server-v2"}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "youtube-server-v2"}

@app.post("/vocalido/api/youtube/download")
@app.post("/api/youtube/download")
async def download_youtube(payload: dict = Body(...)):
    url = payload.get("url")
    quality = payload.get("quality", "auto")
    if not url:
        return JSONResponse({"error": "No URL provided"}, status_code=400)
    
    output_dir = "renders"
    
    # Find cookies file
    cookies_path = os.path.join(os.path.dirname(__file__), "cookies.txt")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'{output_dir}/%(id)s.%(ext)s',
        'quiet': True,
        'no_warnings': True,
    }
    
    # Use cookies if available (required on cloud servers)
    if os.path.exists(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
        print(f"[YT] Using cookies from {cookies_path}")
    
    ext = "wav"
    postprocessor_args = []
    
    if quality == "44100_16":
        postprocessor_args = ['-ar', '44100', '-sample_fmt', 's16']
    elif quality == "48000_24":
        postprocessor_args = ['-ar', '48000', '-sample_fmt', 's24']
    elif quality == "96000_24":
        postprocessor_args = ['-ar', '96000', '-sample_fmt', 's24']
    elif quality == "192000_24":
        postprocessor_args = ['-ar', '192000', '-sample_fmt', 's24']
    elif quality == "mp3_320":
        ext = "mp3"
    
    if ext == "mp3":
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '320',
        }]
    else:
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
        }]
        if postprocessor_args:
            ydl_opts['postprocessor_args'] = postprocessor_args
            
    try:
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            video_id = info['id']
            filename = f"{video_id}.{ext}"
            
            # Get file size
            file_path = os.path.join(output_dir, filename)
            file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            
            return {
                "url": f"/vocalido/audio/{filename}",
                "filename": filename,
                "title": info.get('title', 'Unknown'),
                "duration": info.get('duration', 0),
                "fileSize": file_size,
            }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/vocalido/api/ai/separate-stems")
@app.post("/api/ai/separate-stems")
async def separate_stems(payload: dict = Body(...)):
    file_url = payload.get("file_url")
    stems_count = payload.get("stems", 2)
    
    if not file_url:
        return JSONResponse({"error": "No file_url provided"}, status_code=400)
    
    filename = os.path.basename(file_url)
    base_name = os.path.splitext(filename)[0]
    file_path = os.path.join("renders", filename)
    
    if not os.path.exists(file_path):
        return JSONResponse({"error": f"File not found: {filename}"}, status_code=404)
    
    try:
        import subprocess
        model = "htdemucs"
        cmd = ["python", "-m", "demucs", "--name", model, "-o", "renders/stems"]
        if stems_count == 2:
            cmd += ["--two-stems", "vocals"]
        cmd.append(file_path)
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            return JSONResponse({"error": f"Demucs failed: {result.stderr[-500:]}"}, status_code=500)
        
        if stems_count == 2:
            return {"stems": {
                "vocals": f"/vocalido/audio/stems/{model}/{base_name}/vocals.wav",
                "instrumental": f"/vocalido/audio/stems/{model}/{base_name}/no_vocals.wav"
            }}
        else:
            return {"stems": {
                "vocals": f"/vocalido/audio/stems/{model}/{base_name}/vocals.wav",
                "drums": f"/vocalido/audio/stems/{model}/{base_name}/drums.wav",
                "bass": f"/vocalido/audio/stems/{model}/{base_name}/bass.wav",
                "other": f"/vocalido/audio/stems/{model}/{base_name}/other.wav"
            }}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    print("=" * 55)
    print(f"YouTube Download Server v2 — Port {port}")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=port)
