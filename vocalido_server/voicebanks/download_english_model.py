
import os
import requests
from tqdm import tqdm

def download_file(url, filename):
    print(f"Downloading {filename} from {url}...")
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))
    block_size = 1024 # 1 Kibibyte
    
    with open(filename, 'wb') as file, tqdm(
        total=total_size, unit='iB', unit_scale=True
    ) as bar:
        for data in response.iter_content(block_size):
            bar.update(len(data))
            file.write(data)

def setup_ophelia():
    base_path = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido-server/voicebanks/female/ophelia_en"
    if not os.path.exists(base_path):
        os.makedirs(base_path)
    
    os.chdir(base_path)
    
    files = {
        "config.yaml": "https://huggingface.co/openvpi/diffsinger-en-ophelia/resolve/main/acoustic/config.yaml?download=true",
        "acoustic.ckpt": "https://huggingface.co/openvpi/diffsinger-en-ophelia/resolve/main/acoustic/model_ckpt_steps_160000.ckpt?download=true",
        "dictionary.txt": "https://huggingface.co/openvpi/diffsinger-en-ophelia/resolve/main/dictionary.txt?download=true"
    }

    for name, url in files.items():
        if os.path.exists(name):
            print(f"file {name} already exists, skipping...")
            continue
        try:
            download_file(url, name)
            print(f"Successfully downloaded {name}")
        except Exception as e:
            print(f"Error downloading {name}: {e}")

if __name__ == "__main__":
    setup_ophelia()