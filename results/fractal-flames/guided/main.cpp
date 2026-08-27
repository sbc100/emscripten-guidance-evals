#include "flame_engine.hpp"
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(flam3_module) {
    value_object<RenderStats>("RenderStats")
        .field("badvals", &RenderStats::badvals)
        .field("numIters", &RenderStats::numIters)
        .field("renderSeconds", &RenderStats::renderSeconds);

    register_vector<std::string>("VectorString");

    class_<FlameEngine>("FlameEngine")
        .constructor<>()
        .function("generateRandom", &FlameEngine::generateRandom)
        .function("mutate", &FlameEngine::mutate)
        .function("loadXml", &FlameEngine::loadXml)
        .function("getXml", &FlameEngine::getXml)
        .function("resetCenterAndScale", &FlameEngine::resetCenterAndScale)
        .function("getWidth", &FlameEngine::getWidth)
        .function("setWidth", &FlameEngine::setWidth)
        .function("getHeight", &FlameEngine::getHeight)
        .function("setHeight", &FlameEngine::setHeight)
        .function("getQuality", &FlameEngine::getQuality)
        .function("setQuality", &FlameEngine::setQuality)
        .function("getSpatialOversample", &FlameEngine::getSpatialOversample)
        .function("setSpatialOversample", &FlameEngine::setSpatialOversample)
        .function("getSpatialFilterRadius", &FlameEngine::getSpatialFilterRadius)
        .function("setSpatialFilterRadius", &FlameEngine::setSpatialFilterRadius)
        .function("getGamma", &FlameEngine::getGamma)
        .function("setGamma", &FlameEngine::setGamma)
        .function("getVibrancy", &FlameEngine::getVibrancy)
        .function("setVibrancy", &FlameEngine::setVibrancy)
        .function("getBrightness", &FlameEngine::getBrightness)
        .function("setBrightness", &FlameEngine::setBrightness)
        .function("getContrast", &FlameEngine::getContrast)
        .function("setContrast", &FlameEngine::setContrast)
        .function("getZoom", &FlameEngine::getZoom)
        .function("setZoom", &FlameEngine::setZoom)
        .function("getRotate", &FlameEngine::getRotate)
        .function("setRotate", &FlameEngine::setRotate)
        .function("getCenterX", &FlameEngine::getCenterX)
        .function("setCenterX", &FlameEngine::setCenterX)
        .function("getCenterY", &FlameEngine::getCenterY)
        .function("setCenterY", &FlameEngine::setCenterY)
        .function("getPixelsPerUnit", &FlameEngine::getPixelsPerUnit)
        .function("setPixelsPerUnit", &FlameEngine::setPixelsPerUnit)
        .function("getPaletteIndex", &FlameEngine::getPaletteIndex)
        .function("setPaletteIndex", &FlameEngine::setPaletteIndex)
        .function("getHueRotation", &FlameEngine::getHueRotation)
        .function("setHueRotation", &FlameEngine::setHueRotation)
        .function("getSymmetry", &FlameEngine::getSymmetry)
        .function("setSymmetry", &FlameEngine::setSymmetry)
        .function("getNumXforms", &FlameEngine::getNumXforms)
        .function("render", &FlameEngine::render)
        .function("getLastStats", &FlameEngine::getLastStats)
        .class_function("getVariationNames", &FlameEngine::getVariationNames)
        .class_function("getVariationCount", &FlameEngine::getVariationCount)
        .class_function("getPaletteCount", &FlameEngine::getPaletteCount);
}
