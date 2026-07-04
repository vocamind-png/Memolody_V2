import librosa
import numpy as np
y, sr = librosa.load("raw_before_timbre.wav")
f0, voiced_flag, _ = librosa.pyin(y, fmin=200, fmax=500)
valid_f0 = f0[voiced_flag]
if len(valid_f0) > 0:
    midis = librosa.hz_to_midi(valid_f0)
    print(f"RAW AUDIO Median MIDI: {np.median(midis):.2f}")
