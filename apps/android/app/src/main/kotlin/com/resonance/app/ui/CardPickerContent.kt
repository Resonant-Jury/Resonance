package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import com.resonance.design.Grain
import com.resonance.design.GrainMode
import com.resonance.design.Mixes
import com.resonance.design.WobRectShape
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicIcon
import com.resonance.design.fade
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * InsertCardModal: one of your public cards — dropped into a story as an
 * embedded card, or shared in a conversation. Rows carry a small cover (the
 * card's hue when it has none), the title on one line and when it came out
 * ([CardPickList]); a tap is the pick. The host wraps it in an OrganicModal (seed 53, max width
 * 480). The twin of iOS's CardPickerContent.
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
        } else {
            CardPickList(list, onPick, empty = { PickNote(L10n.Write.Editor.CardModal.empty) })
        }
        // A list to pick from, its one way out centred under it (its rows carry their own 10).
        ModalCloseButton(L10n.Write.Editor.CardModal.cancel, onCancel)
    }
}

/**
 * The author's own cards as a scrollable pick list (CardPickList.tsx), quiet enough to scan: on each
 * row a 40 cover thumb ([PickThumb]), the title on one line, and one muted line under it — when it
 * came out, led by 匿名 for an anonymous card ([pickMeta]) — rows parted by their own air, no rules
 * between them and no boxed press region; the ink speaks through the title. [lead] comes before the cards and scrolls with them
 * (the resonate picker's "write a new card" row). With [choosing] the rows are one choice (radio
 * buttons): the row of [selectedId] is marked — its thumb washed in the accent with the buttons'
 * grain and a tick, its title in the deep accent — so the pick reads before it is confirmed; without, a tap is the pick.
 * While not [enabled] (a request on its way) the rows rest, the chosen one as it was.
 */
@Composable
internal fun CardPickList(
    cards: List<FeedCard>,
    onPick: (FeedCard) -> Unit,
    lead: (@Composable () -> Unit)? = null,
    choosing: Boolean = false,
    selectedId: String? = null,
    enabled: Boolean = true,
    /** Leads an anonymous card's meta line (「匿名 · 9月28日」); without it nothing marks one. */
    anonymousLabel: String? = null,
    /** Drawn in place of the rows when there are none. */
    empty: (@Composable () -> Unit)? = null,
    /** A quiet line under the rows (why some cards are not listed). */
    footnote: String? = null,
) {
    Column(Modifier.heightIn(max = (LocalConfiguration.current.screenHeightDp * 0.5f).dp).verticalScroll(rememberScrollState())) {
        lead?.invoke()
        if (cards.isEmpty() && empty != null) {
            empty()
        } else {
            Column(if (choosing) Modifier.selectableGroup() else Modifier) {
                // One wavy rule between groups (the lead's, above), none between the rows: their air parts them.
                cards.forEachIndexed { i, card ->
                    CardPickRow(card, i, choosing, chosen = choosing && card.id == selectedId, enabled, anonymousLabel) { onPick(card) }
                }
            }
        }
        footnote?.let {
            BasicText(
                it, style = AppFonts.body(12.5f, lineHeight = 1.55f, color = Tokens.TextMuted),
                modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 10.dp, bottom = 2.dp),
            )
        }
    }
}

@Composable
private fun CardPickRow(card: FeedCard, index: Int, choosing: Boolean, chosen: Boolean, enabled: Boolean, anonymousLabel: String?, onClick: () -> Unit) {
    val press = if (choosing) Modifier.selectable(chosen, enabled = enabled, role = Role.RadioButton, interactionSource = null, indication = null, onClick = onClick)
    else Modifier.plainClickable(role = Role.Button, onClick = onClick)
    Row(
        Modifier
            .fillMaxWidth()
            .then(press)
            // A request on its way: the rows rest, the chosen one stays as it was.
            .fade(if (enabled || chosen) 1f else 0.5f)
            .padding(vertical = 10.dp, horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PickThumb(card.imageUrl, card.accentHue ?: 55.0, (index * 7 + 3).toDouble(), chosen)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            BasicText(
                card.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                // Chosen: the tonal buttons' deep terracotta (plain terracotta is 3.3:1 on the modal's paper).
                style = AppFonts.body(15f, 600, lineHeight = 1.3f, color = if (chosen) Mixes.ButtonOnTonal else Tokens.Text),
            )
            pickMeta(card.anonymous, card.publishedAt, anonymousLabel)?.let {
                BasicText(it, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(13f, lineHeight = 1.4f, color = Tokens.TextMuted))
            }
        }
    }
}

/**
 * A pick row's 40 cover (design note §6): HandDrawnAvatar's lopsided square at a smaller radius
 * (R 10, one turn a side), the picture cover-fitted in it — the card's hue when it has none — and
 * an avatar photo's faint rim. Chosen, it is washed in terracotta with the buttons' grain and a
 * cream tick, all inside the same outline.
 */
@Composable
private fun PickThumb(url: String?, hue: Double, seed: Double, chosen: Boolean) {
    val shape = remember(seed) {
        WobRectShape(
            10.0, seed, mag = 0.88,
            options = WobRectOptions(curve = 1.3, cornerJitter = 3.2, cornerOffset = 2.4, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0)),
        )
    }
    val cover = OklchColor.parse("oklch(90% 0.06 $hue)") ?: Tokens.TerracottaLight
    Box(
        Modifier
            .size(40.dp)
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val rim = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                onDrawWithContent {
                    drawOutline(o, cover)
                    drawContent()
                    drawOutline(o, Mixes.AvatarRim, style = rim)
                }
            },
    ) {
        if (url != null) AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(shape))
        // The chosen row's mark, fading in and out over the cover.
        AnimatedVisibility(chosen, enter = fadeIn(tween(180)), exit = fadeOut(tween(120))) {
            Box(
                Modifier.fillMaxSize().drawWithCache {
                    val o = shape.createOutline(size, layoutDirection, this)
                    val grain = Grain.brush(GrainMode.Tile, "grain-button", size, density, 0.38f)
                    onDrawBehind {
                        drawOutline(o, Tokens.Terracotta.copy(alpha = 0.82f))
                        grain?.let { drawOutline(o, it, alpha = 0.38f) }
                    }
                },
                contentAlignment = Alignment.Center,
            ) { OrganicIcon(IconName.Check, size = 20.dp, color = Tokens.Cream) }
        }
    }
}

/**
 * A pick row's muted line: when the card came out ([pickDate]), led by [anonymousLabel] for an
 * anonymous card (「匿名 · 9月28日」/ "Anonymous · Sep 28"); null when there is nothing to say.
 */
internal fun pickMeta(anonymous: Boolean, publishedAt: String?, anonymousLabel: String?, today: LocalDate = LocalDate.now()): String? =
    listOfNotNull(anonymousLabel?.takeIf { anonymous }, pickDate(publishedAt, today)).joinToString(" · ").ifEmpty { null }

/**
 * When a card came out, for its row (CardPickList.tsx's pickDate): the month and day this year,
 * with the year before that (「9月28日」/ "Sep 28", 「2025年9月28日」/ "Sep 28, 2025"), in the
 * reader's time zone.
 */
internal fun pickDate(iso: String?, today: LocalDate = LocalDate.now()): String? = iso?.let {
    runCatching {
        val day = OffsetDateTime.parse(it).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate()
        val zh = Strings.language == Strings.Language.ZhTW
        val pattern = when {
            day.year == today.year -> if (zh) "M月d日" else "MMM d"
            else -> if (zh) "y年M月d日" else "MMM d, y"
        }
        day.format(DateTimeFormatter.ofPattern(pattern, Strings.language.locale))
    }.getOrNull()
}

/** A quiet line where the rows would be (none to pick). */
@Composable
internal fun PickNote(text: String) {
    BasicText(text, style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted), modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 10.dp, bottom = 4.dp))
}
