import createModule from './module.mjs';

// State
let directModule = null;
let worker = null;
let currentFile = null;
let currentBuffer = null;
let currentResult = null;
let currentMode = 'compress'; // 'compress', 'decompress', 'benchmark'
let messageCounter = 0;
const pendingMessages = new Map();

// Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfoBox = document.getElementById('fileInfoBox');
const fileName = document.getElementById('fileName');
const fileMeta = document.getElementById('fileMeta');
const btnRemoveFile = document.getElementById('btnRemoveFile');

const tabCompress = document.getElementById('tabCompress');
const tabDecompress = document.getElementById('tabDecompress');
const tabBenchmark = document.getElementById('tabBenchmark');

const compressOptions = document.getElementById('compressOptions');
const decompressOptions = document.getElementById('decompressOptions');
const benchmarkOptions = document.getElementById('benchmarkOptions');

const selectAlgo = document.getElementById('selectAlgo');
const algoDesc = document.getElementById('algoDesc');
const rangeLevel = document.getElementById('rangeLevel');
const levelVal = document.getElementById('levelVal');
const chkHeader = document.getElementById('chkHeader');

const selectDecompAlgo = document.getElementById('selectDecompAlgo');
const detectedFormatBadge = document.getElementById('detectedFormatBadge');

const btnAction = document.getElementById('btnAction');
const btnActionText = document.getElementById('btnActionText');
const spinner = document.getElementById('spinner');
const btnReset = document.getElementById('btnReset');

const alertBox = document.getElementById('alertBox');
const alertMsg = document.getElementById('alertMsg');

const statsSection = document.getElementById('statsSection');
const statOrigSize = document.getElementById('statOrigSize');
const statOrigBytes = document.getElementById('statOrigBytes');
const statOutSize = document.getElementById('statOutSize');
const statOutBytes = document.getElementById('statOutBytes');
const statRatio = document.getElementById('statRatio');
const statSavings = document.getElementById('statSavings');
const statDuration = document.getElementById('statDuration');
const statSpeed = document.getElementById('statSpeed');
const ratioBarFilled = document.getElementById('ratioBarFilled');

const downloadCard = document.getElementById('downloadCard');
const downloadFilename = document.getElementById('downloadFilename');
const btnDownload = document.getElementById('btnDownload');
const benchmarkSection = document.getElementById('benchmarkSection');
const benchmarkTbody = document.getElementById('benchmarkTbody');

// Sample file generator buttons
const btnSampleText = document.getElementById('btnSampleText');
const btnSampleJson = document.getElementById('btnSampleJson');
const btnSampleBinary = document.getElementById('btnSampleBinary');

// Initialize WebAssembly Engine
async function initEngine() {
  try {
    statusText.textContent = 'Loading Wasm Engine...';

    // Try starting Web Worker first
    if (window.Worker) {
      try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = handleWorkerMessage;
        worker.onerror = (err) => {
          console.warn('Worker error, falling back to main thread Wasm:', err);
          initDirectModule();
        };

        const readyRes = await sendWorkerMessage('init');
        populateAlgorithms(readyRes.algorithms);
        onEngineReady('WebAssembly Worker Ready');
        return;
      } catch (workerErr) {
        console.warn('Failed to start worker, using main thread:', workerErr);
      }
    }

    await initDirectModule();
  } catch (err) {
    console.error('Wasm init error:', err);
    statusDot.className = 'status-dot';
    statusText.textContent = 'Failed to load Wasm: ' + err.message;
    showAlert('Failed to initialize WebAssembly: ' + err.message, 'danger');
  }
}

async function initDirectModule() {
  directModule = await createModule();
  const algos = directModule.getAvailableAlgorithms();
  populateAlgorithms(algos);
  onEngineReady('WebAssembly Engine Ready (Main Thread)');
}

function onEngineReady(msg) {
  statusDot.className = 'status-dot ready';
  statusText.textContent = msg;
  updateActionBtnState();
}

function handleWorkerMessage(e) {
  const { type, id, payload, error } = e.data;
  if (pendingMessages.has(id)) {
    const { resolve, reject } = pendingMessages.get(id);
    pendingMessages.delete(id);
    if (error) {
      reject(new Error(error));
    } else {
      resolve(payload);
    }
  }
}

function sendWorkerMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageCounter;
    pendingMessages.set(id, { resolve, reject });
    worker.postMessage({ type, id, payload });
  });
}

function populateAlgorithms(algos) {
  if (!algos || !algos.length) return;
  selectAlgo.innerHTML = '';
  algos.forEach(algo => {
    const opt = document.createElement('option');
    opt.value = algo.id;
    opt.textContent = `${algo.name}`;
    opt.dataset.desc = algo.description;
    opt.dataset.default = algo.defaultLevel;
    opt.dataset.min = algo.minLevel;
    opt.dataset.max = algo.maxLevel;
    selectAlgo.appendChild(opt);
  });
  updateAlgorithmSelection();
}

function updateAlgorithmSelection() {
  const selectedOpt = selectAlgo.options[selectAlgo.selectedIndex];
  if (!selectedOpt) return;

  algoDesc.textContent = selectedOpt.dataset.desc || '';
  const min = parseInt(selectedOpt.dataset.min || '1', 10);
  const max = parseInt(selectedOpt.dataset.max || '9', 10);
  const def = parseInt(selectedOpt.dataset.default || '3', 10);

  rangeLevel.min = min;
  rangeLevel.max = max;
  rangeLevel.value = def;
  rangeLevel.disabled = (min === max);
  levelVal.textContent = rangeLevel.value;
}

// Format bytes helper
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Mode Switcher
function setMode(mode) {
  currentMode = mode;
  tabCompress.classList.toggle('active', mode === 'compress');
  tabDecompress.classList.toggle('active', mode === 'decompress');
  tabBenchmark.classList.toggle('active', mode === 'benchmark');

  compressOptions.style.display = mode === 'compress' ? 'block' : 'none';
  decompressOptions.style.display = mode === 'decompress' ? 'block' : 'none';
  benchmarkOptions.style.display = mode === 'benchmark' ? 'block' : 'none';

  if (mode === 'compress') {
    btnActionText.textContent = 'Compress File';
  } else if (mode === 'decompress') {
    btnActionText.textContent = 'Decompress File';
    if (currentBuffer) {
      checkFileFormat(currentBuffer);
    }
  } else if (mode === 'benchmark') {
    btnActionText.textContent = 'Run All Benchmarks';
  }

  hideAlert();
  statsSection.classList.remove('visible');
  benchmarkSection.style.display = 'none';
  updateActionBtnState();
}

tabCompress.addEventListener('click', () => setMode('compress'));
tabDecompress.addEventListener('click', () => setMode('decompress'));
tabBenchmark.addEventListener('click', () => setMode('benchmark'));

selectAlgo.addEventListener('change', updateAlgorithmSelection);
rangeLevel.addEventListener('input', () => {
  levelVal.textContent = rangeLevel.value;
});

// File Handling
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    loadFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) {
    loadFile(fileInput.files[0]);
  }
});

btnRemoveFile.addEventListener('click', (e) => {
  e.stopPropagation();
  resetFile();
});

btnReset.addEventListener('click', resetFile);

function resetFile() {
  currentFile = null;
  currentBuffer = null;
  currentResult = null;
  fileInput.value = '';
  fileInfoBox.classList.remove('visible');
  dropzone.style.display = 'block';
  statsSection.classList.remove('visible');
  benchmarkSection.style.display = 'none';
  detectedFormatBadge.textContent = 'Auto-detecting...';
  hideAlert();
  updateActionBtnState();
}

async function loadFile(file) {
  try {
    currentFile = file;
    const arrayBuf = await file.arrayBuffer();
    currentBuffer = new Uint8Array(arrayBuf);

    fileName.textContent = file.name;
    fileMeta.textContent = `${formatBytes(file.size)} (${file.size.toLocaleString()} bytes) • ${file.type || 'binary/raw'}`;

    dropzone.style.display = 'none';
    fileInfoBox.classList.add('visible');

    hideAlert();
    statsSection.classList.remove('visible');
    benchmarkSection.style.display = 'none';

    // If in decompress mode or auto-detecting
    checkFileFormat(currentBuffer);
    updateActionBtnState();
  } catch (err) {
    showAlert('Error reading file: ' + err.message, 'danger');
  }
}

async function checkFileFormat(uint8Data) {
  try {
    let fmt = 'auto';
    if (worker) {
      const res = await sendWorkerMessage('detect', { data: uint8Data });
      fmt = res.format;
    } else if (directModule) {
      fmt = directModule.detectFormat(uint8Data);
    }
    if (fmt && fmt !== 'auto') {
      detectedFormatBadge.textContent = `Detected Format: ${fmt.toUpperCase()}`;
      detectedFormatBadge.style.color = 'var(--success)';
      selectDecompAlgo.value = fmt;
    } else {
      detectedFormatBadge.textContent = 'Format: Unknown / Raw stream (Select manually if needed)';
      detectedFormatBadge.style.color = 'var(--text-muted)';
      selectDecompAlgo.value = 'auto';
    }
  } catch (err) {
    console.warn('Format detection error:', err);
  }
}

function updateActionBtnState() {
  const hasEngine = (worker !== null || directModule !== null);
  const hasFile = (currentBuffer !== null && currentBuffer.length >= 0);
  btnAction.disabled = !(hasEngine && hasFile);
}

// Sample Data Generators
btnSampleText.addEventListener('click', () => {
  const sample = "The quick brown fox jumps over the lazy dog.\n".repeat(2500);
  const data = new TextEncoder().encode(sample);
  loadSampleBuffer('sample-lorem.txt', 'text/plain', data);
});

btnSampleJson.addEventListener('click', () => {
  const records = [];
  for (let i = 1; i <= 3000; i++) {
    records.push({
      id: i,
      event: 'user_login_attempt',
      timestamp: 1787805000 + i * 10,
      user: `user_${i % 50}@example.com`,
      ip: `192.168.1.${i % 254}`,
      status: i % 7 === 0 ? 'FAILED' : 'SUCCESS',
      metadata: { browser: 'Chrome', platform: 'WebAssembly', session: `sess_${i}` }
    });
  }
  const jsonStr = JSON.stringify(records, null, 2);
  const data = new TextEncoder().encode(jsonStr);
  loadSampleBuffer('sample-log.json', 'application/json', data);
});

btnSampleBinary.addEventListener('click', () => {
  const size = 512 * 1024; // 512KB
  const buf = new Uint8Array(size);
  // Repeating pseudo-random gradient pattern
  for (let i = 0; i < size; i++) {
    buf[i] = ((i % 256) ^ ((i >> 8) % 256)) & 0xFF;
  }
  loadSampleBuffer('sample-pattern.bin', 'application/octet-stream', buf);
});

function loadSampleBuffer(name, type, uint8Array) {
  const file = new File([uint8Array], name, { type });
  loadFile(file);
}

// Execute Compression / Decompression / Benchmark
btnAction.addEventListener('click', async () => {
  if (!currentBuffer) return;

  hideAlert();
  setBusy(true);

  try {
    if (currentMode === 'compress') {
      await runCompression();
    } else if (currentMode === 'decompress') {
      await runDecompression();
    } else if (currentMode === 'benchmark') {
      await runBenchmark();
    }
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    setBusy(false);
  }
});

async function runCompression() {
  const format = selectAlgo.value;
  const level = parseInt(rangeLevel.value, 10);
  const includeHeader = chkHeader.checked;

  let result;
  if (worker) {
    result = await sendWorkerMessage('compress', {
      data: currentBuffer,
      format,
      level,
      includeHeader
    });
  } else {
    result = directModule.compress(currentBuffer, format, level, includeHeader);
  }

  if (!result.success) {
    throw new Error(result.error || 'Compression failed');
  }

  currentResult = result;
  renderStats(result, 'compressed');
  setupDownload(result.data, getCompressedFilename(currentFile ? currentFile.name : 'compressed', format, includeHeader));
  showAlert(`Successfully compressed using ${format.toUpperCase()} in ${result.durationMs.toFixed(2)} ms!`, 'success');
}

async function runDecompression() {
  const format = selectDecompAlgo.value;

  let result;
  if (worker) {
    result = await sendWorkerMessage('decompress', {
      data: currentBuffer,
      format
    });
  } else {
    result = directModule.decompress(currentBuffer, format);
  }

  if (!result.success) {
    throw new Error(result.error || 'Decompression failed');
  }

  currentResult = result;
  renderStats(result, 'decompressed');
  setupDownload(result.data, getDecompressedFilename(currentFile ? currentFile.name : 'decompressed_file'));
  showAlert(`Successfully decompressed (${result.format.toUpperCase()}) in ${result.durationMs.toFixed(2)} ms!`, 'success');
}

async function runBenchmark() {
  let res;
  if (worker) {
    res = await sendWorkerMessage('benchmark', { data: currentBuffer });
  } else {
    const algos = ['zstd', 'zlib', 'lz4', 'rle'];
    const list = [];
    for (const algo of algos) {
      const comp = directModule.compress(currentBuffer, algo, 3, true);
      const decomp = comp.success ? directModule.decompress(comp.data, 'auto') : null;
      list.push({
        algorithm: algo,
        compressResult: comp,
        decompressResult: decomp
      });
    }
    res = { results: list };
  }

  renderBenchmarkResults(res.results);
  showAlert('All compression benchmarks completed!', 'success');
}

function renderStats(res, mode) {
  statsSection.classList.add('visible');

  statOrigSize.textContent = formatBytes(res.originalSize);
  statOrigBytes.textContent = `${res.originalSize.toLocaleString()} bytes`;

  statOutSize.textContent = formatBytes(res.processedSize);
  statOutBytes.textContent = `${res.processedSize.toLocaleString()} bytes`;

  if (mode === 'compressed') {
    const ratio = res.compressionRatio;
    statRatio.textContent = ratio > 0 ? (1 / ratio).toFixed(2) + 'x' : '1.00x';
    statSavings.textContent = `${res.spaceSavings.toFixed(1)}% smaller`;

    // Fill ratio bar
    const pct = Math.min(100, Math.max(0, (res.processedSize / res.originalSize) * 100));
    ratioBarFilled.style.width = `${pct}%`;
  } else {
    statRatio.textContent = `${(res.processedSize / res.originalSize).toFixed(2)}x`;
    statSavings.textContent = 'Expanded';
    ratioBarFilled.style.width = '100%';
  }

  statDuration.textContent = `${res.durationMs.toFixed(2)} ms`;

  // Calculate throughput in MB/s
  if (res.durationMs > 0 && res.originalSize > 0) {
    const mb = res.originalSize / (1024 * 1024);
    const sec = res.durationMs / 1000;
    const mbPerSec = mb / sec;
    statSpeed.textContent = `${mbPerSec.toFixed(1)} MB/s`;
  } else {
    statSpeed.textContent = 'Instant';
  }
}

function setupDownload(uint8Data, filename) {
  downloadFilename.textContent = filename;

  btnDownload.onclick = () => {
    const blob = new Blob([uint8Data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}

function renderBenchmarkResults(results) {
  benchmarkSection.style.display = 'block';
  benchmarkTbody.innerHTML = '';

  let minSize = Infinity;
  let minSizeAlgo = null;
  let minDuration = Infinity;
  let fastestAlgo = null;

  results.forEach(r => {
    if (r.compressResult.success) {
      if (r.compressResult.processedSize < minSize) {
        minSize = r.compressResult.processedSize;
        minSizeAlgo = r.algorithm;
      }
      if (r.compressResult.durationMs < minDuration) {
        minDuration = r.compressResult.durationMs;
        fastestAlgo = r.algorithm;
      }
    }
  });

  results.forEach(r => {
    const tr = document.createElement('tr');
    const comp = r.compressResult;
    const isSmallest = r.algorithm === minSizeAlgo;
    const isFastest = r.algorithm === fastestAlgo;

    const mb = comp.originalSize / (1024 * 1024);
    const sec = comp.durationMs / 1000;
    const speed = comp.durationMs > 0 ? (mb / sec).toFixed(1) + ' MB/s' : 'Instant';

    tr.innerHTML = `
      <td>
        <strong>${r.algorithm.toUpperCase()}</strong>
        ${isSmallest ? '<span class="badge-winner">Smallest 🏆</span>' : ''}
        ${isFastest ? '<span class="badge-fastest">Fastest ⚡</span>' : ''}
      </td>
      <td>${formatBytes(comp.processedSize)} (${comp.processedSize.toLocaleString()} B)</td>
      <td>${comp.spaceSavings.toFixed(1)}%</td>
      <td>${comp.durationMs.toFixed(2)} ms</td>
      <td>${speed}</td>
      <td>${r.decompressResult && r.decompressResult.success ? r.decompressResult.durationMs.toFixed(2) + ' ms' : 'N/A'}</td>
    `;
    benchmarkTbody.appendChild(tr);
  });
}

function getCompressedFilename(origName, format, hasHeader) {
  const extMap = { zstd: '.zst', zlib: '.gz', lz4: '.lz4', rle: '.rle' };
  const ext = hasHeader ? '.wcmp' : (extMap[format] || `.${format}`);
  return `${origName}${ext}`;
}

function getDecompressedFilename(currentName) {
  const knownExts = ['.wcmp', '.zst', '.gz', '.zlib', '.lz4', '.rle'];
  for (const ext of knownExts) {
    if (currentName.endsWith(ext)) {
      return currentName.substring(0, currentName.length - ext.length);
    }
  }
  return `${currentName}.decompressed`;
}

function setBusy(busy) {
  btnAction.disabled = busy;
  spinner.style.display = busy ? 'inline-block' : 'none';
}

function showAlert(message, type = 'danger') {
  alertMsg.textContent = message;
  alertBox.className = `alert alert-${type} visible`;
}

function hideAlert() {
  alertBox.className = 'alert';
}

// Start application
initEngine();
