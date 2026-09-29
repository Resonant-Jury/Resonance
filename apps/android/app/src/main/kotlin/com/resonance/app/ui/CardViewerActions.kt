package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The reader's actions under a story (ReadAfterArea → CardViewerActions, the
 * phone layout): 共振 as the one primary button, then the note as a quiet
 * text link and the bookmark as a bare glyph. The twin of iOS's
 * CardViewerActions; resonating starts a response card, and the note opens
 * the writer until notes land (M4).
 */
@Composable
fun CardViewerActions(session: Session, cardId: String, onResonate: () -> Unit, onNote: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        OrganicButton(L10n.Card.resonate, icon = IconName.Wave, onClick = onResonate)
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The web's secondaryOutline with its frame hidden: a link.
            Row(
                Modifier.heightIn(min = 44.dp).plainClickable(role = Role.Button, onClick = onNote),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                OrganicIcon(IconName.Note, size = 16.dp, color = Tokens.Terracotta)
                BasicText(L10n.Card.Note.entry, style = AppFonts.body(15f, 600, color = Tokens.Terracotta).copy(letterSpacing = 0.02.em))
            }
            Spacer(Modifier.weight(1f))
            BookmarkButton(session, cardId)
        }
    }
}

/** BookmarkButton.tsx: the ribbon alone — muted and outlined when off, filled terracotta when on — and a brief "Saved" after saving. */
@Composable
fun BookmarkButton(session: Session, cardId: String) {
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    var active by remember(cardId) { mutableStateOf(false) }
    var justSaved by remember(cardId) { mutableStateOf(false) }
    LaunchedEffect(cardId) { active = runCatching { session.bookmarks?.isBookmarked(cardId) }.getOrNull() ?: false }
    LaunchedEffect(justSaved) {
        if (justSaved) {
            delay(3000)
            justSaved = false
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        AnimatedVisibility(justSaved && active, enter = fadeIn(), exit = fadeOut()) {
            BasicText(L10n.Card.Bookmark.saved, style = AppFonts.body(13f, color = Tokens.Terracotta))
        }
        OrganicIcon(
            IconName.Bookmark,
            Modifier
                .sizeIn(minWidth = 44.dp, minHeight = 44.dp)
                .semantics {
                    contentDescription = if (active) L10n.Card.Bookmark.remove else L10n.Card.Bookmark.add
                    selected = active
                }
                .plainClickable(role = Role.Button) {
                    val bookmarks = session.bookmarks ?: return@plainClickable
                    // Optimistic, then reconciled with what the write returns.
                    val saving = !active
                    active = saving
                    justSaved = saving
                    haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                    scope.launch { active = runCatching { bookmarks.toggle(cardId) }.getOrElse { !saving } }
                }
                .padding(12.dp),
            size = 20.dp,
            color = if (active) Tokens.Terracotta else Tokens.TextMuted,
            strokeWidth = if (active) 2f else 1.6f,
            fill = if (active) Tokens.Terracotta else null,
        )
    }
}
