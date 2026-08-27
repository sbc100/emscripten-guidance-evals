# Test Prompt: Flame Fractal Generator

Build a modern web application that can generate flame fractal images
using the FLAM3 open source library.

## Requirements

1. **C/C++ Backend**
   - Implement C/C++ functionality to generate images ussing the flam3
     open source library (https://github.com/scottdraves/flam3)
   - Expose clean C++ functions or classes capable of communicating with
     flam3 from JavaScript passing in parameters and getting out byte
     arrays/buffers.

2. **Build Script (`Makefile`)**:
   - Provide a `Makefile` that compiles the C/C++ code to WebAssembly and
     outputs a JavaScript module (`module.mjs`).
   - The build script must execute cleanly with `make` or `emcc`.

3. **Frontend Web Application (`index.html`)**:
   - Create a clean, responsive HTML/JS web application that loads the generated WebAssembly module.
   - Allow users to tweek parameter and generate new images.
   - Provide UI controls (buttons, dropdowns, or sliders) to control parameters
   - Verify that the UI renders the flame images correctly using a headless
     browser or puppeteer. i.e. check the canvas contents after rendering is done.
   - Verify that the UI remains responsive while new images are rendering.

