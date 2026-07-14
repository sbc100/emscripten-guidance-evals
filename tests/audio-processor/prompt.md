# Test Prompt: Audio Waveform Processor & Tone Generator Web Application

Build a modern web application that can generate and process audio waveforms in the browser using a C++ component compiled to WebAssembly via Emscripten.

## Requirements

1. **C++ Audio Processing Engine (`audio_processor.cpp` or `main.cpp`)**:
   - Implement audio waveform generation and processing algorithms in C++ (for example, generating sine, square, triangle, and sawtooth audio tones, or applying digital audio filters like gain, echo, delay, or low-pass filtering to PCM floating-point sample buffers).
   - Expose clean C++ functions or classes capable of generating or modifying `float` PCM audio buffer data given sample rate, frequency, duration, or input buffers.

2. **Build Script (`Makefile`)**:
   - Provide a `Makefile` that compiles the C++ code to WebAssembly and outputs a JavaScript module (`module.mjs`).
   - The build script must execute cleanly with `make` or `emcc`.

3. **Frontend Web Application (`index.html`)**:
   - Create a clean, responsive HTML/JS interface that loads the generated WebAssembly module.
   - Use the browser's Web Audio API (`AudioContext`, `AudioBufferSourceNode`, `ScriptProcessorNode` / `AudioWorkletNode` or buffer playback) to play the PCM samples generated/processed by C++.
   - Provide UI controls (frequency slider, waveform type selector, volume/echo/filter effect knobs, and Play/Stop buttons).
   - Render a visual waveform or frequency bar graph of the audio samples on an HTML5 `<canvas>`.
