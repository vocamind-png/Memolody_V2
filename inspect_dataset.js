const fs = require('fs');
const data = JSON.parse(fs.readFileSync('chords_dataset.json', 'utf8'));
console.log("Total songs:", data.length);
console.log("Sample songs:");
data.slice(0, 10).forEach((s, i) => console.log(`${i+1}. ${s.title} by ${s.artist}`));
