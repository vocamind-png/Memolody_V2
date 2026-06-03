const fs = require('fs');
const data = JSON.parse(fs.readFileSync('chords_dataset.json', 'utf8'));
console.log("Total songs:", data.length);
console.log("Sample songs:");
for (let i = 0; i < 5; i++) {
  console.log(`${i+1}. ${data[i].title} - ${data[i].artist}`);
}
