const fs = require('fs');
let file = fs.readFileSync('lib/VocalidoRenderService.ts', 'utf8');

file = file.replace(
  'estimatedDuration = hasGpu ? (4 + noteCount * 0.05) : (8 + noteCount * 0.4);',
  'estimatedDuration = hasGpu ? (4 + noteCount * 0.05) : (15 + noteCount * 1.5); // Slowed down for realistic CPU rendering'
);

file = file.replace(
  'estimatedDuration = 6 + noteCount * 0.08;',
  'estimatedDuration = 10 + noteCount * 0.2;'
);

fs.writeFileSync('lib/VocalidoRenderService.ts', file);
