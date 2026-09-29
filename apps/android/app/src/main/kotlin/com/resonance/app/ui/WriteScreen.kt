package com.resonance.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicInlineBar
import com.resonance.design.cream
import com.resonance.kit.l10n.L10n

/** Writing a card — the twin of iOS's WriteScreen; the editor island, drafts and publishing land in A3. */
@Composable
fun WriteScreen(close: () -> Unit) {
    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, close)
        BasicText(L10n.App.Nav.write, style = AppFonts.heading(28f, lineHeight = 1.2f), modifier = Modifier.padding(20.dp).semantics { heading() })
        OrganicEmptyState(L10n.Me.emptyPublished)
    }
}
