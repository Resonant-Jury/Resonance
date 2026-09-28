package com.resonance.app.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.BasicText
import com.resonance.design.OrganicIcon
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CssText
import com.resonance.design.EmbedStoryCard
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIconButton
import com.resonance.design.OrganicImage
import com.resonance.design.OrganicInlineBar
import com.resonance.design.SketchLoader
import com.resonance.design.StoryMarkdown
import com.resonance.design.TagPill
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.seedFromString
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryParser

/** A card's page (card/[slug]/page.tsx, phone layout). */
@Composable
fun CardScreen(session: Session, key: String, open: (Route) -> Unit, back: () -> Unit) {
    var phase by remember(key) { mutableStateOf("loading") }
    var detail by remember(key) { mutableStateOf<CardDetail?>(null) }
    var blocks by remember(key) { mutableStateOf<List<StoryBlock>>(emptyList()) }
    var resonances by remember(key) { mutableStateOf<List<FeedCard>>(emptyList()) }
    var related by remember(key) { mutableStateOf<List<FeedCard>>(emptyList()) }
    val uri = LocalUriHandler.current
    val context = LocalContext.current

    LaunchedEffect(key) {
        try {
            val d = session.reading.card(key)
            detail = d
            blocks = StoryParser.parse(d.story)
            phase = "loaded"
            resonances = runCatching { session.reading.resonances(d.card.id) }.getOrDefault(emptyList())
            related = runCatching { session.reading.related(d.card.id) }.getOrDefault(emptyList())
        } catch (e: ApiFailure) {
            phase = if (e.isNotFound) "notFound" else "failed"
        } catch (e: Exception) {
            phase = "failed"
        }
    }

    val openUrl: (String) -> Unit = { url ->
        val route = if (url.startsWith("/")) Route.fromPath(url) else if (url.startsWith(session.config.origin)) Route.fromPath(url.removePrefix(session.config.origin)) else null
        if (route != null) open(route) else runCatching { uri.openUri(url) }
    }

    Column(Modifier.fillMaxSize().cream()) {
        OrganicInlineBar(L10n.App.Nav.back, back) {
            detail?.let { d ->
                val authorId = d.card.author?.id
                if (!d.isOwner && !d.anonymous && authorId != null) {
                    SafetyMenu(session, SafetyService.Target.Card(d.card.id, authorId), d.card.author?.handle)
                }
                OrganicIconButton(IconName.Share, "Share") {
                    val link = "${session.config.origin}/card/${d.card.routeKey}"
                    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link), null))
                }
            }
        }
        when (phase) {
            "loading" -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { SketchLoader(48.dp) }
            "notFound" -> OrganicEmptyState(L10n.Card.NotFound.title, L10n.Card.NotFound.back, back)
            "failed" -> OrganicEmptyState(L10n.Native.loadError)
            else -> detail?.let { d ->
                val card = d.card
                val resonance = (listOfNotNull(d.referenceCard) + resonances).distinctBy { it.id }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp)) {
                    item {
                        Column(Modifier.padding(horizontal = 20.dp).padding(top = 16.dp)) {
                            Byline(card, d.anonymous) { open(Route.Author(it)) }
                            if (card.imageUrl != null) {
                                OrganicImage(card.imageUrl, (card.accentHue ?: 55.0) + 11, Modifier.fillMaxWidth().aspectRatio(1 / 0.52f).padding(top = 24.dp)) {
                                    Box(Modifier.fillMaxSize().background(Tokens.CreamDark))
                                }
                            }
                            CssText(card.title, AppFonts.Family.Heading, 28f, 700, lineHeight = 1.2f, modifier = Modifier.padding(top = 24.dp, bottom = 28.dp).semantics { heading() })
                            StoryMarkdown(blocks, openUrl) { href, title -> CardEmbed(session, href, title, open) }
                            if (card.tags.isNotEmpty()) {
                                FlowRow(Modifier.padding(top = 32.dp, bottom = 40.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    card.tags.forEach { TagPill(it, fill = Tokens.TerracottaLight) }
                                }
                            }
                        }
                    }
                    if (resonance.isNotEmpty()) section(L10n.Card.ResonanceSection.title, resonance, Tokens.CreamDark, open)
                    if (related.isNotEmpty()) section(L10n.Card.related, related, if (resonance.isEmpty()) Tokens.CreamDark else Tokens.Cream, open)
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.section(title: String, cards: List<FeedCard>, background: Color, open: (Route) -> Unit) {
    item {
        BasicText(
            title,
            style = AppFonts.heading(22f, lineHeight = 1.3f).copy(textAlign = TextAlign.Center, letterSpacing = (-0.22).sp),
            modifier = Modifier.fillMaxWidth().background(background).padding(start = 20.dp, end = 20.dp, top = 72.dp, bottom = 40.dp).semantics { heading() },
        )
    }
    storyCards(cards, open)
}

/** The phone byline: avatar, pen name (→ their page), verified mark, region · date. */
@Composable
private fun Byline(card: FeedCard, anonymous: Boolean, openAuthor: (String) -> Unit) {
    val author = card.author
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (author != null && !anonymous) HandDrawnAvatar(author.initials, author.avatarUrl, author.accent(), 44.dp, author.avatarSeedValue())
        else HandDrawnAvatar("·", color = Tokens.CreamDark, size = 44.dp, seed = 97.0)
        Column {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (author != null && !anonymous) {
                    BasicText(author.handle, style = AppFonts.body(16f, 600), modifier = Modifier.clickable { openAuthor(author.handle) })
                    if (author.verified) OrganicIcon(IconName.Verified, Modifier.semantics { contentDescription = L10n.Card.verified }, size = 14.dp, color = Tokens.Sage, strokeWidth = 1.8f)
                } else {
                    BasicText(L10n.Card.anonymousAuthor, style = AppFonts.body(16f, 600, color = Tokens.TextMuted))
                }
            }
            val sub = listOfNotNull(if (anonymous) null else author?.region, shortDate(card.publishedAt)).joinToString(" · ")
            BasicText(sub, style = AppFonts.body(13f, color = Tokens.TextMuted))
        }
    }
}

/** A card link standing alone in a story: the linked card as an embed, or the plain link. */
@Composable
private fun CardEmbed(session: Session, href: String, title: String, open: (Route) -> Unit) {
    val key = href.substringAfterLast('/')
    var card by remember(href) { mutableStateOf<FeedCard?>(null) }
    LaunchedEffect(href) { card = runCatching { session.reading.card(key).card }.getOrNull() }
    val c = card
    Box(Modifier.fillMaxWidth().clickable { open(Route.Card(key)) }) {
        if (c != null) EmbedStoryCard(c.title, c.author?.handle ?: L10n.Card.anonymousAuthor, c.imageUrl, c.accentHue, seedFromString(href).toDouble())
        else BasicText(title, style = AppFonts.body(17f, color = Tokens.Terracotta))
    }
}
