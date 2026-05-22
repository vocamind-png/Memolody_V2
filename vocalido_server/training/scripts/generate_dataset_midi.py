import os
import mido
from mido import Message, MidiFile, MidiTrack, MetaMessage

# Make sure mido is installed: pip install mido

output_dir = "Dataset_MIDI_Guide"
os.makedirs(output_dir, exist_ok=True)

def create_scale_midi(filename, bpm, notes, beats_per_note, final_hold_beats):
    mid = MidiFile(ticks_per_beat=480)
    track = MidiTrack()
    mid.tracks.append(track)
    
    tempo = mido.bpm2tempo(bpm)
    track.append(MetaMessage('set_tempo', tempo=tempo, time=0))
    
    ticks_per_beat = 480
    
    for i, note in enumerate(notes):
        # Duration calculation
        dur_beats = final_hold_beats if i == len(notes) - 1 else beats_per_note
        dur_ticks = int(dur_beats * ticks_per_beat)
        
        # Note on
        track.append(Message('note_on', note=note, velocity=100, time=0))
        # Note off (time is delta time from previous message)
        track.append(Message('note_off', note=note, velocity=64, time=dur_ticks))
        
    filepath = os.path.join(output_dir, filename)
    mid.save(filepath)
    print(f"Generated: {filepath}")

def generate_all():
    print("Generating MIDI files for Vocal Dataset...")
    
    # C Major Scale: C4 to C5
    c_ascend = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]
    c_descend = list(reversed(c_ascend))
    c_arpeggio = [60, 64, 67, 72, 67, 64, 60]

    # Category 1: American Solfege (01-10)
    create_scale_midi("01_American_Ascend_C_Scale.mid", 80, c_ascend, 1, 4)
    create_scale_midi("02_American_Descend_C_Scale.mid", 80, c_descend, 1, 4)
    create_scale_midi("03_American_Ascend_Slow.mid", 60, c_ascend, 2, 4)
    create_scale_midi("04_American_Descend_Slow.mid", 60, c_descend, 2, 4)
    create_scale_midi("05_American_Arpeggio.mid", 100, c_arpeggio, 1, 4)
    
    # We create some varying keys for 06-10
    keys = [61, 62, 63, 64, 65] # C#, D, Eb, E, F
    for i, root in enumerate(keys):
        asc = [root + j for j in range(13)]
        create_scale_midi(f"{i+6:02d}_American_Scale_Key_{root}.mid", 80, asc, 1, 4)

    # Category 2: British Solfege (11-20)
    create_scale_midi("11_British_Ascend_Scale.mid", 80, c_ascend, 1, 4)
    create_scale_midi("12_British_Descend_Scale.mid", 80, c_descend, 1, 4)
    create_scale_midi("13_British_Ascend_Slow.mid", 60, c_ascend, 2, 4)
    create_scale_midi("14_British_Descend_Slow.mid", 60, c_descend, 2, 4)
    create_scale_midi("15_British_Arpeggio.mid", 100, c_arpeggio, 1, 4)
    for i, root in enumerate(keys):
        asc = [root + j for j in range(13)]
        create_scale_midi(f"{i+16:02d}_British_Scale_Key_{root}.mid", 80, asc, 1, 4)

    # Category 3: Ju Solfege (21-30)
    create_scale_midi("21_Ju_Ascend_Scale.mid", 80, c_ascend, 1, 4)
    create_scale_midi("22_Ju_Descend_Scale.mid", 80, c_descend, 1, 4)
    create_scale_midi("23_Ju_Ascend_Slow.mid", 60, c_ascend, 2, 4)
    create_scale_midi("24_Ju_Descend_Slow.mid", 60, c_descend, 2, 4)
    create_scale_midi("25_Ju_Arpeggio.mid", 100, c_arpeggio, 1, 4)
    for i, root in enumerate(keys):
        asc = [root + j for j in range(13)]
        create_scale_midi(f"{i+26:02d}_Ju_Scale_Key_{root}.mid", 80, asc, 1, 4)

    # Category 4: Pure Vowels (31-40)
    create_scale_midi("31_Vowel_A_Long.mid", 60, c_ascend, 4, 8)
    create_scale_midi("32_Vowel_E_Long.mid", 60, c_ascend, 4, 8)
    create_scale_midi("33_Vowel_I_Long.mid", 60, c_ascend, 4, 8)
    create_scale_midi("34_Vowel_O_Long.mid", 60, c_ascend, 4, 8)
    create_scale_midi("35_Vowel_U_Long.mid", 60, c_ascend, 4, 8)
    create_scale_midi("36_Vowel_Transition_1.mid", 60, [60,60,60,60,60], 1, 4)
    create_scale_midi("37_Vowel_Transition_2.mid", 60, [62,62,62,62,62], 1, 4)
    create_scale_midi("38_Vowel_Transition_3.mid", 60, [64,64,64,64,64], 1, 4)
    create_scale_midi("39_Vowel_Transition_4.mid", 60, [65,65,65,65,65], 1, 4)
    create_scale_midi("40_Vowel_Transition_5.mid", 60, [67,67,67,67,67], 1, 4)

    # Category 5: Dynamics & Tech (41-60)
    for i in range(41, 46):
        create_scale_midi(f"{i:02d}_Tech_Legato.mid", 70, c_ascend, 2, 4)
    for i in range(46, 51):
        create_scale_midi(f"{i:02d}_Tech_Staccato.mid", 120, c_arpeggio, 0.5, 2)
    for i in range(51, 56):
        create_scale_midi(f"{i:02d}_Dyn_Breathy.mid", 60, c_ascend, 2, 4)
    for i in range(56, 61):
        create_scale_midi(f"{i:02d}_Dyn_Belting.mid", 80, c_ascend, 2, 4)

    # Category 6: Kodaly Rhythm (61-70) - Custom Rhythms (approximate representation)
    create_scale_midi("61_Kodaly_Ta_Titi.mid", 90, [60, 60, 60, 60, 60, 60], 0.5, 2) # simplified
    for i in range(62, 71):
        create_scale_midi(f"{i:02d}_Kodaly_Rhythm.mid", 90, [60]*10, 0.25, 1)

    print("Done! Check the 'Dataset_MIDI_Guide' folder.")

if __name__ == "__main__":
    generate_all()
