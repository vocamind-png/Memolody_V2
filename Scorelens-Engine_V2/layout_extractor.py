"""
[Scorelens-Engine V2] Layout Extractor
=======================================
Extracts pixel-accurate layout metadata from detected staves, including:
  - staff_space      : distance between lines within a staff (unit size)
  - system_distance  : vertical gap between staff systems
  - page_margins     : left/right/top/bottom bounds (relative coordinates 0.0–1.0)
  - system_breaks    : list of y-positions where a new system begins
  - bounding_boxes   : per-staff pixel bounding boxes

Output is a LayoutMap dict that is bundled into the API JSON response alongside MusicXML.
"""

import numpy as np
from dataclasses import dataclass, asdict, field
from typing import List, Optional

from Scorelens_Engine_V2 import layers
from Scorelens_Engine_V2.utils import get_logger

logger = get_logger(__name__)


# ─── Data Models ────────────────────────────────────────────────────────────

@dataclass
class StaffBox:
    """Pixel bounding box and metrics for a single staff."""
    track: int           # Staff track index within its system (0 = top)
    group: int           # System (row) index on the page
    x_left: float
    y_upper: float
    x_right: float
    y_lower: float
    staff_space: float   # Average distance between adjacent lines (unit size)
    line_count: int      # Should be 5


@dataclass
class SystemInfo:
    """Metrics for one complete system (group of staves sharing bar lines)."""
    group: int
    y_top: float         # Top pixel of the topmost staff in this system
    y_bottom: float      # Bottom pixel of the bottommost staff in this system
    x_left: float
    x_right: float
    track_count: int     # Number of staves per system (e.g., 2 for piano grand staff)
    measure_count: int = 0  # Number of measures detected in this system
    staves: List[StaffBox] = field(default_factory=list)


@dataclass
class LayoutMap:
    """Complete layout metadata for one scanned page."""
    image_width: int
    image_height: int
    # Page margins as relative coordinates (0.0 – 1.0)
    margin_left: float
    margin_right: float
    margin_top: float
    margin_bottom: float
    # Staff metrics (averaged across all staves)
    avg_staff_space: float    # pixels between adjacent staff lines
    avg_system_distance: float  # pixels between consecutive systems
    staff_height_ratio: float   # ratio of total staff heights to page height
    # Per-system data
    systems: List[SystemInfo] = field(default_factory=list)
    # Y-coordinates where a new system begins (pixel values)
    system_break_ys: List[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ─── Core Extraction ────────────────────────────────────────────────────────

def extract_layout(staffs: np.ndarray, img_shape: tuple, barlines: List = None) -> LayoutMap:
    """
    Build a LayoutMap from the detected Staff grid.

    Parameters
    ----------
    staffs : np.ndarray
        2-D array of Staff objects (shape: [n_zones, n_staves_per_zone])
        as returned by staffline_extraction.extract().
    img_shape : tuple
        (height, width) of the original image used for prediction.

    Returns
    -------
    LayoutMap
    """
    img_h, img_w = img_shape[:2]

    # staffs shape: (zones, staves_in_zone)
    # Transpose so rows = staves across the page, cols = zones
    if staffs.size == 0:
        return LayoutMap(image_width=img_w, image_height=img_h, margin_left=0, margin_right=0, margin_top=0, margin_bottom=0, avg_staff_space=10, avg_system_distance=0, staff_height_ratio=0)
    
    staves_per_zone = staffs.shape[1]

    # ── 1. Collect per-group (system) data ──────────────────────────────────
    # Group index = staff.group, Track index = staff.track
    # Use the first zone column for system-level measurements (representative)
    first_col = staffs[0]  # One representative staff per system row

    groups: dict[int, list] = {}
    for zone_col in staffs:        # iterate over zones (horizontal slices)
        for st in zone_col:
            g = st.group
            if g not in groups:
                groups[g] = []
            groups[g].append(st)

    # ── 2. Build StaffBox list per group ────────────────────────────────────
    system_infos: List[SystemInfo] = []
    all_staff_spaces: List[float] = []

    for g in sorted(groups.keys()):
        group_staffs = groups[g]

        # Representative staves per track in this group (use first zone col)
        track_reps = {}
        for st in group_staffs:
            if st.track not in track_reps:
                track_reps[st.track] = st

        staff_boxes: List[StaffBox] = []
        for t, st in sorted(track_reps.items()):
            sb = StaffBox(
                track=t,
                group=g,
                x_left=float(st.x_left),
                y_upper=float(st.y_upper),
                x_right=float(st.x_right),
                y_lower=float(st.y_lower),
                staff_space=float(st.unit_size),
                line_count=len(st.lines),
            )
            staff_boxes.append(sb)
            all_staff_spaces.append(st.unit_size)

        if not staff_boxes:
            continue

        sys_y_top = min(sb.y_upper for sb in staff_boxes)
        sys_y_bot = max(sb.y_lower for sb in staff_boxes)
        sys_x_left = min(sb.x_left for sb in staff_boxes)
        sys_x_right = max(sb.x_right for sb in staff_boxes)

        # ── 2.1 Count Measures in this system ──
        m_count = 0
        if barlines is not None:
            # Filter barlines that fall within this system's vertical range
            system_barlines = [
                bl for bl in barlines 
                if sys_y_top - 10 <= (bl.bbox[1] + bl.bbox[3])/2 <= sys_y_bot + 10
            ]
            m_count = len(system_barlines) + 1 # measures = barlines + 1 (simplified)

        system_infos.append(SystemInfo(
            group=g,
            y_top=sys_y_top,
            y_bottom=sys_y_bot,
            x_left=sys_x_left,
            x_right=sys_x_right,
            track_count=len(track_reps),
            measure_count=m_count,
            staves=staff_boxes,
        ))

    # ── 3. Compute inter-system distances ───────────────────────────────────
    system_distances: List[float] = []
    for i in range(1, len(system_infos)):
        gap = system_infos[i].y_top - system_infos[i-1].y_bottom
        if gap > 0:
            system_distances.append(gap)

    avg_system_distance = float(np.mean(system_distances)) if system_distances else 0.0
    avg_staff_space = float(np.mean(all_staff_spaces)) if all_staff_spaces else 10.0

    # ── 4. Page margins (relative) ──────────────────────────────────────────
    if not system_infos:
        return layout if 'layout' in locals() else LayoutMap(image_width=img_w, image_height=img_h, margin_left=0, margin_right=0, margin_top=0, margin_bottom=0, avg_staff_space=10, avg_system_distance=0, staff_height_ratio=0)
    
    all_x_left = [si.x_left for si in system_infos]
    all_x_right = [si.x_right for si in system_infos]
    all_y_top = [si.y_top for si in system_infos]
    all_y_bot = [si.y_bottom for si in system_infos]

    margin_left = float(min(all_x_left) / img_w) if img_w and all_x_left else 0.0
    margin_right = float(1.0 - max(all_x_right) / img_w) if img_w and all_x_right else 0.0
    margin_top = float(min(all_y_top) / img_h) if img_h and all_y_top else 0.0
    margin_bottom = float(1.0 - max(all_y_bot) / img_h) if img_h and all_y_bot else 0.0

    # Clamp to [0, 1]
    margin_left = max(0.0, min(1.0, margin_left))
    margin_right = max(0.0, min(1.0, margin_right))
    margin_top = max(0.0, min(1.0, margin_top))
    margin_bottom = max(0.0, min(1.0, margin_bottom))

    # ── 5. System break Y positions & Height Ratio ─────────────────────────
    system_break_ys = [si.y_top for si in system_infos]
    
    # Calculate how much of the page is actually "music" (staves)
    total_staff_height = sum(sb.y_lower - sb.y_upper for si in system_infos for sb in si.staves)
    staff_height_ratio = float(total_staff_height / img_h) if img_h else 0.0

    layout = LayoutMap(
        image_width=img_w,
        image_height=img_h,
        margin_left=round(margin_left, 4),
        margin_right=round(margin_right, 4),
        margin_top=round(margin_top, 4),
        margin_bottom=round(margin_bottom, 4),
        avg_staff_space=round(avg_staff_space, 2),
        avg_system_distance=round(avg_system_distance, 2),
        staff_height_ratio=round(staff_height_ratio, 4),
        systems=system_infos,
        system_break_ys=[round(y, 1) for y in system_break_ys],
    )

    logger.info(
        "[Layout] Systems: %d | Tracks/System: %s | avg_staff_space: %.1fpx | avg_system_dist: %.1fpx",
        len(system_infos),
        system_infos[0].track_count if system_infos else "?",
        avg_staff_space,
        avg_system_distance,
    )

    return layout
