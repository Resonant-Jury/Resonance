package com.resonance.spikes.s3

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.ui.NavDisplay
import com.resonance.geometry.WobCircleOptions
import com.resonance.spikes.design.AppFonts
import com.resonance.spikes.design.GrainMode
import com.resonance.spikes.design.WavyDivider
import com.resonance.spikes.design.WobCircleShape
import com.resonance.spikes.design.WobRectShape
import com.resonance.spikes.design.organicSurface
import com.resonance.spikes.generated.Tokens
import com.resonance.spikes.s2.SampleStory
import com.resonance.spikes.s2.StoryCardView
import kotlinx.coroutines.launch

/**
 * S3 on Android — can the brand's organic chrome replace Material's bars
 * without losing platform behavior?
 *
 * Both modes use the same Navigation 3 NavDisplay, so the back stack,
 * the system back gesture and the *predictive* back animation (Android 16:
 * on by default when targeting SDK 36) stay the platform's.
 *  • System: Scaffold + LargeTopAppBar (collapsing) + NavigationBar + TopAppBar with ← on detail.
 *  • Organic: hand-drawn header with wavy edge, organic ← button, floating organic tab bar.
 */
enum class ChromeMode { System, Organic }

enum class SpikeTab(val label: String, val icon: ImageVector) {
    Home("共振", Icons.Filled.Home), Me("我的", Icons.Filled.Person), Messages("訊息", Icons.Filled.Email)
}

sealed interface Route
data object Root : Route
data class Detail(val story: SampleStory) : Route

@Composable
fun NavSpike(initial: ChromeMode) {
    var mode by remember { mutableStateOf(initial) }
    var tab by remember { mutableStateOf(SpikeTab.Home) }
    val stacks = remember { SpikeTab.entries.associateWith { mutableStateListOf<Route>(Root) } }
    val lists = SpikeTab.entries.associateWith { rememberLazyListState() }
    val stack = stacks.getValue(tab)
    val scope = rememberCoroutineScope()
    val atRoot = stack.size == 1

    MaterialTheme(colorScheme = lightColorScheme(primary = Tokens.Terracotta, surface = Tokens.Cream, background = Tokens.Cream)) {
        val select: (SpikeTab) -> Unit = { picked ->
            if (picked == tab) {
                // Re-selecting the current tab pops to root, then scrolls to top.
                if (stack.size > 1) stack.removeRange(1, stack.size)
                else scope.launch { lists.getValue(tab).animateScrollToItem(0) }
            }
            tab = picked
        }
        Box(Modifier.fillMaxSize().background(Tokens.Cream)) {
            Scaffold(
                containerColor = Tokens.Cream,
                contentWindowInsets = WindowInsets(0),
                bottomBar = {
                    if (mode == ChromeMode.System) {
                        AnimatedVisibility(atRoot, enter = slideInVertically { it }, exit = slideOutVertically { it }) {
                            NavigationBar(containerColor = Tokens.CreamDark) {
                                SpikeTab.entries.forEach { t ->
                                    NavigationBarItem(t == tab, { select(t) }, { Icon(t.icon, null) }, label = { Text(t.label) })
                                }
                            }
                        }
                    }
                },
            ) { inner ->
                Box(Modifier.padding(inner)) {
                    NavDisplay(
                        backStack = stack,
                        onBack = { stack.removeLastOrNull() },
                        entryProvider = entryProvider {
                            entry<Root> {
                                TabRoot(tab, mode, { mode = it }, lists.getValue(tab)) { stack.add(Detail(it)) }
                            }
                            entry<Detail> { d ->
                                StoryDetail(d.story, mode) { stack.removeLastOrNull() }
                            }
                        },
                    )
                }
            }
            if (mode == ChromeMode.Organic) {
                AnimatedVisibility(
                    atRoot,
                    modifier = Modifier.align(Alignment.BottomCenter),
                    enter = slideInVertically { it } + fadeIn(),
                    exit = slideOutVertically { it } + fadeOut(),
                ) { OrganicTabBar(tab, select) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TabRoot(tab: SpikeTab, mode: ChromeMode, setMode: (ChromeMode) -> Unit, list: LazyListState, open: (SampleStory) -> Unit) {
    val content: @Composable (Modifier, PaddingValues) -> Unit = { modifier, padding ->
        LazyColumn(
            modifier,
            state = list,
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            if (mode == ChromeMode.Organic) item { OrganicLargeHeader(tab.label) }
            item { ModePicker(mode, setMode) }
            items(SampleStory.all.take(8), key = { it.id }) { s ->
                StoryCardView(s, GrainMode.Tile, modifier = Modifier.clickable(role = Role.Button) { open(s) })
            }
        }
    }
    when (mode) {
        ChromeMode.System -> {
            val behavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
            Scaffold(
                modifier = Modifier.nestedScroll(behavior.nestedScrollConnection),
                containerColor = Tokens.Cream,
                topBar = {
                    LargeTopAppBar(
                        title = { Text(tab.label) },
                        actions = {
                            IconButton({}) { Icon(Icons.Filled.Edit, "寫一張卡片") }
                            IconButton({}) { Icon(Icons.Filled.Notifications, "通知") }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Tokens.Cream, scrolledContainerColor = Tokens.CreamDark),
                        scrollBehavior = behavior,
                    )
                },
            ) { p -> content(Modifier.fillMaxSize(), p) }
        }
        ChromeMode.Organic -> content(Modifier.fillMaxSize().statusBarsPadding(), PaddingValues(0.dp))
    }
}

@Composable
private fun ModePicker(mode: ChromeMode, setMode: (ChromeMode) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        ChromeMode.entries.forEachIndexed { i, m ->
            SegmentedButton(
                selected = mode == m,
                onClick = { setMode(m) },
                shape = SegmentedButtonDefaults.itemShape(i, ChromeMode.entries.size),
            ) { Text(m.name.lowercase()) }
        }
    }
}

/** Root header: Playfair title with the web's wavy pen line — moved from the bar into the content. */
@Composable
private fun OrganicLargeHeader(title: String) {
    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BasicText(title, Modifier.weight(1f).semantics { heading() }, style = AppFonts.heading(32f))
            OrganicIconButton(Icons.Filled.Edit, "寫一張卡片") {}
            OrganicIconButton(Icons.Filled.Notifications, "通知") {}
        }
        WavyDivider(Tokens.TextMuted.copy(alpha = 0.5f), seed = 7.0, amp = 1.6)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StoryDetail(story: SampleStory, mode: ChromeMode, back: () -> Unit) {
    val body: @Composable (PaddingValues) -> Unit = { p ->
        LazyColumn(
            Modifier.fillMaxSize().background(Tokens.Cream),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = p.calculateTopPadding() + 16.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { BasicText(story.title, style = AppFonts.heading(28f)) }
            items(6) { BasicText(story.excerpt + " " + story.excerpt, style = AppFonts.body(16f, lineHeight = 1.75f)) }
        }
    }
    when (mode) {
        ChromeMode.System -> Scaffold(
            containerColor = Tokens.Cream,
            topBar = {
                // Material: ← on the left, title left-aligned next to it, actions on the right.
                TopAppBar(
                    title = { Text(story.title, maxLines = 1) },
                    navigationIcon = { IconButton(back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") } },
                    actions = {
                        IconButton({}) { Icon(Icons.Filled.Share, "分享") }
                        OverflowMenu()
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Tokens.Cream),
                )
            },
        ) { p -> body(p) }
        ChromeMode.Organic -> Column(Modifier.fillMaxSize().background(Tokens.Cream)) {
            OrganicTopBar(story.title, back)
            Box(Modifier.weight(1f)) { body(PaddingValues(0.dp)) }
        }
    }
}

@Composable
private fun OverflowMenu() {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton({ open = true }) { Icon(Icons.Filled.MoreVert, "更多") }
        DropdownMenu(open, { open = false }) {
            DropdownMenuItem({ Text("檢舉這張卡片") }, { open = false })
            DropdownMenuItem({ Text("封鎖") }, { open = false })
        }
    }
}

/** Organic top app bar: Android layout (← then a left-aligned title), hand-drawn parts, wavy lower edge. */
@Composable
private fun OrganicTopBar(title: String, back: () -> Unit) {
    Column(Modifier.background(Tokens.Cream).statusBarsPadding().padding(horizontal = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OrganicIconButton(Icons.AutoMirrored.Filled.ArrowBack, "返回", back)
            BasicText(
                title,
                Modifier.weight(1f).padding(start = 4.dp).semantics { heading() },
                style = AppFonts.body(18f, 600, lineHeight = 1.3f),
                maxLines = 1,
            )
            OrganicIconButton(Icons.Filled.Share, "分享") {}
            OrganicIconButton(Icons.Filled.MoreVert, "更多") {}
        }
        WavyDivider(Tokens.TextMuted.copy(alpha = 0.4f), seed = 11.0)
    }
}

@Composable
private fun OrganicIconButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    val ring = WobCircleShape(label.length * 13.0, WobCircleOptions(segments = 7, mag = 1.2, cpJitter = 0.5))
    Box(
        Modifier
            .size(48.dp) // Material's minimum touch target
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(38.dp).drawWithCache {
                val o = ring.createOutline(size, layoutDirection, this)
                val s = Stroke(Tokens.InkLight.toPx())
                onDrawBehind { drawOutline(o, Tokens.GhostStroke.copy(alpha = 0.8f), style = s) }
            },
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, Modifier.size(20.dp), tint = Tokens.Text) }
    }
}

/** Floating hand-drawn tab bar with the web's active wash; haptic on selection; tab semantics. */
@Composable
private fun OrganicTabBar(selection: SpikeTab, onSelect: (SpikeTab) -> Unit) {
    val haptics = LocalHapticFeedback.current
    Row(
        Modifier
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .fillMaxWidth()
            .organicSurface(Tokens.CardBg, Tokens.ModalBorder, radius = 26.0, seed = 131.0, grainOpacity = 0.25f)
            .padding(horizontal = 6.dp, vertical = 7.dp),
    ) {
        SpikeTab.entries.forEach { t ->
            val selected = t == selection
            val wash = WobRectShape(16.0, (t.label.codePointAt(0) % 97).toDouble(), mag = 1.3)
            Column(
                Modifier
                    .weight(1f)
                    .semantics { this.selected = selected }
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) {
                        if (!selected) haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(t)
                    }
                    .padding(horizontal = 8.dp, vertical = 2.dp)
                    .drawWithCache {
                        val o = wash.createOutline(size, layoutDirection, this)
                        onDrawBehind { if (selected) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.45f)) }
                    }
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val tint = if (selected) Tokens.Terracotta else Tokens.TextMuted
                Icon(t.icon, null, Modifier.size(22.dp), tint = tint)
                Spacer(Modifier.size(2.dp))
                BasicText(t.label, style = AppFonts.body(11f, if (selected) 600 else 400, lineHeight = 1.2f, color = tint))
            }
        }
    }
}
