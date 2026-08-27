import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(__dirname, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(fs.readFileSync(filePath));
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  return server;
}

async function runE2ETests() {
  console.log('========================================================');
  console.log('Starting End-to-End Tests for File Compressor Web App');
  console.log('========================================================\n');

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[1/6] Local test server started on http://127.0.0.1:${port}`);

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ]
  });
  console.log('[2/6] Headless Google Chrome launched');

  try {
    const page = await browser.newPage();

    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') console.error('  [Browser Console Error]:', msg.text());
      else console.log('  [Browser Console]:', msg.text());
    });

    page.on('pageerror', (err) => {
      console.error('  [Browser Page Error]:', err.message);
    });

    // Step 1: Load index.html
    console.log('[3/6] Navigating to index.html and waiting for Wasm initialization...');
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle0' });

    await page.waitForFunction(
      () => {
        const dot = document.getElementById('statusDot');
        return dot && dot.classList.contains('ready');
      },
      { timeout: 10000 }
    );

    const statusText = await page.$eval('#statusText', (el) => el.textContent);
    console.log(`  ✓ WebAssembly engine initialized successfully: "${statusText}"`);

    // Step 2: Test UI Sample Generation & Compression across all algorithms
    console.log('\n[4/6] Testing UI Compression across all algorithms...');

    // Load sample text
    await page.click('#btnSampleText');
    await page.waitForSelector('#fileInfoBox.visible', { timeout: 3000 });
    const loadedFileName = await page.$eval('#fileName', (el) => el.textContent);
    console.log(`  ✓ Sample file loaded: "${loadedFileName}"`);

    const algorithms = ['zstd', 'zlib', 'lz4', 'rle'];
    for (const algo of algorithms) {
      console.log(`\n  --- Testing UI Compress with algorithm: ${algo.toUpperCase()} ---`);
      await page.select('#selectAlgo', algo);

      // Trigger compression
      await page.click('#btnAction');

      // Wait for stats to become visible
      await page.waitForSelector('#statsSection.visible', { timeout: 5000 });

      const stats = await page.evaluate(() => ({
        origSize: document.getElementById('statOrigSize').textContent,
        outSize: document.getElementById('statOutSize').textContent,
        ratio: document.getElementById('statRatio').textContent,
        duration: document.getElementById('statDuration').textContent,
        speed: document.getElementById('statSpeed').textContent,
        savings: document.getElementById('statSavings').textContent,
        downloadName: document.getElementById('downloadFilename').textContent
      }));

      console.log(`  ✓ Compressed with ${algo}:`);
      console.log(`    - Original: ${stats.origSize}`);
      console.log(`    - Compressed: ${stats.outSize} (${stats.savings})`);
      console.log(`    - Ratio: ${stats.ratio}`);
      console.log(`    - Duration: ${stats.duration} (Speed: ${stats.speed})`);
      console.log(`    - Download target: ${stats.downloadName}`);

      if (!stats.outSize || stats.outSize === '0 B') {
        throw new Error(`Compression failed for algorithm ${algo}`);
      }
    }

    // Step 3: Test UI Decompression tab
    console.log('\n[5/6] Testing UI Decompression Mode with Format Auto-Detection...');
    await page.evaluate(async () => {
      const createModule = (await import('./module.mjs')).default;
      const mod = await createModule();
      const origText = 'Decompression roundtrip test content for UI validation! '.repeat(100);
      const origBytes = new TextEncoder().encode(origText);
      const compressed = mod.compress(origBytes, 'zstd', 3, true);

      // Load into app UI as a compressed file
      const file = new File([compressed.data], 'test-archive.wcmp', { type: 'application/octet-stream' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('fileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForSelector('#fileInfoBox.visible', { timeout: 3000 });
    await page.click('#tabDecompress');

    const detectedBadge = await page.$eval('#detectedFormatBadge', (el) => el.textContent);
    console.log(`  ✓ Auto-detection status in UI: "${detectedBadge}"`);

    await page.click('#btnAction');
    await page.waitForSelector('#statsSection.visible', { timeout: 5000 });

    const decompStats = await page.evaluate(() => ({
      origSize: document.getElementById('statOrigSize').textContent,
      outSize: document.getElementById('statOutSize').textContent,
      duration: document.getElementById('statDuration').textContent,
      downloadName: document.getElementById('downloadFilename').textContent
    }));

    console.log(`  ✓ Decompressed successfully:`);
    console.log(`    - Input Compressed Size: ${decompStats.origSize}`);
    console.log(`    - Output Restored Size: ${decompStats.outSize}`);
    console.log(`    - Duration: ${decompStats.duration}`);
    console.log(`    - Restored Filename: ${decompStats.downloadName}`);

    // Step 4: Test Benchmark Mode
    console.log('\n[6/6] Testing UI Benchmark Mode...');
    await page.click('#btnSampleJson');
    await page.waitForSelector('#fileInfoBox.visible', { timeout: 3000 });
    await page.click('#tabBenchmark');
    await page.click('#btnAction');
    await page.waitForSelector('#benchmarkSection[style*="block"]', { timeout: 10000 });

    const benchmarkRows = await page.$$eval('#benchmarkTbody tr', (rows) =>
      rows.map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent.trim()))
    );

    console.log(`  ✓ Benchmark completed with ${benchmarkRows.length} algorithms on JSON log data:`);
    for (const row of benchmarkRows) {
      console.log(`    * ${row[0].replace(/\s+/g, ' ').padEnd(28)} | Size: ${row[1].padEnd(20)} | Saved: ${row[2].padEnd(8)} | Time: ${row[3].padEnd(10)} | Speed: ${row[4]}`);
    }

    if (benchmarkRows.length !== 4) {
      throw new Error(`Expected 4 benchmark rows, got ${benchmarkRows.length}`);
    }

    console.log('\n========================================================');
    console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('========================================================\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runE2ETests().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
