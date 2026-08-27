CC = emcc
CXX = em++

CFLAGS = -O3 -flto -DHAVE_CONFIG_H -DGIT_REV=\"v3.1.1\" -DPACKAGE_DATA_DIR=\"/flam3\" \
         -I./flam3-src -I./libxml2-src/include -I./libxml2-src/build \
         -sUSE_LIBPNG -sUSE_LIBJPEG -sUSE_ZLIB

CXXFLAGS = -O3 -flto -std=c++17 -Wall -Wextra -DHAVE_CONFIG_H -DGIT_REV=\"v3.1.1\" -DPACKAGE_DATA_DIR=\"/flam3\" \
           -I./flam3-src -I./libxml2-src/include -I./libxml2-src/build \
           -sUSE_LIBPNG -sUSE_LIBJPEG -sUSE_ZLIB

LDFLAGS = -O3 -flto -sSTRICT -sEXPORT_ES6 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH --bind --no-entry \
          -sUSE_LIBPNG -sUSE_LIBJPEG -sUSE_ZLIB \
          --embed-file flam3-src/flam3-palettes.xml@/flam3/flam3-palettes.xml

FLAM3_C_SRCS = flam3-src/flam3.c \
               flam3-src/filters.c \
               flam3-src/parser.c \
               flam3-src/variations.c \
               flam3-src/interpolation.c \
               flam3-src/palettes.c \
               flam3-src/jpeg.c \
               flam3-src/png.c \
               flam3-src/isaac.c

CXX_SRCS = flame_engine.cpp main.cpp

FLAM3_OBJS = $(FLAM3_C_SRCS:.c=.o)
CXX_OBJS = $(CXX_SRCS:.cpp=.o)
ALL_OBJS = $(FLAM3_OBJS) $(CXX_OBJS)

LIBXML2_STATIC = libxml2-src/build/libxml2.a

all: module.mjs

$(LIBXML2_STATIC):
	mkdir -p libxml2-src/build && \
	cd libxml2-src/build && \
	emcmake cmake .. -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_TESTS=OFF \
	                 -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_HTTP=OFF \
	                 -DLIBXML2_WITH_FTP=OFF -DLIBXML2_WITH_ICONV=OFF \
	                 -DLIBXML2_WITH_LZMA=OFF -DLIBXML2_WITH_ZLIB=OFF && \
	emmake make -j4

flam3-src/%.o: flam3-src/%.c
	$(CC) $(CFLAGS) -c $< -o $@

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

module.mjs: $(LIBXML2_STATIC) $(ALL_OBJS)
	$(CXX) $(ALL_OBJS) $(LIBXML2_STATIC) $(LDFLAGS) -o $@

clean:
	rm -f $(ALL_OBJS) module.mjs module.wasm

.PHONY: all clean
