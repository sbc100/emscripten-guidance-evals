import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8099;
const CHROME_PORT = 9333;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.tga': 'image/x-tga',
  '.qoi': 'image/qoi'
};

// 1. Start HTTP server
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + reqPath);
      return;
    }
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });
    res.end(data);
  });
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`Local HTTP server running on http://127.0.0.1:${PORT}`);

// 2. Launch Chrome
const userDataDir = `/tmp/chrome_test_profile_${Date.now()}`;
fs.mkdirSync(userDataDir, { recursive: true });

const chromeProc = spawn('/usr/bin/google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${CHROME_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--disable-extensions',
  `http://127.0.0.1:${PORT}/index.html`
], { stdio: 'ignore' });

// 3. Find our page target
async function getTargetWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const target = list.find((t) => t.url && t.url.includes(`127.0.0.1:${PORT}`));
        if (target && target.webSocketDebuggerUrl) {
          return target.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Could not find page target in Chrome');
}

const wsUrl = await getTargetWsUrl();
console.log('Connected to target WebSocket:', wsUrl);

const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let msgId = 1;
const pending = new Map();
let currentContextId = null;

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.executionContextCreated') {
    currentContextId = data.params.context.id;
  }
  if (data.method === 'Runtime.consoleAPICalled') {
    const args = data.params.args.map((a) => (a.value !== undefined ? a.value : a.description || ''));
    console.log(`[Browser Console ${data.params.type}]`, ...args);
  } else if (data.method === 'Runtime.exceptionThrown') {
    console.error('[Browser Exception]', JSON.stringify(data.params.exceptionDetails));
  }

  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(data.error);
    else resolve(data.result);
  }
};

function sendCDP(method, params = {}) {
  const id = msgId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await sendCDP('Page.enable');
await sendCDP('Runtime.enable');

async function evaluate(expression) {
  const params = {
    expression,
    returnByValue: true,
    awaitPromise: true
  };
  if (currentContextId) {
    params.contextId = currentContextId;
  }
  const res = await sendCDP('Runtime.evaluate', params);
  if (res.exceptionDetails) {
    throw new Error('JS Evaluation Exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result ? res.result.value : undefined;
}

// Wait for Wasm ready
console.log('Waiting for WebAssembly module initialization...');
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const statusText = await evaluate(`document.getElementById('wasmStatusText')?.textContent || ''`);
    if (statusText && statusText.includes('Ready')) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

if (!ready) {
  const statusText = await evaluate(`document.getElementById('wasmStatusText')?.textContent || ''`);
  throw new Error(`Wasm failed to initialize: ${statusText}`);
}
console.log('✓ WebAssembly module successfully initialized in browser!');

// Wait a moment for sample image to generate and transcode
await new Promise((r) => setTimeout(r, 600));

// Test 1: Verify Initial Canvas & Stats
console.log('\n--- Test 1: Verify Canvas Rendering & Stats ---');
const initialStats = await evaluate(`(() => {
  const inC = document.getElementById('inputCanvas');
  const outC = document.getElementById('outputCanvas');
  const inCtx = inC.getContext('2d');
  const outCtx = outC.getContext('2d');
  const inPixels = inCtx.getImageData(0, 0, inC.width, inC.height).data;
  const outPixels = outCtx.getImageData(0, 0, outC.width, outC.height).data;
  const totalTime = document.getElementById('statTotalTime').textContent;
  const inDim = document.getElementById('inputDimensions').textContent;
  const outDim = document.getElementById('outputDimensions').textContent;

  return {
    inWidth: inC.width,
    inHeight: inC.height,
    outWidth: outC.width,
    outHeight: outC.height,
    inPixelNonZero: inPixels.some(x => x > 0),
    outPixelNonZero: outPixels.some(x => x > 0),
    totalTime,
    inDim,
    outDim
  };
})()`);

console.log('Initial stats:', JSON.stringify(initialStats, null, 2));
if (!initialStats.inPixelNonZero || !initialStats.outPixelNonZero) {
  throw new Error('Canvas pixel buffer is empty');
}
console.log('✓ Canvas rendered properly with C++ processing time:', initialStats.totalTime);

// Test 2: Test Transcoding Formats
for (const fmt of ['jpeg', 'png', 'bmp', 'tga', 'qoi', 'rgba']) {
  console.log(`\n--- Test Format Transcode: ${fmt.toUpperCase()} ---`);
  await evaluate(`(() => {
    const sel = document.getElementById('formatSelect');
    sel.value = '${fmt}';
    sel.dispatchEvent(new Event('change'));
    document.getElementById('btnTranscode').click();
  })()`);
  await new Promise((r) => setTimeout(r, 200));

  const res = await evaluate(`(() => {
    const outC = document.getElementById('outputCanvas');
    const totalTime = document.getElementById('statTotalTime').textContent;
    const sizeBadge = document.getElementById('outputFileSize').textContent;
    const fmtBadge = document.getElementById('outputFormatBadge').textContent;
    const downloadDisabled = document.getElementById('btnDownload').disabled;
    return { width: outC.width, height: outC.height, totalTime, sizeBadge, fmtBadge, downloadDisabled };
  })()`);

  console.log(`Result for ${fmt}:`, JSON.stringify(res));
  if (res.downloadDisabled) throw new Error(`Download disabled for ${fmt}`);
  console.log(`✓ ${fmt.toUpperCase()} format transcode succeeded (${res.totalTime})`);
}

// Test 3: Filters & Effects
console.log('\n--- Test 3: Image Filters & Manipulations ---');

// Grayscale
console.log('Testing Grayscale filter...');
const grayOk = await evaluate(`(() => {
  document.getElementById('btnGrayscale').click();
  const outC = document.getElementById('outputCanvas');
  const ctx = outC.getContext('2d');
  const p = ctx.getImageData(0, 0, outC.width, outC.height).data;
  let ok = true;
  for (let i = 0; i < 50; i++) {
    const idx = i * 4 * 7;
    if (p[idx] !== p[idx + 1] || p[idx] !== p[idx + 2]) {
      ok = false;
      break;
    }
  }
  document.getElementById('btnGrayscale').click();
  return ok;
})()`);
if (!grayOk) throw new Error('Grayscale filter failed');
console.log('✓ Grayscale filter verified');

// Rotation
console.log('Testing Rotation 90° CW...');
const rotateOk = await evaluate(`(() => {
  const inC = document.getElementById('inputCanvas');
  const origW = inC.width;
  const origH = inC.height;
  document.getElementById('btnRotCW').click();
  const outC = document.getElementById('outputCanvas');
  const ok = (outC.width === origH && outC.height === origW);
  document.getElementById('btnRotCCW').click();
  return ok;
})()`);
if (!rotateOk) throw new Error('Rotation failed');
console.log('✓ Rotation verified');

// Resizing
console.log('Testing Resizing to 256×256...');
const resizeOk = await evaluate(`(() => {
  const wInput = document.getElementById('targetWidth');
  const hInput = document.getElementById('targetHeight');
  wInput.value = '256';
  hInput.value = '256';
  wInput.dispatchEvent(new Event('input'));
  document.getElementById('btnTranscode').click();
  const outC = document.getElementById('outputCanvas');
  const ok = (outC.width === 256 && outC.height === 256);
  wInput.value = '';
  hInput.value = '';
  document.getElementById('btnScale100').click();
  return ok;
})()`);
if (!resizeOk) throw new Error('Resize failed');
console.log('✓ Resizing verified');

// Gaussian Blur
console.log('Testing Gaussian Blur effect...');
const blurOk = await evaluate(`(() => {
  const sel = document.getElementById('effectSelect');
  sel.value = 'gaussian_blur';
  sel.dispatchEvent(new Event('change'));
  document.getElementById('btnTranscode').click();
  const time = document.getElementById('statTotalTime').textContent;
  sel.value = 'none';
  sel.dispatchEvent(new Event('change'));
  return time.includes('ms');
})()`);
if (!blurOk) throw new Error('Gaussian blur failed');
console.log('✓ Gaussian blur effect verified');

// Sobel Edge Detection
console.log('Testing Sobel Edge Detection effect...');
const sobelOk = await evaluate(`(() => {
  const sel = document.getElementById('effectSelect');
  sel.value = 'sobel_edges';
  sel.dispatchEvent(new Event('change'));
  document.getElementById('btnTranscode').click();
  const outC = document.getElementById('outputCanvas');
  const ctx = outC.getContext('2d');
  const p = ctx.getImageData(0, 0, outC.width, outC.height).data;
  sel.value = 'none';
  sel.dispatchEvent(new Event('change'));
  return p.some(x => x > 0);
})()`);
if (!sobelOk) throw new Error('Sobel edges failed');
console.log('✓ Sobel edge detection verified');

// Capture final screenshot
console.log('\n--- Capturing Headless Browser Screenshot ---');
const screenshot = await sendCDP('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(__dirname, 'screenshot.png'), Buffer.from(screenshot.data, 'base64'));
console.log('✓ Screenshot saved to screenshot.png');

console.log('\n======================================================');
console.log('🎉 ALL TESTS PASSED SUCCESSFULLY IN REAL HEADLESS CHROME!');
console.log('======================================================\n');

ws.close();
chromeProc.kill('SIGKILL');
server.close();
try {
  fs.rmSync(userDataDir, { recursive: true, force: true });
} catch {}
process.exit(0);
