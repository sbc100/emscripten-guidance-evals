import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Create static server
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.tga': 'application/octet-stream',
  '.qoi': 'application/octet-stream'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + reqPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });
    res.end(data);
  });
});

const PORT = 8124;
await new Promise(resolve => server.listen(PORT, resolve));
console.log(`Test server running at http://localhost:${PORT}`);

try {
  // 2. Launch headless Chrome
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.toString()));

  console.log('Navigating to index.html...');
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });

  // Wait for WASM to initialize
  await page.waitForFunction(() => {
    const el = document.getElementById('engineStatusText');
    return el && el.textContent.includes('Active');
  }, { timeout: 10000 });

  console.log('✓ WASM Module loaded and active in browser!');

  // Verify Original & Transcoded Canvas Dimensions and pixel data
  const initialCanvasState = await page.evaluate(() => {
    const cOrig = document.getElementById('canvasOriginal');
    const cTrans = document.getElementById('canvasTranscoded');
    const ctxOrig = cOrig.getContext('2d');
    const ctxTrans = cTrans.getContext('2d');

    const origImgData = ctxOrig.getImageData(0, 0, Math.min(10, cOrig.width), Math.min(10, cOrig.height));
    const transImgData = ctxTrans.getImageData(0, 0, Math.min(10, cTrans.width), Math.min(10, cTrans.height));

    return {
      origW: cOrig.width,
      origH: cOrig.height,
      transW: cTrans.width,
      transH: cTrans.height,
      origNonZero: origImgData.data.some(x => x > 0),
      transNonZero: transImgData.data.some(x => x > 0),
      timeText: document.getElementById('metricTime').textContent,
      origSizeText: document.getElementById('metricOrigSize').textContent,
      transSizeText: document.getElementById('metricTransSize').textContent,
    };
  });

  console.log('✓ Initial render state:', initialCanvasState);
  if (!initialCanvasState.origNonZero || !initialCanvasState.transNonZero) {
    throw new Error('Canvas pixels are empty / zero!');
  }

  // Save screenshot of initial state
  await page.screenshot({ path: 'test_screenshot_initial.png' });
  console.log('✓ Saved test_screenshot_initial.png');

  // Test Format Switching to JPEG, BMP, QOI, TGA
  for (const fmt of ['jpeg', 'bmp', 'qoi', 'tga', 'png']) {
    console.log(`Testing format switch to ${fmt.toUpperCase()}...`);
    await page.select('#selectFormat', fmt);
    await page.waitForTimeout ? page.waitForTimeout(100) : new Promise(r => setTimeout(r, 100));

    const meta = await page.evaluate(() => {
      return {
        transMeta: document.getElementById('transcodedMeta').textContent,
        metricTrans: document.getElementById('metricTransSize').textContent,
        time: document.getElementById('metricTime').textContent
      };
    });
    console.log(`  Format ${fmt.toUpperCase()} result:`, meta);
  }

  // Test Filter Presets (Grayscale, Sepia, Invert, Vivid, Cyberpunk)
  const tabFilterBtn = await page.$('button[data-tab="tabFilters"]');
  await tabFilterBtn.click();
  await new Promise(r => setTimeout(r, 100));

  for (const preset of ['grayscale', 'sepia', 'invert', 'cyberpunk', 'dither']) {
    console.log(`Testing preset: ${preset}...`);
    await page.click(`.chip[data-preset="${preset}"]`);
    await new Promise(r => setTimeout(r, 100));

    const canvasStats = await page.evaluate(() => {
      const c = document.getElementById('canvasTranscoded');
      const ctx = c.getContext('2d');
      const p = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return { r: p[0], g: p[1], b: p[2], a: p[3], time: document.getElementById('metricTime').textContent };
    });
    console.log(`  Preset ${preset} sample pixel:`, canvasStats);
  }

  await page.screenshot({ path: 'test_screenshot_filters.png' });
  console.log('✓ Saved test_screenshot_filters.png');

  // Test Split Comparison Mode
  await page.click('#modeSplit');
  await new Promise(r => setTimeout(r, 100));

  const splitCanvasCheck = await page.evaluate(() => {
    const c = document.getElementById('canvasSplit');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    return {
      w: c.width,
      h: c.height,
      hasData: d.some(x => x > 0)
    };
  });
  console.log('✓ Split comparison canvas check:', splitCanvasCheck);
  if (!splitCanvasCheck.hasData) {
    throw new Error('Split comparison canvas is blank!');
  }

  await page.screenshot({ path: 'test_screenshot_split.png' });
  console.log('✓ Saved test_screenshot_split.png');

  // Check console errors
  if (pageErrors.length > 0) {
    console.error('Page errors encountered:', pageErrors);
    throw new Error('Page errors found during headless test');
  }

  console.log('=== ALL BROWSER HEADLESS VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
  await browser.close();
} finally {
  server.close();
}
