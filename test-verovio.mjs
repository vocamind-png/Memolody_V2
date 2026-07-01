import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:3100/');
  console.log('Navigated');
  
  // Wait for 5 seconds to let React render and Verovio do its thing
  await new Promise(r => setTimeout(r, 5000));
  
  const visualizers = await page.$$eval('.verovio-track-svg', els => els.map(e => e.outerHTML));
  console.log('SVG count:', visualizers.length);
  if (visualizers.length > 0) {
    console.log('First SVG start:', visualizers[0].substring(0, 500));
  }
  
  await browser.close();
})();
