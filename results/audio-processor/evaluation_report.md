# Evaluation Report: audio-processor

## Executive Summary
- **Unguided Score:** 44 / 100
- **Guided Score:** 100 / 100
- **Uplift (+pp):** +56 points
- **Unguided Time:** N/A
- **Guided Time:** N/A

## Detailed Comparison

| Category | Unguided Score | Guided Score | Key Differences |
| :--- | :--- | :--- | :--- |
| 1. Basic Functionality & Testing | 25 / 25 | 25 / 25 | Both implementations build cleanly and function properly in headless Chrome and Node.js with real-time audio playback, waveform synthesis, DSP effects, and canvas rendering. |
| 2. Compilation Flags & Best Practices | 5 / 25 | 25 / 25 | Unguided used legacy flags (`-sEXPORT_ES6=1`, `-sALLOW_MEMORY_GROWTH=1`, redundant `-sMODULARIZE=1`, `-sDEFAULT_TO_CXX`), JSON array syntax for exported functions, omitted `-sSTRICT`, and omitted `-Werror -Wall`. Guided followed all modern flag best practices cleanly. |
| 3. Separate Compilation Workflow | 6 / 25 | 25 / 25 | Unguided used a monolithic single-step compilation command (`audio_processor.cpp -> module.mjs`) without object files or `-flto`. Guided cleanly separated `.cpp -> .o` and `.o -> module.mjs` passing `-O3 -flto -Werror -Wall` across both stages. |
| 4. JS & C++ Interoperability | 8 / 25 | 25 / 25 | Unguided relied on raw `extern "C"` functions, manual pointer passing, `Module._malloc`/`_free`, and raw `HEAPF32` byte offset calculations. Guided used **Embind** (`EMSCRIPTEN_BINDINGS`), C++ classes, and `emscripten::typed_memory_view` for zero-overhead typed array interop. |
| **Total Score** | **44 / 100** | **100 / 100** | **Real-world Uplift: +56 pts** |

## Analysis of Unguided Run

### 1. Basic Functionality & Testing (Score: 25 / 25)
The unguided submission in [./unguided/](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided)
implements a full-featured real-time WebAssembly audio synthesizer and DSP
engine. The C++ backend in [audio_processor.cpp](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/audio_processor.cpp)
defines the [`AudioProcessor`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/audio_processor.cpp#L249-L529)
engine with PolyBLEP anti-aliased oscillators (Sine, Square, Triangle,
Sawtooth, White/Pink Noise, Pulse), a biquad filter ([`BiquadFilter`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/audio_processor.cpp#L51-L124)),
delay/echo line ([`DelayEffect`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/audio_processor.cpp#L127-L169)),
and an ADSR envelope ([`ADSREnvelope`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/audio_processor.cpp#L171-L246)).

The frontend in [index.html](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/index.html)
and [app.js](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/app.js)
uses Web Audio's `AudioContext` and `ScriptProcessorNode` to stream audio
blocks of 2048 samples at 44.1 kHz. Testing with Chrome headless confirmed that
continuous tone playback, preset switching (e.g. 80s Lead, Cyber Bass),
parameter modulation, and HTML5 canvas visualization (oscilloscope, spectrum
analyzer, radial radar) execute cleanly without runtime exceptions or WebAssembly
traps. The build also includes a functional `make test` target.

### 2. Compilation Flags & Best Practices Compliance (Score: 5 / 25)
The [Makefile](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/Makefile)
violates numerous Emscripten best practice conventions:
- **Missing `-sSTRICT` (-4 pts):** The build does not opt into strict modern
  Emscripten mode.
- **Missing `-Werror -Wall` (-4 pts):** Compiler warnings are neither enabled
  nor treated as errors.
- **Boolean Flag `=1` Suffixes (-5 pts):** Uses `-sEXPORT_ES6=1`,
  `-sMODULARIZE=1`, and `-sALLOW_MEMORY_GROWTH=1` instead of clean boolean
  flags (`-sEXPORT_ES6`, `-sALLOW_MEMORY_GROWTH`).
- **Redundant Flag (-2 pts):** Passes `-sMODULARIZE=1` despite `-sEXPORT_ES6`
  already implying modularization.
- **JSON Array Formatting (-5 pts):** Defines `EXPORTED_FUNCTIONS` and
  `EXPORTED_RUNTIME_METHODS` using JSON array strings
  (`'["_malloc","_free",...]'`) rather than modern comma-separated lists.
- **Deprecated/Verbose Flags (-5 pts):** Passes `-sDEFAULT_TO_CXX` and
  custom `-sEXPORT_NAME="createAudioProcessorModule"`.

### 3. Separate Compilation Workflow (Score: 6 / 25)
The unguided [Makefile](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/Makefile#L18-L20)
performs a single monolithic build invocation directly from `audio_processor.cpp`
to `module.mjs`.
- It does not produce intermediate object files (`.o`).
- It omits `-flto` at compile and link stages.
- The `clean` rule only removes `module.mjs` and `module.wasm`, failing to
  account for object files or debug map outputs.

### 4. JavaScript & C++ Interoperability (Score: 8 / 25)
The unguided run completely avoids Embind in favor of legacy C-style exports:
- Exposes C functions via `extern "C"` ([`create_audio_processor`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/audio_processor.cpp#L538-L540),
  [`processor_process`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/audio_processor.cpp#L618-L622)).
- Requires JavaScript in [app.js](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/unguided/app.js#L75-L154)
  to manually allocate heap memory with `Module._malloc(BUFFER_SIZE * 4)`,
  pass raw integer pointers, and manually compute float offset indices into
  `Module.HEAPF32.subarray(procBufPtr / 4, ...)`.
- While ES6 `import` is used and the main thread is not blocked by long loops,
  the lack of Embind abstractions significantly increases code complexity and
  risk of memory leaks.

---

## Analysis of Guided Run

### 1. Basic Functionality & Testing (Score: 25 / 25)
The guided submission in [./guided/](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided)
implements an advanced, high-performance audio synthesis and DSP studio. The
core C++ engine in [audio_processor.h](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.h)
and [audio_processor.cpp](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.cpp)
implements the [`AudioProcessor`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.h#L28-L82)
class with methods for tone generation ([`generateTone`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.cpp#L89-L91)),
envelope shaping ([`generateToneWithEnvelope`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.cpp#L93-L177)),
chord synthesis (`generateChord`), biquad filtering (lowpass, highpass,
bandpass), Schroeder reverb with 4 parallel comb filters and 2 series all-pass
filters, delay, waveshaper distortion, tremolo, bitcrusher, normalization,
reverse, and fading.

The frontend in [index.html](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/index.html)
provides an interactive on-screen piano keyboard, waveform selectors, effect
toggle cards with rotary/slider controls, audio buffer metrics (peak/RMS dBFS),
real-time canvas oscilloscope/spectrum visualizers, WAV file export, and custom
audio file upload. Automated browser and Node.js tests verified all DSP routines
and UI interactions execute without warnings or runtime traps.

### 2. Compilation Flags & Best Practices Compliance (Score: 25 / 25)
The guided [Makefile](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/Makefile)
strictly adheres to all Emscripten best practice guidelines:
- Uses `-sSTRICT` without `=1` suffix.
- Uses `-sEXPORT_ES6` without `=1` suffix.
- Uses `-sENVIRONMENT=web` to optimize binary size for browser deployment.
- Uses `-sALLOW_MEMORY_GROWTH` cleanly without `=1`.
- Includes `-Werror -Wall` to ensure warning-free compilation.
- Uses `--bind` to enable Embind and `--no-entry` for library output.
- Omit all redundant default options (e.g. no `-sWASM=1`, no `-sMODULARIZE=1`).

### 3. Separate Compilation Workflow (Score: 25 / 25)
The guided [Makefile](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/Makefile#L1-L21)
defines a clean, modular separate compilation pipeline:
```makefile
CXX = em++
CXXFLAGS += -O3 -flto -Werror -Wall -std=c++17
LDFLAGS += -O3 -flto -sSTRICT -sEXPORT_ES6 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH --bind --no-entry

TARGET = module.mjs
SRCS = audio_processor.cpp
OBJS = $(SRCS:.cpp=.o)

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(LDFLAGS) $^ -o $@

%.o: %.cpp audio_processor.h
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET) $(TARGET:.mjs=.wasm)
```
- Compilation (`.cpp -> .o`) is completely decoupled from linking
  (`.o -> module.mjs`).
- Optimization and LTO flags (`-O3 -flto`) are consistently passed to both
  compilation (`CXXFLAGS`) and linking (`LDFLAGS`).
- Dependency on header file `audio_processor.h` is explicitly declared.
- `make clean` properly cleans all object files, `.mjs`, and `.wasm` binaries.

### 4. JavaScript & C++ Interoperability (Score: 25 / 25)
The guided run demonstrates idiomatic Embind design:
- Exposes C++ enum [`WaveformType`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.h#L12-L19)
  and registers `std::vector<float>` via `emscripten::register_vector<float>`.
- Exposes the [`AudioProcessor`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.h#L28-L82)
  class with full object-oriented method bindings in `EMSCRIPTEN_BINDINGS`.
- Implements direct typed array interop via `emscripten::typed_memory_view`
  in [`getSamples`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.cpp#L477-L482)
  and [`setSamples`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/audio-processor/guided/audio_processor.cpp#L484-L491),
  allowing JavaScript to read/write `Float32Array` buffers directly without
  manual pointer calculations, `_malloc`/`_free` calls, or `HEAPF32` accesses.
- Loads the module using standard ES6 module import (`import createModule from
  './module.mjs'`) and async factory instantiation (`const Module = await
  createModule()`).
- All DSP operations execute in fast buffer chunks without blocking the UI
  thread.

---

## Recommendations & Takeaways

1. **Impact of Guidance on Interoperability:** Providing clear guidance on
   Embind eliminated fragile `extern "C"` pointer manipulation and manual heap
   indexing (`HEAPF32[ptr/4]`), resulting in type-safe class bindings and zero-copy
   typed array views via `emscripten::typed_memory_view`.
2. **Impact on Build Configuration:** Guidance directly prevented common
   Emscripten anti-patterns such as appending `=1` to boolean flags, redundant
   `-sMODULARIZE=1` declarations when using `-sEXPORT_ES6`, monolithic
   compilation commands, and verbose JSON array syntax for exported symbol lists.
3. **Separate Compilation and LTO:** Guidance encouraged standard C++ separate
   compilation (`.cpp -> .o` and `.o -> .mjs`) with Link-Time Optimization
   (`-flto`) applied consistently across both stages.
