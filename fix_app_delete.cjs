const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

if (!content.includes('songStorage.permanentDeleteSong(\\\'demo-vocal-01\\\')')) {
    content = content.replace(
        /setInitStatus\('Loading Songs Library'\);/,
        `setInitStatus('Loading Songs Library');
        await songStorage.permanentDeleteSong('demo-vocal-01'); // User specifically requested deletion`
    );
}

fs.writeFileSync('App.tsx', content);
