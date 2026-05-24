
import React, { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import * as Tone from 'tone';
import { Music2, Type, Trash2, X, Award, ShieldCheck, Pencil, Lock, ShieldAlert, Printer, Loader2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { injectSolfegeToXml, transposeMusicXml } from '../../lib/MusicXmlParser';
import { ScoreLayoutMode, TextAnnotation } from '../../types';
import { musicEngine } from '../../lib/MusicEngine';
import { computeLayoutSync, buildScrollSyncMap, syncScroll, type LayoutMap } from '../../lib/LayoutSyncService';

interface BarMap {
  measureNumber: number;
  measureId: string;        // raw SVG .measure[n] attribute value e.g. "1","9"
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
  /** [V2] Layout bundle from Scorelens-Engine_V2 for pixel-accurate layout sync */
  layoutBundle?: {
    layout_map: LayoutMap;
    metadata?: { title?: string; composer?: string; tempo_bpm?: number | null };
    typography?: any;
  } | null;
}

export interface ProScoreEditorRef {
  exportToPdf: () => Promise<void>;
  exportToImage: (format: 'png' | 'jpeg') => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════
//  Auto Chord Detection — inject <harmony> from simultaneous notes
// ═══════════════════════════════════════════════════════════════════
function detectAndInjectChords(xml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return xml;

    // Note name → semitone (C=0)
    const STEP_TO_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Chord interval patterns (sorted ascending from root)
    const PATTERNS: Array<{ ivs: number[]; text: string; kind: string }> = [
      { ivs: [0, 4, 7, 11], text: 'maj7', kind: 'major-seventh' },
      { ivs: [0, 4, 7, 10], text: '7', kind: 'dominant' },
      { ivs: [0, 3, 7, 10], text: 'm7', kind: 'minor-seventh' },
      { ivs: [0, 3, 6, 9], text: 'dim7', kind: 'diminished-seventh' },
      { ivs: [0, 3, 6], text: 'dim', kind: 'diminished' },
      { ivs: [0, 4, 8], text: 'aug', kind: 'augmented' },
      { ivs: [0, 2, 7], text: 'sus2', kind: 'suspended-second' },
      { ivs: [0, 5, 7], text: 'sus4', kind: 'suspended-fourth' },
      { ivs: [0, 4, 7], text: '', kind: 'major' },
      { ivs: [0, 3, 7], text: 'm', kind: 'minor' },
    ];

    const matchChord = (pcs: number[]): { root: number; pattern: typeof PATTERNS[0] } | null => {
      for (const root of pcs) {
        const ivs = pcs.map(pc => ((pc - root + 12) % 12)).sort((a, b) => a - b);
        for (const pat of PATTERNS) {
          if (pat.ivs.every(i => ivs.includes(i))) {
            return { root, pattern: pat };
          }
        }
      }
      return null;
    };

    const createHarmonyXml = (rootPc: number, pattern: typeof PATTERNS[0]): string => {
      const rootName = NOTE_NAMES[rootPc];
      const rootStep = rootName.replace(/[#b]/g, '');
      const rootAlter = rootName.includes('#') ? 1 : rootName.includes('b') ? -1 : 0;
      return `<harmony><root><root-step>${rootStep}</root-step>${rootAlter !== 0 ? `<root-alter>${rootAlter}</root-alter>` : ''
        }</root><kind text="${pattern.text}">${pattern.kind}</kind></harmony>`;
    };

    let totalChordsInjected = 0;
    const parts = Array.from(doc.querySelectorAll('part'));

    for (const part of parts) {
      const measures = Array.from(part.querySelectorAll('measure'));

      for (const measure of measures) {
        // Skip measures that already have harmony
        if (measure.querySelector('harmony')) continue;

        let divisions = 1;
        const divEl = measure.querySelector('attributes > divisions');
        if (divEl) divisions = Math.max(1, parseInt(divEl.textContent || '1'));

        // Collect all notes with their onset positions
        const onsetMap = new Map<number, number[]>();
        const onsetFirstNote = new Map<number, Element>();
        let cursor = 0;
        let lastOnset = 0;

        for (const child of Array.from(measure.children)) {
          const tag = child.tagName;
          if (tag === 'note') {
            const isChordNote = child.querySelector('chord') !== null;
            const stepEl = child.querySelector('pitch > step');
            const alterEl = child.querySelector('pitch > alter');
            const octEl = child.querySelector('pitch > octave');
            const durEl = child.querySelector('duration');
            const dur = durEl ? parseInt(durEl.textContent || '1') : 1;

            if (!isChordNote) {
              lastOnset = cursor;
              cursor += dur;
            }

            if (stepEl) {
              const step = stepEl.textContent?.trim() || 'C';
              const alter = alterEl ? parseInt(alterEl.textContent || '0') : 0;
              const octave = octEl ? parseInt(octEl.textContent || '4') : 4;
              const semi = (STEP_TO_SEMI[step] ?? 0) + alter + (octave + 1) * 12;
              const onset = isChordNote ? lastOnset : cursor - dur;

              if (!onsetMap.has(onset)) onsetMap.set(onset, []);
              onsetMap.get(onset)!.push(semi);

              if (!isChordNote && !onsetFirstNote.has(onset)) {
                onsetFirstNote.set(onset, child);
              }
            }
          } else if (tag === 'backup') {
            const d = child.querySelector('duration');
            if (d) cursor = Math.max(0, cursor - parseInt(d.textContent || '0'));
          } else if (tag === 'forward') {
            const d = child.querySelector('duration');
            if (d) cursor += parseInt(d.textContent || '0');
          }
        }

        // ── Strategy 1: Simultaneous notes (original logic) ──────────────
        let foundSimultaneous = false;
        for (const [onset, semitones] of Array.from(onsetMap.entries())) {
          const pcs = Array.from(new Set(semitones.map(s => ((s % 12) + 12) % 12))).sort((a, b) => a - b);
          if (pcs.length < 2) continue;

          const match = matchChord(pcs);
          if (!match) continue;

          const harmXml = createHarmonyXml(match.root, match.pattern);
          const harmDoc = parser.parseFromString(harmXml, 'text/xml');
          const harmEl = doc.importNode(harmDoc.documentElement, true);

          const refNote = onsetFirstNote.get(onset);
          if (refNote) {
            measure.insertBefore(harmEl, refNote);
            totalChordsInjected++;
            foundSimultaneous = true;
          }
        }

        // ── Strategy 2: Melody-only fallback (beat-window grouping) ──────
        // If no simultaneous chords found, group all notes in the entire measure
        // and try to detect a chord from the combined pitch classes
        if (!foundSimultaneous && onsetMap.size > 0) {
          const allPcs = new Set<number>();
          onsetMap.forEach(semitones => {
            semitones.forEach(s => allPcs.add(((s % 12) + 12) % 12));
          });
          const pcsArr = Array.from(allPcs).sort((a, b) => a - b);
          if (pcsArr.length >= 3) {
            const match = matchChord(pcsArr);
            if (match) {
              const harmXml = createHarmonyXml(match.root, match.pattern);
              const harmDoc = parser.parseFromString(harmXml, 'text/xml');
              const harmEl = doc.importNode(harmDoc.documentElement, true);

              // Insert before the first note of the measure
              const firstOnset = Math.min(...Array.from(onsetFirstNote.keys()));
              const refNote = onsetFirstNote.get(firstOnset);
              if (refNote) {
                measure.insertBefore(harmEl, refNote);
                totalChordsInjected++;
              }
            }
          }
        }
      }
    }

    if (totalChordsInjected > 0) {
      console.log(`[ChordDetect] 🎸 Injected ${totalChordsInjected} chord symbols`);
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch {
    return xml; // on any error, return original
  }
}

const ProScoreEditor = forwardRef<ProScoreEditorRef, ProScoreEditorProps>(({
  xmlData, currentTime, isPlaying, songMetadata, zoom: externalZoom = 1.0, setZoom: setExternalZoom,
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
  performanceMode = false,
  lyricMode = 'Ju Solfege Movable Doh',
  layoutBundle = null,
}, ref) => {
  // Detection for Mobile Devices (Centralized)
  const isMobile = useMemo(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const vrvToolkitRef = useRef<any>(null);
  const starAnimFrameRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  // Laser
  const laserRafRef = useRef<number>(0);
  const laserPrevPageRef = useRef<number>(-1);
  const laserPrevSystemKeyRef = useRef<string>(''); // tracks current system key e.g. "page_systemId"
  const laserCurrentPageRef = useRef<number>(-1); // tracks current sweep page for zoom-scroll
  const laserCurrentRelXRef = useRef<number>(0);  // tracks current laser X (0-1) for zoom-scroll

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
    // Maps Verovio measure element hash id → MusicXML measure number string
    const measureNumByVrvId = new Map<string, string>();
    let scoreEndTime = 0;

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

        // Build measureNumByVrvId: maps Verovio measure hash → MusicXML n number
        // timemap entries with includeMeasures have 'measureOn'/'measureOff' arrays
        // each containing { id: "verovio-hash", n: "1" } objects
        if (Array.isArray(entry.measureOn)) {
          entry.measureOn.forEach((m: any) => {
            if (m?.id && m?.n != null) measureNumByVrvId.set(String(m.id), String(m.n));
          });
        }
        if (Array.isArray(entry.measureOff)) {
          entry.measureOff.forEach((m: any) => {
            if (m?.id && m?.n != null) measureNumByVrvId.set(String(m.id), String(m.n));
          });
        }
      });
      console.log('[Memolody] 🎯 Timemap: entries =', timemap.length, '| IDs mapped =', qstampById.size, '| scoreEnd =', scoreEndTime.toFixed(1), '| measures=', measureNumByVrvId.size);
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
          measureId: measureNumByVrvId.get(mId) || mId, // prefer MusicXML number, fallback to Verovio hash
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

    // ── FIX: assign correct measureId from MusicXML by crossreferencing startTime ──
    // The Verovio n-attribute on .measure elements is a hash, not a number.
    // But every note has startTime (qstamp) and a measure number from MusicXML.
    // Build startTime → measureNumber map from the engine, then tag each bar.
    try {
      const parsed = musicEngine.parseMusicXml(xmlData || '');
      // Map: first occurrence of each measure's startTime → measure number
      const measureFirstT = new Map<string, number>(); // measureNum → min startTime
      parsed.notes.forEach(n => {
        if (!n.measure) return;
        const cur = measureFirstT.get(n.measure);
        if (cur === undefined || n.startTime < cur) measureFirstT.set(n.measure, n.startTime);
      });
      // For each bar, find the measure whose first note startTime is closest
      realBars.forEach(bar => {
        let bestMeasure = '';
        let bestDiff = 9999;
        measureFirstT.forEach((t, mNum) => {
          const diff = Math.abs(t - bar.startTime);
          if (diff < bestDiff) { bestDiff = diff; bestMeasure = mNum; }
        });
        if (bestMeasure && bestDiff < 2) bar.measureId = bestMeasure;
      });
      console.log('[Memolody] ✅ barMaps measureId fixed via parseMusicXml. Sample:', realBars.slice(0, 5).map(b => `${b.measureId}@${b.startTime.toFixed(1)}`).join(' '));
    } catch (e) {
      console.warn('[Memolody] measureId fix failed:', e);
    }

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
        console.log('[Memolody] 🎼 Volta-1 measures:', Array.from(volta1Measures));
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
    setLoadingStep("Rendering score...");
    setError(null);

    // Yield to browser so loading indicator repaints BEFORE heavy work starts
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    try {
      const vrvToolkit = vrvToolkitRef.current;
      let finalXml = transpose !== 0 ? transposeMusicXml(xmlData, transpose) : xmlData;
      finalXml = finalXml.trim();

      // ── Strip DOCTYPE & Entities — external DTD URLs cause Verovio to silently fail ──
      // Some XMLs have multiple entities or nested DOCTYPEs, we use a robust multi-pass approach
      if (!finalXml.startsWith('<?xml')) {
        finalXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + finalXml;
      }
      finalXml = finalXml
        .replace(/<!DOCTYPE[^>]*(\[[\s\S]*?\])?>/gi, '')
        .replace(/<!ENTITY[^>]*>/gi, '')
        .trim();

      console.log(`[ProScoreEditor] Rendering XML (${finalXml.length} chars). First 100: ${finalXml.substring(0, 100)}`);
      if (finalXml.includes('<!DOCTYPE')) {
        console.warn('[ProScoreEditor] Warning: DOCTYPE still present in XML after stripping.');
      }

      // Inject Lyric based on mode
      if (lyricMode !== 'Close' && lyricMode !== 'Lyric') {
        finalXml = injectSolfegeToXml(finalXml, lyricMode as any);
      }

      // ── Chord symbols: skip in edit mode (not needed and slows down) ──────
      if (!isEditable) {
        if (/<harmony/i.test(finalXml)) {
          finalXml = finalXml
            .replace(/(<harmony[^>]*)\s+print-frame=["']?no["']?/gi, '$1')
            .replace(/(<harmony[^>]*)\s+print-object=["']?no["']?/gi, '$1');
        } else {
          // yield to browser before heavy O(n²) chord detection
          await new Promise<void>(r => setTimeout(r, 0));
          // finalXml = detectAndInjectChords(finalXml); // Disable auto-chord injection to preserve exact original score
        }
      }

      // ── CRITICAL: Strip any remaining xmlns attributes ──
      // Verovio expects standard MusicXML. If Gemini or DOMParser injected an HTML namespace, Verovio will silently render an empty page.
      finalXml = finalXml.replace(/xmlns="[^"]*"/gi, '');
      
      // ── CRITICAL: Strip layout-breaking metadata ──
      // Remove tags that cause Verovio to allocate massive white spaces at the top of pages
      finalXml = finalXml.replace(/<defaults>[\s\S]*?<\/defaults>/gi, '');
      finalXml = finalXml.replace(/<work>[\s\S]*?<\/work>/gi, '');
      finalXml = finalXml.replace(/<identification>[\s\S]*?<\/identification>/gi, '');
      finalXml = finalXml.replace(/<credit[^>]*>[\s\S]*?<\/credit>/gi, '');
      // Strip layout distances embedded inside measures that force gaps
      finalXml = finalXml.replace(/<system-layout[^>]*>[\s\S]*?<\/system-layout>/gi, '');
      finalXml = finalXml.replace(/<page-layout[^>]*>[\s\S]*?<\/page-layout>/gi, '');

      const hasEncodedBreaks = finalXml.includes('new-system="yes"');

      // ── [V2] Layout Sync from Scorelens-Engine bundle ─────────────────────
      let vrvScale = 45;
      let vrvPageMarginTop = 0;  // ZERO: title is rendered by React, not Verovio
      let vrvPageMarginBottom = 10;
      let vrvPageMarginLeft = 400;   // Increased significantly to give room for instrument names
      let vrvPageMarginRight = 200;  // Increased to prevent right edge from touching the screen
      let vrvSpacingSystem = systemSpacing > 10 ? 10 : systemSpacing;
      let vrvSpacingStaff = 10;

      if (layoutBundle?.layout_map) {
        try {
          const containerW = containerRef.current?.offsetWidth || 900;
          const syncInfo = computeLayoutSync(layoutBundle.layout_map, containerW);
          const opts = syncInfo.verovioOptions;
          vrvScale = opts.scale;
          vrvPageMarginTop = opts.pageMarginTop;
          vrvPageMarginBottom = opts.pageMarginBottom;
          vrvPageMarginLeft = opts.pageMarginLeft;
          vrvPageMarginRight = opts.pageMarginRight;
          vrvSpacingSystem = opts.spacingSystem;
          vrvSpacingStaff = opts.spacingStaff;
          console.log(`[ProScoreEditor] 🎯 V2 Layout Sync applied: scale=${vrvScale}`);
        } catch (syncErr) {
          console.warn('[ProScoreEditor] Layout sync failed, using defaults:', syncErr);
        }
      }

      vrvToolkit.setOptions({
        scale: vrvScale,
        font: musicFont,
        header: 'none',
        footer: 'none',
        adjustPageHeight: true,
        adjustPageWidth: false,
        pageWidth: 2800,
        pageHeight: 3960,
        pageMarginTop: vrvPageMarginTop,
        pageMarginBottom: vrvPageMarginBottom,
        pageMarginLeft: vrvPageMarginLeft,
        pageMarginRight: vrvPageMarginRight,
        spacingSystem: vrvSpacingSystem,
        spacingStaff: vrvSpacingStaff,
        justifyVertically: false,
        lyricTopMinMargin: 2.0,
        lyricSize: 2.7,
        stemWidth: stemThickness,
        barLineWidth: barlineThickness,
        staffLineWidth: stafflineThickness,
        svgViewBox: true,
        breaks: hasEncodedBreaks ? 'encoded' : 'auto',
      });

      // Yield before Verovio parse (heavy WASM call)
      await new Promise<void>(r => setTimeout(r, 0));
      vrvToolkit.loadData(finalXml);
      vrvToolkit.redoLayout();
      let pageCount = vrvToolkit.getPageCount();
      console.log(`[ProScoreEditor] Layout complete. Page count: ${pageCount}`);
      
      if (pageCount === 0) {
        console.warn('[ProScoreEditor] Verovio returned 0 pages with processed XML. Retrying with RAW XML fallback...');
        try {
          vrvToolkit.loadData(xmlData.trim());
          vrvToolkit.redoLayout();
          pageCount = vrvToolkit.getPageCount();
          console.log(`[ProScoreEditor] RAW XML fallback layout complete. Page count: ${pageCount}`);
        } catch (fallbackErr) {
          console.error('[ProScoreEditor] RAW XML fallback also failed', fallbackErr);
        }
        
        if (pageCount === 0) {
          console.error('[ProScoreEditor] CRITICAL: Verovio returned 0 pages even with RAW XML. XML is severely malformed.');
          setError("The score could not be rendered (Empty Page Count). This usually happens if the MusicXML is missing measures or contains invalid structures.");
        }
      }
      
      if (onPageCountChange) onPageCountChange(pageCount);

      // ── scaleHarmText helper ──────────────────────────────────────────────
      const scaleHarmText = (svg: string, factor: number): string => {
        let result = '';
        let pos = 0;
        const HARM_CLASS = 'class="harm"';
        while (pos < svg.length) {
          const harmIdx = svg.indexOf(HARM_CLASS, pos);
          if (harmIdx === -1) { result += svg.slice(pos); break; }
          let gStart = harmIdx;
          while (gStart > 0 && svg[gStart] !== '<') gStart--;
          
          let gEnd = harmIdx + HARM_CLASS.length; // Fallback to prevent infinite loop
          let depth = 0;
          for (let k = gStart; k < svg.length - 1; k++) {
            if (svg[k] === '<' && svg[k + 1] !== '/') {
              // Check if it's a self-closing tag by looking ahead for '/>' before next '<'
              const nextClose = svg.indexOf('>', k);
              const nextOpen = svg.indexOf('<', k + 1);
              if (nextClose !== -1 && svg[nextClose - 1] === '/' && (nextOpen === -1 || nextClose < nextOpen)) {
                // Self closing tag, don't increment depth
                k = nextClose; // Skip to the end of this tag
                continue;
              }
              depth++;
            }
            else if (svg[k] === '<' && svg[k + 1] === '/') { 
              depth--; 
              if (depth <= 0) { 
                gEnd = svg.indexOf('>', k) + 1; 
                break; 
              } 
            }
          }
          
          // CRITICAL: Ensure `pos` strictly increases to prevent infinite loops!
          if (gEnd <= gStart) {
            gEnd = harmIdx + HARM_CLASS.length;
          }

          result += svg.slice(pos, gStart);
          const harmGroup = svg.slice(gStart, gEnd);
          result += harmGroup
            .replace(/font-size="([\d.]+)"/g, (_, sz) =>
              `font-size="${(parseFloat(sz) * factor).toFixed(1)}"`)
            .replace(/<text /g, '<text fill="#000000" font-weight="900" ')
            .replace(/<tspan /g, '<tspan fill="#000000" font-weight="900" ');
          pos = gEnd;
        }
        return result;
      };

      // ── Progressive page rendering — yield between pages ──────────────────
      const totalPages = Math.min(pageCount, 100);
      const pages: string[] = [];
      for (let i = 1; i <= totalPages; i++) {
        let svg = vrvToolkit.renderToSVG(i, {});
        if (!isEditable) svg = scaleHarmText(svg, 65);
        pages.push(svg);
        // Show first page immediately, then yield between subsequent pages
        if (i === 1 || i % 2 === 0) {
          setSvgPages([...pages]);
          setLoadingStep(totalPages > 1 ? `Rendering page ${i}/${totalPages}...` : "");
          await new Promise<void>(r => setTimeout(r, 0));
        }
      }

      setSvgPages(pages);
      setLoadingStep("");
      setTimeout(() => {
        createCoordMap();
      }, 300);
    } catch (err) {
      setLoadingStep("");
      setError("Matrix Rendering Error. The XML might be corrupted.");
    }
  }, [isReady, xmlData, lyricMode, transpose, isEditable, musicFont, systemSpacing, stemThickness, barlineThickness, stafflineThickness, onPageCountChange, createCoordMap]);

  useEffect(() => {
    if (xmlData) {
      const debounce = setTimeout(renderScore, 200);
      return () => clearTimeout(debounce);
    } else {
      setSvgPages([]);
    }
  }, [renderScore, xmlData]);

  // ══════════════════════════════════════════════════════════════
  //  INDIGO BAR LASER — real-time sweep via Tone.Transport.seconds
  //  - Uses musicEngine.currentMeasure to know WHICH bar
  //  - Uses Tone.Transport.seconds to know WHERE in the bar (exact timing)
  //  - progress = elapsed_seconds / barDurationSeconds  → perfectly synced
  //  - Never sweeps backward, never overshoots beat 1 of next bar
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!showLaser) return;

    let currentBarKey = '';
    let barStartSeconds = 0;   // Tone.Transport.seconds when current bar began
    let barDurSeconds = 2.0;   // duration of current bar in real seconds
    let sweepFromX = 0;
    let sweepToX = 0;
    let sweepPage = 0;
    let sweepTop = 0;
    let sweepHeight = 0;
    let sweepSystemId = '';

    const tick = () => {
      laserRafRef.current = requestAnimationFrame(tick);

      const bars = barMapsRef.current;
      if (bars.length === 0) return;

      const barKey = musicEngine.currentMeasure;
      if (!barKey) return;

      // ── Bar changed → record start time and set sweep targets ──
      if (barKey !== currentBarKey) {
        const bar = bars.find(b => b.measureId === barKey || String(b.measureNumber) === barKey);
        if (!bar) return;

        const barIdx = bars.indexOf(bar);
        const nextBar = bars[barIdx + 1];

        // Only sweep to next bar if same system row AND forward direction
        const sameSysNext = nextBar &&
          nextBar.systemId === bar.systemId &&
          nextBar.startRelX > bar.startRelX;

        currentBarKey = barKey;
        barStartSeconds = Tone.Transport.seconds;   // real clock: when this bar started
        const bpm = Tone.Transport.bpm.value || 120;
        barDurSeconds = Math.max(0.1, bar.duration * (60 / bpm)); // bar duration in seconds

        sweepFromX = bar.startRelX;
        sweepToX = sameSysNext ? nextBar.startRelX : bar.endRelX;
        sweepPage = bar.pageIndex;
        sweepTop = bar.y;
        sweepHeight = bar.height;
        sweepSystemId = bar.systemId;
      }

      // ── Compute progress from REAL elapsed seconds ──────────────
      const elapsed = Math.max(0, Tone.Transport.seconds - barStartSeconds);
      const progress = Math.min(1, elapsed / barDurSeconds);   // 0.0 → 1.0, never > 1
      const relX = sweepFromX + (sweepToX - sweepFromX) * progress;

      // Update laser DOM on correct page
      for (let i = 0; i < svgPages.length; i++) {
        const el = document.getElementById(`bar-laser-${i}`);
        if (!el) continue;
        if (i === sweepPage) {
          el.style.display = 'block';
          el.style.left = `${relX * 100}%`;
          el.style.top = `${sweepTop * 100}%`;
          el.style.height = `${sweepHeight * 100}%`;
        } else {
          el.style.display = 'none';
        }
      }
      // Track current laser position for zoom-scroll re-centering
      laserCurrentRelXRef.current = relX;

      const scrollArea = scrollAreaRef.current;
      const pageEl = containerRef.current?.children[sweepPage] as HTMLElement | undefined;
      
      if (scrollArea && pageEl) {
        // Calculate the absolute Y center of the current row relative to the page
        const systemCenterY = pageEl.offsetTop + (sweepTop + sweepHeight / 2) * pageEl.offsetHeight;
        const targetScrollTop = Math.max(0, systemCenterY - scrollArea.clientHeight / 2);

        const pageChanged = laserPrevPageRef.current !== sweepPage;
        const systemKey = `${sweepPage}_${sweepSystemId}`;
        const systemChanged = laserPrevSystemKeyRef.current !== systemKey;

        // Force timeline to remain centered on screen
        if (localZoom > 1.05 || pageChanged) {
          // Centering horizontally based on page layout and laser relX
          const pageWidth = pageEl.offsetWidth;
          const laserPixelX = relX * pageWidth;
          const targetScrollLeft = Math.max(0, laserPixelX - scrollArea.clientWidth / 2);

          // Zoomed or Page changed: Snap instantly both vertically and horizontally
          scrollArea.scrollLeft = targetScrollLeft;
          scrollArea.scrollTop = targetScrollTop;
          
          laserPrevSystemKeyRef.current = systemKey;
        } else if (systemChanged) {
          // Row changed (but not zoomed & same page): smooth scroll vertically
          scrollArea.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
          laserPrevSystemKeyRef.current = systemKey;
        } else if (scrollArea.scrollWidth > scrollArea.clientWidth) {
          // Continuous horizontal follow when zoomed but same page/row
          const pageWidth = pageEl.offsetWidth;
          const laserPixelX = relX * pageWidth;
          scrollArea.scrollLeft = Math.max(0, laserPixelX - scrollArea.clientWidth / 2);
        }
      }

      // Always track current sweep page (for zoom-triggered re-scroll)
      laserCurrentPageRef.current = sweepPage;
      laserPrevPageRef.current = sweepPage;
    };

    const hideAll = () => {
      currentBarKey = '';
      laserPrevPageRef.current = -1;
      laserPrevSystemKeyRef.current = '';
      for (let i = 0; i < svgPages.length; i++) {
        const el = document.getElementById(`bar-laser-${i}`);
        if (el) el.style.display = 'none';
      }
    };

    if (!isPlaying) { hideAll(); return; }

    laserRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(laserRafRef.current);
      hideAll();
    };
  // localZoom in deps: when user zooms, restart laser loop so it re-scrolls to active bar
  }, [isPlaying, showLaser, svgPages.length, localZoom]);







  const exportToPdf = useCallback(async () => {
    console.log('[Export] Starting PDF export, svgPages:', svgPages.length);
    if (!svgPages.length) {
      console.warn('[Export] No pages to export');
      return;
    }
    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: pageFormat });
      const pageEls = containerRef.current?.querySelectorAll('.page-container');
      console.log('[Export] Found page elements:', pageEls?.length);
      
      if (!pageEls || pageEls.length === 0) {
        // Fallback: use direct children
        const children = containerRef.current?.children;
        if (children) {
          for (let i = 0; i < children.length; i++) {
            if (i > 0) doc.addPage();
            const canvas = await html2canvas(children[i] as HTMLElement, { scale: 2, useCORS: true });
            doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
          }
        }
      } else {
        for (let i = 0; i < pageEls.length; i++) {
          if (i > 0) doc.addPage();
          const canvas = await html2canvas(pageEls[i] as HTMLElement, { scale: 2, useCORS: true });
          doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
        }
      }
      
      const fileName = `${displayTitle.replace(/\s+/g, '_')}_Score.pdf`;
      console.log('[Export] Saving PDF as:', fileName);
      doc.save(fileName);
      console.log('[Export] PDF save triggered');
    } catch (err) {
      console.error('[Export] PDF export failed:', err);
    }
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
        g.harm { overflow: visible; }
        /* Force chord symbols (harmony) text to be black, bold, and fully visible on white sheet background */
        g.harm text, g.harm tspan, g.harmony text, g.harmony tspan {
            fill: #000000 !important;
            font-weight: 900 !important;
            opacity: 1 !important;
            display: block !important;
        }
        /* ── Indigo Bar Laser — subtle magnifying glass lens ── */
        .bar-laser {
          position: absolute;
          width: 36px;
          margin-left: -18px;

          /* Lens: transparent center, soft glowing rims */
          background: linear-gradient(
            to right,
            rgba(99, 102, 241, 0.35)  0%,
            rgba(99, 102, 241, 0.10) 16%,
            rgba(99, 102, 241, 0.02) 30%,
            transparent              42%,
            transparent              58%,
            rgba(99, 102, 241, 0.02) 70%,
            rgba(99, 102, 241, 0.10) 84%,
            rgba(99, 102, 241, 0.35) 100%
          );

          /* Soft rim lines */
          border-left:  2px solid rgba(148, 130, 255, 0.55);
          border-right: 2px solid rgba(148, 130, 255, 0.55);

          /* Gentle multi-layer glow */
          box-shadow:
            /* Inner shimmer */
            inset  3px 0 10px rgba(99, 102, 241, 0.25),
            inset -3px 0 10px rgba(99, 102, 241, 0.25),
            /* Tight outer corona */
             0 0  6px  4px  rgba(118, 100, 255, 0.35),
            /* Mid atmospheric glow */
             0 0 22px 10px  rgba(99,  102, 241, 0.12),
            /* Wide soft aura */
             0 0 55px 20px  rgba(99,  102, 241, 0.05);

          border-radius: 6px;

          /* Light lens effect */
          backdrop-filter: brightness(1.06) saturate(1.15);
          -webkit-backdrop-filter: brightness(1.06) saturate(1.15);

          z-index: 60;
          pointer-events: none;
          transition: left 0.10s linear, top 0.12s ease-out, height 0.12s ease-out;
        }

      `}</style>


      <div
        ref={scrollAreaRef}
        className={`flex-1 w-full memolody-scrollbar px-2 sm:px-3 flex flex-col ${isPlaying ? 'overflow-hidden' : 'overflow-auto'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={containerRef}
          className="relative min-h-full flex flex-col items-center transition-all duration-75 ease-out"
          style={{
            width: `${100 * localZoom}%`,
            marginLeft: 'auto',
            marginRight: 'auto'
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
                width: '100%',
              }}
            >
              <div className="absolute inset-0 z-50 pointer-events-none">
                {/* Indigo Laser */}
                <div id={`bar-laser-${i}`} className="bar-laser" style={{ display: 'none' }} />

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
              <div className="score-neural-header flex justify-between items-end pointer-none z-[1500] border-b-[0.5pt] border-black/10 pb-1 mb-1 mx-[10mm] mt-[5mm] shrink-0">
                <div className="text-[5pt] font-bold text-black/30 uppercase tracking-widest italic leading-none">NEURAL SYNC: {lyricMode?.toUpperCase()}</div>
                <div className="text-[6pt] font-black text-black uppercase italic leading-none">by <span className="text-cyan-600">MEMOLODY</span></div>
                <div className="text-[4pt] font-black text-black/50 leading-none">PG {i + 1}</div>
              </div>

              {i === 0 && (
                <div className="w-full flex flex-col items-center pt-1 pb-1 px-[10mm] relative z-[2000] pointer-none shrink-0 mb-0">
                  <h1 className="font-serif text-black text-center leading-tight mb-0.5" style={{ fontSize: `${titleFontSize || 16}pt`, fontWeight: 600 }}>{displayTitle}</h1>
                  <div className="flex items-center gap-6">
                    <div className="text-[9pt] font-serif text-black/70 italic leading-none">{displayArtist}</div>
                  </div>
                </div>
              )}

              <div 
                dangerouslySetInnerHTML={{ __html: svg }} 
                className="verovio-neural-svg bg-white w-full overflow-hidden" 
              />
            </div>
          )), [svgPages, showBorders, isPreviewMode, localZoom, activeLoop, barMapsRef, lyricMode, titleFontSize, displayTitle, displayArtist])}
        </div>
      </div>

      {/* Permanent visual Zoom Controls to prevent iOS Safari kinetic scroll drifts */}
      <div className="absolute top-4 right-4 z-[4500] flex items-center gap-1 bg-[#0c0c0e]/90 backdrop-blur-md border border-white/10 p-1 rounded-xl shadow-2xl">
        <button
          onClick={() => setLocalZoom(prev => Math.max(1.0, prev - 0.2))}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/20 flex items-center justify-center text-white font-extrabold text-xs active:scale-95 transition-all"
          title="Zoom Out"
        >
          -
        </button>
        <button
          onClick={() => setLocalZoom(1.0)}
          className="px-1.5 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/20 flex items-center justify-center text-[8px] font-black text-white uppercase tracking-wider active:scale-95 transition-all min-w-[45px]"
          title="Reset Zoom"
        >
          {Math.round(localZoom * 100)}%
        </button>
        <button
          onClick={() => setLocalZoom(prev => Math.min(3.0, prev + 0.2))}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/20 flex items-center justify-center text-white font-extrabold text-xs active:scale-95 transition-all"
          title="Zoom In"
        >
          +
        </button>
      </div>

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
