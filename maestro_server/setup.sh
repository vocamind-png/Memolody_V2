#!/bin/bash
# Setup script for Maestro Neural Server (MIDI-DDSP)

echo "🎵 Setting up Maestro Neural Server..."

# 1. Setup Python environment
echo "🐍 Setting up Python venv..."
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
echo "📦 Installing neural dependencies (this may take a while)..."
pip install --upgrade pip
pip install -r requirements.txt

# Note: midi-ddsp requires libsndfile on macOS which is usually installed via brew
if ! command -v brew &> /dev/null
then
    echo "Brew not found, skipping libsndfile install. If you get soundfile errors, please install libsndfile."
else
    brew install libsndfile
fi

echo "🚀 Setup complete! Run the neural server with: source .venv/bin/activate && python3 main.py"
