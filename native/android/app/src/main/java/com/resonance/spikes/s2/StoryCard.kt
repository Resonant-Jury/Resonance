package com.resonance.spikes.s2

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.spikes.design.AppFonts
import com.resonance.spikes.design.Grain
import com.resonance.spikes.design.GrainMode
import com.resonance.spikes.design.HandDrawnAvatar
import com.resonance.spikes.design.TagPill
import com.resonance.spikes.design.WavyDivider
import com.resonance.spikes.design.WobRectShape
import com.resonance.spikes.design.organicSurface
import com.resonance.spikes.generated.Tokens

data class SampleStory(val id: Int, val title: String, val excerpt: String, val author: String, val tags: List<String>, val hue: Int) {
    companion object {
        private val templates = listOf(
            listOf("一場雨後的散步", "雨停的時候，巷口的積水映出整排路燈。我突然想起小時候，也是這樣踩著水窪回家。", "bob", "日常,散步"),
            listOf("第一杯自己沖的咖啡", "水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。", "bob", "日常,咖啡"),
            listOf("寫給十年前的自己", "你以為的失敗，後來都變成了轉彎的地方。Keep going — the detour is the road.", "alice", "成長"),
            listOf("陌生人的一句話", "在車站有人對我說辛苦了，那天就被接住了。", "carol", "溫柔,城市"),
            listOf("The quiet after moving out", "Boxes everywhere, and for the first time the silence felt like mine.", "dana", "home,change"),
            listOf("外婆的手寫食譜", "她的字歪歪斜斜，份量寫著「一點點」，我照著做了三次才做出那個味道。", "erin", "家人,料理"),
        )
        val all: List<SampleStory> = (0 until 60).map { i ->
            val t = templates[i % templates.size]
            SampleStory(i, t[0], t[1], t[2], t[3].split(","), i % 6)
        }
    }
}

/**
 * Native StoryCard (src/components/molecules/StoryCard): pastel organic
 * surface with grain + ink outline, organic image, tags, Playfair title,
 * DM Sans excerpt, wavy divider, avatar byline.
 */
@Composable
fun StoryCardView(story: SampleStory, grain: GrainMode = GrainMode.Tile, clipImage: Boolean = true, modifier: Modifier = Modifier) {
    val fill = Tokens.CardFills[story.hue]
    val border = Tokens.CardBorders[story.hue]
    val seed = (story.id * 17 + 3).toDouble()
    Column(
        modifier
            .fillMaxWidth()
            .organicSurface(fill.copy(alpha = 0.55f), border, radius = 22.0, seed = seed, grain = grain)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StoryImagePlaceholder(story.title, fill, seed + 11, clipImage, grain)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            story.tags.forEachIndexed { i, tag -> TagPill(tag, fill, border, seed + i * 5) }
        }
        BasicText(story.title, style = AppFonts.heading(18f, lineHeight = 1.3f))
        BasicText(
            story.excerpt,
            style = AppFonts.body(14f, lineHeight = 1.65f, color = Tokens.TextMuted),
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        WavyDivider(border.copy(alpha = 0.5f), seed + 17)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HandDrawnAvatar(story.author.take(2).uppercase(), fill, 30.dp, seed + 29)
            Column(Modifier.weight(1f)) {
                BasicText(story.author, style = AppFonts.body(13f, 600, lineHeight = 1.3f))
                BasicText("3 min", style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted))
            }
            BasicText("→", style = AppFonts.body(13f, color = Tokens.TextMuted))
        }
    }
}

/** The web's striped image placeholder, clipped to a wobbly rectangle, with GrainOverlay on top. */
@Composable
fun StoryImagePlaceholder(label: String, fill: androidx.compose.ui.graphics.Color, seed: Double, clip: Boolean, grain: GrainMode) {
    val shape = if (clip) WobRectShape(16.0, seed) else RoundedCornerShape(16.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .height(170.dp)
            .clip(shape)
            .drawWithCache {
                val hatch = Tokens.Text.copy(alpha = 0.08f)
                val ink = Tokens.InkLight.toPx()
                // GrainOverlay opacity 0.055: black ink, alpha = 1 − noise luminance
                // (mean ½), drawn at 2 × opacity so the mean darkening is 5.5%.
                val overlay = Grain.brush(grain, "grain-overlay", size, density, 0.11f)
                val overlayAlpha = if (grain == GrainMode.Tile) 0.11f else 1f
                onDrawWithContent {
                    drawRect(fill)
                    for (i in 0 until 22) {
                        val x = i * size.width / 14 - size.width / 2
                        drawLine(hatch, Offset(x, 0f), Offset(x + size.width, size.height), ink)
                    }
                    drawContent()
                    overlay?.let { drawRect(it, alpha = overlayAlpha) }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        BasicText(label, style = AppFonts.body(10.5f, color = Tokens.Text.copy(alpha = 0.42f)))
    }
}
