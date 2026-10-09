package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.seedFromString
import com.resonance.kit.chat.LinkPreview

/**
 * A link standing alone in a story, drawn as what its page says about itself (StoryLinkCard.tsx):
 * the server's preview — the page's picture when it has one (a picture that won't load takes its
 * frame with it), its title, a line or two of description and the host — the story-column sibling
 * of a message's link preview, in the chat card bubble's language: a block of light fill
 * ([Tokens.BubbleTheirs]) in a seeded wobbly outline, with no pen line around it. At most 520 wide.
 *
 * The picture runs across the card's top edge to edge, cut by the card's own outline (the same
 * seeded path as its fill and its press wash), so the card has one edge, not a frame around a
 * framed picture; its foot meets the words directly. Without a picture: just the fill with the
 * words. Upright wherever it stands (a story's quote slants its words, not the card quoted in it).
 *
 * The whole card is one press: [onOpen] takes it to the link's own safe way out (the in-app
 * browser, asking first where the address isn't what it seems). The host is the real one in ASCII
 * (punycode for an international name), whatever the page called itself; [label] is what a screen
 * reader says it does ("Open link: example.com").
 */
@Composable
fun StoryLinkCard(preview: LinkPreview, host: String, label: String, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val seed = remember(preview.url) { seedFromString(preview.url).toDouble() }
    val shape = remember(seed) { WobRectShape(StoryLinkCardLook.RADIUS, seed) }
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val picture = preview.imageUrl
    // One that failed before is left out at once (FailedPictures), not drawn as a box and dropped again.
    var showsPicture by remember(picture) { mutableStateOf(picture != null && !FailedPictures.shared.has(picture)) }
    Column(
        modifier
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            // The fill, then everything on it — the press wash, the picture, the words — cut by the same outline.
            .drawWithCache {
                val outline = Path().apply { addOutline(shape.createOutline(size, layoutDirection, this@drawWithCache)) }
                onDrawWithContent {
                    drawPath(outline, StoryLinkCardLook.fill)
                    clipPath(outline) { this@onDrawWithContent.drawContent() }
                }
            }
            // The wash spreads from the finger over the fill, under the picture and the words.
            .clickable(source, indication = remember(shape) { OrganicIndication(StoryLinkCardLook.wash, shape = shape) }, role = Role.Button, onClickLabel = label, onClick = onOpen)
            .semantics { contentDescription = label },
    ) {
        if (picture != null && showsPicture) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.91f)
                    // Past the card's top and sides by the outline's widest swing: the outline, not the picture, ends it.
                    .bleedTopAndSides(StoryLinkCardLook.BLEED.dp)
                    .background(Tokens.Text.copy(alpha = 0.06f)),
            ) {
                AsyncImage(
                    model = picture, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
                    onError = {
                        FailedPictures.shared.note(picture)
                        showsPicture = false
                    },
                )
            }
        }
        Column(
            Modifier.padding(start = 18.dp, end = 18.dp, top = if (picture != null && showsPicture) 12.dp else 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            BasicText(preview.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(16f, 600, lineHeight = 1.4f))
            preview.description?.let {
                BasicText(it, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(14f, lineHeight = 1.5f, color = StoryLinkCardLook.muted))
            }
            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OrganicIcon(IconName.Link, size = 15.dp, color = StoryLinkCardLook.muted)
                // The host takes the link's colour while the card is pressed (the web's hover).
                BasicText(
                    host, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = AppFonts.body(13f, lineHeight = 1.3f, color = if (pressed) Tokens.Terracotta else StoryLinkCardLook.muted),
                )
            }
        }
    }
}

/**
 * The card's look (StoryLinkCard.tsx): radius 16, the chat card bubble's fill, its quote's fill as
 * the press wash, how far the picture reaches past the card's box, and the quieter ink of its
 * description and host — the web's `--link-card-muted`, oklch(45% 0.04 70): the page's
 * text-muted (52%) is 4.3:1 on the card's fill, under the 4.5 WCAG AA asks of 13–14px words;
 * this one is 5.8:1.
 */
object StoryLinkCardLook {
    const val RADIUS = 16.0
    const val BLEED = 8f
    val fill get() = Tokens.BubbleTheirs
    val wash get() = Tokens.BubbleQuote
    val muted: Color = OklchColor.parse("oklch(45% 0.04 70)") ?: Tokens.TextMuted
}

/** As tall as its box, but [by] wider on each side and [by] higher, placed so it reaches past the box's top and sides. */
private fun Modifier.bleedTopAndSides(by: Dp): Modifier = layout { measurable, constraints ->
    val extra = by.roundToPx()
    val w = constraints.maxWidth
    val h = constraints.maxHeight.takeIf { it != Constraints.Infinity } ?: constraints.minHeight
    val placeable = measurable.measure(Constraints.fixed(w + 2 * extra, h + extra))
    layout(w, h) { placeable.place(-extra, -extra) }
}
