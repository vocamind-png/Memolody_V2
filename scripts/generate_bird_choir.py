import numpy as np
import wave
import subprocess
import os

SAMPLE_RATE = 44100
DURATION = 2.0

def generate_bird_tone(freq, duration, delay=0):
    total_len = int(SAMPLE_RATE * DURATION)
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    
    # Fast Bird vibrato (FM synthesis)
    vibrato = np.sin(2 * np.pi * 20 * t) * 30
    
    # Sine wave
    signal = np.sin(2 * np.pi * (freq + vibrato) * t)
    
    # Envelope
    attack_time = 0.1
    decay_time = 0.5
    sustain = 0.4
    release_time = duration - attack_time - decay_time
    
    attack_samples = int(attack_time * SAMPLE_RATE)
    decay_samples = int(decay_time * SAMPLE_RATE)
    
    envelope = np.ones_like(t) * sustain
    envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
    envelope[attack_samples:attack_samples+decay_samples] = np.linspace(1, sustain, decay_samples)
    envelope[-int(release_time * SAMPLE_RATE):] = np.linspace(sustain, 0, int(release_time * SAMPLE_RATE))
    
    signal = signal * envelope
    
    # Pad delay
    delay_samples = int(delay * SAMPLE_RATE)
    if delay_samples + len(signal) > total_len:
        signal = signal[:total_len - delay_samples]
        
    padded = np.zeros(total_len)
    padded[delay_samples:delay_samples+len(signal)] = signal
    
    return padded

# C Major 7th arpeggio / chord
# Frequencies: C5, E5, G5, B5, C6
chord_freqs = [523.25, 659.25, 783.99, 987.77, 1046.50]
delays = [0.0, 0.05, 0.1, 0.15, 0.2]

mix = np.zeros(int(SAMPLE_RATE * DURATION))

for freq, dly in zip(chord_freqs, delays):
    mix += generate_bird_tone(freq, 1.5, dly)

# Normalize
mix = mix / np.max(np.abs(mix)) * 0.7

# Convert to 16-bit PCM
audio_data = np.int16(mix * 32767)

wav_path = "bird_choir.wav"
with wave.open(wav_path, 'w') as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(SAMPLE_RATE)
    wav_file.writeframes(audio_data.tobytes())

# Output MP3
subprocess.run(['ffmpeg', '-y', '-i', wav_path, 'public/audio/bird_choir.mp3'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if os.path.exists(wav_path):
    os.remove(wav_path)
print("bird_choir.mp3 generated successfully!")
