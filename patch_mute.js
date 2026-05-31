const fs = require('fs');
let file = fs.readFileSync('lib/MusicEngine.ts', 'utf8');

file = file.replace(/try \{ player\.stop\(triggerTime\); \} catch \(e\) \{\}/g, 'player.mute = true;');

file = file.replace(/player\.playbackRate = ratio;/g, 'player.mute = false; player.playbackRate = ratio;');
file = file.replace(/\(player\.playbackRate as any\)\.value = ratio;/g, 'player.mute = false; (player.playbackRate as any).value = ratio;');

fs.writeFileSync('lib/MusicEngine.ts', file);
