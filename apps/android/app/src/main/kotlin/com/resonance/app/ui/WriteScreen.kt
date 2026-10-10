package com.resonance.app.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import com.resonance.app.thoughtmap.ThoughtMapScreen
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout

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
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.ui.graphics.asImageBitmap
import com.resonance.design.HandDrawnImage
import com.resonance.design.OrganicVerticalRule
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
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Ease
import androidx.compose.animation.core.tween
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
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
import com.resonance.design.ModalActionsTop
import com.resonance.design.ModalError
import com.resonance.design.ModalBody
import com.resonance.design.ModalGap
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
import com.resonance.design.OrganicTextField
import com.resonance.design.OrganicToggle
import com.resonance.design.toggleRow
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
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
 * story in the editor island under the web's text toolbar, tags in one field
 * (typed, or suggested by the model), the cover photo, then Publish (through
 * the publish panel) or leave with the draft saved. Drafts save themselves a moment after typing stops.
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
                    OrganicEmptyState(title = L10n.Card.NotFound.title, titleSize = 24f, actionTitle = L10n.Card.NotFound.back, onAction = close, action = EmptyAction.Outline, verticalPadding = 58.dp)
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
    // The writer takes the whole window (the full-width header gives way). From 1200 wide the thought map
    // sits beside it, the editor in the window's right half (design note §12); otherwise the editor
    // alone, in a centred reading column on anything wider than a phone. The editor keeps its place
    // in the tree either way, so a rotation or a resize across 1200 keeps the story's editor as it is.
    val window = LocalWindowLayout.current
    val split = window.writerSplit
    val compactWindow = window.cls == LayoutClass.Compact
    val pad = window.pad
    val columnMax = Tokens.Measure.dp + pad * 2
    val editorWidth = minOf(if (split) window.width / 2 else window.width, if (compactWindow) window.width else columnMax)
    Box(Modifier.fillMaxSize().cream().imePadding()) { Row(Modifier.fillMaxSize()) {
    if (split) Box(Modifier.weight(1f).fillMaxHeight().padding(top = inlineBarTop() - HeaderEdgeHeight)) {
        ThoughtMapScreen(session, session.thoughtMap, open = {}, leave = {}, embedded = true)
    }
    Column(
        Modifier
            .then(if (split) Modifier.width(window.width / 2).editorBoundary(inlineBarTop()) else Modifier.fillMaxWidth())
            .fillMaxHeight()
            .verticalScroll(scroll)
            .then(if (compactWindow) Modifier else Modifier.fillMaxWidth().wrapContentWidth().widthIn(max = columnMax))
            // The bar lies over the page, so what scrolls shows right up to its pen line.
            .padding(top = inlineBarTop())
            .padding(start = pad, end = pad, top = 16.dp, bottom = 48.dp),
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
        WriteActions(
            compact = editorWidth < WIDE_SCREEN_DP.dp,
            error = actionError,
            primary = { modifier ->
                if (model.isPublished) {
                    OrganicButton(L10n.Write.saveChanges, modifier, loading = discarding) {
                        actionError = null
                        publishing = true
                    }
                } else {
                    OrganicButton(L10n.Write.publish, modifier) {
                        actionError = null
                        publishing = true
                    }
                }
            },
            secondary = when {
                model.isPublished && model.hasPendingEdit -> ({ modifier ->
                    OrganicButton(L10n.Write.discardChanges, modifier, variant = ButtonVariant.Tonal, enabled = !discarding) {
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
                })
                !model.isPublished -> ({ modifier -> OrganicButton(L10n.Write.saveDraftAndLeave, modifier, variant = ButtonVariant.Tonal, onClick = leave) })
                else -> null
            },
        )
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
 * Tags (CardEditor's TagField): one field holding the chosen tags, the input and
 * its one action (AI suggestions, or Add once something is typed), and under it
 * a muted line on how — the error in its place when there is one.
 */
@Composable
private fun Tags(model: WriteModel) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel(L10n.Write.tagsLabel)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            TagField(
                tags = model.values.tags,
                draft = model.tagDraft,
                onDraftChange = model::typeTag,
                placeholder = L10n.Write.tagsPlaceholder,
                suggesting = model.suggestingTags,
                onRemove = model::removeTag,
                onRemoveLast = model::removeLastTag,
                onAdd = model::addTag,
                onSuggest = model::suggestTags,
            )
            val error = model.tagError
            BasicText(
                error ?: L10n.Write.tagsHelp,
                style = AppFonts.body(Tokens.HintSize, lineHeight = 1.5f, color = if (error != null) Tokens.Terracotta else Tokens.TextMuted),
            )
        }
    }
}

/**
 * The writer's closing actions: the verb (solid) and the way out (Save draft and leave / Discard
 * changes, tonal), one height and shape. On a phone (anything under [WIDE_SCREEN_DP]) they don't
 * fit one row, so they stack at one width — the verb over the way out, 10 apart — the error centred
 * under both; a wide screen keeps them in a row. The web's `.actionsStack`.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WriteActions(
    compact: Boolean,
    error: String?,
    primary: @Composable (Modifier) -> Unit,
    secondary: (@Composable (Modifier) -> Unit)?,
) {
    Column(
        Modifier.padding(top = 6.dp),
        horizontalAlignment = if (compact) Alignment.CenterHorizontally else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(if (compact) 10.dp else 8.dp),
    ) {
        if (compact) {
            primary(Modifier.fillMaxWidth())
            secondary?.invoke(Modifier.fillMaxWidth())
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                primary(Modifier)
                secondary?.invoke(Modifier)
            }
        }
        error?.let {
            BasicText(it, style = AppFonts.body(12f, color = Tokens.Terracotta).copy(textAlign = if (compact) TextAlign.Center else TextAlign.Start))
        }
    }
}

/** The web's 640px, near enough in dp: from here the writer's actions keep their row. */
private const val WIDE_SCREEN_DP = 600

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
    // As it is: a connections card shows neither row picked, and keeps its audience unless one is —
    // except an anonymous one, which is public or only yours (the server refuses it for connections only).
    var anonymous by remember { mutableStateOf(model.values.anonymous) }
    var visibility by remember { mutableStateOf(anonymousVisibility(model.values.visibility, model.values.anonymous)) }
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
        if (updating) {
            ModalTitle(title)
            CssText(L10n.Write.PublishPanel.updateHint, AppFonts.Family.Body, 14f, lineHeight = 1.7f, color = Tokens.TextMuted)
        } else {
            // The echo grows (or goes, with nothing to say) smoothly, its gap above it included, so the
            // controls under it glide rather than jump.
            Column(Modifier.fillMaxWidth().animateContentSize(tween(220, easing = Ease))) {
                ModalTitle(title)
                if (insightLoading) {
                    Row(Modifier.padding(top = ModalGap), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SketchLoader(28.dp)
                        BasicText(L10n.Write.PublishPanel.insightLoading, style = AppFonts.body(14f, color = Tokens.TextMuted))
                    }
                } else insight?.let {
                    Row(Modifier.padding(top = ModalGap), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OrganicIcon(IconName.Sparkle, Modifier.padding(top = 3.dp), size = 16.dp, color = Tokens.Terracotta)
                        BasicText(L10n.Write.PublishPanel.insight(it), style = AppFonts.body(14f))
                    }
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionLabel(L10n.Write.Visibility.label)
            // A segmented choice with no pen line (its options are buttons): a quiet paper-dark track shows
            // the control's extent, the chosen side wears the tonal peach with the deep label (4.8:1), the
            // other a muted ink deep enough to read on the track. A connections card shows neither chosen.
            SegmentedActionBar(
                listOf("public" to IconName.Globe, "private" to IconName.Lock).map { (v, icon) ->
                    val chosen = visibility == v
                    Segment(
                        v, if (v == "public") L10n.Write.Visibility.public else L10n.Write.Visibility.private, icon,
                        fill = if (chosen) Mixes.ButtonTonal else null,
                        textColor = if (chosen) Mixes.ButtonOnTonal else VisibilityInk,
                        press = Color.Black.copy(alpha = 0.05f),
                        selected = chosen,
                    ) { visibility = v }
                },
                fill = Tokens.CreamDark,
                enabled = !pending,
            )
            // Never for connections only while anonymous (who could read it would say who wrote it): say so.
            // Its room is kept while it isn't said, so flipping the switch below never moves the switch.
            BasicText(
                L10n.Write.PublishPanel.anonymousVisibility,
                style = AppFonts.body(Tokens.HintSize, color = Tokens.TextMuted),
                modifier = if (anonymous) Modifier else Modifier.drawWithContent { }.clearAndSetSemantics { },
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // The whole row is the switch (the web's <label className={toggleRow}>): a tap on the words flips it too.
            Row(
                Modifier.toggleRow(anonymous) {
                    anonymous = it
                    visibility = anonymousVisibility(visibility, it)
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                BasicText(L10n.Write.PublishPanel.anonymousToggle, style = AppFonts.body(14f), modifier = Modifier.weight(1f))
                OrganicToggle(anonymous, seed = 57.0)
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
        // The foot every dialog shares: why the last try failed right above it, then 再想想 the tonal way
        // out and the verb solid and rightmost; the row rests while it publishes.
        error?.let { ModalError(it) }
        // The verb keeps its words while it works: its loader says so (design note B6).
        val label = if (updating) L10n.Write.PublishPanel.update else L10n.Write.PublishPanel.publish
        ModalActions(L10n.Write.PublishPanel.cancel, onCancel, label, busy = pending, topPadding = publishActionsTop(afterError = error != null), onVerb = {
            // The server refuses a card without a title; say so in the writer's words.
            if (model.values.title.isBlank()) {
                error = L10n.Write.titleRequired
            } else if (!pending) {
                pending = true
                error = null
                scope.launch {
                    try {
                        val audience = anonymousVisibility(visibility, anonymous)
                        onPublished(if (updating) model.applyEdit(audience, anonymous) else model.publish(audience, anonymous))
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        error = publishError(e, updating)
                    }
                    pending = false
                }
            }
        })
    }
}

/** The visibility choice's other side: color-mix(text-muted, black 10%), deep enough to read on the paper-dark track. */
private val VisibilityInk = OklchColor.parse("oklch(46.8% 0.036 70)") ?: Tokens.TextMuted

/**
 * The air the publish panel's foot keeps above itself: none under the divider (the column's own
 * gap is the web's), but the actions' usual [ModalActionsTop] while an error line stands over
 * them — so the line sits [com.resonance.design.ModalErrorGap] above the buttons, as in every
 * other dialog, not crowded down to 8.
 */
internal fun publishActionsTop(afterError: Boolean): Dp = if (afterError) ModalActionsTop else 0.dp

/**
 * Why publishing (or saving the changes to a published card, [updating]) didn't go through, in the
 * panel's own words — never the server's English: a card gone (deleted elsewhere) can't be found,
 * so trying again won't help; the day's publishing used up (429 `rate_limited`) waits for
 * tomorrow; anything else — a refusal, the server's trouble, the network, the changes that didn't
 * save first — that it didn't publish, to try again (an update: that it didn't save).
 */
internal fun publishError(e: Exception, updating: Boolean): String = when {
    e is ApiFailure && (e.isNotFound || e.status == 404) -> L10n.Card.NotFound.title
    e is ApiFailure && (e.code == "rate_limited" || e.status == 429) -> L10n.Write.PublishPanel.rateLimited
    updating -> L10n.Native.saveError
    else -> L10n.Write.PublishPanel.failed
}

/**
 * Who sees a card that is [anonymous]: an anonymous card is public or only its author's, never for
 * connections only (who would know whose it is), so one kept for connections becomes public; any
 * other choice stands.
 */
internal fun anonymousVisibility(visibility: String, anonymous: Boolean): String =
    if (anonymous && visibility == "connections") "public" else visibility

/** The editor pane's leading edge beside the map: a 1-wide line in the fields' border ink, from the bar's pen line down. */
private fun Modifier.editorBoundary(barBottom: Dp): Modifier = drawBehind {
    val top = (barBottom - (1.4f + Tokens.Ink.value).dp).toPx()
    drawLine(Tokens.FieldBorder, Offset(0.5f, top), Offset(0.5f, size.height), strokeWidth = 1.dp.toPx())
}
