package com.resonance.app.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.DraftService
import com.resonance.app.Session
import com.resonance.design.Mixes
import com.resonance.design.OrganicIndication
import com.resonance.design.OrganicModal
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * The reader's actions under a story (ReadAfterArea → CardViewerActions): one [SegmentedActionBar]
 * in one row — 共振 the verb (solid): or, once you have answered this card, 已共振 opening your
 * resonance (`onOpenMine`), or 修改 taking a resonance still a draft back to the writer
 * (`onModify`) — then the note and the bookmark (tonal). On a phone the note reads its short
 * words (寄小紙條 / Send a note; its full words stay its accessible name) and the bookmark shows
 * its glyph alone when the row has no room for its words. The twin of iOS's CardViewerActions.
 * 共振 opens the [ResonatePicker]: write a new card in answer (`onWriteNew`), or pick one already
 * written. The note opens the note composer in its modal (`onUpgradeNote`: a long note grown into
 * a resonance, its words carried into the writer). [referenceCardId] is the card this one
 * answers: never offered to answer it back.
 */
@Composable
fun CardViewerActions(
    session: Session,
    cardId: String,
    referenceCardId: String?,
    onWriteNew: () -> Unit,
    onModify: (resonanceId: String) -> Unit,
    onOpenMine: (routeKey: String) -> Unit,
    onUpgradeNote: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Your card answering this one (draft or published): null while looking, NONE when there is none.
    var mine by remember(cardId) { mutableStateOf<DraftService.Resonance?>(null) }
    var writingNote by remember(cardId) { mutableStateOf(false) }
    var picking by remember(cardId) { mutableStateOf(false) }
    // Again after the writer (or the ⋯) changed a card.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    LaunchedEffect(cardId, changes) {
        // Signed out: nothing to find. A failed lookup stays dimmed, as on the web —
        // better than risking a second resonance.
        val drafts = session.drafts
        mine = if (drafts == null) NONE else try {
            drafts.myResonance(cardId) ?: NONE
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    var bookmarked by remember(cardId) { mutableStateOf(false) }
    LaunchedEffect(cardId) { bookmarked = runCatching { session.bookmarks?.isBookmarked(cardId) }.getOrNull() ?: false }
    val resonate = ResonateAction.of(mine?.let { if (it == NONE) ResonateAction.Mine.None else ResonateAction.Mine.Found(it.published) })
    // The full words where the bar stands at its own width; the short ones where it spans a phone's column.
    val phone = LocalConfiguration.current.screenWidthDp < 640
    SegmentedActionBar(
        listOf(
            Segment(
                "resonate", resonate.label, resonate.icon,
                fill = Mixes.ButtonFill, textColor = Tokens.Cream, press = OrganicIndication.OnFill,
            ) {
                val answered = mine
                when {
                    answered == null -> Unit
                    answered == NONE -> picking = true
                    // A published resonance is done: the button says so and opens it.
                    answered.published -> onOpenMine(answered.routeKey)
                    // A draft is still being written: 修改 takes it back to the writer.
                    else -> onModify(answered.id)
                }
            },
            Segment(
                "note", if (phone) L10n.Card.Note.entryShort else L10n.Card.Note.entry, IconName.Note,
                contentDescription = L10n.Card.Note.entry,
            ) { writingNote = true },
            Segment(
                "bookmark", if (bookmarked) L10n.Card.Bookmark.remove else L10n.Card.Bookmark.add, IconName.Bookmark,
                collapsible = true,
                iconFill = if (bookmarked) Mixes.ButtonOnTonal else null,
                iconStroke = if (bookmarked) 2f else 1.6f,
            ) {
                val bookmarks = session.bookmarks ?: return@Segment
                // Optimistic, then reconciled with what the write returns.
                val saving = !bookmarked
                bookmarked = saving
                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                scope.launch {
                    bookmarked = runCatching { bookmarks.toggle(cardId) }.onSuccess { session.noteOwnWrite() }.getOrElse { !saving }
                }
            },
        ),
        modifier.fillMaxWidth(),
        // Wait for the lookup, so a second resonance can't be started by accident (dimmed and inert meanwhile).
        enabled = mine != null,
    )
    if (picking) ResonatePicker(
        session, cardId, referenceCardId,
        onWriteNew = onWriteNew,
        onResonated = { picking = false },
        onDismiss = { picking = false },
    )
    if (writingNote) OrganicModal(
        { writingNote = false }, L10n.Card.Note.label,
        seed = 17.0, closeLabel = L10n.Card.Note.close, maxWidth = 520.dp,
    ) {
        NoteComposer(session, cardId, onClose = { writingNote = false }, onUpgrade = { text ->
            writingNote = false
            // The note's words become the resonance's story (the web drops them; the apps keep them).
            onUpgradeNote(text)
        })
    }
}

/** No resonance of yours answers the card (looked, and found none). */
private val NONE = DraftService.Resonance("", "", published = false)

/**
 * What the verb's segment says and draws, from what you have written in answer: still looking
 * (`null`: 共振, while the bar waits), none (共振 ≋), a draft (修改 ✎), or a published one (已共振 ✓).
 */
internal class ResonateAction private constructor(val label: String, val icon: IconName) {
    sealed interface Mine {
        data object None : Mine
        data class Found(val published: Boolean) : Mine
    }

    companion object {
        fun of(mine: Mine?): ResonateAction = when {
            mine is Mine.Found && mine.published -> ResonateAction(L10n.Card.resonated, IconName.Check)
            mine is Mine.Found -> ResonateAction(L10n.Card.modify, IconName.Pen)
            else -> ResonateAction(L10n.Card.resonate, IconName.Wave)
        }
    }
}
