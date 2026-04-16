# Vocalido SVS Cloud Server (v2.0)
This is the official Backend for **Vocamind's Vocalido AI Singing Voice Synthesis**.

## Getting Started (Local Development)
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the server:
   ```bash
   python main.py
   ```
   The server will be available at `http://localhost:5000/v1/synthesis`.

## How it works
1. **Memolody V2 (Frontend)** sends a POST request with musical data (MIDI notes, lyrics, bpm).
2. This server processes the data, calls the **DiffSinger** or **OpenUtau** model, and generates a `.wav` file.
3. The frontend receives the audio and plays it back on the specific track.

## Production (Google Cloud)
To run on Google Cloud:
1. Containerize this folder using **Docker**.
2. Deploy to **Cloud Run** or **GKE** with GPU nodes enabled for optimal rendering performance.
