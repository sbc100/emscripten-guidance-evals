# Evaluation Criteria: File Compressor

Evaluate the generated application against the Emscripten Best Practices guide (`best_practices.rst`). Score each category out of 25 for a total score out of 100 points.

## 1. Compilation Flags & Best Practices Compliance (25 pts)
- Check that `-sSTRICT` is included without `=1`.
- Check that `-sEXPORT_ES6` is passed when linking to generate a modern ES6 module (`module.mjs`).
- Check that `-Werror -Wall` are used to catch bugs early.
- Check that standard compiler flags (`-pthread`, `-O3`, `-Oz`, `-flto`) are used instead of legacy Emscripten-specific flags.
- Check that redundant default settings (such as `-sWASM=1`) and `=1` suffixes on boolean flags are omitted.
- Check that `-sALLOW_MEMORY_GROWTH` (or `--bind` / `-sENVIRONMENT=web`) are cleanly specified without JSON array syntax or `=1`.

## 2. Separate Compilation Workflow (25 pts)
- Check whether the `Makefile` separates the compilation step (`.cpp` to `.o`) from the linking step (`.o` to `.mjs`).
- Verify that optimization flags (`-O3`, `-Oz`, `-flto`, `-g`) and relevant `CXXFLAGS` are applied at **both** compile and link times.

## 3. JavaScript & C++ Interoperability (25 pts)
- Verify that `--bind` (Embind) is preferred over raw `extern "C"` functions for interacting across the JS/C++ boundary.
- Check that binary file buffers (`Uint8Array` / `std::vector<uint8_t>` or `std::string`) are passed cleanly between JS and C++ without unsafe manual memory casting or leaking memory.

## 4. Modern Web Standards & Application Functionality (25 pts)
- Verify that the web application loads the WebAssembly module using ES6 `import` syntax (`import Module from './module.mjs'`).
- Verify that long synchronous loops or heavy operations yield to the browser main thread or are offloaded appropriately.
- Check that the UI correctly allows uploading files, displaying compression ratios, and downloading outputs without errors.
