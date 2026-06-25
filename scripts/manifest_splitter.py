#!/usr/bin/env python3
"""
Memolody V2 — Manifest Splitter
================================
Downloads the full manifest.json (~138MB) and splits it into:
  1. manifest_index.json   — metadata only (no xmlData), ~1.5MB
  2. manifest_chunk_N.json — full entries with xmlData, up to 10,000 songs each

Usage:
    python3 scripts/manifest_splitter.py

Output directory: ./manifest_output/
No external dependencies — uses only stdlib (urllib, json, os).
"""

import json
import os
import sys
import urllib.request
import time

# ── Configuration ────────────────────────────────────────────────────────────
MANIFEST_URL = "https://storage.googleapis.com/memolody-vault/manifest.json"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "manifest_output")
CHUNK_SIZE = 10_000  # songs per chunk file

# Fields to keep in the lightweight index (everything EXCEPT xmlData)
INDEX_FIELDS = [
    "id", "title", "artist", "bpm", "key", "duration",
    "coverUrl", "isPremium", "category", "difficulty",
    "difficultyGrade", "source",
]


def format_size(num_bytes: int) -> str:
    """Human-readable file size."""
    for unit in ("B", "KB", "MB", "GB"):
        if abs(num_bytes) < 1024:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024  # type: ignore[assignment]
    return f"{num_bytes:.1f} TB"


def download_manifest(url: str) -> bytes:
    """Download the manifest with progress reporting."""
    print(f"⬇  Downloading manifest from:\n   {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "MemolodySplitter/1.0"})
    response = urllib.request.urlopen(req, timeout=300)

    content_length = response.headers.get("Content-Length")
    total = int(content_length) if content_length else None

    data = bytearray()
    block_size = 1024 * 256  # 256 KB blocks
    start = time.time()

    while True:
        block = response.read(block_size)
        if not block:
            break
        data.extend(block)

        if total:
            pct = len(data) / total * 100
            elapsed = time.time() - start
            speed = len(data) / elapsed if elapsed > 0 else 0
            sys.stdout.write(
                f"\r   {format_size(len(data))} / {format_size(total)}  "
                f"({pct:.1f}%)  {format_size(int(speed))}/s"
            )
            sys.stdout.flush()
        else:
            sys.stdout.write(f"\r   {format_size(len(data))} downloaded...")
            sys.stdout.flush()

    print(f"\n✅ Download complete: {format_size(len(data))}")
    return bytes(data)


def extract_songs(manifest: dict) -> list[dict]:
    """Extract the songs array from the manifest structure."""
    # Try common paths: data.songs, songs, or top-level array
    if isinstance(manifest, list):
        return manifest
    if "data" in manifest and "songs" in manifest["data"]:
        return manifest["data"]["songs"]
    if "songs" in manifest:
        return manifest["songs"]
    raise ValueError("Cannot find songs array in manifest. Keys: " + str(list(manifest.keys())))


def strip_to_index_entry(song: dict) -> dict:
    """
    Extract only index-level fields from a song entry.
    Song entries can be flat {id, title, ...} or wrapped {metadata: {id, title, ...}, xmlData: ...}.
    """
    # Unwrap if wrapped in metadata/xmlData structure
    meta = song.get("metadata", song)

    entry = {}
    for field in INDEX_FIELDS:
        if field in meta:
            entry[field] = meta[field]
    return entry


def build_chunk_entry(song: dict) -> dict:
    """Return the full song entry for a chunk file (preserves xmlData)."""
    # Keep the original structure as-is
    return song


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"📁 Output directory: {OUTPUT_DIR}\n")

    # ── Step 1: Download ─────────────────────────────────────────────────────
    raw_bytes = download_manifest(MANIFEST_URL)
    print("\n🔄 Parsing JSON...")
    manifest = json.loads(raw_bytes)

    # Preserve top-level metadata (version, lastUpdated, etc.)
    top_level_meta = {}
    for k, v in manifest.items():
        if k not in ("data", "songs"):
            top_level_meta[k] = v

    songs = extract_songs(manifest)
    print(f"   Found {len(songs):,} songs\n")

    # ── Step 2: Build manifest_index.json ────────────────────────────────────
    print("📝 Building manifest_index.json (metadata only, no xmlData)...")
    index_songs = [strip_to_index_entry(s) for s in songs]
    index_doc = {
        **top_level_meta,
        "type": "index",
        "totalChunks": (len(songs) + CHUNK_SIZE - 1) // CHUNK_SIZE,
        "data": {"songs": index_songs},
    }

    index_path = os.path.join(OUTPUT_DIR, "manifest_index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_doc, f, ensure_ascii=False, separators=(",", ":"))
    index_size = os.path.getsize(index_path)
    print(f"   ✅ {index_path}  →  {format_size(index_size)}")

    # ── Step 3: Build chunk files ────────────────────────────────────────────
    num_chunks = (len(songs) + CHUNK_SIZE - 1) // CHUNK_SIZE
    print(f"\n📦 Splitting into {num_chunks} chunk(s) of up to {CHUNK_SIZE:,} songs each...")

    chunk_sizes = []
    for i in range(num_chunks):
        start = i * CHUNK_SIZE
        end = min(start + CHUNK_SIZE, len(songs))
        chunk_songs = [build_chunk_entry(s) for s in songs[start:end]]

        chunk_doc = {
            **top_level_meta,
            "type": "chunk",
            "chunkIndex": i,
            "totalChunks": num_chunks,
            "data": {"songs": chunk_songs},
        }

        chunk_path = os.path.join(OUTPUT_DIR, f"manifest_chunk_{i}.json")
        with open(chunk_path, "w", encoding="utf-8") as f:
            json.dump(chunk_doc, f, ensure_ascii=False, separators=(",", ":"))

        size = os.path.getsize(chunk_path)
        chunk_sizes.append(size)
        print(f"   ✅ manifest_chunk_{i}.json  →  {format_size(size)}  ({end - start:,} songs)")

    # ── Summary ──────────────────────────────────────────────────────────────
    total_chunk_size = sum(chunk_sizes)
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"   Original manifest.json:    {format_size(len(raw_bytes))}")
    print(f"   manifest_index.json:       {format_size(index_size)}")
    print(f"   Chunk files ({num_chunks}):          {format_size(total_chunk_size)}")
    print(f"   Total songs:               {len(songs):,}")
    print(f"   Songs per chunk:           {CHUNK_SIZE:,}")
    print("=" * 60)
    print(f"\n🎉 Done! Files written to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
