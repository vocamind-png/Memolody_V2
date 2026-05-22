import re

with open("ScoreLens_V3_Core/pipeline.py", "r") as f:
    code = f.read()

# 1. Simplify _normalize_input to return ALL pages
code = re.sub(
    r"stats\['pages_from_input'\] = len\(pages\)\s*return pages\[0\]  # ใช้หน้าแรก",
    "stats['pages_from_input'] = len(pages)\n            return pages",
    code
)
code = re.sub(
    r"def _normalize_input\(self, path: str, stats: dict, errors: list\) -> Optional\[str\]:",
    "def _normalize_input(self, path: str, stats: dict, errors: list) -> list[str]:",
    code
)
code = re.sub(
    r"stats\['image_size'\] = f'\{img.shape\[1\]}x\{img.shape\[0\]\}'\s*return path",
    "stats['image_size'] = f'{img.shape[1]}x{img.shape[0]}'\n            return [path]",
    code
)

with open("ScoreLens_V3_Core/pipeline.py", "w") as f:
    f.write(code)

