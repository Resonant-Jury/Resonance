package com.resonance.design

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Matrix
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.util.Half
import androidx.annotation.RequiresApi
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ShaderBrush
import java.nio.ShortBuffer

enum class GrainMode { None, Tile, Shader }

/**
 * The web's feTurbulence parameters for each grain, keyed by tile name
 * (scripts/native/grain-tiles.ts renders the tiles from the same values).
 */
data class GrainSpec(val frequency: Float, val octaves: Int, val seed: Int, val shaderMode: Float = 0f) {
    companion object {
        fun named(tile: String) = when (tile) {
            "grain-button" -> GrainSpec(1.1f, 2, 3)
            "grain-overlay" -> GrainSpec(0.72f, 4, 0, shaderMode = 1f)
            else -> GrainSpec(0.85f, 2, 3)
        }
    }
}

/**
 * Grain as a Brush, drawn by filling the shape's outline with it — the fill
 * *is* the clip, so no clipPath or offscreen layer is needed.
 *  • Tile: the pre-rendered spec-exact tile as a repeating BitmapShader.
 *  • Shader: the same noise computed per pixel in AGSL (API 33+).
 */
object Grain {
    private lateinit var appContext: Context
    private val tiles = HashMap<String, Bitmap>()

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private fun tile(name: String): Bitmap = tiles.getOrPut(name) {
        appContext.assets.open("grain/$name@3x.png").use { BitmapFactory.decodeStream(it) }
    }

    fun brush(mode: GrainMode, tile: String, size: Size, density: Float, opacity: Float): Brush? = when (mode) {
        GrainMode.None -> null
        GrainMode.Tile -> {
            // Tiles are 128 dp rendered at 3×; scale them to this screen's density.
            val shader = BitmapShader(tile(tile), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
            shader.setLocalMatrix(Matrix().apply { setScale(density / 3f, density / 3f) })
            ShaderBrush(shader)
        }
        GrainMode.Shader ->
            if (Build.VERSION.SDK_INT >= 33) ShaderBrush(GrainShader.create(GrainSpec.named(tile), size, density, opacity)) else null
    }
}

@RequiresApi(33)
object GrainShader {
    /**
     * SVG feTurbulence (fractalNoise, stitchTiles), the AGSL twin of
     * native/ios/Sources/Design/Grain.metal. AGSL follows GLSL ES 1.0 (no
     * integer bit ops), so lattice indices are exact small floats and `& 255`
     * is `mod(…, 256)`. The lattice arrives as a raw F16 buffer:
     * row 0 = selector, rows 1–4 = gradients (x, y) per channel.
     */
    private const val AGSL = """
        uniform shader lattice;
        uniform float2 size;     // region, dp
        uniform float density;
        uniform float frequency;
        uniform float octaves;
        uniform float opacity;
        uniform float mode;

        float sel(float i) { return float(lattice.eval(float2(i + 0.5, 0.5)).r); }
        float2 grad(float ch, float i) { return float2(lattice.eval(float2(i + 0.5, ch + 1.5)).rg); }

        float stitchFrequency(float f, float extent) {
            float lo = floor(extent * f) / extent;
            float hi = ceil(extent * f) / extent;
            if (lo <= 0.0) return hi;
            return (f / lo < hi / f) ? lo : hi;
        }

        float noise2(float ch, float2 v, float4 st) { // st = (width, height, wrapX, wrapY)
            float2 f = floor(v);
            float bx0 = f.x + 4096.0; float by0 = f.y + 4096.0;
            float bx1 = bx0 + 1.0; float by1 = by0 + 1.0;
            float rx0 = v.x - f.x; float ry0 = v.y - f.y;
            float rx1 = rx0 - 1.0; float ry1 = ry0 - 1.0;
            if (bx0 >= st.z) bx0 -= st.x;
            if (bx1 >= st.z) bx1 -= st.x;
            if (by0 >= st.w) by0 -= st.y;
            if (by1 >= st.w) by1 -= st.y;
            bx0 = mod(bx0, 256.0); bx1 = mod(bx1, 256.0);
            by0 = mod(by0, 256.0); by1 = mod(by1, 256.0);
            float i = sel(bx0); float j = sel(bx1);
            float b00 = sel(i + by0); float b10 = sel(j + by0);
            float b01 = sel(i + by1); float b11 = sel(j + by1);
            float sx = rx0 * rx0 * (3.0 - 2.0 * rx0);
            float sy = ry0 * ry0 * (3.0 - 2.0 * ry0);
            float2 q = grad(ch, b00); float u = rx0 * q.x + ry0 * q.y;
            q = grad(ch, b10); float w = rx1 * q.x + ry0 * q.y;
            float a = mix(u, w, sx);
            q = grad(ch, b01); u = rx0 * q.x + ry1 * q.y;
            q = grad(ch, b11); w = rx1 * q.x + ry1 * q.y;
            float b = mix(u, w, sx);
            return mix(a, b, sy);
        }

        float channel(float ch, float2 p, float2 freq, float4 st0) {
            float4 st = st0;
            float2 v = p * freq;
            float ratio = 1.0;
            float sum = 0.0;
            for (int o = 0; o < 4; o++) {
                if (float(o) >= octaves) break;
                sum += noise2(ch, v, st) / ratio;
                v *= 2.0;
                ratio *= 2.0;
                st.x *= 2.0; st.z = 2.0 * st.z - 4096.0;
                st.y *= 2.0; st.w = 2.0 * st.w - 4096.0;
            }
            return clamp((sum + 1.0) * 0.5, 0.0, 1.0);
        }

        float toSrgb(float c) {
            return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
        }

        half4 main(float2 fragCoord) {
            float2 p = fragCoord / density;
            float2 freq = float2(stitchFrequency(frequency, size.x), stitchFrequency(frequency, size.y));
            float4 st0 = float4(floor(size.x * freq.x + 0.5), floor(size.y * freq.y + 0.5), 0.0, 0.0);
            st0.z = 4096.0 + st0.x;
            st0.w = 4096.0 + st0.y;
            float r = channel(0.0, p, freq, st0);
            float g = channel(1.0, p, freq, st0);
            float b = channel(2.0, p, freq, st0);
            float lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            float gray; float a;
            if (mode < 0.5) { gray = toSrgb(lum); a = channel(3.0, p, freq, st0) * opacity; }
            else if (mode < 1.5) { gray = 0.0; a = (1.0 - lum) * opacity; }
            else if (mode < 2.5) { gray = toSrgb(lum); a = 1.0; }
            else { gray = channel(3.0, p, freq, st0); a = 1.0; }
            return half4(half(gray * a), half(gray * a), half(gray * a), half(a));
        }
    """

    private val lattices = HashMap<Int, BitmapShader>()

    /** Opacity is baked in (mode 0/1) so the brush is drawn at alpha 1. */
    fun create(spec: GrainSpec, size: Size, density: Float, opacity: Float, mode: Float = spec.shaderMode): RuntimeShader =
        RuntimeShader(AGSL).apply {
            setInputBuffer("lattice", lattice(spec.seed))
            setFloatUniform("size", size.width / density, size.height / density)
            setFloatUniform("density", density)
            setFloatUniform("frequency", spec.frequency)
            setFloatUniform("octaves", spec.octaves.toFloat())
            setFloatUniform("opacity", opacity)
            setFloatUniform("mode", mode)
        }

    private fun lattice(seed: Int): BitmapShader = lattices.getOrPut(seed) {
        val t = TurbulenceLattice(seed)
        val w = TurbulenceLattice.N
        val halves = ShortArray(w * 5 * 4)
        fun put(x: Int, y: Int, r: Float, g: Float) {
            val o = (y * w + x) * 4
            halves[o] = Half.toHalf(r)
            halves[o + 1] = Half.toHalf(g)
            halves[o + 2] = Half.toHalf(0f)
            halves[o + 3] = Half.toHalf(1f)
        }
        for (i in 0 until w) {
            put(i, 0, t.selector[i].toFloat(), 0f)
            for (k in 0 until 4) put(i, k + 1, t.gradient[k][i * 2].toFloat(), t.gradient[k][i * 2 + 1].toFloat())
        }
        val bmp = Bitmap.createBitmap(w, 5, Bitmap.Config.RGBA_F16)
        bmp.copyPixelsFromBuffer(ShortBuffer.wrap(halves))
        BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
            filterMode = BitmapShader.FILTER_MODE_NEAREST
        }
    }
}

/** feTurbulence's lattice (SVG 1.1 §15.25 reference `init`). */
class TurbulenceLattice(seedIn: Int) {
    companion object {
        const val B = 0x100
        const val N = B + B + 2
    }

    val selector = IntArray(N)
    val gradient = Array(4) { DoubleArray(N * 2) }

    init {
        val m = 2147483647L
        fun random(s: Long): Long {
            var r = 16807L * (s % 127773L) - 2836L * (s / 127773L)
            if (r <= 0) r += m
            return r
        }
        var s = seedIn.toLong()
        if (s <= 0) s = -(s % (m - 1)) + 1
        if (s > m - 1) s = m - 1
        for (k in 0 until 4) {
            for (i in 0 until B) {
                selector[i] = i
                for (j in 0 until 2) {
                    s = random(s)
                    gradient[k][i * 2 + j] = ((s % (B + B)) - B).toDouble() / B
                }
                val gx = gradient[k][i * 2]
                val gy = gradient[k][i * 2 + 1]
                val len = Math.sqrt(gx * gx + gy * gy)
                gradient[k][i * 2] = gx / len
                gradient[k][i * 2 + 1] = gy / len
            }
        }
        var i = B - 1
        while (i > 0) {
            val k = selector[i]
            s = random(s)
            val j = (s % B).toInt()
            selector[i] = selector[j]
            selector[j] = k
            i--
        }
        for (x in 0 until B + 2) {
            selector[B + x] = selector[x]
            for (k in 0 until 4) {
                gradient[k][(B + x) * 2] = gradient[k][x * 2]
                gradient[k][(B + x) * 2 + 1] = gradient[k][x * 2 + 1]
            }
        }
    }
}
