#!/bin/bash
TARGET_DIR="/Users/paisan/vocamind-projects/Memolody_V2/english_voicebanks"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

echo "Downloading TIGER..."
curl -L -O https://github.com/spicytigermeat/tiger_diffsinger/releases/download/v106/TIGER_DS_v106_PACK.zip
unzip -q TIGER_DS_v106_PACK.zip -d TIGER
rm TIGER_DS_v106_PACK.zip

echo "Downloading CANARY..."
curl -L -O https://github.com/spicytigermeat/canary_diffsinger/releases/download/v106/Canary_DS_v106_PACK.zip
unzip -q Canary_DS_v106_PACK.zip -d CANARY
rm Canary_DS_v106_PACK.zip

echo "Downloading Nishiren Gard..."
curl -L -O https://github.com/Gardanana/Nishiren-AI-Diffsinger/releases/download/v2.0/Nishiren.Diffsinger.v2.0.zip
unzip -q Nishiren.Diffsinger.v2.0.zip -d Nishiren
rm Nishiren.Diffsinger.v2.0.zip

echo "Downloads and extractions complete. Check the directory: $TARGET_DIR"
