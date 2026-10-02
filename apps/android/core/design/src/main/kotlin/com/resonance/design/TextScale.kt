package com.resonance.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp

/** The most the app ever enlarges its text, however large the system setting. */
const val MAX_TEXT_SCALE = 1.25f

/**
 * How much of the system's text size setting the app follows.
 *
 * A Pixel offers 1.5× and beyond; taken whole, it grows every tab, chip and
 * button until the interface is hard to use, and the apps people compare us
 * to (Instagram, LINE) do not follow it that far. Up to 1.0 the setting is
 * followed as it is (smaller text stays smaller). Above it, the app follows
 * half of the extra, capped at [MAX_TEXT_SCALE]: 1.15 → 1.075, 1.3 → 1.15,
 * 1.5 → 1.25, and 1.25 for anything larger.
 *
 * iOS applies the same curve to Dynamic Type, so a person with a large
 * setting reads the same proportions on either phone.
 */
fun textScale(systemScale: Float): Float =
    if (systemScale <= 1f) systemScale else minOf(1f + (systemScale - 1f) / 2f, MAX_TEXT_SCALE)

/**
 * Everything below reads [textScale] of the system's setting wherever it sizes
 * text: Compose's `sp`, the CSS-line-box text ([CssText], the story) through
 * [cssFontPx], and the editor's WebView. Put it once, at the root, and again
 * inside every dialog and popup: each of those is a window of its own whose
 * density starts over from the system's whole scale, so the root's does not
 * reach it. It starts from the setting itself, not from the density in force,
 * so it lands on the same scale however many times it is put.
 */
@Composable
fun CappedTextScale(content: @Composable () -> Unit) {
    val d = LocalDensity.current
    val system = LocalConfiguration.current.fontScale
    val scaled = remember(d.density, system) { Density(d.density, textScale(system)) }
    CompositionLocalProvider(LocalDensity provides scaled, content = content)
}

/**
 * A CSS font size (the web's px, which these screens count in `sp`) in device
 * pixels with the text scale in force: what a Compose `Text` of that many `sp`
 * is drawn at — including the platform's non-linear curve, which keeps large
 * sizes from growing as fast as small ones — so words in our own line boxes
 * grow exactly as much as the rest.
 */
fun Density.cssFontPx(sizeSp: Float): Float = sizeSp.sp.toPx()
