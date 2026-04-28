
import { Midi } from "@tonejs/midi";

export class MidiParser {
  private static MIDI_PITCH_MAP: Record<number, { step: string; alter: number }> = {
    0: { step: "C", alter: 0 }, 1: { step: "C", alter: 1 }, 2: { step: "D", alter: 0 },
    3: { step: "D", alter: 1 }, 4: { step: "E", alter: 0 }, 5: { step: "F", alter: 0 },
    6: { step: "F", alter: 1 }, 7: { step: "G", alter: 0 }, 8: { step: "G", alter: 1 },
    9: { step: "A", alter: 0 }, 10: { step: "A", alter: 1 }, 11: { step: "B", alter: 0 }
  };

  private static getNoteType(duration: number, divisions: number): string {
    const ratio = duration / divisions;
    if (ratio >= 4) return "whole";
    if (ratio >= 2) return "half";
    if (ratio >= 1) return "quarter";
    if (ratio >= 0.5) return "eighth";
    if (ratio >= 0.25) return "16th";
    return "32nd";
  }

  /**
   * [NEURAL MIDI-TO-XML CONVERTER V2.1]
   * Enhanced for high-precision OMR rendering and EMK support.
   */
  public static async convertToMusicXml(arrayBuffer: ArrayBuffer, fileName: string = "MIDI PROJECT"): Promise<string> {
    const midi = new Midi(arrayBuffer);
    const bpm = Math.round(midi.header.tempos[0]?.bpm || 120);
    const timeSig = (midi.header.timeSignatures[0] as any) || { beats: 4, beatType: 4 };
    const divisions = 480; 
    const ticksPerBeat = midi.header.ppq;
    const ticksPerMeasure = ticksPerBeat * (timeSig.beats || 4);

    // Filter tracks that actually have notes
    const activeTracks = midi.tracks.filter(t => t.notes.length > 0);
    if (activeTracks.length === 0) {
      throw new Error("This MIDI/EMK file contains no playable notes.");
    }

    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${fileName.replace(/\.[^/.]+$/, "").toUpperCase()}</work-title></work>
  <identification>
    <creator type="composer">MIDI NEURAL IMPORT</creator>
    <encoding><software>Memolody Lyria Engine</software></encoding>
  </identification>
  <defaults>
    <scaling><millimeters>7.0</millimeters><tenths>40</tenths></scaling>
    <page-layout>
      <page-height>1697</page-height>
      <page-width>1200</page-width>
      <page-margins type="both">
        <left-margin>50</left-margin>
        <right-margin>50</right-margin>
        <top-margin>50</top-margin>
        <bottom-margin>50</bottom-margin>
      </page-margins>
    </page-layout>
  </defaults>
  <part-list>\n`;

    activeTracks.forEach((track, i) => {
      xml += `    <score-part id="P${i + 1}"><part-name>${(track.name || `Track ${i + 1}`).toUpperCase()}</part-name></score-part>\n`;
    });
    xml += `  </part-list>\n`;

    activeTracks.forEach((track, trackIdx) => {
      xml += `  <part id="P${trackIdx + 1}">\n`;
      
      const notes = [...track.notes].sort((a, b) => a.ticks - b.ticks);
      const totalTicks = notes[notes.length - 1].ticks + notes[notes.length - 1].durationTicks;
      const numMeasures = Math.max(1, Math.ceil(totalTicks / ticksPerMeasure));

      for (let m = 0; m < numMeasures; m++) {
        const mStartTick = m * ticksPerMeasure;
        const mEndTick = (m + 1) * ticksPerMeasure;
        const notesInMeasure = notes.filter(n => n.ticks >= mStartTick && n.ticks < mEndTick);

        xml += `    <measure number="${m + 1}">\n`;
        if (m === 0) {
          xml += `      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${timeSig.beats || 4}</beats><beat-type>${timeSig.beatType || 4}</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>\n`;
          xml += `      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type></direction>\n`;
        }

        let currentTick = mStartTick;

        for (let i = 0; i < notesInMeasure.length; i++) {
          const note = notesInMeasure[i];
          const isChord = i > 0 && Math.abs(note.ticks - notesInMeasure[i - 1].ticks) < 5; // allow small jitter

          // 1. Handle Rests
          if (!isChord && note.ticks > currentTick + 5) {
            const restDurTicks = note.ticks - currentTick;
            const restDurXml = Math.round((restDurTicks / ticksPerBeat) * divisions);
            if (restDurXml > 10) {
              xml += `      <note><rest/><duration>${restDurXml}</duration><voice>1</voice></note>\n`;
            }
            currentTick = note.ticks;
          }

          // 2. Add Note
          const pitchData = this.MIDI_PITCH_MAP[note.midi % 12];
          const octave = Math.floor(note.midi / 12) - 1;
          const durXml = Math.max(20, Math.round((note.durationTicks / ticksPerBeat) * divisions));
          const type = this.getNoteType(durXml, divisions);

          xml += `      <note>\n`;
          if (isChord) xml += `        <chord/>\n`;
          xml += `        <pitch><step>${pitchData.step}</step>${pitchData.alter !== 0 ? `<alter>${pitchData.alter}</alter>` : ''}<octave>${octave}</octave></pitch>
        <duration>${durXml}</duration>
        <voice>1</voice>
        <type>${type}</type>
        <lyric number="1"><text>${note.name}</text></lyric>
      </note>\n`;

          if (!isChord) {
            currentTick = note.ticks + note.durationTicks;
          } else {
            currentTick = Math.max(currentTick, note.ticks + note.durationTicks);
          }
        }

        // 3. Fill remaining measure
        if (currentTick < mEndTick - 5) {
          const remainTicks = mEndTick - currentTick;
          const remainXml = Math.round((remainTicks / ticksPerBeat) * divisions);
          if (remainXml > 10) {
            xml += `      <note><rest/><duration>${remainXml}</duration><voice>1</voice></note>\n`;
          }
        }

        xml += `    </measure>\n`;
      }
      xml += `  </part>\n`;
    });

    xml += `</score-partwise>`;
    return xml;
  }
}
