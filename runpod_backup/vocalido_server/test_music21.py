from music21 import stream, note, key
s = stream.Stream()
s.append(key.KeySignature(-1)) # F Major
s.append(note.Note('B-4'))
s.append(note.Note('C5'))
xml = s.write('musicxml')
with open(xml, 'r') as f:
    print(f.read())
