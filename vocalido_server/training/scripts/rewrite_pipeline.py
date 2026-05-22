import re
with open("ScoreLens_V3_Core/pipeline.py", "r") as f:
    code = f.read()

# 1. Modify _normalize_input to return list of paths
code = re.sub(
    r"def _normalize_input\(self, path: str, stats: dict, errors: list\) -> Optional\[str\]:(.*?)return pages\[0\]  # ใช้หน้าแรก(.*?)return None",
    r"def _normalize_input(self, path: str, stats: dict, errors: list) -> list[str]:\1return pages\2return []",
    code, flags=re.DOTALL
)

# Replace the single page execution in process() with a loop
# Since this is complex, we will just use replace_file_content or multi_replace_file_content directly.
