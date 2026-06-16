const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

// 1. Disable the cloud sync logic in App.tsx
content = content.replace(
    /if \(songs\.length <= DEMO_SONGS\.length\) \{[\s\S]*?setInitProgress\(95\);/,
    `if (false) { // SYNC DISABLED BY USER REQUEST (ROLLBACK TO 9:00 AM STATE)
        }`
);

// 2. Add a one-time DB wipe to App.tsx to clear the 881+ GCS songs, leaving only the demo song
if (!content.includes('songStorage.clearAllSongs()')) {
    content = content.replace(
        /console\.log\('🌱 Force Seeding Vocalido Demo data\.\.\.'\);/,
        `console.log('🧹 Wiping GCS songs to restore 9:00 AM state...');
        await songStorage.clearAllSongs(); // WIPE DB
        console.log('🌱 Force Seeding Vocalido Demo data...');`
    );
}

fs.writeFileSync('App.tsx', content);
