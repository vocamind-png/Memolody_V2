"""
[Scorelens-Engine V2] Typography Extractor
==========================================
Extracts text and expression marks from the score image:
  - Title / Composer (above first system)
  - Tempo markings (e.g., ♩= 60, Allegro)
  - Expression marks (p, f, mf, ff, pp, rit., accel.)
  - Articulation anchors (Staccato dots, Accent marks)

Uses pytesseract (Tesseract OCR) for text and OpenCV blob detection
for graphical articulation marks.

Install: conda run -n memolody pip install pytesseract pillow
         brew install tesseract
"""

import re
import cv2
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from Scorelens_Engine_V2.utils import get_logger

logger = get_logger(__name__)

# Try to import pytesseract; gracefully degrade if not installed
TESSERACT_AVAILABLE = False
try:
    import pytesseract
    from PIL import Image as PILImage
    # ── Explicitly set Tesseract binary (Homebrew on Apple Silicon) ──────────
    import shutil
    _tess_candidates = [
        '/opt/homebrew/bin/tesseract',   # Apple Silicon Homebrew
        '/usr/local/bin/tesseract',       # Intel Homebrew
        shutil.which('tesseract') or '',
    ]
    for _path in _tess_candidates:
        if _path and shutil.os.path.isfile(_path):
            pytesseract.pytesseract.tesseract_cmd = _path
            break
    # Quick smoke test
    pytesseract.get_tesseract_version()
    TESSERACT_AVAILABLE = True
    logger.info("[Typography] Tesseract ready at: %s", pytesseract.pytesseract.tesseract_cmd)
except Exception as _tess_err:
    TESSERACT_AVAILABLE = False
    logger.warning("[Typography] Tesseract not available: %s — Text extraction disabled.", repr(_tess_err))



# ─── Data Models ────────────────────────────────────────────────────────────

@dataclass
class TextRegion:
    """A detected text block on the score."""
    text: str
    role: str           # 'title', 'composer', 'tempo', 'expression', 'lyric', 'unknown'
    x: float            # left pixel
    y: float            # top pixel
    width: float
    height: float
    confidence: float   # 0.0 – 1.0
    font_size_est: float = 0.0   # estimated font size in points (relative to staff_space)


@dataclass
class ArticulationMark:
    """A graphical articulation mark (staccato dot, accent, fermata)."""
    mark_type: str      # 'staccato', 'accent', 'fermata', 'tenuto'
    x: float
    y: float
    anchor_note_id: Optional[int] = None  # linked note index, if resolved


@dataclass
class TypographyResult:
    title: Optional[str] = None
    composer: Optional[str] = None
    tempo_text: Optional[str] = None
    tempo_bpm: Optional[int] = None
    time_signature: Optional[str] = None
    expression_marks: List[TextRegion] = field(default_factory=list)
    articulations: List[ArticulationMark] = field(default_factory=list)
    all_text_regions: List[TextRegion] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "composer": self.composer,
            "tempo_text": self.tempo_text,
            "tempo_bpm": self.tempo_bpm,
            "time_signature": self.time_signature,
            "expression_marks": [
                {"text": r.text, "role": r.role, "x": r.x, "y": r.y,
                 "confidence": r.confidence}
                for r in self.expression_marks
            ],
            "articulations": [
                {"type": a.mark_type, "x": a.x, "y": a.y}
                for a in self.articulations
            ],
        }


# ─── Helpers ────────────────────────────────────────────────────────────────

# Expression mark vocabulary
EXPRESSION_VOCAB = re.compile(
    r'\b(pp|ppp|p|mp|mf|f|ff|fff|sfz|sf|fp|'
    r'rit\.|ritard\.|rall\.|rallent\.|accel\.|'
    r'cresc\.|decresc\.|dim\.|poco|molto|sempre|'
    r'legato|staccato|cantabile|espressivo|'
    r'largo|lento|adagio|andante|moderato|allegretto|'
    r'allegro|vivace|presto|prestissimo)\b',
    re.IGNORECASE
)

TEMPO_BPM_PATTERN = re.compile(r'[♩♪♫♬=]\s*=?\s*(\d{2,3})')
TEMPO_WORD_PATTERN = re.compile(
    r'\b(Largo|Lento|Adagio|Andante|Moderato|Allegretto|Allegro|Vivace|Presto)\b',
    re.IGNORECASE
)

# Time Signature Pattern: Detects 4/4, 3/4, 6/8, or even single digits that might be parts of a signature
TIME_SIGNATURE_PATTERN = re.compile(r'\b([23456789]|[234][248]|12/8|C|𝄴)\b')


def _to_role(text: str, y: float, first_system_y: float, staff_space: float) -> str:
    """Classify a text block's role based on content and position."""
    text_strip = text.strip()

    # Above the first system → title or composer
    if y < first_system_y - staff_space * 3:
        if len(text_strip) > 3 and text_strip[0].isupper():
            return 'title'
        return 'composer'

    # Time Signature (Usually at the beginning of systems)
    if TIME_SIGNATURE_PATTERN.match(text_strip):
        return 'time_sig'

    # Tempo / BPM
    if TEMPO_BPM_PATTERN.search(text_strip) or TEMPO_WORD_PATTERN.match(text_strip):
        return 'tempo'

    # Expression vocab
    if EXPRESSION_VOCAB.search(text_strip):
        return 'expression'

    return 'unknown'


# ─── Main Extraction ─────────────────────────────────────────────────────────

def extract_typography(
    image: np.ndarray,
    first_system_y: float = 0.0,
    staff_space: float = 10.0,
) -> TypographyResult:
    """
    Extract typography metadata from a score image.

    Parameters
    ----------
    image : np.ndarray
        BGR image (as loaded by cv2).
    first_system_y : float
        Y-pixel coordinate of the top of the first system (from LayoutMap).
    staff_space : float
        Average staff space in pixels (from LayoutMap).

    Returns
    -------
    TypographyResult
    """
    result = TypographyResult()

    if not TESSERACT_AVAILABLE:
        logger.warning("[Typography] Skipping OCR — pytesseract not available.")
        return result

    # ── Pre-process for OCR ──────────────────────────────────────────────────
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Invert if background is dark (unlikely for sheet music, but be safe)
    if np.mean(gray) < 128:
        gray = cv2.bitwise_not(gray)

    # Binarize with Otsu threshold for cleaner text
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    pil_img = PILImage.fromarray(binary)

    # ── OCR with pytesseract ─────────────────────────────────────────────────
    try:
        data = pytesseract.image_to_data(
            pil_img,
            lang='eng',
            config='--psm 11 --oem 3',  # Sparse text mode
            output_type=pytesseract.Output.DICT
        )
    except Exception as e:
        logger.warning("[Typography] OCR failed: %s", str(e))
        return result

    text_regions: List[TextRegion] = []
    n = len(data['text'])
    for i in range(n):
        raw_text = data['text'][i].strip()
        conf = int(data['conf'][i])
        if not raw_text or conf < 30:
            continue

        x = float(data['left'][i])
        y = float(data['top'][i])
        w = float(data['width'][i])
        h = float(data['height'][i])
        confidence = conf / 100.0

        role = _to_role(raw_text, y, first_system_y, staff_space)

        # Estimate font size relative to staff_space (1 unit = 1 staff space)
        font_size_est = round(h / staff_space, 2) if staff_space > 0 else 0.0

        region = TextRegion(
            text=raw_text,
            role=role,
            x=x, y=y,
            width=w, height=h,
            confidence=confidence,
            font_size_est=font_size_est,
        )
        text_regions.append(region)

    result.all_text_regions = text_regions

    # ── Parse Title & Composer ───────────────────────────────────────────────
    header_regions = [r for r in text_regions if r.y < first_system_y]
    if header_regions:
        # Largest font size above first system → Title
        header_regions_sorted = sorted(header_regions, key=lambda r: r.font_size_est, reverse=True)
        result.title = header_regions_sorted[0].text if header_regions_sorted else None

        # Second-largest → Composer (if exists)
        composer_cands = [r for r in header_regions_sorted[1:] if r.font_size_est > 0.5]
        if composer_cands:
            result.composer = composer_cands[0].text

    # ── Parse Tempo ──────────────────────────────────────────────────────────
    for r in text_regions:
        bpm_match = TEMPO_BPM_PATTERN.search(r.text)
        if bpm_match:
            result.tempo_text = r.text
            result.tempo_bpm = int(bpm_match.group(1))
            break
        word_match = TEMPO_WORD_PATTERN.match(r.text)
        if word_match and not result.tempo_text:
            result.tempo_text = r.text

    # ── Parse Expression Marks ───────────────────────────────────────────────
    result.expression_marks = [r for r in text_regions if r.role == 'expression']

    # ── Parse Time Signature (Look for stacked numbers near system starts) ───
    time_sig_regions = [r for r in text_regions if r.role == 'time_sig']
    if time_sig_regions:
        # Group vertically aligned numbers (X distance < 1 staff space)
        time_sig_regions_sorted = sorted(time_sig_regions, key=lambda r: r.x)
        combined_sigs = []
        skip_idx = set()
        for i in range(len(time_sig_regions_sorted)):
            if i in skip_idx: continue
            r1 = time_sig_regions_sorted[i]
            # Look for another number directly below or above it
            for j in range(i + 1, len(time_sig_regions_sorted)):
                r2 = time_sig_regions_sorted[j]
                if abs(r1.x - r2.x) < staff_space:
                    # Potential stacked signature (e.g., 4 over 4)
                    top, bot = (r1, r2) if r1.y < r2.y else (r2, r1)
                    combined_sigs.append(f"{top.text}/{bot.text}")
                    skip_idx.add(j)
                    break
            else:
                # Handle special cases like 'C' or '𝄴'
                if r1.text.upper() in ['C', '𝄴']:
                    combined_sigs.append("4/4") # Common time
                
        if combined_sigs:
            result.time_signature = combined_sigs[0] # Take the first one detected
            logger.info("[Typography] Detected Time Signature: %s", result.time_signature)

    # ── Detect Articulation Marks (staccato dots) using blob detection ────────
    result.articulations = _detect_articulations(image, staff_space)

    logger.info(
        "[Typography] Title: %s | Composer: %s | Tempo: %s (%s BPM) | "
        "Expressions: %d | Articulations: %d",
        result.title, result.composer, result.tempo_text, result.tempo_bpm,
        len(result.expression_marks), len(result.articulations)
    )

    return result


def _detect_articulations(image: np.ndarray, staff_space: float) -> List[ArticulationMark]:
    """
    Detect staccato dots, accent marks, and fermata symbols
    using OpenCV SimpleBlobDetector and contour analysis.
    """
    marks: List[ArticulationMark] = []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)

    # ── Staccato dots: small circular blobs ──────────────────────────────────
    dot_radius_min = max(1, int(staff_space * 0.15))
    dot_radius_max = max(2, int(staff_space * 0.45))

    params = cv2.SimpleBlobDetector_Params()
    params.filterByArea = True
    params.minArea = np.pi * dot_radius_min ** 2
    params.maxArea = np.pi * dot_radius_max ** 2
    params.filterByCircularity = True
    params.minCircularity = 0.65
    params.filterByInertia = True
    params.minInertiaRatio = 0.5

    detector = cv2.SimpleBlobDetector_create(params)
    keypoints = detector.detect(binary)

    for kp in keypoints:
        marks.append(ArticulationMark(
            mark_type='staccato',
            x=round(kp.pt[0], 1),
            y=round(kp.pt[1], 1),
        ))

    # ── Accent marks: small triangular/wedge shapes ───────────────────────────
    # Use contour-based detection on a morphologically processed binary
    ker_accent = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3))
    accent_map = cv2.erode(binary, ker_accent)
    contours, _ = cv2.findContours(accent_map, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 4 or area > staff_space ** 2 * 0.3:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        aspect = w / (h + 1e-6)
        # Accent marks are wider than tall with pointed shape
        if 1.5 < aspect < 5.0 and h < staff_space * 0.4:
            perimeter = cv2.arcLength(cnt, True)
            circularity = 4 * np.pi * area / (perimeter ** 2 + 1e-9)
            if circularity < 0.4:  # Non-circular (elongated wedge)
                marks.append(ArticulationMark(
                    mark_type='accent',
                    x=round(float(x + w / 2), 1),
                    y=round(float(y + h / 2), 1),
                ))

    return marks
