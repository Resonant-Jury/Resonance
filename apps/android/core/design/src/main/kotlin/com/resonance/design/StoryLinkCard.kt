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
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.seedFromString
import com.resonance.kit.chat.LinkPreview

/**
 * A link standing alone in a story, drawn as what its page says about itself (StoryLinkCard.tsx):
 * the server's preview — the page's picture when it has one (a picture that won't load takes its
 * frame with it), its title, a line or two of description and the host — the story-column
 * sibling of a message's link preview, in the lightly inked hand-drawn card of an embedded
 * story card. At most 520 wide.
 *
 * The whole card is one press: [onOpen] takes it to the link's own safe way out (the in-app
 * browser, asking first where the address isn't what it seems). The host is the real one in ASCII
 * (punycode for an international name), whatever the page called itself; [label] is what a screen
 * reader says it does ("Open link: example.com").
 */
@Composable
fun StoryLinkCard(preview: LinkPreview, host: String, label: String, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val seed = remember(preview.url) { seedFromString(preview.url).toDouble() }
    val shape = remember(seed) { WobRectShape(16.0, seed) }
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    var pictureFailed by remember(preview.imageUrl) { mutableStateOf(false) }
    Column(
        modifier
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                onDrawBehind { drawOutline(o, Tokens.CardBg) }
            }
            // The wash spreads from the finger over the paper, under the words and the pen line.
            .clickable(source, indication = remember(shape) { OrganicIndication(Tokens.CreamDark, shape = shape) }, role = Role.Button, onClickLabel = label, onClick = onOpen)
            .drawWithCache {
                val o = shape.createOutline(size, layoutDirection, this)
                val pen = Stroke(Tokens.InkLight.toPx())
                onDrawWithContent {
                    drawContent()
                    drawOutline(o, if (pressed) Tokens.FieldBorderHover else Tokens.FieldBorder, style = pen)
                }
            }
            .semantics { contentDescription = label }
            .padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val picture = preview.imageUrl
        if (picture != null && !pictureFailed) {
            OrganicImage(picture, seed + 3, Modifier.fillMaxWidth().aspectRatio(1.91f), radius = 12.0, onError = { pictureFailed = true }) {
                Box(Modifier.fillMaxSize().background(Tokens.CreamDark))
            }
        }
        Column(Modifier.padding(start = 8.dp, end = 8.dp, top = 2.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText(preview.title, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(16f, 600, lineHeight = 1.4f))
            preview.description?.let {
                BasicText(it, maxLines = 2, overflow = TextOverflow.Ellipsis, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted))
            }
            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OrganicIcon(IconName.Link, size = 15.dp, color = Tokens.TextMuted)
                // The host takes the link's colour while the card is pressed (the web's hover).
                BasicText(
                    host, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = AppFonts.body(13f, lineHeight = 1.3f, color = if (pressed) Tokens.Terracotta else Tokens.TextMuted),
                )
            }
        }
    }
}
