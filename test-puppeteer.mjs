import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // Go to the app
  console.log('Navigating to http://localhost:3103/');
  await page.goto('http://localhost:3103/', { waitUntil: 'networkidle2' });
  
  console.log('Waiting for song list to render...');
  await page.waitForSelector('.group.cursor-pointer', { timeout: 15000 }).catch(e => console.log('Timeout waiting for song:', e));
  
  try {
    console.log('Clicking the first song...');
    await page.click('.group.cursor-pointer'); 
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Clicking Arranger tab...');
    const tabs = await page.$$('button[role="tab"]');
    for (const tab of tabs) {
      const text = await page.evaluate(el => el.textContent, tab);
      if (text.includes('Arranger')) {
        await tab.click();
        break;
      }
    }
    
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('Checking for verovio svgs...');
    const svgs = await page.$$eval('.verovio-track-svg', els => els.map(e => e.outerHTML));
    console.log('Found SVGs:', svgs.length);
    
    if (svgs.length > 0) {
      console.log('First SVG snippet:', svgs[0].substring(0, 500));
      // Log viewBox and dimensions
      const match = svgs[0].match(/viewBox="([^"]+)"/);
      console.log('viewBox:', match ? match[1] : 'none');
      const width = svgs[0].match(/width="([^"]+)"/);
      console.log('width attribute:', width ? width[1] : 'none');
      const height = svgs[0].match(/height="([^"]+)"/);
      console.log('height attribute:', height ? height[1] : 'none');
      fs.writeFileSync('verovio_dump.svg', svgs[0]);
      console.log('Saved verovio_dump.svg');
    } else {
      console.log('No SVGs found! Checking DOM...');
      const trackContainer = await page.$eval('.bg-\\[\\#111115\\]', el => el.outerHTML).catch(() => 'No track container found');
      console.log('Track container HTML:', trackContainer.substring(0, 1000));
      
      const verovioErrors = await page.evaluate(() => window.verovioErrors || []);
      console.log('Verovio Errors:', verovioErrors);
      
      // Save screenshot for debugging
      await page.screenshot({ path: 'puppeteer_error.png' });
    }
  } catch (err) {
    console.error('Error during automation:', err);
    await page.screenshot({ path: 'puppeteer_error.png' });
  }
  
  await browser.close();
})();
