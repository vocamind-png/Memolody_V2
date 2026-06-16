const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

// 1. Remove the forceful DB wipe and demo seeding
content = content.replace(
    /console\.log\('🧹 Wiping GCS songs to restore 9:00 AM state\.\.\.'\);[\s\S]*?songs = await songStorage\.getAllSongs\(\);/,
    `// Initialization complete`
);

// 2. Restore the GCS Cloud Sync
content = content.replace(
    /if \(false\) \{ \/\/ SYNC DISABLED BY USER REQUEST \(ROLLBACK TO 9:00 AM STATE\)\n        \}/,
    `if (songs.length <= DEMO_SONGS.length) {
          setInitStatus('Syncing Songs Library from Cloud');
          setInitProgress(80);
          try {
            const syncResult = await CloudSyncService.syncWithGlobalCloud((percent) => {
              setInitProgress(80 + (percent * 0.15));
            });
            if (syncResult && syncResult.total >= 0) {
              songs = await songStorage.getAllSongs();
            }
          } catch (syncErr) {
            console.warn('[App] Initial cloud sync failed:', syncErr);
            setInitStatus('Sync in background');
            setTimeout(() => triggerSync(), 1000); 
          }
        }`
);

fs.writeFileSync('App.tsx', content);
