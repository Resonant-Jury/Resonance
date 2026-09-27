package com.resonance.spikes.design

import android.content.Context
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily as PlatformFontFamily
import android.graphics.fonts.FontStyle
import android.graphics.Typeface as PlatformTypeface
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.Typeface
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.resonance.spikes.generated.Tokens

/**
 * The web's type stack on Android.
 *
 * CSS `font-family: 'Playfair Display', 'Noto Serif TC', serif` falls back
 * per glyph. Android's Typeface.CustomFallbackBuilder (API 29) builds exactly
 * that chain: Latin from the bundled font, CJK from the next family, then the
 * system. Android already ships Noto Sans/Serif CJK, so bundling Noto TC is
 * optional — S5 measures both.
 */
object AppFonts {
    enum class Family(val asset: String, val cjkAsset: String, val systemFallback: String) {
        Heading("PlayfairDisplay.ttf", "NotoSerifTC.ttf", "serif"),
        Body("DMSans.ttf", "NotoSansTC.ttf", "sans-serif"),
        Handwritten("ChenYuluoyanThin.ttf", "NotoSerifTC.ttf", "serif"),
    }

    private lateinit var context: Context
    private val cache = HashMap<String, FontFamily>()
    var registrationMs = 0.0
        private set
    /** When false, CJK falls back to the system's Noto CJK instead of the bundled Noto TC. */
    var useBundledCJK = true
        set(value) {
            field = value
            cache.clear()
        }

    fun init(ctx: Context) {
        context = ctx.applicationContext
        val start = System.nanoTime()
        family(Family.Heading, 700)
        family(Family.Body, 400)
        registrationMs = (System.nanoTime() - start) / 1e6
    }

    // Font files are memory-mapped into direct buffers (Noto TC is 12–17 MB),
    // so each (file, weight) instance and each fallback chain is built once.
    private val fonts = HashMap<String, Font>()
    private val typefaces = HashMap<String, PlatformTypeface>()

    /** Variable fonts get their weight instance; static ones (the handwriting face) must not
     *  receive a variation setting — Android then draws every glyph with zero advance. */
    private val variable = setOf("PlayfairDisplay.ttf", "DMSans.ttf", "NotoSansTC.ttf", "NotoSerifTC.ttf")

    private fun font(asset: String, weight: Int): Font = fonts.getOrPut("$asset|$weight") {
        Font.Builder(context.assets, asset)
            .setWeight(weight)
            .apply { if (asset in variable) setFontVariationSettings("'wght' $weight") }
            .build()
    }

    fun typeface(family: Family, weight: Int): PlatformTypeface = typefaces.getOrPut("${family.name}|$weight|$useBundledCJK") {
        val primary = PlatformFontFamily.Builder(font(family.asset, weight)).build()
        val builder = PlatformTypeface.CustomFallbackBuilder(primary)
            .setStyle(FontStyle(weight, FontStyle.FONT_SLANT_UPRIGHT))
            .setSystemFallback(family.systemFallback)
        if (useBundledCJK) {
            builder.addCustomFallback(PlatformFontFamily.Builder(font(family.cjkAsset, weight)).build())
        }
        builder.build()
    }

    /** One FontFamily per (family, weight) so the variable fonts are instanced, not synthesised. */
    fun family(family: Family, weight: Int = 400): FontFamily =
        cache.getOrPut("${family.name}|$weight|$useBundledCJK") { FontFamily(Typeface(typeface(family, weight))) }

    /**
     * CSS-equivalent text style: `line-height` split evenly above and below
     * (LineHeightStyle Center, no trim), no legacy font padding, and greedy
     * line breaking like browsers (Compose defaults to balanced "Paragraph").
     */
    fun style(family: Family, size: Float, weight: Int = 400, lineHeight: Float = 1.5f, color: androidx.compose.ui.graphics.Color = Tokens.Text, letterSpacing: TextUnit = TextUnit.Unspecified) =
        TextStyle(
            fontFamily = family(family, weight),
            fontSize = size.sp,
            lineHeight = lineHeight.em,
            color = color,
            letterSpacing = letterSpacing,
            lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None, LineHeightStyle.Mode.Fixed),
            platformStyle = PlatformTextStyle(includeFontPadding = false),
            lineBreak = LineBreak.Simple,
        )

    fun heading(size: Float, weight: Int = 700, lineHeight: Float = 1.25f) = style(Family.Heading, size, weight, lineHeight)
    fun body(size: Float, weight: Int = 400, lineHeight: Float = 1.6f, color: androidx.compose.ui.graphics.Color = Tokens.Text) =
        style(Family.Body, size, weight, lineHeight, color)
}
