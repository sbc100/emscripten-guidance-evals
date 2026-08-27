CXX = em++
CXXFLAGS += -O3 -flto -Werror -Wall -std=c++17
LDFLAGS += -O3 -flto -sSTRICT -sEXPORT_ES6 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH --bind --no-entry

TARGET = module.mjs
SRCS = flam3_engine.cpp main.cpp
OBJS = $(SRCS:.cpp=.o)

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(LDFLAGS) $^ -o $@

%.o: %.cpp flam3_engine.h
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET) $(TARGET:.mjs=.wasm)
