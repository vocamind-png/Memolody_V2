import os
import subprocess

PITCHES = {
    'C4': 261.63,
    'D4': 293.66,
    'E4': 329.63,
    'F4': 349.23,
    'G4': 392.00,
    'A4': 440.00,
    'B4': 493.88,
    'C5': 523.25
}

SYSTEMS = {
    'ju': {
        'C4': 'Do', 'D4': 'Re', 'E4': 'Mi', 'F4': 'Fa', 'G4': 'Sol', 'A4': 'La', 'B4': 'Ti', 'C5': 'Do'
    },
    'american': {
        'C4': 'C', 'D4': 'D', 'E4': 'E', 'F4': 'F', 'G4': 'G', 'A4': 'A', 'B4': 'B', 'C5': 'C'
    },
    'movable': {
        'C4': 'One', 'D4': 'Two', 'E4': 'Three', 'F4': 'Four', 'G4': 'Five', 'A4': 'Six', 'B4': 'Seven', 'C5': 'One'
    }
}

os.makedirs('public/audio/solfege', exist_ok=True)

for sys_name, mapping in SYSTEMS.items():
    sys_dir = f'public/audio/solfege/{sys_name}'
    os.makedirs(sys_dir, exist_ok=True)
    
    for note, word in mapping.items():
        freq = PITCHES[note]
        aiff_tmp = f'{note}_tmp.aiff'
        
        # 1. Generate speech (-v Samantha is a clean female voice on macOS)
        subprocess.run(['say', '-v', 'Samantha', word, '-o', aiff_tmp])
        
        # 2. Mix with pitch and output MP3
        mp3_out = f'{sys_dir}/{note}.mp3'
        cmd = [
            'ffmpeg', '-y', '-f', 'lavfi', '-i', f'sine=frequency={freq}:duration=0.6',
            '-i', aiff_tmp,
            '-filter_complex', '[0:a]volume=0.3[tone];[1:a]volume=3.0[voice];[tone][voice]amix=inputs=2:duration=shortest',
            mp3_out
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Clean up
        if os.path.exists(aiff_tmp):
            os.remove(aiff_tmp)
        print(f"Generated {mp3_out}")

print("Generated all solfege audio successfully!")
