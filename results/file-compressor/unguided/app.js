import createCompressorModule from './module.mjs';

// Application State
const state = {
    module: null,
    currentMode: 'compress', // 'compress' | 'decompress' | 'benchmark'
    currentFile: null,       // { name, size, type, buffer: Uint8Array }
    resultData: null,       // Uint8Array
    resultMeta: null,       // { format, durationMs, originalSize, outputSize, ... }
    supportedAlgorithms: []
};

// DOM Elements
const el = {
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('engine-status-text'),
    tabCompress: document.getElementById('tab-compress'),
    tabDecompress: document.getElementById('tab-decompress'),
    tabBenchmark: document.getElementById('tab-benchmark'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    btnBrowse: document.getElementById('btn-browse'),
    fileInfoBanner: document.getElementById('file-info-banner'),
    fileName: document.getElementById('file-name'),
    fileMeta: document.getElementById('file-meta'),
    btnRemoveFile: document.getElementById('btn-remove-file'),
    btnSampleText: document.getElementById('btn-sample-text'),
    btnSampleJson: document.getElementById('btn-sample-json'),
    btnSampleBinary: document.getElementById('btn-sample-binary'),
    groupAlgorithm: document.getElementById('group-algorithm'),
    algoSelect: document.getElementById('algo-select'),
    algoDesc: document.getElementById('algo-desc'),
    groupDecompressFormat: document.getElementById('group-decompress-format'),
    decompressFormatSelect: document.getElementById('decompress-format-select'),
    detectedFormatBadge: document.getElementById('detected-format-badge'),
    groupLevel: document.getElementById('group-level'),
    levelSlider: document.getElementById('level-slider'),
    levelBadge: document.getElementById('level-badge'),
    btnProcess: document.getElementById('btn-process'),
    btnProcessText: document.getElementById('btn-process-text'),
    resultStatusTag: document.getElementById('result-status-tag'),
    statOrigSize: document.getElementById('stat-orig-size'),
    statOrigBytes: document.getElementById('stat-orig-bytes'),
    statOutSize: document.getElementById('stat-out-size'),
    statOutBytes: document.getElementById('stat-out-bytes'),
    statRatio: document.getElementById('stat-ratio'),
    statFactor: document.getElementById('stat-factor'),
    statTime: document.getElementById('stat-time'),
    statSpeed: document.getElementById('stat-speed'),
    barLabelOrig: document.getElementById('bar-label-orig'),
    barLabelComp: document.getElementById('bar-label-comp'),
    barFill: document.getElementById('bar-fill'),
    btnDownload: document.getElementById('btn-download'),
    downloadBtnText: document.getElementById('download-btn-text'),
    benchmarkContainer: document.getElementById('benchmark-container'),
    benchmarkTbody: document.getElementById('benchmark-tbody'),
    btnToggleHex: document.getElementById('btn-toggle-hex'),
    hexContent: document.getElementById('hex-content'),
    hexInputView: document.getElementById('hex-input-view'),
    hexOutputView: document.getElementById('hex-output-view')
};

// --- Initialization ---

async function init() {
    setupEventListeners();
    try {
        el.statusText.textContent = 'Initializing WebAssembly Engine...';
        state.module = await createCompressorModule();
        state.supportedAlgorithms = state.module.getSupportedAlgorithms();

        el.statusDot.className = 'status-dot active';
        el.statusText.textContent = 'WebAssembly Ready (LZ4, Zlib, RLE)';
        updateUiForFileState();
    } catch (err) {
        console.error('Failed to initialize WebAssembly module:', err);
        el.statusDot.className = 'status-dot error';
        el.statusText.textContent = 'Failed to load WebAssembly';
        showToast('Failed to initialize WebAssembly engine: ' + err.message, 'error');
    }
}

// --- Event Listeners ---

function setupEventListeners() {
    // Mode tabs
    el.tabCompress.addEventListener('click', () => setMode('compress'));
    el.tabDecompress.addEventListener('click', () => setMode('decompress'));
    el.tabBenchmark.addEventListener('click', () => setMode('benchmark'));

    // Drag & Drop
    el.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.dropZone.classList.add('drag-over');
    });
    el.dropZone.addEventListener('dragleave', () => {
        el.dropZone.classList.remove('drag-over');
    });
    el.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            loadFile(e.dataTransfer.files[0]);
        }
    });
    el.dropZone.addEventListener('click', (e) => {
        if (e.target !== el.btnBrowse && !e.target.closest('#btn-browse')) {
            el.fileInput.click();
        }
    });
    el.dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.fileInput.click();
        }
    });

    el.btnBrowse.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            loadFile(e.target.files[0]);
        }
    });

    el.btnRemoveFile.addEventListener('click', clearFile);

    // Sample data buttons
    el.btnSampleText.addEventListener('click', loadSampleText);
    el.btnSampleJson.addEventListener('click', loadSampleJson);
    el.btnSampleBinary.addEventListener('click', loadSampleBinary);

    // Form inputs
    el.algoSelect.addEventListener('change', onAlgorithmChange);
    el.levelSlider.addEventListener('input', onLevelChange);
    el.decompressFormatSelect.addEventListener('change', onDecompressFormatChange);

    // Process button
    el.btnProcess.addEventListener('click', executeProcess);

    // Download button
    el.btnDownload.addEventListener('click', triggerDownload);

    // Hex toggle
    el.btnToggleHex.addEventListener('click', () => {
        const isHidden = el.hexContent.classList.contains('hidden');
        if (isHidden) {
            el.hexContent.classList.remove('hidden');
            el.btnToggleHex.textContent = 'Hide Hex';
        } else {
            el.hexContent.classList.add('hidden');
            el.btnToggleHex.textContent = 'Show Hex';
        }
    });
}

// --- Mode Management ---

function setMode(mode) {
    state.currentMode = mode;

    el.tabCompress.classList.toggle('active', mode === 'compress');
    el.tabCompress.setAttribute('aria-selected', mode === 'compress');

    el.tabDecompress.classList.toggle('active', mode === 'decompress');
    el.tabDecompress.setAttribute('aria-selected', mode === 'decompress');

    el.tabBenchmark.classList.toggle('active', mode === 'benchmark');
    el.tabBenchmark.setAttribute('aria-selected', mode === 'benchmark');

    if (mode === 'compress') {
        el.groupAlgorithm.classList.remove('hidden');
        el.groupLevel.classList.remove('hidden');
        el.groupDecompressFormat.classList.add('hidden');
        el.benchmarkContainer.classList.add('hidden');
        onAlgorithmChange();
    } else if (mode === 'decompress') {
        el.groupAlgorithm.classList.add('hidden');
        el.groupLevel.classList.add('hidden');
        el.groupDecompressFormat.classList.remove('hidden');
        el.benchmarkContainer.classList.add('hidden');
        updateDetectedFormatBadge();
    } else if (mode === 'benchmark') {
        el.groupAlgorithm.classList.add('hidden');
        el.groupLevel.classList.add('hidden');
        el.groupDecompressFormat.classList.add('hidden');
        el.benchmarkContainer.classList.remove('hidden');
    }

    updateUiForFileState();
}

// --- File Handling ---

function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = new Uint8Array(e.target.result);
        state.currentFile = {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            buffer: buffer
        };

        // Auto-switch mode based on file extension
        const ext = file.name.split('.').pop().toLowerCase();
        if (['gz', 'lz4', 'zlib', 'rle'].includes(ext) && state.currentMode === 'compress') {
            setMode('decompress');
        }

        renderLoadedFileInfo();
        updateDetectedFormatBadge();
        updateHexViews();
        updateUiForFileState();
    };
    reader.readAsArrayBuffer(file);
}

function loadSampleData(name, buffer, type = 'text/plain') {
    state.currentFile = {
        name: name,
        size: buffer.length,
        type: type,
        buffer: buffer
    };
    renderLoadedFileInfo();
    updateDetectedFormatBadge();
    updateHexViews();
    updateUiForFileState();
}

function loadSampleText() {
    const sample = `[2026-08-27T04:12:00.102Z] INFO  [ServerEngine] Initializing WebAssembly File Compressor v2.0
[2026-08-27T04:12:00.105Z] INFO  [MemoryManager] Allocating 64MB initial memory slab
[2026-08-27T04:12:00.120Z] DEBUG [CodecLoader] LZ4 Frame codec loaded (C library v1.9.4)
[2026-08-27T04:12:00.125Z] DEBUG [CodecLoader] Zlib Deflate/Gzip codec loaded (C library v1.3.1)
[2026-08-27T04:12:00.130Z] DEBUG [CodecLoader] Custom RLE PackBits codec initialized
[2026-08-27T04:12:01.000Z] INFO  [Benchmark] Starting throughput evaluation on standard test sets
[2026-08-27T04:12:01.050Z] INFO  [Benchmark] LZ4 compression throughput: 540.2 MB/s
[2026-08-27T04:12:01.080Z] INFO  [Benchmark] GZIP compression throughput: 185.7 MB/s
[2026-08-27T04:12:01.110Z] INFO  [Benchmark] Verification pass: 100% roundtrip bit-exact match
`.repeat(30);
    const enc = new TextEncoder();
    loadSampleData('system_logs_sample.log', enc.encode(sample), 'text/plain');
}

function loadSampleJson() {
    const records = [];
    for (let i = 1; i <= 250; i++) {
        records.push({
            id: i,
            guid: `user-uuid-${i.toString().padStart(6, '0')}`,
            isActive: i % 2 === 0,
            tier: ['Free', 'Professional', 'Enterprise'][i % 3],
            metrics: {
                requests: i * 42,
                bandwidthMB: (i * 1.85).toFixed(2),
                compressionEnabled: true
            },
            tags: ['wasm', 'lz4', 'gzip', 'emscripten']
        });
    }
    const jsonStr = JSON.stringify({ dataset: 'user_metrics', timestamp: 1787720000, records: records }, null, 2);
    const enc = new TextEncoder();
    loadSampleData('users_dataset.json', enc.encode(jsonStr), 'application/json');
}

function loadSampleBinary() {
    // Generate a repetitive pattern with solid runs
    const len = 64 * 1024;
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        buf[i] = Math.floor(i / 512) % 256;
    }
    loadSampleData('bitmap_pattern.bin', buf, 'application/octet-stream');
}

function clearFile() {
    state.currentFile = null;
    state.resultData = null;
    state.resultMeta = null;
    el.fileInput.value = '';

    el.fileInfoBanner.classList.add('hidden');
    el.btnDownload.classList.add('hidden');
    resetStats();
    updateHexViews();
    updateUiForFileState();
}

function renderLoadedFileInfo() {
    if (!state.currentFile) return;
    el.fileName.textContent = state.currentFile.name;
    el.fileMeta.textContent = `${formatBytes(state.currentFile.size)} • ${state.currentFile.type}`;
    el.fileInfoBanner.classList.remove('hidden');
}

function updateDetectedFormatBadge() {
    if (!state.currentFile || !state.module) {
        el.detectedFormatBadge.innerHTML = 'Detected: <strong>Waiting for file</strong>';
        return;
    }
    const detected = state.module.detectFormat(state.currentFile.buffer);
    const formatLabels = {
        lz4: 'LZ4 Frame (.lz4)',
        gzip: 'GZIP (.gz)',
        zlib: 'ZLIB Stream (.zlib)',
        rle: 'RLE (.rle)',
        unknown: 'Unknown Format (Cannot auto-detect)'
    };
    const label = formatLabels[detected] || 'Unknown';
    el.detectedFormatBadge.innerHTML = `Detected Header: <strong style="color: ${detected !== 'unknown' ? '#10b981' : '#ef4444'}">${label}</strong>`;
}

// --- Form & Level Controls ---

function onAlgorithmChange() {
    const algoId = el.algoSelect.value;
    if (algoId === 'lz4') {
        el.algoDesc.textContent = 'Extremely fast compression using open-source LZ4 library (Default level 0, HC levels 1-12).';
        el.levelSlider.min = '0';
        el.levelSlider.max = '12';
        el.levelSlider.value = '0';
        el.levelBadge.textContent = 'Default (Ultra Fast)';
    } else if (algoId === 'gzip' || algoId === 'zlib') {
        el.algoDesc.textContent = 'Industry standard Deflate compression via open-source Zlib (Levels 1-9, Default 6).';
        el.levelSlider.min = '1';
        el.levelSlider.max = '9';
        el.levelSlider.value = '6';
        el.levelBadge.textContent = 'Level 6 (Balanced)';
    } else if (algoId === 'rle') {
        el.algoDesc.textContent = 'PackBits byte run-length encoding. Best for bitmaps, masks, and repetitive byte patterns.';
        el.levelSlider.min = '1';
        el.levelSlider.max = '1';
        el.levelSlider.value = '1';
        el.levelBadge.textContent = 'Fixed (1-pass)';
    }
}

function onLevelChange() {
    const val = parseInt(el.levelSlider.value, 10);
    const algoId = el.algoSelect.value;
    if (algoId === 'lz4') {
        el.levelBadge.textContent = val === 0 ? 'Default (Fast)' : `LZ4-HC Level ${val}`;
    } else if (algoId === 'gzip' || algoId === 'zlib') {
        if (val <= 3) el.levelBadge.textContent = `Level ${val} (Fast)`;
        else if (val <= 7) el.levelBadge.textContent = `Level ${val} (Balanced)`;
        else el.levelBadge.textContent = `Level ${val} (Maximum)`;
    } else {
        el.levelBadge.textContent = 'Fixed (1-pass)';
    }
}

function onDecompressFormatChange() {
    // When manual format is chosen
}

function updateUiForFileState() {
    const hasModule = Boolean(state.module);
    const hasFile = Boolean(state.currentFile);

    el.btnProcess.disabled = !hasModule || !hasFile;

    if (!hasFile) {
        el.btnProcessText.textContent = 'Select a File to Begin';
        el.resultStatusTag.textContent = 'Ready';
        el.resultStatusTag.className = 'status-tag ready';
    } else {
        if (state.currentMode === 'compress') {
            el.btnProcessText.textContent = `Compress File (${el.algoSelect.options[el.algoSelect.selectedIndex].text.split('—')[0].trim()})`;
        } else if (state.currentMode === 'decompress') {
            el.btnProcessText.textContent = 'Decompress File';
        } else if (state.currentMode === 'benchmark') {
            el.btnProcessText.textContent = 'Run Benchmark on All Algorithms';
        }
    }
}

// --- Execution & Processing ---

function executeProcess() {
    if (!state.module || !state.currentFile) return;

    el.btnProcess.disabled = true;
    el.resultStatusTag.textContent = 'Processing...';
    el.resultStatusTag.className = 'status-tag processing';

    // Allow UI to render loading state
    setTimeout(() => {
        try {
            if (state.currentMode === 'compress') {
                runCompression();
            } else if (state.currentMode === 'decompress') {
                runDecompression();
            } else if (state.currentMode === 'benchmark') {
                runBenchmark();
            }
        } catch (err) {
            console.error('Processing error:', err);
            handleError(err.message);
        } finally {
            el.btnProcess.disabled = false;
        }
    }, 20);
}

function runCompression() {
    const algo = el.algoSelect.value;
    const level = parseInt(el.levelSlider.value, 10);
    const input = state.currentFile.buffer;

    const res = state.module.compress(algo, input, level);
    if (!res.success) {
        handleError(res.error || 'Compression failed');
        return;
    }

    state.resultData = res.data;
    state.resultMeta = {
        mode: 'compress',
        format: res.format,
        originalSize: res.originalSize,
        outputSize: res.outputSize,
        durationMs: res.durationMs,
        compressionRatio: res.compressionRatio,
        throughputMBs: res.throughputMBs
    };

    displayResults(state.resultMeta);
    updateHexViews();
}

function runDecompression() {
    const format = el.decompressFormatSelect.value;
    const input = state.currentFile.buffer;

    const res = state.module.decompress(format, input);
    if (!res.success) {
        handleError(res.error || 'Decompression failed: Corrupted or unrecognized format');
        return;
    }

    state.resultData = res.data;
    state.resultMeta = {
        mode: 'decompress',
        format: res.format,
        originalSize: res.originalSize,
        outputSize: res.outputSize,
        durationMs: res.durationMs,
        compressionRatio: res.compressionRatio,
        throughputMBs: res.throughputMBs
    };

    displayResults(state.resultMeta);
    updateHexViews();
}

function runBenchmark() {
    const input = state.currentFile.buffer;
    const results = state.module.benchmark(input);

    el.benchmarkTbody.innerHTML = '';
    for (const item of results) {
        const tr = document.createElement('tr');
        const ratioPercent = (item.compressionRatio * 100).toFixed(1);
        const compTime = item.compressTimeMs !== undefined ? `${item.compressTimeMs.toFixed(2)} ms` : '—';
        const compSpeed = item.compressMBs !== undefined ? `${item.compressMBs.toFixed(1)} MB/s` : '—';
        const decompSpeed = item.decompressMBs !== undefined ? `${item.decompressMBs.toFixed(1)} MB/s` : '—';
        const integrityBadge = item.verified
            ? '<span class="badge-tag pass">Verified 100%</span>'
            : '<span class="badge-tag fail">Mismatch</span>';

        tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>${formatBytes(item.compressedSize)}</td>
            <td>${ratioPercent}%</td>
            <td>${compTime}</td>
            <td>${compSpeed}</td>
            <td>${decompSpeed}</td>
            <td>${integrityBadge}</td>
        `;
        el.benchmarkTbody.appendChild(tr);
    }

    el.resultStatusTag.textContent = 'Benchmark Complete';
    el.resultStatusTag.className = 'status-tag success';

    // Show summary in stat boxes based on best compression
    const sortedByRatio = [...results].sort((a, b) => a.compressedSize - b.compressedSize);
    const best = sortedByRatio[0];
    if (best) {
        el.statOrigSize.textContent = formatBytes(best.originalSize);
        el.statOrigBytes.textContent = `${best.originalSize.toLocaleString()} bytes`;
        el.statOutSize.textContent = formatBytes(best.compressedSize);
        el.statOutBytes.textContent = `${best.compressedSize.toLocaleString()} bytes`;
        const saving = ((1 - best.compressionRatio) * 100).toFixed(1);
        el.statRatio.textContent = `${saving}%`;
        el.statFactor.textContent = `Best: ${best.name}`;
        el.statTime.textContent = `${best.compressTimeMs.toFixed(2)} ms`;
        el.statSpeed.textContent = `${best.compressMBs.toFixed(1)} MB/s`;

        updateComparisonBar(best.originalSize, best.compressedSize);
    }
}

function displayResults(meta) {
    el.resultStatusTag.textContent = 'Success';
    el.resultStatusTag.className = 'status-tag success';

    el.statOrigSize.textContent = formatBytes(meta.originalSize);
    el.statOrigBytes.textContent = `${meta.originalSize.toLocaleString()} bytes`;

    el.statOutSize.textContent = formatBytes(meta.outputSize);
    el.statOutBytes.textContent = `${meta.outputSize.toLocaleString()} bytes`;

    if (meta.mode === 'compress') {
        const saving = ((1 - meta.compressionRatio) * 100).toFixed(1);
        const factor = meta.outputSize > 0 ? (meta.originalSize / meta.outputSize).toFixed(2) : '1.0';
        el.statRatio.textContent = `${saving > 0 ? '-' : '+'}${Math.abs(saving)}%`;
        el.statFactor.textContent = `${factor}x compression ratio`;
    } else {
        const expandFactor = meta.originalSize > 0 ? (meta.outputSize / meta.originalSize).toFixed(2) : '1.0';
        el.statRatio.textContent = `${expandFactor}x`;
        el.statFactor.textContent = 'Decompressed output';
    }

    el.statTime.textContent = `${meta.durationMs.toFixed(2)} ms`;
    el.statSpeed.textContent = `${meta.throughputMBs.toFixed(1)} MB/s`;

    updateComparisonBar(meta.originalSize, meta.outputSize);

    // Show Download Button
    el.btnDownload.classList.remove('hidden');
    const actionLabel = meta.mode === 'compress' ? 'Download Compressed File' : 'Download Decompressed File';
    el.downloadBtnText.textContent = `${actionLabel} (${formatBytes(meta.outputSize)})`;
}

function updateComparisonBar(origSize, outSize) {
    el.barLabelOrig.textContent = formatBytes(origSize);
    el.barLabelComp.textContent = formatBytes(outSize);
    const max = Math.max(origSize, outSize, 1);
    const percentage = Math.min(100, Math.max(2, Math.round((outSize / max) * 100)));
    el.barFill.style.width = `${percentage}%`;
    el.barFill.style.backgroundColor = outSize <= origSize ? '#10b981' : '#f59e0b';
}

function handleError(msg) {
    el.resultStatusTag.textContent = 'Error';
    el.resultStatusTag.className = 'status-tag error';
    el.btnDownload.classList.add('hidden');
    resetStats();
    alert(`Compression Engine Notice:\n\n${msg}`);
}

function resetStats() {
    el.statOrigSize.textContent = '—';
    el.statOrigBytes.textContent = '0 bytes';
    el.statOutSize.textContent = '—';
    el.statOutBytes.textContent = '0 bytes';
    el.statRatio.textContent = '—';
    el.statFactor.textContent = '—';
    el.statTime.textContent = '—';
    el.statSpeed.textContent = '—';
    el.barLabelOrig.textContent = '0 B';
    el.barLabelComp.textContent = '0 B';
    el.barFill.style.width = '0%';
}

// --- Hex Inspector ---

function updateHexViews() {
    if (state.currentFile && state.currentFile.buffer) {
        el.hexInputView.textContent = formatHexDump(state.currentFile.buffer, 64);
    } else {
        el.hexInputView.textContent = 'No file loaded';
    }

    if (state.resultData) {
        el.hexOutputView.textContent = formatHexDump(state.resultData, 64);
    } else {
        el.hexOutputView.textContent = 'Not processed yet';
    }
}

function formatHexDump(uint8Array, maxBytes = 64) {
    const len = Math.min(uint8Array.length, maxBytes);
    let out = '';
    for (let i = 0; i < len; i += 16) {
        const offset = i.toString(16).padStart(4, '0').toUpperCase();
        let hexPart = '';
        let asciiPart = '';
        for (let j = 0; j < 16; j++) {
            if (i + j < len) {
                const b = uint8Array[i + j];
                hexPart += b.toString(16).padStart(2, '0').toUpperCase() + ' ';
                asciiPart += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
            } else {
                hexPart += '   ';
            }
        }
        out += `${offset}  ${hexPart} |${asciiPart}|\n`;
    }
    if (uint8Array.length > maxBytes) {
        out += `... (${uint8Array.length - maxBytes} more bytes)\n`;
    }
    return out || 'Empty buffer (0 bytes)';
}

// --- Download Management ---

function triggerDownload() {
    if (!state.resultData || !state.currentFile) return;

    let outName = state.currentFile.name;
    const mode = state.resultMeta?.mode || 'compress';
    const format = state.resultMeta?.format || 'lz4';

    if (mode === 'compress') {
        const ext = format === 'gzip' ? 'gz' : format;
        outName = `${outName}.${ext}`;
    } else if (mode === 'decompress') {
        // Strip compressed extension if present
        const parts = outName.split('.');
        const lastExt = parts[parts.length - 1].toLowerCase();
        if (['gz', 'lz4', 'zlib', 'rle'].includes(lastExt) && parts.length > 1) {
            parts.pop();
            outName = parts.join('.');
        } else {
            outName = `decompressed_${outName}`;
        }
    }

    const blob = new Blob([state.resultData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Utilities ---

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
