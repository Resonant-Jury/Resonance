package com.resonance.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.design.OklchColor
import com.resonance.design.OrganicLargeHeader
import com.resonance.design.StoryCard
import com.resonance.design.StoryCardContent
import com.resonance.design.cream
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** StoryCard's fields (lib/adapters/story.ts cardToStory); anonymous cards get the dot byline. */
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
        reason = reason,
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

/** Cards as the web lists them on a phone: full-bleed bands, each opening its page. */
fun LazyListScope.storyCards(cards: List<FeedCard>, open: (Route) -> Unit, onLast: (() -> Unit)? = null) {
    itemsIndexed(cards, key = { _, c -> c.id }) { i, card ->
        StoryCard(card.story(), i, i == cards.lastIndex, Modifier.clickable { open(Route.Card(card.routeKey)) })
        if (i == cards.lastIndex) onLast?.invoke()
    }
}

/** A tab's root: the large organic header, then the list, with room for the floating tab bar. */
@Composable
fun TabScreen(title: String, trailing: @Composable () -> Unit = {}, content: LazyListScope.() -> Unit) {
    LazyColumn(Modifier.fillMaxWidth().cream(), contentPadding = PaddingValues(bottom = 120.dp)) {
        item {
            Column(Modifier.padding(top = 40.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OrganicLargeHeader(title) { trailing() }
            }
        }
        content()
    }
}
