/**
 * Demo Data for Memolody V2
 * Provides initial songs for previewing the UI and Testing Vocalido.
 */

export const DEMO_SONGS = [
  {
    metadata: {
      id: 'demo-vocal-01',
      title: 'Vocalido Cloud Demo',
      artist: 'VOCAMIND AI',
      bpm: 120,
      key: 'C',
      duration: 30,
      genre: 'AI Demo',
      isGlobal: false,
      isDeleted: false
    },
    xmlData: `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Vocalido Cloud Demo</work-title></work>
  <identification><creator type="composer">VOCAMIND AI</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Nimo (Vocal)</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <lyric number="1"><text>Vo</text></lyric>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <lyric number="1"><text>ca</text></lyric>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <lyric number="1"><text>li</text></lyric>
      </note>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <lyric number="1"><text>do</text></lyric>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <lyric number="1"><text>AI Cloud</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`
  }
];

