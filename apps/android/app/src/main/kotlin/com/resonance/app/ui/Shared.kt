package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.design.AppFonts
import com.resonance.design.BrandBarHeight
import com.resonance.design.CssText
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.MiniStoryCard
import com.resonance.design.OklchColor
import com.resonance.design.OrganicBrandBar
import com.resonance.design.OrganicPageTitle
import com.resonance.design.StoryCard
import com.resonance.design.StoryCardContent
import com.resonance.design.cream
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * StoryCard's fields (lib/adapters/story.ts cardToStory); anonymous cards get
 * the dot byline. The recommender's reason is left out on purpose: the web
 * never explains a pick (home/page.tsx), so the card's margin-note slot stays
 * empty everywhere.
 */
fun FeedCard.story(): StoryCardContent {
    val a = author
    return StoryCardContent(
        id = id,
        title = title,
        excerpt = excerpt,
        authorName = a?.handle ?: L10n.Card.anonymousAuthor,
        authorInitials = a?.initials ?: "·",
        authorImageUrl = a?.avatarUrl,
        avatarSeed = a?.avatarSeedValue() ?: ((id.firstOrNull()?.code ?: 7) * 31).toDouble(),
        readTime = "$readMinutes min",
        tags = tags,
        imageUrl = imageUrl,
        imageLabel = imageLabel ?: title.take(24),
        accentHue = accentHue,
        reason = null,
        authorAccent = a?.let { OklchColor.parse(it.accentColor) },
    )
}

/** Where the card lives on the site (its slug, or its id before it had one). */
val FeedCard.routeKey: String get() = slug ?: id

fun Author.avatarSeedValue(): Double = avatarSeed?.toDoubleOrNull() ?: ((initials.firstOrNull()?.code ?: 7) * 13).toDouble()
fun Author.accent() = OklchColor.parse(accentColor) ?: Tokens.TerracottaLight

/** "Sep 28" / "9月28日" in the interface language. */
fun shortDate(iso: String?): String? = iso?.let {
    runCatching { OffsetDateTime.parse(it).format(DateTimeFormatter.ofPattern(if (Strings.language == Strings.Language.ZhTW) "M月d日" else "MMM d", Strings.language.locale)) }.getOrNull()
}

fun mediumDate(iso: String?): String? = iso?.let {
    runCatching { OffsetDateTime.parse(it).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Strings.language.locale)) }.getOrNull()
}

/** Cards as the web lists them on a phone: full-bleed bands, each opening its page (a plain link — no press chrome). */
fun LazyListScope.storyCards(cards: List<FeedCard>, open: (Route) -> Unit, onLast: (() -> Unit)? = null) {
    itemsIndexed(cards, key = { _, c -> c.id }) { i, card ->
        StoryCard(card.story(), i, i == cards.lastIndex, Modifier.plainClickable { open(Route.Card(card.routeKey)) })
        if (i == cards.lastIndex) onLast?.invoke()
    }
}

/** MiniCardGrid on a phone: the resonance and linked-cards lists, as pared-back bands. */
fun LazyListScope.miniCards(cards: List<FeedCard>, open: (Route) -> Unit, keyPrefix: String) {
    itemsIndexed(cards, key = { _, c -> "$keyPrefix${c.id}" }) { i, card ->
        MiniStoryCard(card.story(), i, i == cards.lastIndex, Modifier.plainClickable { open(Route.Card(card.routeKey)) })
    }
}

/** Past the web header's 20px scroll threshold, when its pen line inks in fully. */
@Composable
fun LazyListState.scrolledPast20(): Boolean {
    val threshold = with(LocalDensity.current) { 20.dp.toPx() }
    val scrolled by remember(this, threshold) { derivedStateOf { firstVisibleItemIndex > 0 || firstVisibleItemScrollOffset > threshold } }
    return scrolled
}

/**
 * A tab's root, as a phone shows the web's app pages: the pinned brand bar
 * (content scrolls under it and ends on its wavy line), the page title and
 * its lede, then the list, with room for the floating tab bar.
 */
@Composable
fun TabScreen(title: String, subtitle: String? = null, trailing: @Composable () -> Unit = {}, content: LazyListScope.() -> Unit) {
    val list = rememberLazyListState()
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + BrandBarHeight + HeaderEdgeHeight
    Box(Modifier.fillMaxSize().cream()) {
        LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(top = top, bottom = 120.dp)) {
            item {
                // The web's page padding: 40 under the header, the title block 40 above the content (home's header).
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 40.dp, bottom = if (subtitle != null) 40.dp else 28.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OrganicPageTitle(title) { trailing() }
                    if (subtitle != null) CssText(subtitle, AppFonts.Family.Body, 15f, lineHeight = 1.6f, color = Tokens.TextMuted)
                }
            }
            content()
        }
        OrganicBrandBar(list.scrolledPast20())
    }
}
