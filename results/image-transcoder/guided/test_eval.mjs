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

const server = http.createServer((req, res) => {
  console.log('HTTP:', req.url);
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const ud = `/tmp/test_cdp_eval_${Date.now()}`;
const cp = spawn('/usr/bin/google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${CHROME_PORT}`,
  `--user-data-dir=${ud}`,
  '--disable-extensions',
  `http://127.0.0.1:${PORT}/index.html`
], { stdio: 'ignore' });

await new Promise((r) => setTimeout(r, 2000));
const listRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/list`);
const list = await listRes.json();
const target = list.find((t) => t.url && t.url.includes(`127.0.0.1:${PORT}`));

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let id = 1;
function send(method, params = {}) {
  const curId = id++;
  return new Promise((resolve) => {
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(msg);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });
}

ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') {
    console.log('[Console]', ...m.params.args.map(a => a.value || a.description));
  }
};

console.log('Sending Runtime.enable...');
await send('Runtime.enable');

console.log('Setting window.location.href to http://127.0.0.1:' + PORT + '/index.html ...');
await send('Runtime.evaluate', { expression: `window.location.href = "http://127.0.0.1:${PORT}/index.html"` });

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const r = await send('Runtime.evaluate', {
    expression: `({
      href: window.location.href,
      status: document.getElementById('wasmStatusText')?.textContent,
      canvas: !!document.getElementById('inputCanvas'),
      time: document.getElementById('statTotalTime')?.textContent
    })`,
    returnByValue: true
  });
  console.log('Poll', i, JSON.stringify(r.result?.result?.value));
  if (r.result?.result?.value?.status?.includes('Ready')) break;
}

ws.close();
cp.kill('SIGKILL');
server.close();
