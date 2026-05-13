const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate
  await page.goto('https://example.com');

  // Get title
  const title = await page.title();
  console.log('Page title:', title);
  fs.writeFileSync('title.txt', title, 'utf8');

  // Take screenshot (full page)
  await page.screenshot({ path: 'screenshot.png', fullPage: true });

  await browser.close();
  console.log('Screenshot and title saved.');
})();
