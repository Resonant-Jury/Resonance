package com.resonance.design

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens

/**
 * How wide the window is, in the web's breakpoints (design note §8): compact below 600, medium to
 * 899, expanded from 900. Decided by the width the window has, never by the device: a tablet in a
 * narrow split is compact, an unfolded phone may be medium.
 */
enum class LayoutClass {
    Compact, Medium, Expanded;

    /** The tabs in the middle of a full-width header (design note B2) instead of the bottom tab bar. */
    val topTabs: Boolean get() = this != Compact

    /** The header's tabs carry their labels (an expanded window, unless they don't fit: [TopTabsFit]); else glyphs alone. */
    val tabLabels: Boolean get() = this == Expanded

    companion object {
        fun of(width: Float): LayoutClass = when {
            width < Tokens.BpMedium -> Compact
            width < Tokens.BpExpanded -> Medium
            else -> Expanded
        }

        /** The writer and the thought map side by side (the web's ≥ 1200 split). */
        fun writerSplit(width: Float): Boolean = width >= Tokens.BpWide

        /** The web's `--page-pad-x`: clamp(width × 0.04, 20, 48), from the window's width. */
        fun pad(width: Float): Float = (width * 0.04f).coerceIn(20f, 48f)

        /** Bordered feed columns: 2 or 3 on an expanded window (3 from a 960 content width), else the bands' one. */
        fun feedColumns(cls: LayoutClass, contentWidth: Float): Int =
            if (cls == Expanded) (if (contentWidth >= Tokens.FeedThreeColMin) 3 else 2) else 1

        /** The widest a chat row may be in a list this wide: 72 % of it inside its 16 margins, at most 520. */
        fun bubbleMax(listWidth: Float): Float = minOf((listWidth - 32f) * 0.72f, Tokens.BubbleMax)

        /** The side inset that puts a column at most [measure] wide in the middle of [width], never under [pad]. */
        fun columnInset(width: Float, pad: Float, measure: Float = Tokens.Measure): Float = maxOf(pad, (width - measure) / 2f)
    }
}

/**
 * The window as the app's root measured it (MainTabs), handed down to every screen: its width and
 * its class. Pane widths (a thread beside the conversations, the writer beside the map) are
 * measured where they are used.
 */
@Immutable
data class WindowLayout(val width: Dp) {
    val cls: LayoutClass get() = LayoutClass.of(width.value)
    /** The tabs in the header (medium and expanded), not the bottom bar. */
    val topTabs: Boolean get() = cls.topTabs
    val pad: Dp get() = LayoutClass.pad(width.value).dp
    /** What the pages have: the whole window (the header carries the tabs; nothing stands beside the pages). */
    val contentWidth: Dp get() = width
    val writerSplit: Boolean get() = LayoutClass.writerSplit(width.value)

    /** The feed's bordered grid: its columns, and its box — at most 1200 wide with [pad] on each side, centred. */
    val gridWidth: Dp get() = minOf(contentWidth, GridMax) - pad * 2
    val feedColumns: Int get() = LayoutClass.feedColumns(cls, gridWidth.value)

    /** A band's content inset: a phone's 38, else the reading column's (the paper still edge to edge). */
    val bandInset: Dp get() = if (cls == LayoutClass.Compact) BandInset else columnInset()

    /** The side inset of a centred reading column ([Tokens.Measure]) in the content area. */
    fun columnInset(measure: Dp = Tokens.Measure.dp, width: Dp = contentWidth): Dp =
        if (cls == LayoutClass.Compact) 0.dp else LayoutClass.columnInset(width.value, pad.value, measure.value).dp

    /**
     * The card page's columns (design note §11), from the content area's start: on an expanded
     * window the article (at most 720) and, 48 past it, the author's rail ([Tokens.CardRailW]) at
     * the end of a centred box at most 1200 wide with the pad on each side; otherwise one column
     * at most 760, centred (a phone keeps its 20 margins).
     */
    fun cardPage(): CardPageColumns {
        val w = contentWidth
        return when (cls) {
            LayoutClass.Compact -> CardPageColumns(20.dp, 20.dp, null)
            LayoutClass.Medium -> LayoutClass.columnInset(w.value, pad.value, CardColumnMax.value).dp.let { CardPageColumns(it, it, null) }
            LayoutClass.Expanded -> {
                val box = minOf(w, GridMax)
                val start = (w - box) / 2 + pad
                val inner = box - pad * 2
                val rail = Tokens.CardRailW.dp
                val article = minOf(CardArticleMax, inner - rail - CardRailGap)
                CardPageColumns(start, w - start - article, start + inner - rail)
            }
        }
    }

    companion object {
        /** The card page's single column, and its article beside the rail. */
        val CardColumnMax = 760.dp
        val CardArticleMax = 720.dp
        val CardRailGap = 48.dp

        /** The web's `--page-max-w-wide`: the widest a page's content runs. */
        val GridMax = 1200.dp
        /** A phone's window, for previews and tests that draw a screen without the root. */
        val Phone = WindowLayout(390.dp)
    }
}

/** Where the card page's article sits ([start] and [end] in from the content area's edges) and, when it has one, its rail. */
@Immutable
data class CardPageColumns(val start: Dp, val end: Dp, val railStart: Dp?)

/** The window as MainTabs measured it; a phone's until then. */
val LocalWindowLayout = staticCompositionLocalOf { WindowLayout.Phone }

/**
 * How a list of story cards is drawn at this width (design note §10): one column of bands, their
 * content [inset] from the edges (38 on a phone, the reading column's inset on a medium window),
 * or on an expanded window the bordered cards in [columns] columns inside a box [gridInset] from
 * each side (at most 1200 with the page's pad, centred).
 */
@Immutable
data class CardListLayout(val columns: Int = 1, val inset: Dp = BandInset, val gridInset: Dp = 0.dp) {
    val isGrid: Boolean get() = columns > 1

    /** Where what heads the list (a profile's row, the shelves' strip) starts: the page's 20 on a phone, else the cards' own edge. */
    val headerInset: Dp get() = when {
        isGrid -> gridInset
        inset != BandInset -> inset
        else -> 20.dp
    }

    companion object {
        val Phone = CardListLayout()

        fun of(window: WindowLayout): CardListLayout = when (window.cls) {
            LayoutClass.Compact -> Phone
            LayoutClass.Medium -> CardListLayout(inset = window.bandInset)
            LayoutClass.Expanded -> CardListLayout(
                columns = window.feedColumns,
                gridInset = (window.contentWidth - minOf(window.contentWidth, WindowLayout.GridMax)) / 2 + window.pad,
            )
        }
    }
}

/** The card lists' layout for the window MainTabs measured. */
@androidx.compose.runtime.Composable
fun cardListLayout(): CardListLayout = CardListLayout.of(LocalWindowLayout.current)

/** Rows of a bordered grid kept in one block of the lazy list (the columns level up between blocks). */
const val GridBlockRows = 3

/**
 * A reading column on a medium or expanded window: what this modifies keeps to [measure] in the
 * middle of the width it has (a phone's pages, and a pane already narrower, are left as they are).
 */
@androidx.compose.runtime.Composable
fun Modifier.readableColumn(measure: Dp = Tokens.Measure.dp): Modifier =
    if (LocalWindowLayout.current.cls == LayoutClass.Compact) this
    else fillMaxWidth().wrapContentWidth(Alignment.CenterHorizontally).widthIn(max = measure)
