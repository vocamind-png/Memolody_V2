import librosa
import numpy as np

y, sr = librosa.load("renders/render_1780234185966.mp3")
f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=librosa.note_to_hz('C3'), fmax=librosa.note_to_hz('C6'))
valid_f0 = f0[voiced_flag]
if len(valid_f0) > 0:
    midis = librosa.hz_to_midi(valid_f0)
    print(f"Median MIDI: {np.median(midis):.2f}")
    
    # Bucket into segments
    # The audio has 3 notes, duration 0.5 each.
    # Total duration = 1.5s
    # sr = 22050 (default librosa)
    hop_length = 512
    times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop_length)
    
    for i in range(3):
        start = i * 0.5
        end = (i + 1) * 0.5
        mask = (times >= start) & (times < end) & voiced_flag
        if np.any(mask):
            segment_midi = librosa.hz_to_midi(f0[mask])
            print(f"Note {i+1} [{start}-{end}s]: median MIDI = {np.median(segment_midi):.2f} (hz = {np.median(f0[mask]):.2f})")
