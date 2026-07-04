import librosa
import numpy as np
import os

filepath = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/renders/render_1780235591211.mp3"
y, sr = librosa.load(filepath)
f0, voiced_flag, _ = librosa.pyin(y, fmin=50, fmax=2000)
valid_f0 = f0[voiced_flag]
if len(valid_f0) > 0:
    midis = librosa.hz_to_midi(valid_f0)
    print(f"Fixed MIDI: {np.median(midis):.2f}")
    print(f"Fixed Hz: {np.median(valid_f0):.2f}")
else:
    print("No valid f0 found!")
