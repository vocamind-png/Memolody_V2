import numpy as np

words = ['Me', 'Fah', 'Soh']
durations = [0.5, 0.5, 0.5]
word_dur_fr = [int(round(d * 44100 / 512)) for d in durations]
print("word_dur_fr:", word_dur_fr)
print("sum:", sum(word_dur_fr))
