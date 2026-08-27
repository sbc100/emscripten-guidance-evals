# Evaluation Report: file-compressor

## Executive Summary
- **Unguided Score:** 67 / 100
- **Guided Score:** 100 / 100
- **Uplift (+pp):** +33 points
- **Unguided Time:** N/A
- **Guided Time:** N/A

## Detailed Comparison

| Category | Unguided Score | Guided Score | Key Differences |
| :--- | :--- | :--- | :--- |
| 1. Basic Functionality & Testing | 25 / 25 | 25 / 25 | Both runs build and execute functional multi-format file compression/decompression engines (LZ4, Zlib/Deflate, GZIP, RLE; guided also adds Zstandard). Both include passing automated unit and Puppeteer browser end-to-end test suites. |
| 2. Compilation Flags & Best Practices | 5 / 25 | 25 / 25 | Unguided missed `-sSTRICT`, used `-sEXPORT_ES6=1` and `-sALLOW_MEMORY_GROWTH=1` with legacy `=1` syntax, included redundant `-sMODULARIZE=1`, used `-lembind` rather than `--bind`, and omitted `-Werror -Wall`. Guided followed all recommended flags with clean boolean syntax, `-sENVIRONMENT=web`, and `-Werror -Wall`. |
| 3. Separate Compilation Workflow | 17 / 25 | 25 / 25 | Both performed separate compilation (`.c`/`.cpp` to `.o` before linking), but unguided omitted Link-Time Optimization (`-flto`) and warning flags. Guided applied consistent `-O3 -flto` across both compilation and link stages with structured build artifact management. |
| 4. JS & C++ Interoperability | 20 / 25 | 25 / 25 | Both used Embind and ES6 modules. However, unguided ran long synchronous compression routines directly on the main UI thread, whereas guided cleanly offloaded all computation to a Web Worker (`worker.js`) using Transferable `ArrayBuffer` objects. |
| **Total Score** | **67 / 100** | **100 / 100** | |

## Analysis of Unguided Run

### Category 1: Basic Functionality & Testing (25 / 25)
The unguided submission successfully fulfills the functional requirements
specified in the test prompt. It downloads and compiles open-source C libraries
for LZ4 (v1.9.4) and Zlib (v1.3.1) alongside custom C++ implementations of
PackBits-style RLE in [`compressor.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/compressor.cpp).
The web interface in [`index.html`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/index.html)
and [`app.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/app.js)
provides drag-and-drop file upload, compression level sliders, format
auto-detection, real-time statistics (original/compressed size, ratio, duration,
throughput), hex inspection, and file downloads. Automated test suites in
[`test/test_node.mjs`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/test/test_node.mjs)
and [`test/test_browser_e2e.mjs`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/test/test_browser_e2e.mjs)
were executed and passed without errors.

### Category 2: Compilation Flags & Best Practices Compliance (5 / 25)
The unguided [`Makefile`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/Makefile)
demonstrates several deviations from modern Emscripten best practices:
- **Missing `-sSTRICT` (-5 pts):** Strict modern mode is omitted entirely.
- **Legacy `=1` Suffixes on Boolean Settings (-5 pts):** Uses `-sEXPORT_ES6=1`
  and `-sALLOW_MEMORY_GROWTH=1` instead of clean boolean flags (`-sEXPORT_ES6`,
  `-sALLOW_MEMORY_GROWTH`).
- **Redundant Settings (-5 pts):** Specifies `-sMODULARIZE=1`, which is
  redundant because `-sEXPORT_ES6` already implies modularization.
- **Missing Warning Enforcement (-5 pts):** Completely omits `-Werror -Wall`
  from `CFLAGS`, `CXXFLAGS`, and `LDFLAGS`.
- **Non-standard Embind Flag:** Passes `-lembind` rather than standard
  `--bind`.

### Category 3: Separate Compilation Workflow (17 / 25)
The unguided build script separates source compilation into `.o` object files
before linking into `module.mjs`. However, it loses points because:
- **Missing Link-Time Optimization (`-flto`) (-5 pts):** Link-Time
  Optimization is not configured for compilation or linking steps.
- **Inconsistent/Unstructured Flag Hierarchy (-3 pts):** Flags are fragmented
  between `CFLAGS`, `CXXFLAGS`, and `LDFLAGS` without a unified optimization
  profile definition.

### Category 4: JavaScript & C++ Interoperability (20 / 25)
The unguided implementation exposes the [`CompressorEngine`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/compressor.h#L38)
methods using Embind (`EMSCRIPTEN_BINDINGS`) and loads `module.mjs` using ES6
dynamic imports. Binary data is safely copied across the boundary via
`emscripten::typed_memory_view` and `Uint8Array`. However:
- **Main UI Thread Blocking (-5 pts):** Compression and decompression tasks
  run synchronously on the browser's main thread inside [`app.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/unguided/app.js#L407-L450).
  Processing larger files blocks rendering and user interactions rather than
  offloading to background Web Workers.

---

## Analysis of Guided Run

### Category 1: Basic Functionality & Testing (25 / 25)
The guided submission fully satisfies all requirements and extends them with
industry-grade features. It vendors and compiles three open-source compression
libraries from source (LZ4 v1.10.0, Zlib v1.3.1, and Meta's Zstandard v1.5.6)
plus a custom RLE codec in [`compressor.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/guided/compressor.cpp).
The implementation introduces a custom container format (`WCMP`) equipped with
CRC32 data integrity verification. The frontend in [`index.html`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/guided/index.html)
and [`app.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/guided/app.js)
features algorithm selection, compression level configuration, container header
toggles, sample generators, comparative benchmarking, and downloads. The
automated browser test suite in [`test_e2e.mjs`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/guided/test_e2e.mjs)
executes Puppeteer headless Chrome across all algorithms and verified roundtrip
data fidelity.

### Category 2: Compilation Flags & Best Practices Compliance (25 / 25)
The guided [`Makefile`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/guided/Makefile)
strictly adheres to all guidelines in `best_practices.rst`:
- Passes `-sSTRICT` cleanly without `=1`.
- Passes `-sEXPORT_ES6` cleanly without `=1` and omits redundant
  `-sMODULARIZE`.
- Passes `-sENVIRONMENT=web` to optimize generated code size for browser
  targets.
- Passes `-sALLOW_MEMORY_GROWTH` cleanly.
- Enables `--bind` and `--no-entry` for pure library module generation.
- Enforces `-Werror -Wall` in `CXXFLAGS`.
- Omits all redundant default flags (e.g. no `-sWASM=1`).

### Category 3: Separate Compilation Workflow (25 / 25)
The guided build system showcases separate compilation and linking:
- Object files are generated cleanly under dedicated subdirectories
  (`build/lz4/*.o`, `build/zlib/*.o`, `build/zstd/*.o`, `build/compressor.o`).
- A shared `OPT_FLAGS := -O3 -flto` variable guarantees identical optimization
  and Link-Time Optimization flags at both compile time and link time.
- The `make clean` target cleanly removes `build/`, `module.mjs`, `module.wasm`,
  and `module.wasm.map`.

### Category 4: JavaScript & C++ Interoperability (25 / 25)
The guided implementation excels in modern WebAssembly JS/C++
interoperability:
- **Clean Embind API:** Cleanly exposes functions using `EMSCRIPTEN_BINDINGS`
  with strongly typed structs and `Uint8Array` conversion helpers.
- **Web Worker Architecture:** Heavy compression, decompression, format
  detection, and multi-algorithm benchmarks are delegated to a dedicated Web
  Worker in [`worker.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/file-compressor/guided/worker.js).
- **Zero-Copy Transferable Memory:** Transferable `ArrayBuffer` objects are
  passed between the Web Worker and main UI thread, ensuring zero main-thread
  jank and keeping the UI smooth and responsive even during large file
  compression passes.

---

## Recommendations & Takeaways

1. **Impact of Guidance on Compiler Settings:**
   The Emscripten guidance eliminated legacy syntax patterns (`-sFLAG=1`) and
   redundant options (`-sMODULARIZE=1`, `-lembind`), while ensuring `-sSTRICT`,
   `-sENVIRONMENT=web`, and `-Werror -Wall` were properly adopted.

2. **Impact of Guidance on Link-Time Optimization (LTO):**
   The guidance ensured `-flto` was specified consistently at both the
   compilation and linking stages, maximizing optimization across open-source
   C libraries and the C++ engine.

3. **Impact of Guidance on Concurrency and Responsiveness:**
   The guidance's explicit warning against long synchronous loops on the main
   thread prompted the guided model to architect a full Web Worker pipeline
   with Transferable ArrayBuffers, delivering a significantly more robust,
   responsive web application.
