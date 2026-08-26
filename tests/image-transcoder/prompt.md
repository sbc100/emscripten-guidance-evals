# Test Prompt: Image Transcoder & Processing Web Application

Build a modern web application that can transcode images and apply image manipulation filters in the browser using a C++ component compiled to WebAssembly via Emscripten.

## Requirements

1. **C++ Image Processing Engine (`transcoder.cpp` or `main.cpp`)**:
   - Implement C++ functionality to process image pixel data (e.g., converting
     between raw RGBA buffers, applying grayscale/sepia/edge-detection/kernel
     convolutions, or handling bitmap formats like BMP/PPM/raw pixels).
   - Compile in whatever open source image libraries are needed to do actual work
     transforming and/or processing image files.
   - Expose clean C++ functions or classes capable of taking image dimensions,
     format types, and byte arrays/buffers, performing the manipulation, and
     returning the transformed byte buffer.

2. **Build Script (`Makefile`)**:
   - Provide a `Makefile` that compiles the C++ code to WebAssembly and outputs a JavaScript module (`module.mjs`).
   - The build script must execute cleanly with `make` or `emcc`.

3. **Frontend Web Application (`index.html`)**:
   - Create a clean, responsive HTML/JS web application that loads the generated WebAssembly module.
   - Allow users to upload or select an image file (`.png`, `.jpg`, `.bmp`, etc.) and render it on an HTML5 `<canvas>`.
   - Provide UI controls (buttons, dropdowns, or sliders) to select a transcoding format or image processing filter.
   - Render the before and after preview side-by-side or in real-time on the canvas, and display the C++ processing time in milliseconds.
   - Allow downloading the processed image.
