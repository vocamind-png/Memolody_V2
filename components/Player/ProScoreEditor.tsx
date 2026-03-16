
import React, { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import * as Tone from 'tone';
import { Music2, Type, Trash2, X, Award, ShieldCheck, Pencil, Lock, ShieldAlert, Printer, Loader2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { injectSolfegeToXml, transposeMusicXml } from '../../lib/MusicXmlParser';
import { ScoreLayoutMode, TextAnnotation } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';

interface BarMap {
  measureNumber: number;
  startRelX: number;
  endRelX: number;
  startTime: number;
  duration: number;
  pageIndex: number;
  y: number;
  height: number;
  systemId: string;
}

interface SvgNoteElement {
  id: string;
  startTime: number;
  duration: number;
  trackId: string;
  noteheadElement: SVGElement | null;
  solfegeElement: SVGElement | null;
  containerElement: SVGElement | null;
  x: number;
  y: number;
}

interface ProScoreEditorProps {
  xmlData: string | null;
  currentTime: number;
  isPlaying: boolean;
  songMetadata?: any;
  zoom?: number;
  setZoom?: (val: number) => void;
  lyricMode?: string;
  transpose?: number;
  layoutMode: ScoreLayoutMode;
  isLoupeEnabled: boolean;
  pageFormat?: string;
  showBorders?: boolean;
  editorMode?: 'select' | 'pen' | 'eraser' | 'text';
  drawingColor?: string;
  clearTrigger?: number;
  onPageCountChange?: (count: number) => void;
  onActivePageChange?: (index: number) => void;
  onPageChange?: (index: number) => void;
  onPageCount?: (count: number) => void; // Added to match some internal calls
  onMetadataChange?: (title: string, artist: string) => void;
  titleFontSize?: number;
  systemSpacing?: number;
  showLaser?: boolean;
  drawings?: (string | null)[];
  onDrawingChange?: (drawings: (string | null)[]) => void;
  textAnnotations?: TextAnnotation[];
  onTextAnnotationsChange?: (ann: TextAnnotation[]) => void;
  musicFont?: string;
  lyricFont?: string;
  stemThickness?: number;
  barlineThickness?: number;
  stafflineThickness?: number;
  isPreviewMode?: boolean;
  isEditable?: boolean;
  activeNotationTool?: string;
  onXmlChange?: (xml: string, actionLabel: string) => void;
  showLaserLine?: boolean;
  activeLoop?: { startBar: number, endBar: number, color: string } | null;
  performanceMode?: boolean;
}

export interface ProScoreEditorRef {
  exportToPdf: () => Promise<void>;
  exportToImage: (format: 'png' | 'jpeg') => Promise<void>;
}

const ProScoreEditor = forwardRef<ProScoreEditorRef, ProScoreEditorProps>(({
  xmlData, currentTime, isPlaying, songMetadata, zoom: externalZoom = 1.0, setZoom: setExternalZoom, lyricMode = 'Movable Do',
  transpose = 0, layoutMode, isLoupeEnabled, pageFormat = 'A4', showBorders = true,
  editorMode = 'select', drawingColor = '#6366f1', clearTrigger = 0,
  onPageCountChange, onActivePageChange, onMetadataChange,
  titleFontSize = 12, systemSpacing = 18,
  showLaser = true,
  drawings = [], onDrawingChange,
  textAnnotations = [], onTextAnnotationsChange,
  musicFont = 'Leland', lyricFont = 'Inter',
  stemThickness = 0.2, barlineThickness = 0.3, stafflineThickness = 0.15,
  isPreviewMode = false,
  isEditable = false, activeNotationTool = 'select', onXmlChange,
  activeLoop = null,
  performanceMode = false
}, ref) => {
  // Detection for Mobile Devices (Centralized)
  const isMobile = useMemo(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const vrvToolkitRef = useRef<any>(null);
  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const starAnimFrameRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);

  const [localZoom, setLocalZoom] = useState(1.0);
  const initialDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef(1.0);

  const [isReady, setIsReady] = useState(false);
  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [mappedCount, setMappedCount] = useState(0);
  const [loadingStep, setLoadingStep] = useState<string>(xmlData ? "Warming up Neural Engine..." : "");
  const [error, setError] = useState<string | null>(null);
  // const [debugInfo, setDebugInfo] = useState('waiting...');

  const displayTitle = useMemo(() => {
    if (songMetadata?.title && songMetadata.title !== 'NEURAL PROJECT' && songMetadata.title !== 'Untitled') {
      return songMetadata.title;
    }
    const rawParsed = musicEngine.parseMusicXml(xmlData || '');
    const title = rawParsed.metadata.title;
    return (title === 'NEURAL PROJECT' || !title) ? "UNNAMED MASTERPIECE" : title;
  }, [songMetadata?.title, xmlData]);

  const displayArtist = useMemo(() => {
    if (songMetadata?.artist && songMetadata.artist !== 'MAESTRO' && songMetadata.artist !== 'Unknown') {
      return songMetadata.artist;
    }
    const rawParsed = musicEngine.parseMusicXml(xmlData || '');
    const artist = rawParsed.metadata.artist;
    return (artist === 'MAESTRO' || !artist) ? "UNKNOWN MAESTRO" : artist;
  }, [songMetadata?.artist, xmlData]);

  useEffect(() => {
    let checkCount = 0;
    const initVrv = () => {
      const verovio = (window as any).verovio;

      // If a global instance already exists, reuse it to prevent WASM memory leaks
      if ((window as any).__globalVrvToolkit) {
        vrvToolkitRef.current = (window as any).__globalVrvToolkit;
        setIsReady(true);
        setLoadingStep("");
        return;
      }

      if (verovio?.toolkit) {
        try {
          // Instantiate once and store globally for the entire window session
          const instance = new verovio.toolkit();
          (window as any).__globalVrvToolkit = instance;
          vrvToolkitRef.current = instance;
          setIsReady(true);
          setLoadingStep("");
        } catch (e) {
          console.warn("Verovio toolkit instantiation failed, waiting for WASM...", e);
          if (checkCount++ < 30) setTimeout(initVrv, 1000);
          else setError("Failed to initialize Verovio Toolkit.");
        }
      } else {
        if (checkCount++ < 30) setTimeout(initVrv, 1000);
        else setError("Music Library (Verovio) script not found.");
      }
    };
    initVrv();
  }, []);

  const barMapsRef = useRef<BarMap[]>([]);
  const svgNoteMapRef = useRef<SvgNoteElement[]>([]);
  const syncPointsRef = useRef<{ time: number, relX: number, pageIndex: number }[]>([]);
  const scoreEndTimeRef = useRef<number>(0);      // Verovio score end = visual range of syncPoints
  const cycleLengthRef = useRef<number>(0);        // Audio repeat cycle (measure-1 reappears)
  // Measure-number → first-note DOM position cache (key = "n" attribute value of .measure)
  const measurePosRef = useRef<Map<string, { relX: number, pageIndex: number }>>(new Map());
  // Unrolled timeline: maps EVERY transport beat → DOM visual position (THE solution for repeats)
  const unrolledTimelineRef = useRef<{ t: number, relX: number, pageIndex: number }[]>([]);
  const volta1MeasuresRef = useRef<Set<string>>(new Set());
  const prevPageRef = useRef<number>(-1);
  // Track current repeat pass (0=cyan pass1, 1+=rose pass2+)
  const currentPassRef = useRef<number>(0);

  // When playback starts (isPlaying transitions to true), reset prevPageRef
  // so that the laser animation will re-scroll to the currently active page.
  // This handles the case where user scrolls away, stops, then plays again.
  useEffect(() => {
    if (isPlaying) {
      prevPageRef.current = -1;
    }
  }, [isPlaying]);

  const createCoordMap = useCallback(() => {
    if (!containerRef.current || !vrvToolkitRef.current) return;

    console.log('[Memolody] ⚡ Building coordmap via Verovio timemap...');

    // ================================================================
    // STEP 1: Get exact qstamps from Verovio renderToTimemap (GROUND TRUTH)
    // qstamp = quarter-note position, same unit as transportMusicalTime
    // ================================================================
    const qstampById = new Map<string, number>();
    const durationById = new Map<string, number>();
    let scoreEndTime = 0; // max offQstamp from Verovio = true end of score (before repeats)

    try {
      const timemapRaw = vrvToolkitRef.current.renderToTimemap({ includeMeasures: true });
      const timemap: any[] = typeof timemapRaw === 'string' ? JSON.parse(timemapRaw) : (Array.isArray(timemapRaw) ? timemapRaw : []);

      timemap.forEach((entry: any) => {
        const qstamp: number = typeof entry.qstamp === 'number' ? entry.qstamp : 0;
        const offQstamp: number = typeof entry.offQstamp === 'number' ? entry.offQstamp : (qstamp + 1);
        const dur = Math.max(0.1, offQstamp - qstamp);
        scoreEndTime = Math.max(scoreEndTime, offQstamp);  // ← capture score end

        const onIds: string[] = Array.isArray(entry.on) ? entry.on : [];
        onIds.forEach((id: string) => {
          if (id) { qstampById.set(id, qstamp); durationById.set(id, dur); }
        });
      });
      console.log('[Memolody] 🎯 Timemap: entries =', timemap.length, '| IDs mapped =', qstampById.size, '| scoreEnd =', scoreEndTime.toFixed(1));
    } catch (e) {
      console.warn('[Memolody] renderToTimemap failed:', e);
    }

    // ================================================================
    // STEP 2: Build noteMap using timemap qstamps where available,
    //         fall back to sequential slot matching otherwise.
    // ================================================================
    let noteMap: SvgNoteElement[] = [];

    // Fallback: build xmlChords sorted by time
    let xmlChords: { startTime: number, duration: number }[] = [];
    if (qstampById.size === 0) {
      try {
        const rawParsed = musicEngine.parseMusicXml(xmlData || '');
        rawParsed.notes.sort((a, b) => a.startTime - b.startTime).forEach(n => {
          const ex = xmlChords.find(c => Math.abs(c.startTime - n.startTime) < 0.01);
          if (!ex) xmlChords.push({ startTime: n.startTime, duration: Math.max(0.1, n.duration) });
        });
      } catch (e) { }
    }

    const domNotesList = Array.from(containerRef.current.querySelectorAll('g.note[id]')) as SVGElement[];
    let slotIndex = 0;

    domNotesList.forEach(g => {
      const id = g.id;
      const use = g.querySelector('use') as SVGElement;
      const solfegeEl = g.querySelector('.lyric text') as SVGElement;
      const rect = (use || g).getBoundingClientRect();

      let startTime: number;
      let duration: number;

      if (qstampById.has(id)) {
        startTime = qstampById.get(id)!;
        duration = durationById.get(id) ?? 1;
      } else {
        const chord = xmlChords[slotIndex] ?? xmlChords[xmlChords.length - 1] ?? { startTime: 0, duration: 1 };
        startTime = chord.startTime;
        duration = chord.duration;
        slotIndex++;
      }

      noteMap.push({
        id,
        startTime,
        duration,
        trackId: 'P1',
        noteheadElement: use || g,
        solfegeElement: solfegeEl,
        containerElement: g,
        measureId: g.closest('.measure')?.id || '',
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      } as any);
    });

    svgNoteMapRef.current = noteMap;
    console.log('[Memolody] ✅ noteMap:', noteMap.length);

    // Build pageRects lookup for DOM position calculations
    const pageContainers = Array.from(containerRef.current.querySelectorAll('[data-page-index]')) as HTMLElement[];
    const pageRects = pageContainers.map(p => ({
      idx: parseInt(p.getAttribute('data-page-index') || '0'),
      rect: p.getBoundingClientRect(),
      el: p
    }));

    // ── Build measure → first-note position cache ──────────────────────────
    // Key = measure 'n' attribute (e.g. "1", "5"). Value = relX + pageIndex
    // Used in animateLaser to jump back on repeats WITHOUT cycleLength arithmetic.
    const measurePosMap = new Map<string, { relX: number, pageIndex: number }>();
    const seenMeasures = new Set<string>();
    noteMap.forEach(n => {
      if (!n.containerElement) return;
      const mEl = n.containerElement.closest('.measure');
      const mn = mEl?.getAttribute('n') || '';
      if (!mn || seenMeasures.has(mn)) return;
      seenMeasures.add(mn);
      const pc = pageRects.find(p => p.el.contains(n.containerElement!));
      if (!pc) return;
      const nr = n.containerElement!.getBoundingClientRect();
      measurePosMap.set(mn, {
        relX: (nr.left + nr.width / 2 - pc.rect.left) / pc.rect.width,
        pageIndex: pc.idx
      });
    });
    measurePosRef.current = measurePosMap;
    console.log('[Memolody] 📐 measurePos cache: ', measurePosMap.size, 'measures');

    // ================================================================
    // STEP 3 + 4: Build syncPoints + barMaps (CLEAN WRAPPED-TIME APPROACH)
    //
    //  Core insight:
    //  - Verovio renders the WRITTEN score (no repeats) → DOM positions
    //  - scoreEndTime (from timemap) = real duration of the written score
    //  - When audio repeats, transport time T > scoreEndTime
    //  - Laser position = lookup(T % scoreEndTime) from first-pass syncPoints
    //  - This works for ANY number of repeats, zero parsing required
    // ================================================================

    const realBars: BarMap[] = [];
    const timeToData = new Map<number, { relXs: number[], pages: number[] }>();
    const processedMeasures = new Set<string>();

    noteMap.forEach(n => {
      const mEl = n.containerElement?.closest('.measure') as SVGElement;
      if (!mEl) return;
      const pc = pageRects.find(p => p.el.contains(mEl));
      if (!pc) return;
      const pageDivRect = pc.rect;
      if (pageDivRect.width === 0) return;
      const nr = n.containerElement!.getBoundingClientRect();
      const avgRelX = (nr.left + nr.width / 2 - pageDivRect.left) / pageDivRect.width;

      if (!timeToData.has(n.startTime)) timeToData.set(n.startTime, { relXs: [], pages: [] });
      timeToData.get(n.startTime)!.relXs.push(avgRelX);
      timeToData.get(n.startTime)!.pages.push(pc.idx);

      const mId = mEl.getAttribute('n') || mEl.id || '';
      if (mId && !processedMeasures.has(mId)) {
        processedMeasures.add(mId);
        const staves = Array.from(mEl.querySelectorAll('.staff')) as SVGElement[];
        let mTop = 999999, mBottom = -999999;
        staves.forEach(st => {
          const sr = st.getBoundingClientRect();
          if (sr.height > 0) { mTop = Math.min(mTop, sr.top); mBottom = Math.max(mBottom, sr.bottom); }
        });
        if (mTop === 999999) return;
        const baseRect = mEl.getBoundingClientRect();
        realBars.push({
          measureNumber: parseInt(mId) || 0,
          startRelX: (baseRect.left - pageDivRect.left) / pageDivRect.width,
          endRelX: (baseRect.right - pageDivRect.left) / pageDivRect.width,
          startTime: n.startTime,
          duration: 1,
          pageIndex: pc.idx,
          y: (mTop - pageDivRect.top) / pageDivRect.height,
          height: (mBottom - mTop) / pageDivRect.height,
          systemId: mEl.closest('.system')?.id || ''
        });
      }
    });

    realBars.sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < realBars.length - 1; i++) {
      realBars[i].duration = Math.max(0.1, realBars[i + 1].startTime - realBars[i].startTime);
    }
    if (realBars.length > 0) realBars[realBars.length - 1].duration = 4;
    barMapsRef.current = realBars;

    // Build first-pass syncPoints (Verovio DOM = written score, no repeats)
    const firstPassPoints: { time: number, relX: number, pageIndex: number }[] = [];
    timeToData.forEach((data, beatTime) => {
      const avgX = data.relXs.reduce((a, b) => a + b, 0) / data.relXs.length;
      firstPassPoints.push({ time: beatTime, relX: avgX, pageIndex: data.pages[0] });
    });
    firstPassPoints.sort((a, b) => a.time - b.time);

    // scoreEndTime = visual range of syncPoints (written score length from Verovio)
    const finalScoreEnd = scoreEndTime > 0
      ? scoreEndTime
      : (firstPassPoints.length > 0 ? firstPassPoints[firstPassPoints.length - 1].time + 2 : 0);
    scoreEndTimeRef.current = finalScoreEnd;

    // ── Cycle Length Detection ─────────────────────────────────────────────
    // cycleLength = WHEN THE MUSIC JUMPS BACK = time when measure-1 appears
    // for the 2nd time in the UNROLLED note sequence from parseMusicXml.
    // This is DIFFERENT from scoreEndTime (which is the written score length).
    //
    // Example: written score A B [1:C:][2:D] E = 20 beats total (Verovio)
    //   Unrolled: A(0) B(4) C(8) | repeat | A(12) B(16) D(20) E(24)
    //   cycleLength = 12 (when A reappears), scoreEnd = 20
    //   wrappedT = unrolledT % 12  ←  NOT % 20  ← THIS IS THE FIX
    let cycleLength = 0;
    try {
      const parsed = musicEngine.parseMusicXml(xmlData || '');
      const unrolled = parsed.notes;
      if (unrolled.length > 0) {
        const parsedMax = Math.max(...unrolled.map(n => n.startTime + n.duration));
        // Only detect cycle if unrolled sequence is longer than written score
        // (meaning there's actually a repeat in the audio)
        if (parsedMax > finalScoreEnd + 1) {
          // Find the first measure that appears twice (its 2nd startTime = cycle length)
          const firstMeasure = unrolled[0].measure;
          const secondOccurrence = unrolled.find(
            n => n.measure === firstMeasure && n.startTime > 0.5
          );
          if (secondOccurrence) {
            cycleLength = secondOccurrence.startTime;
          } else {
            // Fallback: use half the total parsed time
            cycleLength = parsedMax / 2;
          }
          console.log(`[Memolody] 🔁 Repeat detected! cycleLen=${cycleLength.toFixed(1)}b scoreEnd=${finalScoreEnd.toFixed(1)}b parsedMax=${parsedMax.toFixed(1)}b`);
        } else {
          console.log(`[Memolody] ▶️ No repeat. scoreEnd=${finalScoreEnd.toFixed(1)}b parsedMax=${parsedMax.toFixed(1)}b`);
        }
      }
    } catch (e) {
      console.warn('[Memolody] cycleLength detection failed', e);
    }
    cycleLengthRef.current = cycleLength;

    // Detect volta-1 measures for coloring exclusion on 2nd pass
    const volta1Measures = new Set<string>();
    try {
      const xmlDoc = new DOMParser().parseFromString(xmlData || '', 'text/xml');
      xmlDoc.querySelectorAll('measure').forEach(m => {
        if (m.querySelector('barline ending[number="1"]')) {
          volta1Measures.add(m.getAttribute('number') || '');
        }
      });
      if (volta1Measures.size > 0)
        console.log('[Memolody] 🎼 Volta-1 measures:', [...volta1Measures]);
    } catch (e) { }
    volta1MeasuresRef.current = volta1Measures;
    syncPointsRef.current = firstPassPoints;

    // ── BUILD UNROLLED TIMELINE ──────────────────────────────────────────
    // Map each unrolled transport beat → DOM visual position.
    // This is THE correct approach for repeats: the unrolled sequence
    // tells us EXACTLY which measure is playing at each transport time,
    // and we map that to the visual position of that measure in the DOM.
    //
    // Steps:
    //   1. Group svgNoteMap by measure number → measureVisualNotes
    //   2. Get unrolled notes from parseMusicXml (includes all repeats)
    //   3. For each unrolled note, find matching visual note by
    //      offset-within-measure → get relX + pageIndex
    //   4. Result: sorted array of { t: unrolledBeat, relX, pageIndex }

    // 1. Group visual notes by measure number
    const measureVisualNotes = new Map<string, { offset: number, relX: number, pageIndex: number }[]>();
    const measureVrvStart = new Map<string, number>(); // measure → earliest qstamp
    noteMap.forEach(n => {
      if (!n.containerElement) return;
      const mn = n.containerElement.closest('.measure')?.getAttribute('n') || '';
      if (!mn) return;
      if (!measureVisualNotes.has(mn)) {
        measureVisualNotes.set(mn, []);
        measureVrvStart.set(mn, n.startTime);
      }
      const mStart = measureVrvStart.get(mn)!;
      if (n.startTime < mStart) measureVrvStart.set(mn, n.startTime);
      const pc = pageRects.find(p => p.el.contains(n.containerElement!));
      if (!pc) return;
      const nr = n.containerElement!.getBoundingClientRect();
      measureVisualNotes.get(mn)!.push({
        offset: n.startTime - mStart, // will be recalculated after grouping
        relX: (nr.left + nr.width / 2 - pc.rect.left) / pc.rect.width,
        pageIndex: pc.idx
      });
    });
    // Recalculate offsets now that we know the true measure start
    measureVisualNotes.forEach((notes, mn) => {
      const mStart = measureVrvStart.get(mn) || 0;
      notes.forEach(n => { n.offset = n.offset; }); // offset was already relative
      notes.sort((a, b) => a.offset - b.offset);
    });

    // 2. Get unrolled notes
    const parsed2 = musicEngine.parseMusicXml(xmlData || '');
    const unrolledNotes = parsed2.notes;

    // 3. Build timeline: for each unrolled note, find visual match
    const timeline: { t: number, relX: number, pageIndex: number }[] = [];
    // Track measure occurrence start times for offset calculation
    const measureOccurrenceStart = new Map<string, number>();

    unrolledNotes.forEach(n => {
      const mn = n.measure || '';
      if (!mn) return;

      // Track when each measure occurrence starts (reset when measure changes back)
      if (!measureOccurrenceStart.has(mn) || n.startTime < (measureOccurrenceStart.get(mn) || 0)) {
        // This is a new occurrence of this measure
      }

      // Use measurePosMap for this measure's position (measure-level granularity)
      const mPos = measurePosMap.get(mn);
      if (!mPos) return;

      // Try per-note precision: find visual note with closest offset in this measure
      const visNotes = measureVisualNotes.get(mn);
      if (visNotes && visNotes.length > 0) {
        // Find offset of this note within its first-pass measure
        // We approximate by using the first visual note for the first unrolled note,
        // second visual note for the second unrolled note, etc.
        const mOccStart = measureOccurrenceStart.get(mn);
        if (mOccStart === undefined) {
          measureOccurrenceStart.set(mn, n.startTime);
        }
        const offset = n.startTime - (measureOccurrenceStart.get(mn) || 0);

        // Find closest visual note by offset
        let bestDist = 9999, bestIdx = 0;
        for (let i = 0; i < visNotes.length; i++) {
          const d = Math.abs(visNotes[i].offset - offset);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        timeline.push({
          t: n.startTime,
          relX: visNotes[bestIdx].relX,
          pageIndex: visNotes[bestIdx].pageIndex
        });
      } else {
        // Fallback: use measure start position
        timeline.push({ t: n.startTime, ...mPos });
      }
    });

    // Reset occurrence tracker for repeated measures
    // (We need a smarter approach: group consecutive notes by measure)
    // Actually let's rebuild more carefully:
    const timelineClean: { t: number, relX: number, pageIndex: number }[] = [];
    let prevT = -1;
    for (const entry of timeline) {
      if (entry.t > prevT + 0.001) { // skip duplicates at same time
        timelineClean.push(entry);
        prevT = entry.t;
      }
    }
    timelineClean.sort((a, b) => a.t - b.t);
    unrolledTimelineRef.current = timelineClean;

    setMappedCount(c => c + 1);
    console.log('[Memolody] ✅ coordMap — syncPts:', firstPassPoints.length, '| unrolledTimeline:', timelineClean.length, '| bars:', realBars.length, '| cycle:', cycleLength.toFixed(1), 'b');

  }, [xmlData]);

  const renderScore = useCallback(async () => {
    if (!isReady || !vrvToolkitRef.current || !xmlData) return;
    setLoadingStep("Syncing Neural Score...");
    setError(null);
    try {
      const vrvToolkit = vrvToolkitRef.current;
      let finalXml = transpose !== 0 ? transposeMusicXml(xmlData, transpose) : xmlData;

      // Inject Lyric based on mode
      if (lyricMode !== 'Closed' && lyricMode !== 'Words') {
        finalXml = injectSolfegeToXml(finalXml, lyricMode as any);
      }

      vrvToolkit.setOptions({
        scale: 45,
        font: musicFont,
        header: "none",
        footer: "none",
        adjustPageHeight: false,
        pageWidth: 2100,
        pageHeight: 2970,
        pageMarginTop: 150,
        pageMarginBottom: 100,
        pageMarginLeft: 80,
        pageMarginRight: 80,
        spacingSystem: systemSpacing,
        spacingStaff: 18,
        lyricTopMinMargin: 4.0, // Replaced spacingLyricTop with standard lyricTopMinMargin
        lyricSize: 3.0,
        stemWidth: stemThickness,
        barLineWidth: barlineThickness,
        staffLineWidth: stafflineThickness,
        svgViewBox: true,
        breaks: 'auto',
      });

      vrvToolkit.loadData(finalXml);
      vrvToolkit.redoLayout();

      const pageCount = vrvToolkit.getPageCount();
      if (onPageCountChange) onPageCountChange(pageCount);

      const pages = [];
      for (let i = 1; i <= Math.min(pageCount, 100); i++) {
        pages.push(vrvToolkit.renderToSVG(i, {}));
      }

      setSvgPages(pages);
      setLoadingStep("");
      setTimeout(() => {
        createCoordMap();
        // DEBUG: Direct SVG scan test after rendering
        if (containerRef.current) {
          const allUse = containerRef.current.querySelectorAll('use');
          const allGWithId = containerRef.current.querySelectorAll('g[id]');
          const noteGs = containerRef.current.querySelectorAll('g[id^="note"]');
          const sampleIds = Array.from(allGWithId).slice(0, 8).map(e => (e as Element).id);
          // const msg = `SVG: use=${allUse.length} g[id]=${allGWithId.length} note-g=${noteGs.length} noteMap=${svgNoteMapRef.current.length} IDs=[${sampleIds.join(',')}]`;
          // setDebugInfo(msg);
          // console.log('[Memolody-DEBUG]', msg);
        }
      }, 500);
    } catch (err) {
      setLoadingStep("");
      setError("Matrix Rendering Error. The XML might be corrupted.");
    }
  }, [isReady, xmlData, lyricMode, transpose, musicFont, systemSpacing, stemThickness, barlineThickness, stafflineThickness, onPageCountChange, createCoordMap]);

  useEffect(() => {
    if (xmlData) {
      const debounce = setTimeout(renderScore, 400);
      return () => clearTimeout(debounce);
    } else {
      setSvgPages([]);
    }
  }, [renderScore, xmlData]);




  // ============ STARDUST CONSTELLATION EFFECT ============
  // Color played notes via CSS classes for high performance.
  const PLAYED_COLOR = '#00e5ff';         // Pass 1: Signature Cyan
  const PLAYED_TEXT_COLOR = '#0ea5e9';    // Pass 1: Sky blue for text
  const PLAYED2_COLOR = '#f472b6';        // Pass 2: Rose/Pink
  const PLAYED2_TEXT_COLOR = '#e879f9';   // Pass 2: Magenta for text
  const playedStyleRef = useRef<HTMLStyleElement | null>(null);

  // Initial style setup - only runs once
  useEffect(() => {
    if (!playedStyleRef.current) {
      playedStyleRef.current = document.createElement('style');
      playedStyleRef.current.setAttribute('data-stardust-base', 'true');

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const shouldDisableFilter = performanceMode || isMobile;

      playedStyleRef.current.textContent = `
        /* ── Pass 1 (Cyan) ── */
        g.note.played use { fill: ${PLAYED_COLOR} !important; }
        g.note.played .stem path { stroke: ${PLAYED_COLOR} !important; }
        g.note.played text { fill: ${PLAYED_TEXT_COLOR} !important; }
        g.note.played {
          ${shouldDisableFilter ? '' : `filter: drop-shadow(0 0 6px rgba(0,229,255,0.6)); transition: filter 0.3s ease;`}
        }
        /* ── Pass 2 (Rose/Pink) ── */
        g.note.played-2 use { fill: ${PLAYED2_COLOR} !important; }
        g.note.played-2 .stem path { stroke: ${PLAYED2_COLOR} !important; }
        g.note.played-2 text { fill: ${PLAYED2_TEXT_COLOR} !important; }
        g.note.played-2 {
          ${shouldDisableFilter ? '' : `filter: drop-shadow(0 0 6px rgba(244,114,182,0.7)); transition: filter 0.3s ease;`}
        }
      `;
      document.head.appendChild(playedStyleRef.current);
    }
    return () => {
      if (playedStyleRef.current) {
        playedStyleRef.current.remove();
        playedStyleRef.current = null;
      }
    };
  }, [performanceMode]);

  // Handle case where music restarts or jumps (including Back button → reset to 0)
  useEffect(() => {
    prevTimeRef.current = currentTime;

    const noteMap = svgNoteMapRef.current;
    if (noteMap.length === 0) return;

    if (!isPlaying) {
      // Reset ALL notes when seeking back to start
      if (currentTime < 0.05) {
        noteMap.forEach(n => {
          n.containerElement?.classList.remove('played', 'played-2');
        });
        return;
      }

      // Time-based coloring when paused/seeking — use cycleLength for wrapping
      const cycleLen = cycleLengthRef.current;
      const pts = syncPointsRef.current;
      // Fallback: if no cycle detected, no wrapping needed
      const effectiveCycle = cycleLen > 1 ? cycleLen
        : (pts.length > 0 ? pts[pts.length - 1].time + 9999 : 9999);

      const pass = effectiveCycle > 1 ? Math.floor(currentTime / effectiveCycle) : 0;
      const wrappedT = cycleLen > 1 ? currentTime % cycleLen : currentTime;

      noteMap.forEach(n => {
        if (!n.containerElement) return;
        const isPlayed = n.startTime <= wrappedT + 0.05;
        if (isPlayed) {
          if (pass === 0) {
            n.containerElement.classList.add('played');
            n.containerElement.classList.remove('played-2');
          } else {
            n.containerElement.classList.add('played-2');
            n.containerElement.classList.remove('played');
          }
        } else {
          n.containerElement.classList.remove('played', 'played-2');
        }
      });
    }
  }, [currentTime, isPlaying]);


  // Stardust particle canvas animation
  useEffect(() => {
    const canvas = starCanvasRef.current;
    if (!canvas || !containerRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Particle & Falling Shadow pool
    interface Star {
      x: number; y: number; tx: number; ty: number;
      size: number; alpha: number; speed: number;
      hue: number; life: number; maxLife: number;
      type?: 'star' | 'falling_note';
    }
    let stars: Star[] = [];
    const MAX_STARS = performanceMode ? 100 : 600;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const animate = () => {
      starAnimFrameRef.current = requestAnimationFrame(animate);
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const noteMap = svgNoteMapRef.current;
      if (noteMap.length === 0) return;

      // USE GENUINE REAL-TIME for star spawning to avoid "clumping" jitter
      const ctRaw = isPlaying ? musicEngine.transportMusicalTime : prevTimeRef.current;
      // Wrap transport time using cycleLength (not scoreEnd) for particle positioning
      const cycleLen = cycleLengthRef.current;
      const ct = cycleLen > 1 ? ctRaw % cycleLen : ctRaw;
      const playing = isPlaying;

      // Spawn new particles/falling shadows toward upcoming and active notes
      if (playing && containerRef.current) {
        const LOOK_AHEAD = 1.0;
        const currentStaves = new Map<number, { x: number; y: number; staffLevel: number; timeDiff: number }>();

        // BINARY SEARCH for startIdx to avoid O(N) iteration from beginning every frame
        let startIdx = 0;
        let low = 0, high = noteMap.length - 1;
        while (low <= high) {
          let mid = Math.floor((low + high) / 2);
          if (noteMap[mid].startTime < ct - 0.5) low = mid + 1;
          else high = mid - 1;
        }
        startIdx = low;

        for (let i = startIdx; i < noteMap.length; i++) {
          const noteEl = noteMap[i];
          const timeUntilNote = noteEl.startTime - ct;

          if (timeUntilNote > LOOK_AHEAD) break;

          // 1. Upcoming Notes -> "Waterfall" (STRICTLY DISABLE HEAVY PARTICLES ON MOBILE)
          if (!isMobile && timeUntilNote > 0 && noteEl.noteheadElement) {
            const targetX = noteEl.x;
            const targetY = noteEl.y;

            // Track aircraft hover position (Grouped roughly by 150px vertical sections)
            const staffLevel = Math.round(targetY / 150) * 150;
            const prev = currentStaves.get(staffLevel);
            if (!prev || Math.abs(timeUntilNote) < Math.abs(prev.timeDiff)) {
              const interpX = targetX - (timeUntilNote > 0 ? (timeUntilNote * 80) : 0);
              currentStaves.set(staffLevel, { x: interpX, y: targetY - 160, staffLevel, timeDiff: timeUntilNote });
            }

            if (Math.random() > 0.85) {
              const progress = 1 - (timeUntilNote / LOOK_AHEAD);
              const currentY = (targetY - 160) + (160 * progress);
              stars.push({
                x: targetX, y: currentY, tx: targetX, ty: targetY,
                size: 4 + Math.random() * 4, alpha: 0.3 + (progress * 0.5),
                speed: 0.2, hue: 190, life: 0, maxLife: 8, type: 'falling_note'
              });
            }
          }

          // 2. Active Notes -> "Impact Sparks"
          const isActive = ct >= noteEl.startTime && ct < (noteEl.startTime + noteEl.duration);
          if (isActive && noteEl.noteheadElement) {
            // Further reduce spawn rate on mobile
            const spawnRate = (performanceMode || isMobile) ? 0.95 : 0.4;
            if (Math.random() > spawnRate) {
              const noteX = noteEl.x;
              const noteY = noteEl.y;
              const angle = Math.random() * Math.PI * 2;
              const dist = 10 + Math.random() * 20;
              stars.push({
                x: noteX, y: noteY, tx: noteX + Math.cos(angle) * dist, ty: noteY + Math.sin(angle) * dist,
                size: 1 + Math.random() * 2, alpha: 0.7, speed: 0.1, hue: 185, life: 0, maxLife: 20, type: 'star'
              });
            }
          }
        }
      }

      // Update and draw stars
      const nextStars: Star[] = [];
      for (const star of stars) {
        star.life++;
        if (star.life > star.maxLife) continue;

        // Move toward target
        star.x += (star.tx - star.x) * star.speed;
        star.y += (star.ty - star.y) * star.speed;

        // Fade in then out
        const lifeFrac = star.life / star.maxLife;
        const fadeAlpha = lifeFrac < 0.3 ? (lifeFrac / 0.3) : (1 - (lifeFrac - 0.3) / 0.7);
        const drawAlpha = star.alpha * fadeAlpha;

        // Draw star with glow
        ctx.save();
        if (star.type === 'falling_note') {
          // Drawing the "Falling Copy" as a glowing drop shadow
          ctx.shadowBlur = 15;
          ctx.shadowColor = `hsla(${star.hue}, 100%, 50%, 0.8)`;
          ctx.globalAlpha = drawAlpha;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${star.hue}, 90%, 70%, 1)`;
          ctx.fill();
        } else {
          // Regular Particle
          ctx.globalAlpha = drawAlpha * 0.3;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${star.hue}, 80%, 70%, 1)`;
          ctx.fill();

          ctx.globalAlpha = drawAlpha;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${star.hue}, 90%, 85%, 1)`;
          ctx.fill();

          // Tiny bright core
          ctx.globalAlpha = drawAlpha * 0.8;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
        ctx.restore();

        nextStars.push(star);
      }
      stars = nextStars;
    };

    starAnimFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(starAnimFrameRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isPlaying]);

  // ---- 60fps Laser Loop ----
  // Source of truth: musicEngine.currentMeasure (= written bar number, same as Transport)
  useEffect(() => {
    if (!showLaser) return;
    let rid: number;
    let prevMeasureNum = 0;
    let passCount = 0;
    let frameCount = 0;
    let wasReset = false;
    let prevRawT = 0;
    let lastKnownMeasure = '';  // last non-empty currentMeasure
    let lastKnownNum = 0;

    const animateLaser = () => {
      rid = requestAnimationFrame(animateLaser);
      frameCount++;

      // Wait until syncPoints are ready (baseline requirement)
      const pts = syncPointsRef.current;
      if (pts.length === 0) return;

      // ── Timing ──────────────────────────────────────────────────────────
      const visualDelay = isMobile ? 0.15 : 0.05;
      const latencyBeats = visualDelay * (Tone.Transport.bpm.value / 60);
      const rawT = musicEngine.transportMusicalTime;
      const t = Math.max(0, rawT - latencyBeats);

      // Prefer unrolled timeline (precise); fall back to syncPoints (written)
      const tl = unrolledTimelineRef.current;
      const useUnrolled = tl.length > 0;

      // Debug log once per 120 frames
      if (frameCount % 120 === 1) {
        console.log(`[Laser] t=${t.toFixed(2)} tl=${tl.length} pts=${pts.length} mode=${useUnrolled ? 'unrolled' : 'syncPts'}`);
      }

      // ── Detect Back button (transport reset to 0) ───────────────────────
      if (rawT < 0.2) {
        if (!wasReset) {
          wasReset = true;
          svgNoteMapRef.current.forEach(n => {
            n.containerElement?.classList.remove('played', 'played-2');
          });
          prevPageRef.current = -1;
          const firstPage = containerRef.current?.children[0] as HTMLElement;
          if (firstPage) firstPage.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      } else {
        wasReset = false;
      }

      // ── Detect transport jump backward (repeat or seek-back) ─────────────
      // When rawT drops by more than 0.5 beats vs last frame → user seeked or
      // a repeat sign fired. Reset lastKnownMeasure so stale value is not used.
      if (rawT < prevRawT - 0.5) {
        lastKnownMeasure = '';
      }
      prevRawT = rawT;

      // ── Determine current measure ─────────────────────────────────────────
      //
      //  We use THREE sources merged by priority:
      //   A. barMaps time lookup  (always computes a bar, instant on seek/repeat)
      //   B. musicEngine.currentMeasure  (authoritative from Tone.Part callback)
      //   C. lastKnownMeasure  (holds last good value while paused)
      //
      //  barMaps uses WRITTEN score timings (qstamp beats from Verovio, 0-based).
      //  Transport time is in beats from start of audio.
      //  When no count-in: they align. We use scoreEnd to wrap for repeats.

      const measureCache = measurePosRef.current;
      const bars = barMapsRef.current;
      const scoreEnd = scoreEndTimeRef.current;

      // Wrap transport time into written score domain
      const transportBeats = Math.max(0, t);
      const writtenT = (scoreEnd > 0.5) ? transportBeats % scoreEnd : transportBeats;

      // Source A: bar from barMaps (binary search on startTime)
      let timeDerivedMeasure = '';
      let timeDerivedNum = 0;
      if (bars.length > 0) {
        let lo = 0, hi = bars.length - 1;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (bars[mid].startTime <= writtenT) lo = mid + 1;
          else hi = mid - 1;
        }
        const barIdx = Math.max(0, hi);
        const b = bars[barIdx];
        if (b) {
          timeDerivedNum = b.measureNumber;
          timeDerivedMeasure = String(timeDerivedNum);
        }
      }

      // Source B: from Tone.Part callback (set when note fires)
      const liveMeasure = musicEngine.currentMeasure;
      if (liveMeasure) lastKnownMeasure = liveMeasure;

      // Merge: prefer timeDerived (instant), fall back to liveMeasure/lastKnown
      const curMeasure = timeDerivedMeasure || liveMeasure || lastKnownMeasure;
      const curNum = timeDerivedNum || parseInt(liveMeasure || lastKnownMeasure) || 0;

      // Debug once per 120 frames
      if (frameCount % 120 === 1) {
        console.log(`[Laser] rawT=${rawT.toFixed(2)} writtenT=${writtenT.toFixed(2)} bar=${curMeasure} live="${liveMeasure}" scoreEnd=${scoreEnd.toFixed(1)}`);
      }

      // Laser visual variables
      let pageIndex = 0;
      let relX = 0;
      let barY = 0;
      let barH = 1;

      if (curMeasure && measureCache.has(curMeasure)) {
        // PRIMARY: jump to the DOM position of the current measure
        const mPos = measureCache.get(curMeasure)!;
        pageIndex = mPos.pageIndex;
        relX = mPos.relX;          // measure start, refined below




        // REFINE: interpolate X within the measure using syncPoints
        // Notes in this measure span from their qstamp down to next measure start
        const measureNotes = svgNoteMapRef.current.filter(n =>
          n.containerElement?.closest('.measure')?.getAttribute('n') === curMeasure
        );
        if (measureNotes.length > 0 && pts.length > 0) {
          // Find best matching syncPoint for writtenT (beats) within this measure
          const mStartQ = Math.min(...measureNotes.map(n => n.startTime));
          const mEndQ = Math.max(...measureNotes.map(n => n.startTime + n.duration));
          const mPts = pts.filter(p => p.time >= mStartQ - 0.05 && p.time <= mEndQ + 0.05);
          if (mPts.length > 0) {
            let bestIdx = 0, bestDist = 9999;
            for (let i = 0; i < mPts.length; i++) {
              const d = Math.abs(mPts[i].time - writtenT);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            if (bestDist < 8) {   // close enough to use
              if (bestIdx < mPts.length - 1) {
                const p0 = mPts[bestIdx], p1 = mPts[bestIdx + 1];
                if (p0.pageIndex === p1.pageIndex && p1.time > p0.time) {
                  const prog = Math.max(0, Math.min(1, (writtenT - p0.time) / (p1.time - p0.time)));
                  relX = p0.relX + (p1.relX - p0.relX) * prog;
                } else {
                  relX = mPts[bestIdx].relX;
                }
              } else {
                relX = mPts[bestIdx].relX;
              }
            }
          }
        }

        // Bar Y from barMaps by measure number
        const bar = bars.find(b => b.measureNumber === curNum);
        if (bar) {
          barY = bar.y;
          barH = bar.height;
          pageIndex = bar.pageIndex;    // authoritative page from bar data
        }
      } else {
        // FALLBACK: count-in / not started yet → pure syncPoints binary search
        let lo = 0, hi = pts.length - 1;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (pts[mid].time < writtenT) lo = mid + 1;
          else hi = mid - 1;
        }
        const pIdx = lo;
        if (pIdx === 0) {
          relX = pts[0].relX; pageIndex = pts[0].pageIndex;
        } else if (pIdx >= pts.length) {
          relX = pts[pts.length - 1].relX; pageIndex = pts[pts.length - 1].pageIndex;
        } else {
          const prev = pts[pIdx - 1], next = pts[pIdx];
          pageIndex = prev.pageIndex;
          if (prev.pageIndex === next.pageIndex && next.time > prev.time) {
            const prog = Math.min(1, (writtenT - prev.time) / (next.time - prev.time));
            relX = prev.relX + (next.relX - prev.relX) * prog;
          } else {
            relX = prev.relX;
          }
        }
        // Bar Y fallback
        if (bars.length > 0) {
          let lo2 = 0, hi2 = bars.length - 1;
          while (lo2 <= hi2) {
            const mid = Math.floor((lo2 + hi2) / 2);
            if (bars[mid].startTime <= writtenT) lo2 = mid + 1;
            else hi2 = mid - 1;
          }
          const bar = bars[Math.max(0, hi2)] || bars[0];
          if (bar) { barY = bar.y; barH = bar.height; }
        }
      }


      if (pageIndex < 0) pageIndex = 0;
      if (relX < 0) relX = 0;

      // ── Note coloring (Exact Time-Based) ─────────────────
      const finalScoreEnd = scoreEndTimeRef.current;
      const cycleLen = cycleLengthRef.current;
      let inferredPass = 0;
      let effectiveT = t;

      if (cycleLen > 1 && t >= cycleLen) {
        inferredPass = Math.floor(t / cycleLen);
        effectiveT = t % cycleLen;
      } else if (t > finalScoreEnd) {
        inferredPass = 1;
      }

      const isActuallyPlaying = Tone.Transport.state === 'started';
      if (isActuallyPlaying && t > 0.1) {
        const volta1 = volta1MeasuresRef.current;
        svgNoteMapRef.current.forEach(n => {
          if (!n.containerElement) return;
          const mn = n.containerElement.closest('.measure')?.getAttribute('n') || '';

          if (inferredPass > 0 && volta1.size > 0 && volta1.has(mn)) {
            n.containerElement.classList.remove('played', 'played-2');
            return;
          }

          // Note is coloured if its physical written startTime <= effectiveT
          const isPlayed = n.startTime <= effectiveT + 0.1;
          if (isPlayed) {
            n.containerElement.classList.add(inferredPass === 0 ? 'played' : 'played-2');
            n.containerElement.classList.remove(inferredPass === 0 ? 'played-2' : 'played');
          } else {
            n.containerElement.classList.remove('played', 'played-2');
          }
        });
      }

      // 7. Update laser DOM elements
      const isPass2 = inferredPass > 0;

      for (let i = 0; i < svgPages.length; i++) {
        const el = document.getElementById(`neural-laser-${i}`);
        if (!el) continue;
        if (pageIndex === i) {
          el.style.display = 'block';

          if (isPass2) {
            // Pink laser for 2nd pass (repeat)
            el.style.background = 'rgba(244, 114, 182, 0.2)';
            el.style.boxShadow = '0 0 20px 6px rgba(244, 114, 182, 0.4), 0 0 40px 12px rgba(244, 114, 182, 0.2)';
          } else {
            // Restore original Indigo format from CSS
            el.style.background = '';
            el.style.boxShadow = '';
          }

          el.style.left = `${relX * 100}%`;
          if (layoutMode === 'linear') {
            el.style.top = '0%';
            el.style.height = '100%';
            el.classList.remove('paginated-laser');
          } else {
            el.style.top = `${barY * 100}%`;
            el.style.height = `${barH * 100}%`;
            el.classList.add('paginated-laser');
          }
          // Auto-scroll to active page
          if (prevPageRef.current !== pageIndex) {
            const pageEl = containerRef.current?.children[pageIndex] as HTMLElement;
            if (pageEl) {
              const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
              pageEl.scrollIntoView({ behavior: mobile ? 'auto' : 'smooth', block: 'start' });
            }
            prevPageRef.current = pageIndex;
          }
        } else {
          el.style.display = 'none';
        }
      }
    };

    rid = requestAnimationFrame(animateLaser);
    return () => cancelAnimationFrame(rid);
  }, [isPlaying, showLaser, layoutMode, svgPages.length]);

  const exportToPdf = useCallback(async () => {
    if (!svgPages.length) return;
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: pageFormat });
    for (let i = 0; i < svgPages.length; i++) {
      if (i > 0) doc.addPage();
      const pageEl = containerRef.current?.children[i] as HTMLElement;
      if (pageEl) {
        const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true });
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
      }
    }
    doc.save(`${displayTitle.replace(/\s+/g, '_')}_Score.pdf`);
  }, [svgPages, displayTitle, pageFormat]);

  const exportToImage = useCallback(async (format: 'png' | 'jpeg') => {
    if (!containerRef.current) return;
    const pageEl = containerRef.current.querySelector('.page-container') as HTMLElement;
    if (pageEl) {
      const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `${displayTitle.replace(/\s+/g, '_')}.${format}`;
      link.href = canvas.toDataURL(`image/${format}`, 0.95);
      link.click();
    }
  }, [displayTitle]);

  useImperativeHandle(ref, () => ({ exportToPdf, exportToImage }), [exportToPdf, exportToImage]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialDistanceRef.current = dist;
      initialZoomRef.current = localZoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialDistanceRef.current;
      const newZoom = Math.max(1.0, Math.min(3.0, initialZoomRef.current * factor));
      setLocalZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    initialDistanceRef.current = null;
  };

  if (!xmlData && !loadingStep) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#050507] p-8 text-center gap-6">
        <div className="w-20 h-20 rounded-[32px] bg-white/5 flex items-center justify-center border border-white/10 text-zinc-700">
          <Music2 size={40} />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">Empty Matrix</h3>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed max-w-xs">
            ยังไม่มีเพลงถูกเลือกค่ะ กรุณากลับไปที่ Vault แล้วเลือกเพลงที่ต้องการฝึกซ้อมนะคะ
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative no-print items-center bg-[#050507]">
      <style>{`
        .lyric text { font-family: ${lyricFont}, sans-serif !important; }
        /* Stardust glow on active nodes via tracking */
        .verovio-neural-svg svg { 
            width: 100%; 
            height: auto; 
            display: block; 
            ${isMobile ? '' : 'filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));'} 
            transition: filter 0.3s; 
        }
        .xml-overlay-container { position: relative; width: 100%; height: auto; }
        .neural-playback-laser {
          position: absolute;
          width: 4px;
          border-radius: 4px;
          margin-left: -2px;
          background: rgba(99, 102, 241, 0.15); /* Transparent core */
          box-shadow: 0 0 20px 6px rgba(99, 102, 241, 0.3), 0 0 40px 12px rgba(99, 102, 241, 0.15); /* Diffuse aura */
          z-index: 50;
          pointer-events: none;
          will-change: left, top, height;
          transition: left 0.05s linear, top 0.15s ease-out, height 0.15s ease-out;
        }
        .neural-playback-laser.paginated-laser {
          border: none;
          background: rgba(99, 102, 241, 0.15);
          box-shadow: 0 0 20px 6px rgba(99, 102, 241, 0.3), 0 0 40px 12px rgba(99, 102, 241, 0.15);
        }
      `}</style>
      <canvas ref={starCanvasRef} className="fixed top-0 left-0 w-screen h-screen pointer-events-none z-[10000]" />
      {/* DEBUG BADGE - temporarily re-enabled to diagnose sync */}
      <div className="absolute top-16 right-4 z-[20000] bg-black/60 backdrop-blur text-white text-[8px] font-mono px-3 py-1 rounded-full border border-white/10 shadow-lg pointer-events-none">
        SYNC: {currentTime.toFixed(2)}s | NOTES: {svgNoteMapRef.current.length}
      </div>
      <div
        ref={scrollAreaRef}
        className="flex-1 w-full overflow-auto memolody-scrollbar scroll-smooth p-3 sm:p-6 flex flex-col items-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={containerRef}
          className="relative min-h-full flex flex-col items-center origin-top transition-transform duration-75 ease-out pb-32"
          style={{
            width: '100%',
            maxWidth: localZoom > 1 ? 'none' : '794px',
            transform: `scale(${localZoom})`,
            marginTop: localZoom > 1 ? `${(localZoom - 1) * 50}%` : '0px'
          }}
        >
          {useMemo(() => svgPages.map((svg, i) => (
            <div
              data-page-index={i}
              key={i}
              className={`page-container relative group/page bg-white mb-8 shrink-0
                ${showBorders ? 'shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10' : ''}
                ${isPreviewMode && i > 0 ? 'filter blur-xl grayscale opacity-50' : ''}`}
              style={{
                width: localZoom > 1 ? 'max-content' : '92vw',
                maxWidth: '794px'
              }}
            >
              <div className="absolute inset-0 z-50 pointer-events-none">
                <div id={`neural-laser-${i}`} className="neural-playback-laser" style={{ display: 'none' }} />

                {/* Loop Overlays */}
                {activeLoop && barMapsRef.current
                  .filter(m => m.pageIndex === i && m.measureNumber >= activeLoop.startBar && m.measureNumber <= activeLoop.endBar)
                  .map((m, idx) => (
                    <div
                      key={`${m.measureNumber}-${idx}`}
                      className="absolute"
                      style={{
                        left: `${m.startRelX * 100}%`,
                        width: `${Math.max(0.5, (m.endRelX - m.startRelX) * 100)}%`,
                        top: `${m.y * 100}%`,
                        height: `${m.height * 100}%`,
                        backgroundColor: `${activeLoop.color}15`,
                        borderLeft: `1px solid ${activeLoop.color}30`,
                        borderRight: `1px solid ${activeLoop.color}30`,
                        backdropFilter: 'brightness(1.1)',
                      }}
                    />
                  ))
                }
              </div>
              <div className="score-neural-header flex justify-between items-end pointer-none z-[1500] border-b-[0.5pt] border-black/10 pb-1 mb-2 mx-[10mm] mt-[10mm] shrink-0">
                <div className="text-[6pt] font-bold text-black/30 uppercase tracking-widest italic leading-none">NEURAL SYNC: {lyricMode?.toUpperCase()}</div>
                <div className="text-[7pt] font-black text-black uppercase italic leading-none">by <span className="text-cyan-600">MEMOLODY</span></div>
                <div className="text-[5pt] font-black text-black/50 leading-none">PG {i + 1}</div>
              </div>

              {i === 0 && (
                <div className="w-full flex flex-col items-center pt-2 pb-6 px-[10mm] relative z-[2000] pointer-none shrink-0 border-b-[0.5pt] border-black/5 mb-6">
                  <h1 className="font-black text-black uppercase tracking-[0.25em] text-center leading-none mb-3" style={{ fontSize: `${titleFontSize}pt` }}>{displayTitle}</h1>
                  <div className="flex items-center gap-4">
                    <div className="h-[0.3pt] w-12 bg-black/20" />
                    <div className="text-[8pt] font-black text-black/60 uppercase tracking-[0.15em] italic leading-none">{displayArtist}</div>
                    <div className="h-[0.3pt] w-12 bg-black/20" />
                  </div>
                </div>
              )}

              <div dangerouslySetInnerHTML={{ __html: svg }} className="bg-white flex-1 w-full h-full overflow-hidden" />
            </div>
          )), [svgPages, showBorders, isPreviewMode, localZoom, activeLoop, barMapsRef, lyricMode, titleFontSize, displayTitle, displayArtist])}
        </div>
      </div>

      {localZoom > 1 && (
        <div className="absolute top-4 right-4 z-[5000] animate-in fade-in zoom-in duration-300">
          <div className="bg-cyan-500 text-black px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-2">
            <Zap size={12} fill="currentColor" /> {Math.round(localZoom * 100)}%
            <button onClick={() => setLocalZoom(1.0)} className="ml-2 border-l border-black/20 pl-2 opacity-60 hover:opacity-100">RESET</button>
          </div>
        </div>
      )}

      {error && xmlData && (
        <div className="absolute inset-0 bg-black/90 z-[20000] flex items-center justify-center p-8">
          <div className="max-w-sm w-full bg-[#0c0c0e] border border-rose-500/30 rounded-[40px] p-8 flex flex-col items-center text-center gap-6 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
              <ShieldAlert size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">System Malfunction</h3>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">
                {error}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-12 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} /> Force Reboot
            </button>
          </div>
        </div>
      )}

      {loadingStep && !error && (
        <div className="absolute inset-0 bg-black/80 z-[10000] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin" />
            <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest animate-pulse">{loadingStep}</span>
          </div>
        </div>
      )}
    </div>
  );
});

ProScoreEditor.displayName = 'ProScoreEditor';
export default React.memo(ProScoreEditor, (prev, next) => {
  // CRITICAL PERFORMANCE GUARD: 
  // Do not re-render the entire heavy SVG component when currentTime changes while playing.
  // The internal requestAnimationFrame loop (animateLaser) handles high-precision 
  // positioning and note coloring in real-time via direct DOM manipulation.
  if (next.isPlaying) {
    return prev.xmlData === next.xmlData &&
      prev.isPlaying === next.isPlaying &&
      prev.transpose === next.transpose &&
      prev.lyricMode === next.lyricMode &&
      prev.zoom === next.zoom;
  }

  // When not playing (e.g. seeking while paused), we allow re-renders
  // to ensure manual seeker updates are reflected.
  return prev.xmlData === next.xmlData &&
    prev.isPlaying === next.isPlaying &&
    prev.transpose === next.transpose &&
    prev.lyricMode === next.lyricMode &&
    prev.zoom === next.zoom &&
    prev.currentTime === next.currentTime;
});
