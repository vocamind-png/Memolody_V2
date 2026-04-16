# Vocalido DiffSinger Training — Google Colab Notebook
# ================================================
# เทรน Neural Singing Voice Synthesis แบบ Synthesizer V
# ใช้ DiffSinger framework + NSF-HiFiGAN vocoder
#
# วิธีใช้:
# 1. เปิดไฟล์นี้ใน Google Colab
# 2. เลือก Runtime > Change runtime type > T4 GPU
# 3. รันทีละ Cell ตามลำดับ

# ============================================================
# Cell 1: ติดตั้ง DiffSinger Framework
# ============================================================
# !pip install -q torch torchaudio
# !pip install -q tensorboard pytorch_lightning
# !pip install -q librosa soundfile pyyaml tqdm click
# !pip install -q g2p-en pypinyin zhon
# !pip install -q onnxruntime onnx
# !pip install -q praat-parselmouth pyworld pyloudnorm
# !git clone https://github.com/openvpi/DiffSinger.git /content/DiffSinger
# %cd /content/DiffSinger
# !pip install -r requirements.txt

# ============================================================
# Cell 2: ดาวน์โหลดข้อมูลจาก Google Cloud Storage
# ============================================================
# from google.colab import auth
# auth.authenticate_user()
# !gcloud config set project gen-lang-client-0560936129
# !gsutil -m cp -r gs://vocalido-master-corpus-v1/ /content/raw_data/
# # หรือ upload จาก local:
# # from google.colab import files
# # uploaded = files.upload()  # upload zip ของ dataset

# ============================================================
# Cell 3: เตรียมโครงสร้าง Dataset
# ============================================================
"""
import os, json, shutil

DATASET_DIR = '/content/DiffSinger/data/vocalido'
os.makedirs(f'{DATASET_DIR}/wavs', exist_ok=True)

# Copy wavs
src_wavs = '/content/raw_data/wavs'  # adjust path
for f in os.listdir(src_wavs):
    if f.endswith('.wav'):
        shutil.copy(os.path.join(src_wavs, f), f'{DATASET_DIR}/wavs/')

print(f"Copied {len(os.listdir(f'{DATASET_DIR}/wavs'))} wav files")
"""

# ============================================================
# Cell 4: Phoneme Alignment ด้วย Montreal Forced Aligner
# ============================================================
"""
# MFA ต้องการ: wav files + transcript files (.lab)
# สร้าง .lab files จาก transcriptions

import os

DATASET_DIR = '/content/DiffSinger/data/vocalido'
trans_file = f'{DATASET_DIR}/transcriptions.txt'

# Read transcriptions
with open(trans_file) as f:
    for line in f:
        parts = line.strip().split('|')
        if len(parts) >= 2:
            wav_name = parts[0]
            text = parts[1]
            lab_name = wav_name.replace('.wav', '.lab')
            with open(os.path.join(f'{DATASET_DIR}/wavs', lab_name), 'w') as lf:
                lf.write(text)

# Run MFA alignment
!mfa validate {DATASET_DIR}/wavs english_mfa english_mfa
!mfa align {DATASET_DIR}/wavs english_mfa english_mfa {DATASET_DIR}/textgrids --clean
"""

# ============================================================
# Cell 5: DiffSinger Preprocessing
# ============================================================
"""
# สร้าง config สำหรับ Vocalido voice
import yaml

config = {
    'base_config': 'configs/acoustic/nomidi.yaml',  
    'task_cls': 'training.acoustic_task.AcousticTask',
    'vocoder': 'nsf_hifigan',
    'vocoder_ckpt': '/content/nsf_hifigan/model',
    
    'raw_data_dir': '/content/DiffSinger/data/vocalido',
    'binary_data_dir': '/content/DiffSinger/data/vocalido_binary',
    'dictionary': '/content/DiffSinger/dictionaries/english.txt',
    
    'speakers': ['vocalido'],
    'spk_id': 0,
    'test_prefixes': ['chromatic_american_part1'],
    
    'audio_sample_rate': 44100,
    'hop_size': 512,
    'win_size': 2048,
    'fft_size': 2048,
    'audio_num_mel_bins': 128,
    
    'f0_min': 80,
    'f0_max': 1200,
    
    'augmentation_args': {
        'random_pitch_shifting': {
            'enabled': True,
            'range': [-3, 3],
            'scale': 0.5
        }
    },
    
    'max_batch_size': 8,
    'max_batch_frames': 50000,
    'max_epochs': 1000,
    'num_ckpt_keep': 5,
    'lr': 0.0004,
    
    'diff_decoder_type': 'wavenet',
    'diff_loss_type': 'l2',
    'schedule_type': 'linear',
    'K_step': 100,
    'timesteps': 100,
}

with open('/content/DiffSinger/usr/configs/vocalido.yaml', 'w') as f:
    yaml.dump(config, f, default_flow_style=False)

print("Config saved!")

# Run preprocessing
!cd /content/DiffSinger && python preprocessing/binarize.py --config usr/configs/vocalido.yaml
"""

# ============================================================
# Cell 6: เทรน DiffSinger Acoustic Model
# ============================================================
"""
# Start training
!cd /content/DiffSinger && python run.py --config usr/configs/vocalido.yaml --exp_name vocalido_v1 --reset

# Monitor with TensorBoard
# %load_ext tensorboard
# %tensorboard --logdir /content/DiffSinger/checkpoints/vocalido_v1/lightning_logs
"""

# ============================================================
# Cell 7: ดาวน์โหลด Pre-trained NSF-HiFiGAN Vocoder
# ============================================================
"""
# NSF-HiFiGAN is required for waveform generation
!mkdir -p /content/nsf_hifigan
!wget -q https://github.com/openvpi/vocoders/releases/download/nsf-hifigan-44.1k-hop512-128bin-2024.02/nsf_hifigan_44.1k_hop512_128bin_2024.02.zip -O /tmp/vocoder.zip
!unzip -q /tmp/vocoder.zip -d /content/nsf_hifigan/
print("Vocoder downloaded!")
"""

# ============================================================
# Cell 8: Export เป็น ONNX (หลังเทรนเสร็จ)
# ============================================================
"""
!cd /content/DiffSinger && python scripts/export_onnx.py \\
    --exp_name vocalido_v1 \\
    --out /content/vocalido_onnx/

# จะได้ไฟล์:
# - linguistic.onnx
# - dur.onnx  
# - pitch.onnx
# - acoustic.onnx
# + vocoder: tgm_hifigan.onnx

print("ONNX models exported!")
"""

# ============================================================
# Cell 9: Upload กลับ Google Cloud Storage
# ============================================================
"""
!gsutil -m cp -r /content/vocalido_onnx gs://vocalido-master-corpus-v1/output/onnx/
print("✅ ONNX models uploaded to GCS!")
print("ดาวน์โหลดกลับ Mac ด้วย:")
print("gsutil -m cp -r gs://vocalido-master-corpus-v1/output/onnx/ ./vocalido-server/checkpoints/tiger_v106/")
"""

# ============================================================
# Cell 10: ทดสอบ Inference บน Colab
# ============================================================
"""
import numpy as np
import soundfile as sf
from inference.ds_acoustic import DiffSingerAcousticInfer

infer = DiffSingerAcousticInfer(
    config_path='usr/configs/vocalido.yaml',
    ckpt_path='checkpoints/vocalido_v1/model_ckpt_best.pt'
)

# ทดสอบร้อง "Do Re Mi Fa Sol"
test_input = {
    'notes': [
        {'midi': 60, 'duration': 0.5, 'lyric': 'do'},
        {'midi': 62, 'duration': 0.5, 'lyric': 're'},
        {'midi': 64, 'duration': 0.5, 'lyric': 'mi'},
        {'midi': 65, 'duration': 0.5, 'lyric': 'fa'},
        {'midi': 67, 'duration': 0.5, 'lyric': 'sol'},
    ]
}

audio = infer.infer(test_input)
sf.write('/content/test_singing.wav', audio, 44100)

# เล่นเสียงใน Colab
from IPython.display import Audio
Audio('/content/test_singing.wav')
"""
