#include "flam3_engine.h"

#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace emscripten;
using namespace flam3;

// Helper function to return Uint8ClampedArray view of the internal RGBA buffer
val getPixelView(FlameEngine& engine) {
    const std::vector<uint8_t>& buf = engine.getRgbaBuffer();
    return val(typed_memory_view(buf.size(), buf.data()));
}

val getPixelArray(FlameEngine& engine) {
    const std::vector<uint8_t>& buf = engine.getRgbaBuffer();
    return val(typed_memory_view(buf.size(), buf.data()));
}

EMSCRIPTEN_BINDINGS(flam3_module) {
    register_vector<uint8_t>("VectorU8");
    register_vector<uint32_t>("VectorU32");

    value_object<CameraConfig>("CameraConfig")
        .field("centerX", &CameraConfig::center_x)
        .field("centerY", &CameraConfig::center_y)
        .field("zoom", &CameraConfig::zoom)
        .field("rotationDegrees", &CameraConfig::rotation_degrees);

    value_object<ToneConfig>("ToneConfig")
        .field("gamma", &ToneConfig::gamma)
        .field("brightness", &ToneConfig::brightness)
        .field("vibrancy", &ToneConfig::vibrancy)
        .field("bgColor", &ToneConfig::bg_color);

    value_object<Transform>("Transform")
        .field("a", &Transform::a)
        .field("b", &Transform::b)
        .field("c", &Transform::c)
        .field("d", &Transform::d)
        .field("e", &Transform::e)
        .field("f", &Transform::f)
        .field("pa", &Transform::pa)
        .field("pb", &Transform::pb)
        .field("pc", &Transform::pc)
        .field("pd", &Transform::pd)
        .field("pe", &Transform::pe)
        .field("pf", &Transform::pf)
        .field("hasPost", &Transform::has_post)
        .field("weight", &Transform::weight)
        .field("color", &Transform::color)
        .field("colorSpeed", &Transform::color_speed);

    class_<FlameEngine>("FlameEngine")
        .constructor<>()
        .function("init", &FlameEngine::init)
        .function("resize", &FlameEngine::resize)
        .function("setSupersample", &FlameEngine::setSupersample)
        .function("setCamera", &FlameEngine::setCamera)
        .function("getCamera", &FlameEngine::getCamera)
        .function("setToneConfig", &FlameEngine::setToneConfig)
        .function("getToneConfig", &FlameEngine::getToneConfig)
        .function("setSymmetry", &FlameEngine::setSymmetry)
        .function("getSymmetry", &FlameEngine::getSymmetry)
        .function("clearTransforms", &FlameEngine::clearTransforms)
        .function("addTransform", &FlameEngine::addTransform)
        .function("setTransform", &FlameEngine::setTransform)
        .function("getTransform", &FlameEngine::getTransform)
        .function("getTransformCount", &FlameEngine::getTransformCount)
        .function("setVariationWeight", &FlameEngine::setVariationWeight)
        .function("getVariationWeight", &FlameEngine::getVariationWeight)
        .function("setTransformAffine", &FlameEngine::setTransformAffine)
        .function("setTransformColor", &FlameEngine::setTransformColor)
        .function("setTransformWeight", &FlameEngine::setTransformWeight)
        .function("setPalettePreset", &FlameEngine::setPalettePreset)
        .function("setCustomPalette", &FlameEngine::setCustomPalette)
        .function("getCurrentPaletteName", &FlameEngine::getCurrentPaletteName)
        .function("loadPreset", &FlameEngine::loadPreset)
        .function("generateRandomFlame", &FlameEngine::generateRandomFlame)
        .function("mutateFlame", &FlameEngine::mutateFlame)
        .function("clearAccumulator", &FlameEngine::clearAccumulator)
        .function("renderSamples", &FlameEngine::renderSamples)
        .function("getWidth", &FlameEngine::getWidth)
        .function("getHeight", &FlameEngine::getHeight)
        .function("getSupersample", &FlameEngine::getSupersample)
        .function("getTotalSamples", &FlameEngine::getTotalSamples)
        .function("getPixelView", &getPixelView)
        .function("getPixelArray", &getPixelArray)
        .class_function("getPresetListJson", &FlameEngine::getPresetListJson)
        .class_function("getPaletteListJson", &FlameEngine::getPaletteListJson)
        .class_function("getVariationListJson", &FlameEngine::getVariationListJson);
}
