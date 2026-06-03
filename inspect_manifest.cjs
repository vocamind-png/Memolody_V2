const https = require('https');

https.get('https://storage.googleapis.com/memolody-vault/manifest.json', (res) => {
  let rawData = '';
  res.on('data', (chunk) => {
    rawData += chunk;
    if (rawData.length > 50000) {
      res.destroy();
      const firstObjMatch = rawData.match(/\{[^}]+\}/);
      if (firstObjMatch) {
          console.log("First Object found:");
          console.log(firstObjMatch[0]);
      }
    }
  });
});
