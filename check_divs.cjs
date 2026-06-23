const fs = require('fs');
const code = fs.readFileSync('components/Home/HomePage.tsx', 'utf8');
const lines = code.split('\n');

let openTags = [];
for (let i = 860; i < 1160; i++) {
  const line = lines[i];
  if (!line) continue;
  
  const opens = (line.match(/<div/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  
  if (opens > closes) {
    for (let j=0; j < opens - closes; j++) openTags.push(i + 1);
  } else if (closes > opens) {
    for (let j=0; j < closes - opens; j++) {
      const openedAt = openTags.pop();
      console.log(`Line ${i+1} </div> closes <div from line ${openedAt}`);
    }
  }
}
