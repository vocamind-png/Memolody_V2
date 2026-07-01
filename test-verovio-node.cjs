const verovio = require('verovio');

const vrvToolkit = new verovio.toolkit();
vrvToolkit.setOptions({
  pageWidth: 5120,
  pageHeight: 256,
  scale: 40,
  adjustPageHeight: 1,
  header: 'none',
  footer: 'none',
  noJustification: 0,
  font: 'Bravura',
  spacingLinear: 1,
  spacingNonLinear: 0,
  pageMarginTop: 10,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  pageMarginRight: 0,
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Track</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch>
          <step>C</step>
          <alter>0</alter>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

try {
  const loadSuccess = vrvToolkit.loadData(xml);
  console.log('Load Success:', loadSuccess);
  const svg = vrvToolkit.renderToSVG(1);
  console.log('SVG length:', svg.length);
  if (svg.length > 0) {
    console.log('SVG starts with:', svg.substring(0, 100));
    const match = svg.match(/viewBox="([^"]+)"/);
    console.log('viewBox:', match ? match[1] : 'none');
  }
} catch (err) {
  console.error('Error:', err);
}
