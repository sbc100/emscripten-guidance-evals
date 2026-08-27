import createAudioProcessorModule from './module.mjs';

// Application State
let Module = null;
let audioProcessor = null;
let audioCtx = null;
let scriptNode = null;
let analyser = null;
let masterGainNode = null;
let isPlaying = false;
let procBufPtr = null;
const BUFFER_SIZE = 2048;

// Current Parameter Values
const state = {
    waveform: 0, // 0: Sine, 1: Square, 2: Triangle, 3: Saw, 4: White, 5: Pink, 6: Pulse
    frequency: 440.0,
    amplitude: 0.7,
    pulseWidth: 0.5,
    fmFreq: 0.0,
    fmDepth: 0.0,
    filterType: 0, // 0: LP, 1: HP, 2: BP, 3: Notch
    filterCutoff: 2500.0,
    filterQ: 1.0,
    filterEnabled: false,
    delayEnabled: false,
    delayTimeMs: 300.0,
    delayFeedback: 0.45,
    delayWet: 0.4,
    distEnabled: false,
    distDrive: 4.0,
    bitcrushEnabled: false,
    bitcrushBits: 8,
    bitcrushDownsample: 1,
    attackMs: 15.0,
    decayMs: 150.0,
    sustainLvl: 0.8,
    releaseMs: 300.0,
    visMode: 'oscilloscope', // oscilloscope, spectrum, radial
    lastExecutionTimeUs: 0
};

// Note Frequencies Table (C3 to B4)
const NOTE_FREQS = {
    'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81,
    'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00,
    'A#3': 233.08, 'B3': 246.94, 'C4': 261.63, 'C#4': 277.18, 'D4': 293.66,
    'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00,
    'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88, 'C5': 523.25
};

const KEY_MAP = {
    'KeyA': 'C4', 'KeyW': 'C#4', 'KeyS': 'D4', 'KeyE': 'D#4', 'KeyD': 'E4',
    'KeyF': 'F4', 'KeyT': 'F#4', 'KeyG': 'G4', 'KeyY': 'G#4', 'KeyH': 'A4',
    'KeyU': 'A#4', 'KeyJ': 'B4', 'KeyK': 'C5'
};

const activeKeys = new Set();

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    const wasmDot = document.getElementById('wasmDot');
    const wasmText = document.getElementById('wasmText');

    try {
        wasmText.textContent = 'WASM: Loading...';
        Module = await createAudioProcessorModule();
        wasmDot.classList.add('active');
        wasmText.textContent = 'WASM: Ready (SIMD/O3)';

        // Allocate buffer for audio streaming
        procBufPtr = Module._malloc(BUFFER_SIZE * 4);

        setupEventListeners();
        setupKeyboard();
        setupVisualizer();
        applyAllParametersToWasm();
    } catch (err) {
        console.error('Failed to load WASM module:', err);
        wasmDot.classList.add('error');
        wasmText.textContent = 'WASM: Error loading module';
    }
}

// ============================================================================
// Web Audio Context & Streaming
// ============================================================================

function initAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();

        // Create WASM processor
        audioProcessor = Module._create_audio_processor(audioCtx.sampleRate);

        // Analyser for visualizer
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;

        // Master Gain
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = state.amplitude;

        // ScriptProcessorNode for real-time WASM DSP processing
        scriptNode = audioCtx.createScriptProcessor(BUFFER_SIZE, 0, 2);
        scriptNode.onaudioprocess = onAudioProcess;

        // Connect graph
        scriptNode.connect(analyser);
        analyser.connect(masterGainNode);
        masterGainNode.connect(audioCtx.destination);

        const audioDot = document.getElementById('audioDot');
        const audioText = document.getElementById('audioText');
        audioDot.classList.add('active');
        audioText.textContent = `Audio: ${audioCtx.sampleRate} Hz`;

        applyAllParametersToWasm();
    }

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function onAudioProcess(e) {
    const leftOut = e.outputBuffer.getChannelData(0);
    const rightOut = e.outputBuffer.getChannelData(1);

    if (!isPlaying && activeKeys.size === 0) {
        leftOut.fill(0);
        rightOut.fill(0);
        return;
    }

    const t0 = performance.now();
    // Process block in WebAssembly
    Module._processor_process(audioProcessor, procBufPtr, BUFFER_SIZE);
    const t1 = performance.now();
    state.lastExecutionTimeUs = (t1 - t0) * 1000;

    // Read float samples from WASM heap
    const heapOffset = procBufPtr / 4;
    const wasmOutput = Module.HEAPF32.subarray(heapOffset, heapOffset + BUFFER_SIZE);

    // Copy to Web Audio channels
    leftOut.set(wasmOutput);
    rightOut.set(wasmOutput);
}

// ============================================================================
// Parameter Synchronization to C++ WASM
// ============================================================================

function applyAllParametersToWasm() {
    if (!audioProcessor || !Module) return;

    Module._processor_set_waveform(audioProcessor, state.waveform);
    Module._processor_set_frequency(audioProcessor, state.frequency);
    Module._processor_set_amplitude(audioProcessor, state.amplitude);
    Module._processor_set_pulse_width(audioProcessor, state.pulseWidth);
    Module._processor_set_fm(audioProcessor, state.fmFreq, state.fmDepth);
    Module._processor_set_filter(
        audioProcessor,
        state.filterType,
        state.filterCutoff,
        state.filterQ,
        state.filterEnabled ? 1 : 0
    );
    Module._processor_set_delay(
        audioProcessor,
        state.delayEnabled ? 1 : 0,
        state.delayTimeMs,
        state.delayFeedback,
        state.delayWet
    );
    Module._processor_set_distortion(
        audioProcessor,
        state.distEnabled ? 1 : 0,
        state.distDrive
    );
    Module._processor_set_bitcrush(
        audioProcessor,
        state.bitcrushEnabled ? 1 : 0,
        state.bitcrushBits,
        state.bitcrushDownsample
    );
    Module._processor_set_adsr(
        audioProcessor,
        state.attackMs,
        state.decayMs,
        state.sustainLvl,
        state.releaseMs
    );
}

// ============================================================================
// UI Event Handlers
// ============================================================================

function setupEventListeners() {
    // Play / Stop Master Button
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');

    playBtn.addEventListener('click', () => {
        initAudioContext();
        isPlaying = true;
        playBtn.classList.add('active');
        playBtn.textContent = '🔊 Playing...';
    });

    stopBtn.addEventListener('click', () => {
        isPlaying = false;
        playBtn.classList.remove('active');
        playBtn.textContent = '▶ Play Continuous Tone';
        if (audioProcessor) {
            Module._processor_reset(audioProcessor);
        }
    });

    // Waveform Selector Buttons
    const waveBtns = document.querySelectorAll('.wave-btn');
    waveBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            waveBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.waveform = parseInt(btn.dataset.wave, 10);
            if (audioProcessor) {
                Module._processor_set_waveform(audioProcessor, state.waveform);
            }
            updatePulseWidthVisibility();
        });
    });

    // Master Volume Slider
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeVal = document.getElementById('volumeVal');
    volumeSlider.addEventListener('input', (e) => {
        state.amplitude = parseFloat(e.target.value);
        volumeVal.textContent = `${Math.round(state.amplitude * 100)}%`;
        if (masterGainNode) {
            masterGainNode.gain.setValueAtTime(state.amplitude, audioCtx.currentTime);
        }
        if (audioProcessor) {
            Module._processor_set_amplitude(audioProcessor, state.amplitude);
        }
    });

    // Frequency Slider
    const freqSlider = document.getElementById('freqSlider');
    const freqVal = document.getElementById('freqVal');
    const noteName = document.getElementById('noteName');

    const updateFrequency = (freq) => {
        state.frequency = freq;
        freqVal.textContent = `${freq.toFixed(1)} Hz`;
        noteName.textContent = freqToNote(freq);
        if (audioProcessor) {
            Module._processor_set_frequency(audioProcessor, state.frequency);
        }
    };

    freqSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        // Exponential frequency scale for smooth audio tuning
        const freq = 20 * Math.pow(10, val * 2.39794); // 20 Hz to ~5000 Hz
        updateFrequency(freq);
    });

    // Quick Octave Buttons
    document.getElementById('octaveDown').addEventListener('click', () => {
        let f = Math.max(20, state.frequency * 0.5);
        updateFreqSliderFromFreq(f);
        updateFrequency(f);
    });

    document.getElementById('octaveUp').addEventListener('click', () => {
        let f = Math.min(10000, state.frequency * 2.0);
        updateFreqSliderFromFreq(f);
        updateFrequency(f);
    });

    // Pulse Width
    const pwSlider = document.getElementById('pwSlider');
    const pwVal = document.getElementById('pwVal');
    pwSlider.addEventListener('input', (e) => {
        state.pulseWidth = parseFloat(e.target.value) / 100.0;
        pwVal.textContent = `${e.target.value}%`;
        if (audioProcessor) {
            Module._processor_set_pulse_width(audioProcessor, state.pulseWidth);
        }
    });

    // FM Synthesis Controls
    const fmFreqSlider = document.getElementById('fmFreqSlider');
    const fmFreqVal = document.getElementById('fmFreqVal');
    const fmDepthSlider = document.getElementById('fmDepthSlider');
    const fmDepthVal = document.getElementById('fmDepthVal');

    const updateFM = () => {
        if (audioProcessor) {
            Module._processor_set_fm(audioProcessor, state.fmFreq, state.fmDepth);
        }
    };

    fmFreqSlider.addEventListener('input', (e) => {
        state.fmFreq = parseFloat(e.target.value);
        fmFreqVal.textContent = `${state.fmFreq} Hz`;
        updateFM();
    });

    fmDepthSlider.addEventListener('input', (e) => {
        state.fmDepth = parseFloat(e.target.value);
        fmDepthVal.textContent = `${state.fmDepth} Hz`;
        updateFM();
    });

    // Biquad Filter Controls
    const filterToggle = document.getElementById('filterToggle');
    const filterTypeSelect = document.getElementById('filterTypeSelect');
    const cutoffSlider = document.getElementById('cutoffSlider');
    const cutoffVal = document.getElementById('cutoffVal');
    const qSlider = document.getElementById('qSlider');
    const qVal = document.getElementById('qVal');

    const updateFilter = () => {
        if (audioProcessor) {
            Module._processor_set_filter(
                audioProcessor,
                state.filterType,
                state.filterCutoff,
                state.filterQ,
                state.filterEnabled ? 1 : 0
            );
        }
    };

    filterToggle.addEventListener('change', (e) => {
        state.filterEnabled = e.target.checked;
        updateFilter();
    });

    filterTypeSelect.addEventListener('change', (e) => {
        state.filterType = parseInt(e.target.value, 10);
        updateFilter();
    });

    cutoffSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.filterCutoff = 20 * Math.pow(1000, val); // 20 Hz to 20,000 Hz
        cutoffVal.textContent = state.filterCutoff < 1000
            ? `${Math.round(state.filterCutoff)} Hz`
            : `${(state.filterCutoff / 1000).toFixed(2)} kHz`;
        updateFilter();
    });

    qSlider.addEventListener('input', (e) => {
        state.filterQ = parseFloat(e.target.value);
        qVal.textContent = state.filterQ.toFixed(1);
        updateFilter();
    });

    // Delay Controls
    const delayToggle = document.getElementById('delayToggle');
    const delayTimeSlider = document.getElementById('delayTimeSlider');
    const delayTimeVal = document.getElementById('delayTimeVal');
    const delayFeedbackSlider = document.getElementById('delayFeedbackSlider');
    const delayFeedbackVal = document.getElementById('delayFeedbackVal');
    const delayMixSlider = document.getElementById('delayMixSlider');
    const delayMixVal = document.getElementById('delayMixVal');

    const updateDelay = () => {
        if (audioProcessor) {
            Module._processor_set_delay(
                audioProcessor,
                state.delayEnabled ? 1 : 0,
                state.delayTimeMs,
                state.delayFeedback,
                state.delayWet
            );
        }
    };

    delayToggle.addEventListener('change', (e) => {
        state.delayEnabled = e.target.checked;
        updateDelay();
    });

    delayTimeSlider.addEventListener('input', (e) => {
        state.delayTimeMs = parseFloat(e.target.value);
        delayTimeVal.textContent = `${Math.round(state.delayTimeMs)} ms`;
        updateDelay();
    });

    delayFeedbackSlider.addEventListener('input', (e) => {
        state.delayFeedback = parseFloat(e.target.value) / 100.0;
        delayFeedbackVal.textContent = `${e.target.value}%`;
        updateDelay();
    });

    delayMixSlider.addEventListener('input', (e) => {
        state.delayWet = parseFloat(e.target.value) / 100.0;
        delayMixVal.textContent = `${e.target.value}%`;
        updateDelay();
    });

    // Distortion Controls
    const distToggle = document.getElementById('distToggle');
    const distDriveSlider = document.getElementById('distDriveSlider');
    const distDriveVal = document.getElementById('distDriveVal');

    const updateDistortion = () => {
        if (audioProcessor) {
            Module._processor_set_distortion(
                audioProcessor,
                state.distEnabled ? 1 : 0,
                state.distDrive
            );
        }
    };

    distToggle.addEventListener('change', (e) => {
        state.distEnabled = e.target.checked;
        updateDistortion();
    });

    distDriveSlider.addEventListener('input', (e) => {
        state.distDrive = parseFloat(e.target.value);
        distDriveVal.textContent = `${state.distDrive.toFixed(1)}x`;
        updateDistortion();
    });

    // Bitcrusher Controls
    const bitcrushToggle = document.getElementById('bitcrushToggle');
    const bitDepthSlider = document.getElementById('bitDepthSlider');
    const bitDepthVal = document.getElementById('bitDepthVal');
    const downsampleSlider = document.getElementById('downsampleSlider');
    const downsampleVal = document.getElementById('downsampleVal');

    const updateBitcrush = () => {
        if (audioProcessor) {
            Module._processor_set_bitcrush(
                audioProcessor,
                state.bitcrushEnabled ? 1 : 0,
                state.bitcrushBits,
                state.bitcrushDownsample
            );
        }
    };

    bitcrushToggle.addEventListener('change', (e) => {
        state.bitcrushEnabled = e.target.checked;
        updateBitcrush();
    });

    bitDepthSlider.addEventListener('input', (e) => {
        state.bitcrushBits = parseInt(e.target.value, 10);
        bitDepthVal.textContent = `${state.bitcrushBits}-bit`;
        updateBitcrush();
    });

    downsampleSlider.addEventListener('input', (e) => {
        state.bitcrushDownsample = parseInt(e.target.value, 10);
        downsampleVal.textContent = `${state.bitcrushDownsample}x`;
        updateBitcrush();
    });

    // ADSR Envelope Controls
    const attackSlider = document.getElementById('attackSlider');
    const attackVal = document.getElementById('attackVal');
    const decaySlider = document.getElementById('decaySlider');
    const decayVal = document.getElementById('decayVal');
    const sustainSlider = document.getElementById('sustainSlider');
    const sustainVal = document.getElementById('sustainVal');
    const releaseSlider = document.getElementById('releaseSlider');
    const releaseVal = document.getElementById('releaseVal');

    const updateADSR = () => {
        if (audioProcessor) {
            Module._processor_set_adsr(
                audioProcessor,
                state.attackMs,
                state.decayMs,
                state.sustainLvl,
                state.releaseMs
            );
        }
    };

    attackSlider.addEventListener('input', (e) => {
        state.attackMs = parseFloat(e.target.value);
        attackVal.textContent = `${Math.round(state.attackMs)} ms`;
        updateADSR();
    });

    decaySlider.addEventListener('input', (e) => {
        state.decayMs = parseFloat(e.target.value);
        decayVal.textContent = `${Math.round(state.decayMs)} ms`;
        updateADSR();
    });

    sustainSlider.addEventListener('input', (e) => {
        state.sustainLvl = parseFloat(e.target.value) / 100.0;
        sustainVal.textContent = `${e.target.value}%`;
        updateADSR();
    });

    releaseSlider.addEventListener('input', (e) => {
        state.releaseMs = parseFloat(e.target.value);
        releaseVal.textContent = `${Math.round(state.releaseMs)} ms`;
        updateADSR();
    });

    // Visualizer Tab Switching
    const visTabs = document.querySelectorAll('.vis-tab');
    visTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            visTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.visMode = tab.dataset.mode;
        });
    });

    // Sound Presets
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            loadPreset(btn.dataset.preset);
        });
    });

    // One-Shot Tone Generator & Exporter
    document.getElementById('renderBufferBtn').addEventListener('click', renderAndPlayBuffer);
    document.getElementById('exportWavBtn').addEventListener('click', exportWaveFile);

    // Audio File DSP Processor
    const fileInput = document.getElementById('audioFileInput');
    const dropzone = document.getElementById('dropzone');
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent-cyan)';
    });
    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--border-color)';
    });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length > 0) {
            processAudioFile(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            processAudioFile(e.target.files[0]);
        }
    });
}

function updatePulseWidthVisibility() {
    const pwContainer = document.getElementById('pulseWidthControl');
    if (pwContainer) {
        pwContainer.style.display = (state.waveform === 6) ? 'flex' : 'none';
    }
}

function updateFreqSliderFromFreq(freq) {
    const freqSlider = document.getElementById('freqSlider');
    const norm = Math.log10(freq / 20) / 2.39794;
    freqSlider.value = Math.max(0, Math.min(1, norm));
}

function freqToNote(freq) {
    const A4 = 440;
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const semi = Math.round(12 * Math.log2(freq / A4)) + 69;
    const note = notes[semi % 12];
    const oct = Math.floor(semi / 12) - 1;
    return `${note}${oct}`;
}

// ============================================================================
// Virtual Piano Keyboard
// ============================================================================

function setupKeyboard() {
    const pianoKeysContainer = document.getElementById('pianoKeys');
    pianoKeysContainer.innerHTML = '';

    const whiteKeys = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
    const blackKeyPairs = [
        { note: 'C#3', after: 0 },
        { note: 'D#3', after: 1 },
        { note: 'F#3', after: 3 },
        { note: 'G#3', after: 4 },
        { note: 'A#3', after: 5 },
        { note: 'C#4', after: 7 },
        { note: 'D#4', after: 8 },
        { note: 'F#4', after: 10 },
        { note: 'G#4', after: 11 },
        { note: 'A#4', after: 12 }
    ];

    whiteKeys.forEach(note => {
        const key = document.createElement('div');
        key.className = 'key-white';
        key.dataset.note = note;
        key.textContent = note;
        pianoKeysContainer.appendChild(key);
    });

    const whiteElements = pianoKeysContainer.querySelectorAll('.key-white');
    blackKeyPairs.forEach(bp => {
        const key = document.createElement('div');
        key.className = 'key-black';
        key.dataset.note = bp.note;
        key.textContent = bp.note.replace('#', '♯');

        const refWhite = whiteElements[bp.after];
        if (refWhite) {
            const leftOffset = refWhite.offsetLeft + refWhite.offsetWidth;
            key.style.left = `${leftOffset}px`;
        }
        pianoKeysContainer.appendChild(key);
    });

    // Pointer events for touch & mouse
    const triggerNoteOn = (note) => {
        initAudioContext();
        activeKeys.add(note);
        const freq = NOTE_FREQS[note];
        if (freq && audioProcessor) {
            Module._processor_note_on(audioProcessor, freq, 0.85);
            state.frequency = freq;
            document.getElementById('freqVal').textContent = `${freq.toFixed(1)} Hz`;
            document.getElementById('noteName').textContent = note;
        }
        highlightKey(note, true);
    };

    const triggerNoteOff = (note) => {
        activeKeys.delete(note);
        if (activeKeys.size === 0 && audioProcessor) {
            Module._processor_note_off(audioProcessor);
        }
        highlightKey(note, false);
    };

    const allKeys = pianoKeysContainer.querySelectorAll('.key-white, .key-black');
    allKeys.forEach(k => {
        k.addEventListener('mousedown', (e) => {
            e.preventDefault();
            triggerNoteOn(k.dataset.note);
        });
        k.addEventListener('mouseup', () => triggerNoteOff(k.dataset.note));
        k.addEventListener('mouseleave', () => triggerNoteOff(k.dataset.note));

        k.addEventListener('touchstart', (e) => {
            e.preventDefault();
            triggerNoteOn(k.dataset.note);
        });
        k.addEventListener('touchend', (e) => {
            e.preventDefault();
            triggerNoteOff(k.dataset.note);
        });
    });

    // Computer keyboard listeners
    window.addEventListener('keydown', (e) => {
        if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        const note = KEY_MAP[e.code];
        if (note && !activeKeys.has(note)) {
            triggerNoteOn(note);
        }
    });

    window.addEventListener('keyup', (e) => {
        const note = KEY_MAP[e.code];
        if (note) {
            triggerNoteOff(note);
        }
    });
}

function highlightKey(note, active) {
    const keyEl = document.querySelector(`[data-note="${note}"]`);
    if (keyEl) {
        if (active) keyEl.classList.add('active');
        else keyEl.classList.remove('active');
    }
}

// ============================================================================
// Sound Presets
// ============================================================================

function loadPreset(name) {
    initAudioContext();
    switch (name) {
        case 'synth_lead':
            setWaveformUI(3); // Sawtooth
            state.frequency = 440;
            state.filterEnabled = true;
            state.filterType = 0; // Lowpass
            state.filterCutoff = 3200;
            state.filterQ = 3.5;
            state.delayEnabled = true;
            state.delayTimeMs = 280;
            state.delayFeedback = 0.45;
            state.delayWet = 0.35;
            state.distEnabled = true;
            state.distDrive = 3.2;
            state.bitcrushEnabled = false;
            state.attackMs = 10;
            state.decayMs = 200;
            state.sustainLvl = 0.7;
            state.releaseMs = 350;
            break;

        case 'chiptune':
            setWaveformUI(6); // Pulse
            state.pulseWidth = 0.25;
            state.frequency = 523.25;
            state.filterEnabled = false;
            state.delayEnabled = false;
            state.distEnabled = false;
            state.bitcrushEnabled = true;
            state.bitcrushBits = 4;
            state.bitcrushDownsample = 2;
            state.attackMs = 5;
            state.decayMs = 80;
            state.sustainLvl = 0.5;
            state.releaseMs = 100;
            break;

        case 'ambient_pad':
            setWaveformUI(2); // Triangle
            state.frequency = 220;
            state.filterEnabled = true;
            state.filterType = 0; // Lowpass
            state.filterCutoff = 1200;
            state.filterQ = 2.0;
            state.delayEnabled = true;
            state.delayTimeMs = 450;
            state.delayFeedback = 0.65;
            state.delayWet = 0.55;
            state.distEnabled = false;
            state.bitcrushEnabled = false;
            state.attackMs = 300;
            state.decayMs = 500;
            state.sustainLvl = 0.85;
            state.releaseMs = 800;
            break;

        case 'fm_bell':
            setWaveformUI(0); // Sine
            state.frequency = 880;
            state.fmFreq = 440;
            state.fmDepth = 800;
            state.filterEnabled = false;
            state.delayEnabled = true;
            state.delayTimeMs = 350;
            state.delayFeedback = 0.5;
            state.delayWet = 0.4;
            state.distEnabled = false;
            state.bitcrushEnabled = false;
            state.attackMs = 5;
            state.decayMs = 800;
            state.sustainLvl = 0.1;
            state.releaseMs = 600;
            break;

        case 'cyber_bass':
            setWaveformUI(1); // Square
            state.frequency = 110;
            state.filterEnabled = true;
            state.filterType = 0; // Lowpass
            state.filterCutoff = 800;
            state.filterQ = 5.0;
            state.distEnabled = true;
            state.distDrive = 8.0;
            state.delayEnabled = false;
            state.bitcrushEnabled = false;
            state.attackMs = 15;
            state.decayMs = 250;
            state.sustainLvl = 0.4;
            state.releaseMs = 180;
            break;
    }

    syncUIToState();
    applyAllParametersToWasm();
}

function setWaveformUI(type) {
    state.waveform = type;
    document.querySelectorAll('.wave-btn').forEach(btn => {
        if (parseInt(btn.dataset.wave, 10) === type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    updatePulseWidthVisibility();
}

function syncUIToState() {
    updateFreqSliderFromFreq(state.frequency);
    document.getElementById('freqVal').textContent = `${state.frequency.toFixed(1)} Hz`;
    document.getElementById('noteName').textContent = freqToNote(state.frequency);

    document.getElementById('filterToggle').checked = state.filterEnabled;
    document.getElementById('filterTypeSelect').value = state.filterType;
    document.getElementById('cutoffVal').textContent = state.filterCutoff < 1000
        ? `${Math.round(state.filterCutoff)} Hz`
        : `${(state.filterCutoff / 1000).toFixed(2)} kHz`;

    document.getElementById('delayToggle').checked = state.delayEnabled;
    document.getElementById('delayTimeSlider').value = state.delayTimeMs;
    document.getElementById('delayTimeVal').textContent = `${Math.round(state.delayTimeMs)} ms`;
    document.getElementById('delayFeedbackSlider').value = Math.round(state.delayFeedback * 100);
    document.getElementById('delayFeedbackVal').textContent = `${Math.round(state.delayFeedback * 100)}%`;
    document.getElementById('delayMixSlider').value = Math.round(state.delayWet * 100);
    document.getElementById('delayMixVal').textContent = `${Math.round(state.delayWet * 100)}%`;

    document.getElementById('distToggle').checked = state.distEnabled;
    document.getElementById('distDriveSlider').value = state.distDrive;
    document.getElementById('distDriveVal').textContent = `${state.distDrive.toFixed(1)}x`;

    document.getElementById('bitcrushToggle').checked = state.bitcrushEnabled;
    document.getElementById('bitDepthSlider').value = state.bitcrushBits;
    document.getElementById('bitDepthVal').textContent = `${state.bitcrushBits}-bit`;
    document.getElementById('downsampleSlider').value = state.bitcrushDownsample;
    document.getElementById('downsampleVal').textContent = `${state.bitcrushDownsample}x`;

    document.getElementById('attackSlider').value = state.attackMs;
    document.getElementById('attackVal').textContent = `${Math.round(state.attackMs)} ms`;
    document.getElementById('decaySlider').value = state.decayMs;
    document.getElementById('decayVal').textContent = `${Math.round(state.decayMs)} ms`;
    document.getElementById('sustainSlider').value = Math.round(state.sustainLvl * 100);
    document.getElementById('sustainVal').textContent = `${Math.round(state.sustainLvl * 100)}%`;
    document.getElementById('releaseSlider').value = state.releaseMs;
    document.getElementById('releaseVal').textContent = `${Math.round(state.releaseMs)} ms`;
}

// ============================================================================
// One-Shot Tone Generator & WAV Exporter
// ============================================================================

function generateToneBuffer(durationSec = 2.0) {
    if (!Module) return null;
    initAudioContext();

    const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;
    const numSamples = Math.floor(sampleRate * durationSec);
    const bufSize = numSamples * 4;
    const bufPtr = Module._malloc(bufSize);

    // 1. Generate base waveform
    Module._generate_waveform(bufPtr, numSamples, sampleRate, state.waveform, state.frequency, state.amplitude);

    // 2. Apply ADSR envelope
    Module._apply_adsr(bufPtr, numSamples, sampleRate, state.attackMs, state.decayMs, state.sustainLvl, state.releaseMs);

    // 3. Apply Distortion if enabled
    if (state.distEnabled) {
        Module._apply_distortion(bufPtr, numSamples, state.distDrive);
    }

    // 4. Apply Filter if enabled
    if (state.filterEnabled) {
        Module._apply_biquad_filter(bufPtr, numSamples, sampleRate, state.filterType, state.filterCutoff, state.filterQ);
    }

    // 5. Apply Delay if enabled
    if (state.delayEnabled) {
        Module._apply_delay(bufPtr, numSamples, sampleRate, state.delayTimeMs, state.delayFeedback, state.delayWet);
    }

    // Copy to JS Float32Array
    const heapOffset = bufPtr / 4;
    const outputSamples = new Float32Array(Module.HEAPF32.subarray(heapOffset, heapOffset + numSamples));

    Module._free(bufPtr);

    // Create Web Audio Buffer
    const audioBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    audioBuffer.getChannelData(0).set(outputSamples);

    return { audioBuffer, samples: outputSamples, sampleRate };
}

function renderAndPlayBuffer() {
    const result = generateToneBuffer(2.0);
    if (!result) return;

    const source = audioCtx.createBufferSource();
    source.buffer = result.audioBuffer;
    source.connect(analyser);
    source.start();
}

function exportWaveFile() {
    const result = generateToneBuffer(2.5);
    if (!result) return;

    const wavBlob = encodeWAV(result.samples, result.sampleRate);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wasm_tone_${state.frequency.toFixed(0)}Hz.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 16-bit PCM RIFF WAV File Encoder
function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, 1, true);  // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true);  // Block align
    view.setUint16(34, 16, true); // Bits per sample
    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write 16-bit PCM samples with clipping protection
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

// ============================================================================
// Audio File Processing via C++ WASM DSP
// ============================================================================

async function processAudioFile(file) {
    initAudioContext();
    const dropzone = document.getElementById('dropzone');
    dropzone.innerHTML = `<p>⏳ Decoding and processing ${file.name} with C++ WebAssembly...</p>`;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const sampleRate = decodedBuffer.sampleRate;
        const numSamples = decodedBuffer.length;
        const numChannels = decodedBuffer.numberOfChannels;

        const inputChannelData = decodedBuffer.getChannelData(0);
        const bufBytes = numSamples * 4;
        const inputPtr = Module._malloc(bufBytes);
        const outputPtr = Module._malloc(bufBytes);

        // Copy input samples into WASM memory
        Module.HEAPF32.set(inputChannelData, inputPtr / 4);

        // Process through C++ WASM effects pipeline
        Module._processor_process_input(audioProcessor, inputPtr, outputPtr, numSamples);

        // Extract processed samples
        const processedSamples = new Float32Array(Module.HEAPF32.subarray(outputPtr / 4, outputPtr / 4 + numSamples));

        Module._free(inputPtr);
        Module._free(outputPtr);

        // Create new AudioBuffer and play
        const processedBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
        processedBuffer.getChannelData(0).set(processedSamples);

        const source = audioCtx.createBufferSource();
        source.buffer = processedBuffer;
        source.connect(analyser);
        source.start();

        dropzone.innerHTML = `
            <p>✅ <strong>Processed & Playing:</strong> ${file.name}</p>
            <p style="font-size: 0.8rem; color: var(--accent-cyan); margin-top: 0.5rem;">
                Applied C++ WASM DSP filters (${numSamples.toLocaleString()} samples at ${sampleRate} Hz)
            </p>
        `;
    } catch (err) {
        console.error('Error processing audio file:', err);
        dropzone.innerHTML = `<p style="color: var(--accent-red)">❌ Error processing audio file: ${err.message}</p>`;
    }
}

// ============================================================================
// Canvas Visualizer
// ============================================================================

function setupVisualizer() {
    const canvas = document.getElementById('visCanvas');
    const ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const timeBuffer = new Float32Array(2048);
    const freqBuffer = new Uint8Array(1024);

    const peakEl = document.getElementById('metricPeak');
    const cpuEl = document.getElementById('metricCpu');

    function draw() {
        requestAnimationFrame(draw);

        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);

        ctx.fillStyle = '#06090e';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < width; x += 40) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        for (let y = 0; y < height; y += 40) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        if (analyser) {
            analyser.getFloatTimeDomainData(timeBuffer);
            analyser.getByteFrequencyData(freqBuffer);

            // Compute Peak dBFS
            let maxAmp = 0;
            for (let i = 0; i < timeBuffer.length; i++) {
                const abs = Math.abs(timeBuffer[i]);
                if (abs > maxAmp) maxAmp = abs;
            }
            const dbfs = maxAmp > 0.0001 ? (20 * Math.log10(maxAmp)).toFixed(1) : '-inf';
            if (peakEl) peakEl.textContent = `${dbfs} dBFS`;
            if (cpuEl) cpuEl.textContent = `${state.lastExecutionTimeUs.toFixed(1)} µs`;

            if (state.visMode === 'oscilloscope') {
                drawOscilloscope(ctx, timeBuffer, width, height);
            } else if (state.visMode === 'spectrum') {
                drawSpectrum(ctx, freqBuffer, width, height);
            } else if (state.visMode === 'radial') {
                drawRadial(ctx, timeBuffer, freqBuffer, width, height);
            }
        } else {
            // Idle placeholder wave
            drawIdleWave(ctx, width, height);
        }
    }

    requestAnimationFrame(draw);
}

function drawOscilloscope(ctx, buffer, width, height) {
    // Zero-crossing trigger search for stabilized waveform display
    let startIdx = 0;
    for (let i = 0; i < buffer.length / 2; i++) {
        if (buffer[i] < 0 && buffer[i + 1] >= 0) {
            startIdx = i;
            break;
        }
    }

    const visibleSamples = Math.min(buffer.length - startIdx, 1024);
    const sliceWidth = width / visibleSamples;

    // Glowing Neon Line
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00f3ff';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    let x = 0;
    for (let i = 0; i < visibleSamples; i++) {
        const v = buffer[startIdx + i];
        const y = (height / 2) - (v * (height * 0.42));

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;
}

function drawSpectrum(ctx, freqBuffer, width, height) {
    const numBars = 64;
    const barWidth = (width / numBars) - 2;
    const step = Math.floor(freqBuffer.length / numBars);

    for (let i = 0; i < numBars; i++) {
        const val = freqBuffer[i * step] / 255.0;
        const barHeight = val * (height * 0.85);
        const x = i * (barWidth + 2);
        const y = height - barHeight;

        // Gradient
        const grad = ctx.createLinearGradient(0, height, 0, y);
        grad.addColorStop(0, 'rgba(0, 243, 255, 0.3)');
        grad.addColorStop(0.7, '#00f3ff');
        grad.addColorStop(1.0, '#a855f7');

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);

        // Peak cap
        ctx.fillStyle = '#f0f6fc';
        ctx.fillRect(x, y - 2, barWidth, 2);
    }
}

function drawRadial(ctx, timeBuffer, freqBuffer, width, height) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) * 0.55;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = '#00f3ff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f3ff';
    ctx.lineWidth = 2;

    ctx.beginPath();
    const count = 256;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const sample = timeBuffer[i % timeBuffer.length];
        const r = radius + sample * 40;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
}

function drawIdleWave(ctx, width, height) {
    const time = performance.now() * 0.002;
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
        const y = (height / 2) + Math.sin(x * 0.02 + time) * 15;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

// Start on DOM ready
document.addEventListener('DOMContentLoaded', init);
