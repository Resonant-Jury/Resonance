package com.resonance.app.ui

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicText
import com.resonance.design.OrganicIcon
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.layout.size
import com.resonance.api.models.FeedCard
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CardDetailSkeleton
import com.resonance.design.CssText
import com.resonance.design.FloatingWriteButton
import com.resonance.design.EmbedStoryCard
import com.resonance.design.EmbedStoryCardPlaceholder
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicImage
import com.resonance.design.OrganicInlineBar
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenuChip
import com.resonance.design.inlineBarTop
import com.resonance.design.StoryMarkdown
import com.resonance.design.StorySkeleton
import com.resonance.design.TagPill
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.geometry.seedFromString
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryParser
import kotlinx.coroutines.CancellationException

/**
 * A card's page (card/[slug]/page.tsx, phone layout); `popToRoot` is where a deleted card leaves to.
 * It draws at once from what the app already has — the page as last read, or the card as the list
 * it was tapped in had it (its byline, cover and title over the story's skeleton) — and always reads
 * the card again, its lists beside it ([com.resonance.kit.reading.CardPageLoader]).
 */
@Composable
fun CardScreen(session: Session, key: String, preview: FeedCard?, open: (Route) -> Unit, popToRoot: () -> Unit, back: () -> Unit) {
    val cached = remember(key) { session.cardCache.page(key) }
    val placeholder = remember(key) { preview ?: session.cardCache.preview(key) }
    var phase by remember(key) { mutableStateOf(if (cached != null) "loaded" else "loading") }
    var detail by remember(key) { mutableStateOf(cached?.detail) }
    var blocks by remember(key) { mutableStateOf(cached?.let { StoryParser.parse(it.detail.story) } ?: emptyList()) }
    var resonances by remember(key) { mutableStateOf(cached?.resonances.orEmpty()) }
    var related by remember(key) { mutableStateOf(cached?.related.orEmpty()) }
    var linked by remember(key) { mutableStateOf(cached?.links.orEmpty()) }
    // Bumped by "try again".
    var attempt by remember(key) { mutableIntStateOf(0) }
    val uri = LocalUriHandler.current
    val context = LocalContext.current
    val list = rememberLazyListState()
    // Edited, published or re-shelved from the writer or the ⋯: read it again.
    val changes by session.cardChanges.collectAsStateWithLifecycle()

    LaunchedEffect(key, attempt, changes) {
        // A first read (or a retry) shows the skeleton; a re-read keeps the page while it goes.
        if (phase != "loaded") phase = "loading"
        try {
            val page = session.cardPages.load(key, placeholder, session.uid) { d ->
                if (d.story != detail?.story) blocks = StoryParser.parse(d.story)
                detail = d
                phase = "loaded"
            }
            resonances = page.resonances
            related = page.related
            // Cards others linked to this one are shown to its author only (useLinkedToCard).
            linked = page.links
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiFailure) {
            if (e.isNotFound) {
                session.cardCache.forget(key)
                detail = null
                phase = "notFound"
            } else if (phase != "loaded") phase = "failed"
        } catch (e: Exception) {
            // What is already on the page stays (it was read moments ago); only an empty page offers the retry.
            if (phase != "loaded") phase = "failed"
        }
    }

    val openUrl: (String) -> Unit = { url ->
        val sitePath = if (url.startsWith("/")) url else if (url.startsWith(session.config.origin)) url.removePrefix(session.config.origin) else null
        val route = sitePath?.let(Route::fromPath)
        when {
            route != null -> open(route)
            // A page of the site the app doesn't show itself (a policy page): the in-app browser, never back into the app.
            sitePath != null -> InAppBrowser.open(context, session.config.origin.trimEnd('/') + "/" + sitePath.trimStart('/'))
            else -> runCatching { uri.openUri(url) }
        }
    }

    // The bar lies over the page, so the story scrolls right up to its pen line.
    val top = inlineBarTop()
    // Once the byline has scrolled under the bar, the bar names the author (Threads' header, in the byline's language).
    val bylinePx = with(LocalDensity.current) { BylineBottom.toPx() }
    val bylineGone by remember(list, bylinePx) {
        derivedStateOf { list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > bylinePx }
    }
    Box(Modifier.fillMaxSize().cream()) {
    Column(Modifier.fillMaxSize().padding(top = if (phase == "loaded") 0.dp else top)) {
        when (phase) {
            // The card as the list drew it, the story still shimmering below; or, knowing nothing yet,
            // CardDetailSkeleton: the article's own layout in shimmering blocks.
            "loading" -> if (placeholder != null) CardPreview(placeholder) { open(Route.Author(it)) }
                else CardDetailSkeleton(Modifier.padding(horizontal = 20.dp).padding(top = 16.dp))
            "notFound" -> OrganicEmptyState(title = L10n.Card.NotFound.title, titleSize = 24f, actionTitle = L10n.Card.NotFound.back, onAction = back, action = EmptyAction.Link)
            "failed" -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { attempt++ }, action = EmptyAction.Outline)
            else -> detail?.let { d ->
                val card = d.card
                val resonance = (listOfNotNull(d.referenceCard) + resonances).distinctBy { it.id }
                LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(top = top, bottom = 40.dp)) {
                    item {
                        Column(Modifier.padding(horizontal = 20.dp).padding(top = 16.dp)) {
                            ArticleHead(card, d.anonymous) { open(Route.Author(it)) }
                            StoryMarkdown(blocks, openUrl) { href, title -> CardEmbed(session, href, title, open) }
                            FlowRow(Modifier.padding(top = 32.dp, bottom = 40.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                card.tags.forEach { TagPill(it, fill = Tokens.TerracottaLight) }
                            }
                            if (!d.isOwner) CardViewerActions(
                                session, card.id,
                                onResonate = { open(Route.Write(referenceCardId = card.id)) },
                                onModify = { mine -> open(Route.Write(cardId = mine)) },
                                onUpgradeNote = { words -> open(Route.Write(referenceCardId = card.id, story = words)) },
                                modifier = Modifier.padding(bottom = 40.dp),
                            )
                        }
                    }
                    if (d.isOwner && linked.isNotEmpty()) {
                        item {
                            BasicText(
                                L10n.Card.linkedCards,
                                style = AppFonts.heading(20f, lineHeight = 1.3f).copy(letterSpacing = (-0.01).em),
                                modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 24.dp).semantics { heading() },
                            )
                        }
                        miniCards(linked, open, keyPrefix = "linked:")
                        item { Spacer(Modifier.height(40.dp)) }
                    }
                    if (resonance.isNotEmpty()) {
                        sectionHeading(L10n.Card.ResonanceSection.title, below = 40)
                        miniCards(resonance, open, keyPrefix = "resonance:")
                        item { Spacer(Modifier.height(16.dp)) }
                    }
                    if (related.isNotEmpty()) {
                        sectionHeading(L10n.Card.related, below = 56)
                        storyCards(related, open)
                        item { Spacer(Modifier.height(16.dp)) }
                    }
                }
            }
        }
    }
    OrganicInlineBar(
        L10n.App.Nav.back, back, scrolled = list.scrolledPast20(),
        leading = { detail?.let { d -> BarAuthor(d.card, d.anonymous, visible = phase == "loaded" && bylineGone) { open(Route.Author(it)) } } },
    ) {
        detail?.let { d ->
            val card = d.card
            val hue = card.accentHue ?: 55.0
            OrganicMenuChip(IconName.Share, L10n.Card.share, seed = hue + 5, trigger = MenuTrigger.Bare) {
                val link = "${session.config.origin}/card/${card.routeKey}"
                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, link), null))
            }
            // The ⋯ lives in the bar, as phone apps keep a page's actions: the owner's, or the reader's safety menu.
            if (d.isOwner) {
                // Its own page is underneath the writer, so the card isn't opened again on the way out.
                CardActionsMenu(session, card.id, card.visibility.value, card.routeKey, open, seed = hue + 3, showsCard = false, onDeleted = popToRoot, trigger = MenuTrigger.Bare)
            } else {
                // An anonymous card hides its author: the menu only reports it (the server knows who wrote it).
                val authorId = if (d.anonymous) null else card.author?.id
                SafetyMenu(session, SafetyService.Target.Card(card.id, authorId), if (authorId == null) null else card.author?.handle, seed = hue + 3, trigger = MenuTrigger.Bare)
            }
        }
    }
    // The web's pen sits on the card page too: bottom right, 20 in.
    // On your own card the pen edits it (FloatingWriteButton's editsOwnCard), then comes back here.
    detail?.let { d ->
        FloatingWriteButton(if (d.isOwner) L10n.App.Nav.editThisCard else L10n.App.Nav.write, Modifier.align(Alignment.BottomEnd)) {
            open(if (d.isOwner) Route.Write(cardId = d.card.id, showsCard = false) else Route.Write())
        }
    }
    }
}

/**
 * A section heading under the article. On phones the web drops the tinted
 * band and its wavy edge (the cards are bands already — "double chrome"), so
 * the heading sits on the page: 32 above, 22/700 centred.
 */
private fun LazyListScope.sectionHeading(title: String, below: Int) {
    item {
        BasicText(
            title,
            style = AppFonts.heading(22f, lineHeight = 1.3f).copy(textAlign = TextAlign.Center, letterSpacing = (-0.01).em),
            modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 32.dp, bottom = below.dp).semantics { heading() },
        )
    }
}

/** Where the byline ends under the bar: its 16 of air and the 44 avatar. */
private val BylineBottom = 60.dp

/**
 * The author in the bar once the byline has scrolled away: the avatar small
 * and the pen name (→ their page), rising in as the byline leaves; an
 * anonymous card shows its dot and "anonymous".
 */
@Composable
private fun BarAuthor(card: FeedCard, anonymous: Boolean, visible: Boolean, openAuthor: (String) -> Unit) {
    AnimatedVisibility(
        visible,
        enter = fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 3 },
        exit = fadeOut(tween(140)) + slideOutVertically(tween(180)) { it / 3 },
    ) {
        val author = card.author
        val shown = author != null && !anonymous
        Row(
            Modifier.padding(start = 2.dp).then(if (shown) Modifier.plainClickable(onClickLabel = author!!.handle) { openAuthor(author.handle) } else Modifier),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (shown) HandDrawnAvatar(author!!.initials, author.avatarUrl, author.accent(), 28.dp, author.avatarSeedValue())
            else HandDrawnAvatar("·", color = Tokens.CreamDark, size = 28.dp, seed = 97.0)
            BasicText(
                if (shown) author!!.handle else L10n.Card.anonymousAuthor,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = AppFonts.body(15f, 600, color = if (shown) Tokens.Text else Tokens.TextMuted),
            )
        }
    }
}

/**
 * The article's head: the byline 28 above the cover (or the title), the cover at its 0.52 ratio
 * and 20 below, then the title (the page's actions live in the bar).
 */
@Composable
private fun ArticleHead(card: FeedCard, anonymous: Boolean, openAuthor: (String) -> Unit) {
    Byline(card, anonymous, openAuthor)
    Spacer(Modifier.height(28.dp))
    if (card.imageUrl != null) {
        OrganicImage(card.imageUrl, (card.accentHue ?: 55.0) + 11, Modifier.fillMaxWidth().aspectRatio(1 / 0.52f)) {
            Box(Modifier.fillMaxSize().background(Tokens.CreamDark))
        }
        Spacer(Modifier.height(20.dp))
    }
    CssText(
        card.title, AppFonts.Family.Heading, 28f, 700, lineHeight = 1.2f, letterSpacing = -0.015f,
        modifier = Modifier.padding(bottom = 28.dp).semantics { heading() },
    )
}

/**
 * The page while the card is read, drawn from the list it was tapped in: the same head the page
 * will have, and the story and tags still shimmering under it.
 */
@Composable
private fun CardPreview(card: FeedCard, openAuthor: (String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp).padding(top = 16.dp)) {
        ArticleHead(card, card.anonymous, openAuthor)
        StorySkeleton(Modifier.semantics { contentDescription = L10n.Home.moreLoading })
    }
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
                    BasicText(author.handle, style = AppFonts.body(16f, 600), modifier = Modifier.plainClickable { openAuthor(author.handle) })
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

/**
 * A card link standing alone in a story (CardEmbedLink): the embed's
 * footprint while the card loads, then the embedded card — or, when the
 * reader may not see it, the plain link.
 */
@Composable
private fun CardEmbed(session: Session, href: String, title: String, open: (Route) -> Unit) {
    val key = href.substringAfterLast('/')
    // A card already seen draws at once (and is still read: it may have gone, or been hidden).
    var state by remember(href) { mutableStateOf(session.cardCache.preview(key)?.let { Result.success(it) }) }
    LaunchedEffect(href) {
        val read = try {
            Result.success(session.reading.card(key).card.also(session.cardCache::rememberPreview))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
        // A card this reader can't see becomes the plain link; a bad connection keeps what was drawn.
        if (read.isSuccess || (read.exceptionOrNull() as? ApiFailure)?.isNotFound == true || state == null) state = read
    }
    val loaded = state
    val go = Modifier.plainClickable(onClickLabel = title) { open(Route.Card(key, loaded?.getOrNull())) }
    when {
        loaded == null -> EmbedStoryCardPlaceholder(title)
        loaded.isSuccess -> loaded.getOrThrow().let { c ->
            EmbedStoryCard(c.title, c.author?.handle ?: L10n.Card.anonymousAuthor, c.imageUrl, c.accentHue, seedFromString(href).toDouble(), go)
        }
        else -> BasicText(title, style = AppFonts.body(17f, lineHeight = 1.8f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline), modifier = go)
    }
}
