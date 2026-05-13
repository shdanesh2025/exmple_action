const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Read inputs ---
const targetUrl = process.env.TARGET_URL || 'https://www.duolingo.com';
const takeScreenshot = (process.env.TAKE_SCREENSHOT || 'true') === 'true';
const removeScripts = (process.env.REMOVE_SCRIPTS || 'true') === 'true';

// --- Load steps ---
let steps = [];
try {
  steps = require('./steps.js');
  console.log(`Loaded ${steps.length} custom step(s).`);
} catch (err) {
  console.log('No steps.js found – nothing to do.');
  process.exit(0);
}

(async () => {
  // Prepare directories
  const dirs = ['downloads', 'images', 'screenshots'];
  dirs.forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // --- Image response interception ---
  const imageMap = new Map();
  let counter = 0;

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

  // --- Navigate to target URL ---
  await page.goto(targetUrl, {
    waitUntil: 'load',
    timeout: 60000
  });

  // --- Execute steps one by one ---
  for (const step of steps) {
    console.log(`\nStep: ${step.action}${step.name ? ' -> ' + step.name : ''}${step.selector ? ' (' + step.selector + ')' : ''}`);
    try {
      switch (step.action) {

        // ---- Navigation & interaction ----
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

        // ---- Screenshot (respects global toggle) ----
        case 'screenshot':
          if (!takeScreenshot) {
            console.log('  -> Skipped (take_screenshot is false)');
            break;
          }
          if (!step.name) {
            console.warn('  -> Missing "name" for screenshot, skipping.');
            break;
          }
          await page.screenshot({
            path: `screenshots/screenshot_${step.name}.png`,
            fullPage: true
          });
          console.log(`  -> Saved screenshots/screenshot_${step.name}.png`);
          break;

        // ---- Save HTML with image-rewriting ----
        case 'saveHtml':
          if (!step.name) {
            console.warn('  -> Missing "name" for saveHtml, skipping.');
            break;
          }
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

          if (removeScripts) {
            html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
          }

          fs.writeFileSync(`page_${step.name}.html`, html);
          console.log(`  -> Saved page_${step.name}.html`);
          break;

        default:
          console.warn(`  -> Unknown action: ${step.action}`);
      }
    } catch (err) {
      console.error(`  -> Step failed: ${err.message}`);
      // Stop further steps on failure to avoid broken state
      break;
    }
  }

  await browser.close();

  // --- Create ZIP with all generated artefacts ---
  const filesToZip = [];
  if (fs.existsSync('images')) filesToZip.push('images');

  const pageFiles = fs.readdirSync('.').filter(f => f.startsWith('page_') && f.endsWith('.html'));
  if (pageFiles.length) filesToZip.push(...pageFiles);

  if (takeScreenshot && fs.existsSync('screenshots')) {
    const ssFiles = fs.readdirSync('screenshots');
    if (ssFiles.length) filesToZip.push('screenshots');
  }

  if (filesToZip.length > 0) {
    const zipFile = 'downloads/snapshot.zip';
    if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
    execSync(`zip -r ${zipFile} ${filesToZip.join(' ')}`, { stdio: 'inherit' });
    console.log(`\nZIP created at ${zipFile}`);
  } else {
    console.log('No files to zip.');
  }
})();

// Helper to escape regex characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
