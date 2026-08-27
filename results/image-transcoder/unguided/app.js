import createImageTranscoder from './module.mjs';

// State
let Module = null;
let currentSourceData = null; // Uint8Array of original image file
let currentFileName = 'geometry_pattern.png';
let originalDecoded = null;   // { width, height, rgba }
let lastTranscodeResult = null;

// UI Options
const state = {
  viewMode: 'sideBySide',
  splitRatio: 0.5,
  isDraggingSplit: false,

  format: 'png',
  quality: 85,
  pngCompression: 6,

  scale: 100,
  targetWidth: 0,
  targetHeight: 0,
  lockAspect: true,
  resizeAlgo: 'mitchell',

  rotation: 0,
  flipH: false,
  flipV: false,

  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  gamma: 100,

  grayscale: false,
  sepia: false,
  invert: false,
  blurRadius: 0,
  sharpenAmount: 0,
  sobel: false,
  emboss: false,
  vignetteIntensity: 0,
  vignetteRadius: 50,
  pixelateSize: 0,
  posterizeLevels: 0,
  threshold: -1,
  dither: 'none',
};

// DOM Elements
const engineStatus = document.getElementById('engineStatus');
const engineStatusText = document.getElementById('engineStatusText');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

const canvasOriginal = document.getElementById('canvasOriginal');
const canvasTranscoded = document.getElementById('canvasTranscoded');
const canvasSplit = document.getElementById('canvasSplit');
const canvasHistogram = document.getElementById('canvasHistogram');

const originalMeta = document.getElementById('originalMeta');
const transcodedMeta = document.getElementById('transcodedMeta');
const metricTime = document.getElementById('metricTime');
const metricOrigSize = document.getElementById('metricOrigSize');
const metricTransSize = document.getElementById('metricTransSize');
const metricDelta = document.getElementById('metricDelta');

const sideBySideContainer = document.getElementById('sideBySideContainer');
const splitViewContainer = document.getElementById('splitViewContainer');
const splitSliderLine = document.getElementById('splitSliderLine');
const splitCanvasWrapper = document.getElementById('splitCanvasWrapper');

const selectFormat = document.getElementById('selectFormat');
const groupJpegQuality = document.getElementById('groupJpegQuality');
const sliderQuality = document.getElementById('sliderQuality');
const valQuality = document.getElementById('valQuality');
const groupPngCompression = document.getElementById('groupPngCompression');
const sliderPngComp = document.getElementById('sliderPngComp');
const valPngComp = document.getElementById('valPngComp');
const formatInfoNote = document.getElementById('formatInfoNote');
const downloadFormatLabel = document.getElementById('downloadFormatLabel');

const sliderScale = document.getElementById('sliderScale');
const valScale = document.getElementById('valScale');
const inputWidth = document.getElementById('inputWidth');
const inputHeight = document.getElementById('inputHeight');
const chkLockAspect = document.getElementById('chkLockAspect');
const selectResizeAlgo = document.getElementById('selectResizeAlgo');

const btnRotCCW = document.getElementById('btnRotCCW');
const btnRotCW = document.getElementById('btnRotCW');
const btnRot180 = document.getElementById('btnRot180');
const btnFlipH = document.getElementById('btnFlipH');
const btnFlipV = document.getElementById('btnFlipV');

const sliderBrightness = document.getElementById('sliderBrightness');
const valBrightness = document.getElementById('valBrightness');
const sliderContrast = document.getElementById('sliderContrast');
const valContrast = document.getElementById('valContrast');
const sliderSaturation = document.getElementById('sliderSaturation');
const valSaturation = document.getElementById('valSaturation');
const sliderExposure = document.getElementById('sliderExposure');
const valExposure = document.getElementById('valExposure');
const sliderTemperature = document.getElementById('sliderTemperature');
const valTemperature = document.getElementById('valTemperature');
const sliderTint = document.getElementById('sliderTint');
const valTint = document.getElementById('valTint');
const sliderHue = document.getElementById('sliderHue');
const valHue = document.getElementById('valHue');
const sliderGamma = document.getElementById('sliderGamma');
const valGamma = document.getElementById('valGamma');
const btnResetColor = document.getElementById('btnResetColor');

const sliderBlur = document.getElementById('sliderBlur');
const valBlur = document.getElementById('valBlur');
const sliderSharpen = document.getElementById('sliderSharpen');
const valSharpen = document.getElementById('valSharpen');
const btnSobel = document.getElementById('btnSobel');
const btnEmboss = document.getElementById('btnEmboss');
const sliderVignette = document.getElementById('sliderVignette');
const valVignette = document.getElementById('valVignette');
const sliderPixelate = document.getElementById('sliderPixelate');
const valPixelate = document.getElementById('valPixelate');
const sliderPosterize = document.getElementById('sliderPosterize');
const valPosterize = document.getElementById('valPosterize');
const sliderThreshold = document.getElementById('sliderThreshold');
const valThreshold = document.getElementById('valThreshold');
const selectDither = document.getElementById('selectDither');

const btnZoomFit = document.getElementById('btnZoomFit');
const btnZoom100 = document.getElementById('btnZoom100');
const btnDownload = document.getElementById('btnDownload');
const btnCopyClipboard = document.getElementById('btnCopyClipboard');
const btnResetAll = document.getElementById('btnResetAll');

// Initialize WebAssembly
async function initWasm() {
  try {
    Module = await createImageTranscoder();
    engineStatusText.textContent = 'C++ WebAssembly Engine: Active';
    engineStatus.style.background = 'rgba(16, 185, 129, 0.15)';
    engineStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';

    // Load default sample
    await loadSample('geometry');
  } catch (err) {
    console.error('Failed to initialize WebAssembly module:', err);
    engineStatusText.textContent = 'WASM Init Failed';
    engineStatus.style.background = 'rgba(239, 68, 68, 0.15)';
    engineStatus.style.color = '#f87171';
  }
}

// Generate / Load Samples
async function loadSample(sampleName) {
  try {
    let url = '';
    if (sampleName === 'geometry') {
      url = 'presets/geometry.png';
      currentFileName = 'geometry_pattern.png';
    } else if (sampleName === 'gradient') {
      url = 'sample_gradient.bmp';
      currentFileName = 'gradient_sample.bmp';
    } else if (sampleName === 'photo') {
      url = 'presets/geometry.jpg';
      currentFileName = 'landscape_photo.jpg';
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      createProceduralSample();
      return;
    }
    const buf = await resp.arrayBuffer();
    loadImageBuffer(new Uint8Array(buf), currentFileName);
  } catch (e) {
    console.warn('Could not fetch sample, generating procedural sample:', e);
    createProceduralSample();
  }
}

function createProceduralSample() {
  const w = 256, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.5, '#7c3aed');
  grad.addColorStop(1, '#f43f5e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 70, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(128, 128, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('WASM Transcoder', 128, 220);

  canvas.toBlob((blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      loadImageBuffer(new Uint8Array(reader.result), 'procedural_sample.png');
    };
    reader.readAsArrayBuffer(blob);
  }, 'image/png');
}

// Load Image Buffer into Application
function loadImageBuffer(uint8Array, fileName) {
  if (!Module) return;
  currentSourceData = uint8Array;
  currentFileName = fileName || 'image.png';

  // Decode original RGBA using C++ engine
  const decodeRes = Module.decodeImage(currentSourceData);
  if (!decodeRes.success) {
    alert('Error decoding image: ' + decodeRes.errorMessage);
    return;
  }

  originalDecoded = {
    width: decodeRes.width,
    height: decodeRes.height,
    rgba: decodeRes.rgba
  };

  // Render original canvas
  canvasOriginal.width = originalDecoded.width;
  canvasOriginal.height = originalDecoded.height;
  const ctxOrig = canvasOriginal.getContext('2d');
  const imgDataOrig = new ImageData(new Uint8ClampedArray(originalDecoded.rgba), originalDecoded.width, originalDecoded.height);
  ctxOrig.putImageData(imgDataOrig, 0, 0);

  originalMeta.textContent = `${originalDecoded.width}×${originalDecoded.height} • ${formatBytes(currentSourceData.length)}`;

  // Reset target dimensions inputs
  if (state.scale === 100) {
    inputWidth.value = originalDecoded.width;
    inputHeight.value = originalDecoded.height;
  } else {
    updateDimensionsFromScale();
  }

  runTranscode();
}

// Execute C++ WASM Transcode
function runTranscode() {
  if (!Module || !currentSourceData) return;

  const targetW = state.targetWidth > 0 ? state.targetWidth : 0;
  const targetH = state.targetHeight > 0 ? state.targetHeight : 0;
  const scaleFloat = (targetW === 0 && targetH === 0) ? (state.scale / 100.0) : 1.0;

  const options = {
    format: state.format,
    quality: state.quality,
    pngCompression: state.pngCompression,
    targetWidth: targetW,
    targetHeight: targetH,
    scale: scaleFloat,
    resizeAlgo: state.resizeAlgo,

    rotation: state.rotation,
    flipH: state.flipH,
    flipV: state.flipV,

    brightness: state.brightness,
    contrast: state.contrast,
    saturation: state.saturation,
    exposure: state.exposure,
    temperature: state.temperature,
    tint: state.tint,
    hue: state.hue,
    gamma: state.gamma,

    grayscale: state.grayscale,
    sepia: state.sepia,
    invert: state.invert,
    sobel: state.sobel,
    emboss: state.emboss,

    blurRadius: state.blurRadius,
    sharpenAmount: state.sharpenAmount,
    vignetteIntensity: state.vignetteIntensity,
    vignetteRadius: state.vignetteRadius,
    pixelateSize: state.pixelateSize,
    posterizeLevels: state.posterizeLevels,
    threshold: state.threshold,
    dither: state.dither,
  };

  const startTime = performance.now();
  const res = Module.transcode(currentSourceData, options);
  const totalJsTime = performance.now() - startTime;

  if (!res.success) {
    console.error('Transcode failed:', res.errorMessage);
    metricTime.textContent = 'Error';
    return;
  }

  lastTranscodeResult = res;

  // Render Transcoded Canvas
  canvasTranscoded.width = res.outputWidth;
  canvasTranscoded.height = res.outputHeight;
  const ctxTrans = canvasTranscoded.getContext('2d');
  const imgDataTrans = new ImageData(res.previewRgba, res.outputWidth, res.outputHeight);
  ctxTrans.putImageData(imgDataTrans, 0, 0);

  // Update Metadata & Metrics
  transcodedMeta.textContent = `${res.outputWidth}×${res.outputHeight} • ${formatBytes(res.encodedSize)}`;
  metricTime.innerHTML = `⚡ ${res.processingTimeMs.toFixed(2)} ms <span style="font-size:0.7rem; font-weight:normal; color:var(--text-muted)">(total: ${totalJsTime.toFixed(1)}ms)</span>`;
  metricOrigSize.textContent = formatBytes(res.originalSize);
  metricTransSize.textContent = formatBytes(res.encodedSize);

  const delta = ((res.encodedSize - res.originalSize) / res.originalSize) * 100;
  metricDelta.textContent = (delta > 0 ? '+' : '') + delta.toFixed(1) + '%';
  metricDelta.style.color = delta <= 0 ? 'var(--success)' : 'var(--warning)';

  // Update Split View Canvas if active
  if (state.viewMode === 'split') {
    renderSplitView();
  }

  // Render Histogram
  if (res.histogram) {
    renderHistogram(res.histogram);
  }
}

// Render Split View Canvas
function renderSplitView() {
  if (!originalDecoded || !lastTranscodeResult) return;

  const w = lastTranscodeResult.outputWidth;
  const h = lastTranscodeResult.outputHeight;
  canvasSplit.width = w;
  canvasSplit.height = h;
  const ctx = canvasSplit.getContext('2d');

  const splitX = Math.floor(w * state.splitRatio);

  // Draw original image scaled to output size on left portion
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, h);
  ctx.clip();
  ctx.drawImage(canvasOriginal, 0, 0, w, h);
  ctx.restore();

  // Draw transcoded image on right portion
  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, 0, w - splitX, h);
  ctx.clip();
  ctx.drawImage(canvasTranscoded, 0, 0, w, h);
  ctx.restore();

  // Position split slider handle
  splitSliderLine.style.left = `${state.splitRatio * 100}%`;
}

// Render Histogram
function renderHistogram(hist) {
  const canvas = canvasHistogram;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  let maxCount = 1;
  for (let i = 0; i < 256; i++) {
    maxCount = Math.max(maxCount, hist.r[i], hist.g[i], hist.b[i], hist.luma[i]);
  }

  function drawChannel(data, color, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = h - (data[i] / maxCount) * (h - 4);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawChannel(hist.r, 'rgba(239, 68, 68, 0.8)', 'rgba(239, 68, 68, 0.1)');
  drawChannel(hist.g, 'rgba(34, 197, 94, 0.8)', 'rgba(34, 197, 94, 0.1)');
  drawChannel(hist.b, 'rgba(59, 130, 246, 0.8)', 'rgba(59, 130, 246, 0.1)');
  drawChannel(hist.luma, 'rgba(248, 250, 252, 0.6)', null);
}

// Helpers
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function updateDimensionsFromScale() {
  if (!originalDecoded) return;
  const factor = state.scale / 100.0;
  const newW = Math.max(1, Math.round(originalDecoded.width * factor));
  const newH = Math.max(1, Math.round(originalDecoded.height * factor));
  inputWidth.value = newW;
  inputHeight.value = newH;
  state.targetWidth = newW;
  state.targetHeight = newH;
}

let debounceTimer = null;
function scheduleTranscode() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runTranscode();
  }, 25);
}

// Event Listeners

// Drag & Drop
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    loadImageBuffer(new Uint8Array(reader.result), file.name);
  };
  reader.readAsArrayBuffer(file);
}

// Clipboard Paste
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) handleFile(file);
      break;
    }
  }
});

// Sample Buttons
document.querySelectorAll('.sample-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    loadSample(btn.getAttribute('data-sample'));
  });
});

// View Modes
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.viewMode = btn.getAttribute('data-mode');

    if (state.viewMode === 'sideBySide') {
      sideBySideContainer.style.display = 'grid';
      splitViewContainer.style.display = 'none';
      document.querySelectorAll('.canvas-card')[0].style.display = 'flex';
      document.querySelectorAll('.canvas-card')[1].style.display = 'flex';
    } else if (state.viewMode === 'split') {
      sideBySideContainer.style.display = 'none';
      splitViewContainer.style.display = 'flex';
      renderSplitView();
    } else if (state.viewMode === 'outputOnly') {
      sideBySideContainer.style.display = 'grid';
      splitViewContainer.style.display = 'none';
      document.querySelectorAll('.canvas-card')[0].style.display = 'none';
      document.querySelectorAll('.canvas-card')[1].style.display = 'flex';
    }
  });
});

// Split View Mouse / Touch Dragging
splitCanvasWrapper.addEventListener('mousedown', (e) => {
  state.isDraggingSplit = true;
  updateSplitRatio(e);
});
window.addEventListener('mousemove', (e) => {
  if (state.isDraggingSplit) {
    updateSplitRatio(e);
  }
});
window.addEventListener('mouseup', () => {
  state.isDraggingSplit = false;
});

function updateSplitRatio(e) {
  const rect = canvasSplit.getBoundingClientRect();
  if (rect.width <= 0) return;
  let ratio = (e.clientX - rect.left) / rect.width;
  ratio = Math.max(0.01, Math.min(0.99, ratio));
  state.splitRatio = ratio;
  renderSplitView();
}

// Zoom controls
btnZoomFit.addEventListener('click', () => {
  canvasOriginal.style.maxHeight = '440px';
  canvasTranscoded.style.maxHeight = '440px';
  canvasSplit.style.maxHeight = '440px';
  btnZoomFit.classList.add('btn-active');
  btnZoom100.classList.remove('btn-active');
});
btnZoom100.addEventListener('click', () => {
  canvasOriginal.style.maxHeight = 'none';
  canvasTranscoded.style.maxHeight = 'none';
  canvasSplit.style.maxHeight = 'none';
  btnZoom100.classList.add('btn-active');
  btnZoomFit.classList.remove('btn-active');
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const targetId = btn.getAttribute('data-tab');
    document.getElementById(targetId).classList.add('active');
  });
});

// Format Controls
selectFormat.addEventListener('change', () => {
  state.format = selectFormat.value;
  downloadFormatLabel.textContent = state.format.toUpperCase();

  if (state.format === 'jpeg') {
    groupJpegQuality.style.display = 'flex';
    groupPngCompression.style.display = 'none';
    formatInfoNote.textContent = 'JPEG provides high compression ratio suitable for photographs.';
  } else if (state.format === 'png') {
    groupJpegQuality.style.display = 'none';
    groupPngCompression.style.display = 'flex';
    formatInfoNote.textContent = 'PNG provides lossless compression with alpha channel transparency.';
  } else if (state.format === 'qoi') {
    groupJpegQuality.style.display = 'none';
    groupPngCompression.style.display = 'none';
    formatInfoNote.textContent = 'QOI (Quite OK Image) provides extremely fast lossless compression.';
  } else if (state.format === 'bmp') {
    groupJpegQuality.style.display = 'none';
    groupPngCompression.style.display = 'none';
    formatInfoNote.textContent = 'BMP saves uncompressed raw RGBA pixel data.';
  } else if (state.format === 'tga') {
    groupJpegQuality.style.display = 'none';
    groupPngCompression.style.display = 'none';
    formatInfoNote.textContent = 'TGA (Truevision Targa) format commonly used in game engines and graphics.';
  }
  runTranscode();
});

sliderQuality.addEventListener('input', () => {
  state.quality = parseInt(sliderQuality.value);
  valQuality.textContent = state.quality + '%';
  scheduleTranscode();
});

sliderPngComp.addEventListener('input', () => {
  state.pngCompression = parseInt(sliderPngComp.value);
  valPngComp.textContent = 'Level ' + state.pngCompression;
  scheduleTranscode();
});

// Geometry Controls
sliderScale.addEventListener('input', () => {
  state.scale = parseInt(sliderScale.value);
  valScale.textContent = state.scale + '%';
  updateDimensionsFromScale();
  scheduleTranscode();
});

document.querySelectorAll('[data-scale]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.scale = parseInt(btn.getAttribute('data-scale'));
    sliderScale.value = state.scale;
    valScale.textContent = state.scale + '%';
    updateDimensionsFromScale();
    runTranscode();
  });
});

inputWidth.addEventListener('input', () => {
  const w = parseInt(inputWidth.value) || 0;
  state.targetWidth = w;
  if (state.lockAspect && originalDecoded && originalDecoded.width > 0 && w > 0) {
    const h = Math.round((w * originalDecoded.height) / originalDecoded.width);
    inputHeight.value = h;
    state.targetHeight = h;
  }
  scheduleTranscode();
});

inputHeight.addEventListener('input', () => {
  const h = parseInt(inputHeight.value) || 0;
  state.targetHeight = h;
  if (state.lockAspect && originalDecoded && originalDecoded.height > 0 && h > 0) {
    const w = Math.round((h * originalDecoded.width) / originalDecoded.height);
    inputWidth.value = w;
    state.targetWidth = w;
  }
  scheduleTranscode();
});

chkLockAspect.addEventListener('change', () => {
  state.lockAspect = chkLockAspect.checked;
});

selectResizeAlgo.addEventListener('change', () => {
  state.resizeAlgo = selectResizeAlgo.value;
  runTranscode();
});

// Rotations & Flips
btnRotCW.addEventListener('click', () => {
  state.rotation = (state.rotation + 90) % 360;
  runTranscode();
});
btnRotCCW.addEventListener('click', () => {
  state.rotation = (state.rotation + 270) % 360;
  runTranscode();
});
btnRot180.addEventListener('click', () => {
  state.rotation = (state.rotation + 180) % 360;
  runTranscode();
});
btnFlipH.addEventListener('click', () => {
  state.flipH = !state.flipH;
  btnFlipH.classList.toggle('btn-active', state.flipH);
  runTranscode();
});
btnFlipV.addEventListener('click', () => {
  state.flipV = !state.flipV;
  btnFlipV.classList.toggle('btn-active', state.flipV);
  runTranscode();
});

// Color Controls
function bindSlider(slider, labelEl, stateKey, suffix = '', divisor = 1) {
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    state[stateKey] = val;
    labelEl.textContent = (divisor !== 1 ? (val / divisor).toFixed(1) : val) + suffix;
    scheduleTranscode();
  });
}

bindSlider(sliderBrightness, valBrightness, 'brightness');
bindSlider(sliderContrast, valContrast, 'contrast');
bindSlider(sliderSaturation, valSaturation, 'saturation');
bindSlider(sliderExposure, valExposure, 'exposure');
bindSlider(sliderTemperature, valTemperature, 'temperature');
bindSlider(sliderTint, valTint, 'tint');
bindSlider(sliderHue, valHue, 'hue', '°');
bindSlider(sliderGamma, valGamma, 'gamma', '', 100);

btnResetColor.addEventListener('click', () => {
  state.brightness = 0; sliderBrightness.value = 0; valBrightness.textContent = '0';
  state.contrast = 0; sliderContrast.value = 0; valContrast.textContent = '0';
  state.saturation = 0; sliderSaturation.value = 0; valSaturation.textContent = '0';
  state.exposure = 0; sliderExposure.value = 0; valExposure.textContent = '0';
  state.temperature = 0; sliderTemperature.value = 0; valTemperature.textContent = '0';
  state.tint = 0; sliderTint.value = 0; valTint.textContent = '0';
  state.hue = 0; sliderHue.value = 0; valHue.textContent = '0°';
  state.gamma = 100; sliderGamma.value = 100; valGamma.textContent = '1.0';
  runTranscode();
});

// Filter Controls
bindSlider(sliderBlur, valBlur, 'blurRadius', ' px');
bindSlider(sliderSharpen, valSharpen, 'sharpenAmount', '%');
bindSlider(sliderVignette, valVignette, 'vignetteIntensity', '%');
bindSlider(sliderPixelate, valPixelate, 'pixelateSize', ' px');

sliderPosterize.addEventListener('input', () => {
  const val = parseInt(sliderPosterize.value);
  state.posterizeLevels = val;
  valPosterize.textContent = val > 0 ? val + ' levels' : 'Off';
  scheduleTranscode();
});

sliderThreshold.addEventListener('input', () => {
  const val = parseInt(sliderThreshold.value);
  state.threshold = val;
  valThreshold.textContent = val >= 0 ? val : 'Off';
  scheduleTranscode();
});

selectDither.addEventListener('change', () => {
  state.dither = selectDither.value;
  runTranscode();
});

btnSobel.addEventListener('click', () => {
  state.sobel = !state.sobel;
  btnSobel.classList.toggle('btn-active', state.sobel);
  runTranscode();
});

btnEmboss.addEventListener('click', () => {
  state.emboss = !state.emboss;
  btnEmboss.classList.toggle('btn-active', state.emboss);
  runTranscode();
});

// Preset Chips
document.querySelectorAll('.chip[data-preset]').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const preset = chip.getAttribute('data-preset');
    applyPreset(preset);
  });
});

function applyPreset(preset) {
  state.grayscale = false;
  state.sepia = false;
  state.invert = false;
  state.sobel = false;
  btnSobel.classList.remove('btn-active');
  state.emboss = false;
  btnEmboss.classList.remove('btn-active');
  state.blurRadius = 0; sliderBlur.value = 0; valBlur.textContent = '0 px';
  state.sharpenAmount = 0; sliderSharpen.value = 0; valSharpen.textContent = '0%';
  state.vignetteIntensity = 0; sliderVignette.value = 0; valVignette.textContent = '0%';
  state.pixelateSize = 0; sliderPixelate.value = 0; valPixelate.textContent = '0 px';
  state.posterizeLevels = 0; sliderPosterize.value = 0; valPosterize.textContent = 'Off';
  state.threshold = -1; sliderThreshold.value = -1; valThreshold.textContent = 'Off';
  state.dither = 'none'; selectDither.value = 'none';

  if (preset === 'grayscale') {
    state.grayscale = true;
  } else if (preset === 'sepia') {
    state.sepia = true;
  } else if (preset === 'invert') {
    state.invert = true;
  } else if (preset === 'vivid') {
    state.saturation = 40; sliderSaturation.value = 40; valSaturation.textContent = '40';
    state.contrast = 25; sliderContrast.value = 25; valContrast.textContent = '25';
    state.sharpenAmount = 30; sliderSharpen.value = 30; valSharpen.textContent = '30%';
  } else if (preset === 'cyberpunk') {
    state.hue = 280; sliderHue.value = 280; valHue.textContent = '280°';
    state.contrast = 35; sliderContrast.value = 35; valContrast.textContent = '35';
    state.saturation = 50; sliderSaturation.value = 50; valSaturation.textContent = '50';
  } else if (preset === 'vintage') {
    state.sepia = true;
    state.vignetteIntensity = 60; sliderVignette.value = 60; valVignette.textContent = '60%';
    state.contrast = 15; sliderContrast.value = 15; valContrast.textContent = '15';
  } else if (preset === 'dither') {
    state.dither = 'monochrome';
    selectDither.value = 'monochrome';
  }

  runTranscode();
}

// Download Processed Image
btnDownload.addEventListener('click', () => {
  if (!lastTranscodeResult || !lastTranscodeResult.encodedData) return;

  const ext = state.format === 'jpeg' ? 'jpg' : state.format;
  let mime = 'application/octet-stream';
  if (state.format === 'png') mime = 'image/png';
  else if (state.format === 'jpeg') mime = 'image/jpeg';
  else if (state.format === 'bmp') mime = 'image/bmp';
  else if (state.format === 'qoi') mime = 'image/qoi';

  const blob = new Blob([lastTranscodeResult.encodedData], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const baseName = currentFileName.substring(0, currentFileName.lastIndexOf('.')) || currentFileName;
  a.download = `${baseName}_transcoded.${ext}`;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Copy to Clipboard
btnCopyClipboard.addEventListener('click', () => {
  canvasTranscoded.toBlob(blob => {
    if (!blob) return;
    navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]).then(() => {
      btnCopyClipboard.textContent = '✓ Copied!';
      setTimeout(() => btnCopyClipboard.textContent = '📋 Copy', 1500);
    }).catch(err => {
      console.warn('Clipboard write failed:', err);
      alert('Unable to copy image to clipboard');
    });
  }, 'image/png');
});

// Reset All
btnResetAll.addEventListener('click', () => {
  state.format = 'png'; selectFormat.value = 'png';
  state.quality = 85; sliderQuality.value = 85; valQuality.textContent = '85%';
  state.pngCompression = 6; sliderPngComp.value = 6; valPngComp.textContent = 'Level 6';
  groupJpegQuality.style.display = 'none';
  groupPngCompression.style.display = 'flex';

  state.scale = 100; sliderScale.value = 100; valScale.textContent = '100%';
  state.targetWidth = 0; state.targetHeight = 0;
  if (originalDecoded) {
    inputWidth.value = originalDecoded.width;
    inputHeight.value = originalDecoded.height;
  }
  state.resizeAlgo = 'mitchell'; selectResizeAlgo.value = 'mitchell';

  state.rotation = 0;
  state.flipH = false; btnFlipH.classList.remove('btn-active');
  state.flipV = false; btnFlipV.classList.remove('btn-active');

  btnResetColor.click();
  applyPreset('none');
});

// Start
initWasm();
