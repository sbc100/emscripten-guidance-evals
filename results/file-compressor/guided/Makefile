# File Compressor & Decompressor Wasm Module Makefile
# Follows Emscripten Best Practices:
# - Separate compilation (objects compiled before linking)
# - Matching optimization & LTO flags at compile and link time (-O3 -flto)
# - Modern ES6 module output (-sEXPORT_ES6)
# - Strict mode (-sSTRICT) and web environment (-sENVIRONMENT=web)
# - No default redundant flags, no '=1' boolean suffixes
# - Clean C++ interface with Embind (--bind)

ifeq ($(origin CC),default)
  CC := emcc
endif
ifeq ($(origin CXX),default)
  CXX := em++
endif

# Auto-detect emcc from emsdk if not in current PATH
ifeq ($(shell which $(CC) 2>/dev/null),)
  EMSDK_EMCC := /usr/local/google/home/sbc/dev/wasm/emsdk/upstream/emscripten/emcc
  EMSDK_EMCXX := /usr/local/google/home/sbc/dev/wasm/emsdk/upstream/emscripten/em++
  ifneq ($(wildcard $(EMSDK_EMCC)),)
    CC := $(EMSDK_EMCC)
    CXX := $(EMSDK_EMCXX)
  endif
endif

BUILD_DIR := build
DEPS_DIR := deps

# Optimization & Code Generation Flags
OPT_FLAGS := -O3 -flto

# Include directories for vendored open-source libraries
INCLUDES := -I$(DEPS_DIR)/lz4 -I$(DEPS_DIR)/zlib -I$(DEPS_DIR)/zstd/lib -I$(DEPS_DIR)/zstd/lib/common

# Compiler flags
CFLAGS := $(OPT_FLAGS) $(INCLUDES)
CXXFLAGS := $(OPT_FLAGS) -Werror -Wall -std=c++17 $(INCLUDES)

# Linker flags following best practices
LDFLAGS := $(OPT_FLAGS) \
	-sSTRICT \
	-sEXPORT_ES6 \
	-sENVIRONMENT=web \
	-sALLOW_MEMORY_GROWTH \
	--bind \
	--no-entry

# Dependency source definitions
LZ4_SRCS := $(DEPS_DIR)/lz4/lz4.c $(DEPS_DIR)/lz4/lz4hc.c
LZ4_OBJS := $(patsubst $(DEPS_DIR)/lz4/%.c, $(BUILD_DIR)/lz4/%.o, $(LZ4_SRCS))

ZLIB_SRCS := $(addprefix $(DEPS_DIR)/zlib/, adler32.c compress.c crc32.c deflate.c inffast.c inflate.c inftrees.c trees.c uncompr.c zutil.c)
ZLIB_OBJS := $(patsubst $(DEPS_DIR)/zlib/%.c, $(BUILD_DIR)/zlib/%.o, $(ZLIB_SRCS))

ZSTD_COMMON_SRCS := $(wildcard $(DEPS_DIR)/zstd/lib/common/*.c)
ZSTD_COMP_SRCS := $(wildcard $(DEPS_DIR)/zstd/lib/compress/*.c)
ZSTD_DECOMP_SRCS := $(wildcard $(DEPS_DIR)/zstd/lib/decompress/*.c)
ZSTD_SRCS := $(ZSTD_COMMON_SRCS) $(ZSTD_COMP_SRCS) $(ZSTD_DECOMP_SRCS)
ZSTD_OBJS := $(patsubst $(DEPS_DIR)/zstd/lib/%.c, $(BUILD_DIR)/zstd/%.o, $(ZSTD_SRCS))

# C++ engine sources
CPP_SRCS := compressor.cpp
CPP_OBJS := $(BUILD_DIR)/compressor.o

ALL_OBJS := $(CPP_OBJS) $(LZ4_OBJS) $(ZLIB_OBJS) $(ZSTD_OBJS)
TARGET := module.mjs

.PHONY: all deps clean test serve help

all: deps $(TARGET)

# Download and unpack open-source C/C++ compression libraries
deps: $(DEPS_DIR)/lz4/lz4.c $(DEPS_DIR)/zlib/zlib.h $(DEPS_DIR)/zstd/lib/zstd.h

$(DEPS_DIR)/lz4/lz4.c:
	@mkdir -p $(DEPS_DIR)/lz4
	@echo "Downloading LZ4 source files..."
	curl -sL https://raw.githubusercontent.com/lz4/lz4/v1.10.0/lib/lz4.c -o $(DEPS_DIR)/lz4/lz4.c
	curl -sL https://raw.githubusercontent.com/lz4/lz4/v1.10.0/lib/lz4.h -o $(DEPS_DIR)/lz4/lz4.h
	curl -sL https://raw.githubusercontent.com/lz4/lz4/v1.10.0/lib/lz4hc.c -o $(DEPS_DIR)/lz4/lz4hc.c
	curl -sL https://raw.githubusercontent.com/lz4/lz4/v1.10.0/lib/lz4hc.h -o $(DEPS_DIR)/lz4/lz4hc.h

$(DEPS_DIR)/zlib/zlib.h:
	@mkdir -p $(DEPS_DIR)/zlib
	@echo "Downloading Zlib source archive..."
	curl -sL https://github.com/madler/zlib/archive/refs/tags/v1.3.1.tar.gz -o $(DEPS_DIR)/zlib.tar.gz
	tar -xzf $(DEPS_DIR)/zlib.tar.gz -C $(DEPS_DIR)/zlib --strip-components=1
	@rm -f $(DEPS_DIR)/zlib.tar.gz

$(DEPS_DIR)/zstd/lib/zstd.h:
	@mkdir -p $(DEPS_DIR)/zstd
	@echo "Downloading Zstandard source archive..."
	curl -sL https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-1.5.6.tar.gz -o $(DEPS_DIR)/zstd.tar.gz
	tar -xzf $(DEPS_DIR)/zstd.tar.gz -C $(DEPS_DIR)/zstd --strip-components=1
	@rm -f $(DEPS_DIR)/zstd.tar.gz

# Link all object files into ES6 WebAssembly module
$(TARGET): $(ALL_OBJS)
	@echo "Linking WebAssembly ES6 module: $(TARGET)..."
	$(CXX) $(LDFLAGS) $^ -o $@

# Compile C++ engine
$(BUILD_DIR)/compressor.o: compressor.cpp compressor.h | $(DEPS_DIR)/lz4/lz4.c $(DEPS_DIR)/zlib/zlib.h $(DEPS_DIR)/zstd/lib/zstd.h
	@mkdir -p $(dir $@)
	@echo "Compiling C++ engine: $< -> $@"
	$(CXX) $(CXXFLAGS) -c $< -o $@

# Compile LZ4 C objects
$(BUILD_DIR)/lz4/%.o: $(DEPS_DIR)/lz4/%.c
	@mkdir -p $(dir $@)
	@echo "Compiling LZ4: $< -> $@"
	$(CC) $(CFLAGS) -c $< -o $@

# Compile Zlib C objects
$(BUILD_DIR)/zlib/%.o: $(DEPS_DIR)/zlib/%.c
	@mkdir -p $(dir $@)
	@echo "Compiling Zlib: $< -> $@"
	$(CC) $(CFLAGS) -c $< -o $@

# Compile Zstd C objects
$(BUILD_DIR)/zstd/%.o: $(DEPS_DIR)/zstd/lib/%.c
	@mkdir -p $(dir $@)
	@echo "Compiling Zstd: $< -> $@"
	$(CC) $(CFLAGS) -c $< -o $@

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(BUILD_DIR) $(TARGET) module.wasm module.wasm.map

# Run automated tests
test: all
	@echo "Running end-to-end tests..."
	node test_e2e.mjs

# Start local preview server
serve: all
	@echo "Starting local HTTP server on http://localhost:8080..."
	python3 -m http.server 8080

help:
	@echo "File Compressor WebAssembly Build System"
	@echo "Targets:"
	@echo "  make deps   - Download open-source C/C++ libraries (lz4, zlib, zstd)"
	@echo "  make        - Build module.mjs and module.wasm"
	@echo "  make clean  - Remove object files and compiled outputs"
	@echo "  make test   - Run automated end-to-end tests"
	@echo "  make serve  - Start local web preview server"
