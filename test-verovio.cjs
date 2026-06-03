const verovio = require('verovio');
verovio.module.onRuntimeInitialized = () => {
    const vrvToolkit = new verovio.toolkit();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise><partList><score-part id="P1"><part-name>Piano</part-name></score-part></partList><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric><syllabic>single</syllabic><text>Doh</text></lyric></note></measure></part></score-partwise>`;
    vrvToolkit.loadData(xml);
    const svg = vrvToolkit.renderToSVG(1);
    console.log(svg.substring(0, 1000));
    const lines = svg.split('\n').filter(l => l.includes('class="note"'));
    console.log(lines.join('\n'));
}
