const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Read configuration from environment ---
const targetUrl = process.env.TARGET_URL || 'https://www.duolingo.com';
const takeScreenshot = (process.env.TAKE_SCREENSHOT || 'true') === 'true';
const removeScripts = (process.env.REMOVE_SCRIPTS || 'true') === 'true';

// --- Load steps file ---
let steps = [];
try {
  steps = require('./steps.js');
  console.log(`Loaded ${steps.length} custom step(s).`);
} catch (err) {
  console.log('No steps.js found – continuing without custom steps.');
}

(async () => {
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

  // Navigate to the target URL
  await page.goto(targetUrl, {
    waitUntil: 'load',
    timeout: 60000
  });

  // --- Execute custom steps ---
  for (const step of steps) {
    console.log(`Executing step: ${step.action}`, step.selector || '');
    try {
      switch (step.action) {
        case 'waitForSelector':
          await page.waitForSelector(step.selector, step.options || {});
          break;
        case 'click':
          await page.click(step.selector);
          break;
        case 'waitForTimeout':
          await page.waitForTimeout(step.ms || 0);
          break;
        case 'scrollTo':
          if (step.position === 'bottom') {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          } else {
            await page.evaluate((pos) => window.scrollTo(0, pos), step.position || 0);
          }
          break;
        case 'fill':
          await page.fill(step.selector, step.value);
          break;
        case 'hover':
          await page.hover(step.selector);
          break;
        case 'press':
          await page.keyboard.press(step.key);
          break;
        default:
          console.warn(`Unknown action: ${step.action}`);
      }
    } catch (err) {
      console.error(`Step failed: ${step.action}`, err.message);
      // Decide whether to break or continue – here we break to avoid broken state
      break;
    }
  }

  // Scroll to bottom to trigger lazy images (in case steps didn't already do it)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  // --- Screenshot (optional) ---
  if (takeScreenshot) {
    await page.screenshot({ path: 'screenshots/screenshot.png', fullPage: true });
    console.log('Screenshot saved.');
  }

  // --- HTML processing ---
  let html = await page.content();

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

  if (removeScripts) {
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    console.log('Script tags removed.');
  }

  fs.writeFileSync('page.html', html);
  console.log('HTML saved.');

  await browser.close();

  // --- ZIP creation ---
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
