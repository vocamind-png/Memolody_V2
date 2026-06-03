const verovio = require('verovio');
verovio.module.onRuntimeInitialized = () => {
    const vrvToolkit = new verovio.toolkit();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise><partList><score-part id="P1"><part-name>Music</part-name></score-part></partList><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><lyric number="1" placement="below"><text>Fah</text></lyric></note></measure></part></score-partwise>`;
    vrvToolkit.setOptions({ svgHtml5: true });
    vrvToolkit.loadData(xml);
    const svg = vrvToolkit.renderToSVG(1);
    
    console.log("SVG OUTPUT:");
    console.log(svg);
};
