from vocalido_server.lyria_engine import analyze_melody_for_blueprint, generate_lyria_audio
import asyncio

abc = "X:1\nT:Test\nM:4/4\nL:1/4\nK:C\n| C D E F | G A B c |]"
try:
    print("Testing Blueprint...")
    bp = analyze_melody_for_blueprint(abc, "C", 120, "Jazz")
    print("Blueprint result:", bp)
    print("Testing Audio Generation...")
    audio = generate_lyria_audio(abc, "Jazz", bp)
    print("Audio length:", len(audio) if audio else 0)
except Exception as e:
    print("ERROR:", e)
