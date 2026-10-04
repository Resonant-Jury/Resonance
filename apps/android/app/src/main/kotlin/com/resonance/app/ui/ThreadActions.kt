package com.resonance.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.resonance.design.CappedTextScale
import com.resonance.design.ModalScrim
import com.resonance.design.OrganicMenuItem
import com.resonance.design.OrganicMenuPanel
import com.resonance.design.generated.IconName
import com.resonance.design.plainClickable
import com.resonance.kit.chat.Delivery
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min

/**
 * What a long-press on a message offers (the feel of Messenger's and Instagram's): the thread
 * dims, the message is lifted out of it where it lies, and the actions hang under it — Reply, Copy,
 * the link under the finger (Open, Copy), and for one that didn't go, Retry and Delete — over a
 * quiet line with the full time.
 */
internal fun messageMenuItems(
    menu: MessageMenu,
    model: ThreadModel,
    opener: LinkOpener,
    context: Context,
    open: (Route) -> Unit,
    reply: () -> Unit,
): List<OrganicMenuItem> {
    val message = menu.row.message
    return buildList {
        // A reply needs a composer to go in: not while you can't write here.
        if (message.canReply && model.foot.composes) add(OrganicMenuItem(L10n.Messages.reply, IconName.Reply) { reply() })
        if (message.text.isNotEmpty()) add(OrganicMenuItem(L10n.Native.copy, IconName.Copy) { copyText(context, message.text) })
        menu.link?.let { url ->
            // A card of the site opens in the app, as a tap on the bubble does.
            add(OrganicMenuItem(L10n.Messages.openLink, IconName.Link) { model.openLink(url, opener, open) })
            add(OrganicMenuItem(L10n.Messages.copyLink, IconName.Copy) { copyText(context, url) })
        }
        if (message.delivery == Delivery.Failed) {
            add(OrganicMenuItem(L10n.Messages.retry, IconName.Send) { model.retry(message.key) })
            add(OrganicMenuItem(L10n.Messages.discardFailed, IconName.Trash, destructive = true) { model.discard(message.key) })
        }
    }
}

/** Puts [text] on the clipboard; Android 13 and later say so themselves. */
private fun copyText(context: Context, text: String) {
    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("message", text))
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) Toast.makeText(context, L10n.Messages.copied, Toast.LENGTH_SHORT).show()
}

private val MenuRowDp = 42.dp
private val MenuFooterDp = 38.dp
private val MenuGap = 10.dp
private val MenuMargin = 12.dp

@Composable
internal fun MessageMenuOverlay(
    menu: MessageMenu,
    ctx: ThreadContext,
    items: List<OrganicMenuItem>,
    footer: String,
    onDismiss: () -> Unit,
) {
    val message = menu.row.message
    val mine = ctx.model.isMine(message)
    val scope = rememberCoroutineScope()
    // The scrim, the lifted message and the panel come and go together.
    val appear = remember { Animatable(0f) }
    val lift = remember { Animatable(1f) }
    var leaving by remember { mutableStateOf(false) }
    val dismiss: () -> Unit = {
        if (!leaving) {
            leaving = true
            // The message settles back into its place as the scrim lifts, and the thread's own takes over.
            scope.launch { lift.animateTo(1f, tween(120)) }
            scope.launch {
                appear.animateTo(0f, tween(120))
                onDismiss()
            }
        }
    }
    BackHandler(onBack = dismiss)
    LaunchedEffect(Unit) { appear.animateTo(1f, tween(150)) }
    LaunchedEffect(Unit) { lift.animateTo(1.03f, spring(dampingRatio = 0.55f, stiffness = 520f)) }

    val density = LocalDensity.current
    val topInset = WindowInsets.statusBars.getTop(density)
    val bottomInset = max(WindowInsets.navigationBars.getBottom(density), WindowInsets.ime.getBottom(density))
    var origin by remember { mutableStateOf(Offset.Zero) }
    // A popup would be a window of its own with the system's whole text scale; this lies in the screen's, which has the capped one.
    BoxWithConstraints(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot() }) {
        val screenW = constraints.maxWidth
        val screenH = constraints.maxHeight
        val gap = with(density) { MenuGap.roundToPx() }
        val margin = with(density) { MenuMargin.roundToPx() }
        val menuH = with(density) { (MenuRowDp * items.size + MenuFooterDp).roundToPx() }
        val safeTop = topInset + margin
        val safeBottom = screenH - bottomInset - margin

        val left = (menu.bounds.left - origin.x).toInt()
        val right = (menu.bounds.right - origin.x).toInt()
        val top = (menu.bounds.top - origin.y).toInt()
        val bottom = (menu.bounds.bottom - origin.y).toInt()
        // Under the message if the panel fits there, else over it; else the message gives way.
        var below = true
        var shift = 0
        var menuY = bottom + gap
        if (menuY + menuH > safeBottom) {
            if (top - gap - menuH >= safeTop) {
                below = false
                menuY = top - gap - menuH
            } else {
                menuY = max(safeTop, safeBottom - menuH)
                shift = -min(max(0, bottom + gap - menuY), max(0, top - safeTop))
            }
        }

        Box(
            Modifier
                .fillMaxSize()
                // The modals' scrim, over the bars too (the activity is edge to edge).
                .drawBehind { drawRect(ModalScrim, alpha = appear.value) }
                .plainClickable(onClick = dismiss),
        )
        CappedTextScale {
            Box(
                Modifier
                    .offset { IntOffset(left, top + shift) }
                    .requiredWidth(with(density) { (right - left).toDp() })
                    .graphicsLayer {
                        scaleX = lift.value
                        scaleY = lift.value
                        transformOrigin = TransformOrigin(if (mine) 1f else 0f, 0.5f)
                    },
            ) { MessageCore(menu.row, ctx, interactive = false) }

            var choosing by remember { mutableStateOf(false) }
            Box(
                Modifier
                    .offset { IntOffset(0, menuY) }
                    .fillMaxWidth()
                    .padding(
                        start = if (mine) margin.pxToDp(density) else max(left, margin).pxToDp(density),
                        end = if (mine) max(screenW - right, margin).pxToDp(density) else margin.pxToDp(density),
                    )
                    .graphicsLayer { alpha = appear.value },
                contentAlignment = if (mine) Alignment.TopEnd else Alignment.TopStart,
            ) {
                OrganicMenuPanel(
                    items, seed = seedFromMessage(message.key), footer = footer,
                    origin = TransformOrigin(if (mine) 1f else 0f, if (below) 0f else 1f),
                    onChoose = { item ->
                        if (!choosing) {
                            choosing = true
                            scope.launch {
                                // A tap is shorter than the ink's spread: the panel stays long enough to show it.
                                delay(150)
                                dismiss()
                                item.onClick()
                            }
                        }
                    },
                )
            }
        }
    }
}

private fun Int.pxToDp(density: androidx.compose.ui.unit.Density) = with(density) { toDp() }

private fun seedFromMessage(key: String): Double = com.resonance.design.seedFromId(key, 23)
