"""
ScoreLens OMR Engine V2.0
Enhanced Optical Music Recognition by Vocamind

Based on Oemer by BreezeWhite (MIT License)
https://github.com/BreezeWhite/oemer

V2 Enhancements:
- Layout Extractor: staff_space, system_distance, page margins
- Typography OCR: title, composer, tempo, expression marks
- Multi-Voice Analyzer: stem-up/down voice separation
- Cross-Page Stitcher: multi-page PDF merge with tie continuity
- JSON Bundle output: layout_map + metadata + voice_analysis
"""

from pathlib import Path

__version__ = "2.0.0"
__engine__ = "ScoreLens-Engine V2"
__based_on__ = "Oemer v0.1.8 by BreezeWhite"

MODULE_PATH = Path(__file__).parent
