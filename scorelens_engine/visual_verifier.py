"""
visual_verifier.py — Oemer Self-Verification Engine
====================================================
ตรวจสอบข้อมูลโน้ตที่สกัดได้เทียบกับภาพต้นฉบับ ทีละห้อง ทีละจังหวะ
โดยไม่ใช้ AI ภายนอก — ตรวจสอบด้วย Computer Vision เท่านั้น

การตรวจสอบแบ่งเป็น 3 ขั้น:
  1. Staff Position (Pitch) Verification
     เปรียบ staff_line_pos ที่ได้จาก notehead centroid จริงในภาพ
  2. Accidental Assignment Verification
     หา sfn (♯♭♮) ที่อยู่ใกล้โน้ตแต่ยังไม่ถูก assign
  3. Measure-level Note Density Check
     เปรียบจำนวน notehead pixel clusters ในห้องกับจำนวน notes ที่ extract ได้
     ถ้าต่างกันมากแสดงว่ามีโน้ตที่ miss หรือ ghost

สามารถวน loop ได้ (default 2 รอบ) จนกว่าจะไม่มีการแก้ไข
"""

import numpy as np
import cv2
import scipy.ndimage
from collections import defaultdict

from scorelens_engine import layers
from scorelens_engine.utils import get_unit_size, get_global_unit_size, get_logger, find_closest_staffs
from scorelens_engine.bbox import get_center, get_bbox, rm_merge_overlap_bbox
from scorelens_engine.notehead_extraction import NoteType, NoteHead
from scorelens_engine.symbol_extraction import SfnType

logger = get_logger(__name__)


# ─── Constants ────────────────────────────────────────────────────────────────

# Maximum half-space error allowed before re-assigning pitch
PITCH_TOLERANCE_HALFSPACES = 1

# Search margin (in unit_size multiples) to the left of note for accidentals
SFN_SEARCH_LEFT_RATIO = 2.5
SFN_SEARCH_VERT_RATIO = 0.6

# Density ratio: if image noteheads differ by more than this factor, flag the measure
NOTE_DENSITY_TOLERANCE = 0.4  # 40% difference triggers a warning


# ─── 1. Staff Position (Pitch) Verification ───────────────────────────────────

def _build_staff_position_map(staff):
    """
    Build a list of y-centers for every valid notehead position in a staff
    (lines and spaces, plus one ledger line above/below).
    Returns: sorted list of y-center values (ascending = top of image)
    """
    # Fix for 'numpy.ndarray' object has no attribute 'lines'
    # Sometimes staff is a single-element array containing the actual staff object
    if isinstance(staff, np.ndarray) and staff.size == 1:
        staff = staff[0]
        
    line_ys = sorted([l.y_center for l in staff.lines])  # 5 staff lines, top-to-bottom in image = ascending y
    if len(line_ys) < 2:
        return line_ys

    spacing = (line_ys[-1] - line_ys[0]) / (len(line_ys) - 1)
    half = spacing / 2.0

    # Build all positions: space_above_top, line5, space4, line4, ..., line1, space_below_bottom
    positions = []
    # One ledger space above top line
    positions.append(line_ys[0] - spacing)
    positions.append(line_ys[0] - half)
    for i, ly in enumerate(line_ys):
        positions.append(ly)
        if i < len(line_ys) - 1:
            positions.append(ly + half)
    # One ledger space below bottom line
    positions.append(line_ys[-1] + half)
    positions.append(line_ys[-1] + spacing)

    return positions


def verify_pitch_positions(notes, staffs):
    """
    Re-verify each note's staff_line_pos against the actual pixel centroid of its notehead.
    Corrects staff_line_pos if the image centroid disagrees by more than PITCH_TOLERANCE_HALFSPACES.

    Returns: number of corrections made
    """
    notehead_pred = layers.get_layer('notehead_pred')
    corrections = 0
    
    # Ensure staffs is iterable correctly
    if isinstance(staffs, np.ndarray) and staffs.ndim > 1:
        staffs_list = staffs.flatten().tolist()
    else:
        staffs_list = list(staffs)

    # Build position maps per staff
    staff_pos_maps = {}
    for staff in staffs_list:
        # Extract the actual object if it's trapped in a 0-d array
        st_obj = staff[0] if isinstance(staff, np.ndarray) and staff.size == 1 else staff
        if hasattr(st_obj, 'lines'):
            staff_pos_maps[id(st_obj)] = _build_staff_position_map(st_obj)

    for note in notes:
        if note.invalid:
            continue

        # Find the staff this note belongs to
        target_staff = None
        for staff in staffs_list:
            st_obj = staff[0] if isinstance(staff, np.ndarray) and staff.size == 1 else staff
            if hasattr(st_obj, 'track') and st_obj.track == note.track and st_obj.group == note.group:
                target_staff = st_obj
                break
        if target_staff is None:
            continue

        pos_map = staff_pos_maps.get(id(target_staff))
        if not pos_map or len(pos_map) < 2:
            continue

        # Get actual pixel centroid of the notehead
        x1, y1, x2, y2 = [int(v) for v in note.bbox]
        region = notehead_pred[y1:y2, x1:x2]
        ys, xs = np.where(region > 0)
        if len(ys) == 0:
            continue

        actual_cen_y = float(np.mean(ys)) + y1

        # Find closest staff position
        pos_arr = np.array(pos_map)
        dists = np.abs(pos_arr - actual_cen_y)
        best_idx = int(np.argmin(dists))

        # Compare with current staff_line_pos
        current_pos = note.staff_line_pos
        if current_pos is None:
            note.staff_line_pos = best_idx
            corrections += 1
            logger.debug("[Verify-Pitch] Note %d: assigned pos %d from image centroid y=%.1f",
                         note.id if hasattr(note, 'id') else 0, best_idx, actual_cen_y)
            continue

        if abs(current_pos - best_idx) > PITCH_TOLERANCE_HALFSPACES:
            logger.info(
                "[Verify-Pitch] Note %d: corrected staff_line_pos %d → %d "
                "(image centroid y=%.1f, staff bottom=%.1f)",
                note.id if hasattr(note, 'id') else 0, current_pos, best_idx, actual_cen_y, pos_map[-1]
            )
            note.staff_line_pos = best_idx
            corrections += 1

    return corrections


# ─── 2. Accidental Assignment Verification ────────────────────────────────────

def verify_accidental_assignments(notes, sfns):
    """
    For each note, check if there is an unassigned sfn (♯♭♮) within the
    expected search region to the left of the notehead.
    Assign found sfns and mark them as used.

    Returns: number of new accidental assignments
    """
    if len(sfns) == 0 or len(notes) == 0:
        return 0

    # Track which sfns are already assigned
    assigned_sfn_ids = set()
    for note in notes:
        if note.sfn is not None:
            assigned_sfn_ids.add(id(note.sfn))

    new_assignments = 0

    for note in notes:
        if note.invalid or note.sfn is not None:
            continue

        x1, y1, x2, y2 = [int(v) for v in note.bbox]
        unit_size = get_unit_size((x1 + x2) // 2, (y1 + y2) // 2)

        # Define search region: to the left of note, same vertical range ±margin
        search_x1 = max(0, x1 - int(unit_size * SFN_SEARCH_LEFT_RATIO))
        search_x2 = x1 + int(unit_size * 0.3)
        margin_y = int(unit_size * SFN_SEARCH_VERT_RATIO)
        search_y1 = y1 - margin_y
        search_y2 = y2 + margin_y

        # Find closest unassigned sfn in search region
        best_sfn = None
        best_dist = float('inf')
        for sfn in sfns:
            if id(sfn) in assigned_sfn_ids:
                continue
            sx1, sy1, sx2, sy2 = [int(v) for v in sfn.bbox]
            sfn_cx = (sx1 + sx2) / 2
            sfn_cy = (sy1 + sy2) / 2

            # Horizontal: sfn center must be in search x range
            if not (search_x1 <= sfn_cx <= search_x2):
                continue
            # Vertical: sfn center must be in search y range
            if not (search_y1 <= sfn_cy <= search_y2):
                continue

            dist = abs(sfn_cx - x1) + abs(sfn_cy - (y1 + y2) / 2)
            if dist < best_dist:
                best_dist = dist
                best_sfn = sfn

        if best_sfn is not None:
            note.sfn = best_sfn
            assigned_sfn_ids.add(id(best_sfn))
            sfn_name = best_sfn.label.name if best_sfn.label else 'unknown'
            logger.info(
                "[Verify-Accidental] Note %d: assigned missing %s at x=%d",
                note.id, sfn_name, int((best_sfn.bbox[0] + best_sfn.bbox[2]) / 2)
            )
            new_assignments += 1

    return new_assignments


# ─── 3. Measure-level Note Density Check ─────────────────────────────────────

def _count_notehead_clusters_in_region(notehead_pred, x1, y1, x2, y2, unit_size):
    """
    Count distinct notehead pixel clusters (connected components) in a measure region.
    Uses morphological opening to merge nearby pixels.
    """
    region = notehead_pred[max(0, y1):y2, max(0, x1):x2]
    if region.size == 0:
        return 0

    size = max(1, int(unit_size * 0.3))
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    clean = cv2.erode(cv2.dilate(region.astype(np.uint8), ker), ker)
    _, n_labels = scipy.ndimage.label(clean)
    return n_labels


def verify_measure_note_density(notes, barlines, staffs):
    """
    For each measure (defined by barline x-positions), count:
      - Actual notehead clusters in image (from notehead_pred pixel layer)
      - Extracted notes in that measure

    If they differ by more than NOTE_DENSITY_TOLERANCE, log a warning.
    This does NOT auto-correct (density mismatch is informational only —
    adding/removing notes without confirmation could introduce errors).

    Returns: list of flagged measure indices with details
    """
    notehead_pred = layers.get_layer('notehead_pred')
    staffs_layer = layers.get_layer('staffs')
    global_unit = get_global_unit_size()

    if len(barlines) < 2:
        return []

    # Sort barlines by x position
    sorted_bl = sorted(barlines, key=lambda bl: bl.bbox[0])
    img_h = notehead_pred.shape[0]
    img_w = notehead_pred.shape[1]

    flagged = []

    for i in range(len(sorted_bl) - 1):
        bl_left = sorted_bl[i]
        bl_right = sorted_bl[i + 1]

        m_x1 = int(bl_left.bbox[2])   # right edge of left barline
        m_x2 = int(bl_right.bbox[0])  # left edge of right barline
        if m_x2 - m_x1 < global_unit:
            continue  # Too narrow to be a real measure

        # Count image noteheads in this x-range (full height)
        image_count = _count_notehead_clusters_in_region(
            notehead_pred, m_x1, 0, m_x2, img_h, global_unit
        )

        # Count extracted notes in this x-range
        extracted_count = sum(
            1 for note in notes
            if not note.invalid and note.bbox is not None
            and m_x1 <= (note.bbox[0] + note.bbox[2]) / 2 <= m_x2
        )

        if image_count == 0 and extracted_count == 0:
            continue

        if image_count > 0:
            diff_ratio = abs(image_count - extracted_count) / image_count
        else:
            diff_ratio = 1.0

        if diff_ratio > NOTE_DENSITY_TOLERANCE and abs(image_count - extracted_count) >= 2:
            detail = {
                'measure_x': (m_x1, m_x2),
                'image_noteheads': image_count,
                'extracted_notes': extracted_count,
                'diff_ratio': diff_ratio,
            }
            flagged.append(detail)
            logger.warning(
                "[Verify-Density] Measure x=%d–%d: image=%d noteheads, extracted=%d notes "
                "(diff=%.0f%%) ← possible miss/ghost",
                m_x1, m_x2, image_count, extracted_count, diff_ratio * 100
            )

    return flagged


# ─── 4. Beam / Flag Re-verification ──────────────────────────────────────────

def _recount_beams_in_image(note, beam_map):
    """
    Re-count the number of beams/flags in the stem region of a note.
    Returns the beam count (0=quarter, 1=eighth, 2=16th, 3=32nd) or None if unclear.
    """
    from scorelens_engine.rhythm_extraction import scan_beam_flag

    if note.stem_up is None:
        return None
    if note.label in (NoteType.WHOLE, NoteType.HALF, NoteType.HALF_OR_WHOLE, None):
        return None  # No stem to scan

    x1, y1, x2, y2 = [int(v) for v in note.bbox]
    unit_size = get_unit_size((x1 + x2) // 2, (y1 + y2) // 2)
    half_scan = max(1, round(unit_size / 2))
    cen_x = (x1 + x2) // 2

    if note.stem_up:
        scan_y1 = max(0, y1 - int(unit_size * 4))
        scan_y2 = y1
    else:
        scan_y1 = y2
        scan_y2 = min(beam_map.shape[0] - 1, y2 + int(unit_size * 4))

    if scan_y2 <= scan_y1:
        return None

    try:
        count = scan_beam_flag(
            beam_map,
            max(0, cen_x - half_scan),
            scan_y1,
            min(beam_map.shape[1] - 1, cen_x + half_scan),
            scan_y2,
            threshold=0.12
        )
        return count
    except Exception:
        return None


def verify_rhythm_types(notes, beam_map):
    """
    Re-verify note rhythm types (QUARTER/EIGHTH/SIXTEENTH/THIRTY_SECOND)
    by re-scanning beam/flag count in image.

    Only corrects if the image count clearly disagrees with the extracted label
    (requiring at least 1 beam count difference AND the note currently has a label set).

    Returns: number of rhythm corrections
    """
    note_type_map = {
        0: NoteType.QUARTER,
        1: NoteType.EIGHTH,
        2: NoteType.SIXTEENTH,
        3: NoteType.THIRTY_SECOND,
    }

    corrections = 0
    for note in notes:
        if note.invalid or note.label is None:
            continue
        if note.label in (NoteType.WHOLE, NoteType.HALF, NoteType.HALF_OR_WHOLE):
            continue  # These are verified by notehead shape, not beam count

        image_beam_count = _recount_beams_in_image(note, beam_map)
        if image_beam_count is None:
            continue

        expected_type = note_type_map.get(image_beam_count)
        if expected_type is None:
            continue

        if expected_type != note.label:
            logger.info(
                "[Verify-Rhythm] Note %d: corrected %s → %s (image beam count=%d)",
                note.id, note.label.name, expected_type.name, image_beam_count
            )
            note.force_set_label(expected_type)
            corrections += 1

    return corrections


# ─── 5. Dot Hunter (Augmentation Dot Verification) ──────────────────────────

def verify_dots(notes):
    """
    Scans to the right of every notehead for a small cluster of pixels
    that indicates an augmentation dot (ประจุด).
    Oemer often misses these, causing rhythm gaps.
    """
    symbols = layers.get_layer('symbols_pred')
    notehead_pred = layers.get_layer('notehead_pred')
    corrections = 0

    for note in notes:
        if note.invalid or note.has_dot:
            continue

        x1, y1, x2, y2 = [int(v) for v in note.bbox]
        unit_size = get_unit_size((x1 + x2) // 2, (y1 + y2) // 2)

        # Search window: to the right of notehead
        # Standard dot position is about 0.8 to 1.5 unit_size to the right
        sw_x1 = x2 + int(unit_size * 0.1)
        sw_x2 = x2 + int(unit_size * 1.5)
        sw_y1 = y1
        sw_y2 = y2

        if sw_x2 >= symbols.shape[1]: continue

        region = symbols[sw_y1:sw_y2, sw_x1:sw_x2]
        # Also check notehead layer just in case it was misclassified
        region_nh = notehead_pred[sw_y1:sw_y2, sw_x1:sw_x2]

        # Look for a small round cluster
        # Dots are usually very small (area < 0.1 * unit_size^2)
        combined = np.where(region + region_nh > 0, 1, 0)
        labels, n_labels = scipy.ndimage.label(combined)

        found_dot = False
        for l in range(1, n_labels + 1):
            coords = np.where(labels == l)
            area = len(coords[0])
            if 2 < area < (unit_size * 0.5): # Dot size constraints
                found_dot = True
                break

        if found_dot:
            logger.info("[Verify-Dot] Note %d: detected missing DOT in image", note.id)
            note.has_dot = True
            corrections += 1

    return corrections


# ─── 6. Note Recovery (Find notes Oemer missed) ───────────────────────────────

def recover_missing_notes(notes, staffs):
    """
    If there are pixel clusters in notehead_pred that don't overlap with
    any extracted notes, create new NoteHead objects for them.
    """
    notehead_pred = layers.get_layer('notehead_pred')
    symbols = layers.get_layer('symbols_pred')
    global_unit = get_global_unit_size()
    
    # Safely convert notes to a list if it's a numpy array
    notes_list = list(notes) if isinstance(notes, (np.ndarray, list)) else []
    new_notes_count = 0

    # 1. Find all clusters in image
    bboxes = get_bbox(notehead_pred)
    bboxes = rm_merge_overlap_bbox(bboxes)

    # 2. Filter out clusters already covered by existing notes
    orphan_bboxes = []
    for bbox in bboxes:
        cx, cy = get_center(bbox)
        is_covered = False
        for note in notes_list:
            if note.bbox is not None:
                nx1, ny1, nx2, ny2 = note.bbox
                margin = global_unit * 0.4
                if (nx1 - margin <= cx <= nx2 + margin) and (ny1 - margin <= cy <= ny2 + margin):
                    is_covered = True
                    break
        if not is_covered:
            orphan_bboxes.append(bbox)

    if not orphan_bboxes:
        return 0

    # 3. Create new notes for orphans
    symbols_pred = layers.get_layer('symbols_pred')
    notehead_pred_layer = layers.get_layer('notehead_pred')

    for bbox in orphan_bboxes:
        nn = NoteHead()
        nn.bbox = bbox
        cx, cy = get_center(bbox)
        
        # IMPORTANT: Add points (pixels) to the note object
        region = symbols[bbox[1]:bbox[3], bbox[0]:bbox[2]]
        ys, xs = np.where(region > 0)
        ys += bbox[1]
        xs += bbox[0]
        for y, x in zip(ys, xs):
            nn.add_point(x, y)
        
        # NEW: 'Burn' these pixels back into the system layers so Oemer sees them
        symbols_pred[ys, xs] = 1
        notehead_pred_layer[ys, xs] = 1

        # Assign staff/track
        st1, st2 = find_closest_staffs(cx, cy)
        target_st = st1 if abs(cy - st1.y_center) < abs(cy - st2.y_center) else st2
        nn.track = target_st.track
        nn.group = target_st.group

        # Set default type and add to list
        nn.force_set_label(NoteType.QUARTER)
        if isinstance(notes, list):
            notes.append(nn)
        new_notes_count += 1
        logger.info("[Verify-Recovery] Recovered missing note at x=%d, y=%d and INJECTED into layers", 
                    int(cx), int(cy))

    return new_notes_count


# ─── 7. Measure Duration Logic (V2 Enhancement) ──────────────────────────────

def verify_measure_duration(measures_dict, time_sig):
    """
    Checks if each measure's total duration matches the Time Signature.
    If not, logs a warning and attempts minor repairs.
    """
    if not time_sig or not isinstance(time_sig, (tuple, list)):
        return 0

    beats, beat_type = time_sig
    from scorelens_engine.build_system import DIVISION_PER_QUATER
    expected_dura = (beats * DIVISION_PER_QUATER * 4) // beat_type
    
    corrections = 0
    for grp, measures in measures_dict.items():
        for measure in measures:
            # We check track 0 (treble) as the primary reference
            actual_dura = sum(sym.duration for sym in measure.symbols if hasattr(sym, 'duration') and getattr(sym, 'track', 0) == 0)
            
            if actual_dura != expected_dura and actual_dura > 0:
                diff = expected_dura - actual_dura
                # Simple fix: if off by exactly 50% of the last note, it might be a missing dot
                if diff > 0:
                    for sym in reversed(measure.symbols):
                        if hasattr(sym, 'has_dot') and not sym.has_dot:
                            # If adding a dot fixes it exactly, do it!
                            if sym.duration * 0.5 == diff:
                                sym.has_dot = True
                                sym.duration = int(sym.duration * 1.5)
                                corrections += 1
                                logger.info("[Verify-TimeSig] Fixed Measure %d duration by adding missing DOT", measure.number)
                                break
                                
    return corrections


# ─── Main Verification Entry Points ──────────────────────────────────────────

def verify_phase1(notes):
    """
    Phase 1: Note Recovery & Pitch Correction.
    SHOULD RUN: After note_extract() but BEFORE group_extract().
    """
    staffs = layers.get_layer('staffs')
    
    logger.info("[Verify-P1] Running Note Recovery and Pitch correction")
    rec = recover_missing_notes(notes, staffs)
    p = verify_pitch_positions(notes, staffs)
    
    return {'recovered': rec, 'pitch_corrected': p}


def verify_phase2():
    """
    Phase 2: Accidental, Dot & Rhythm Verification.
    SHOULD RUN: After rhythm_extract().
    """
    notes    = layers.get_layer('notes')
    staffs   = layers.get_layer('staffs')
    sfns     = layers.get_layer('sfns')
    barlines = layers.get_layer('barlines')
    stems    = layers.get_layer('stems_rests_pred')
    notehead = layers.get_layer('notehead_pred')
    beam_map = np.where(stems.astype(np.int32) + notehead.astype(np.int32) > 0, 1, 0)

    logger.info("[Verify-P2] Running Accidental, Dot and Rhythm verification")
    a = verify_accidental_assignments(notes, sfns)
    d = verify_dots(notes)
    r = verify_rhythm_types(notes, beam_map)
    
    # Informational density check
    flagged = verify_measure_note_density(notes, barlines, staffs)
    
    # ── [V2] Global Rhythm Alignment ──
    # This requires access to the measures, which is handled in build_system post-parsing
    # For now, we return the corrections count from other rhythm checks
    
    return {
        'accidental_corrected': a,
        'dots_corrected': d,
        'rhythm_corrected': r,
        'flagged_measures': flagged
    }


def verify_and_correct(max_iterations: int = 3) -> dict:
    """ 
    Legacy wrapper for compatibility or single-pass full check.
    In the ETE pipeline, we prefer calling phase1 and phase2 separately.
    """
    p1 = verify_phase1()
    p2 = verify_phase2()
    
    return {
        'iterations_run': 1,
        'pitch_corrections': p1['pitch_corrected'],
        'accidental_corrections': p2['accidental_corrected'],
        'rhythm_corrections': p2['rhythm_corrected'],
        'dot_corrections': p2['dots_corrected'],
        'recovery_corrections': p1['recovered'],
        'flagged_measures': p2['flagged_measures']
    }
