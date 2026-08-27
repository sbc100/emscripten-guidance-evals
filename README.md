# Emscripten AI Agent Guidance Evaluation Repository

This repository is a lightweight, simplified benchmark harness designed to measure how effectively AI coding agents adopt Emscripten best practices for compiling C and C++ to WebAssembly on the modern web.

By comparing agent solutions generated **without extra context** (`unguided`) against solutions generated with **direct local access to Emscripten guidance** (`guided`), this suite calculates the exact metrics and uplift (+pp) achieved by providing curated best practices.

## Repository Structure

```
emscripten-guidance-evals/
├── run_evals.py          # Automated evaluation & benchmarking harness
├── guidance/             # Simplified Emscripten best practice documentation
│   ├── best_practices.rst  # Core best practices from upstream Emscripten
│   ├── best_practices.md   # Markdown formatted version for AI consumption
│   └── cpp-on-the-web/     # Modern Web ES6/Embind skill and Makefile template
├── tests/                # Prompt templates for each test
│   ├── audio-processor/    # Audio waveform generation & filtering test case
│   ├── file-compressor/    # File compression & decompression test case
│   ├── fractal-flames/     # Flame fractal generator test case
│   └── image-transcoder/   # Image manipulation & transcoding test case
├── evaluation/           # Evaluation prompts for LLM/agent code grading
│   └── evaluation_prompt.md # Rubric prompt for grading generated workspaces
└── results_xxx/          # Versioned evaluation workspaces, reports, & metrics
```

## Quickstart

### Full End-to-End Pipeline

To run the complete evaluation pipeline (run agent in isolated `/tmp` workspace,
build, and evaluate results) across all tests in one command:

```bash
# Run full evaluation with Jetski CLI across all test cases:
./run_evals.py all --runner jetski-cli

# Or run full evaluation for a single test case:
./run_evals.py all --runner jetski-cli --test fractal-flames
```

---

### Step-by-Step Commands

#### 1. Run AI Coding Agents

Run agents across test cases using different runner engines (`jetski-cli`,
`agentapi`, `gemini`, `claude`, `mock`, or `print`). Workspaces are prepared
directly in isolated `/tmp` directories with clean environments:

```bash
# Print prompts and directory paths to run manually or via subagents:
./run_evals.py run --runner print

# Run via Jetski CLI (interactive / non-interactive print mode):
./run_evals.py run --runner jetski-cli

# Run via Agent API:
./run_evals.py run --runner agentapi

# Run via Gemini CLI:
./run_evals.py run --runner gemini

# Generate a mock baseline solution to verify the build & evaluation pipeline:
./run_evals.py run --runner mock
```

#### 2. Verify Builds with Emscripten

Run `make clean all` inside each generated workspace to verify whether the
agent's code compiles cleanly into a modern WebAssembly ES6 module:

```bash
./run_evals.py build
```

#### 3. Evaluate Solutions & Generate Metrics

Evaluate the generated `Makefile`, C++ code, and HTML/JS frontend against the
4 evaluation categories (Basic Functionality & Testing, Compilation Flags,
Separate Compilation, and JS & C++ Interoperability):

```bash
./run_evals.py evaluate
```

This generates detailed markdown reports in
`results_xxx/<test_name>/evaluation_report.md` along with an executive summary
table in `results_xxx/summary_metrics.md`.

You can also re-generate `results_xxx/summary_metrics.md` at any time from all
existing test reports:

```bash
./run_evals.py summarize
```

#### 4. Check Overall Status

View a quick table showing workspace setup, build status, and evaluation scores
across all test cases:

```bash
./run_evals.py status
```

## Evaluation Rubric Categories (100 Points Total)

1. **Basic Functionality & Testing (25 pts)**: Verifying that the web application actually works, passes simple direct input/output/results testing without runtime errors (e.g. using Chrome headless or Puppeteer), and satisfies core functional requirements.
2. **Compilation Flags & Best Practices (25 pts)**: Opting into `-sSTRICT`, `-sEXPORT_ES6`, and `-Werror -Wall`. Avoiding legacy `=1` boolean suffixes and `-sWASM=1` defaults.
3. **Separate Compilation Workflow (25 pts)**: Separating object file compilation (`-c`) from the final link step, ensuring optimization flags (`-flto`, `-O3`/`-Oz`) are applied consistently across both.
4. **JS & C++ Interoperability (25 pts)**: Using Embind (`--bind`) to cleanly exchange complex data structures (`std::vector<uint8_t>`, strings, audio/image buffers) without raw `extern "C"` pointer casting, and loading modules via ES6 `import`.
