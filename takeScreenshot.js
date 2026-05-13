const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
  // Prepare directories
  const dirs = ['downloads', 'images', 'screenshots'];
  dirs.forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Map to store response bodies of images: URL -> { filename, buffer }
  const imageMap = new Map();
  let counter = 0;

  // Intercept image responses
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'image' && response.ok()) {
      try {
        const url = response.url();
        if (imageMap.has(url)) return; // already captured

        const body = await response.body();
        // Get file extension from URL or default to .png
        const urlPath = new URL(url).pathname;
        let ext = path.extname(urlPath) || '.png';
        if (!ext.startsWith('.')) ext = '.png';

        // Create unique filename
        let baseName = path.basename(urlPath, ext) || 'image';
        baseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
        let filename = `${baseName}${ext}`;
        // If filename exists, add counter
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

  // Navigate
  await page.goto('https://www.duolingo.com', { waitUntil: 'networkidle' });

  // Get page title and save
  const title = await page.title();
  fs.writeFileSync('title.txt', title, 'utf8');

  // Get the page HTML and rewrite image src attributes
  let html = await page.content();

  // Find all <img> elements and update their src
  const imgElements = await page.$$('img');
  for (const img of imgElements) {
    const src = await img.getAttribute('src');
    if (!src) continue;

    // Get fully resolved URL
    const resolvedUrl = await img.evaluate(el => el.src);
    if (imageMap.has(resolvedUrl)) {
      const localFile = imageMap.get(resolvedUrl);
      const newSrc = `images/${localFile}`;
      // Replace in HTML string (simple replace, could be improved)
      html = html.replace(new RegExp(`src=["']${escapeRegExp(src)}["']`, 'g'), `src="${newSrc}"`);
    }
  }
  fs.writeFileSync('duolingo.html', html);

  // Take screenshot
  await page.screenshot({ path: 'screenshots/screenshot.png', fullPage: true });

  await browser.close();

  // Create zip archive (requires zip utility, preinstalled on ubuntu-latest)
  if (fs.existsSync('downloads/duolingo.zip')) fs.unlinkSync('downloads/duolingo.zip');
  execSync('zip -r downloads/duolingo.zip duolingo.html title.txt images screenshots', { stdio: 'inherit' });

  console.log('Zip archive created at downloads/duolingo.zip');
})();

// Helper to escape special regex characters in src strings
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
