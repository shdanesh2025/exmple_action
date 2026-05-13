const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
  // --- READ INPUTS FROM ENVIRONMENT ---
  const targetUrl = process.env.TARGET_URL || 'https://www.duolingo.com';
  const takeScreenshot = (process.env.TAKE_SCREENSHOT || 'true') === 'true';
  const removeScripts = (process.env.REMOVE_SCRIPTS || 'true') === 'true';

  console.log(`URL: ${targetUrl}`);
  console.log(`Take screenshot: ${takeScreenshot}`);
  console.log(`Remove scripts: ${removeScripts}`);

  // Prepare directories
  const dirs = ['downloads'];
  if (takeScreenshot) dirs.push('screenshots');
  dirs.push('images');
  dirs.forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Map to store response bodies of images: URL -> filename
  const imageMap = new Map();
  let counter = 0;

  // Intercept image responses
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'image' && response.ok()) {
      try {
        const url = response.url();
        if (imageMap.has(url)) return;

        const body = await response.body();
        const urlPath = new URL(url).pathname;
        let ext = path.extname(urlPath) || '.png';
        if (!ext.startsWith('.')) ext = '.png';

        let baseName = path.basename(urlPath, ext) || 'image';
        baseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
        let filename = `${baseName}${ext}`;
        while (fs.existsSync(path.join('images', filename))) {
          filename = `${baseName}_${++counter}${ext}`;
        }

        fs.writeFileSync(path.join('images', filename), body);
        imageMap.set(url, filename);
      } catch (e) {
        console.warn('Failed to save image:', e.message);
      }
    }
  });

  // Navigate to target URL
  await page.goto(targetUrl, {
    waitUntil: 'load',
    timeout: 60000
  });

  // Scroll to bottom to trigger lazy‑loaded images
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  // --- HANDLE SCREENSHOT (OPTIONAL) ---
  if (takeScreenshot) {
    await page.screenshot({ path: 'screenshots/screenshot.png', fullPage: true });
    console.log('Screenshot saved.');
  }

  // --- GET AND PROCESS HTML ---
  let html = await page.content();

  // Rewrite <img> src to local images
  const imgElements = await page.$$('img');
  for (const img of imgElements) {
    const src = await img.getAttribute('src');
    if (!src) continue;

    const resolvedUrl = await img.evaluate(el => el.src);
    if (imageMap.has(resolvedUrl)) {
      const localFile = imageMap.get(resolvedUrl);
      const newSrc = `images/${localFile}`;
      html = html.replace(
        new RegExp(`src=["']${escapeRegExp(src)}["']`, 'g'),
        `src="${newSrc}"`
      );
    }
  }

  // Remove <script> tags if requested
  if (removeScripts) {
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    console.log('Script tags removed.');
  }

  // Save final HTML
  fs.writeFileSync('page.html', html);
  console.log('HTML saved as page.html');

  await browser.close();

  // --- CREATE ZIP ARCHIVE ---
  const zipItems = ['page.html'];
  if (fs.existsSync('images')) zipItems.push('images');
  if (takeScreenshot && fs.existsSync('screenshots')) zipItems.push('screenshots');

  const zipFile = 'downloads/snapshot.zip';
  if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
  execSync(`zip -r ${zipFile} ${zipItems.join(' ')}`, { stdio: 'inherit' });

  console.log('ZIP created at', zipFile);
})();

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
