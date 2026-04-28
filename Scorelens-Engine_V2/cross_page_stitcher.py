"""
[Scorelens-Engine V2] Cross-Page Stitcher
==========================================
Merges MusicXML output from multiple scanned pages into a single coherent document.

Problems solved:
  1. Key/Time Signature propagation — if page 2 doesn't repeat the key signature,
     the stitcher carries it forward from the last known state.
  2. Measure numbering — renumbers all <measure number="N"> sequentially 
     across pages (Oemer resets to 1 on each page).
  3. Tie/Slur continuity — detects open <tie type="start"/> at page boundary
     and injects a matching <tie type="stop"/> on the first note of the next page.
  4. Repeat barlines — preserves <barline location="right"> repeat signs 
     that span pages.

Usage:
    from Scorelens_Engine_V2.cross_page_stitcher import stitch_pages
    combined_xml = stitch_pages([xml_page1, xml_page2, xml_page3])
"""

import re
import xml.etree.ElementTree as ET
from typing import List, Optional, Tuple
from dataclasses import dataclass, field

from Scorelens_Engine_V2.utils import get_logger

logger = get_logger(__name__)

ET.register_namespace('', 'http://www.w3.org/1998/xhtml')


# ─── Data Models ────────────────────────────────────────────────────────────

@dataclass
class PageState:
    """Musical state carried between pages."""
    key_fifths: int = 0
    key_mode: str = 'major'
    beats: int = 4
    beat_type: int = 4
    last_measure_number: int = 0
    open_ties: List[str] = field(default_factory=list)   # list of pitch strings 'C4', 'E4', etc.
    open_slurs: int = 0


# ─── XML Helpers ─────────────────────────────────────────────────────────────

def _parse_xml_safe(xml_str: str) -> Optional[ET.Element]:
    """Parse XML string; return None on failure."""
    try:
        # Strip XML declaration and DOCTYPE
        cleaned = re.sub(r'<\?xml[^?]*\?>', '', xml_str).strip()
        cleaned = re.sub(r'<!DOCTYPE[^>]*>', '', cleaned).strip()
        return ET.fromstring(cleaned)
    except ET.ParseError as e:
        logger.warning('[Stitch] XML parse error: %s', e)
        return None


def _get_text(el: ET.Element, tag: str, default='') -> str:
    child = el.find(tag)
    return child.text.strip() if child is not None and child.text else default


def _extract_key_state(root: ET.Element) -> Tuple[int, str]:
    """Extract the last key signature from a MusicXML document."""
    fifths, mode = 0, 'major'
    for key_el in root.iter('key'):
        f = _get_text(key_el, 'fifths', '0')
        m = _get_text(key_el, 'mode', 'major')
        try:
            fifths = int(f)
            mode = m
        except ValueError:
            pass
    return fifths, mode


def _extract_time_state(root: ET.Element) -> Tuple[int, int]:
    """Extract the last time signature from a MusicXML document."""
    beats, beat_type = 4, 4
    for time_el in root.iter('time'):
        b = _get_text(time_el, 'beats', '4')
        bt = _get_text(time_el, 'beat-type', '4')
        try:
            beats, beat_type = int(b), int(bt)
        except ValueError:
            pass
    return beats, beat_type


def _get_last_measure_number(root: ET.Element) -> int:
    """Return the highest measure number in the document."""
    max_num = 0
    for m in root.iter('measure'):
        n = m.get('number', '0')
        try:
            max_num = max(max_num, int(n))
        except ValueError:
            pass
    return max_num


def _find_open_ties(root: ET.Element) -> List[str]:
    """
    Find notes that have <tie type="start"/> but no subsequent <tie type="stop"/>
    (i.e., ties that cross the page boundary).
    Returns list of pitch strings like ['C4', 'G3'].
    """
    open_ties = set()
    for note_el in root.iter('note'):
        # Build pitch string
        pitch = note_el.find('pitch')
        if pitch is None:
            continue
        step = _get_text(pitch, 'step', '?')
        octave = _get_text(pitch, 'octave', '4')
        pitch_str = f'{step}{octave}'

        # Check tie elements
        ties = note_el.findall('tie')
        for tie in ties:
            tie_type = tie.get('type', '')
            if tie_type == 'start':
                open_ties.add(pitch_str)
            elif tie_type == 'stop' and pitch_str in open_ties:
                open_ties.discard(pitch_str)

    return list(open_ties)


def _inject_attributes(measure_el: ET.Element, state: PageState, is_first_measure: bool) -> None:
    """
    Inject or update <attributes> in a measure to carry forward 
    key and time signatures from the previous page.
    """
    if not is_first_measure:
        return

    attrs = measure_el.find('attributes')
    if attrs is None:
        attrs = ET.SubElement(measure_el, 'attributes')
        measure_el.insert(0, attrs)

    # Inject divisions if missing
    if attrs.find('divisions') is None:
        div_el = ET.SubElement(attrs, 'divisions')
        div_el.text = '1'

    # Inject key if missing
    if attrs.find('key') is None:
        key_el = ET.SubElement(attrs, 'key')
        fifths_el = ET.SubElement(key_el, 'fifths')
        fifths_el.text = str(state.key_fifths)
        mode_el = ET.SubElement(key_el, 'mode')
        mode_el.text = state.key_mode
        logger.debug('[Stitch] Injected key signature (fifths=%d) into page start', state.key_fifths)

    # Inject time if missing
    if attrs.find('time') is None:
        time_el = ET.SubElement(attrs, 'time')
        beats_el = ET.SubElement(time_el, 'beats')
        beats_el.text = str(state.beats)
        beat_type_el = ET.SubElement(time_el, 'beat-type')
        beat_type_el.text = str(state.beat_type)
        logger.debug('[Stitch] Injected time signature (%d/%d) into page start', state.beats, state.beat_type)


def _close_open_ties(first_measure: ET.Element, open_ties: List[str]) -> int:
    """
    Inject <tie type="stop"/> and <notations><tied type="stop"/></notations>
    into the first matching note of the page for each open tie.
    Returns number of ties closed.
    """
    closed = 0
    pitch_to_close = set(open_ties)
    if not pitch_to_close:
        return 0

    for note_el in first_measure.iter('note'):
        pitch = note_el.find('pitch')
        if pitch is None:
            continue
        step = _get_text(pitch, 'step', '?')
        octave = _get_text(pitch, 'octave', '4')
        pitch_str = f'{step}{octave}'

        if pitch_str in pitch_to_close:
            # Add <tie type="stop"/>
            tie_stop = ET.Element('tie')
            tie_stop.set('type', 'stop')
            note_el.insert(list(note_el).index(pitch) + 1, tie_stop)

            # Add/update <notations>
            notations = note_el.find('notations')
            if notations is None:
                notations = ET.SubElement(note_el, 'notations')
            tied_stop = ET.SubElement(notations, 'tied')
            tied_stop.set('type', 'stop')

            pitch_to_close.discard(pitch_str)
            closed += 1
            logger.debug('[Stitch] Closed cross-page tie for pitch %s', pitch_str)

        if not pitch_to_close:
            break

    return closed


# ─── Main Stitching Logic ────────────────────────────────────────────────────

def stitch_pages(page_xmls: List[str]) -> str:
    """
    Merge multiple single-page MusicXML strings into one combined document.

    Parameters
    ----------
    page_xmls : List[str]
        List of MusicXML strings, one per scanned page, in order.

    Returns
    -------
    str
        Combined MusicXML string with corrected measure numbers,
        propagated key/time signatures, and closed cross-page ties.
    """
    if not page_xmls:
        return ''
    if len(page_xmls) == 1:
        return page_xmls[0]

    logger.info('[Stitch] Stitching %d pages...', len(page_xmls))

    # Parse all pages
    roots = []
    for i, xml_str in enumerate(page_xmls):
        root = _parse_xml_safe(xml_str)
        if root is None:
            logger.warning('[Stitch] Page %d failed to parse — skipping', i + 1)
            continue
        roots.append(root)

    if not roots:
        return page_xmls[0]

    # ── Use first page as the base document ──────────────────────────────────
    base_root = roots[0]
    state = PageState()
    state.key_fifths, state.key_mode = _extract_key_state(base_root)
    state.beats, state.beat_type = _extract_time_state(base_root)
    state.last_measure_number = _get_last_measure_number(base_root)
    state.open_ties = _find_open_ties(base_root)

    logger.info(
        '[Stitch] Page 1: measures=1-%d | key=fifths(%d) | time=%d/%d | open_ties=%s',
        state.last_measure_number, state.key_fifths, state.beats, state.beat_type, state.open_ties
    )

    # Find the <part> element in the base to append measures to
    base_part = base_root.find('.//part')
    if base_part is None:
        logger.warning('[Stitch] No <part> element found in base page')
        return page_xmls[0]

    # ── Process subsequent pages ──────────────────────────────────────────────
    total_measures = state.last_measure_number
    total_ties_closed = 0

    for page_idx, page_root in enumerate(roots[1:], start=2):
        page_part = page_root.find('.//part')
        if page_part is None:
            logger.warning('[Stitch] Page %d has no <part> element — skipping', page_idx)
            continue

        measures = list(page_part.findall('measure'))
        if not measures:
            continue

        # ── Close open ties in first measure of this page ─────────────────
        if state.open_ties:
            closed = _close_open_ties(measures[0], state.open_ties)
            total_ties_closed += closed
            state.open_ties = [t for t in state.open_ties if True]  # reset after close

        # ── Inject carried-forward key/time into first measure ────────────
        _inject_attributes(measures[0], state, is_first_measure=True)

        # ── Renumber measures and append to base ──────────────────────────
        for i, measure_el in enumerate(measures):
            new_num = total_measures + i + 1
            measure_el.set('number', str(new_num))
            # Add system break mark for rendering fidelity
            print_el = measure_el.find('print')
            if print_el is None and i == 0:
                print_el = ET.Element('print')
                print_el.set('new-system', 'yes')
                measure_el.insert(0, print_el)
            base_part.append(measure_el)

        page_measures_count = len(measures)
        total_measures += page_measures_count

        # ── Update state for next page ─────────────────────────────────────
        state.key_fifths, state.key_mode = _extract_key_state(page_root)
        state.beats, state.beat_type = _extract_time_state(page_root)
        state.last_measure_number = total_measures
        state.open_ties = _find_open_ties(page_root)

        logger.info(
            '[Stitch] Page %d: +%d measures (total=%d) | open_ties=%s',
            page_idx, page_measures_count, total_measures, state.open_ties
        )

    # ── Serialize back to XML string ──────────────────────────────────────────
    try:
        combined_xml = ET.tostring(base_root, encoding='unicode', xml_declaration=False)
        combined_xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + combined_xml
    except Exception as e:
        logger.error('[Stitch] Serialization failed: %s', e)
        return page_xmls[0]

    logger.info(
        '[Stitch] ✅ Done: %d pages → %d total measures | %d cross-page ties resolved',
        len(roots), total_measures, total_ties_closed
    )
    return combined_xml
