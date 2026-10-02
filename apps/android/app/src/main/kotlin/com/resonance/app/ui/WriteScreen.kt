package com.resonance.app.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.ui.graphics.asImageBitmap
import com.resonance.design.HandDrawnImage
import com.resonance.design.OrganicVerticalRule
import com.resonance.design.TagPill
import com.resonance.design.TagSize
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.BuildConfig
import com.resonance.app.DebugLaunch
import com.resonance.app.DraftService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicEmptyState
import com.resonance.design.ButtonVariant
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.Mixes
import com.resonance.design.ModalActions
import com.resonance.design.ModalBody
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicInlineBar
import com.resonance.design.inlineBarTop
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicImage
import com.resonance.design.OrganicListEmpty
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicRadio
import com.resonance.design.OrganicTextField
import com.resonance.design.OrganicToggle
import com.resonance.design.SketchLoader
import com.resonance.design.WavyDivider
import com.resonance.design.WobRectShape
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.fade
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Writing a card (the web's write page on a phone): the one-line title, the
 * story in the editor island under the web's text toolbar, tags with the AI
 * pill, the cover photo, then Publish (through the publish panel) or leave
 * with the draft saved. Drafts save themselves a moment after typing stops.
 * A page like the others pushed on a tab: the inline bar carries the back arrow
 * and the writer's title; going back with something written asks first.
 * Opened on one of your cards (`cardId`, write/[id]) it resumes a draft, or
 * revises a published card: then Save changes / Discard changes.
 * The twin of iOS's WriteScreen; `onFinished` gets the card's slug or id.
 */
@Composable
fun WriteScreen(
    session: Session,
    referenceCardId: String?,
    cardId: String?,
    story: String?,
    close: () -> Unit,
    /** A new card was first saved, as the draft with this id (its route then names it: [rememberDraft]). */
    onCreated: (String) -> Unit = {},
    onFinished: (String) -> Unit,
) {
    // A new card is saved as a draft as soon as there is something to keep, and its route then names
    // that draft. While the writer is open nothing changes under it; when it comes back (uncovered,
    // rotated, the app restored) it opens on the draft rather than a blank card.
    val id = remember { cardId }
    if (id == null) {
        WriteForm(session, referenceCardId, story, null, close, onFinished, onCreated)
        return
    }
    // The card loads straight from Firestore, painting a loader meanwhile.
    var loaded by remember(id) { mutableStateOf(false) }
    var opened by remember(id) { mutableStateOf<DraftService.OpenedCard?>(null) }
    LaunchedEffect(id) {
        opened = session.drafts?.open(id)
        loaded = true
    }
    val card = opened
    when {
        !loaded -> {
            BackHandler(onBack = close)
            Box(Modifier.fillMaxSize().cream(), contentAlignment = Alignment.TopCenter) {
                Box(Modifier.padding(top = inlineBarTop() + 58.dp)) { SketchLoader(64.dp) }
                OrganicInlineBar(L10n.App.Nav.back, close)
            }
        }
        // The card isn't there (deleted) or isn't yours: the web's not-found note.
        card == null -> {
            BackHandler(onBack = close)
            Box(Modifier.fillMaxSize().cream()) {
                Box(Modifier.padding(top = inlineBarTop())) {
                    OrganicEmptyState(title = L10n.Card.NotFound.title, titleSize = 24f, actionTitle = L10n.Card.NotFound.back, onAction = close, action = EmptyAction.Link, verticalPadding = 58.dp)
                }
                OrganicInlineBar(L10n.App.Nav.back, close)
            }
        }
        else -> WriteForm(session, referenceCardId, null, card, close, onFinished)
    }
}

@Composable
private fun WriteForm(
    session: Session,
    referenceCardId: String?,
    story: String?,
    opened: DraftService.OpenedCard?,
    close: () -> Unit,
    onFinished: (String) -> Unit,
    onCreated: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val model = remember(opened) {
        WriteModel(session.drafts, session.writing, referenceCardId, StoryEditorBridge(context, L10n.Write.storyPlaceholder), opened).apply {
            this.onCreated = onCreated
            // What the screens behind the writer read again for once it closes (nothing, if nothing was written).
            onWrote = { id -> session.writerWrote(Session.CardChange(id, this.referenceCardId)) }
            // Debug `writeTitle` / `writeStory` extras fill a new card (screen checks; the emulator's keyboard is slow to drive).
            if (BuildConfig.DEBUG && opened == null) {
                DebugLaunch.writeTitle?.let { t -> update { copy(title = t) } }
                DebugLaunch.writeCover?.let { c -> update { copy(imageUrl = c) } }
                DebugLaunch.writeStory?.let { s ->
                    editor.setMarkdown(s)
                    update { copy(story = s) }
                }
            }
            // Words to start from: a note grown into a resonance (the web drops them; the apps keep them).
            if (opened == null) story?.let { words ->
                editor.setMarkdown(words)
                update { copy(story = words) }
            }
        }
    }
    // Whatever way the screen goes (close, back, a tab switch), the last edit is saved.
    DisposableEffect(model) { onDispose { model.leave() } }
    // Leaving the app saves what is written now, not 1.5s later.
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { model.flush() }
    var publishing by remember { mutableStateOf(false) }
    var pickingCard by remember { mutableStateOf(false) }
    // The first-card guide (ux §5): a brand-new writer's fresh card only.
    var showGuide by remember(model) { mutableStateOf(false) }
    // The anonymous-publishing hint, for this writer's first few visits (counted per visit, as the web).
    var showsAnonymousHint by remember(model) { mutableStateOf(false) }
    // Discarding a revision (the buttons wait meanwhile).
    var discarding by remember(model) { mutableStateOf(false) }
    var actionError by remember(model) { mutableStateOf<String?>(null) }
    LaunchedEffect(model) {
        if (opened == null && referenceCardId == null) session.drafts?.let { showGuide = !it.hasAnyCards() }
    }
    LaunchedEffect(model) { showsAnonymousHint = session.hints?.claim("anonymous-publish") ?: false }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { model.setCover(context, it) } }
    val inlinePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { model.insertImage(context, it) } }
    val images = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
    var confirmingLeave by remember(model) { mutableStateOf(false) }
    // The arrow, the system back and the buttons can land twice before the page has gone: it closes once.
    var leaving by remember(model) { mutableStateOf(false) }
    val leave: () -> Unit = {
        if (!leaving) {
            leaving = true
            model.editor.releaseKeyboard()
            scope.launch {
                model.saveNow()
                close()
            }
        }
    }
    // Back (the bar's arrow, the system's key or swipe) with something written asks first; with nothing, it leaves at once.
    // "Save draft and leave" below is already a choice, so it doesn't ask.
    val goBack: () -> Unit = {
        when {
            leaving -> {}
            model.hasWork -> {
                model.editor.releaseKeyboard()
                confirmingLeave = true
            }
            else -> leave()
        }
    }
    BackHandler(onBack = goBack)

    val scroll = rememberScrollState()
    Box(Modifier.fillMaxSize().cream().imePadding()) { Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            // The bar lies over the page, so what scrolls shows right up to its pen line.
            .padding(top = inlineBarTop())
            .padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        // The title is the bar's; the save state stays here (an unsaved draft has none).
        model.saveStatus?.let { BasicText(it, style = AppFonts.body(14f, color = Tokens.TextMuted)) }
        if (showGuide) FirstCardGuide { question ->
            // Seeded into the story as a quote to write against; the guide steps aside.
            model.seed("> $question\n\n")
            showGuide = false
        }
        OrganicTextField(
            L10n.Write.coreLabel, model.values.title, { t -> model.update { copy(title = t) } },
            placeholder = L10n.Write.corePlaceholder, multiline = true, minLines = 2, display = true, maxLength = WriteModel.TITLE_MAX, curve = 0.8,
        )
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionLabel(L10n.Write.storyLabel)
            StoryEditorField(model.editor, onInsertCard = { pickingCard = true }, onInsertImage = { inlinePicker.launch(images) }, uploadingImage = model.uploadingInline)
        }
        Tags(model)
        Cover(model) { coverPicker.launch(images) }
        // Everything autosaves; these are only about intent. A draft: publish it, or step away.
        // A live card: put the revision in front of readers, or drop it.
        Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (model.isPublished) {
                    OrganicButton(if (discarding) L10n.Write.saving else L10n.Write.saveChanges, enabled = !discarding) {
                        actionError = null
                        publishing = true
                    }
                    if (model.hasPendingEdit) {
                        OrganicButton(L10n.Write.discardChanges, variant = ButtonVariant.Text, enabled = !discarding) {
                            if (discarding) return@OrganicButton
                            discarding = true
                            actionError = null
                            scope.launch {
                                try {
                                    onFinished(model.discardEdit())
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    actionError = L10n.Native.saveError
                                } finally {
                                    discarding = false
                                }
                            }
                        }
                    }
                } else {
                    OrganicButton(L10n.Write.publish) {
                        actionError = null
                        publishing = true
                    }
                    OrganicButton(L10n.Write.saveDraftAndLeave, variant = ButtonVariant.Text, onClick = leave)
                }
            }
            actionError?.let { BasicText(it, style = AppFonts.body(12f, color = Tokens.Terracotta)) }
        }
    }
        // Leaving keeps what's written: the draft is saved on the way out.
        OrganicInlineBar(L10n.App.Nav.back, goBack, title = model.title, scrolled = scroll.scrolledPast20())
    }

    if (confirmingLeave) OrganicConfirmDialog(
        title = L10n.Write.leaveTitle,
        body = if (model.isPublished) L10n.Write.leaveBodyRevision else L10n.Write.leaveBody,
        cancelLabel = L10n.Write.leaveStay,
        confirmLabel = L10n.Write.leaveConfirm,
        onCancel = { confirmingLeave = false },
        onConfirm = {
            confirmingLeave = false
            leave()
        },
    )

    if (pickingCard) OrganicModal(
        { pickingCard = false }, L10n.Write.Editor.CardModal.title,
        seed = 53.0, closeLabel = L10n.Write.Editor.CardModal.cancel, maxWidth = 480.dp,
    ) {
        CardPickerContent(session, L10n.Write.Editor.CardModal.title, L10n.Write.Editor.CardModal.subtitle, onPick = { card ->
            pickingCard = false
            model.editor.exec("insertCard", mapOf("href" to "/card/${card.slug ?: card.id}", "title" to card.title))
        }) { pickingCard = false }
    }
    if (publishing) PublishPanel(session, model, showsAnonymousHint, onPublished = { key ->
        publishing = false
        model.editor.releaseKeyboard()
        onFinished(key)
    }) { publishing = false }
}

@Composable
private fun SectionLabel(text: String) {
    BasicText(text.uppercase(), style = AppFonts.body(Tokens.LabelSize, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em))
}

/**
 * Tags: the chosen ones (lg pills with their ×), the AI pill while nothing is
 * being typed, and the two-segment tag bar.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Tags(model: WriteModel) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel(L10n.Write.tagsLabel)
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                model.values.tags.forEach { tag -> TagPill(tag, Tokens.TerracottaLight, size = TagSize.Lg) { model.removeTag(tag) } }
                // The AI pill steps aside once the user starts typing their own tag.
                if (model.tagDraft.isBlank()) {
                    AddTagButton(if (model.suggestingTags) L10n.Write.tagsSuggesting else L10n.Write.tagsSuggest) { model.suggestTags() }
                }
            }
            TagInputBar(model.tagDraft, { model.tagDraft = it }, L10n.Write.tagsPlaceholder, L10n.Write.tagsAdd) { model.addTag() }
            model.tagError?.let { BasicText(it, style = AppFonts.body(12f, color = Tokens.Terracotta)) }
        }
    }
}

/**
 * The cover: the picked or drawn picture in its frame (✕ removes it); an
 * illustration's preview, blurred, while it renders; the loader while a photo
 * goes up; otherwise the split surface — upload on the left, illustrate from
 * the story on the right, a pen rule between.
 */
@Composable
private fun Cover(model: WriteModel, pick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel(L10n.Write.mediaLabel)
        val url = model.values.imageUrl
        val preview = model.partialPreview
        when {
            url != null -> HandDrawnImage(url = url, removeLabel = L10n.Write.mediaRemove, onRemove = model::removeCover)
            preview != null -> HandDrawnImage(bitmap = preview.asImageBitmap(), blur = 14.dp, wash = Tokens.Cream.copy(alpha = 0.45f)) {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    SketchLoader(64.dp)
                    BasicText(L10n.Write.mediaGenerating, style = AppFonts.body(14f, 600))
                }
            }
            model.mediaBusy -> Column(
                Modifier.fillMaxWidth().mediaFrame(busy = true).padding(vertical = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                SketchLoader(64.dp)
                BasicText(if (model.generating) L10n.Write.mediaGenerating else L10n.Write.mediaUploading, style = AppFonts.body(14f, 600, color = Tokens.TextMuted))
            }
            else -> Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).mediaFrame()) {
                MediaHalf(
                    IconName.Image, L10n.Write.mediaPlaceholder, L10n.Write.mediaHint,
                    Modifier.weight(1f).fillMaxHeight().plainClickable(role = Role.Button, onClick = pick),
                )
                OrganicVerticalRule(lineWidth = Tokens.Ink)
                MediaHalf(
                    IconName.Sparkle, L10n.Write.mediaGenerate,
                    if (model.canGenerate) L10n.Write.mediaGenerateHint else L10n.Write.mediaGenerateNeedStory,
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .fade(if (model.canGenerate) 1f else 0.55f)
                        .plainClickable(role = Role.Button) { model.generateCover() },
                )
            }
        }
        model.mediaError?.let { BasicText(it, style = AppFonts.body(12f, color = Tokens.Terracotta)) }
    }
}

/**
 * The publish panel (PublishPanel.tsx): the insight echo, who can see it,
 * publishing anonymously with the card head it will get, then Publish. For a
 * published card's revision ('update' mode) the echo gives way to a plain
 * line about what the button does, and it saves the changes instead.
 */
@Composable
private fun PublishPanel(session: Session, model: WriteModel, showsAnonymousHint: Boolean, onPublished: (String) -> Unit, onCancel: () -> Unit) {
    val scope = rememberCoroutineScope()
    val updating = model.isPublished
    // As it is: a connections card shows neither row picked, and keeps its audience unless one is.
    var visibility by remember { mutableStateOf(model.values.visibility) }
    var anonymous by remember { mutableStateOf(model.values.anonymous) }
    var insight by remember { mutableStateOf<String?>(null) }
    var insightLoading by remember { mutableStateOf(!updating) }
    var pending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // The mirror moment is for a first publication only.
    LaunchedEffect(Unit) {
        if (updating) return@LaunchedEffect
        insight = runCatching { session.writing.insight(model.values.title, model.values.story) }.getOrNull()
        insightLoading = false
    }

    // Not closable while it publishes or saves (the web's pending gate).
    val title = if (updating) L10n.Write.PublishPanel.updateTitle else L10n.Write.PublishPanel.title
    OrganicModal(if (pending) null else onCancel, title, seed = 29.0, closeLabel = L10n.Write.PublishPanel.cancel) {
        ModalTitle(title)
        if (updating) {
            CssText(L10n.Write.PublishPanel.updateHint, AppFonts.Family.Body, 14f, lineHeight = 1.7f, color = Tokens.TextMuted)
        }
        if (insightLoading) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SketchLoader(28.dp)
                BasicText(L10n.Write.PublishPanel.insightLoading, style = AppFonts.body(14f, color = Tokens.TextMuted))
            }
        } else insight?.let {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OrganicIcon(IconName.Sparkle, Modifier.padding(top = 3.dp), size = 16.dp, color = Tokens.Terracotta)
                BasicText(L10n.Write.PublishPanel.insight(it), style = AppFonts.body(14f))
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionLabel(L10n.Write.Visibility.label)
            Column {
                VisibilityRow(L10n.Write.Visibility.public, IconName.Globe, 71.0, visibility == "public") { visibility = "public" }
                WavyDivider(seed = 49.0, modifier = Modifier.padding(vertical = 2.dp))
                VisibilityRow(L10n.Write.Visibility.private, IconName.Lock, 73.0, visibility == "private") { visibility = "private" }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicText(L10n.Write.PublishPanel.anonymousToggle, style = AppFonts.body(14f), modifier = Modifier.weight(1f))
                OrganicToggle(anonymous, { anonymous = it }, L10n.Write.PublishPanel.anonymousToggle, seed = 57.0)
            }
            // Seeing is understanding: the exact card head the world will get.
            val me = session.me
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (anonymous) HandDrawnAvatar("·", color = Tokens.CreamDark, size = 34.dp, seed = 97.0)
                else if (me != null) HandDrawnAvatar(me.initials, me.avatarUrl, OklchColor.parse(me.accentColor) ?: Tokens.TerracottaLight, 34.dp, 7.0)
                BasicText(
                    if (anonymous) L10n.Write.PublishPanel.anonymousName else me?.handle ?: "",
                    style = AppFonts.body(14f, 600, color = if (anonymous) Tokens.TextMuted else Tokens.Text),
                )
            }
            // The hint counts visits, not the toggle (useHint('anonymous-publish')).
            if (showsAnonymousHint) BasicText(L10n.Write.PublishPanel.anonymousHint, style = AppFonts.body(Tokens.HintSize, color = Tokens.TextMuted))
        }
        WavyDivider(seed = 47.0)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val label = if (updating) {
                if (pending) L10n.Write.PublishPanel.updating else L10n.Write.PublishPanel.update
            } else {
                if (pending) L10n.Write.PublishPanel.publishing else L10n.Write.PublishPanel.publish
            }
            OrganicButton(label, variant = ButtonVariant.Solid, small = true, enabled = !pending) {
                // The server refuses a card without a title; say so in the writer's words.
                if (model.values.title.isBlank()) {
                    error = L10n.Write.titleRequired
                    return@OrganicButton
                }
                pending = true
                error = null
                scope.launch {
                    try {
                        onPublished(if (updating) model.applyEdit(visibility, anonymous) else model.publish(visibility, anonymous))
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: ApiFailure) {
                        error = e.message
                    } catch (e: Exception) {
                        error = e.message
                    }
                    pending = false
                }
            }
            OrganicButton(L10n.Write.PublishPanel.cancel, variant = ButtonVariant.Text, small = true, enabled = !pending, onClick = onCancel)
        }
        error?.let { BasicText(it, style = AppFonts.body(12f, color = Tokens.Terracotta)) }
    }
}

@Composable
private fun VisibilityRow(label: String, icon: IconName, seed: Double, selected: Boolean, onClick: () -> Unit) {
    val color = if (selected) Tokens.Terracotta else Tokens.Text
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .plainClickable(role = Role.RadioButton, onClick = onClick)
            .semantics { this.selected = selected },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OrganicIcon(icon, size = 16.dp, color = if (selected) Tokens.Terracotta else Tokens.TextMuted)
        BasicText(label, style = AppFonts.body(15f, if (selected) 600 else 400, color = color), modifier = Modifier.weight(1f))
        OrganicRadio(selected, seed)
    }
}
