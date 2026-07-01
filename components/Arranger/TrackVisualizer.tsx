import React, { useEffect, useRef, useState } from 'react';
import { TrackState, ParsedNote } from '../../types';
import { Loader2 } from 'lucide-react';

interface TrackVisualizerProps {
  track: TrackState;
  notes?: ParsedNote[];
  width?: number;
  height?: number;
  visualType?: 'score' | 'pianoroll';
  pixelsPerBeat?: number;
  songKey?: string;
  totalMeasures?: number;
  pixelsPerMeasure?: number;
}

const getFifthsForKey = (keyStr: string): number => {
  const keys: Record<string, number> = {
    'C': 0, 'Am': 0,
    'G': 1, 'Em': 1,
    'D': 2, 'Bm': 2,
    'A': 3, 'F#m': 3,
    'E': 4, 'C#m': 4,
    'B': 5, 'G#m': 5,
    'F#': 6, 'D#m': 6,
    'C#': 7, 'A#m': 7,
    'F': -1, 'Dm': -1,
    'Bb': -2, 'Gm': -2,
    'Eb': -3, 'Cm': -3,
    'Ab': -4, 'Fm': -4,
    'Db': -5, 'Bbm': -5,
    'Gb': -6, 'Ebm': -6,
    'Cb': -7, 'Abm': -7
  };
  return keys[keyStr] || 0;
};

const generateSimpleMusicXml = (notes: ParsedNote[], trackName: string, instrument: string, songKey: string = 'C') => {
  const isBass = instrument === 'bass';
  const clefSign = isBass ? 'F' : 'G';
  const clefLine = isBass ? 4 : 2;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>${trackName}</part-name>
    </score-part>
  </part-list>
  <part id="P1">`;

  // Group notes by measure
  const measures: Record<string, ParsedNote[]> = {};
  if (notes && notes.length > 0) {
    notes.forEach(note => {
      // If note.measure is missing, calculate it assuming 4/4 time (4 beats per measure)
      const m = note.measure || Math.floor((note.startTime || 0) / 4) + 1;
      if (!measures[m]) measures[m] = [];
      measures[m].push(note);
    });
  } else {
    measures['1'] = [];
  }

  const measureKeys = Object.keys(measures).sort((a, b) => parseInt(a) - parseInt(b));

  measureKeys.forEach((m, idx) => {
    xml += `\n    <measure number="${m}">`;
    if (idx === 0) {
      const fifths = getFifthsForKey(songKey);
      xml += `
      <attributes>
        <divisions>4</divisions>
        <key><fifths>${fifths}</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>
      </attributes>`;
    }

    const mNotes = measures[m];
    if (mNotes.length === 0) {
      // Add a whole rest if empty measure
      xml += `
      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>`;
    } else {
      let currentBeat = 0; // Relative to the start of the measure in beats
      
      // Sort notes by start time, but if they start at the same time, it's a chord (we will just serialize them sequentially for now, which is a bit hacky for MusicXML but valid)
      mNotes.sort((a, b) => (a.startTime || 0) - (b.startTime || 0)).forEach(note => {
        let noteStartBeat = ((note.startTime || 0) % 4);
        
        // Prevent overlaps by pushing the note later in the measure if needed
        if (noteStartBeat < currentBeat) {
          noteStartBeat = currentBeat;
        }

        // Insert rest if there's a gap
        if (noteStartBeat > currentBeat) {
          const restBeats = noteStartBeat - currentBeat;
          const restDur = Math.max(1, Math.round(restBeats * 4));
          xml += `
      <note>
        <rest/>
        <duration>${restDur}</duration>
      </note>`;
          currentBeat = noteStartBeat;
        }

        // Very simplified duration mapping (assuming divisions=4)
        // Ensure note doesn't bleed past measure boundary (4 beats)
        let actualDurBeats = Math.min(note.duration, 4 - currentBeat);
        if (actualDurBeats <= 0) return; // Skip if beyond measure
        
        const dur = Math.max(1, Math.round(actualDurBeats * 4));
        let type = 'quarter';
        if (dur >= 16) type = 'whole';
        else if (dur >= 8) type = 'half';
        else if (dur >= 4) type = 'quarter';
        else if (dur >= 2) type = 'eighth';
        else type = '16th';

        const hasSolfege = note.solfege && note.solfege.length > 0;
        const lyricTag = hasSolfege ? `
        <lyric number="1">
          <syllabic>single</syllabic>
          <text>${note.solfege}</text>
        </lyric>` : '';

        xml += `
      <note>
        <pitch>
          <step>${note.step}</step>
          <alter>${note.alter || 0}</alter>
          <octave>${note.octave}</octave>
        </pitch>
        <duration>${dur}</duration>
        <type>${type}</type>${lyricTag}
      </note>`;
      
        currentBeat += actualDurBeats;
      });

      // Pad end of measure with rest if needed
      if (currentBeat < 4) {
        const restBeats = 4 - currentBeat;
        const restDur = Math.max(1, Math.round(restBeats * 4));
        xml += `
      <note>
        <rest/>
        <duration>${restDur}</duration>
      </note>`;
      }
    }
    xml += `\n    </measure>`;
  });

  xml += `\n  </part>\n</score-partwise>`;
  return xml;
};

export const TrackVisualizer: React.FC<TrackVisualizerProps> = ({ track, notes, width = 800, height = 150, visualType = 'score', pixelsPerBeat = 20, songKey = 'C', totalMeasures = 32, pixelsPerMeasure = 80 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [svgs, setSvgs] = useState<string[]>([]);

  useEffect(() => {
    if (visualType === 'pianoroll') {
      setLoading(false);
      return;
    }

    let instance: any = null;
    let isMounted = true;

    const renderScore = async () => {
      setLoading(true);
      setError('');
      try {
        // Dynamic injection of Verovio
        if (!document.querySelector('script[src="/verovio-toolkit.js"]')) {
          const script = document.createElement('script');
          script.src = '/verovio-toolkit.js';
          script.defer = true;
          document.body.appendChild(script);
        }

        // Wait until window.verovio is available
        let checkCount = 0;
        while (!(window as any).verovio && checkCount < 100) {
          await new Promise(r => setTimeout(r, 100));
          checkCount++;
        }

        const verovio = (window as any).verovio;
        if (!verovio) {
          throw new Error('Verovio script failed to load');
        }

        // Wait for WASM if needed
        await verovio.moduleLoaded;

        // Reuse the global instance to prevent WASM OOM crashes
        let globalInstance = (window as any).__globalVrvToolkit;
        if (!globalInstance) {
          globalInstance = new verovio.toolkit();
          (window as any).__globalVrvToolkit = globalInstance;
        }

        // Synchronously set options, load data, and render so it's safe for multiple tracks
        globalInstance.setOptions({
          pageWidth: width * 2, // High res, matched to timeline width
          pageHeight: height * 2,
          scale: 40,
          adjustPageHeight: 0,
          header: 'none',
          footer: 'none',
          noJustification: 0,
          font: 'Bravura',
          spacingLinear: 1, // Force proportional spacing!
          spacingNonLinear: 0,
          pageMarginTop: 10,
          pageMarginBottom: 0,
          pageMarginLeft: 0,
          pageMarginRight: 0,
        });

        const xml = generateSimpleMusicXml(notes || [], track.name, track.instrument || 'piano', songKey);
        globalInstance.loadData(xml);
        let svg = globalInstance.renderToSVG(1);
        console.log('VEROVIO SVG LENGTH:', svg.length);
        console.log('VEROVIO SVG HEAD:', svg.substring(0, 150));
        
        svg = svg.replace('<svg ', '<svg class="verovio-track-svg" style="width:100%;height:100%;" ');
        
        if (isMounted) {
          setSvgs([svg]);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error rendering track');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    renderScore();

    return () => {
      isMounted = false;
      // DO NOT destroy the global instance!
    };
  }, [track, notes, width, height, visualType]);

  if (visualType === 'pianoroll') {
    const midis = (notes || []).map(n => {
      const si = ['C','D','E','F','G','A','B'].indexOf(n.step.toUpperCase());
      return (n.octave + 1) * 12 + [0,2,4,5,7,9,11][si] + (n.alter || 0);
    });
    const minMidi = midis.length ? Math.min(...midis) : 60;
    const maxMidi = midis.length ? Math.max(...midis) : 72;
    const range = Math.max(16, maxMidi - minMidi + 8);
    const topMargin = maxMidi + 4;

    return (
      <div className="relative w-full h-full bg-[#111115] rounded-lg border border-white/5 overflow-hidden group">
        {notes?.map((n, i) => {
          const si = ['C','D','E','F','G','A','B'].indexOf(n.step.toUpperCase());
          const midi = (n.octave + 1) * 12 + [0,2,4,5,7,9,11][si] + (n.alter || 0);
          const y = ((topMargin - midi) / range) * height; 
          const noteH = Math.max(4, height / range);
          return (
            <div 
              key={i} 
              className="absolute bg-emerald-400 rounded-sm opacity-80 shadow-[0_0_10px_rgba(52,211,153,0.5)] border border-white/20"
              style={{ 
                left: n.startTime * pixelsPerBeat, 
                width: Math.max(6, n.duration * pixelsPerBeat - 1), 
                top: y, 
                height: noteH 
              }} 
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#111115] rounded-lg border border-white/5 overflow-hidden group">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10">
          <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
        </div>
      )}
      {!loading && !error && visualType === 'score' && svgs.length > 0 && (
        <div className="absolute inset-0 w-full h-full">
          <div 
            className="w-full h-full"
            dangerouslySetInnerHTML={{ __html: svgs[0] }} 
          />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-rose-500 text-xs px-4 text-center z-10">
          {error}
        </div>
      )}
    </div>
  );
};
