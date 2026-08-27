#include "flam3_engine.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <iomanip>
#include <sstream>

namespace flam3 {

namespace {

constexpr double PI = 3.14159265358979323846;
constexpr double TWO_PI = 6.28318530717958647692;

inline double clampDouble(double v, double min_val, double max_val) {
    if (v < min_val) return min_val;
    if (v > max_val) return max_val;
    return v;
}

inline uint8_t clampU8(double v) {
    if (v <= 0.0) return 0;
    if (v >= 255.0) return 255;
    return static_cast<uint8_t>(v + 0.5);
}

// Built-in color palettes
struct PaletteDef {
    const char* name;
    struct ColorPoint {
        double pos;
        uint8_t r, g, b;
    };
    std::vector<ColorPoint> points;
};

const std::vector<PaletteDef>& getBuiltinPalettes() {
    static const std::vector<PaletteDef> palettes = {
        {
            "Flame Fire",
            {
                {0.00, 0, 0, 0},
                {0.20, 120, 10, 0},
                {0.45, 240, 70, 10},
                {0.70, 255, 180, 20},
                {0.90, 255, 240, 120},
                {1.00, 255, 255, 255}
            }
        },
        {
            "Electric Blue",
            {
                {0.00, 5, 5, 20},
                {0.25, 15, 60, 150},
                {0.50, 20, 160, 240},
                {0.75, 100, 220, 255},
                {0.90, 200, 245, 255},
                {1.00, 255, 255, 255}
            }
        },
        {
            "Rainbow Nebula",
            {
                {0.00, 200, 30, 80},
                {0.20, 230, 120, 20},
                {0.40, 220, 220, 40},
                {0.60, 30, 190, 90},
                {0.80, 40, 120, 240},
                {1.00, 180, 40, 220}
            }
        },
        {
            "Cyberpunk Neon",
            {
                {0.00, 10, 5, 25},
                {0.25, 255, 0, 128},
                {0.50, 128, 0, 255},
                {0.75, 0, 230, 255},
                {0.90, 255, 255, 0},
                {1.00, 255, 255, 255}
            }
        },
        {
            "Emerald Forest",
            {
                {0.00, 2, 20, 10},
                {0.25, 10, 80, 40},
                {0.50, 30, 170, 80},
                {0.75, 120, 230, 140},
                {0.90, 200, 255, 190},
                {1.00, 255, 255, 255}
            }
        },
        {
            "Sunset Gold",
            {
                {0.00, 20, 5, 30},
                {0.25, 130, 20, 60},
                {0.50, 220, 70, 40},
                {0.75, 255, 170, 30},
                {0.90, 255, 230, 120},
                {1.00, 255, 255, 240}
            }
        },
        {
            "Cosmic Violet",
            {
                {0.00, 10, 0, 20},
                {0.25, 70, 15, 110},
                {0.50, 150, 40, 190},
                {0.75, 210, 110, 240},
                {0.90, 245, 190, 255},
                {1.00, 255, 255, 255}
            }
        },
        {
            "Monochrome Plasma",
            {
                {0.00, 0, 0, 0},
                {0.30, 50, 50, 55},
                {0.60, 140, 145, 155},
                {0.85, 210, 215, 225},
                {1.00, 255, 255, 255}
            }
        },
        {
            "Autumn Ember",
            {
                {0.00, 30, 10, 5},
                {0.25, 140, 40, 10},
                {0.50, 210, 100, 20},
                {0.75, 235, 170, 40},
                {0.90, 250, 220, 100},
                {1.00, 255, 255, 230}
            }
        },
        {
            "Ice Crystal",
            {
                {0.00, 5, 15, 30},
                {0.30, 20, 80, 140},
                {0.60, 80, 170, 210},
                {0.85, 180, 230, 250},
                {1.00, 255, 255, 255}
            }
        }
    };
    return palettes;
}

} // namespace

FlameEngine::FlameEngine() {
    updatePaletteTable();
    init(800, 600, 2);
    loadPreset("Cosmic Spiral");
}

void FlameEngine::init(int width, int height, int supersample) {
    width_ = std::max(16, width);
    height_ = std::max(16, height);
    supersample_ = std::max(1, std::min(4, supersample));

    ss_width_ = width_ * supersample_;
    ss_height_ = height_ * supersample_;

    size_t total_acc_pixels = static_cast<size_t>(ss_width_) * ss_height_;
    accumulator_.assign(total_acc_pixels, AccumulatorPixel());

    size_t total_rgba = static_cast<size_t>(width_) * height_ * 4;
    rgba_output_.assign(total_rgba, 0);

    clearAccumulator();
}

void FlameEngine::resize(int width, int height) {
    init(width, height, supersample_);
}

void FlameEngine::setSupersample(int ss) {
    init(width_, height_, ss);
}

void FlameEngine::setCamera(double center_x, double center_y, double zoom, double rotation_degrees) {
    camera_.center_x = center_x;
    camera_.center_y = center_y;
    camera_.zoom = std::max(0.01, zoom);
    camera_.rotation_degrees = rotation_degrees;
}

CameraConfig FlameEngine::getCamera() const {
    return camera_;
}

void FlameEngine::setToneConfig(double gamma, double brightness, double vibrancy, uint32_t bg_color) {
    tone_.gamma = std::max(0.1, gamma);
    tone_.brightness = std::max(0.01, brightness);
    tone_.vibrancy = std::max(0.0, vibrancy);
    tone_.bg_color = bg_color;
}

ToneConfig FlameEngine::getToneConfig() const {
    return tone_;
}

void FlameEngine::setSymmetry(int order) {
    symmetry_order_ = std::max(1, std::min(16, order));
}

int FlameEngine::getSymmetry() const {
    return symmetry_order_;
}

void FlameEngine::clearTransforms() {
    transforms_.clear();
    cumulative_weights_.clear();
}

void FlameEngine::addTransform(const Transform& xform) {
    transforms_.push_back(xform);
    rebuildDistribution();
}

void FlameEngine::setTransform(int index, const Transform& xform) {
    if (index >= 0 && index < static_cast<int>(transforms_.size())) {
        transforms_[index] = xform;
        rebuildDistribution();
    }
}

Transform FlameEngine::getTransform(int index) const {
    if (index >= 0 && index < static_cast<int>(transforms_.size())) {
        return transforms_[index];
    }
    return Transform();
}

int FlameEngine::getTransformCount() const {
    return static_cast<int>(transforms_.size());
}

void FlameEngine::setVariationWeight(int xform_index, int var_type, double weight) {
    if (xform_index >= 0 && xform_index < static_cast<int>(transforms_.size())) {
        if (var_type >= 0 && var_type < NUM_VARIATIONS) {
            transforms_[xform_index].variations[var_type] = weight;
        }
    }
}

double FlameEngine::getVariationWeight(int xform_index, int var_type) const {
    if (xform_index >= 0 && xform_index < static_cast<int>(transforms_.size())) {
        if (var_type >= 0 && var_type < NUM_VARIATIONS) {
            return transforms_[xform_index].variations[var_type];
        }
    }
    return 0.0;
}

void FlameEngine::setTransformAffine(int xform_index, double a, double b, double c, double d, double e, double f) {
    if (xform_index >= 0 && xform_index < static_cast<int>(transforms_.size())) {
        Transform& xf = transforms_[xform_index];
        xf.a = a;
        xf.b = b;
        xf.c = c;
        xf.d = d;
        xf.e = e;
        xf.f = f;
    }
}

void FlameEngine::setTransformColor(int xform_index, double color, double color_speed) {
    if (xform_index >= 0 && xform_index < static_cast<int>(transforms_.size())) {
        Transform& xf = transforms_[xform_index];
        xf.color = clampDouble(color, 0.0, 1.0);
        xf.color_speed = clampDouble(color_speed, 0.0, 1.0);
    }
}

void FlameEngine::setTransformWeight(int xform_index, double weight) {
    if (xform_index >= 0 && xform_index < static_cast<int>(transforms_.size())) {
        transforms_[xform_index].weight = std::max(0.001, weight);
        rebuildDistribution();
    }
}

void FlameEngine::rebuildDistribution() {
    cumulative_weights_.clear();
    double sum = 0.0;
    for (const auto& xf : transforms_) {
        sum += std::max(0.0001, xf.weight);
        cumulative_weights_.push_back(sum);
    }
    if (sum > 0.0) {
        for (auto& w : cumulative_weights_) {
            w /= sum;
        }
    }
}

void FlameEngine::setPalettePreset(const std::string& name) {
    const auto& palettes = getBuiltinPalettes();
    for (const auto& pal : palettes) {
        if (pal.name == name) {
            current_palette_name_ = name;
            // Interpolate points across 256 colors
            for (int i = 0; i < PALETTE_SIZE; ++i) {
                double pos = static_cast<double>(i) / (PALETTE_SIZE - 1);
                if (pos <= pal.points.front().pos) {
                    palette_[i] = {pal.points.front().r, pal.points.front().g, pal.points.front().b};
                } else if (pos >= pal.points.back().pos) {
                    palette_[i] = {pal.points.back().r, pal.points.back().g, pal.points.back().b};
                } else {
                    for (size_t p = 0; p + 1 < pal.points.size(); ++p) {
                        if (pos >= pal.points[p].pos && pos <= pal.points[p + 1].pos) {
                            double span = pal.points[p + 1].pos - pal.points[p].pos;
                            double t = (span > 1e-6) ? ((pos - pal.points[p].pos) / span) : 0.0;
                            palette_[i].r = clampU8(pal.points[p].r + t * (pal.points[p + 1].r - pal.points[p].r));
                            palette_[i].g = clampU8(pal.points[p].g + t * (pal.points[p + 1].g - pal.points[p].g));
                            palette_[i].b = clampU8(pal.points[p].b + t * (pal.points[p + 1].b - pal.points[p].b));
                            break;
                        }
                    }
                }
            }
            return;
        }
    }
    // Fallback: Default to Flame Fire
    if (name != "Flame Fire") {
        setPalettePreset("Flame Fire");
    }
}

void FlameEngine::setCustomPalette(const std::vector<uint32_t>& colors) {
    if (colors.empty()) return;
    current_palette_name_ = "Custom";

    for (int i = 0; i < PALETTE_SIZE; ++i) {
        double pos = static_cast<double>(i) / (PALETTE_SIZE - 1);
        double idx = pos * (colors.size() - 1);
        size_t i0 = static_cast<size_t>(idx);
        size_t i1 = std::min(i0 + 1, colors.size() - 1);
        double t = idx - i0;

        uint32_t c0 = colors[i0];
        uint32_t c1 = colors[i1];

        uint8_t r0 = (c0 >> 16) & 0xFF;
        uint8_t g0 = (c0 >> 8) & 0xFF;
        uint8_t b0 = c0 & 0xFF;

        uint8_t r1 = (c1 >> 16) & 0xFF;
        uint8_t g1 = (c1 >> 8) & 0xFF;
        uint8_t b1 = c1 & 0xFF;

        palette_[i].r = clampU8(r0 + t * (r1 - r0));
        palette_[i].g = clampU8(g0 + t * (g1 - g0));
        palette_[i].b = clampU8(b0 + t * (b1 - b0));
    }
}

std::string FlameEngine::getCurrentPaletteName() const {
    return current_palette_name_;
}

void FlameEngine::updatePaletteTable() {
    setPalettePreset("Flame Fire");
}

void FlameEngine::clearAccumulator() {
    std::fill(accumulator_.begin(), accumulator_.end(), AccumulatorPixel());
    total_samples_ = 0;

    // Reset chaos game position
    curr_x_ = randDouble() * 2.0 - 1.0;
    curr_y_ = randDouble() * 2.0 - 1.0;
    curr_color_ = randDouble();

    // Warm-up chaos game (50 iterations)
    if (!transforms_.empty()) {
        for (int i = 0; i < 50; ++i) {
            double r = randDouble();
            size_t chosen = 0;
            for (size_t k = 0; k < cumulative_weights_.size(); ++k) {
                if (r <= cumulative_weights_[k]) {
                    chosen = k;
                    break;
                }
            }
            const auto& xf = transforms_[chosen];
            double aff_x = xf.a * curr_x_ + xf.b * curr_y_ + xf.c;
            double aff_y = xf.d * curr_x_ + xf.e * curr_y_ + xf.f;
            double var_x = 0.0, var_y = 0.0;
            applyVariations(xf, aff_x, aff_y, var_x, var_y);
            curr_x_ = var_x;
            curr_y_ = var_y;
            curr_color_ = (curr_color_ + xf.color) * 0.5;
        }
    }
}

uint64_t FlameEngine::randU64() {
    uint64_t s1 = rng_s_[0];
    const uint64_t s0 = rng_s_[1];
    rng_s_[0] = s0;
    s1 ^= s1 << 23;
    rng_s_[1] = s1 ^ s0 ^ (s1 >> 18) ^ (s0 >> 5);
    return rng_s_[1] + s0;
}

double FlameEngine::randDouble() {
    return (randU64() >> 11) * (1.0 / 9007199254740992.0);
}

void FlameEngine::applyVariations(const Transform& xf, double in_x, double in_y, double& out_x, double& out_y) {
    double vx = 0.0;
    double vy = 0.0;

    double x = in_x;
    double y = in_y;
    double r2 = x * x + y * y;
    double r = std::sqrt(r2);
    double theta = std::atan2(x, y);

    // 0: Linear
    if (xf.variations[VAR_LINEAR] != 0.0) {
        double w = xf.variations[VAR_LINEAR];
        vx += w * x;
        vy += w * y;
    }

    // 1: Sinusoidal
    if (xf.variations[VAR_SINUSOIDAL] != 0.0) {
        double w = xf.variations[VAR_SINUSOIDAL];
        vx += w * std::sin(x);
        vy += w * std::sin(y);
    }

    // 2: Spherical
    if (xf.variations[VAR_SPHERICAL] != 0.0) {
        double w = xf.variations[VAR_SPHERICAL];
        double inv_r2 = 1.0 / (r2 + 1e-10);
        vx += w * (x * inv_r2);
        vy += w * (y * inv_r2);
    }

    // 3: Swirl
    if (xf.variations[VAR_SWIRL] != 0.0) {
        double w = xf.variations[VAR_SWIRL];
        double s = std::sin(r2);
        double c = std::cos(r2);
        vx += w * (x * s - y * c);
        vy += w * (x * c + y * s);
    }

    // 4: Horseshoe
    if (xf.variations[VAR_HORSESHOE] != 0.0) {
        double w = xf.variations[VAR_HORSESHOE];
        double inv_r = 1.0 / (r + 1e-10);
        vx += w * ((x - y) * (x + y) * inv_r);
        vy += w * (2.0 * x * y * inv_r);
    }

    // 5: Polar
    if (xf.variations[VAR_POLAR] != 0.0) {
        double w = xf.variations[VAR_POLAR];
        vx += w * (theta / PI);
        vy += w * (r - 1.0);
    }

    // 6: Handkerchief
    if (xf.variations[VAR_HANDKERCHIEF] != 0.0) {
        double w = xf.variations[VAR_HANDKERCHIEF];
        vx += w * (r * std::sin(theta + r));
        vy += w * (r * std::cos(theta - r));
    }

    // 7: Heart
    if (xf.variations[VAR_HEART] != 0.0) {
        double w = xf.variations[VAR_HEART];
        vx += w * (r * std::sin(r * theta));
        vy += w * (-r * std::cos(r * theta));
    }

    // 8: Disc
    if (xf.variations[VAR_DISC] != 0.0) {
        double w = xf.variations[VAR_DISC];
        double t_pi = theta / PI;
        vx += w * (t_pi * std::sin(PI * r));
        vy += w * (t_pi * std::cos(PI * r));
    }

    // 9: Spiral
    if (xf.variations[VAR_SPIRAL] != 0.0) {
        double w = xf.variations[VAR_SPIRAL];
        double inv_r = 1.0 / (r + 1e-10);
        vx += w * (inv_r * (std::cos(theta) + std::sin(r)));
        vy += w * (inv_r * (std::sin(theta) - std::cos(r)));
    }

    // 10: Hyperbolic
    if (xf.variations[VAR_HYPERBOLIC] != 0.0) {
        double w = xf.variations[VAR_HYPERBOLIC];
        double inv_r = 1.0 / (r + 1e-10);
        vx += w * (std::sin(theta) * inv_r);
        vy += w * (r * std::cos(theta));
    }

    // 11: Diamond
    if (xf.variations[VAR_DIAMOND] != 0.0) {
        double w = xf.variations[VAR_DIAMOND];
        vx += w * (std::sin(theta) * std::cos(r));
        vy += w * (std::cos(theta) * std::sin(r));
    }

    // 12: Ex
    if (xf.variations[VAR_EX] != 0.0) {
        double w = xf.variations[VAR_EX];
        double p0 = std::sin(theta + r);
        double p1 = std::cos(theta - r);
        double p03 = p0 * p0 * p0;
        double p13 = p1 * p1 * p1;
        vx += w * (r * (p03 + p13));
        vy += w * (r * (p03 - p13));
    }

    // 13: Julia
    if (xf.variations[VAR_JULIA] != 0.0) {
        double w = xf.variations[VAR_JULIA];
        double sq_r = std::sqrt(r);
        double omega = (randDouble() < 0.5) ? 0.0 : PI;
        vx += w * (sq_r * std::cos(theta * 0.5 + omega));
        vy += w * (sq_r * std::sin(theta * 0.5 + omega));
    }

    // 14: Bent
    if (xf.variations[VAR_BENT] != 0.0) {
        double w = xf.variations[VAR_BENT];
        double bx = (x >= 0.0) ? x : 2.0 * x;
        double by = (y >= 0.0) ? y : y * 0.5;
        vx += w * bx;
        vy += w * by;
    }

    // 15: Waves
    if (xf.variations[VAR_WAVES] != 0.0) {
        double w = xf.variations[VAR_WAVES];
        double c2 = xf.param_waves_c * xf.param_waves_c + 1e-6;
        double f2 = xf.param_waves_f * xf.param_waves_f + 1e-6;
        vx += w * (x + xf.param_waves_b * std::sin(y / c2));
        vy += w * (y + xf.param_waves_e * std::sin(x / f2));
    }

    // 16: Fisheye
    if (xf.variations[VAR_FISHEYE] != 0.0) {
        double w = xf.variations[VAR_FISHEYE];
        double scale = 2.0 / (r + 1.0);
        vx += w * (scale * y);
        vy += w * (scale * x);
    }

    // 17: Popcorn
    if (xf.variations[VAR_POPCORN] != 0.0) {
        double w = xf.variations[VAR_POPCORN];
        vx += w * (x + xf.param_popcorn_c * std::sin(std::tan(3.0 * y)));
        vy += w * (y + xf.param_popcorn_f * std::sin(std::tan(3.0 * x)));
    }

    // 18: Exponential
    if (xf.variations[VAR_EXPONENTIAL] != 0.0) {
        double w = xf.variations[VAR_EXPONENTIAL];
        double exp_x = std::exp(clampDouble(x - 1.0, -10.0, 10.0));
        vx += w * (exp_x * std::cos(PI * y));
        vy += w * (exp_x * std::sin(PI * y));
    }

    // 19: Power
    if (xf.variations[VAR_POWER] != 0.0) {
        double w = xf.variations[VAR_POWER];
        double p = std::pow(std::max(1e-6, r), std::sin(theta));
        vx += w * (p * std::cos(theta));
        vy += w * (p * std::sin(theta));
    }

    // 20: Cosine
    if (xf.variations[VAR_COSINE] != 0.0) {
        double w = xf.variations[VAR_COSINE];
        double cy = clampDouble(y, -10.0, 10.0);
        vx += w * (std::cos(PI * x) * std::cosh(cy));
        vy += w * (-std::sin(PI * x) * std::sinh(cy));
    }

    // 21: Rings
    if (xf.variations[VAR_RINGS] != 0.0) {
        double w = xf.variations[VAR_RINGS];
        double c2 = xf.param_rings_c * xf.param_rings_c + 1e-6;
        double ring = std::fmod(r + c2, 2.0 * c2) - c2 + r * (1.0 - c2);
        vx += w * (ring * std::cos(theta));
        vy += w * (ring * std::sin(theta));
    }

    // 22: Fan
    if (xf.variations[VAR_FAN] != 0.0) {
        double w = xf.variations[VAR_FAN];
        double t = PI * (xf.c * xf.c + 1e-6);
        double f = xf.f;
        if (std::fmod(theta + f, t) > t * 0.5) {
            vx += w * (r * std::cos(theta - t * 0.5));
            vy += w * (r * std::sin(theta - t * 0.5));
        } else {
            vx += w * (r * std::cos(theta + t * 0.5));
            vy += w * (r * std::sin(theta + t * 0.5));
        }
    }

    // 23: Eyefish
    if (xf.variations[VAR_EYEFISH] != 0.0) {
        double w = xf.variations[VAR_EYEFISH];
        double scale = 2.0 / (r + 1.0);
        vx += w * (scale * x);
        vy += w * (scale * y);
    }

    // 24: Bubble
    if (xf.variations[VAR_BUBBLE] != 0.0) {
        double w = xf.variations[VAR_BUBBLE];
        double scale = 4.0 / (r2 + 4.0);
        vx += w * (scale * x);
        vy += w * (scale * y);
    }

    // 25: Cylinder
    if (xf.variations[VAR_CYLINDER] != 0.0) {
        double w = xf.variations[VAR_CYLINDER];
        vx += w * std::sin(x);
        vy += w * y;
    }

    // 26: Tangent
    if (xf.variations[VAR_TANGENT] != 0.0) {
        double w = xf.variations[VAR_TANGENT];
        double cos_y = std::cos(y);
        double inv_cos = (std::abs(cos_y) > 1e-5) ? (1.0 / cos_y) : 1000.0;
        vx += w * (std::sin(x) * inv_cos);
        vy += w * std::tan(y);
    }

    // 27: Cross
    if (xf.variations[VAR_CROSS] != 0.0) {
        double w = xf.variations[VAR_CROSS];
        double diff = x * x - y * y;
        double s = std::sqrt(1.0 / (diff * diff + 1e-6));
        vx += w * (s * x);
        vy += w * (s * y);
    }

    // 28: Collatz
    if (xf.variations[VAR_COLLATZ] != 0.0) {
        double w = xf.variations[VAR_COLLATZ];
        vx += w * (0.25 * (1.0 + 4.0 * x - (1.0 + 2.0 * x) * std::cos(PI * x)));
        vy += w * (0.25 * (1.0 + 4.0 * y - (1.0 + 2.0 * y) * std::cos(PI * y)));
    }

    // 29: Gaussian
    if (xf.variations[VAR_GAUSSIAN] != 0.0) {
        double w = xf.variations[VAR_GAUSSIAN];
        double u1 = std::max(1e-10, randDouble());
        double u2 = randDouble();
        double g_rad = std::sqrt(-2.0 * std::log(u1));
        vx += w * (g_rad * std::cos(TWO_PI * u2));
        vy += w * (g_rad * std::sin(TWO_PI * u2));
    }

    if (xf.has_post) {
        out_x = xf.pa * vx + xf.pb * vy + xf.pc;
        out_y = xf.pd * vx + xf.pe * vy + xf.pf;
    } else {
        out_x = vx;
        out_y = vy;
    }
}

int FlameEngine::renderSamples(int num_samples) {
    if (transforms_.empty() || cumulative_weights_.empty()) {
        return 0;
    }

    double rad_rot = camera_.rotation_degrees * (PI / 180.0);
    double cos_r = std::cos(rad_rot);
    double sin_r = std::sin(rad_rot);

    double aspect = static_cast<double>(ss_width_) / static_cast<double>(ss_height_);
    double scale_x = (ss_width_ * 0.5 * camera_.zoom) / aspect;
    double scale_y = (ss_height_ * 0.5 * camera_.zoom);
    double half_w = ss_width_ * 0.5;
    double half_h = ss_height_ * 0.5;

    int plotted_count = 0;

    for (int s = 0; s < num_samples; ++s) {
        // Select transform based on cumulative weights
        double r = randDouble();
        size_t chosen = 0;
        for (size_t k = 0; k < cumulative_weights_.size(); ++k) {
            if (r <= cumulative_weights_[k]) {
                chosen = k;
                break;
            }
        }

        const auto& xf = transforms_[chosen];

        // Affine step
        double aff_x = xf.a * curr_x_ + xf.b * curr_y_ + xf.c;
        double aff_y = xf.d * curr_x_ + xf.e * curr_y_ + xf.f;

        // Variations step
        double var_x = 0.0, var_y = 0.0;
        applyVariations(xf, aff_x, aff_y, var_x, var_y);

        // Sanity check coordinates for NaN / Inf
        if (!std::isfinite(var_x) || !std::isfinite(var_y) || std::abs(var_x) > 1e4 || std::abs(var_y) > 1e4) {
            curr_x_ = randDouble() * 2.0 - 1.0;
            curr_y_ = randDouble() * 2.0 - 1.0;
            curr_color_ = randDouble();
            continue;
        }

        curr_x_ = var_x;
        curr_y_ = var_y;
        curr_color_ = (1.0 - xf.color_speed) * curr_color_ + xf.color_speed * xf.color;

        // Sample palette
        int pal_idx = clampU8(curr_color_ * (PALETTE_SIZE - 1));
        const auto& col = palette_[pal_idx];

        // Apply symmetry if enabled
        for (int sym = 0; sym < symmetry_order_; ++sym) {
            double sym_x = curr_x_;
            double sym_y = curr_y_;

            if (symmetry_order_ > 1) {
                double sym_angle = sym * (TWO_PI / symmetry_order_);
                double sc = std::cos(sym_angle);
                double ss = std::sin(sym_angle);
                double rx = sym_x * sc - sym_y * ss;
                double ry = sym_x * ss + sym_y * sc;
                sym_x = rx;
                sym_y = ry;
            }

            // Apply camera translation, rotation, and scale
            double cam_x = sym_x - camera_.center_x;
            double cam_y = sym_y - camera_.center_y;

            double rot_x = cam_x * cos_r - cam_y * sin_r;
            double rot_y = cam_x * sin_r + cam_y * cos_r;

            int px = static_cast<int>(half_w + rot_x * scale_x);
            int py = static_cast<int>(half_h - rot_y * scale_y);

            if (px >= 0 && px < ss_width_ && py >= 0 && py < ss_height_) {
                size_t acc_idx = static_cast<size_t>(py) * ss_width_ + px;
                AccumulatorPixel& p = accumulator_[acc_idx];
                p.count += 1.0f;
                p.r += col.r;
                p.g += col.g;
                p.b += col.b;
                plotted_count++;
            }
        }
    }

    total_samples_ += num_samples;
    return plotted_count;
}

void FlameEngine::toneMapToRgba() {
    // Find maximum density for logarithmic tone mapping
    float max_density = 0.0f;
    for (const auto& p : accumulator_) {
        if (p.count > max_density) {
            max_density = p.count;
        }
    }

    double log_max = (max_density > 0.0f) ? std::log(1.0 + max_density * tone_.vibrancy) : 1.0;
    if (log_max < 1e-6) log_max = 1.0;

    double inv_gamma = 1.0 / tone_.gamma;
    double ss_factor = 1.0 / (supersample_ * supersample_);

    uint8_t bg_r = (tone_.bg_color >> 16) & 0xFF;
    uint8_t bg_g = (tone_.bg_color >> 8) & 0xFF;
    uint8_t bg_b = tone_.bg_color & 0xFF;

    for (int y = 0; y < height_; ++y) {
        for (int x = 0; x < width_; ++x) {
            double total_count = 0.0;
            double total_r = 0.0;
            double total_g = 0.0;
            double total_b = 0.0;

            // Box downsampling over supersample x supersample region
            for (int sy = 0; sy < supersample_; ++sy) {
                int py = y * supersample_ + sy;
                size_t row_offset = static_cast<size_t>(py) * ss_width_;
                for (int sx = 0; sx < supersample_; ++sx) {
                    int px = x * supersample_ + sx;
                    const auto& p = accumulator_[row_offset + px];
                    total_count += p.count;
                    total_r += p.r;
                    total_g += p.g;
                    total_b += p.b;
                }
            }

            size_t out_idx = (static_cast<size_t>(y) * width_ + x) * 4;

            if (total_count > 0.0) {
                double avg_count = total_count * ss_factor;
                double log_val = std::log(1.0 + avg_count * tone_.vibrancy) / log_max;
                double intensity = std::pow(clampDouble(log_val, 0.0, 1.0), inv_gamma) * tone_.brightness;

                double avg_r = total_r / total_count;
                double avg_g = total_g / total_count;
                double avg_b = total_b / total_count;

                double final_r = avg_r * intensity;
                double final_g = avg_g * intensity;
                double final_b = avg_b * intensity;

                // Blend with background
                double alpha = clampDouble(intensity, 0.0, 1.0);
                rgba_output_[out_idx + 0] = clampU8(final_r + bg_r * (1.0 - alpha));
                rgba_output_[out_idx + 1] = clampU8(final_g + bg_g * (1.0 - alpha));
                rgba_output_[out_idx + 2] = clampU8(final_b + bg_b * (1.0 - alpha));
                rgba_output_[out_idx + 3] = 255;
            } else {
                rgba_output_[out_idx + 0] = bg_r;
                rgba_output_[out_idx + 1] = bg_g;
                rgba_output_[out_idx + 2] = bg_b;
                rgba_output_[out_idx + 3] = 255;
            }
        }
    }
}

const std::vector<uint8_t>& FlameEngine::getRgbaBuffer() {
    toneMapToRgba();
    return rgba_output_;
}

uintptr_t FlameEngine::getRgbaBufferPtr() {
    toneMapToRgba();
    return reinterpret_cast<uintptr_t>(rgba_output_.data());
}

size_t FlameEngine::getRgbaBufferSize() const {
    return rgba_output_.size();
}

void FlameEngine::loadPreset(const std::string& name) {
    clearTransforms();
    setSymmetry(1);

    if (name == "Sierpinski Gasket") {
        // Classic 3-transform Sierpinski Triangle
        Transform t1;
        t1.a = 0.5; t1.b = 0.0; t1.c = 0.0;
        t1.d = 0.0; t1.e = 0.5; t1.f = 0.5;
        t1.variations[VAR_LINEAR] = 1.0;
        t1.color = 0.0; t1.weight = 1.0;

        Transform t2;
        t2.a = 0.5; t2.b = 0.0; t2.c = -0.5;
        t2.d = 0.0; t2.e = 0.5; t2.f = -0.5;
        t2.variations[VAR_LINEAR] = 1.0;
        t2.color = 0.5; t2.weight = 1.0;

        Transform t3;
        t3.a = 0.5; t3.b = 0.0; t3.c = 0.5;
        t3.d = 0.0; t3.e = 0.5; t3.f = -0.5;
        t3.variations[VAR_LINEAR] = 1.0;
        t3.color = 1.0; t3.weight = 1.0;

        addTransform(t1);
        addTransform(t2);
        addTransform(t3);
        setPalettePreset("Electric Blue");
        setCamera(0.0, 0.0, 1.2, 0.0);
    } else if (name == "Cosmic Spiral") {
        Transform t1;
        t1.a = 0.787473; t1.b = -0.422315; t1.c = 0.0;
        t1.d = 0.422315; t1.e = 0.787473; t1.f = 0.0;
        t1.variations[VAR_SWIRL] = 0.8;
        t1.variations[VAR_SPIRAL] = 0.4;
        t1.color = 0.15; t1.weight = 1.0;

        Transform t2;
        t2.a = -0.1212; t2.b = 0.2575; t2.c = -0.3754;
        t2.d = 0.3754; t2.e = 0.5758; t2.f = -0.0758;
        t2.variations[VAR_SPHERICAL] = 0.6;
        t2.variations[VAR_LINEAR] = 0.4;
        t2.color = 0.65; t2.weight = 0.8;

        Transform t3;
        t3.a = -0.4851; t3.b = -0.4851; t3.c = 0.4371;
        t3.d = 0.4851; t3.e = -0.4851; t3.f = 0.3637;
        t3.variations[VAR_SINUSOIDAL] = 0.7;
        t3.variations[VAR_SWIRL] = 0.3;
        t3.color = 0.95; t3.weight = 0.6;

        addTransform(t1);
        addTransform(t2);
        addTransform(t3);
        setPalettePreset("Flame Fire");
        setCamera(0.0, 0.0, 1.1, 0.0);
    } else if (name == "Electric Jellyfish") {
        Transform t1;
        t1.a = 0.6; t1.b = -0.3; t1.c = 0.0;
        t1.d = 0.3; t1.e = 0.6; t1.f = 0.2;
        t1.variations[VAR_HORSESHOE] = 0.9;
        t1.variations[VAR_SPHERICAL] = 0.3;
        t1.color = 0.2; t1.weight = 1.0;

        Transform t2;
        t2.a = 0.4; t2.b = 0.5; t2.c = -0.2;
        t2.d = -0.5; t2.e = 0.4; t2.f = -0.3;
        t2.variations[VAR_POLAR] = 0.7;
        t2.variations[VAR_SWIRL] = 0.5;
        t2.color = 0.7; t2.weight = 0.9;

        Transform t3;
        t3.a = -0.5; t3.b = 0.2; t3.c = 0.3;
        t3.d = 0.2; t3.e = 0.5; t3.f = -0.1;
        t3.variations[VAR_EXPONENTIAL] = 0.4;
        t3.variations[VAR_BUBBLE] = 0.6;
        t3.color = 0.45; t3.weight = 0.7;

        addTransform(t1);
        addTransform(t2);
        addTransform(t3);
        setPalettePreset("Electric Blue");
        setCamera(0.0, 0.0, 1.2, 0.0);
    } else if (name == "Hyperbolic Mandala") {
        Transform t1;
        t1.a = 0.7; t1.b = 0.2; t1.c = 0.1;
        t1.d = -0.2; t1.e = 0.7; t1.f = -0.1;
        t1.variations[VAR_HYPERBOLIC] = 0.7;
        t1.variations[VAR_DIAMOND] = 0.5;
        t1.color = 0.1; t1.weight = 1.0;

        Transform t2;
        t2.a = 0.3; t2.b = -0.6; t2.c = -0.2;
        t2.d = 0.6; t2.e = 0.3; t2.f = 0.2;
        t2.variations[VAR_RINGS] = 0.8;
        t2.variations[VAR_SPHERICAL] = 0.3;
        t2.color = 0.55; t2.weight = 0.85;

        Transform t3;
        t3.a = -0.4; t3.b = 0.4; t3.c = 0.0;
        t3.d = -0.4; t3.e = -0.4; t3.f = 0.0;
        t3.variations[VAR_JULIA] = 0.6;
        t3.variations[VAR_POLAR] = 0.4;
        t3.color = 0.85; t3.weight = 0.65;

        addTransform(t1);
        addTransform(t2);
        addTransform(t3);
        setSymmetry(6);
        setPalettePreset("Rainbow Nebula");
        setCamera(0.0, 0.0, 1.0, 0.0);
    } else if (name == "Cyberpunk Phoenix") {
        Transform t1;
        t1.a = 0.82; t1.b = 0.05; t1.c = 0.1;
        t1.d = -0.05; t1.e = 0.82; t1.f = -0.1;
        t1.variations[VAR_HANDKERCHIEF] = 0.75;
        t1.variations[VAR_HEART] = 0.35;
        t1.color = 0.15; t1.weight = 1.0;

        Transform t2;
        t2.a = -0.4; t2.b = 0.6; t2.c = -0.3;
        t2.d = -0.6; t2.e = -0.4; t2.f = 0.2;
        t2.variations[VAR_SWIRL] = 0.6;
        t2.variations[VAR_EX] = 0.4;
        t2.color = 0.6; t2.weight = 0.8;

        Transform t3;
        t3.a = 0.3; t3.b = -0.3; t3.c = 0.4;
        t3.d = 0.3; t3.e = 0.3; t3.f = -0.4;
        t3.variations[VAR_JULIA] = 0.8;
        t3.variations[VAR_SINUSOIDAL] = 0.3;
        t3.color = 0.9; t3.weight = 0.7;

        addTransform(t1);
        addTransform(t2);
        addTransform(t3);
        setPalettePreset("Cyberpunk Neon");
        setCamera(0.0, 0.0, 1.1, 0.0);
    } else if (name == "Neon Nebula") {
        Transform t1;
        t1.a = 0.5; t1.b = -0.5; t1.c = 0.1;
        t1.d = 0.5; t1.e = 0.5; t1.f = -0.1;
        t1.variations[VAR_BUBBLE] = 0.9;
        t1.variations[VAR_WAVES] = 0.3;
        t1.color = 0.1; t1.weight = 1.0;

        Transform t2;
        t2.a = -0.6; t2.b = 0.2; t2.c = -0.2;
        t2.d = 0.2; t2.e = 0.6; t2.f = 0.2;
        t2.variations[VAR_SWIRL] = 0.8;
        t2.variations[VAR_SPHERICAL] = 0.4;
        t2.color = 0.5; t2.weight = 0.85;

        Transform t3;
        t3.a = 0.4; t3.b = 0.4; t3.c = 0.0;
        t3.d = -0.4; t3.e = 0.4; t3.f = 0.0;
        t3.variations[VAR_DISC] = 0.7;
        t3.variations[VAR_CYLINDER] = 0.5;
        t3.color = 0.8; t3.weight = 0.75;

        addTransform(t1);
        addTransform(t2);
        addTransform(t3);
        setPalettePreset("Cosmic Violet");
        setCamera(0.0, 0.0, 1.15, 0.0);
    } else if (name == "Crystalline Star") {
        Transform t1;
        t1.a = 0.65; t1.b = 0.1; t1.c = 0.0;
        t1.d = -0.1; t1.e = 0.65; t1.f = 0.1;
        t1.variations[VAR_DIAMOND] = 0.8;
        t1.variations[VAR_CROSS] = 0.4;
        t1.color = 0.2; t1.weight = 1.0;

        Transform t2;
        t2.a = 0.2; t2.b = -0.5; t2.c = 0.2;
        t2.d = 0.5; t2.e = 0.2; t2.f = -0.2;
        t2.variations[VAR_CYLINDER] = 0.7;
        t2.variations[VAR_SPHERICAL] = 0.3;
        t2.color = 0.7; t2.weight = 0.9;

        addTransform(t1);
        addTransform(t2);
        setSymmetry(8);
        setPalettePreset("Ice Crystal");
        setCamera(0.0, 0.0, 1.0, 0.0);
    } else {
        // Fallback default
        loadPreset("Cosmic Spiral");
        return;
    }

    clearAccumulator();
}

void FlameEngine::generateRandomFlame(int num_xforms, const std::string& primary_var) {
    clearTransforms();
    int count = std::max(2, std::min(6, num_xforms));

    int primary_idx = -1;
    if (primary_var == "Swirl") primary_idx = VAR_SWIRL;
    else if (primary_var == "Spherical") primary_idx = VAR_SPHERICAL;
    else if (primary_var == "Horseshoe") primary_idx = VAR_HORSESHOE;
    else if (primary_var == "Julia") primary_idx = VAR_JULIA;
    else if (primary_var == "Hyperbolic") primary_idx = VAR_HYPERBOLIC;
    else if (primary_var == "Diamond") primary_idx = VAR_DIAMOND;
    else if (primary_var == "Bubble") primary_idx = VAR_BUBBLE;
    else if (primary_var == "Rings") primary_idx = VAR_RINGS;

    for (int i = 0; i < count; ++i) {
        Transform xf;
        // Generate contractive affine transform
        double angle = randDouble() * TWO_PI;
        double scale = 0.3 + randDouble() * 0.5;
        double skew = (randDouble() - 0.5) * 0.3;

        xf.a = scale * std::cos(angle);
        xf.b = -scale * std::sin(angle) + skew;
        xf.c = (randDouble() - 0.5) * 0.8;
        xf.d = scale * std::sin(angle);
        xf.e = scale * std::cos(angle) + skew;
        xf.f = (randDouble() - 0.5) * 0.8;

        // Assign variations
        if (primary_idx >= 0 && i == 0) {
            xf.variations[primary_idx] = 0.8;
            xf.variations[VAR_LINEAR] = 0.2;
        } else {
            int v1 = static_cast<int>(randDouble() * NUM_VARIATIONS);
            int v2 = static_cast<int>(randDouble() * NUM_VARIATIONS);
            xf.variations[v1] = 0.5 + randDouble() * 0.5;
            if (v1 != v2) {
                xf.variations[v2] = randDouble() * 0.5;
            }
        }

        xf.color = static_cast<double>(i) / count;
        xf.color_speed = 0.4 + randDouble() * 0.4;
        xf.weight = 0.5 + randDouble() * 0.5;

        addTransform(xf);
    }

    const auto& palettes = getBuiltinPalettes();
    int pal_choice = static_cast<int>(randDouble() * palettes.size());
    setPalettePreset(palettes[pal_choice].name);

    int sym = (randDouble() < 0.3) ? (2 + static_cast<int>(randDouble() * 5)) : 1;
    setSymmetry(sym);
    setCamera(0.0, 0.0, 1.1, 0.0);
    clearAccumulator();
}

void FlameEngine::mutateFlame(double amount) {
    double amt = clampDouble(amount, 0.01, 1.0);
    for (auto& xf : transforms_) {
        xf.a += (randDouble() - 0.5) * 0.2 * amt;
        xf.b += (randDouble() - 0.5) * 0.2 * amt;
        xf.c += (randDouble() - 0.5) * 0.2 * amt;
        xf.d += (randDouble() - 0.5) * 0.2 * amt;
        xf.e += (randDouble() - 0.5) * 0.2 * amt;
        xf.f += (randDouble() - 0.5) * 0.2 * amt;

        for (int v = 0; v < NUM_VARIATIONS; ++v) {
            if (xf.variations[v] > 0.01) {
                xf.variations[v] += (randDouble() - 0.5) * 0.2 * amt;
                if (xf.variations[v] < 0.0) xf.variations[v] = 0.0;
            }
        }

        xf.color = clampDouble(xf.color + (randDouble() - 0.5) * 0.1 * amt, 0.0, 1.0);
        xf.weight = clampDouble(xf.weight + (randDouble() - 0.5) * 0.2 * amt, 0.1, 2.0);
    }
    rebuildDistribution();
    clearAccumulator();
}

std::string FlameEngine::getPresetListJson() {
    std::ostringstream ss;
    ss << "[";
    ss << "\"Cosmic Spiral\",";
    ss << "\"Sierpinski Gasket\",";
    ss << "\"Electric Jellyfish\",";
    ss << "\"Hyperbolic Mandala\",";
    ss << "\"Cyberpunk Phoenix\",";
    ss << "\"Neon Nebula\",";
    ss << "\"Crystalline Star\"";
    ss << "]";
    return ss.str();
}

std::string FlameEngine::getPaletteListJson() {
    const auto& palettes = getBuiltinPalettes();
    std::ostringstream ss;
    ss << "[";
    for (size_t i = 0; i < palettes.size(); ++i) {
        ss << "\"" << palettes[i].name << "\"";
        if (i + 1 < palettes.size()) ss << ",";
    }
    ss << "]";
    return ss.str();
}

std::string FlameEngine::getVariationListJson() {
    static const char* var_names[NUM_VARIATIONS] = {
        "Linear", "Sinusoidal", "Spherical", "Swirl", "Horseshoe",
        "Polar", "Handkerchief", "Heart", "Disc", "Spiral",
        "Hyperbolic", "Diamond", "Ex", "Julia", "Bent",
        "Waves", "Fisheye", "Popcorn", "Exponential", "Power",
        "Cosine", "Rings", "Fan", "Eyefish", "Bubble",
        "Cylinder", "Tangent", "Cross", "Collatz", "Gaussian"
    };
    std::ostringstream ss;
    ss << "[";
    for (int i = 0; i < NUM_VARIATIONS; ++i) {
        ss << "{\"id\":" << i << ",\"name\":\"" << var_names[i] << "\"}";
        if (i + 1 < NUM_VARIATIONS) ss << ",";
    }
    ss << "]";
    return ss.str();
}

} // namespace flam3
