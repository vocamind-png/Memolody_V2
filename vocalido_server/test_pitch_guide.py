import numpy as np

# Suppose input is MIDI 64.0
midi = 64.0
hz = 440.0 * (2 ** ((midi - 69.0)/12.0))
logf0 = np.log(hz)

print(f"MIDI: {midi}, Hz: {hz:.2f}, LogF0: {logf0:.2f}")
