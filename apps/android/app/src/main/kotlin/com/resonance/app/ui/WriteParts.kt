package com.resonance.app.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.AutoWobRectShape
import com.resonance.design.ButtonVariant
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.TagPill
import com.resonance.design.TagSize
import com.resonance.design.fade
import com.resonance.design.fieldHintStyle
import com.resonance.design.fieldSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n

/**
 * TagField.tsx: the writer's tags as one control. A single input frame (the
 * field's line; terracotta while anything inside it has focus) holds the chosen
 * tags as bare `md` pills — one frame per layer, so none draws a pen line —
 * then the text input and one trailing action that follows the context: with
 * nothing typed it asks the model for tags (the sparkle breathes while it
 * thinks), with something typed it adds that tag. Done, a comma (，、 too) or
 * the action adds; Backspace on an empty input takes the last tag back. The
 * pills wrap, and the input with its action goes down together once the line
 * is full ([TagFlow]). The helper line under it is the caller's.
 */
@Composable
fun TagField(
    tags: List<String>,
    draft: String,
    onDraftChange: (String) -> Unit,
    placeholder: String,
    suggesting: Boolean,
    onRemove: (String) -> Unit,
    onRemoveLast: () -> Unit,
    onAdd: () -> Unit,
    onSuggest: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val canAdd = draft.isNotBlank()
    // The sparkle breathes (the action fades as a whole: the button draws its label and glyph together) until the tags arrive.
    val breath = if (suggesting && !canAdd) {
        rememberInfiniteTransition(label = "tags-thinking").animateFloat(
            0.45f, 1f, infiniteRepeatable(tween(1100, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tags-thinking-alpha",
        ).value
    } else 1f
    Box(
        Modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.hasFocus }
            .fieldSurface(53.0, { focused })
            // The empty parts of the frame are the input's too; the pills' ✕ and the action take their own taps first.
            .pointerInput(Unit) { detectTapGestures { focus.requestFocus(); keyboard?.show() } }
            // The action carries its own room, so the right edge pads less.
            .padding(start = Tokens.FieldPadX.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
    ) {
        TagFlow {
            tags.forEach { tag -> key(tag) { TagPill(tag, Tokens.TerracottaLight, size = TagSize.Md) { onRemove(tag) } } }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).padding(vertical = 2.dp)) {
                    val text = AppFonts.body(15f, lineHeight = 1.6f)
                    if (draft.isEmpty()) BasicText(placeholder, style = fieldHintStyle())
                    BasicTextField(
                        draft, onDraftChange,
                        textStyle = text,
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        // Done adds what is typed and stays for the next; with nothing typed it is done with the field.
                        keyboardActions = KeyboardActions(onDone = { if (canAdd) onAdd() else focusManager.clearFocus() }),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focus)
                            .onPreviewKeyEvent { e ->
                                // One tag per press: holding the key clears the text, then stops.
                                val back = e.type == KeyEventType.KeyDown && e.key == Key.Backspace && e.nativeKeyEvent.repeatCount == 0
                                if (back && draft.isEmpty() && tags.isNotEmpty()) {
                                    onRemoveLast()
                                    true
                                } else false
                            }
                            .semantics { contentDescription = placeholder },
                    )
                }
                OrganicButton(
                    when {
                        canAdd -> L10n.Write.tagsAdd
                        suggesting -> L10n.Write.tagsSuggesting
                        else -> L10n.Write.tagsSuggest
                    },
                    modifier = Modifier.fade(breath),
                    variant = ButtonVariant.Tonal,
                    icon = if (canAdd) IconName.Plus else IconName.Sparkle,
                    iconSize = if (canAdd) 13.dp else 16.dp,
                    small = true,
                ) { if (canAdd) onAdd() else onSuggest() }
            }
        }
    }
}

/**
 * The tag field's flow: the pills in order, wrapping as words do, then the
 * input row (the last child) on whatever is left of the last line — or, when
 * less than [ENTRY_MIN] of it is left, on a line of its own. FlowRow can't say
 * "fill the rest of the line, but not less than this", so the lines are broken
 * by [breakTagLines]. Children sit centred on their line.
 */
@Composable
private fun TagFlow(content: @Composable () -> Unit) {
    Layout(content) { measurables, constraints ->
        val gap = TAG_GAP.roundToPx()
        val maxWidth = constraints.maxWidth
        val pills = measurables.dropLast(1).map { it.measure(Constraints(maxWidth = maxWidth)) }
        val lines = breakTagLines(pills.map { it.width }, ENTRY_MIN.roundToPx(), maxWidth, gap)
        val placed = mutableListOf<Triple<Placeable, Int, Int>>() // what, x, y
        var next = 0
        var y = 0
        lines.forEachIndexed { i, line ->
            val items = mutableListOf<Placeable>()
            repeat(line.pills) { items += pills[next++] }
            if (line.entry) {
                val width = (maxWidth - items.sumOf { it.width } - gap * items.size).coerceAtLeast(0)
                items += measurables.last().measure(Constraints(minWidth = width, maxWidth = width))
            }
            val height = items.maxOfOrNull { it.height } ?: 0
            var x = 0
            for (item in items) {
                placed += Triple(item, x, y + (height - item.height) / 2)
                x += item.width + gap
            }
            y += height + if (i < lines.lastIndex) gap else 0
        }
        layout(maxWidth, y) { for ((item, x, top) in placed) item.placeRelative(x, top) }
    }
}

private val TAG_GAP = 8.dp

/** The least width the input row takes before it goes down a line. */
private val ENTRY_MIN = 240.dp

/** One line of the tag field: how many pills it holds and whether the input row ends it. */
internal class TagLine(val pills: Int, val entry: Boolean)

/**
 * Breaks the tag field into lines: pills fill a line in order (a pill that
 * doesn't fit starts the next; one wider than the field sits alone), and the
 * input row takes the last line if [entryMin] of it is left, else a line of its
 * own. Widths and gap are in pixels.
 */
internal fun breakTagLines(pillWidths: List<Int>, entryMin: Int, maxWidth: Int, gap: Int): List<TagLine> {
    val lines = mutableListOf<TagLine>()
    var count = 0
    var used = 0
    for (width in pillWidths) {
        val needs = if (count == 0) width else used + gap + width
        if (count > 0 && needs > maxWidth) {
            lines += TagLine(count, entry = false)
            count = 0
        }
        used = if (count == 0) width else used + gap + width
        count++
    }
    val needs = if (count == 0) entryMin else used + gap + entryMin
    if (count > 0 && needs > maxWidth) {
        lines += TagLine(count, entry = false)
        lines += TagLine(0, entry = true)
    } else {
        lines += TagLine(count, entry = true)
    }
    return lines
}

/** One half of the image surface (upload or illustrate): the terracotta glyph, the muted title and its fainter hint. */
@Composable
fun MediaHalf(icon: IconName, title: String, hint: String, modifier: Modifier = Modifier) {
    Column(
        modifier.padding(vertical = 22.dp, horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
    ) {
        OrganicIcon(icon, size = 26.dp, color = Tokens.Terracotta)
        BasicText(title, style = AppFonts.body(14f, 600, lineHeight = 1.4f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
        BasicText(hint, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted.copy(alpha = 0.75f)).copy(textAlign = TextAlign.Center))
    }
}

/**
 * The image surface's frame (HandDrawnDashedSurface R16, seed 31, bow 0.8):
 * the field's line, terracotta while something is on its way in.
 */
fun Modifier.mediaFrame(busy: Boolean = false): Modifier = drawBehind {
    val o = AutoWobRectShape(16.0, 31.0, 0.8).createOutline(size, layoutDirection, this)
    drawOutline(o, if (busy) Tokens.Terracotta else Tokens.FieldBorder, style = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
}
