import json
import sys
import os
import subprocess

target_time = "2026-06-03T02:00:00Z"
log_file = "/Users/paisan/.gemini/antigravity/brain/694b6c6d-6ab6-432b-8cc1-6be1f8e8d8c8/.system_generated/logs/transcript.jsonl"
repo_dir = "/Users/paisan/vocamind-projects/Memolody_V2"

modified_files = set()
with open(log_file, "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            if "tool_calls" in data:
                for call in data["tool_calls"]:
                    name = call.get("name")
                    if name in ["replace_file_content", "multi_replace_file_content", "write_to_file"]:
                        args = call.get("args", {})
                        # args values might be JSON-encoded strings
                        target = args.get("TargetFile", "")
                        if isinstance(target, str) and target.startswith('"'):
                            target = json.loads(target)
                        
                        if target.startswith(repo_dir):
                            modified_files.add(target)
        except Exception as e:
            pass

print(f"Found {len(modified_files)} modified files in the transcript.")
for f in modified_files:
    print(f)
