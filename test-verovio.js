import verovio from 'verovio';
import fs from 'fs';

verovio.module.onRuntimeInitialized = () => {
  const vrvToolkit = new verovio.toolkit();
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list><part id="P1"><measure number="1"><note xml:id="m-note-14"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>`;
  vrvToolkit.loadData(xml);
  const svg = vrvToolkit.renderToSVG(1);
  if (svg.includes('m-note-14')) {
    console.log("SUCCESS: xml:id is preserved!");
  } else {
    console.log("FAIL: xml:id is stripped.");
    console.log(svg);
  }
};
