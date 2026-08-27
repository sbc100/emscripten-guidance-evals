# Evaluation Report: Image Transcoder Web Application

## Executive Summary
- **Unguided Score:** 58 / 100
- **Guided Score:** 74 / 100
- **Uplift (+pp):** +16 points
- **Unguided Time:** N/A
- **Guided Time:** N/A

## Detailed Comparison

| Category | Unguided Score | Guided Score | Key Differences |
| :--- | :--- | :--- | :--- |
| 1. Basic Functionality & Testing | 25 / 25 | 8 / 25 | Unguided works 100% end-to-end in headless Chrome across all formats and filters. Guided fails at runtime due to an `input.hasOwnProperty("byteLength")` prototype bug in [`extractBytes`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/transcoder.cpp#L14-L33) that causes all image buffer operations to fail with empty buffers. |
| 2. Compilation Flags & Best Practices | 9 / 25 | 25 / 25 | Unguided used `=1` boolean suffixes, JSON array syntax for lists, omitted `-sSTRICT` and `-Werror`, and included `-sMODULARIZE=1` redundantly. Guided followed all guidelines: `-sSTRICT`, `-sEXPORT_ES6`, `-sENVIRONMENT=web`, `-Wall -Werror`, and `-flto`. |
| 3. Separate Compilation Workflow | 6 / 25 | 25 / 25 | Unguided used a single monolithic `em++` command with no `.o` compilation. Guided cleanly separated compilation into modular `.o` units ([`codecs.o`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/codecs.cpp), [`filters.o`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/filters.cpp), [`transcoder.o`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/transcoder.cpp)) and linked with consistent `-O3 -flto` flags. |
| 4. JS & C++ Interoperability | 18 / 25 | 16 / 25 | Unguided implemented working Embind bindings alongside legacy `extern "C"` exports and runtime methods. Guided designed a clean pure-Embind API but introduced a fatal JavaScript prototype check bug on TypedArrays that broke all runtime calls. |
| **Total Score** | **58 / 100** | **74 / 100** | **+16 points uplift** |

## Analysis of Unguided Run

### 1. Functionality & Testing
The unguided submission implemented a fully functional web application.
Running the automated headless Chrome test ([`verify_browser.mjs`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/unguided/verify_browser.mjs))
confirmed that:
- The WebAssembly engine initializes cleanly via modern ES6 dynamic import.
- The procedural sample image and user-uploaded images decode accurately.
- All requested formats (**PNG**, **JPEG**, **BMP**, **QOI**, **TGA**) encode
  cleanly with realistic compression and valid binary headers.
- All filter algorithms (grayscale, sepia, invert, hue/saturation adjustments,
  gamma correction, exposure, temperature/tint, vignette, blur, sharpen,
  Sobel edge detection, emboss, pixelate, posterize, threshold, and
  Floyd-Steinberg dithering) execute correctly in C++ with verified pixel
  transformations.
- Resizing (Mitchell, Box, Bilinear, Catmull-Rom, B-Spline, Nearest) and
  geometry operations (rotation, flips) work as expected.
- Performance timings (e.g., ~3-30 ms per frame) and RGBA canvas preview
  render correctly with side-by-side and split slider modes.

### 2. Compilation Flags & Best Practices
The [`unguided/Makefile`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/unguided/Makefile)
exhibited numerous anti-patterns discouraged in [`best_practices.rst`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/guidance/best_practices.rst):
- **Missing `-sSTRICT`:** Allowed legacy and deprecated compiler behavior.
- **Boolean `=1` Suffixes:** Used `-sEXPORT_ES6=1`, `-sMODULARIZE=1`, and
  `-sALLOW_MEMORY_GROWTH=1`.
- **Redundant Flags:** Passed `-sMODULARIZE=1` even though `-sEXPORT_ES6`
  already implies modularization.
- **JSON List Syntax:** Used quoted JSON arrays for list-based settings:
  `-sEXPORTED_RUNTIME_METHODS="['ccall','cwrap',...]"` and
  `-sEXPORTED_FUNCTIONS="['_malloc','_free',...]"`.
- **Missing Safety & Optimization Flags:** Missing `-Werror` and `-flto`.

### 3. Separate Compilation Workflow
The unguided build combined compilation and linking into a single monolithic
command:
```makefile
$(TARGET): $(SRCS) $(HEADERS)
	$(CXX) $(CXXFLAGS) $(SRCS) -o $(TARGET) $(LDFLAGS)
```
No intermediate object files (`.o`) were produced, preventing incremental
builds. The `clean` rule only removed `module.mjs` and `module.wasm`.

### 4. JavaScript & C++ Interoperability
The unguided code implemented modern Embind functions ([`jsTranscode`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/unguided/transcoder.cpp#L932-L1048),
[`jsDecodeImage`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/unguided/transcoder.cpp#L1050-L1082))
which properly read TypedArray properties using `input_bytes["length"]`.
However, it also retained legacy `extern "C"` exports (`create_buffer`,
`destroy_buffer`, `transcode_c_api`), `-lembind`, and runtime methods
(`ccall`, `cwrap`, `HEAPU8`, `HEAP32`), resulting in unnecessary binary bloat
and mixed paradigms.

---

## Analysis of Guided Run

### 1. Functionality & Testing
The guided submission created a well-architected UI ([`guided/index.html`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/index.html))
and cleanly factored C++ modules. However, testing the web application in
headless Chrome revealed a fatal runtime failure:
- When any image buffer is passed to C++ functions ([`decodeImage`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/codecs.cpp#L115-L160)
  or [`transcode`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/transcoder.cpp#L259-L270)),
  the application fails with:
  `Failed to decode image: Empty input buffer` and `Transcode failed: Input data is empty or invalid`.
- Canvases remain `0 × 0` and blank.
- The included verification test [`guided/test_browser.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/test_browser.js)
  failed when run against real headless Chrome.

### 2. Compilation Flags & Best Practices Compliance
The guided run achieved full compliance with [`best_practices.rst`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/guidance/best_practices.rst)
and [`guide.md`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/guidance/cpp-on-the-web/guide.md):
- `-sSTRICT`: Enabled without `=1` suffix.
- `-sEXPORT_ES6`: Enabled without `=1` suffix (and redundant `-sMODULARIZE` omitted).
- `-sENVIRONMENT=web`: Specified for optimal output size.
- `-sALLOW_MEMORY_GROWTH`: Formatted cleanly without `=1`.
- `-Wall -Werror`: Enforced in `CXXFLAGS`.
- `--bind`: Used standard Embind linking flag.
- `--no-entry`: Passed for clean library output.
- `-flto` and `-O3`: Consistently applied across compilation and linking.

### 3. Separate Compilation Workflow
The [`guided/Makefile`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/Makefile)
strictly followed standard separate compilation practices:
```makefile
CXXFLAGS ?= -std=c++17 -O3 -flto -Wall -Werror -Ithird_party
LDFLAGS ?= -O3 -flto -sSTRICT -sEXPORT_ES6 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH --bind --no-entry

SRCS = codecs.cpp filters.cpp transcoder.cpp
OBJS = $(SRCS:.cpp=.o)
TARGET = module.mjs

all: $(TARGET)

%.o: %.cpp transcoder.h
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) $(OBJS) -o $@ $(LDFLAGS)

clean:
	rm -f $(OBJS) $(TARGET) $(TARGET:.mjs=.wasm) $(TARGET:.mjs=.mjs.map)
```
The codebase was modularized into distinct compilation units ([`codecs.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/codecs.cpp),
[`filters.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/filters.cpp),
and [`transcoder.cpp`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/transcoder.cpp)),
and `make clean` properly cleans all object and output files.

### 4. JavaScript & C++ Interoperability
The guided run designed a clean, pure Embind interface with no `extern "C"`
leakage. However, it suffered from a critical JavaScript prototype inspection bug
in [`extractBytes`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/transcoder.cpp#L14-L33):
```cpp
std::vector<uint8_t> extractBytes(const emscripten::val& input) {
    if (input.isUndefined() || input.isNull()) {
        return {};
    }
    size_t length = 0;
    if (input.hasOwnProperty("byteLength")) {
        length = input["byteLength"].as<size_t>();
    } else if (input.hasOwnProperty("length")) {
        length = input["length"].as<size_t>();
    }
    if (length == 0) {
        return {};
    }
    std::vector<uint8_t> buffer(length);
    emscripten::val memoryView = emscripten::val(
        emscripten::typed_memory_view(length, buffer.data())
    );
    memoryView.call<void>("set", input);
    return buffer;
}
```
**The Bug:** In JavaScript, `byteLength` and `length` on typed arrays
(`Uint8Array`, `Float32Array`, etc.) are accessor properties defined on
`TypedArray.prototype`, **not** own properties of the typed array instance.
Therefore, `input.hasOwnProperty("byteLength")` and
`input.hasOwnProperty("length")` both evaluate to `false`, causing `length`
to remain `0` and returning an empty vector for every input buffer.
Fixing this requires checking `'byteLength' in input` (or accessing
`input["length"].as<size_t>()` directly).

---

## Recommendations & Takeaways

1. **Guidance Dramatically Improved Build Systems & Flag Discipline:**
   The Emscripten guidance successfully eliminated obsolete habits: the guided
   agent eliminated `=1` suffixes, avoided JSON array syntax, adopted `-sSTRICT`
   and `-sENVIRONMENT=web`, added `-Wall -Werror -flto`, and structured a clean
   separate compilation workflow with modular source files.

2. **Caution with JavaScript Property Introspection via Embind:**
   When writing C++ Embind helpers that accept JavaScript `emscripten::val`
   objects, developers should avoid calling `hasOwnProperty()` on typed array
   views or objects with prototype getters. Directly indexing `val["length"]`
   or checking `!val["byteLength"].isUndefined()` preserves prototype chain
   resolution in JavaScript.

3. **Verify Wasm Interop with Automated Browser Tests:**
   While the guided agent wrote a test script ([`guided/test_browser.js`](file:///usr/local/google/home/sbc/dev/wasm/emscripten-guidance-evals/results/image-transcoder/guided/test_browser.js)),
   the agent did not catch the runtime failure during self-validation because
   of CDP timing issues. Running headless verification via Puppeteer directly
   against the running server ensures that subtle interop errors are caught early.
