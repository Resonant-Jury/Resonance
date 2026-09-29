#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

// The thought map's dot grid (ThoughtMapCanvas: radial-gradient(oklch(82% 0.025 75)
// 1.2px, transparent 1.5px) on a (26·s)px tile positioned at the camera): a dot
// at the centre of every tile, its radius fixed at every zoom, only the spacing scaled.
[[ stitchable ]] half4 mapDots(float2 position, half4 color, float spacing, float2 origin, half4 dot) {
    float2 local = position - origin;
    float2 cell = local - spacing * floor(local / spacing);
    float d = distance(cell, float2(spacing * 0.5));
    float a = 1.0 - smoothstep(1.2, 1.5, d);
    return mix(color, dot, a * dot.a);
}
