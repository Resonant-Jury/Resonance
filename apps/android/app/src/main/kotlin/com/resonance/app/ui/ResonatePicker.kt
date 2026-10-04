package com.resonance.app.ui

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.CssText
import com.resonance.design.Mixes
import com.resonance.design.ModalActions
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicModal
import com.resonance.design.Skeleton
import com.resonance.design.WavyDivider
import com.resonance.design.WobRectShape
import com.resonance.design.fade
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Which of the viewer's published cards may resonate with a card (the web's `resonateChoices`): the
 * public ones not answering a card already — a card answers one card — never the card itself nor
 * the card it answers (that would answer its own answer). [hidden] counts the public cards left out
 * for answering another card, so the picker can say why they are missing.
 */
internal data class ResonateChoices(val cards: List<FeedCard>, val hidden: Int) {
    companion object {
        fun of(cards: List<FeedCard>, targetId: String, targetReferenceId: String?): ResonateChoices {
            val open = cards.filter { it.visibility == FeedCard.Visibility.`public` && it.publishedAt != null && it.id != targetId }
            return ResonateChoices(
                cards = open.filter { it.referenceCardId == null && it.id != targetReferenceId },
                hidden = open.count { it.referenceCardId != null && it.referenceCardId != targetId },
            )
        }
    }
}

/**
 * 共振 opens this (ResonatePicker.tsx): write a new card in answer ([onWriteNew], the writer as
 * before), or pick one of your published public cards about something similar, which the server
 * then points at this card (POST /api/v1/cards/{id}/resonances). A tap marks a card and 共振
 * confirms it — the choice rings someone's phone, so a stray tap in a scrolling list must not send
 * it. Your cards come from the card box's published shelf (the one kept on disk first, while it is
 * read again). [onResonated] has the card that now resonates, once the server said so.
 */
@Composable
fun ResonatePicker(
    session: Session,
    targetId: String,
    targetReferenceId: String?,
    onWriteNew: () -> Unit,
    onResonated: (FeedCard) -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var shelf by remember { mutableStateOf<List<FeedCard>?>(null) }
    var readFailed by remember { mutableStateOf(false) }
    var reads by remember { mutableIntStateOf(0) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(reads) {
        if (shelf == null) session.uid?.let { uid -> session.kept(uid)?.published()?.let { kept -> if (shelf == null) shelf = kept } }
        try {
            shelf = session.reading.cardBox(TabGetCardBox.published)
            readFailed = false
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            readFailed = shelf == null
        }
    }
    val choices = shelf?.let { ResonateChoices.of(it, targetId, targetReferenceId) }
    val selected = choices?.cards?.firstOrNull { it.id == selectedId }

    OrganicModal(if (busy) null else onDismiss, L10n.Card.ResonatePicker.title, seed = 53.0, closeLabel = L10n.Card.ResonatePicker.cancel, maxWidth = 480.dp) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            ModalTitle(L10n.Card.ResonatePicker.title)
            CssText(L10n.Card.ResonatePicker.subtitle, AppFonts.Family.Body, 14f, lineHeight = 1.55f, color = Tokens.TextMuted)
        }
        CardPickList(
            choices?.cards.orEmpty(),
            onPick = { card ->
                if (!busy) {
                    failure = null
                    selectedId = card.id
                }
            },
            lead = {
                WriteNewRow(enabled = !busy) {
                    onDismiss()
                    onWriteNew()
                }
                WavyDivider(seed = 59.0, modifier = Modifier.padding(vertical = 8.dp))
                BasicText(
                    L10n.Card.ResonatePicker.pickHeading,
                    style = AppFonts.body(13f, 600, lineHeight = 1.4f, color = Tokens.TextMuted).copy(letterSpacing = 0.02.em),
                    modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 4.dp, bottom = 2.dp),
                )
            },
            choosing = true,
            selectedId = selectedId,
            enabled = !busy,
            anonymousLabel = L10n.Card.ResonatePicker.anonymous,
            empty = {
                when {
                    choices != null -> PickNote(L10n.Card.ResonatePicker.empty)
                    readFailed -> Row(
                        Modifier.padding(start = 6.dp, top = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        BasicText(L10n.Native.loadError, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted))
                        OrganicButton(L10n.Native.retry, variant = ButtonVariant.TextAccent, small = true) { reads++ }
                    }
                    else -> PickSkeleton()
                }
            },
            footnote = if ((choices?.hidden ?: 0) > 0) L10n.Card.ResonatePicker.hiddenNote else null,
        )
        failure?.let { BasicText(it, style = AppFonts.body(13f, lineHeight = 1.5f, color = Mixes.Danger)) }
        ModalActions {
            // The modal is the frame: cancel is plain text, the verb a solid fill.
            OrganicButton(L10n.Card.ResonatePicker.cancel, variant = ButtonVariant.Text, small = true, enabled = !busy, onClick = onDismiss)
            OrganicButton(
                L10n.Card.ResonatePicker.confirm, variant = ButtonVariant.Solid, small = true, icon = IconName.Wave,
                enabled = selected != null, busy = busy,
            ) {
                val card = selected ?: return@OrganicButton
                if (busy) return@OrganicButton
                busy = true
                failure = null
                scope.launch {
                    try {
                        session.writing.resonate(targetId, card.id)
                        // The page answered, the box's shelves, the thought map: everything that lists who answers whom.
                        session.noteCardChange(Session.CardChange(card.id, targetId))
                        onResonated(card)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: ApiFailure) {
                        failure = if (e.isConflict) L10n.Card.ResonatePicker.alreadyAnswering else L10n.Card.ResonatePicker.failed
                        // What was read may be out of date by now (it answers another, or another of yours answers this one).
                        if (e.isConflict) {
                            selectedId = null
                            reads++
                        }
                    } catch (e: Exception) {
                        failure = L10n.Card.ResonatePicker.failed
                    } finally {
                        busy = false
                    }
                }
            }
        }
    }
}

/**
 * Row 0: write a new card — shaped like a card row so it reads as the first choice, its thumb a blank
 * tile with the pen (a card not written yet), the words, and an arrow; pressed, the words and the
 * arrow take the accent.
 */
@Composable
private fun WriteNewRow(enabled: Boolean, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val accent = if (pressed) Tokens.Terracotta else null
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .fade(if (enabled) 1f else 0.5f)
            .padding(vertical = 10.dp, horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(48.dp).drawWithCache {
                val o = WriteTile.createOutline(size, layoutDirection, this)
                val pen = Stroke(Tokens.InkLight.toPx())
                onDrawBehind {
                    drawOutline(o, Tokens.Terracotta.copy(alpha = 0.1f))
                    drawOutline(o, Tokens.Terracotta.copy(alpha = 0.7f), style = pen)
                }
            },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Pen, size = 22.dp, color = Tokens.Terracotta) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(L10n.Card.ResonatePicker.writeNew, style = AppFonts.body(15f, 600, lineHeight = 1.3f, color = accent ?: Tokens.Text))
            BasicText(L10n.Card.ResonatePicker.writeNewHint, style = AppFonts.body(13f, lineHeight = 1.45f, color = Tokens.TextMuted))
        }
        OrganicIcon(IconName.ArrowRight, Modifier.offset(x = if (pressed) 2.dp else 0.dp), size = 18.dp, color = accent ?: Tokens.TextMuted)
    }
}

/** The write-new tile's outline: R 14, seed 29, a 1.6 swing, two turns a side (the web's). */
private val WriteTile = WobRectShape(
    14.0, 29.0, mag = 1.6,
    options = WobRectOptions(curve = 1.2, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(2.0)),
)

/** The rows' footprint while the shelf is read: plain shimmering blocks, nothing measured. */
@Composable
private fun PickSkeleton() {
    Column(Modifier.padding(start = 6.dp, end = 6.dp, top = 10.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        repeat(3) { i ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Skeleton(Modifier.size(48.dp), height = 48.dp, radius = 14.dp)
                Skeleton(Modifier.fillMaxWidth(0.62f - i * 0.12f), height = 14.dp)
            }
        }
    }
}
