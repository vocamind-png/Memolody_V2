#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# prepare_colab_upload.sh
# เตรียมไฟล์ทั้งหมดที่ต้อง Upload ขึ้น Google Drive เพื่อเทรนบน Colab
# ═══════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
DIFFSINGER_DIR="${SCRIPT_DIR}/../DiffSinger"
OUTPUT_DIR="${SCRIPT_DIR}/colab_upload"

mkdir -p "${OUTPUT_DIR}"

echo "================================================================"
echo "  Vocalido — เตรียมไฟล์สำหรับ Colab A100 Training"
echo "================================================================"
echo "  Project root : ${PROJECT_ROOT}"
echo "  Output dir   : ${OUTPUT_DIR}"
echo ""

# ── 1. Zip Training Data ─────────────────────────────────────────────
echo "📦 [1/3] Zipping training data..."
DATA_ZIP="${OUTPUT_DIR}/vocalido_data.zip"
if [ -f "${DATA_ZIP}" ]; then
  echo "   ✅ Already exists: ${DATA_ZIP}"
else
  cd "${DIFFSINGER_DIR}/data"
  zip -r "${DATA_ZIP}" vocalido/ vocalido_bin/ -x "*.DS_Store"
  SIZE=$(du -sh "${DATA_ZIP}" | cut -f1)
  echo "   ✅ Created: vocalido_data.zip (${SIZE})"
fi

# ── 2. Zip Latest Checkpoint ─────────────────────────────────────────
echo ""
echo "📦 [2/3] Zipping latest checkpoint..."

LATEST_CKPT=$(ls -t "${DIFFSINGER_DIR}/checkpoints/vocalido_v1/model_ckpt_steps_"*.ckpt 2>/dev/null | head -1)
if [ -z "${LATEST_CKPT}" ]; then
  echo "   ❌ No checkpoint found!"
  exit 1
fi

STEP=$(basename "${LATEST_CKPT}" | grep -o '[0-9]*')
CKPT_ZIP="${OUTPUT_DIR}/checkpoint_${STEP}.zip"

echo "   Latest: $(basename ${LATEST_CKPT})"

if [ -f "${CKPT_ZIP}" ]; then
  echo "   ✅ Already exists: ${CKPT_ZIP}"
else
  CKPT_DIR="${DIFFSINGER_DIR}/checkpoints/vocalido_v1"
  zip -j "${CKPT_ZIP}" \
    "${LATEST_CKPT}" \
    "${CKPT_DIR}/config.yaml" \
    "${CKPT_DIR}/spk_map.json" \
    "${CKPT_DIR}/lang_map.json" \
    "${CKPT_DIR}/dictionary-en.txt" 2>/dev/null || true
  SIZE=$(du -sh "${CKPT_ZIP}" | cut -f1)
  echo "   ✅ Created: checkpoint_${STEP}.zip (${SIZE})"
fi

# ── 3. Zip Vocoder ────────────────────────────────────────────────────
echo ""
echo "📦 [3/3] Checking vocoder..."
VOCODER_NAME="pc_nsf_hifigan_44.1k_hop512_128bin_2025.02"
VOCODER_SRC="${DIFFSINGER_DIR}/checkpoints/${VOCODER_NAME}"
VOCODER_ZIP="${OUTPUT_DIR}/vocoder.zip"

if [ -f "${VOCODER_ZIP}" ]; then
  echo "   ✅ Already exists: ${VOCODER_ZIP}"
elif [ -d "${VOCODER_SRC}" ]; then
  cd "${DIFFSINGER_DIR}/checkpoints"
  zip -r "${VOCODER_ZIP}" "${VOCODER_NAME}/" -x "*.DS_Store"
  SIZE=$(du -sh "${VOCODER_ZIP}" | cut -f1)
  echo "   ✅ Created: vocoder.zip (${SIZE})"
else
  echo "   ⚠️  Vocoder directory not found — Colab will auto-download"
fi

# ── Summary ────────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo "  ✅ เตรียมไฟล์เสร็จแล้ว!"
echo "================================================================"
echo ""
echo "  📁 Upload ไฟล์เหล่านี้ไปยัง Google Drive:"
echo "     Path: MyDrive/vocalido_training/"
echo ""
ls -lh "${OUTPUT_DIR}/"
echo ""
echo "  📓 Notebook อยู่ที่:"
echo "     $(ls ${SCRIPT_DIR}/colab/*.ipynb 2>/dev/null | head -1)"
echo ""
echo "  📋 ขั้นตอนต่อไป:"
echo "     1. Upload ไฟล์ทั้งหมดใน ${OUTPUT_DIR}/ ไปที่ Google Drive/vocalido_training/"
echo "     2. เปิด Vocalido_DiffSinger_A100_Colab.ipynb บน Colab"
echo "     3. เลือก Runtime → A100 GPU"
echo "     4. กด Run All"
echo ""
echo "  ⏱️  เวลาที่ใช้โดยประมาณ (A100):"
echo "     - จาก step ${STEP} → 160,000 steps"
echo "     - A100 เร็วประมาณ 2,000 steps/hr"
REMAINING=$((160000 - STEP))
HOURS=$((REMAINING / 2000))
echo "     - เหลืออีก ~${HOURS} ชั่วโมง (~${REMAINING} steps)"
echo "================================================================"
