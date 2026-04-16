#!/bin/bash
# Audiveris OMR Bridge for Memolody ScoreLens
# Usage: ./audiveris-omr.sh <input_image_path> <output_xml_path>

AUDIVERIS_DIR="/tmp/audiveris-omr"
INPUT_IMAGE="$1"
OUTPUT_DIR=$(dirname "$2")
OUTPUT_FILENAME=$(basename "$2" .xml)

if [ -z "$INPUT_IMAGE" ] || [ -z "$2" ]; then
  echo "Usage: $0 <input_image> <output_xml_path>"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Run Audiveris in batch mode
cd "$AUDIVERIS_DIR"
./gradlew run --args="-batch -export -output $OUTPUT_DIR $INPUT_IMAGE" 2>/dev/null

# Find the output .mxl file
BASENAME=$(basename "$INPUT_IMAGE" | sed 's/\.[^.]*$//')
MXL_FILE="$OUTPUT_DIR/${BASENAME}.mxl"

if [ -f "$MXL_FILE" ]; then
  # Extract XML from .mxl (zip)
  TEMP_DIR=$(mktemp -d)
  unzip -o "$MXL_FILE" -d "$TEMP_DIR" > /dev/null 2>&1
  XML_FILE=$(find "$TEMP_DIR" -name "*.xml" ! -path "*/META-INF/*" | head -1)
  
  if [ -f "$XML_FILE" ]; then
    cp "$XML_FILE" "$2"
    echo "SUCCESS: $2"
    rm -rf "$TEMP_DIR" "$MXL_FILE" "$OUTPUT_DIR/${BASENAME}.omr" "$OUTPUT_DIR/${BASENAME}-"*.log
    exit 0
  fi
  rm -rf "$TEMP_DIR"
fi

echo "ERROR: Audiveris failed to process $INPUT_IMAGE"
exit 1
