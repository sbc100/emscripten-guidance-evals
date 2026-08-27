import Module from './module.mjs';

let wasmInstance = null;
let engine = null;
let isRendering = false;
let targetSamples = 2000000;
let batchSize = 150000;
let totalRendered = 0;
let startTime = 0;
let renderTimer = null;

async function initEngine(width, height, supersample) {
    if (!wasmInstance) {
        wasmInstance = await Module();
    }
    if (!engine) {
        engine = new wasmInstance.FlameEngine();
    }
    engine.init(width, height, supersample);
    self.postMessage({
        type: 'ready',
        presets: JSON.parse(wasmInstance.FlameEngine.getPresetListJson()),
        palettes: JSON.parse(wasmInstance.FlameEngine.getPaletteListJson()),
        variations: JSON.parse(wasmInstance.FlameEngine.getVariationListJson())
    });
}

function renderBatch() {
    if (!isRendering || !engine) return;

    const t0 = performance.now();
    const plotted = engine.renderSamples(batchSize);
    totalRendered += batchSize;

    // Get rendered frame
    const pixelView = engine.getPixelView();
    // Copy to new ArrayBuffer to transfer ownership safely
    const pixelBuffer = new Uint8Array(pixelView).buffer;

    const elapsedTotal = (performance.now() - startTime) / 1000.0;
    const speed = elapsedTotal > 0 ? (totalRendered / elapsedTotal) : 0;

    self.postMessage(
        {
            type: 'frame',
            pixels: pixelBuffer,
            renderedSamples: totalRendered,
            targetSamples: targetSamples,
            samplesPerSec: speed,
            plotted: plotted,
            done: totalRendered >= targetSamples
        },
        [pixelBuffer]
    );

    if (totalRendered < targetSamples && isRendering) {
        // Schedule next batch asynchronously
        renderTimer = setTimeout(renderBatch, 0);
    } else {
        isRendering = false;
        self.postMessage({
            type: 'completed',
            renderedSamples: totalRendered,
            elapsedSec: elapsedTotal
        });
    }
}

self.onmessage = async (e) => {
    const msg = e.data;
    switch (msg.type) {
        case 'init':
            await initEngine(msg.width, msg.height, msg.supersample);
            break;

        case 'resize':
            if (engine) engine.resize(msg.width, msg.height);
            break;

        case 'setSupersample':
            if (engine) engine.setSupersample(msg.supersample);
            break;

        case 'setCamera':
            if (engine) engine.setCamera(msg.centerX, msg.centerY, msg.zoom, msg.rotation);
            break;

        case 'setTone':
            if (engine) engine.setToneConfig(msg.gamma, msg.brightness, msg.vibrancy, msg.bgColor);
            break;

        case 'setSymmetry':
            if (engine) engine.setSymmetry(msg.symmetry);
            break;

        case 'setPalette':
            if (engine) engine.setPalettePreset(msg.name);
            break;

        case 'loadPreset':
            if (engine) {
                engine.loadPreset(msg.name);
                const count = engine.getTransformCount();
                const xforms = [];
                for (let i = 0; i < count; ++i) {
                    xforms.push(engine.getTransform(i));
                }
                const cam = engine.getCamera();
                const tone = engine.getToneConfig();
                self.postMessage({
                    type: 'presetLoaded',
                    name: msg.name,
                    palette: engine.getCurrentPaletteName(),
                    symmetry: engine.getSymmetry(),
                    transforms: xforms,
                    camera: cam,
                    tone: tone
                });
            }
            break;

        case 'randomFlame':
            if (engine) {
                engine.generateRandomFlame(msg.numXforms, msg.primaryVar);
                const count = engine.getTransformCount();
                const xforms = [];
                for (let i = 0; i < count; ++i) {
                    xforms.push(engine.getTransform(i));
                }
                self.postMessage({
                    type: 'randomGenerated',
                    palette: engine.getCurrentPaletteName(),
                    symmetry: engine.getSymmetry(),
                    transforms: xforms,
                    camera: engine.getCamera(),
                    tone: engine.getToneConfig()
                });
            }
            break;

        case 'mutate':
            if (engine) {
                engine.mutateFlame(msg.amount);
                const count = engine.getTransformCount();
                const xforms = [];
                for (let i = 0; i < count; ++i) {
                    xforms.push(engine.getTransform(i));
                }
                self.postMessage({
                    type: 'mutated',
                    transforms: xforms
                });
            }
            break;

        case 'setTransform':
            if (engine) {
                engine.setTransform(msg.index, msg.transform);
                if (msg.variations) {
                    for (let v = 0; v < msg.variations.length; ++v) {
                        engine.setVariationWeight(msg.index, v, msg.variations[v]);
                    }
                }
            }
            break;

        case 'setVariationWeight':
            if (engine) {
                engine.setVariationWeight(msg.xformIndex, msg.varType, msg.weight);
            }
            break;

        case 'clearTransforms':
            if (engine) engine.clearTransforms();
            break;

        case 'addTransform':
            if (engine) engine.addTransform(msg.transform);
            break;

        case 'clearAccumulator':
            if (engine) {
                engine.clearAccumulator();
                totalRendered = 0;
            }
            break;

        case 'startRender':
            if (engine) {
                if (msg.reset) {
                    engine.clearAccumulator();
                    totalRendered = 0;
                }
                targetSamples = msg.targetSamples || 2000000;
                batchSize = msg.batchSize || 150000;
                isRendering = true;
                startTime = performance.now();
                renderBatch();
            }
            break;

        case 'pauseRender':
            isRendering = false;
            if (renderTimer) clearTimeout(renderTimer);
            self.postMessage({ type: 'paused' });
            break;

        case 'requestSingleFrame':
            if (engine) {
                const pixelView = engine.getPixelView();
                const pixelBuffer = new Uint8Array(pixelView).buffer;
                self.postMessage(
                    {
                        type: 'singleFrame',
                        pixels: pixelBuffer
                    },
                    [pixelBuffer]
                );
            }
            break;
    }
};
