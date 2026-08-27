# Evaluation Report: Flame Fractal Generator (fractal-flames)

## Executive Summary
- **Unguided Score:** 99 / 100
- **Guided Score:** 71 / 100
- **Uplift (+pp):** -28 points
- **Unguided Time:** N/A
- **Guided Time:** N/A

## Detailed Comparison

| Category | Unguided Score | Guided Score | Key Differences |
| :--- | :--- | :--- | :--- |
| 1. Basic Functionality & Testing | 24 / 25 | 6 / 25 | Unguided renders flame fractals flawlessly in browser & headless tests (60 FPS responsiveness, progressive rendering). Guided crashes with a fatal WebAssembly trap (`table index is out of bounds`) inside [`flam3_render`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flam3-src/flam3.c#L3894-L3932) due to legacy function pointer signature mismatch in `flam3` POSIX threads. |
| 2. Compilation Flags & Best Practices | 25 / 25 | 20 / 25 | Unguided adheres to all best practices: `-sSTRICT`, `-sEXPORT_ES6`, `-sENVIRONMENT=web`, `-sALLOW_MEMORY_GROWTH`, `-Werror -Wall`, `-O3 -flto`. Guided omits `-Werror` (and `-Wall` on C sources) due to numerous legacy C warnings in `flam3`. |
| 3. Separate Compilation Workflow | 25 / 25 | 23 / 25 | Both cleanly separate compilation from linking. Guided adds CMake build for `libxml2`, but `make clean` misses auxiliary build artifacts. |
| 4. JS & C++ Interoperability | 25 / 25 | 22 / 25 | Both use Embind with `value_object` and `typed_memory_view`. Unguided streams progressive batches asynchronously via Web Worker without blocking. Guided executes blocking synchronous full-frame renders that fail at runtime. |
| **Total Score** | **99 / 100** | **71 / 100** | **-28 points uplift** |

## Analysis of Unguided Run

### Functionality & Testing
The unguided submission in [`unguided/`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided)
implements a full Scott Draves FLAM3 fractal engine directly in C++
([`flam3_engine.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/flam3_engine.cpp)).
It features 30 non-linear variations ([`VariationType`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/flam3_engine.h#L13-L44)),
palette interpolation, log-density estimation, spatial supersampling, camera
transformation, and rotational symmetry.

The web application ([`index.html`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/index.html)
and [`app.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/app.js))
delegates all rendering computation to a Web Worker
([`worker.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/worker.js))
using chunked batches (150,000 samples/slice) yielding to the event loop.
This ensures silky smooth 60 FPS UI responsiveness even during active rendering.

Automated verification via [`test_render.py`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/test_render.py)
using Headless Chrome DevTools Protocol passed 100%:
- Canvas rendered 295,688 non-zero pixels out of 480,000 (61.6% density coverage).
- Preset changes (e.g. "Electric Jellyfish"), randomization, and mutation verified.
- UI responsiveness was measured at 60.3 FPS (61 rAF ticks in 1010 ms) during render.
- No JavaScript errors or WebAssembly traps occurred.

Minor deduction (24/25): Re-implemented the FLAM3 algorithm in clean modern C++
rather than compiling the upstream C repository `flam3`.

### Compilation Flags & Best Practices
The [`unguided/Makefile`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/Makefile)
strictly complies with Emscripten best practices:
- Uses `-sSTRICT`, `-sEXPORT_ES6`, `-sENVIRONMENT=web`, and
  `-sALLOW_MEMORY_GROWTH` without any `=1` suffixes.
- Includes `-Werror -Wall -std=c++17` in compilation flags.
- Passes `-O3 -flto` consistently to both compilation and linking.
- Uses `--bind` and `--no-entry` cleanly.

### Separate Compilation & Interoperability
- Object files (`flam3_engine.o`, `main.o`) are compiled separately before linking
  into `module.mjs`.
- Embind ([`main.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/main.cpp))
  exposes [`CameraConfig`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/flam3_engine.h#L90-L95),
  [`ToneConfig`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/flam3_engine.h#L97-L104),
  [`Transform`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/flam3_engine.h#L52-L89),
  and [`FlameEngine`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/flam3_engine.h#L106-L195).
- Pixel buffers are returned via `emscripten::typed_memory_view` and transferred
  between the Worker and main thread using zero-copy `postMessage(..., [buffer])`.

---

## Analysis of Guided Run

### Functionality & Testing
The guided submission in [`guided/`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided)
attempted to directly integrate the upstream C `flam3` codebase alongside
`libxml2` ([`guided/libxml2-src`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/libxml2-src)).

While the code builds, it **fails catastrophically at runtime** inside WebAssembly.
When [`FlameEngine::render`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flame_engine.cpp#L156-L214)
invokes [`flam3_render`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flam3-src/flam3.c#L3894-L3932),
the browser console immediately traps with:
```
[Worker] Render caught error: table index is out of bounds
Worker error: table index is out of bounds
```
The canvas remains blank (0 rendered pixels). The automated test suite
([`test_flame.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/test_flame.js))
times out after 30 seconds (`TimeoutError: Waiting failed: 30000ms exceeded`).

**Root Cause:**
In upstream [`flam3-src/rect.c`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flam3-src/rect.c#L57-L248),
the thread worker functions [`iter_thread`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flam3-src/rect.c#L250-L525)
and [`de_thread`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flam3-src/rect.c#L57-L248)
are defined with `void` return types (`static void iter_thread(void *)`), but
are cast to `(void *)` and passed to `pthread_create`, which expects
`void *(*)(void *)`. In single-threaded Emscripten builds without `-pthread`,
the `pthread_create` fallback stub calls the start routine through a WebAssembly
indirect call table (`call_indirect`) expecting signature `(i32) -> i32`.
Because WebAssembly strictly validates type signatures at runtime, calling a
function with signature `(i32) -> void` triggers an immediate WebAssembly runtime
trap (`table index is out of bounds`).

### Compilation Flags & Best Practices
In [`guided/Makefile`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/Makefile):
- Correctly uses `-sSTRICT`, `-sEXPORT_ES6`, `-sENVIRONMENT=web`, and
  `-sALLOW_MEMORY_GROWTH` without `=1`.
- Uses Emscripten ports `-sUSE_LIBPNG`, `-sUSE_LIBJPEG`, and `-sUSE_ZLIB`.
- **Deductions:** Omitted `-Werror` across both `CFLAGS` and `CXXFLAGS`, and
  omitted `-Wall` in `CFLAGS` to suppress warnings emitted by the legacy
  C `flam3` code (such as format string mismatches and non-prototype function definitions).

### Separate Compilation & Interoperability
- Builds static `libxml2.a` with `emcmake cmake` and compiles C/C++ object files
  separately before linking.
- Clean Embind wrapper in [`main.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/main.cpp)
  exposing [`RenderStats`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flame_engine.hpp#L15-L19)
  and [`FlameEngine`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/flame_engine.hpp#L21-L103).
- Uses ES6 `import Module from './module.mjs'` in `worker.js`.
- However, the C++ engine renders synchronously in a single blocking call rather
  than progressive streaming slices, and the runtime trap broke all interop.

---

## Recommendations & Takeaways

1. **Watch Out for C Function Pointer Signature Mismatches in WebAssembly:**
   In native C on x86_64, casting a `void (*)(void*)` function to `void* (*)(void*)`
   and passing it to `pthread_create` often goes unnoticed. In WebAssembly,
   `call_indirect` enforces strict function signature checks against table entries.
   Any signature mismatch or invalid cast immediately crashes the WASM runtime with
   `table index is out of bounds`. When porting legacy C libraries to WebAssembly,
   auditing function pointer signatures (especially in thread and callback stubs)
   is essential.

2. **Always Execute and Verify Automated Tests in Real Headless Environments:**
   The guided agent wrote a comprehensive Puppeteer test script ([`test_flame.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/guided/test_flame.js)),
   but did not resolve the runtime trap that caused it to fail. The unguided agent,
   by contrast, verified end-to-end rendering and pixel density with [`test_render.py`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/fractal-flames/unguided/test_render.py).

3. **Progressive Rendering vs. Synchronous Full Frame Rendering:**
   For compute-intensive fractals, chunking sample iterations into progressive
   batches (as done in `unguided`) provides responsive visual feedback and allows
   seamless user interaction, whereas monolithic blocking renders risk timeouts.
