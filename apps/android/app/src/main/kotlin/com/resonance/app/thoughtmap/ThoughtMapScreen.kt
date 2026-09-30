package com.resonance.app.thoughtmap

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.Session
import com.resonance.app.ui.Route
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIcon
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.WobRectShape
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.organicSurface
import com.resonance.design.plainClickable
import com.resonance.design.wavyLinePath
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * 思想地圖 (me/thought-map): my cards laid out on an endless dotted paper, filed
 * into regions and joined by arrows with words on them. The whole screen is the
 * map (no tab bar, no header); Leave, the toolbar and the zoom controls float
 * over it. The twin of iOS's ThoughtMapScreen.
 */
@Composable
fun ThoughtMapScreen(session: Session, store: ThoughtMapStore, open: (Route) -> Unit, leave: () -> Unit) {
    val uid = session.uid
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val currentOpen by rememberUpdatedState(open)
    val scope = rememberCoroutineScope()

    // A card of mine opens in the writer (a published one with its pending edit); a card I resonated with opens on its page.
    LaunchedEffect(uid) {
        store.onOpen = { card ->
            if (card.authorId == uid) currentOpen(Route.Write(cardId = card.id, showsCard = false)) else currentOpen(Route.Card(card.slug ?: card.id))
        }
        if (uid != null && !store.loaded) {
            store.seenChanges = changes
            store.load(uid)
        }
    }
    // Back from the writer: titles and tags may have changed.
    LaunchedEffect(changes) {
        if (store.loaded && store.seenChanges != changes) {
            store.seenChanges = changes
            store.refreshCards()
        }
    }

    // Leaving the map (or opening a card from it) while a title or arrow's words are being typed keeps them, as the web's blur does.
    DisposableEffect(store) { onDispose { store.commitEditors() } }

    Box(Modifier.fillMaxSize().background(Tokens.CardBg)) {
        MapGridLayer(store)
        MapUnderLayer(store)
        MapRegionChrome(store)
        MapNodesLayer(store)
        MapOverLayer(store)
        MapEdgeLabels(store)
        MapTouchSurface(store)
        MapEditors(store)
        Chrome(store, session, leave) { scope.launch { store.addGroup() } }
        if (store.trayOpen) MapTray(store)
    }
}

@Composable
private fun BoxScope.Chrome(store: ThoughtMapStore, session: Session, leave: () -> Unit, addGroup: () -> Unit) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 8.dp
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val scope = rememberCoroutineScope()

    // The controls float over the map's boxes and arrows, so none is framed in a pen line
    // that would tangle with theirs: the tools are paper, the one verb (add a card) solid.
    // Leave: the web's back control, arrow-right mirrored (icon only on a phone).
    OrganicButton(
        L10n.Me.ThoughtMap.leave,
        Modifier.align(Alignment.TopStart).padding(start = 20.dp, top = top),
        variant = ButtonVariant.Paper, icon = IconName.ArrowRight, small = true, iconOnly = true, iconSize = 15.dp, mirrorIcon = true, roomy = true,
    ) {
        store.commitEditors()
        leave()
    }

    Row(Modifier.align(Alignment.TopEnd).padding(end = 20.dp, top = top), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OrganicButton(L10n.Me.ThoughtMap.addGroupShort, variant = ButtonVariant.Paper, icon = IconName.Frame, small = true, iconSize = 15.dp) {
            // The web's blur commits a title being typed before the new region takes over the editor.
            store.commitEditors()
            addGroup()
        }
        OrganicButton(L10n.Me.ThoughtMap.addCardShort, variant = ButtonVariant.Solid, icon = IconName.Plus, small = true, iconSize = 15.dp) {
            store.commitEditors()
            store.trayOpen = !store.trayOpen
        }
    }

    ZoomCluster(store, Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = 16.dp + bottom))

    if (store.loaded && store.isEmpty && !store.trayOpen) {
        Column(
            Modifier.align(Alignment.Center).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            BasicText(
                L10n.Me.ThoughtMap.empty,
                style = AppFonts.body(15f, lineHeight = 1.7f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
                modifier = Modifier.widthIn(max = 320.dp),
            )
            OrganicButton(L10n.Me.ThoughtMap.addCard, icon = IconName.Plus, iconSize = 16.dp) { store.trayOpen = true }
        }
    }
    if (!store.loaded) {
        Box(Modifier.align(Alignment.Center)) {
            if (store.failed) {
                OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, {
                    session.uid?.let { uid -> scope.launch { store.load(uid) } }
                }, action = EmptyAction.Outline)
            } else {
                SketchLoader(48.dp)
            }
        }
    }
}

/**
 * The zoom cluster: − 100% + and the eye (fit), on a wobbly sheet of card paper
 * — the cards' fill and grain, no pen line — like the paper buttons above.
 */
@Composable
private fun ZoomCluster(store: ThoughtMapStore, modifier: Modifier) {
    val pct by remember(store) { derivedStateOf { (store.camera.s * 100).roundToInt() } }
    Row(
        modifier
            .organicSurface(Tokens.CardBg, Color.Transparent, radius = 18.0, seed = 41.0)
            .padding(vertical = 6.dp, horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ZoomButton(IconName.Minus, L10n.Me.ThoughtMap.zoomOut) { store.commitEditors(); store.zoom(1 / 1.25) }
        Box(Modifier.widthIn(min = 38.dp), contentAlignment = Alignment.Center) {
            BasicText("$pct%", style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted).copy(fontFeatureSettings = "tnum"))
        }
        ZoomButton(IconName.Plus, L10n.Me.ThoughtMap.zoomIn) { store.commitEditors(); store.zoom(1.25) }
        ZoomButton(IconName.Eye, L10n.Me.ThoughtMap.zoomFit) { store.commitEditors(); store.fit() }
    }
}

@Composable
private fun ZoomButton(icon: IconName, label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(30.dp)
            .clip(CircleShape)
            .plainClickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(icon, size = 16.dp, color = Tokens.TextMuted) }
}

// The tray

/**
 * "Pick a card to add": my cards not on the map yet (drafts first, then newest)
 * on a hand-drawn card over a light scrim; a tap places one.
 */
@Composable
fun MapTray(store: ThoughtMapStore) {
    val config = LocalConfiguration.current
    val cards = store.trayCards
    Box(
        Modifier.fillMaxSize().background(MapInk.scrim).plainClickable { store.trayOpen = false },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .widthIn(max = min(340f, config.screenWidthDp - 32f).dp)
                .fillMaxWidth()
                .heightIn(max = min(440f, config.screenHeightDp * 0.6f).dp)
                .drawWithCache {
                    val outline = WobRectShape(16.0, 29.0).createOutline(size, layoutDirection, this)
                    val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    onDrawBehind {
                        drawOutline(outline, Tokens.CardBg)
                        drawOutline(outline, Tokens.FieldBorder, style = pen)
                    }
                }
                // A tap on the card itself is not a tap on the backdrop.
                .plainClickable { }
                .verticalScroll(rememberScrollState())
                .padding(vertical = 12.dp, horizontal = 16.dp),
        ) {
            BasicText(
                L10n.Me.ThoughtMap.trayTitle,
                style = AppFonts.heading(14.5f, 700, lineHeight = 1.3f),
                modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 4.dp, bottom = 10.dp),
            )
            WavyDivider(seed = 31.0, modifier = Modifier.padding(bottom = 4.dp))
            if (cards.isEmpty()) {
                BasicText(
                    L10n.Me.ThoughtMap.trayEmpty,
                    style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted),
                    modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 14.dp, bottom = 18.dp),
                )
            }
            cards.forEachIndexed { i, card ->
                if (i > 0) WavyDivider(seed = 31.0 + i * 7)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .plainClickable(role = Role.Button) { store.addCard(card) }
                        .padding(vertical = 12.dp, horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OrganicIcon(
                        if (card.id in store.resonated) IconName.Wave else if (card.publishedAt != null) IconName.Cards else IconName.Pen,
                        size = 15.dp, color = Tokens.TextMuted,
                    )
                    BasicText(
                        card.title,
                        style = AppFonts.body(13.5f, lineHeight = 1.4f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    OrganicIcon(IconName.Plus, size = 14.dp, color = Tokens.TextMuted)
                }
            }
        }
    }
}

// Editing words in place

/**
 * The region-title and arrow-label editors. The web edits them inside the
 * zoomed world; a text field can't scale with it (caret, selection, keyboard),
 * so here they sit in screen space at 1:1, over where the words are.
 */
@Composable
fun MapEditors(store: ThoughtMapStore) {
    val groupId = store.editingGroupId
    val edgeId = store.editingEdgeId
    // Fitted to the words they replace, which are set at the world's fixed size.
    FixedFontScale {
        if (groupId != null) store.groups[groupId]?.let { GroupTitleEditor(store, it) }
        if (edgeId != null) store.edges[edgeId]?.let { EdgeLabelEditor(store, it) }
    }
}

/** GroupTitleEditor: the title in its heading type over a wavy underline in the region's hue. */
@Composable
private fun GroupTitleEditor(store: ThoughtMapStore, g: MapGroup) {
    val density = LocalDensity.current.density
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    var value by remember(g.id) { mutableStateOf(TextFieldValue(store.groupDraft, TextRange(0, store.groupDraft.length))) }
    var hadFocus by remember { mutableStateOf(false) }
    val cam = store.camera
    val x = (g.x + 16) * cam.s + cam.x
    val y = (g.y + 8) * cam.s + cam.y
    val lineW = max(32.0, MapText.width(value.text, AppFonts.Family.Heading, 700, 16f) + 8.0)
    val underline = remember(g.hue) { MapInk.oklch(0.48, 0.09, g.hue) }
    Column(
        Modifier
            .offset((x - 6).dp, (y - 6).dp)
            .background(MapInk.oklch(0.965, 0.032, g.hue, 0.96), RoundedCornerShape(12.dp))
            .padding(6.dp),
    ) {
        BasicTextField(
            value,
            { value = it; store.groupDraft = it.text },
            textStyle = AppFonts.heading(16f, 700, lineHeight = 1.333f),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { store.commitGroupTitle() }),
            modifier = Modifier
                .widthIn(min = 120.dp, max = max(120.0, g.w * cam.s - 44 - 16).dp)
                .padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 1.dp)
                .focusRequester(focus)
                .onFocusChanged {
                    // Leaving the field commits it, as the web's blur does.
                    if (it.isFocused) hadFocus = true else if (hadFocus) store.commitGroupTitle()
                },
            decorationBox = { inner ->
                Box {
                    if (value.text.isEmpty()) {
                        BasicText(L10n.Me.ThoughtMap.groupTitlePlaceholder, style = AppFonts.oblique(AppFonts.heading(16f, 700, lineHeight = 1.333f).copy(color = Tokens.Placeholder)))
                    }
                    inner()
                }
            },
        )
        Canvas(Modifier.padding(start = 4.dp).size(lineW.dp, 6.dp)) {
            val w = lineW
            val path = wavyLinePath(size.width, size.height, density, seedFromString(g.id) + 17.0, 1.7, max(3, (w / 46).roundToInt()))
            drawPath(path, underline, style = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round))
        }
    }
    LaunchedEffect(g.id) {
        focus.requestFocus()
        keyboard?.show()
    }
    DisposableEffect(g.id) { onDispose { keyboard?.hide() } }
}

/** EdgeLabelEditor: a pill-shaped badge with the words centred and a trash at its end. */
@Composable
private fun EdgeLabelEditor(store: ThoughtMapStore, e: MapEdge) {
    val geo = store.edgeGeometry(e) ?: return
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    var value by remember(e.id) { mutableStateOf(TextFieldValue(store.labelDraft, TextRange(0, store.labelDraft.length))) }
    var hadFocus by remember { mutableStateOf(false) }
    val cam = store.camera
    val px = geo.geo.mid.x * cam.s + cam.x
    val py = geo.geo.mid.y * cam.s + cam.y
    val shown = value.text.ifEmpty { L10n.Me.ThoughtMap.edgeLabelPlaceholder }
    val w = max(72.0, MapText.width(shown, AppFonts.Family.Body, 600, 11.5f, 0.04f) + 16.0) + 26 + 12
    val style = AppFonts.body(11.5f, 600, lineHeight = 1.3f).copy(textAlign = TextAlign.Center, letterSpacing = 0.04.em)
    val seed = seedFromString(e.id) + 5.0
    Row(
        Modifier
            .offset((px - w / 2).dp, (py - 14).dp)
            .size(w.dp, 28.dp)
            .drawWithCache {
                val outline = WobRectShape(14.0, seed).createOutline(size, layoutDirection, this)
                val pen = Stroke(Tokens.InkLight.toPx(), join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(outline, MapInk.pillFillSelected)
                    drawOutline(outline, MapInk.edgeInk(false), style = pen)
                }
            }
            .padding(start = 10.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value,
            { value = it; store.labelDraft = it.text },
            textStyle = style,
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { store.commitEdgeLabel() }),
            modifier = Modifier
                .weight(1f)
                .focusRequester(focus)
                .onFocusChanged { if (it.isFocused) hadFocus = true else if (hadFocus) store.commitEdgeLabel() },
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.Center) {
                    if (value.text.isEmpty()) BasicText(L10n.Me.ThoughtMap.edgeLabelPlaceholder, style = AppFonts.oblique(style.copy(color = Tokens.Placeholder)), maxLines = 1)
                    inner()
                }
            },
        )
        Box(
            Modifier
                .padding(start = 2.dp)
                .size(22.dp)
                .plainClickable(role = Role.Button, onClickLabel = L10n.Me.ThoughtMap.deleteEdge) { store.removeEdge(e.id) },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Trash, size = 13.dp, color = Tokens.Text) }
    }
    LaunchedEffect(e.id) {
        focus.requestFocus()
        keyboard?.show()
    }
    DisposableEffect(e.id) { onDispose { keyboard?.hide() } }
}
