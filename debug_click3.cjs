const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type().toUpperCase(), msg.text()));
  
  console.log('Navigating to app...');
  await page.goto('https://memolody-v2-5.vercel.app', { waitUntil: 'networkidle0' });
  
  console.log('Waiting 10 seconds for initial sync to finish...');
  await new Promise(r => setTimeout(r, 10000));
  
  console.log('Clicking a song in Top Classical Songs section...');
  try {
    // Top classical songs map to div with cursor-pointer
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.group\\/card'));
      if (cards.length > 0) {
         console.log("Found card in browser, clicking: " + cards[0].innerText.substring(0, 50));
         cards[0].click();
      } else {
         console.log("No card found.");
         // fallback to SongRow
         const rows = Array.from(document.querySelectorAll('div'));
         const clickables = rows.filter(r => r.className.includes('active:bg-white') && r.onClick);
         if (clickables.length > 0) {
            console.log("Clicking SongRow");
            clickables[0].click();
         }
      }
    });
    
    console.log('Clicked. Waiting 10s for transition and load...');
    await new Promise(r => setTimeout(r, 10000));
  } catch (err) {
    console.log("Error in click eval:", err.message);
  }

  await browser.close();
})();
