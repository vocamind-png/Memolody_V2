import librosa
import numpy as np

sr = 44100
t = np.linspace(0, 1.0, sr)
y = np.sin(2 * np.pi * 337.5 * t)
f0, voiced_flag, _ = librosa.pyin(y, fmin=200, fmax=500)
valid_f0 = f0[voiced_flag]
print("Sine wave 337.5 Hz -> detected:", np.median(valid_f0))
