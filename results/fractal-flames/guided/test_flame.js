const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = 8999;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.xml': 'application/xml'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      console.log('REQ:', req.url);
      let filePath = path.join(ROOT_DIR, req.url.split('?')[0]);
      if (filePath.endsWith('/') || filePath === ROOT_DIR) {
        filePath = path.join(ROOT_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`500 Internal Server Error: ${err.code}`);
          }
        } else {
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
          });
          res.end(content);
        }
      });
    });

    server.listen(PORT, () => {
      console.log(`Test server running at http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function runTests() {
  const server = await startServer();
  let browser;

  try {
    console.log('Launching headless browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    browser.on('targetcreated', async target => {
      if (target.type() === 'service_worker' || target.type() === 'worker') {
        const workerTarget = await target.worker();
        if (workerTarget) {
          workerTarget.on('console', msg => console.log('WORKER CONSOLE:', msg.text()));
          workerTarget.on('error', err => console.error('WORKER ERROR:', err));
        }
      }
    });

    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err));

    console.log(`Navigating to http://localhost:${PORT}...`);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0', timeout: 30000 });

    console.log('Waiting for initial fractal flame rendering...');
    // Wait for the flameCanvas to have rendered pixels
    await page.waitForFunction(() => {
      const canvas = document.getElementById('flameCanvas');
      if (!canvas || canvas.width === 0) return false;
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonZero = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] > 10 || img.data[i+1] > 10 || img.data[i+2] > 10) {
          nonZero++;
        }
      }
      return nonZero > 500;
    }, { timeout: 30000 });

    const initialStats = await page.evaluate(() => {
      const canvas = document.getElementById('flameCanvas');
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonZeroCount = 0;
      let rSum = 0, gSum = 0, bSum = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] > 0 || img.data[i+1] > 0 || img.data[i+2] > 0) {
          nonZeroCount++;
          rSum += img.data[i];
          gSum += img.data[i+1];
          bSum += img.data[i+2];
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        totalPixels: canvas.width * canvas.height,
        nonZeroPixels: nonZeroCount,
        avgR: nonZeroCount ? rSum / nonZeroCount : 0,
        avgG: nonZeroCount ? gSum / nonZeroCount : 0,
        avgB: nonZeroCount ? bSum / nonZeroCount : 0,
        statusText: document.getElementById('statusMessage').textContent
      };
    });

    console.log('Initial Render Verification:', initialStats);
    if (initialStats.nonZeroPixels < 500) {
      throw new Error(`Insufficient rendered pixels in initial canvas: ${initialStats.nonZeroPixels}`);
    }

    // Take screenshot of initial render
    await page.screenshot({ path: 'test_screenshot_initial.png' });
    console.log('Saved test_screenshot_initial.png');

    // Test preset change
    console.log('Testing Preset Switch: Hyperbolic Star...');
    await page.select('#selectPreset', 'hyperbolic_star');
    await page.click('#btnLoadPreset');

    // Wait for render update
    await page.waitForFunction(() => {
      const status = document.getElementById('statusMessage').textContent;
      return status.includes('completed in');
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 1000));

    const presetStats = await page.evaluate(() => {
      const canvas = document.getElementById('flameCanvas');
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonZeroCount = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] > 0 || img.data[i+1] > 0 || img.data[i+2] > 0) {
          nonZeroCount++;
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        nonZeroPixels: nonZeroCount,
        statusText: document.getElementById('statusMessage').textContent
      };
    });

    console.log('Preset Render Verification:', presetStats);
    if (presetStats.nonZeroPixels < 500) {
      throw new Error('Preset render failed to produce visible fractal pixels');
    }

    // Take screenshot of preset render
    await page.screenshot({ path: 'test_screenshot_preset.png' });
    console.log('Saved test_screenshot_preset.png');

    // Test Mutation
    console.log('Testing Flame Mutation...');
    await page.click('#btnMutate');
    await new Promise(r => setTimeout(r, 1500));

    const mutateStats = await page.evaluate(() => {
      const canvas = document.getElementById('flameCanvas');
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonZeroCount = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] > 0 || img.data[i+1] > 0 || img.data[i+2] > 0) {
          nonZeroCount++;
        }
      }
      return {
        nonZeroPixels: nonZeroCount,
        statusText: document.getElementById('statusMessage').textContent
      };
    });

    console.log('Mutate Verification:', mutateStats);

    // Test UI Responsiveness during rendering
    console.log('Testing UI Responsiveness during render...');
    const responsivenessTest = await page.evaluate(async () => {
      let uiTicks = 0;
      const interval = setInterval(() => { uiTicks++; }, 16);

      // Trigger heavy render
      document.getElementById('sliderQuality').value = 150;
      document.getElementById('sliderQuality').dispatchEvent(new Event('change'));

      // Wait 300ms while render is happening
      await new Promise(r => setTimeout(r, 300));
      clearInterval(interval);

      return {
        uiTicks,
        isResponsive: uiTicks > 10
      };
    });

    console.log('UI Responsiveness Test Result:', responsivenessTest);
    if (!responsivenessTest.isResponsive) {
      throw new Error(`UI blocked during render: only ${responsivenessTest.uiTicks} ticks`);
    }

    console.log('All tests passed successfully!');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
