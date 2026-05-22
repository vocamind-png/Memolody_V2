import os

# ต้องติดตั้ง music21 ก่อนรันสคริปต์นี้: pip install music21
from music21 import stream, note, tempo, meter, metadata

output_dir = "Dataset_MusicXML_Guide"
os.makedirs(output_dir, exist_ok=True)

def create_musicxml(filename, title, bpm, note_pitches, lyrics, beats_per_note, final_hold):
    s = stream.Score()
    p = stream.Part()
    
    # ตั้งค่าจังหวะ 4/4 และความเร็ว BPM
    p.insert(0, meter.TimeSignature('4/4'))
    p.insert(0, tempo.MetronomeMark(number=bpm))
    
    # ใส่ชื่อเพลง
    s.metadata = metadata.Metadata()
    s.metadata.title = title
    
    for i, p_midi in enumerate(note_pitches):
        n = note.Note()
        n.pitch.midi = p_midi
        
        # คำนวณความยาวโน้ต (quarterLength = 1 คือ 1 จังหวะ/Beat)
        dur = final_hold if i == len(note_pitches) - 1 else beats_per_note
        n.quarterLength = dur
        
        # ใส่เนื้อร้อง (Lyric) ให้ตรงกับโน้ต
        if i < len(lyrics):
            n.addLyric(lyrics[i])
            
        p.append(n)
        
    s.append(p)
    
    filepath = os.path.join(output_dir, filename)
    s.write('musicxml', fp=filepath)
    print(f"Generated MusicXML: {filepath}")

def generate_all_xml():
    print("Generating MusicXML files for Verovio...")
    
    # ชุดตัวโน้ต MIDI
    c_ascend = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]
    c_descend = list(reversed(c_ascend))
    c_arpeggio = [60, 64, 67, 72, 67, 64, 60]

    # ชุดเนื้อร้อง
    am_asc = ["Do", "Di", "Re", "Ri", "Mi", "Fa", "Fi", "Sol", "Si", "La", "Li", "Ti", "Do"]
    am_desc = ["Do", "Ti", "Te", "La", "Le", "Sol", "Se", "Fa", "Mi", "Me", "Re", "Ra", "Do"]
    am_arp = ["Do", "Mi", "Sol", "Do", "Sol", "Mi", "Do"]

    br_asc = ["Doh", "Di", "Ray", "Ri", "Me", "Fah", "Fi", "Soh", "Si", "Lah", "Li", "Ti", "Doh"]
    br_desc = ["Doh", "Ti", "Taw", "Lah", "Law", "Soh", "Saw", "Fah", "Me", "Maw", "Ray", "Raw", "Doh"]
    
    ju_asc = ["Do", "Di", "Re", "Ri", "Mi", "Fa", "Fi", "Sol", "Si", "La", "Li", "Ti", "Do"]
    ju_desc = ["Do", "Ti", "Tu", "La", "Lu", "Sol", "Su", "Fa", "Mi", "Mu", "Re", "Ru", "Do"]

    vowel_a = ["A"] * 13
    vowel_trans = ["A", "E", "I", "O", "U"]

    # 1. American Solfege
    create_musicxml("01_American_Ascend.musicxml", "01 American Ascend", 80, c_ascend, am_asc, 1, 4)
    create_musicxml("02_American_Descend.musicxml", "02 American Descend", 80, c_descend, am_desc, 1, 4)
    create_musicxml("05_American_Arpeggio.musicxml", "05 American Arpeggio", 100, c_arpeggio, am_arp, 1, 4)

    # 2. British Solfege
    create_musicxml("11_British_Ascend.musicxml", "11 British Ascend", 80, c_ascend, br_asc, 1, 4)
    create_musicxml("12_British_Descend.musicxml", "12 British Descend", 80, c_descend, br_desc, 1, 4)

    # 3. Ju Solfege
    create_musicxml("21_Ju_Ascend.musicxml", "21 Ju Solfege Ascend", 80, c_ascend, ju_asc, 1, 4)
    create_musicxml("22_Ju_Descend.musicxml", "22 Ju Solfege Descend", 80, c_descend, ju_desc, 1, 4)

    # 4. Pure Vowels
    create_musicxml("31_Vowel_A_Long.musicxml", "31 Vowel A", 60, c_ascend, vowel_a, 4, 8)
    create_musicxml("36_Vowel_Transition.musicxml", "36 Vowel Transition", 60, [60,60,60,60,60], vowel_trans, 1, 4)

    # 5. Articulation
    create_musicxml("46_Tech_Staccato.musicxml", "46 Staccato", 120, c_arpeggio, ["Ha"]*7, 0.5, 2)
    
    print("Done! Check the 'Dataset_MusicXML_Guide' folder.")

if __name__ == "__main__":
    generate_all_xml()
