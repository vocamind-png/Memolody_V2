import { BasicPitch, noteFramesToTime, addPitchBendsToNoteEvents, outputToNotesPoly, NoteEventTime } from '@spotify/basic-pitch';

// Simple MIDI to MusicXML converter
function midiToMusicXML(notes: NoteEventTime[], bpm: number = 120): string {
  const divisions = 24; // per quarter note
  const quarterDuration = 60 / bpm; // seconds

  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Voice</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>${divisions}</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
`;

  const getPitchName = (midi: number) => {
    const notes = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const alter = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    const octave = Math.floor(midi / 12) - 1;
    const noteIdx = midi % 12;
    return { step: notes[noteIdx], alter: alter[noteIdx], octave };
  };

  let currentTime = 0;
  for (const note of sortedNotes) {
    const noteStartTime = note.startTimeSeconds;
    const noteDuration = note.durationSeconds;

    // Calculate rest if there's a gap
    if (noteStartTime > currentTime + 0.05) { // 50ms tolerance
      const restSec = noteStartTime - currentTime;
      const restDivisions = Math.round((restSec / quarterDuration) * divisions);
      if (restDivisions > 0) {
        xml += `      <note>
        <rest/>
        <duration>${restDivisions}</duration>
      </note>\n`;
      }
    }

    const noteDivisions = Math.max(1, Math.round((noteDuration / quarterDuration) * divisions));
    const p = getPitchName(Math.round(note.pitchMidi));

    xml += `      <note>
        <pitch>
          <step>${p.step}</step>
          ${p.alter !== 0 ? `<alter>${p.alter}</alter>` : ''}
          <octave>${p.octave}</octave>
        </pitch>
        <duration>${noteDivisions}</duration>
        <type>quarter</type>
      </note>\n`;

    currentTime = noteStartTime + noteDuration;
  }

  xml += `    </measure>
  </part>
</score-partwise>`;

  return xml;
}

export async function transcribeAudioToMusicXML(audioUrl: string): Promise<string> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Fetch audio data
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  
  // Decode audio
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  // Load model (expects model.json to be in /basic-pitch-model/)
  // Use absolute path for Vercel/Runpod deployments
  const modelUrl = '/basic-pitch-model/model.json';
  
  const basicPitch = new BasicPitch(modelUrl);
  
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  
  await basicPitch.evaluateModel(
    audioBuffer as unknown as any,
    (f: number[][], o: number[][], c: number[][]) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p: number) => {
      console.log(`BasicPitch progress: ${Math.round(p * 100)}%`);
    }
  );
  
  const notes = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(frames, onsets, 0.25, 0.25, 5)
    )
  );
  
  const musicXML = midiToMusicXML(notes);
  return musicXML;
}
