EMCC ?= $(shell which emcc 2>/dev/null || echo /usr/local/google/home/sbc/dev/wasm/emscripten/emcc)
EMXX ?= $(shell which em++ 2>/dev/null || echo /usr/local/google/home/sbc/dev/wasm/emscripten/em++)

LZ4_DIR = third_party/lz4-1.9.4
ZLIB_DIR = third_party/zlib-1.3.1

INCLUDES = -I. -I$(LZ4_DIR)/lib -I$(ZLIB_DIR)

C_SRCS = \
	$(LZ4_DIR)/lib/lz4.c \
	$(LZ4_DIR)/lib/lz4frame.c \
	$(LZ4_DIR)/lib/lz4hc.c \
	$(LZ4_DIR)/lib/xxhash.c \
	$(ZLIB_DIR)/adler32.c \
	$(ZLIB_DIR)/compress.c \
	$(ZLIB_DIR)/crc32.c \
	$(ZLIB_DIR)/deflate.c \
	$(ZLIB_DIR)/infback.c \
	$(ZLIB_DIR)/inffast.c \
	$(ZLIB_DIR)/inflate.c \
	$(ZLIB_DIR)/inftrees.c \
	$(ZLIB_DIR)/trees.c \
	$(ZLIB_DIR)/uncompr.c \
	$(ZLIB_DIR)/zutil.c

CPP_SRCS = compressor.cpp

C_OBJS = $(C_SRCS:.c=.o)
CPP_OBJS = $(CPP_SRCS:.cpp=.o)
ALL_OBJS = $(CPP_OBJS) $(C_OBJS)

CFLAGS = -O3 $(INCLUDES)
CXXFLAGS = -O3 -std=c++17 -fexceptions $(INCLUDES)

LDFLAGS = \
	-O3 \
	-fexceptions \
	-lembind \
	-sEXPORT_ES6=1 \
	-sMODULARIZE=1 \
	-sEXPORT_NAME=createCompressorModule \
	-sENVIRONMENT=web,worker,node \
	-sALLOW_MEMORY_GROWTH=1 \
	-sINITIAL_MEMORY=67108864 \
	-sMAXIMUM_MEMORY=1073741824 \
	-sFILESYSTEM=0

.PHONY: all clean distclean download_deps test test-unit test-e2e serve

all: module.mjs

download_deps: $(LZ4_DIR) $(ZLIB_DIR)

$(LZ4_DIR):
	mkdir -p third_party
	curl -sL https://github.com/lz4/lz4/archive/refs/tags/v1.9.4.tar.gz | tar -xz -C third_party

$(ZLIB_DIR):
	mkdir -p third_party
	curl -sL https://github.com/madler/zlib/archive/refs/tags/v1.3.1.tar.gz | tar -xz -C third_party

%.o: %.c
	$(EMCC) $(CFLAGS) -c $< -o $@

%.o: %.cpp
	$(EMXX) $(CXXFLAGS) -c $< -o $@

$(ALL_OBJS): | $(LZ4_DIR) $(ZLIB_DIR)

module.mjs: $(ALL_OBJS)
	$(EMXX) $(LDFLAGS) $(ALL_OBJS) -o $@

test: all test-unit test-e2e

test-unit: all
	node test/test_node.mjs

test-e2e: all
	node test/test_browser_e2e.mjs

clean:
	rm -f module.mjs module.wasm $(ALL_OBJS)

distclean: clean
	rm -rf third_party node_modules package-lock.json
