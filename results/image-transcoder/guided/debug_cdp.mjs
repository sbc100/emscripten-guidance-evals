import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const server = http.createServer((req, res) => {
  console.log('--> Request:', req.url);
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = '.' + reqPath;
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = reqPath.split('.').pop();
  const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
});

server.listen(8099, '127.0.0.1', async () => {
  const ud = '/tmp/cdp_debug_' + Date.now();
  const cp = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=9333',
    '--user-data-dir=' + ud,
    'http://127.0.0.1:8099/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2500));
  const listRes = await fetch('http://127.0.0.1:9333/json/list');
  const list = await listRes.json();
  const target = list.find(t => t.url.includes('8099'));
  console.log('Target found:', target.url, target.webSocketDebuggerUrl);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onopen = () => {
    console.log('WS Opened');
    ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'http://127.0.0.1:8099/index.html' } }));
  };

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.method === 'Page.loadEventFired') {
      console.log('Page Load Event Fired!');
      ws.send(JSON.stringify({
        id: 10,
        method: 'Runtime.evaluate',
        params: {
          expression: `({
            url: document.location.href,
            title: document.title,
            statusText: document.getElementById('wasmStatusText')?.textContent,
            htmlLength: document.body.innerHTML.length
          })`,
          returnByValue: true
        }
      }));
    }
    console.log('WS Message:', e.data);
  };

  setTimeout(() => {
    ws.close();
    cp.kill();
    server.close();
  }, 4000);
});
