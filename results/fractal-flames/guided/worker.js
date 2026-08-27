function log(...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    console.log('[Worker]', msg);
    postMessage({ type: 'log', message: msg });
}

log('Worker script executing...');
import Module from './module.mjs';
log('Module imported successfully in worker');

let engine = null;
let moduleInstance = null;

async function init() {
    try {
        log('Worker initializing Module()...');
        moduleInstance = await Module();
        log('Module() initialized. Creating FlameEngine...');
        engine = new moduleInstance.FlameEngine();
        log('FlameEngine created.');
        const variationVector = moduleInstance.FlameEngine.getVariationNames();
        const variationNames = [];
        for (let i = 0; i < variationVector.size(); i++) {
            variationNames.push(variationVector.get(i));
        }
        const paletteCount = moduleInstance.FlameEngine.getPaletteCount();
        log('Variations count:', variationNames.length, 'Palettes:', paletteCount);

        postMessage({
            type: 'ready',
            variationNames,
            paletteCount
        });
    } catch (err) {
        console.error('Worker init error:', err);
        postMessage({
            type: 'error',
            error: err.message || String(err)
        });
    }
}

init();

self.onmessage = (e) => {
    const { type, id, params } = e.data;
    log('Worker onmessage received:', type, 'id:', id);
    if (!engine) {
        log('ERROR: Flame engine not initialized yet');
        postMessage({ type: 'error', id, error: 'Flame engine not initialized yet' });
        return;
    }

    if (type === 'render') {
        try {
            log('Worker starting render with action:', params ? params.action : 'none');
            if (params.action === 'loadXml' && params.xml) {
                engine.loadXml(params.xml);
            } else if (params.action === 'generate') {
                log('Calling engine.generateRandom... seed:', params.seed, 'xforms:', params.numXforms, 'sym:', params.symmetry, 'var:', params.variationIndex);
                engine.generateRandom(
                    params.seed || 0,
                    params.numXforms || 3,
                    params.symmetry || 0,
                    params.variationIndex !== undefined ? params.variationIndex : -1,
                    params.paletteIndex !== undefined ? params.paletteIndex : 0,
                    params.hueRotation || 0.0
                );
                log('engine.generateRandom finished.');
            } else if (params.action === 'mutate') {
                engine.mutate(params.mutateMode || 0, params.mutateSpeed || 1.0);
            }

            if (params.setPalette && params.paletteIndex !== undefined) {
                engine.setPaletteIndex(params.paletteIndex, params.hueRotation || 0.0);
            }
            if (params.setHueRotation && params.hueRotation !== undefined) {
                engine.setHueRotation(params.hueRotation);
            }
            if (params.setSymmetry && params.symmetry !== undefined) {
                engine.setSymmetry(params.symmetry);
            }
            if (params.resetCenterAndScale) {
                engine.resetCenterAndScale();
            }

            const width = params.width || 512;
            const height = params.height || 512;
            const quality = params.quality || 50;
            const oversample = params.spatialOversample || 1;
            const filterRadius = params.spatialFilterRadius !== undefined ? params.spatialFilterRadius : 0.6;
            const gamma = params.gamma !== undefined ? params.gamma : 4.0;
            const vibrancy = params.vibrancy !== undefined ? params.vibrancy : 1.0;
            const brightness = params.brightness !== undefined ? params.brightness : 1.0;
            const contrast = params.contrast !== undefined ? params.contrast : 1.0;
            const zoom = params.zoom !== undefined ? params.zoom : 0.0;
            const rotate = params.rotate !== undefined ? params.rotate : 0.0;
            const useEngineCenter = (params.action === 'generate' || params.resetCenterAndScale || params.action === 'loadXml' || params.centerX === undefined || params.centerX === null);
            const centerX = useEngineCenter ? engine.getCenterX() : params.centerX;
            const centerY = useEngineCenter ? engine.getCenterY() : params.centerY;
            const transparency = params.transparency ? 1 : 0;

            log('Calling engine.render w:', width, 'h:', height, 'density:', quality, 'cx:', centerX, 'cy:', centerY, 'ppu:', engine.getPixelsPerUnit());
            const t0 = performance.now();
            const rawView = engine.render(
                width, height, quality, oversample,
                filterRadius, gamma, vibrancy, brightness,
                contrast, zoom, rotate, centerX, centerY,
                transparency
            );
            const renderTimeMs = performance.now() - t0;
            log('engine.render completed in ms:', renderTimeMs, 'rawView len:', rawView ? rawView.length : 0);

            const bufferCopy = new Uint8ClampedArray(rawView).buffer;
            const stats = engine.getLastStats();
            const xml = engine.getXml();
            log('Render stats:', JSON.stringify(stats));

            let nonZeroCount = 0;
            for (let i = 0; i < rawView.length; i += 4) {
                if (rawView[i] > 0 || rawView[i+1] > 0 || rawView[i+2] > 0) nonZeroCount++;
            }
            log('Non-zero RGB pixels:', nonZeroCount, 'out of', width * height);

            log('Posting renderComplete back to main thread with buffer size:', bufferCopy.byteLength);
            postMessage({
                type: 'renderComplete',
                id,
                buffer: bufferCopy,
                width,
                height,
                centerX: engine.getCenterX(),
                centerY: engine.getCenterY(),
                stats: {
                    badvals: stats.badvals,
                    numIters: stats.numIters,
                    renderTimeMs: Math.round(renderTimeMs),
                    renderSeconds: stats.renderSeconds
                },
                xml
            }, [bufferCopy]);
        } catch (err) {
            log('Render caught error:', err.message || String(err));
            postMessage({
                type: 'error',
                id,
                error: err.message || String(err)
            });
        }
    } else if (type === 'getXml') {
        try {
            postMessage({
                type: 'xmlResult',
                id,
                xml: engine.getXml()
            });
        } catch (err) {
            postMessage({ type: 'error', id, error: err.message || String(err) });
        }
    }
};
