const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type().toUpperCase(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  console.log('Navigating to app...');
  await page.goto('https://memolody-v2-5.vercel.app', { waitUntil: 'networkidle0' });
  
  console.log('Waiting for song elements to render...');
  try {
    // Wait for the SongRow or the Top Charts card
    await page.waitForSelector('.group\\/card, div[onClick]', { timeout: 15000 });
    
    // Find a clickable song
    // We can evaluate in browser to find an element with an onClick that calls onSongSelect, but we can just click a .group/card
    const songCards = await page.$$('.group\\/card');
    if (songCards.length > 0) {
      console.log(`Found ${songCards.length} .group/card songs. Clicking the first one...`);
      await songCards[0].click();
      console.log('Clicked. Waiting 5s...');
      await new Promise(r => setTimeout(r, 5000));
    } else {
      console.log('No .group/card found, looking for SongRow...');
      // SongRow has text "NOW PLAYING" or duration or something. Let's just click the first one that looks like a song row.
      const rows = await page.$x("//div[contains(@class, 'active:bg-white')]");
      if (rows.length > 0) {
        console.log(`Found ${rows.length} rows. Clicking first...`);
        await rows[0].click();
        console.log('Clicked. Waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  } catch (err) {
    console.log("Timeout waiting for songs:", err.message);
  }

  await browser.close();
})();
