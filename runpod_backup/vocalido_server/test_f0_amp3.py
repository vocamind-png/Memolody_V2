import librosa
filepath = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/renders/render_1780235591211.mp3"
y, sr = librosa.load(filepath)
print(f"Sample Rate: {sr}")
print(f"Length (samples): {len(y)}")
print(f"Duration (s): {len(y)/sr:.3f}")
