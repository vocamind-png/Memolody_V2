import sys

def getChromaticSolfege(step, alter, key, mode, durationRatio=None, fifths=0):
    SOLFEGE_MAPS = {
      'American': { 0: 'Do', 1: 'Di', 2: 'Re', 3: 'Ri', 4: 'Mi', 5: 'Fa', 6: 'Fi', 7: 'Sol', 8: 'Si', 9: 'La', 10: 'Li', 11: 'Ti' },
      'British': { 0: 'Doh', 1: 'Di', 2: 'Ray', 3: 'Ri', 4: 'Me', 5: 'Fah', 6: 'Fi', 7: 'Soh', 8: 'Si', 9: 'Lah', 10: 'Li', 11: 'Ti' },
      'Ju': { 0: 'Do', 1: 'Di', 2: 'Re', 3: 'Ri', 4: 'Mi', 5: 'Fa', 6: 'Fi', 7: 'Sol', 8: 'Si', 9: 'La', 10: 'Li', 11: 'Ti' }
    }
    KEY_OFFSETS = { 'C': 0, 'G': 7, 'D': 2, 'A': 9, 'E': 4, 'B': 11, 'F#': 6, 'C#': 1, 'F': 5, 'Bb': 10, 'Eb': 3, 'Ab': 8, 'Db': 1, 'Gb': 6, 'Cb': 11 }
    
    if mode in ['Close', 'Lyric']: return ''
    
    noteBases = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 }
    isFixed = 'Fixed' in mode
    tonic = 0 if isFixed else KEY_OFFSETS.get(key, 0)
    
    abs_val = (noteBases[step.upper()] + (alter or 0) + 12) % 12
    interval = (abs_val - tonic + 12) % 12
    
    system = 'Ju'
    if 'American' in mode: system = 'American'
    elif 'British' in mode: system = 'British'
    
    useFlat = (alter < 0) or (fifths < 0 and alter <= 0)
    map_dict = SOLFEGE_MAPS.get(system, SOLFEGE_MAPS['Ju'])
    return map_dict.get(interval, step)

# Test Mrs Crotty's (G Major)
notes = [
    ('B', 0), ('C', 0), ('D', 0), ('B', 0), ('D', 0), ('C', 0), ('A', 0), ('C', 0), ('B', 0), ('G', 0)
]

print("British Movable Doh:")
for step, alter in notes:
    print(getChromaticSolfege(step, alter, 'G', 'British Movable Doh'))
    
print("\nBritish Fixed Doh:")
for step, alter in notes:
    print(getChromaticSolfege(step, alter, 'G', 'British Fixed Doh'))
