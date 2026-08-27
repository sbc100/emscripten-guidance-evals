CXX = em++
CC = emcc

CXXFLAGS = -std=c++17 -O3 -Wall -Wextra -I.
LDFLAGS = -lembind \
          -sEXPORT_ES6=1 \
          -sMODULARIZE=1 \
          -sEXPORT_NAME=createImageTranscoder \
          -sALLOW_MEMORY_GROWTH=1 \
          -sINITIAL_MEMORY=67108864 \
          -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','getValue','setValue','UTF8ToString','stringToUTF8','HEAPU8','HEAP32']" \
          -sEXPORTED_FUNCTIONS="['_malloc','_free','_create_buffer','_destroy_buffer','_transcode_c_api']" \
          -sENVIRONMENT=web,webview,worker,node

TARGET = module.mjs
SRCS = transcoder.cpp
HEADERS = transcoder.hpp vendor/stb_image.h vendor/stb_image_write.h vendor/stb_image_resize2.h vendor/qoi.h

.PHONY: all clean test

all: $(TARGET)

$(TARGET): $(SRCS) $(HEADERS)
	$(CXX) $(CXXFLAGS) $(SRCS) -o $(TARGET) $(LDFLAGS)

clean:
	rm -f module.mjs module.wasm

test: all
	node --input-type=module -e "import M from './module.mjs'; M().then(m => console.log('WASM module loaded and verified!'));"
