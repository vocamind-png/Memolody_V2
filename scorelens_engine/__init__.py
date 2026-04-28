"""
ScoreLens OMR Engine v1.0
Enhanced Optical Music Recognition by Vocamind

Based on Oemer by BreezeWhite (MIT License)
https://github.com/BreezeWhite/oemer

Enhancements:
- Multi-staff support (3-20 staves for Orchestra scores)
- Improved rhythm extraction with Music Theory validation
- Lyrics/text OCR extraction
- Better key signature detection
"""

from pathlib import Path

__version__ = "1.0.0"
__engine__ = "ScoreLens"
__based_on__ = "Oemer v0.1.8 by BreezeWhite"

MODULE_PATH = Path(__file__).parent
