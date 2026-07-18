const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type().toUpperCase(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  console.log('Navigating to app...');
  await page.goto('https://memolody-v2-5.vercel.app', { waitUntil: 'networkidle0' });
  
  console.log('App loaded. Taking screenshot of home page...');
  await page.screenshot({ path: 'home.png' });
  
  console.log('Finding a song in Top Charts...');
  // Look for the "Recent Matrix" or "Top Chart" song row by finding an element with onClick handler that matches song selection
  // In HomePage, it renders `topClassicalSongs.map` with `className="flex flex-col gap-1.5 group/card cursor-pointer relative...`
  const songElements = await page.$$('div.group\\/card.cursor-pointer');
  
  if (songElements.length > 0) {
    console.log(`Found ${songElements.length} songs. Clicking the first one...`);
    await songElements[0].click();
    
    console.log('Waiting 5 seconds for transition...');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('Taking screenshot after click...');
    await page.screenshot({ path: 'after_click.png' });
  } else {
    console.log('No song elements found.');
    // Let's try another selector, maybe the horizontal scroll list
    const altSongs = await page.$$('div[onClick]');
    console.log(`Found ${altSongs.length} clickable divs.`);
    if (altSongs.length > 5) { // The first few might be other things, let's just dump their outerHTML to debug
       console.log("Alternative elements found.");
    }
  }

  await browser.close();
})();
