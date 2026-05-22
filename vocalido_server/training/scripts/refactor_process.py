import re

with open("ScoreLens_V3_Core/pipeline.py", "r") as f:
    code = f.read()

# We need to replace Layer 1 to Layer 5 in `process`
# Actually, the user asked to skip cover pages and add page numbers.
# If I rewrite `process` to loop over `png_paths`, I can do:

new_process = """
            # ── Layer 0: Input Normalization ─────────────────────────────────
            png_paths = self._normalize_input(image_path, stats, errors)
            if not png_paths:
                return PipelineResult(False, errors=errors, source_file=image_path)

            all_detected_notes = []
            all_staves = []
            global_staff_offset = 0
            global_system_offset = 0
            current_max_measure = 0
            valid_page_count = 0

            # ── Process Each Page ─────────────────────────────────────────────
            for png_path in png_paths:
                page_warnings = []
                
                # ── Layer 1: Denoiser
                clean = self._denoise(png_path, stats, page_warnings)

                # ── Layer 2: Staff Detection
                page_geo, staves_ctx, time_sig = self._detect_staff(png_path, stats, page_warnings)
                
                if page_geo is None or not page_geo.staves:
                    warnings.append(f'Skipped page {png_path} (No staves detected - likely a cover page)')
                    continue
                
                valid_page_count += 1

                # ── Layer 3: Symbol Detection
                if use_neural:
                    raw_notes = self._detect_neural(png_path, page_geo, staves_ctx, stats, page_warnings)
                else:
                    raw_notes = self._detect_geometry(png_path, page_geo, stats, page_warnings)

                # ── Layer 3.5: Measure Parsing
                try:
                    import cv2
                    mp = self._get('measure_parser', '2_vision/measure_parser.py')
                    img_gray = cv2.imread(png_path, cv2.IMREAD_GRAYSCALE)
                    _, binary = cv2.threshold(img_gray, 200, 255, cv2.THRESH_BINARY_INV)
                    layout = mp.parse_measures(binary, page_geo)

                    for note in raw_notes:
                        note_x = note.get('x', 0)
                        note_y = note.get('y', 0)
                        best_staff_idx = 0
                        min_dist = float('inf')
                        for i, s in enumerate(page_geo.staves):
                            dist = abs(s.mid_y - note_y)
                            if dist < min_dist:
                                min_dist = dist
                                best_staff_idx = i
                        note['staff_idx'] = best_staff_idx

                        for m in layout.measures:
                            if m.staff_idx == page_geo.staves[best_staff_idx].system_idx and m.x_start <= note_x <= m.x_end:
                                note['measure_num'] = m.measure_num
                                break
                        if 'measure_num' not in note and layout.measures:
                            sm = [m for m in layout.measures if m.staff_idx == page_geo.staves[best_staff_idx].system_idx]
                            note['measure_num'] = sm[-1].measure_num if sm else layout.measures[-1].measure_num

                    raw_notes.sort(key=lambda n: (n.get('staff_idx', 0), n.get('x', 0)))
                except Exception as e:
                    page_warnings.append(f'Measure parsing failed: {e}')
                    raw_notes.sort(key=lambda n: n.get('x', 0))

                # ── Layer 3.7: Text Detection
                score_text = None
                try:
                    td = self._get('text_detector', '2_vision/text_detector.py')
                    score_text = td.detect_score_text(png_path, page_geo, 'eng+tha', ocr_texts)
                    if valid_page_count == 1:
                        if score_text.title and not title: title = score_text.title
                        if score_text.composer and not composer: composer = score_text.composer
                except Exception as e:
                    pass

                # ── Layer 4: Pitch + Rhythm
                detected_notes = self._calc_pitch_rhythm(raw_notes, page_geo, staves_ctx, time_sig, stats)

                # ── Layer 4.8: Lyrics
                all_lyrics = score_text.lyrics if score_text and score_text.lyrics else []
                for lx, ly, ltxt in all_lyrics:
                    closest_note = None
                    min_dist = float('inf')
                    for note in detected_notes:
                        ny = getattr(note, '_y', 0)
                        nx = getattr(note, '_x', 0)
                        if ny < ly and (ly - ny) < page_geo.avg_staff_space * 12:
                            d = abs(nx - lx)
                            if d < min_dist:
                                min_dist = d
                                closest_note = note
                    if closest_note and min_dist < page_geo.avg_staff_space * 6:
                        if not getattr(closest_note, 'lyric', None):
                            closest_note.lyric = ltxt
                
                # ── Accumulate across pages
                max_m = 0
                for n in detected_notes:
                    n.measure_num += current_max_measure
                    if n.measure_num > max_m: max_m = n.measure_num
                    n._staff_idx = getattr(n, '_staff_idx', 0) + global_staff_offset
                    all_detected_notes.append(n)
                
                for s in page_geo.staves:
                    s.system_idx += global_system_offset
                    all_staves.append(s)

                if detected_notes:
                    current_max_measure = max_m
                global_staff_offset += len(page_geo.staves)
                if page_geo.staves:
                    global_system_offset = max(s.system_idx for s in page_geo.staves) + 1

                warnings.extend(page_warnings)

            if valid_page_count == 0:
                errors.append('No staff lines detected on any page. Ensure the file contains sheet music.')
                return PipelineResult(False, errors=errors, source_file=image_path, stats=stats)

            # ── Layer 5: Build MusicXML ───────────────────────────────────────
            systems = []
            sys_map = {}
            for i, s in enumerate(all_staves):
                sys_map.setdefault(s.system_idx, []).append(i)
            for k in sorted(sys_map.keys()):
                systems.append(sys_map[k])

            num_parts = max((len(s) for s in systems), default=1)
            parts_config = []
            xb = self._get('xml_builder', '5_builder/xml_builder.py')
            PartConfig = xb.PartConfig

            for p_idx in range(num_parts):
                part_notes = []
                current_m = 1
                for sys in systems:
                    sys_padded = [None] * (num_parts - len(sys)) + sys
                    s_idx = sys_padded[p_idx]
                    
                    if s_idx is not None:
                        s_notes = [n for n in all_detected_notes if getattr(n, '_staff_idx', 0) == s_idx]
                        if not s_notes: continue
                        
                        orig_m_nums = sorted(list(set(n.measure_num for n in s_notes)))
                        m_map = {}
                        for orig in orig_m_nums:
                            m_map[orig] = current_m
                            current_m += 1
                        for n in s_notes:
                            n.measure_num = m_map[n.measure_num]
                            part_notes.append(n)
                
                parts_config.append(PartConfig(
                    id=f'P{p_idx+1}',
                    name=f'Part {p_idx+1}',
                    notes=part_notes,
                    clef='G'
                ))

            # Add empty measures to sync parts
            max_measures = max(max((n.measure_num for n in p.notes), default=0) for p in parts_config)
            for p in parts_config:
                m_nums = set(n.measure_num for n in p.notes)
                for m in range(1, max_measures + 1):
                    if m not in m_nums:
                        from dataclasses import replace
                        if p.notes:
                            dummy = replace(p.notes[0], step='C', alter=0, is_rest=True, measure_num=m, lyric=None, tie_start=False, tie_stop=False)
                            p.notes.append(dummy)
                p.notes.sort(key=lambda x: x.measure_num)

            config = xb.ScoreConfig(
                title=title or 'ScoreLens Transcription',
                composer=composer or 'Unknown Composer',
                tempo=120,
                beats=4, beat_type=4,
                fifths=0, key_mode='major',
                divisions=16,
                parts=parts_config,
                page_count=valid_page_count,
            )

            musicxml = xb.build_musicxml(config)
"""

# Read and replace
start_idx = code.find("# ── Layer 0: Input Normalization")
end_idx = code.find("if self.add_solfege and musicxml:")

if start_idx != -1 and end_idx != -1:
    new_code = code[:start_idx] + new_process + "\n            " + code[end_idx:]
    with open("ScoreLens_V3_Core/pipeline.py", "w") as f:
        f.write(new_code)
    print("Successfully replaced pipeline.py process()")
else:
    print("Could not find replacement indices")

