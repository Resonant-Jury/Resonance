package com.resonance.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.ModalActions
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicImage
import com.resonance.design.WavyDivider
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException

/**
 * InsertCardModal: one of your public cards — dropped into a story as an
 * embedded card, or shared in a conversation. Rows carry a small cover (the
 * card's hue when it has none) and the title on two lines. The host wraps it
 * in an OrganicModal (seed 53, max width 480). The twin of iOS's CardPickerContent.
 */
@Composable
fun CardPickerContent(session: Session, title: String, subtitle: String, onPick: (FeedCard) -> Unit, onCancel: () -> Unit) {
    var cards by remember { mutableStateOf<List<FeedCard>?>(null) }
    // getCardsByAuthor(me, 'published'), public ones only.
    LaunchedEffect(Unit) {
        cards = try {
            session.reading.cardBox(TabGetCardBox.published).filter { it.visibility == FeedCard.Visibility.`public` && it.publishedAt != null }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emptyList()
        }
    }
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.padding(bottom = 4.dp)) { ModalTitle(title) }
        BasicText(subtitle, style = AppFonts.body(14f, lineHeight = 1.3f, color = Tokens.TextMuted), modifier = Modifier.padding(bottom = 12.dp))
        val list = cards
        if (list == null) {
            BasicText("…", style = AppFonts.body(14f, lineHeight = 1.3f, color = Tokens.TextMuted), modifier = Modifier.padding(vertical = 12.dp))
        } else if (list.isEmpty()) {
            BasicText(
                L10n.Write.Editor.CardModal.empty,
                style = AppFonts.body(14f, lineHeight = 1.3f, color = Tokens.TextMuted),
                modifier = Modifier.padding(vertical = 12.dp),
            )
        } else {
            Column(Modifier.heightIn(max = (LocalConfiguration.current.screenHeightDp * 0.5f).dp).verticalScroll(rememberScrollState())) {
                list.forEachIndexed { i, card ->
                    if (i > 0) WavyDivider(seed = (67 + i * 31).toDouble())
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .plainClickable(role = Role.Button) { onPick(card) }
                            .padding(vertical = 10.dp, horizontal = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val cover = OklchColor.parse("oklch(90% 0.06 ${card.accentHue ?: 55.0})") ?: Tokens.TerracottaLight
                        OrganicImage(card.imageUrl, (i * 7 + 3).toDouble(), Modifier.size(48.dp)) { Box(Modifier.fillMaxSize().background(cover)) }
                        BasicText(
                            card.title, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            style = AppFonts.body(15f, 600, lineHeight = 1.3f),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
        // iOS's picker sets the actions straight under the list (its rows carry their own 10).
        ModalActions(topPadding = 0.dp) { OrganicButton(L10n.Write.Editor.CardModal.cancel, variant = ButtonVariant.Ghost, small = true, onClick = onCancel) }
    }
}
