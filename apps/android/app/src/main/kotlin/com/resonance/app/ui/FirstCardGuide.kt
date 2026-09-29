package com.resonance.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.CssText
import com.resonance.design.OrganicIcon
import com.resonance.design.WavyDivider
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n

/**
 * The guided first-card moment (FirstCardGuide.tsx, ux §5): above the editor
 * only while the writer has no cards at all. Three guiding questions in a
 * soft panel; picking one drops it into the story as a quote to write
 * against, and the guide steps aside. The twin of iOS's FirstCardGuide.
 */
@Composable
fun FirstCardGuide(onPick: (String) -> Unit) {
    val questions = listOf(L10n.Write.FirstCard.q1, L10n.Write.FirstCard.q2, L10n.Write.FirstCard.q3)
    Column(
        Modifier
            .fillMaxWidth()
            // border-radius: 20px 24px 18px 22px on cream-dark at half strength.
            .background(Tokens.CreamDark.copy(alpha = 0.5f), RoundedCornerShape(topStart = 20.dp, topEnd = 24.dp, bottomEnd = 18.dp, bottomStart = 22.dp))
            .padding(18.dp),
    ) {
        // Panel's title: the pen, then the heading at 17 bold.
        Row(
            Modifier.padding(bottom = 8.dp).semantics(mergeDescendants = true) { heading() },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OrganicIcon(IconName.Pen, size = 16.dp, color = Tokens.Terracotta)
            CssText(L10n.Write.FirstCard.title, AppFonts.Family.Heading, 17f, 700, lineHeight = 1.3f, modifier = Modifier.weight(1f))
        }
        CssText(L10n.Write.FirstCard.intro, AppFonts.Family.Body, 14f, lineHeight = 1.7f, color = Tokens.TextMuted)
        questions.forEachIndexed { i, question ->
            WavyDivider(seed = (19 + i * 7).toDouble(), modifier = Modifier.padding(vertical = 2.dp))
            GuideQuestion(question) { onPick(question) }
        }
    }
}

/**
 * One question: the ✎ and the line share a 1.6 line box, so they sit on one
 * baseline (align-items: baseline); it turns terracotta while pressed (the
 * web's hover / focus).
 */
@Composable
private fun GuideQuestion(text: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(source, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 2.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // In its own 1.6 line box, centred as CSS centres the glyph's content area.
        Box(Modifier.height((15 * 1.6f).dp).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
            BasicText("✎", style = AppFonts.style(AppFonts.Family.Heading, 15f, 700, 1.6f, Tokens.Terracotta))
        }
        CssText(text, AppFonts.Family.Body, 15f, lineHeight = 1.6f, color = if (pressed) Tokens.Terracotta else Tokens.Text, modifier = Modifier.weight(1f))
    }
}
