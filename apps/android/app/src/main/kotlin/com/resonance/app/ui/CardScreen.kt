package com.resonance.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.layout.size
import com.resonance.api.models.FeedCard
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CardDetailSkeleton
import com.resonance.design.CssText
import com.resonance.design.EmbedStoryCard
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicImage
import com.resonance.design.OrganicInlineBar
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenuChip
import com.resonance.design.inlineBarTop
import com.resonance.design.StoryLinkCards
import com.resonance.design.StoryMarkdown
import com.resonance.design.StorySkeleton
import com.resonance.design.TagPill
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.geometry.seedFromString
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.chat.Linkify
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.FeedLoader
import com.resonance.kit.reading.cardKeyOf
import com.resonance.kit.reading.embedFor
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryLink
import com.resonance.kit.story.StoryLinks
import com.resonance.kit.story.StoryParser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * A card page's state, kept while the page is on its stack: back from what it opened (an author,
 * another card) finds it as it was, without reading it again — unless this card, a resonance to
 * it or a block changed meanwhile, or it was read long ago.
 */
class CardPageModel(private val session: Session, private val key: String, preview: FeedCard?) : ViewModel() {
    private val cached = session.cardCache.page(key)
    /** The card as a list drew it (or as last seen), drawn while the page is read. */
    val placeholder: FeedCard? = preview ?: session.cardCache.preview(key)
    var phase by mutableStateOf(if (cached != null) "loaded" else "loading")
        private set
    var detail by mutableStateOf(cached?.detail)
        private set
    var blocks by mutableStateOf(cached?.let { StoryParser.parse(it.detail.story) } ?: emptyList())
        private set
    var resonances by mutableStateOf(cached?.resonances.orEmpty())
        private set
    var related by mutableStateOf(cached?.related.orEmpty())
        private set
    var linked by mutableStateOf(cached?.links.orEmpty())
        private set
    var embeds by mutableStateOf(cached?.embeds.orEmpty())
        private set
    /** The previews of the story's standalone links, by the key a paragraph names them by ([StoryLinks]). */
    var linkPreviews by mutableStateOf(cached?.let { StoryLinks.previews(it.detail.linkPreviews, session.config.origin) }.orEmpty())
        private set
    private var readFor: Int? = null
    private var readAt = 0L
    private var reading: Job? = null

    /**
     * Reads the card unless what the page holds is current ([isCurrent]: read lately, and no change
     * since that concerns it — `lastChange` is the latest of `changes`); `retry` always does.
     */
    fun refresh(changes: Int, lastChange: Session.CardChange?, retry: Boolean = false, now: Long = System.currentTimeMillis()) {
        val current = isCurrent(readFor, readAt, changes, lastChange, detail?.card?.id, now)
        // Seen either way: another card's change leaves the page as it is.
        readFor = changes
        if (current && !retry && phase != "failed") return
        readAt = now
        reading?.cancel()
        reading = viewModelScope.launch { load() }
    }

    private suspend fun load() {
        // A first read (or a retry) shows the skeleton; a re-read keeps the page while it goes.
        if (phase != "loaded") phase = "loading"
        try {
            val page = session.cardPages.load(key, placeholder)
            val d = page.detail
            if (d.story != detail?.story) blocks = StoryParser.parse(d.story)
            detail = d
            resonances = page.resonances
            related = page.related
            // Cards others linked to this one are shown to its author only (useLinkedToCard).
            linked = page.links
            embeds = page.embeds
            linkPreviews = StoryLinks.previews(d.linkPreviews, session.config.origin)
            phase = "loaded"
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

    companion object {
        /**
         * Whether a page read at `readAt`, as of change `readFor`, still shows `cardId` as it is: read
         * lately, and since then no change, or just one (`lastChange`) about another card — not
         * this one, nor a resonance to it (iOS's CardScreen). Several changes since, or the card
         * not read yet, read it again.
         */
        fun isCurrent(readFor: Int?, readAt: Long, changes: Int, lastChange: Session.CardChange?, cardId: String?, now: Long): Boolean {
            if (readFor == null || now - readAt >= FeedLoader.STALE_AFTER.inWholeMilliseconds) return false
            if (changes == readFor) return true
            return changes == readFor + 1 && cardId != null && lastChange != null && !lastChange.concerns(cardId)
        }
    }
}

/**
 * A card's page (card/[slug]/page.tsx, phone layout); `popToRoot` is where a deleted card leaves to.
 * It draws at once from what the app already has — the page as last read, or the card as the list
 * it was tapped in had it (its byline, cover and title over the story's skeleton) — and reads the
 * card when it opens: one request brings its lists and the cards its story embeds
 * ([com.resonance.kit.reading.CardPageLoader]). [CardPageModel] keeps it while the page is on its
 * stack.
 */
@Composable
fun CardScreen(session: Session, key: String, preview: FeedCard?, open: (Route) -> Unit, popToRoot: () -> Unit, back: () -> Unit) {
    val model = viewModel { CardPageModel(session, key, preview) }
    val placeholder = model.placeholder
    val phase = model.phase
    val detail = model.detail
    val blocks = model.blocks
    val resonances = model.resonances
    val related = model.related
    val linked = model.linked
    val embeds = model.embeds
    val context = LocalContext.current
    // A link card leaves by the same door as a link in a conversation: the in-app browser, asking first where the address isn't what it seems.
    val links = rememberLinkOpener()
    val linkCards = remember(model.linkPreviews, links) {
        StoryLinkCards(
            model.linkPreviews,
            host = { (Linkify.displayHost(it.url) ?: it.url).removePrefix("www.") },
            label = L10n.Card.LinkPreview::open,
            open = { links.tap(it.url) },
        )
    }
    val list = rememberLazyListState()
    // This card or a resonance to it edited, published or re-shelved from the writer or the ⋯, or a
    // block: read it again (another card's change leaves it as it is); so is a page read long ago.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    LaunchedEffect(changes, foregrounded) { model.refresh(changes, session.lastCardChange) }

    // A story's link leads where its scheme says (StoryLink); any other scheme isn't even tappable.
    val openUrl: (String) -> Unit = { href -> openStoryLink(context, session.config.origin, href, open) }

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
            "failed" -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { model.refresh(changes, session.lastCardChange, retry = true) }, action = EmptyAction.Outline)
            else -> detail?.let { d ->
                val card = d.card
                val resonance = (listOfNotNull(d.referenceCard) + resonances).distinctBy { it.id }
                LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(top = top, bottom = 40.dp)) {
                    item {
                        Column(Modifier.padding(horizontal = 20.dp).padding(top = 16.dp)) {
                            ArticleHead(card, d.anonymous) { open(Route.Author(it)) }
                            StoryMarkdown(blocks, openUrl, linkCards) { href, title -> CardEmbed(embeds.embedFor(href), href, title, open) }
                            FlowRow(Modifier.padding(top = 32.dp, bottom = 40.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                card.tags.forEach { TagPill(it, fill = Tokens.TerracottaLight) }
                            }
                            if (!d.isOwner) CardViewerActions(
                                session, card.id, card.referenceCardId,
                                onWriteNew = { open(Route.Write(referenceCardId = card.id)) },
                                onModify = { mine -> open(Route.Write(cardId = mine)) },
                                onOpenMine = { key -> open(Route.Card(key)) },
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
                CardActionsMenu(
                    session, card.id, card.visibility.value, open, seed = hue + 3, showsCard = false, onDeleted = popToRoot, trigger = MenuTrigger.Bare,
                    referenceCardId = card.referenceCardId, referenceTitle = d.referenceCard?.title,
                )
            } else {
                // An anonymous card hides its author: the menu only reports it (the server knows who wrote it).
                val authorId = if (d.anonymous) null else card.author?.id
                SafetyMenu(session, SafetyService.Target.Card(card.id, authorId), if (authorId == null) null else card.author?.handle, seed = hue + 3, trigger = MenuTrigger.Bare)
            }
        }
    }
    }
    LinkDialogs(links)
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
 * A card link standing alone in a story (CardEmbedLink): the embedded card, as the page brought
 * it along — or, when it didn't (a card the reader may not see), the plain link.
 */
@Composable
private fun CardEmbed(card: FeedCard?, href: String, title: String, open: (Route) -> Unit) {
    val key = cardKeyOf(href) ?: href.substringAfterLast('/')
    val go = Modifier.plainClickable(onClickLabel = title) { open(Route.Card(card?.routeKey ?: key, card)) }
    if (card != null) {
        EmbedStoryCard(card.title, card.author?.handle ?: L10n.Card.anonymousAuthor, card.imageUrl, card.accentHue, seedFromString(href).toDouble(), go)
    } else {
        BasicText(title, style = AppFonts.body(17f, lineHeight = 1.8f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline), modifier = go)
    }
}

/**
 * Opens a link in a story by its scheme: a page of the site the app shows itself on its stack,
 * any other page of the site — or of the web — in the in-app browser (never back into the app),
 * and mailto: in a mail app. Nothing else is opened: a stranger's story can't start another app.
 */
internal fun openStoryLink(context: Context, origin: String, href: String, open: (Route) -> Unit) {
    when (val link = StoryLink.resolve(href, origin)) {
        is StoryLink.Site -> Route.fromPath(link.path)?.let(open) ?: InAppBrowser.open(context, origin.trimEnd('/') + link.path)
        is StoryLink.Web -> InAppBrowser.open(context, link.url)
        is StoryLink.Mail -> runCatching {
            context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse(link.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        null -> {}
    }
}
