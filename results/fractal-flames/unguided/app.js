import Module from './module.mjs';

// State variables
let worker = null;
let directEngine = null;
let wasmModule = null;
let useWorker = true;
let isRendering = false;

let canvas = null;
let ctx = null;
let width = 800;
let height = 600;
let supersample = 2;
let targetSamples = 2000000;
let totalRendered = 0;

let currentTransforms = [];
let availablePresets = [];
let availablePalettes = [];
let availableVariations = [];

let lastFpsTime = performance.now();
let frameCount = 0;
let uiFps = 60;

// Initialize Application
async function initApp() {
    canvas = document.getElementById('flameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    setupTabs();
    setupCanvasInteractions();
    setupControls();
    startFpsMonitor();

    const statusBadge = document.getElementById('engineStatus');

    try {
        if (window.Worker) {
            worker = new Worker('./worker.js', { type: 'module' });
            worker.onmessage = handleWorkerMessage;
            worker.onerror = (err) => {
                console.warn('Worker error, falling back to direct mode:', err);
                initDirectMode();
            };
            worker.postMessage({
                type: 'init',
                width: width,
                height: height,
                supersample: supersample
            });
            statusBadge.textContent = 'Worker Active (WASM)';
            statusBadge.style.color = '#00d2ff';
        } else {
            await initDirectMode();
        }
    } catch (e) {
        console.warn('Worker creation failed, falling back to direct mode:', e);
        await initDirectMode();
    }
}

async function initDirectMode() {
    useWorker = false;
    const statusBadge = document.getElementById('engineStatus');
    statusBadge.textContent = 'Direct WASM Mode';
    statusBadge.style.color = '#ff9e00';

    wasmModule = await Module();
    directEngine = new wasmModule.FlameEngine();
    directEngine.init(width, height, supersample);

    availablePresets = JSON.parse(wasmModule.FlameEngine.getPresetListJson());
    availablePalettes = JSON.parse(wasmModule.FlameEngine.getPaletteListJson());
    availableVariations = JSON.parse(wasmModule.FlameEngine.getVariationListJson());

    populateSelects();
    directEngine.loadPreset('Cosmic Spiral');
    syncUiFromDirectEngine();
    startRendering();
}

function handleWorkerMessage(e) {
    const msg = e.data;
    switch (msg.type) {
        case 'ready':
            availablePresets = msg.presets;
            availablePalettes = msg.palettes;
            availableVariations = msg.variations;
            populateSelects();
            worker.postMessage({ type: 'loadPreset', name: 'Cosmic Spiral' });
            break;

        case 'presetLoaded':
        case 'randomGenerated':
            currentTransforms = msg.transforms || [];
            if (msg.palette) {
                const palSel = document.getElementById('paletteSelect');
                if (palSel) palSel.value = msg.palette;
                updatePalettePreview(msg.palette);
            }
            if (msg.symmetry) {
                const symSlider = document.getElementById('symmetrySlider');
                if (symSlider) symSlider.value = msg.symmetry;
                const symVal = document.getElementById('symmetryVal');
                if (symVal) symVal.textContent = `${msg.symmetry}x`;
            }
            if (msg.camera) {
                syncCameraInputs(msg.camera);
            }
            if (msg.tone) {
                syncToneInputs(msg.tone);
            }
            renderTransformCards();
            startRendering(true);
            break;

        case 'mutated':
            currentTransforms = msg.transforms || [];
            renderTransformCards();
            startRendering(true);
            break;

        case 'frame':
            drawFrame(msg.pixels);
            updateStats(msg.renderedSamples, msg.targetSamples, msg.samplesPerSec);
            if (msg.done) {
                setRenderingState(false);
            }
            break;

        case 'singleFrame':
            drawFrame(msg.pixels);
            break;

        case 'completed':
            setRenderingState(false);
            break;
    }
}

function drawFrame(pixelBuffer) {
    if (!pixelBuffer || !ctx) return;
    const uint8View = new Uint8ClampedArray(pixelBuffer);
    const imgData = new ImageData(uint8View, width, height);
    ctx.putImageData(imgData, 0, 0);
    frameCount++;
}

function startRendering(reset = false) {
    isRendering = true;
    setRenderingState(true);
    if (reset) totalRendered = 0;

    if (useWorker && worker) {
        worker.postMessage({
            type: 'startRender',
            targetSamples: targetSamples,
            batchSize: 150000,
            reset: reset
        });
    } else if (directEngine) {
        if (reset) directEngine.clearAccumulator();
        runDirectRenderLoop();
    }
}

function pauseRendering() {
    isRendering = false;
    setRenderingState(false);
    if (useWorker && worker) {
        worker.postMessage({ type: 'pauseRender' });
    }
}

function runDirectRenderLoop() {
    if (!isRendering || !directEngine) return;
    const batchSize = 100000;
    directEngine.renderSamples(batchSize);
    totalRendered += batchSize;

    const pixelView = directEngine.getPixelView();
    const copyBuf = new Uint8ClampedArray(pixelView).slice();
    const imgData = new ImageData(copyBuf, width, height);
    ctx.putImageData(imgData, 0, 0);
    frameCount++;

    updateStats(totalRendered, targetSamples, 2000000);

    if (totalRendered < targetSamples && isRendering) {
        requestAnimationFrame(runDirectRenderLoop);
    } else {
        setRenderingState(false);
    }
}

function setRenderingState(rendering) {
    isRendering = rendering;
    const btnToggle = document.getElementById('btnRenderToggle');
    const btnPlay = document.getElementById('btnTogglePlay');
    const canvasEl = document.getElementById('flameCanvas');
    const statStatus = document.getElementById('statStatus');

    if (rendering) {
        if (btnToggle) btnToggle.textContent = '⏸ Pause';
        if (btnPlay) btnPlay.textContent = '⏸';
        if (canvasEl) canvasEl.classList.add('rendering');
        if (statStatus) {
            statStatus.textContent = 'Rendering...';
            statStatus.style.color = '#ff5e3a';
        }
    } else {
        if (btnToggle) btnToggle.textContent = '▶ Render';
        if (btnPlay) btnPlay.textContent = '▶';
        if (canvasEl) canvasEl.classList.remove('rendering');
        if (statStatus) {
            statStatus.textContent = totalRendered >= targetSamples ? 'Done' : 'Paused';
            statStatus.style.color = totalRendered >= targetSamples ? '#00d2ff' : '#9aa1b9';
        }
    }
}

function updateStats(rendered, target, speed) {
    const statSamples = document.getElementById('statSamples');
    const statSpeed = document.getElementById('statSpeed');
    const statProgress = document.getElementById('statProgress');

    if (statSamples) {
        statSamples.textContent = `${rendered.toLocaleString()} / ${target.toLocaleString()}`;
    }
    if (statSpeed) {
        statSpeed.textContent = `${(speed / 1000000).toFixed(2)} M/s`;
    }
    if (statProgress) {
        const pct = Math.min(100, Math.max(0, (rendered / target) * 100));
        statProgress.style.width = `${pct}%`;
    }
}

function startFpsMonitor() {
    function tick() {
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            uiFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
            frameCount = 0;
            lastFpsTime = now;
            const statFps = document.getElementById('statFps');
            if (statFps) {
                statFps.textContent = `${uiFps} fps`;
            }
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function populateSelects() {
    const presetSel = document.getElementById('presetSelect');
    if (presetSel && availablePresets.length > 0) {
        presetSel.innerHTML = '';
        availablePresets.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            presetSel.appendChild(opt);
        });
    }

    const palSel = document.getElementById('paletteSelect');
    if (palSel && availablePalettes.length > 0) {
        palSel.innerHTML = '';
        availablePalettes.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            palSel.appendChild(opt);
        });
        updatePalettePreview(availablePalettes[0]);
    }
}

function updatePalettePreview(paletteName) {
    const preview = document.getElementById('palettePreview');
    if (!preview) return;

    const gradients = {
        'Flame Fire': 'linear-gradient(90deg, #000, #780a00, #f0460a, #ffb414, #fff078, #fff)',
        'Electric Blue': 'linear-gradient(90deg, #050514, #0f3c96, #14a0f0, #64dcff, #c8f5ff, #fff)',
        'Rainbow Nebula': 'linear-gradient(90deg, #c81e50, #e67814, #dcdc28, #1ebe5a, #2878f0, #b428dc)',
        'Cyberpunk Neon': 'linear-gradient(90deg, #0a0519, #ff0080, #8000ff, #00e6ff, #ffff00, #fff)',
        'Emerald Forest': 'linear-gradient(90deg, #02140a, #0a5028, #1ea050, #78e68c, #c8ffbe, #fff)',
        'Sunset Gold': 'linear-gradient(90deg, #14051e, #82143c, #dc4628, #ffaa1e, #ffe678, #ffff0)',
        'Cosmic Violet': 'linear-gradient(90deg, #0a0014, #460f6e, #9628be, #d26ef0, #f5bef, #fff)',
        'Monochrome Plasma': 'linear-gradient(90deg, #000, #323237, #8c919b, #d2d7e1, #fff)',
        'Autumn Ember': 'linear-gradient(90deg, #1e0a05, #8c280a, #d26414, #eba028, #fad064, #ffff0)',
        'Ice Crystal': 'linear-gradient(90deg, #050f1e, #14508c, #50a0d2, #b4e6fa, #fff)'
    };

    preview.style.background = gradients[paletteName] || '#fff';
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t) => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            const pane = document.getElementById(target);
            if (pane) pane.classList.add('active');
        });
    });
}

function setupControls() {
    // Preset selection
    const presetSel = document.getElementById('presetSelect');
    if (presetSel) {
        presetSel.addEventListener('change', (e) => {
            const name = e.target.value;
            if (useWorker && worker) {
                worker.postMessage({ type: 'loadPreset', name: name });
            } else if (directEngine) {
                directEngine.loadPreset(name);
                syncUiFromDirectEngine();
                startRendering(true);
            }
        });
    }

    // Random flame buttons
    const triggerRandom = () => {
        const numXforms = parseInt(document.getElementById('randNumXforms').value, 10) || 3;
        const primaryVar = document.getElementById('randPrimaryVar').value;
        if (useWorker && worker) {
            worker.postMessage({
                type: 'randomFlame',
                numXforms: numXforms,
                primaryVar: primaryVar
            });
        } else if (directEngine) {
            directEngine.generateRandomFlame(numXforms, primaryVar);
            syncUiFromDirectEngine();
            startRendering(true);
        }
    };

    document.getElementById('btnRandom')?.addEventListener('click', triggerRandom);
    document.getElementById('btnRandomTop')?.addEventListener('click', triggerRandom);

    // Mutate buttons
    const triggerMutate = () => {
        if (useWorker && worker) {
            worker.postMessage({ type: 'mutate', amount: 0.3 });
        } else if (directEngine) {
            directEngine.mutateFlame(0.3);
            syncUiFromDirectEngine();
            startRendering(true);
        }
    };

    document.getElementById('btnMutate')?.addEventListener('click', triggerMutate);
    document.getElementById('btnMutateTop')?.addEventListener('click', triggerMutate);

    // Render toggle
    const toggleRender = () => {
        if (isRendering) {
            pauseRendering();
        } else {
            startRendering(false);
        }
    };
    document.getElementById('btnRenderToggle')?.addEventListener('click', toggleRender);
    document.getElementById('btnTogglePlay')?.addEventListener('click', toggleRender);

    // Camera sliders
    const updateCameraFromSliders = () => {
        const zoom = parseFloat(document.getElementById('zoomSlider').value);
        const rot = parseFloat(document.getElementById('rotationSlider').value);
        const panX = parseFloat(document.getElementById('panXSlider').value);
        const panY = parseFloat(document.getElementById('panYSlider').value);

        document.getElementById('zoomVal').textContent = `${zoom.toFixed(2)}x`;
        document.getElementById('rotationVal').textContent = `${rot}°`;
        document.getElementById('panXVal').textContent = panX.toFixed(2);
        document.getElementById('panYVal').textContent = panY.toFixed(2);

        if (useWorker && worker) {
            worker.postMessage({
                type: 'setCamera',
                centerX: panX,
                centerY: panY,
                zoom: zoom,
                rotation: rot
            });
        } else if (directEngine) {
            directEngine.setCamera(panX, panY, zoom, rot);
        }
        startRendering(true);
    };

    ['zoomSlider', 'rotationSlider', 'panXSlider', 'panYSlider'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', updateCameraFromSliders);
    });

    document.getElementById('btnResetCamera')?.addEventListener('click', () => {
        document.getElementById('zoomSlider').value = 1.1;
        document.getElementById('rotationSlider').value = 0;
        document.getElementById('panXSlider').value = 0.0;
        document.getElementById('panYSlider').value = 0.0;
        updateCameraFromSliders();
    });

    // Palette change
    const palSel = document.getElementById('paletteSelect');
    if (palSel) {
        palSel.addEventListener('change', (e) => {
            const name = e.target.value;
            updatePalettePreview(name);
            if (useWorker && worker) {
                worker.postMessage({ type: 'setPalette', name: name });
            } else if (directEngine) {
                directEngine.setPalettePreset(name);
            }
            startRendering(true);
        });
    }

    // Tone sliders
    const updateToneFromSliders = () => {
        const gamma = parseFloat(document.getElementById('gammaSlider').value);
        const brightness = parseFloat(document.getElementById('brightnessSlider').value);
        const vibrancy = parseFloat(document.getElementById('vibrancySlider').value);
        const bgVal = parseInt(document.getElementById('bgSelect').value, 16);

        document.getElementById('gammaVal').textContent = gamma.toFixed(2);
        document.getElementById('brightnessVal').textContent = brightness.toFixed(2);
        document.getElementById('vibrancyVal').textContent = vibrancy.toFixed(2);

        if (useWorker && worker) {
            worker.postMessage({
                type: 'setTone',
                gamma: gamma,
                brightness: brightness,
                vibrancy: vibrancy,
                bgColor: bgVal
            });
            worker.postMessage({ type: 'requestSingleFrame' });
        } else if (directEngine) {
            directEngine.setToneConfig(gamma, brightness, vibrancy, bgVal);
            const pixelView = directEngine.getPixelView();
            drawFrame(new Uint8ClampedArray(pixelView).slice().buffer);
        }
    };

    ['gammaSlider', 'brightnessSlider', 'vibrancySlider', 'bgSelect'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', updateToneFromSliders);
    });

    // Symmetry slider
    const symSlider = document.getElementById('symmetrySlider');
    if (symSlider) {
        symSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            document.getElementById('symmetryVal').textContent = `${val}x`;
            if (useWorker && worker) {
                worker.postMessage({ type: 'setSymmetry', symmetry: val });
            } else if (directEngine) {
                directEngine.setSymmetry(val);
            }
            startRendering(true);
        });
    }

    // Resolution & Supersampling
    document.getElementById('resSelect')?.addEventListener('change', (e) => {
        const parts = e.target.value.split('x');
        width = parseInt(parts[0], 10);
        height = parseInt(parts[1], 10);
        canvas.width = width;
        canvas.height = height;
        if (useWorker && worker) {
            worker.postMessage({ type: 'resize', width: width, height: height });
        } else if (directEngine) {
            directEngine.resize(width, height);
        }
        startRendering(true);
    });

    document.getElementById('ssSelect')?.addEventListener('change', (e) => {
        supersample = parseInt(e.target.value, 10);
        if (useWorker && worker) {
            worker.postMessage({ type: 'setSupersample', supersample: supersample });
        } else if (directEngine) {
            directEngine.setSupersample(supersample);
        }
        startRendering(true);
    });

    // Quality target
    document.getElementById('targetSamplesSlider')?.addEventListener('input', (e) => {
        targetSamples = parseInt(e.target.value, 10);
        document.getElementById('targetSamplesVal').textContent = targetSamples.toLocaleString();
        if (!isRendering) {
            startRendering(false);
        }
    });

    // Export PNG
    document.getElementById('btnExportPng')?.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `flam3_fractal_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // Add Transform
    document.getElementById('btnAddXform')?.addEventListener('click', () => {
        const newXf = {
            a: 0.5, b: 0.0, c: (Math.random() - 0.5) * 0.5,
            d: 0.0, e: 0.5, f: (Math.random() - 0.5) * 0.5,
            weight: 1.0, color: Math.random(), colorSpeed: 0.5
        };
        if (useWorker && worker) {
            worker.postMessage({ type: 'addTransform', transform: newXf });
            worker.postMessage({ type: 'loadPreset', name: document.getElementById('presetSelect').value });
        } else if (directEngine) {
            directEngine.addTransform(newXf);
            syncUiFromDirectEngine();
            startRendering(true);
        }
    });
}

function syncCameraInputs(cam) {
    if (!cam) return;
    const zoomSlider = document.getElementById('zoomSlider');
    const rotSlider = document.getElementById('rotationSlider');
    const panXSlider = document.getElementById('panXSlider');
    const panYSlider = document.getElementById('panYSlider');

    if (zoomSlider) zoomSlider.value = cam.zoom || 1.1;
    if (rotSlider) rotSlider.value = cam.rotationDegrees || 0;
    if (panXSlider) panXSlider.value = cam.centerX || 0;
    if (panYSlider) panYSlider.value = cam.centerY || 0;

    document.getElementById('zoomVal').textContent = `${(cam.zoom || 1.1).toFixed(2)}x`;
    document.getElementById('rotationVal').textContent = `${cam.rotationDegrees || 0}°`;
    document.getElementById('panXVal').textContent = (cam.centerX || 0).toFixed(2);
    document.getElementById('panYVal').textContent = (cam.centerY || 0).toFixed(2);
}

function syncToneInputs(tone) {
    if (!tone) return;
    const gammaSlider = document.getElementById('gammaSlider');
    const brightnessSlider = document.getElementById('brightnessSlider');
    const vibrancySlider = document.getElementById('vibrancySlider');

    if (gammaSlider) gammaSlider.value = tone.gamma || 2.2;
    if (brightnessSlider) brightnessSlider.value = tone.brightness || 1.0;
    if (vibrancySlider) vibrancySlider.value = tone.vibrancy || 1.0;

    document.getElementById('gammaVal').textContent = (tone.gamma || 2.2).toFixed(2);
    document.getElementById('brightnessVal').textContent = (tone.brightness || 1.0).toFixed(2);
    document.getElementById('vibrancyVal').textContent = (tone.vibrancy || 1.0).toFixed(2);
}

function syncUiFromDirectEngine() {
    if (!directEngine) return;
    const count = directEngine.getTransformCount();
    currentTransforms = [];
    for (let i = 0; i < count; ++i) {
        currentTransforms.push(directEngine.getTransform(i));
    }
    syncCameraInputs(directEngine.getCamera());
    syncToneInputs(directEngine.getToneConfig());
    renderTransformCards();
}

function renderTransformCards() {
    const container = document.getElementById('xformsContainer');
    if (!container) return;
    container.innerHTML = '';

    currentTransforms.forEach((xf, idx) => {
        const card = document.createElement('div');
        card.className = 'xform-card';

        card.innerHTML = `
            <div class="xform-header">
                <span>Transform #${idx + 1}</span>
                <span style="font-size: 11px; color: var(--text-muted);">Weight: ${xf.weight.toFixed(2)}</span>
            </div>
            <div class="xform-matrix">
                <div class="matrix-cell"><span class="matrix-label">a</span><input type="number" class="matrix-input" step="0.05" value="${xf.a.toFixed(2)}" data-field="a" data-idx="${idx}"></div>
                <div class="matrix-cell"><span class="matrix-label">b</span><input type="number" class="matrix-input" step="0.05" value="${xf.b.toFixed(2)}" data-field="b" data-idx="${idx}"></div>
                <div class="matrix-cell"><span class="matrix-label">c</span><input type="number" class="matrix-input" step="0.05" value="${xf.c.toFixed(2)}" data-field="c" data-idx="${idx}"></div>
                <div class="matrix-cell"><span class="matrix-label">d</span><input type="number" class="matrix-input" step="0.05" value="${xf.d.toFixed(2)}" data-field="d" data-idx="${idx}"></div>
                <div class="matrix-cell"><span class="matrix-label">e</span><input type="number" class="matrix-input" step="0.05" value="${xf.e.toFixed(2)}" data-field="e" data-idx="${idx}"></div>
                <div class="matrix-cell"><span class="matrix-label">f</span><input type="number" class="matrix-input" step="0.05" value="${xf.f.toFixed(2)}" data-field="f" data-idx="${idx}"></div>
            </div>
            <div class="control-row">
                <div class="label-val">
                    <span>Color Index</span>
                    <span class="val-display">${(xf.color || 0).toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.02" value="${xf.color || 0}" data-color="${idx}">
            </div>
        `;

        // Attach matrix input listeners
        card.querySelectorAll('.matrix-input').forEach((input) => {
            input.addEventListener('change', (e) => {
                const f = e.target.getAttribute('data-field');
                const i = parseInt(e.target.getAttribute('data-idx'), 10);
                currentTransforms[i][f] = parseFloat(e.target.value);
                if (useWorker && worker) {
                    worker.postMessage({ type: 'setTransform', index: i, transform: currentTransforms[i] });
                } else if (directEngine) {
                    directEngine.setTransform(i, currentTransforms[i]);
                }
                startRendering(true);
            });
        });

        // Color listener
        card.querySelector(`[data-color="${idx}"]`)?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            currentTransforms[idx].color = val;
            if (useWorker && worker) {
                worker.postMessage({ type: 'setTransform', index: idx, transform: currentTransforms[idx] });
            } else if (directEngine) {
                directEngine.setTransform(idx, currentTransforms[idx]);
            }
            startRendering(true);
        });

        container.appendChild(card);
    });
}

function setupCanvasInteractions() {
    const viewport = document.getElementById('viewport');
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    viewport?.addEventListener('mousedown', (e) => {
        if (e.target.closest('.viewport-toolbar') || e.target.closest('.stats-overlay')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = (e.clientX - startX) * 0.003;
        const dy = (e.clientY - startY) * 0.003;
        startX = e.clientX;
        startY = e.clientY;

        const panXSlider = document.getElementById('panXSlider');
        const panYSlider = document.getElementById('panYSlider');
        if (panXSlider && panYSlider) {
            panXSlider.value = parseFloat(panXSlider.value) - dx;
            panYSlider.value = parseFloat(panYSlider.value) + dy;
            panXSlider.dispatchEvent(new Event('input'));
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Scroll to Zoom
    viewport?.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSlider = document.getElementById('zoomSlider');
        if (!zoomSlider) return;
        let zoom = parseFloat(zoomSlider.value);
        if (e.deltaY < 0) {
            zoom = Math.min(5.0, zoom * 1.1);
        } else {
            zoom = Math.max(0.1, zoom * 0.9);
        }
        zoomSlider.value = zoom;
        zoomSlider.dispatchEvent(new Event('input'));
    }, { passive: false });

    // Floating toolbar buttons
    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
        const zoomSlider = document.getElementById('zoomSlider');
        if (zoomSlider) {
            zoomSlider.value = Math.min(5.0, parseFloat(zoomSlider.value) * 1.2);
            zoomSlider.dispatchEvent(new Event('input'));
        }
    });

    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
        const zoomSlider = document.getElementById('zoomSlider');
        if (zoomSlider) {
            zoomSlider.value = Math.max(0.1, parseFloat(zoomSlider.value) * 0.8);
            zoomSlider.dispatchEvent(new Event('input'));
        }
    });

    document.getElementById('btnCenterView')?.addEventListener('click', () => {
        document.getElementById('btnResetCamera')?.click();
    });
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
