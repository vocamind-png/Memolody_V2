import fs from 'fs';
const data = fs.readFileSync('components/Player/ProScoreEditor.tsx', 'utf-8');
const createCoordMapCode = data.substring(data.indexOf('const createCoordMap'), data.indexOf('const renderScore'));
console.log(createCoordMapCode);
