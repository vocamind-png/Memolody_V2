const fs = require('fs');
let file = fs.readFileSync('components/Player/PlayerPage.tsx', 'utf8');
if (!file.includes('LOGGING TRANPOSE DIFF')) {
file = file.replace(
  'musicEngine.setVocalTranspose(t.id, transpose - renderedTranspose);',
  `console.log('[PlayerPage] LOGGING TRANPOSE DIFF', t.id, transpose - renderedTranspose);\n        musicEngine.setVocalTranspose(t.id, transpose - renderedTranspose);`
);
fs.writeFileSync('components/Player/PlayerPage.tsx', file);
}
