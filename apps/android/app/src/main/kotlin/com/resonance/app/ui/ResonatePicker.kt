package com.resonance.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.sp
import com.resonance.design.linkWaveY
import com.resonance.design.toPath
import com.resonance.geometry.penWave
import com.resonance.geometry.seedFromString
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.Mixes
import com.resonance.design.ModalActions
import com.resonance.design.ModalError
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicModal
import com.resonance.design.Skeleton
import com.resonance.design.WavyDivider
import com.resonance.design.fade
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Which of the viewer's published cards may resonate with a card (the web's `resonateChoices`): the
 * public ones not answering a card already — a card answers one card — never the card itself nor
 * the card it answers (that would answer its own answer). [hidden] counts the public cards left out
 * for answering another card, so the picker can say why they are missing; [open] all the public
 * cards there are to choose from, left out or not — none at all is when the viewer has "no public
 * cards yet".
 */
internal data class ResonateChoices(val cards: List<FeedCard>, val hidden: Int, val open: Int) {
    /** What stands where the rows would be, there being none to offer. */
    enum class Empty {
        /** No public card at all: "no public cards yet — write your first one above". */
        NoPublicCards,
        /** Every public card answers another card: why none is listed, once, in the rows' place. */
        AllAnswerAnother,
        /**
         * The only ones are the card this one answers (or answer this one already): nothing — no
         * heading over an empty list either; writing a new card is the way.
         */
        Nothing,
    }

    /** Null while there are rows to offer. Public cards there are, only none may answer this one: never "no public cards yet". */
    val empty: Empty?
        get() = when {
            cards.isNotEmpty() -> null
            open == 0 -> Empty.NoPublicCards
            hidden > 0 -> Empty.AllAnswerAnother
            else -> Empty.Nothing
        }

    /** The quiet line under the rows saying why some aren't listed — under rows only: with none, it stands in their place ([empty]). */
    val footnote: Boolean get() = cards.isNotEmpty() && hidden > 0

    /** Whether the list shows at all — the rule under "write a new card", and the rows or what stands for them. */
    val listed: Boolean get() = empty != Empty.Nothing

    companion object {
        fun of(cards: List<FeedCard>, targetId: String, targetReferenceId: String?): ResonateChoices {
            val open = cards.filter { it.visibility == FeedCard.Visibility.`public` && it.publishedAt != null && it.id != targetId }
            return ResonateChoices(
                cards = open.filter { it.referenceCardId == null && it.id != targetReferenceId },
                hidden = open.count { it.referenceCardId != null && it.referenceCardId != targetId },
                open = open.size,
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
        // The title alone: the two ways below say what they are.
        ModalTitle(L10n.Card.ResonatePicker.title)
        CardPickList(
            choices?.cards.orEmpty(),
            onPick = { card ->
                if (!busy) {
                    failure = null
                    // The marked card again lets it go: nothing marked, nothing to send.
                    selectedId = if (selectedId == card.id) null else card.id
                }
            },
            lead = {
                WriteNewRow(enabled = !busy) {
                    onDismiss()
                    onWriteNew()
                }
                // Nothing of theirs to pick, and nothing to say about it: no rule over an empty list.
                if (choices?.listed != false) WavyDivider(seed = 59.0, modifier = Modifier.padding(vertical = 8.dp))
            },
            choosing = true,
            selectedId = selectedId,
            enabled = !busy,
            anonymousLabel = L10n.Card.ResonatePicker.anonymous,
            empty = {
                when {
                    // Public cards there are, only none may answer this one: never "no public cards yet". Why they
                    // are missing, when it is that they answer another card; else the first row is the way.
                    choices != null -> when (choices.empty) {
                        ResonateChoices.Empty.NoPublicCards -> PickNote(L10n.Card.ResonatePicker.empty)
                        ResonateChoices.Empty.AllAnswerAnother -> PickNote(L10n.Card.ResonatePicker.hiddenNote)
                        ResonateChoices.Empty.Nothing, null -> {}
                    }
                    readFailed -> Row(
                        Modifier.padding(start = 6.dp, top = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        BasicText(L10n.Native.loadError, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted), modifier = Modifier.weight(1f, fill = false))
                        OrganicButton(L10n.Native.retry, variant = ButtonVariant.Tonal, small = true) { reads++ }
                    }
                    else -> PickSkeleton()
                }
            },
            footnote = if (choices?.footnote == true) L10n.Card.ResonatePicker.hiddenNote else null,
        )
        failure?.let { ModalError(it) }
        // The modal is the frame: cancel the tonal pill, the verb solid and rightmost; while the choice is
        // on its way both rest, cancel visibly out of reach.
        ModalActions(
            L10n.Card.ResonatePicker.cancel, onDismiss, L10n.Card.ResonatePicker.confirm,
            busy = busy, verbEnabled = selected != null, verbIcon = IconName.Wave,
            onVerb = {
                val card = selected
                if (card != null && !busy) {
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
            },
        )
    }
}

/**
 * Row 0: write a new card — one line, a way rather than a card: the pen in terracotta and the
 * words in the deep terracotta (6:1 on the modal's paper; plain terracotta is 3.5:1), at least 48
 * tall; pressed, the words darken over the story links' pen wave (the ink answers, as the rows' does).
 */
@Composable
private fun WriteNewRow(enabled: Boolean, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .fade(if (enabled) 1f else 0.5f)
            .padding(vertical = 10.dp, horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OrganicIcon(IconName.Pen, size = 18.dp, color = Tokens.Terracotta)
        var baseline by remember { mutableFloatStateOf(Float.NaN) }
        BasicText(
            L10n.Card.ResonatePicker.writeNew,
            style = AppFonts.body(15f, 600, lineHeight = 1.3f, color = if (pressed) WriteNewPressed else Mixes.ButtonOnTonal),
            onTextLayout = { baseline = it.firstBaseline },
            modifier = Modifier.drawWithCache {
                val wave = penWave((size.width / density).toDouble(), seedFromString("write-new").toDouble()).toPath(density)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    if (pressed && !baseline.isNaN()) translate(top = linkWaveY(baseline, 15.sp.toPx())) { drawPath(wave, Tokens.Terracotta, style = pen) }
                }
            },
        )
    }
}

/** The words pressed: color-mix(terracotta, black 34%). */
private val WriteNewPressed = OklchColor.parse("oklch(40.92% 0.0924 45)") ?: Tokens.TerracottaInk

/** The rows' footprint while the shelf is read: plain shimmering blocks, nothing measured — a 40 thumb, a title bar and a meta bar. */
@Composable
private fun PickSkeleton() {
    Column(Modifier.padding(start = 6.dp, end = 6.dp, top = 10.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        repeat(3) { i ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Skeleton(Modifier.size(40.dp), height = 40.dp, radius = 12.dp)
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Skeleton(Modifier.fillMaxWidth(0.7f - i * 0.12f), height = 14.dp)
                    Skeleton(Modifier.width(64.dp), height = 11.dp)
                }
            }
        }
    }
}
