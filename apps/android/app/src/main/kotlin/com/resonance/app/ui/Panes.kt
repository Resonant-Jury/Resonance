package com.resonance.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.scene.Scene
import androidx.navigation3.scene.SceneStrategy
import androidx.navigation3.scene.SceneStrategyScope
import com.resonance.app.Session
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.layout
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.LocalBarBackHidden
import com.resonance.design.LocalHeaderChrome
import com.resonance.design.LocalInlineBarHeight
import com.resonance.design.TopBarRow
import com.resonance.design.PaneBarRow
import com.resonance.design.OrganicEmptyState
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.toPath
import com.resonance.geometry.wavyVertical
import com.resonance.kit.l10n.L10n
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The conversations drawn as the list beside the thread pane: their list keeps to this width at
 * the window's start, while their bar is the window's header across the whole width.
 */
internal val LocalListPane = staticCompositionLocalOf<Dp?> { null }

/** The conversations are drawn beside a thread pane: a row picks the thread in place of the one shown. */
internal val LocalTwoPane = staticCompositionLocalOf { false }

/** The thread the pane beside the conversations shows (its row wears the chosen wash). */
internal val LocalSelectedThread = staticCompositionLocalOf<Route.Thread?> { null }

/** What a stack entry's metadata says about it: its route and its place on its stack. */
internal const val ROUTE_METADATA = "resonance.route"
internal const val INDEX_METADATA = "resonance.index"

internal val NavEntry<Route>.route: Route? get() = metadata[ROUTE_METADATA] as? Route
private val NavEntry<Route>.index: Int get() = metadata[INDEX_METADATA] as? Int ?: -1

/**
 * Whether the Messages stack is drawn as the conversations beside a thread pane on an expanded
 * window (design note §9): its root and whatever is pushed above it — a thread, a profile —
 * unless a card's page, the writer or the map is among them, which take the whole content area
 * (the owner's "a card opened from a thread takes the whole window").
 */
internal fun drawsAsPanes(routes: List<Route>): Boolean =
    routes.firstOrNull() == Route.Root(Tab.Messages) &&
        routes.drop(1).none { it is Route.Card || it is Route.Write || it == Route.ThoughtMap }

/**
 * The page a pane's choice puts in place (design note §9): a thread chosen from the
 * conversations replaces whatever the detail pane showed, rather than stacking over it.
 */
internal fun MutableList<Route>.chooseInPane(route: Route.Thread) {
    popToRoot()
    add(route)
}

/** The Messages stack's two panes on an expanded window; anything else is left to the single pane. */
internal class MessagesPanesStrategy(private val expanded: Boolean, private val session: Session) : SceneStrategy<Route> {
    override fun SceneStrategyScope<Route>.calculateScene(entries: List<NavEntry<Route>>): Scene<Route>? {
        if (!expanded || !drawsAsPanes(entries.mapNotNull { it.route })) return null
        return MessagesPanesScene(entries, session)
    }
}

/**
 * The conversations and the detail pane. One key whatever the detail shows, so choosing another
 * thread changes the pane in place (a short cross-fade) instead of moving the window. Back pops
 * what is pushed above the pane's thread, never the thread itself.
 */
private class MessagesPanesScene(override val entries: List<NavEntry<Route>>, private val session: Session) : Scene<Route> {
    override val key: Any get() = "messages-panes"
    override val previousEntries: List<NavEntry<Route>> = if (entries.size > 2) entries.dropLast(1) else emptyList()
    override val content: @Composable () -> Unit = { MessagesPanes(entries, session) }

    override fun equals(other: Any?) = other is MessagesPanesScene && other.entries == entries
    override fun hashCode() = entries.hashCode()
}

/**
 * Under the window's header — the Messages root's bar across the whole width, its tabs and pen
 * over it (design note B2) — the list (300), 12, the wavy rule, 12, and the detail. The list
 * scrolls under the header; the detail starts under the header's wave, its thread keeping a bar
 * of its own (no way back) whose messages scroll under it. The rule is drawn last, so it reads
 * unbroken over the thread's bar.
 */
@Composable
private fun MessagesPanes(entries: List<NavEntry<Route>>, session: Session) {
    val chosen = entries.getOrNull(1)?.route as? Route.Thread
    val detail = entries.drop(1).lastOrNull()
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    // The Messages root's bar is the header's row (an expanded window always has the header's tabs).
    val header = TopBarRow + HeaderEdgeHeight
    val listWidth = Tokens.MsgListW.dp
    Box(Modifier.fillMaxSize().cream()) {
        CompositionLocalProvider(LocalTwoPane provides true, LocalSelectedThread provides chosen, LocalListPane provides listWidth) { entries[0].Content() }
        // The detail starts under the header's paper. Its pages still lay themselves out under a status
        // bar (their bars pad for it): that much of them is drawn above the pane's top, and clipped.
        Box(
            Modifier
                .fillMaxSize()
                .padding(start = listWidth + PaneGap * 2, top = status + header)
                .clipToBounds()
                .layout { measurable, constraints ->
                    val lift = status.roundToPx()
                    val placeable = measurable.measure(constraints.copy(minHeight = constraints.minHeight + lift, maxHeight = constraints.maxHeight + lift))
                    layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(0, -lift) }
                },
        ) {
            // A pane's bar is a phone's bar (nothing of the header's to keep clear of), a row smaller than the header's.
            CompositionLocalProvider(LocalHeaderChrome provides null, LocalInlineBarHeight provides PaneBarRow, LocalTwoPane provides true) {
                AnimatedContent(
                    detail,
                    contentKey = { it?.contentKey },
                    transitionSpec = { fadeIn(tween(PANE_FADE_MILLIS)) togetherWith fadeOut(tween(PANE_FADE_MILLIS)) },
                    label = "detailPane",
                ) { entry ->
                    if (entry == null) EmptyDetail(session)
                    else CompositionLocalProvider(LocalBarBackHidden provides (entry.index == 1)) { entry.Content() }
                }
            }
        }
        PaneRule(Modifier.padding(start = listWidth, top = status + header + PaneGap).width(PaneGap * 2).fillMaxHeight())
    }
}

/** The pane with nothing chosen: the empty state in its middle — pick a conversation, or none yet. */
@Composable
private fun EmptyDetail(session: Session) {
    val state by session.conversations.state.collectAsStateWithLifecycle()
    val none = state.loaded && state.conversations.isEmpty() && state.starters.isEmpty()
    Box(Modifier.fillMaxSize().cream().padding(top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding())) {
        if (none) OrganicEmptyState(L10n.Messages.empty, title = L10n.Messages.emptyTitle, icon = IconName.Chat, seed = 23.0, fill = true)
        else if (state.loaded) OrganicEmptyState(L10n.Messages.pickOne, icon = IconName.Chat, seed = 23.0, fill = true)
    }
}

/**
 * The web's rule between the conversations and the thread (MessagesPage `vRule`): a wavy pen
 * line down the gap from 12 under the header, seed 71, a turn every 34, in the fields' border ink
 * at 35 %. Decoration only.
 */
@Composable
private fun PaneRule(modifier: Modifier) {
    Box(
        modifier.clearAndSetSemantics { }.drawWithCache {
            val h = size.height / density
            val path = wavyVertical(h.toDouble(), 71.0, 2.0, max(2, (h / 34).roundToInt())).toPath(density, size.width / 2, 0f)
            val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round)
            onDrawBehind { drawPath(path, Tokens.FieldBorderHover.copy(alpha = 0.35f), style = pen) }
        },
    )
}

/** Either side of the rule. */
private val PaneGap: Dp = 12.dp

/** Choosing another conversation: the detail pane's cross-fade. */
private const val PANE_FADE_MILLIS = 160
