#include "flame_engine.hpp"
#include <ctime>
#include <cstdlib>
#include <cstring>
#include <algorithm>

extern int npalettes;

FlameEngine::FlameEngine() : hasGenome_(false) {
    memset(&genome_, 0, sizeof(flam3_genome));
    stats_ = {0.0, 0, 0.0};
    flam3_srandom();
    generateRandom(42, 3, 0, -1, 0, 0.0);
}

FlameEngine::~FlameEngine() {
    if (hasGenome_) {
        clear_cp(&genome_, flam3_defaults_off);
        hasGenome_ = false;
    }
}

void FlameEngine::resetCenterAndScale() {
    if (!hasGenome_) return;

    randctx rc;
    memset(rc.randrsl, 0, RANDSIZ * sizeof(ub4));
    for (int lp = 0; lp < RANDSIZ; lp++) {
        rc.randrsl[lp] = (ub4)(1337 + lp * 17);
    }
    irandinit(&rc, 1);

    double bmin[2] = {0.0, 0.0};
    double bmax[2] = {0.0, 0.0};
    flam3_estimate_bounding_box(&genome_, 0.01, 50000, bmin, bmax, &rc);

    genome_.center[0] = (bmin[0] + bmax[0]) / 2.0;
    genome_.center[1] = (bmin[1] + bmax[1]) / 2.0;
    genome_.rot_center[0] = genome_.center[0];
    genome_.rot_center[1] = genome_.center[1];

    double spanX = bmax[0] - bmin[0];
    double spanY = bmax[1] - bmin[1];
    double maxSpan = spanX > spanY ? spanX : spanY;
    if (maxSpan > 0.001) {
        int w = genome_.width > 0 ? genome_.width : 512;
        int h = genome_.height > 0 ? genome_.height : 512;
        double minDim = (w < h ? w : h);
        genome_.pixels_per_unit = minDim / (maxSpan * 1.15);
    } else {
        genome_.pixels_per_unit = 100.0;
    }
}

void FlameEngine::generateRandom(int seed, int numXforms, int symmetry, int variationIndex, int paletteIndex, double hueRotation) {
    if (hasGenome_) {
        clear_cp(&genome_, flam3_defaults_on);
    } else {
        memset(&genome_, 0, sizeof(flam3_genome));
        clear_cp(&genome_, flam3_defaults_on);
        hasGenome_ = true;
    }

    genome_.width = 512;
    genome_.height = 512;

    if (seed > 0) {
        srandom(seed);
    }

    int ivars[1];
    if (variationIndex >= 0 && variationIndex < flam3_nvariations) {
        ivars[0] = variationIndex;
    } else {
        ivars[0] = flam3_variation_random;
    }

    flam3_random(&genome_, ivars, 1, symmetry, numXforms);

    if (paletteIndex >= 0) {
        genome_.palette_index = flam3_get_palette(paletteIndex, genome_.palette, hueRotation);
        genome_.hue_rotation = hueRotation;
    }

    resetCenterAndScale();
}

void FlameEngine::mutate(int mode, double speed) {
    if (!hasGenome_) return;

    randctx rc;
    memset(rc.randrsl, 0, RANDSIZ * sizeof(ub4));
    for (int lp = 0; lp < RANDSIZ; lp++) {
        rc.randrsl[lp] = (ub4)(time(0) + rand());
    }
    irandinit(&rc, 1);

    char action[flam3_max_action_length] = {0};
    int ivars[1] = { flam3_variation_random };
    flam3_mutate(&genome_, mode, ivars, 1, genome_.symmetry, speed, &rc, action);
    resetCenterAndScale();
}

bool FlameEngine::loadXml(const std::string& xmlStr) {
    int ncps = 0;
    flam3_genome *cps = flam3_parse_xml2(const_cast<char*>(xmlStr.c_str()), const_cast<char*>("string"), flam3_defaults_on, &ncps);
    if (cps != nullptr && ncps > 0) {
        if (hasGenome_) {
            clear_cp(&genome_, flam3_defaults_on);
        } else {
            memset(&genome_, 0, sizeof(flam3_genome));
            hasGenome_ = true;
        }
        flam3_copy(&genome_, &cps[0]);
        for (int i = 0; i < ncps; i++) {
            clear_cp(&cps[i], flam3_defaults_off);
        }
        free(cps);
        resetCenterAndScale();
        return true;
    }
    return false;
}

std::string FlameEngine::getXml() {
    if (!hasGenome_) return "";
    char *xml = flam3_print_to_string(&genome_);
    if (!xml) return "";
    std::string res(xml);
    free(xml);
    return res;
}

void FlameEngine::setPaletteIndex(int idx, double hueRotation) {
    if (!hasGenome_) return;
    genome_.palette_index = flam3_get_palette(idx, genome_.palette, hueRotation);
    genome_.hue_rotation = hueRotation;
}

void FlameEngine::setHueRotation(double hr) {
    if (!hasGenome_) return;
    genome_.hue_rotation = hr;
    if (genome_.palette_index >= 0) {
        genome_.palette_index = flam3_get_palette(genome_.palette_index, genome_.palette, hr);
    }
}

void FlameEngine::setSymmetry(int sym) {
    if (!hasGenome_) return;
    genome_.symmetry = sym;
    if (sym > 0) {
        flam3_add_symmetry(&genome_, sym);
    }
}

emscripten::val FlameEngine::render(int width, int height, double sampleDensity, int spatialOversample,
                                    double filterRadius, double gamma, double vibrancy, double brightness,
                                    double contrast, double zoom, double rotate, double centerX, double centerY,
                                    int transparency) {
    if (!hasGenome_) {
        generateRandom(0, 3, 0, -1, 0, 0.0);
    }

    if (genome_.width != width || genome_.height != height) {
        if (genome_.width > 0 && genome_.pixels_per_unit > 0) {
            genome_.pixels_per_unit *= ((double)width / (double)genome_.width);
        }
        genome_.width = width;
        genome_.height = height;
    }

    genome_.sample_density = sampleDensity;
    genome_.spatial_oversample = spatialOversample;
    genome_.spatial_filter_radius = filterRadius;
    genome_.gamma = gamma;
    genome_.vibrancy = vibrancy;
    genome_.brightness = brightness;
    genome_.contrast = contrast;
    genome_.zoom = zoom;
    genome_.rotate = rotate;
    genome_.center[0] = centerX;
    genome_.center[1] = centerY;
    genome_.ntemporal_samples = 1;
    genome_.nbatches = 1;

    flam3_frame frame;
    flam3_init_frame(&frame);
    frame.genomes = &genome_;
    frame.ngenomes = 1;
    frame.bits = 33; // float precision accumulator
    frame.verbose = 0;
    frame.nthreads = 1;
    frame.earlyclip = 0;
    frame.sub_batch_size = 10000;
    frame.pixel_aspect_ratio = 1.0;
    frame.bytes_per_channel = 1;

    size_t bufSize = (size_t)width * height * 4;
    if (pixelBuffer_.size() != bufSize) {
        pixelBuffer_.resize(bufSize);
    }
    std::fill(pixelBuffer_.begin(), pixelBuffer_.end(), 0);

    stat_struct stats;
    memset(&stats, 0, sizeof(stats));

    flam3_render(&frame, pixelBuffer_.data(), flam3_field_both, 4 /* RGBA */, transparency, &stats);

    stats_.badvals = stats.badvals;
    stats_.numIters = stats.num_iters;
    stats_.renderSeconds = stats.render_seconds;

    return emscripten::val(emscripten::typed_memory_view(pixelBuffer_.size(), pixelBuffer_.data()));
}

std::vector<std::string> FlameEngine::getVariationNames() {
    std::vector<std::string> names;
    for (int i = 0; i < flam3_nvariations; i++) {
        if (flam3_variation_names[i]) {
            names.push_back(std::string(flam3_variation_names[i]));
        }
    }
    return names;
}

int FlameEngine::getVariationCount() {
    return flam3_nvariations;
}

int FlameEngine::getPaletteCount() {
    return npalettes > 0 ? npalettes : 680;
}
