const verovio = require('verovio');
verovio.module.onRuntimeInitialized = () => {
    const vrvToolkit = new verovio.toolkit();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise><partList><score-part id="P1"><part-name>Music</part-name></score-part></partList><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><lyric><text>Fah</text></lyric></note></measure></part></score-partwise>`;
    vrvToolkit.loadData(xml);
    const svg = vrvToolkit.renderToSVG(1);
    console.log(svg.substring(0, 1000));
    // extract just the syllable part
    const match = svg.match(/<g class="syllable"[\s\S]*?<\/g>\s*<\/g>/);
    if (match) console.log(match[0]);
};
