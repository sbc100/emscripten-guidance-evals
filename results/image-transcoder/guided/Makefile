CXX = em++
CC = emcc

CXXFLAGS ?= -std=c++17 -O3 -flto -Wall -Werror -Ithird_party
LDFLAGS ?= -O3 -flto -sSTRICT -sEXPORT_ES6 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH --bind --no-entry

SRCS = codecs.cpp filters.cpp transcoder.cpp
OBJS = $(SRCS:.cpp=.o)
TARGET = module.mjs

.PHONY: all clean

all: $(TARGET)

%.o: %.cpp transcoder.h
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) $(OBJS) -o $@ $(LDFLAGS)

clean:
	rm -f $(OBJS) $(TARGET) $(TARGET:.mjs=.wasm) $(TARGET:.mjs=.mjs.map)
