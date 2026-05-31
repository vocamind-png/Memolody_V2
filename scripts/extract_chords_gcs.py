import os
import json
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
import concurrent.futures
import time

MANIFEST_URL = 'https://storage.googleapis.com/memolody-vault/manifest.json'

def parse_harmony(harmony_elem):
    root_step = harmony_elem.findtext('root/root-step')
    root_alter = harmony_elem.findtext('root/root-alter')
    kind = harmony_elem.findtext('kind')
    bass_step = harmony_elem.findtext('bass/bass-step')
    bass_alter = harmony_elem.findtext('bass/bass-alter')

    if not root_step:
        return None

    chord_name = root_step
    if root_alter == '1':
        chord_name += '#'
    elif root_alter == '-1':
        chord_name += 'b'

    kind_map = {
        'major': '',
        'minor': 'm',
        'dominant': '7',
        'major-seventh': 'maj7',
        'minor-seventh': 'm7',
        'diminished': 'dim',
        'augmented': 'aug',
        'half-diminished': 'm7b5'
    }
    
    if kind:
        chord_name += kind_map.get(kind, f"({kind})")
        
    if bass_step:
        chord_name += f"/{bass_step}"
        if bass_alter == '1':
            chord_name += '#'
        elif bass_alter == '-1':
            chord_name += 'b'

    return chord_name

def extract_chords_from_xml_content(xml_content):
    try:
        root = ET.fromstring(xml_content)
        chords = []
        for measure in root.iter('measure'):
            measure_chords = []
            for harmony in measure.findall('harmony'):
                chord = parse_harmony(harmony)
                if chord:
                    measure_chords.append(chord)
            if measure_chords:
                chords.append(measure_chords)
        return chords
    except ET.ParseError:
        return None

def process_song(song):
    url = song.get('xmlData')
    if not url:
        return None
        
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        
        content = None
        if url.endswith('.mxl'):
            with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                for name in z.namelist():
                    if name.endswith('.xml') and not name.startswith('META-INF'):
                        content = z.read(name)
                        break
        else:
            content = resp.content
            
        if content:
            chords = extract_chords_from_xml_content(content)
            if chords and len(chords) > 0:
                return {
                    'id': song.get('id'),
                    'title': song.get('title'),
                    'chords': chords
                }
    except Exception as e:
        pass
    return None

def process_all(limit=None):
    print("Downloading manifest...")
    resp = requests.get(MANIFEST_URL)
    manifest = resp.json()
    songs = manifest.get('data', {}).get('songs', [])
    
    print(f"Found {len(songs)} songs in manifest.")
    
    if limit is not None:
        songs = songs[:limit]
        
    results = []
    start_time = time.time()
    
    # Increase workers to 50 for faster I/O
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = {executor.submit(process_song, s): s for s in songs}
        for i, future in enumerate(concurrent.futures.as_completed(futures)):
            res = future.result()
            if res:
                results.append(res)
            
            # Save intermediate results every 5000 processed
            if (i + 1) % 5000 == 0:
                elapsed = time.time() - start_time
                print(f"Processed {i+1}/{len(songs)} songs in {elapsed:.2f}s...")
                with open('chords_dataset_partial.json', 'w') as f:
                    json.dump(results, f, indent=2, ensure_ascii=False)
                
    print(f"\nProcessing complete. Found chords in {len(results)} out of {len(songs)} processed songs.")
    
    output_file = 'chords_dataset.json'
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Final results saved to {output_file}")

if __name__ == "__main__":
    import sys
    limit = None
    if len(sys.argv) > 1:
        if sys.argv[1].lower() != "all":
            limit = int(sys.argv[1])
    else:
        limit = 10
        
    process_all(limit)
