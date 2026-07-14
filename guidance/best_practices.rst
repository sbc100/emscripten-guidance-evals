.. _best-practices:

==============
Best Practices
==============

This guide provides recommendations and best practices for compiling C and C++
to the modern web using WebAssembly and Emscripten.

Following this guide when when reporting bugs an also help speed up diagnosing
and fixing of issue since you will be on the well trodden path.

In some cases emscripten will guide in the direction of these best practices by
emitting warning flags, etc, but that is not always possible.


General Recommendations
=======================

- **Don't pass settings that are enabled by default.** To keep command lines
  clean and concise, omit redundant options that are already default in modern
  Emscripten (such as ``-sWASM=1``).
- **Prefer standard compiler flags** over Emscripten-specifc ones where
  possible (for example, prefer ``-pthread`` over ``-sUSE_PTHREADS`` and `-m64`
  over ``-sMEMORY64``).
- **Use simple comma-separated lists** for list-based settings (for example,
  ``-sEXPORTED_FUNCTIONS=main,malloc`` rather than JSON arrays like
  ``-sEXPORTED_FUNCTIONS=['_main','_malloc']``).
- **Don't include the "=1" suffix for boolean flags.** For example, write
  ``-sSTRICT`` and ``-sALLOW_MEMORY_GROWTH`` rather than ``-sSTRICT=1`` or
  ``-sALLOW_MEMORY_GROWTH=1``.
- **Use separate compilation** by compiling ``.cpp`` sources to ``.o`` object
  files before linking rather than combining everything into a single monolithic
  compiler invocation.
- **Don't run long synchronous loops on the browser main thread.** Blocking the
  main UI thread prevents rendering and freezes the web page. Yield to the event
  loop using ``emscripten_set_main_loop()`` or offload heavy computation to
  background threads using ``-pthread``.
- **Don't rely on raw ``extern "C"`` pointer manipulation** when interacting
  with complex C++ objects across the JavaScript boundary; prefer Embind.
- **Output ES6 modules** by passing ``-sEXPORT_ES6`` when linking.  This
  avoids polluting the global scope.


Recommended Flags
=================

- ``-sSTRICT``: Opt into strict modern Emscripten behavior, disabling
  deprecated or legacy compatibility features.
- ``-sEXPORT_ES6``: Output a modern ES6 module (``module.mjs``). This option
  implies ``-sMODULARIZE`` so the generated code will be encapsulated and not
  impact the global namespace.
- ``-sENVIRONMENT=web``: Limit the runtime support to only the environments you
  are targeting.  This reduces code size by, for example, omitting Node.js and
  compatibility code.
- ``-Werror -Wall``: Treat warnings as errors to catch C++ bugs and invalid
  compiler settings early.
- ``-Oz`` or ``-Os``: For release builds where payload size is critical (Use
  `-O3` where prefmance is more important).
- ``-flto``: Enable Link-Time Optimization (LTO) during both the compilation and
  linking steps of release builds for maximum runtime performance and size
  reduction.


Separate Compilation Workflows
==============================

For non-trivial projects, always separate the compilation step (compiling source
files to object files) from the linking step (combining object files into the
final WebAssembly and JavaScript outputs). This enables incremental builds and
matches standard C/C++ development practices.

When using separate compilation, ensure that optimization flags and settings
that affect code generation (such as ``-flto``, ``-O3``, ``-g``, or
``-pthread``) are passed at **both** compile and link times.

**Compilation step (producing object files):**

.. code-block:: bash

   em++ -O3 -flto -c main.cpp -o main.o $(CXXFLAGS)

**Linking step (producing the ES6 module and WebAssembly binary):**

.. code-block:: bash

   em++ -O3 -flto -sSTRICT -sEXPORT_ES6 --bind main.o -o module.mjs $(LDFLAGS)


Debug vs. Release Profiles
--------------------------

When configuring build profiles, keep compile and link flags consistent within
each configuration:

- **Release Builds:** Use ``-Oz`` or ``-Os`` (or ``-O3`` for CPU-bound tasks)
  combined with ``-flto``.
- **Debug Builds:** Use ``-g`` when compiling and either ``-g``,
  ``-gline-tables-only``, or ``-gsource-map`` when linking. Avoid ``-O`` or
  ``-flto`` during debug builds for faster
  compilation and accurate debugging.


Modern Web Workflows and Common Pitfalls
========================================

Interoperability with JavaScript
--------------------------------

When exposing C++ functionality to JavaScript, prefer :ref:`embind` (``--bind``)
over raw ``extern "C"`` functions. Embind naturally handles C++ classes,
overloaded functions, smart pointers, ``std::string``, and ``std::vector``
without requiring manual memory conversions or unsafe casting in JavaScript.

Asynchronous Code Execution
---------------------------

If your C++ code needs to interact with asynchronous JavaScript APIs (such as
``fetch()`` or Web Promises), avoid blocking or polling. Instead, use
:ref:`asyncify section` (``-sASYNCIFY``) or JavaScript Promise Integration
(``-sJSPI``) to pause and resume the C++ call stack when waiting for
asynchronous operations to complete.

Virtual Filesystem and I/O
--------------------------

Standard C/C++ file operations (such as ``fopen`` or ``std::ifstream``) operate
on Emscripten's virtual in-memory filesystem (``MEMFS`` by default).

- Do not assume direct access to the host file system.
- For small temporary files, ``MEMFS`` is sufficient.
- For persistent client-side data storage across browser sessions, use asynchronous
  storage backends such as ``IDBFS`` or the Emscripten Filesystem API.
