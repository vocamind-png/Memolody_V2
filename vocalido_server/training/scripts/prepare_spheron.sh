#!/bin/bash
set -e

echo "📦 Preparing files for Spheron RTX 5090 Cloud Training..."
mkdir -p spheron_upload/ScoreLens_V3_Core/3_detector/weights
mkdir -p spheron_upload/ScoreLens_V3_Core/1_generator

# Copy code
cp ScoreLens_V3_Core/3_detector/train_round4.py spheron_upload/ScoreLens_V3_Core/3_detector/
cp ScoreLens_V3_Core/3_detector/model.py spheron_upload/ScoreLens_V3_Core/3_detector/

# Copy weights (start from best_before_round4.pt)
cp ScoreLens_V3_Core/3_detector/weights/best_before_round4.pt spheron_upload/ScoreLens_V3_Core/3_detector/weights/best.pt

# Copy dataset
cp -r ScoreLens_V3_Core/1_generator/real_dataset spheron_upload/ScoreLens_V3_Core/1_generator/

# Create a setup script for the cloud VM
cat << 'EOF' > spheron_upload/setup_and_train.sh
#!/bin/bash
echo "Installing dependencies..."
pip install torch torchvision opencv-python-headless numpy

echo "Starting training..."
python ScoreLens_V3_Core/3_detector/train_round4.py
EOF
chmod +x spheron_upload/setup_and_train.sh

# Zip it
echo "🗜️ Zipping files (this will be around 110-120MB)..."
zip -r spheron_training_pack.zip spheron_upload/ > /dev/null

# Clean up
rm -rf spheron_upload

echo "✅ Done! You can now upload 'spheron_training_pack.zip' to your Spheron VM."
