#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Vocalido SVS Server — Setup Script
#  Run once to install all dependencies and prepare directories.
#  Usage: bash setup.sh
# ═══════════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Vocalido SVS Server — Environment Setup           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Python environment ─────────────────────────────────────────
if [ -d ".venv" ]; then
    echo "✅ .venv already exists — activating..."
else
    echo "📦 Creating .venv..."
    python3 -m venv .venv
fi
source .venv/bin/activate
echo "   Python: $(python --version)"
echo "   Pip:    $(pip --version)"
echo ""

# ── 2. Core dependencies ──────────────────────────────────────────
echo "📥 Installing core dependencies..."
pip install --upgrade pip -q
pip install fastapi==0.100.0 uvicorn==0.22.0 "pydantic>=2.5.0" python-multipart==0.0.6 -q

# ── 3. Audio processing ───────────────────────────────────────────
echo "📥 Installing audio processing libraries..."
pip install "librosa>=0.10.0" "soundfile>=0.12.1" "scipy>=1.11.0" "numpy>=1.24.0" -q
pip install "pydub>=0.25.1" -q

# ── 4. ONNX Runtime (for TIGER DiffSinger) ───────────────────────
echo "📥 Installing ONNX Runtime..."
pip install "onnxruntime>=1.16.0" -q

# ── 5. G2P English phonemizer (for TIGER) ────────────────────────
echo "📥 Installing g2p_en (English phonemizer)..."
pip install "g2p_en>=2.1.0" -q

# ── 6. MIDI parsing ───────────────────────────────────────────────
echo "📥 Installing pretty_midi..."
pip install "pretty_midi>=0.2.10" -q

# ── 7. PyMuPDF for PDF preview ────────────────────────────────────
echo "📥 Installing PyMuPDF..."
pip install "PyMuPDF>=1.23.0" -q

# ── 8. PyTorch (optional — for custom trained model) ─────────────
echo ""
echo "❓ Install PyTorch? (needed for custom-trained vocalido model)"
echo "   [y] Yes — install CPU version"
echo "   [n] No  — skip (TIGER ONNX still works without it)"
read -r -p "   Choice [y/n]: " choice
if [[ "$choice" =~ ^[Yy]$ ]]; then
    # Detect Apple Silicon
    if [[ "$(uname -m)" == "arm64" ]]; then
        echo "📥 Installing PyTorch for Apple Silicon (MPS)..."
        pip install torch torchvision torchaudio -q
    else
        echo "📥 Installing PyTorch CPU-only..."
        pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu -q
    fi
    echo "✅ PyTorch installed!"
else
    echo "⏭  Skipping PyTorch — TIGER ONNX engine will be used."
fi

# ── 9. ffmpeg check (for MP3 export via pydub) ───────────────────
echo ""
if command -v ffmpeg &>/dev/null; then
    echo "✅ ffmpeg found: $(ffmpeg -version 2>&1 | head -1)"
else
    echo "⚠️  ffmpeg not found — MP3 export will fallback to WAV."
    echo "   Install with: brew install ffmpeg"
fi

# ── 10. Prepare directories ───────────────────────────────────────
echo ""
echo "📁 Preparing directories..."
mkdir -p renders
mkdir -p voicebanks/female/ophelia_en_test
mkdir -p voicebanks/male
mkdir -p checkpoints

# ── 11. Voice source check ────────────────────────────────────────
echo ""
VOICE_DEST="voicebanks/singeria_render.wav"
if [ -f "$VOICE_DEST" ]; then
    echo "✅ Voice source found: $VOICE_DEST"
elif [ -f "$HOME/Downloads/singeria_render.wav" ]; then
    echo "📋 Copying voice source from Downloads..."
    cp "$HOME/Downloads/singeria_render.wav" "$VOICE_DEST"
    echo "✅ Copied to: $VOICE_DEST"
else
    echo "⚠️  Voice source (singeria_render.wav) not found."
    echo "   Server will use sine-wave fallback."
    echo "   → Place your voice WAV file at: $(pwd)/$VOICE_DEST"
fi

# ── 12. TIGER model check ─────────────────────────────────────────
echo ""
TIGER_ACOUSTIC="checkpoints/tiger_v106/dsacoustic/acoustic.onnx"
if [ -f "$TIGER_ACOUSTIC" ]; then
    SIZE=$(du -sh "$TIGER_ACOUSTIC" | cut -f1)
    echo "✅ TIGER DiffSinger v106 acoustic model: $SIZE"
else
    echo "❌ TIGER acoustic.onnx not found!"
    echo "   → Expected at: $(pwd)/$TIGER_ACOUSTIC"
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Setup Complete!                                    ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║   Start server: source .venv/bin/activate            ║"
echo "║                 python -m uvicorn main:app --reload  ║"
echo "║                 --port 5001                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
