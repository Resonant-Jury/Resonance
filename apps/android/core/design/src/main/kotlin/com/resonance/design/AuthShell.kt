package com.resonance.design

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.penWave
import com.resonance.geometry.pointsToBezier
import com.resonance.geometry.wavyPoints
import kotlin.math.max
import kotlin.math.roundToInt

// The auth pages on a phone (the web's (auth) layout at ≤640px, "anchored"):
// cream paper edge to edge, the brand on a cover that takes what the sheet
// leaves, and the sheet — as tall as its content — tucked at the bottom on a
// wavy top edge, running under the gesture bar.

/** The hero's headline under the wordmark (hero.headlinePrefix / Accent / Suffix), the accent inked and underlined. */
data class BrandTagline(val prefix: String, val accent: String, val suffix: String)

/**
 * The auth pages' shell. With a [tagline] it is the sign-in's: the brand 70%
 * of the way down the room the sheet leaves (spacers 7 : 3, at least 24 / 28)
 * — the tall lockup, folding to one row when that room is short, then
 * dropping the tagline; only after that does the page scroll, the sheet still
 * last. Without one it is the pen-name step's: the one-row lockup 16 under the
 * status bar, and the sheet takes at least the rest of the height, its content
 * from the top. The keyboard shortens the page (a field stays in view).
 */
@Composable
fun AuthShell(tagline: BrandTagline? = null, content: @Composable ColumnScope.() -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().cream().imePadding()) {
        val viewport = constraints.maxHeight
        // The web's clamp(20px, 6.4vw, 28px).
        val gutter = (maxWidth * 0.064f).coerceIn(20.dp, 28.dp)
        val statusBars = WindowInsets.statusBars
        val sheet: @Composable () -> Unit = { AuthSheet(gutter, content) }
        val scroll = Modifier.verticalScroll(rememberScrollState())
        if (tagline != null) AnchoredPage(viewport, statusBars, tagline, scroll, sheet)
        else PinnedPage(viewport, statusBars, scroll, sheet)
    }
}

private enum class Lockup { Tall, Compact, Bare }

/** How much room past a lockup the cover needs to keep it; short of the spacers' 24 + 28 the page scrolls. */
private val TallAir = 96.dp
private val CompactAir = 64.dp
private val MinAbove = 24.dp
private val MinBelow = 28.dp

/**
 * The sign-in's page: the sheet is measured first, and the cover takes what
 * it leaves. Each lockup is only composed when the one before it did not fit
 * (and only the one chosen is placed).
 */
@Composable
private fun AnchoredPage(viewport: Int, statusBars: WindowInsets, tagline: BrandTagline, modifier: Modifier, sheet: @Composable () -> Unit) {
    val tall: @Composable () -> Unit = { BrandLockup(Lockup.Tall, tagline) }
    val compact: @Composable () -> Unit = { BrandLockup(Lockup.Compact, tagline) }
    val bare: @Composable () -> Unit = { BrandLockup(Lockup.Bare, tagline) }
    SubcomposeLayout(modifier) { c ->
        val width = c.maxWidth
        val top = statusBars.getTop(this)
        val sheetBox = subcompose("sheet", sheet).first().measure(Constraints(minWidth = width, maxWidth = width))
        val room = viewport - top - sheetBox.height
        // The cover's 24 at either side.
        val inner = Constraints(maxWidth = (width - 48.dp.roundToPx()).coerceAtLeast(0))
        var brand = subcompose(Lockup.Tall, tall).first().measure(inner)
        if (room < brand.height + TallAir.roundToPx()) brand = subcompose(Lockup.Compact, compact).first().measure(inner)
        if (room < brand.height + CompactAir.roundToPx()) brand = subcompose(Lockup.Bare, bare).first().measure(inner)
        // The free height splits 7 : 3 above and below the brand; a spacer under its minimum keeps it, and the
        // other takes the rest. Too little for both minimums and the page grows past the screen and scrolls.
        val free = room - brand.height
        val below = (free * 0.3f).roundToInt().coerceAtLeast(MinBelow.roundToPx())
        val above = (free - below).coerceAtLeast(MinAbove.roundToPx())
        val height = max(top + above + brand.height + below + sheetBox.height, viewport)
        layout(width, height) {
            brand.place((width - brand.width) / 2, top + above)
            sheetBox.place(0, height - sheetBox.height)
        }
    }
}

/** The pen-name step's page: the one-row lockup (no tagline, no blob), then the sheet down to the bottom at least. */
@Composable
private fun PinnedPage(viewport: Int, statusBars: WindowInsets, modifier: Modifier, sheet: @Composable () -> Unit) {
    Layout(
        content = {
            // 20 above the sheet's wave, which lies 7 into the sheet.
            BrandLockup(Lockup.Bare, tagline = null, blob = false, modifier = Modifier.padding(top = 16.dp, bottom = 20.dp - SheetWaveY))
            sheet()
        },
        modifier = modifier,
    ) { measurables, c ->
        val width = c.maxWidth
        val top = statusBars.getTop(this)
        val brand = measurables[0].measure(Constraints(maxWidth = width))
        val cover = top + brand.height
        val sheetBox = measurables[1].measure(Constraints(minWidth = width, maxWidth = width, minHeight = (viewport - cover).coerceAtLeast(0)))
        layout(width, cover + sheetBox.height) {
            brand.place((width - brand.width) / 2, top)
            sheetBox.place(0, cover)
        }
    }
}

/**
 * The sheet: full width on the auth interior ([sheetEdge]), 40 above its
 * content, the gutter at its sides, and the gesture bar's inset + 20 below.
 */
@Composable
private fun AuthSheet(gutter: Dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .sheetEdge()
            .navigationBarsPadding()
            .padding(start = gutter, end = gutter, top = 40.dp, bottom = 20.dp),
        content = content,
    )
}

/**
 * The brand, centred. Tall: ResonanceIcon (the wave glyph, 60, nudged down
 * 7%), 6 under it the wordmark (Playfair 34/700), 14 under that the tagline
 * at 19, on a soft blob behind the mark. Compact: the mark 40 beside the
 * wordmark 28, the tagline 8 under them at 17, a smaller blob. Bare: compact
 * without the tagline.
 */
@Composable
private fun BrandLockup(mode: Lockup, tagline: BrandTagline?, modifier: Modifier = Modifier, blob: Boolean = true) {
    val tall = mode == Lockup.Tall
    val ground = when {
        !blob -> Modifier
        tall -> Modifier.organiBlob(176.dp, dx = (-24).dp, y = 34.dp)
        else -> Modifier.organiBlob(120.dp, dx = (-40).dp, y = 22.dp)
    }
    Column(modifier.then(ground), horizontalAlignment = Alignment.CenterHorizontally) {
        if (tall) {
            BrandMark(60.dp)
            Spacer(Modifier.height(6.dp))
            Wordmark(34.dp)
        } else Row(verticalAlignment = Alignment.CenterVertically) {
            BrandMark(40.dp)
            Spacer(Modifier.width(10.dp))
            Wordmark(28.dp)
        }
        if (tagline != null && mode != Lockup.Bare) {
            Spacer(Modifier.height(if (tall) 14.dp else 8.dp))
            Tagline(tagline, if (tall) 19f else 17f)
        }
    }
}

/** ResonanceIcon: the wave glyph in terracotta at the pen's INK, nudged down 7% to sit level with the wordmark's mass. */
@Composable
private fun BrandMark(size: Dp) {
    OrganicIcon(IconName.Wave, Modifier.offset(y = size * 0.07f), size = size, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value)
}

/** "Resonance" in Playfair 700 at −0.02em. A logo: its size is fixed in dp, whatever the reader's text size. */
@Composable
private fun Wordmark(size: Dp) {
    val sp = with(LocalDensity.current) { size.toSp() }
    BasicText("Resonance", style = AppFonts.heading(sp.value, 700, lineHeight = 1.15f).copy(letterSpacing = (-0.02).em))
}

/**
 * The hero's headline as the lockup's tagline: Playfair 500 at [fontSize], line
 * height 1.45, muted and centred (balanced lines), the accent word in
 * terracotta on a pen-wave underline (OrganicLink's stroke: penWave at the
 * word's width, a crest every ~5, 1.7 high, INK at 0.9, 0.2em under the
 * baseline; a part on each line, should the word ever break).
 */
@Composable
private fun Tagline(tagline: BrandTagline, fontSize: Float) {
    val start = tagline.prefix.length
    val end = start + tagline.accent.length
    val text = remember(tagline.prefix, tagline.accent, tagline.suffix) {
        buildAnnotatedString {
            append(tagline.prefix)
            withStyle(SpanStyle(color = Tokens.Terracotta)) { append(tagline.accent) }
            append(tagline.suffix)
        }
    }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val style = AppFonts.style(AppFonts.Family.Heading, fontSize, 500, lineHeight = 1.45f, color = Tokens.TextMuted)
        .copy(textAlign = TextAlign.Center, lineBreak = LineBreak.Heading)
    BasicText(
        text,
        Modifier.drawWithCache {
            val l = layout
            val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val strokes = if (l == null || end <= start || end > l.layoutInput.text.length) emptyList() else
                (l.getLineForOffset(start)..l.getLineForOffset(end - 1)).mapNotNull { line ->
                    val a = max(start, l.getLineStart(line))
                    val b = minOf(end, l.getLineEnd(line, visibleEnd = true))
                    if (b <= a) return@mapNotNull null
                    val left = l.getBoundingBox(a).left
                    val right = l.getBoundingBox(b - 1).right
                    val wave = penWave(((right - left) / density).toDouble(), 7.0, amp = 1.7, half = 5.0).toPath(density)
                    Triple(left, l.getLineBaseline(line) + fontSize.sp.toPx() * 0.2f, wave)
                }
            onDrawBehind {
                strokes.forEach { (x, y, wave) -> translate(x, y) { drawPath(wave, Tokens.Terracotta, alpha = 0.9f, style = pen) } }
            }
        },
        style = style,
        onTextLayout = { layout = it },
    )
}

/** OrganiBlob.tsx's first shape, in its −90…90 box. */
private const val BlobShape = "M54,-65.2C68.7,-54.3,78.2,-36.8,80.1,-18.8C82,-.9,76.2,17.6,66.5,32.5C56.8,47.4,43.2,58.8,27.3,65.8" +
    "C11.4,72.8,-6.7,75.4,-23.1,70.2C-39.5,65,-54.2,52,-63.5,36C-72.8,20,-76.7,1,-73.5,-16.4C-70.3,-33.8,-60,-49.6,-46.4,-60.8" +
    "C-32.8,-72,-16.4,-78.5,1.6,-80.5C19.6,-82.5,39.2,-76.1,54,-65.2Z"

/**
 * The web's OrganiBlob (its first shape) behind this box, taking no room:
 * terracotta-light at 0.26 with the blob's grain, [across] wide, turned −18°
 * and widened 18%, its centre [dx] from the box's middle and [y] under its top
 * — the soft ground behind the sign-in's mark.
 */
fun Modifier.organiBlob(across: Dp, dx: Dp, y: Dp): Modifier = drawWithCache {
    val k = across.toPx() / 180f
    val blob = PathParser().parsePathString(BlobShape).toPath().apply { transform(Matrix().apply { scale(k, k) }) }
    val grain = Grain.brush(GrainMode.Tile, "grain-card", size, density, 1f)
    val centre = Offset(size.width / 2 + dx.toPx(), y.toPx())
    onDrawBehind {
        withTransform({
            translate(centre.x, centre.y)
            rotate(-18f, pivot = Offset.Zero)
            scale(1.18f, 1f, pivot = Offset.Zero)
        }) {
            drawPath(blob, Tokens.TerracottaLight, alpha = 0.26f)
            // OrganiBlob's grain (0.4), under the blob's own 0.26.
            grain?.let { drawPath(blob, it, alpha = 0.26f * 0.4f) }
        }
    }
}

/** Where the sheet's wavy edge lies under the sheet's top: room for its 4.5 swing and half the pen. */
private val SheetWaveY = 7.dp

/**
 * The auth sheet's backdrop and top edge, [footerEdge]'s sibling: the auth
 * interior begins on one wavy line — wavyPoints across the width, amplitude
 * 4.5, a turn every ~68dp, seed 313 — stroked in the auth border at
 * INK_LIGHT, and runs to the bottom with no rule there. grainOverlay's grain
 * lies over the content, kept inside the wave.
 */
fun Modifier.sheetEdge(seed: Double = 313.0, grain: Float = 0.04f): Modifier = drawWithCache {
    val d = density
    val w = (size.width / d).toDouble()
    val steps = max(4, (w / 68).roundToInt())
    val line = pointsToBezier(wavyPoints(w, SheetWaveY.value.toDouble(), 4.5, seed, steps)).toPath(d)
    val fill = Path().apply {
        addPath(line)
        lineTo(size.width, size.height)
        lineTo(0f, size.height)
        close()
    }
    val brush = Grain.brush(GrainMode.Tile, "grain-overlay", size, d, 1f)
    val pen = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
    onDrawWithContent {
        drawPath(fill, Tokens.AuthInterior)
        drawContent()
        // As grainOverlay: black ink at 2× the opacity, so the mean darkening is `grain`.
        brush?.let { drawPath(fill, it, alpha = (grain * 2).coerceAtMost(1f)) }
        drawPath(line, Tokens.AuthBorder, style = pen)
    }
}
