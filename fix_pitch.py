import re

with open('vocalido_server/ds_onnx_engine.py', 'r') as f:
    content = f.read()

correct_block = """            # User requested 100% perfectly flat, steady intonation.
            # We completely bypass the neural pitch's natural wobbles and the cosine smoothing.
            f0_hz_ideal = np.zeros_like(f0_midi_arr)
            voicing_mask = f0_midi_arr > 0.0
            f0_hz_ideal[voicing_mask] = 440.0 * (2.0 ** ((f0_midi_arr[voicing_mask] - 69.0) / 12.0))
            
            # FORCE perfectly flat step-function pitch:
            pp_final[0] = f0_hz_ideal

            pp = pp_final.copy()
            # Disable vibrato as well
            # ── Note-Level Continuous Vibrato with soft fade-in/out ───────────────"""

start_str = '            # Step-wise pitch quantization blend for Robot settings (timing_feel < 50.0%)'
end_str = '            # ── Note-Level Continuous Vibrato with soft fade-in/out ───────────────'

start_idx = content.find(start_str)
end_idx = content.find(end_str, start_idx) + len(end_str)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + correct_block + content[end_idx:]
    with open('vocalido_server/ds_onnx_engine.py', 'w') as f:
        f.write(new_content)
    print("Fixed pitch logic!")
else:
    print("Could not find pitch block")
