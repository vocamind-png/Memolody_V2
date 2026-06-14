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
      const m = note.measure || '1';
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
      mNotes.sort((a, b) => a.startTime - b.startTime).forEach(note => {
        // Measure start time is (parseInt(m) - 1) * 4
        const measureStartTime = (parseInt(m) - 1) * 4;
        let noteStartBeat = note.startTime - measureStartTime;
        
        // Prevent overlaps (simple handling)
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

export const TrackVisualizer: React.FC<TrackVisualizerProps> = ({ track, notes, width = 800, height = 150, visualType = 'score', pixelsPerBeat = 20, songKey = 'C' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        const verovio = (window as any).verovio;
        if (!verovio) {
          throw new Error('Verovio not loaded');
        }

        // Wait for WASM if needed
        await verovio.moduleLoaded;

        if (!instance) {
          instance = new verovio.toolkit();
          instance.setOptions({
            pageWidth: Math.max(800, width * 2), // High res
            pageHeight: height * 2,
            scale: 40,
            adjustPageHeight: 1,
            header: 'none',
            footer: 'none',
            noJustification: 0,
            font: 'Bravura',
            spacingLinear: 1,
            spacingNonLinear: 0,
          });
        }

        const xml = generateSimpleMusicXml(notes || [], track.name, track.instrument || 'piano', songKey);
        instance.loadData(xml);
        const svg = instance.renderToSVG(1);
        
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
          
          // Fix SVG dimensions for responsive container
          const svgEl = containerRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.width = '100%';
            svgEl.style.height = '100%';
            
            // Force Verovio notes to be white so they are visible on dark background
            svgEl.setAttribute('fill', 'white');
            svgEl.style.color = 'white';
            const paths = svgEl.querySelectorAll('path, use, rect');
            paths.forEach((p: any) => {
              p.setAttribute('fill', 'white');
              p.setAttribute('stroke', 'white');
            });
          }
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
      if (instance) {
        try { instance.destroy(); } catch (e) {}
      }
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
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-500/10 z-10">
          <span className="text-xs text-rose-400">{error}</span>
        </div>
      )}
      <div 
        ref={containerRef} 
        className="w-full h-full absolute inset-0 verovio-neural-svg overflow-hidden"
      />
    </div>
  );
};
