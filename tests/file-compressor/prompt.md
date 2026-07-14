# Test Prompt: File Compressor & Decompressor Web Application

Build a modern web application that can compress and decompress files in the browser using a C++ component compiled to WebAssembly via Emscripten.

## Requirements

1. **C++ WebAssembly Engine (`compressor.cpp` or `main.cpp`)**:
   - Implement file compression and decompression algorithms in C++ (for example, Run-Length Encoding (RLE), LZ4-style byte matching, or zlib/deflate-style byte transformation).
   - Provide clean interface functions/classes that can accept an input byte buffer/string/vector and return the processed compressed or decompressed byte buffer.

2. **Build Script (`Makefile`)**:
   - Provide a `Makefile` that compiles the C++ code to WebAssembly and outputs a JavaScript module (`module.mjs`).
   - The build script must be easy to invoke with `make` or `emcc`.

3. **Frontend Web Application (`index.html`)**:
   - Create a modern, responsive HTML/JS interface that loads the generated WebAssembly module.
   - Allow the user to upload or drag-and-drop any file from their local machine.
   - Provide options to compress the file and decompress an already compressed file.
   - Display real-time statistics including original file size, output file size, compression ratio, and processing duration in milliseconds.
   - Allow downloading the resulting compressed or decompressed file.
