---
description: วิธีเทรน Vocalido AI Voice แบบ End-to-End บน Google Colab ด้วย DiffSinger
---

# Vocalido DiffSinger Training Workflow

// turbo-all

## ข้อมูลเบื้องต้น
- **บัญชี Google Cloud:** vocamind@gmail.com
- **Project ID:** gen-lang-client-0560936129  
- **Bucket:** gs://vocalido-master-corpus-v1
- **คุณภาพไฟล์:** 24-bit / 48kHz / Mono PCM
- **จำนวนไฟล์เทรน:** 78 ชิ้น (ตัดแบ่งแล้ว)
- **Framework:** DiffSinger (openvpi)

## สถานะปัจจุบัน
- ❌ โมเดลเก่า (`acoustic_final.ckpt`) เป็นแค่ mel-to-mel autoencoder — ไม่ใช่ DiffSinger จริง
- ✅ ข้อมูลเทรน 78 ไฟล์พร้อมแล้วที่ `/tmp/diffsinger_dataset/`
- ✅ Inference engine (`tiger_engine.py`) พร้อมรับ ONNX models

## ขั้นตอนที่ 1: ติดตั้ง gcloud CLI (ทำครั้งเดียว)
```bash
brew install --cask google-cloud-sdk
gcloud auth login vocamind@gmail.com
gcloud config set project gen-lang-client-0560936129
```

## ขั้นตอนที่ 2: Upload Dataset ไป GCS
```bash
gsutil -m cp -r /tmp/diffsinger_dataset gs://vocalido-master-corpus-v1/diffsinger/
```

## ขั้นตอนที่ 3: เทรนบน Google Colab
1. เปิด https://colab.research.google.com/
2. สร้าง Notebook ใหม่
3. เลือก Runtime > Change runtime type > **T4 GPU**
4. Copy โค้ดจาก `vocalido-server/training/colab_diffsinger_training.py` ทีละ Cell
5. รันตามลำดับ (ใช้เวลาประมาณ 4-8 ชั่วโมงสำหรับ 1000 epochs)

## ขั้นตอนที่ 4: ดึง ONNX Models กลับมาใช้
```bash
# ดาวน์โหลด ONNX จาก GCS
mkdir -p /Users/paisan/vocamind-projects/Memolody_V2/vocalido-server/checkpoints/tiger_v106
gsutil -m cp -r gs://vocalido-master-corpus-v1/output/onnx/* \
  /Users/paisan/vocamind-projects/Memolody_V2/vocalido-server/checkpoints/tiger_v106/
```

## ขั้นตอนที่ 5: ทดสอบ
1. รัน: `cd /Users/paisan/vocamind-projects/Memolody_V2/vocalido-server && python3 tiger_engine.py`
2. ถ้าได้ยินเสียงร้อง "Hello world I love to sing" = สำเร็จ!
3. เปิด `npm run dev` แล้วทดสอบในหน้า Player

## ไฟล์สำคัญ
- `vocalido-server/training/colab_diffsinger_training.py` — Colab notebook
- `vocalido-server/tiger_engine.py` — DiffSinger ONNX inference
- `vocalido-server/main.py` — Server ที่เชื่อม inference กับ Player
- `/tmp/diffsinger_dataset/` — ข้อมูลที่เตรียมพร้อมเทรน
