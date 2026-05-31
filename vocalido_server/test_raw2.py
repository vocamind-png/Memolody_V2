import librosa
import numpy as np
y, sr = librosa.load("raw_vocoder_out.wav")
print(f"Sample Rate: {sr}")
print(f"Length (samples): {len(y)}")
print(f"Duration (s): {len(y)/sr:.3f}")
