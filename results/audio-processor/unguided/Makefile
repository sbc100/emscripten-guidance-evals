CXX = em++
CXXFLAGS ?= -O3 -std=c++17

EXPORTED_FUNCTIONS = '["_malloc","_free","_create_audio_processor","_destroy_audio_processor","_processor_set_sample_rate","_processor_set_waveform","_processor_set_frequency","_processor_set_amplitude","_processor_set_pulse_width","_processor_set_fm","_processor_set_filter","_processor_set_delay","_processor_set_distortion","_processor_set_bitcrush","_processor_set_adsr","_processor_note_on","_processor_note_off","_processor_reset","_processor_process","_processor_process_input","_generate_waveform","_apply_gain","_apply_biquad_filter","_apply_delay","_apply_distortion","_apply_adsr"]'
EXPORTED_RUNTIME_METHODS = '["ccall","cwrap","HEAPF32","getValue","setValue"]'

EMFLAGS = -sEXPORT_ES6=1 \
          -sMODULARIZE=1 \
          -sEXPORT_NAME="createAudioProcessorModule" \
          -sENVIRONMENT="web,worker,node" \
          -sALLOW_MEMORY_GROWTH=1 \
          -sDEFAULT_TO_CXX \
          -sEXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) \
          -sEXPORTED_RUNTIME_METHODS=$(EXPORTED_RUNTIME_METHODS)

all: module.mjs

module.mjs: audio_processor.cpp
	$(CXX) $(CXXFLAGS) $(EMFLAGS) audio_processor.cpp -o module.mjs

clean:
	rm -f module.mjs module.wasm

test: module.mjs
	node --input-type=module -e "import createModule from './module.mjs'; createModule().then(m => { const p = m._create_audio_processor(44100); console.log('WASM Audio Processor initialized successfully. Pointer:', p); m._destroy_audio_processor(p); });"

.PHONY: all clean test
