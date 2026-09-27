#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

// SVG feTurbulence (fractalNoise, stitchTiles) per pixel on the GPU — the same
// algorithm as scripts/native/turbulence.ts and the browser, so the grain is
// the web's noise field, computed at any size instead of tiled.
//
// The lattice is built on the CPU once per seed (TurbulenceLattice.swift):
//   table[0 ..< 514]                       selector
//   table[514 + (k * 514 + i) * 2 + xy]    gradient, channel k, index i

constant int BM = 0xff;
constant int PerlinN = 0x1000;
constant int N = 514;

struct Stitch { int width; int height; int wrapX; int wrapY; };

static float noise2(device const float *T, int ch, float2 v, Stitch st) {
    float2 f = floor(v);
    int bx0 = int(f.x) + PerlinN, by0 = int(f.y) + PerlinN;
    int bx1 = bx0 + 1, by1 = by0 + 1;
    float rx0 = v.x - f.x, ry0 = v.y - f.y;
    float rx1 = rx0 - 1.0, ry1 = ry0 - 1.0;
    if (bx0 >= st.wrapX) bx0 -= st.width;
    if (bx1 >= st.wrapX) bx1 -= st.width;
    if (by0 >= st.wrapY) by0 -= st.height;
    if (by1 >= st.wrapY) by1 -= st.height;
    bx0 &= BM; bx1 &= BM; by0 &= BM; by1 &= BM;
    int i = int(T[bx0]), j = int(T[bx1]);
    int b00 = int(T[i + by0]), b10 = int(T[j + by0]);
    int b01 = int(T[i + by1]), b11 = int(T[j + by1]);
    float sx = rx0 * rx0 * (3.0 - 2.0 * rx0);
    float sy = ry0 * ry0 * (3.0 - 2.0 * ry0);
    device const float *G = T + N + ch * N * 2;
    float a = mix(rx0 * G[b00 * 2] + ry0 * G[b00 * 2 + 1], rx1 * G[b10 * 2] + ry0 * G[b10 * 2 + 1], sx);
    float b = mix(rx0 * G[b01 * 2] + ry1 * G[b01 * 2 + 1], rx1 * G[b11 * 2] + ry1 * G[b11 * 2 + 1], sx);
    return mix(a, b, sy);
}

// stitchTiles="stitch": nudge the frequency so the region holds whole lattice cells.
static float stitchFrequency(float f, float extent) {
    float lo = floor(extent * f) / extent, hi = ceil(extent * f) / extent;
    if (lo <= 0.0) return hi;
    return (f / lo < hi / f) ? lo : hi;
}

// RGBA in [0, 1], straight alpha, in the filter's (linearRGB) working space.
static float4 turbulence(device const float *T, float2 p, float2 size, float baseFrequency, int octaves) {
    float fx = stitchFrequency(baseFrequency, size.x);
    float fy = stitchFrequency(baseFrequency, size.y);
    Stitch st0;
    st0.width = int(size.x * fx + 0.5);
    st0.height = int(size.y * fy + 0.5);
    st0.wrapX = PerlinN + st0.width; // the region's origin is the view's (0, 0)
    st0.wrapY = PerlinN + st0.height;
    float4 sum = 0.0;
    for (int ch = 0; ch < 4; ch++) {
        Stitch st = st0;
        float2 v = p * float2(fx, fy);
        float ratio = 1.0;
        for (int o = 0; o < octaves; o++) {
            sum[ch] += noise2(T, ch, v, st) / ratio;
            v *= 2.0;
            ratio *= 2.0;
            st.width *= 2;
            st.wrapX = 2 * st.wrapX - PerlinN;
            st.height *= 2;
            st.wrapY = 2 * st.wrapY - PerlinN;
        }
    }
    return clamp((sum + 1.0) * 0.5, 0.0, 1.0);
}

static float toSrgb(float c) {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

/// mode 0 — ShapeGrain: gray = luminance (saturate 0 in linearRGB, shown in sRGB),
///          alpha = noise alpha × opacity.
/// mode 1 — GrainOverlay: black, alpha = (1 − luminance) × opacity.
/// mode 2 / 3 — parity probes: opaque gray of the luminance / of the noise alpha.
/// The input colour's alpha is the shape's coverage, so the effect clips to it.
[[ stitchable ]] half4 grain(float2 position, half4 color, device const float *table, int count,
                             float2 size, float frequency, float octaves, float opacity, float mode) {
    float4 n = turbulence(table, position, size, frequency, int(octaves));
    float lum = dot(n.rgb, float3(0.2126, 0.7152, 0.0722));
    float g, a;
    if (mode < 0.5) { g = toSrgb(lum); a = n.a * opacity; }
    else if (mode < 1.5) { g = 0.0; a = (1.0 - lum) * opacity; }
    else if (mode < 2.5) { g = toSrgb(lum); a = 1.0; }
    else { g = n.a; a = 1.0; }
    a *= float(color.a);
    return half4(half(g * a), half(g * a), half(g * a), half(a));
}
