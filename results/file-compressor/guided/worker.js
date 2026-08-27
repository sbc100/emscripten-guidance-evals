import createModule from './module.mjs';

let wasmModule = null;
let initPromise = null;

async function getModule() {
  if (wasmModule) return wasmModule;
  if (!initPromise) {
    initPromise = createModule().then(mod => {
      wasmModule = mod;
      return mod;
    });
  }
  return initPromise;
}

self.onmessage = async (e) => {
  const { type, id, payload } = e.data;

  try {
    const mod = await getModule();

    if (type === 'init') {
      const algos = mod.getAvailableAlgorithms();
      self.postMessage({ type: 'ready', id, payload: { algorithms: algos } });
      return;
    }

    if (type === 'compress') {
      const { data, format, level, includeHeader } = payload;
      const res = mod.compress(data, format, level, includeHeader);

      const transferables = [];
      if (res.data && res.data.buffer) {
        transferables.push(res.data.buffer);
      }
      self.postMessage({ type: 'result', id, payload: res }, transferables);
      return;
    }

    if (type === 'decompress') {
      const { data, format } = payload;
      const res = mod.decompress(data, format);

      const transferables = [];
      if (res.data && res.data.buffer) {
        transferables.push(res.data.buffer);
      }
      self.postMessage({ type: 'result', id, payload: res }, transferables);
      return;
    }

    if (type === 'detect') {
      const { data } = payload;
      const format = mod.detectFormat(data);
      self.postMessage({ type: 'result', id, payload: { format } });
      return;
    }

    if (type === 'benchmark') {
      const { data } = payload;
      const algos = ['zstd', 'zlib', 'lz4', 'rle'];
      const results = [];

      for (const algo of algos) {
        const comp = mod.compress(data, algo, 3, true);
        const decomp = comp.success ? mod.decompress(comp.data, 'auto') : null;
        results.push({
          algorithm: algo,
          compressResult: {
            success: comp.success,
            error: comp.error,
            originalSize: comp.originalSize,
            processedSize: comp.processedSize,
            compressionRatio: comp.compressionRatio,
            spaceSavings: comp.spaceSavings,
            durationMs: comp.durationMs
          },
          decompressResult: decomp ? {
            success: decomp.success,
            error: decomp.error,
            durationMs: decomp.durationMs
          } : null
        });
      }

      self.postMessage({ type: 'result', id, payload: { results } });
      return;
    }

    throw new Error(`Unknown message type: ${type}`);
  } catch (err) {
    self.postMessage({
      type: 'error',
      id,
      error: err.message || String(err)
    });
  }
};
