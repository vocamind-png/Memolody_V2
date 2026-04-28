import os
import shutil
import zipfile
import requests
from tqdm import tqdm
try:
    from music21 import converter, corpus
except ImportError:
    print("music21 not found. Please install it with 'pip install music21'")

# --- Configuration ---
BASE_DIR = os.path.abspath("musicxml_organized")
SOURCES = {
    "OpenScore_Lieder": "https://github.com/OpenScore/Lieder/archive/refs/heads/master.zip",
    "OpenEWLD": "https://github.com/00sapo/OpenEWLD/archive/refs/heads/master.zip",
    "ASAP_Dataset": "https://github.com/asap-dataset/asap-dataset/archive/refs/heads/main.zip",
    "Joplin_Ragtime": "https://github.com/musedata/joplin/archive/refs/heads/master.zip"
}

def download_file(url, dest_path):
    print(f"Downloading {url}...")
    try:
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        total_size = int(response.headers.get('content-length', 0))
        block_size = 1024
        t = tqdm(total=total_size, unit='iB', unit_scale=True)
        with open(dest_path, 'wb') as f:
            for data in response.iter_content(block_size):
                t.update(len(data))
                f.write(data)
        t.close()
        return True
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return False

def sanitize(s):
    return s.strip().replace(" ", "_").replace("/", "_").replace("\\", "_").replace(":", "_").replace("*", "_").replace("?", "_").replace("\"", "_").replace("<", "_").replace(">", "_").replace("|", "_")

def get_metadata(file_path):
    """Extracts metadata using music21."""
    try:
        score = converter.parse(file_path)
        
        # Get composer
        composer = "Unknown_Composer"
        if score.metadata and score.metadata.composer:
            composer = sanitize(score.metadata.composer)
        
        # Get era
        era = "Unknown_Era"
        # Optional: Add era detection logic here
        
        # Get instruments
        instruments = []
        for p in score.parts:
            instr_name = p.partName if p.partName else "Unknown_Instrument"
            instruments.append(sanitize(instr_name))
        
        instr_str = "_".join(sorted(list(set(instruments)))) if instruments else "Unknown_Instruments"
        if len(instr_str) > 50: instr_str = instr_str[:50] # Truncate long strings
        
        # Get year
        year = "Unknown_Year"
        if score.metadata and score.metadata.date:
            year = sanitize(str(score.metadata.date).split("-")[0])
            
        title = score.metadata.title if score.metadata and score.metadata.title else os.path.basename(file_path)
        title = sanitize(title)

        return {
            "composer": composer,
            "era": era,
            "instruments": instr_str,
            "year": year,
            "title": title
        }
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
        return None

def organize_source(source_name, zip_path):
    temp_extract = os.path.join(BASE_DIR, "temp_" + source_name)
    os.makedirs(temp_extract, exist_ok=True)
    
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(temp_extract)
    
    print(f"Organizing {source_name}...")
    for root, dirs, files in os.walk(temp_extract):
        for file in files:
            if file.lower().endswith(('.xml', '.mxl', '.musicxml')):
                full_path = os.path.join(root, file)
                meta = get_metadata(full_path)
                
                if meta:
                    # Genre/Era logic (simplified for now)
                    genre = "Classical" if "Lieder" in source_name or "ASAP" in source_name else "Pop_Jazz"
                    
                    target_dir = os.path.join(
                        BASE_DIR, 
                        genre, 
                        meta['era'], 
                        meta['composer'], 
                        meta['year'], 
                        meta['instruments']
                    )
                    os.makedirs(target_dir, exist_ok=True)
                    
                    target_file = f"{meta['title']}.xml"
                    shutil.copy2(full_path, os.path.join(target_dir, target_file))
    
    # Cleanup temp
    shutil.rmtree(temp_extract)

if __name__ == "__main__":
    os.makedirs(BASE_DIR, exist_ok=True)
    
    for name, url in SOURCES.items():
        zip_name = name + ".zip"
        if download_file(url, zip_name):
            try:
                organize_source(name, zip_name)
            finally:
                if os.path.exists(zip_name):
                    os.remove(zip_name)
        else:
            print(f"Skipping {name} due to download failure.")
    
    print("Done! Files organized in:", BASE_DIR)
