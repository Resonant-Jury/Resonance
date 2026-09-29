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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.BuildConfig
import com.resonance.app.DebugLaunch
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.Mixes
import com.resonance.design.ModalActions
import com.resonance.design.ModalBody
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
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
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Writing a card (the web's write page on a phone): the one-line title, the
 * story in the editor island under the web's text toolbar, tags with the AI
 * pill, the cover photo, then Publish (through the publish panel) or leave
 * with the draft saved. Drafts save themselves a moment after typing stops.
 * The twin of iOS's WriteScreen; `onPublished` gets the card's slug or id.
 */
@Composable
fun WriteScreen(session: Session, referenceCardId: String?, close: () -> Unit, onPublished: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val model = remember {
        WriteModel(session.drafts, session.writing, referenceCardId, StoryEditorBridge(context, L10n.Write.storyPlaceholder)).apply {
            // Debug `writeTitle` / `writeStory` extras fill a new card (screen checks; the emulator's keyboard is slow to drive).
            if (BuildConfig.DEBUG) {
                DebugLaunch.writeTitle?.let { t -> update { copy(title = t) } }
                DebugLaunch.writeStory?.let { s ->
                    editor.setMarkdown(s)
                    update { copy(story = s) }
                }
            }
        }
    }
    // Whatever way the screen goes (close, back, a tab switch), the last edit is saved.
    DisposableEffect(model) { onDispose { model.leave() } }
    var publishing by remember { mutableStateOf(false) }
    var pickingCard by remember { mutableStateOf(false) }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { model.setCover(context, it) } }
    val inlinePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { model.insertImage(context, it) } }
    val images = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
    val leave: () -> Unit = {
        model.editor.releaseKeyboard()
        scope.launch {
            model.saveNow()
            close()
        }
    }
    BackHandler(onBack = leave)

    Column(
        Modifier
            .fillMaxSize()
            .cream()
            // The page scrolls under a cream status bar, not through the clock.
            .statusBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        Header(model, leave)
        OrganicTextField(
            L10n.Write.coreLabel, model.values.title, { t -> model.update { copy(title = t) } },
            placeholder = L10n.Write.corePlaceholder, seed = 11.0, multiline = true, minLines = 2, display = true, maxLength = WriteModel.TITLE_MAX,
        )
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionLabel(L10n.Write.storyLabel)
            StoryEditorField(model.editor, onInsertCard = { pickingCard = true }, onInsertImage = { inlinePicker.launch(images) }, uploadingImage = model.uploadingInline)
        }
        Tags(model)
        Cover(model) { coverPicker.launch(images) }
        Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            OrganicButton(L10n.Write.publish, enabled = model.values.title.isNotBlank()) { publishing = true }
            OrganicButton(L10n.Write.saveDraftAndLeave, variant = ButtonVariant.Ghost, onClick = leave)
        }
    }

    if (pickingCard) InsertCardModal(session, onPick = { card ->
        pickingCard = false
        model.editor.exec("insertCard", mapOf("href" to "/card/${card.slug ?: card.id}", "title" to card.title))
    }) { pickingCard = false }
    if (publishing) PublishPanel(session, model, onPublished = { key ->
        publishing = false
        model.editor.releaseKeyboard()
        onPublished(key)
    }) { publishing = false }
}

@Composable
private fun Header(model: WriteModel, leave: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BasicText(L10n.Write.title, style = AppFonts.heading(28f, lineHeight = 1.2f), modifier = Modifier.weight(1f).semantics { heading() })
            // Leaving keeps what's written: the draft is saved on the way out.
            OrganicButton(L10n.Write.closeEditor, variant = ButtonVariant.Ghost, icon = IconName.Close, iconOnly = true, onClick = leave)
        }
        BasicText(model.saveStatus, style = AppFonts.body(14f, color = Tokens.TextMuted))
    }
}

@Composable
private fun SectionLabel(text: String) {
    BasicText(text.uppercase(), style = AppFonts.body(Tokens.LabelSize, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em))
}

/**
 * Tags: the chosen ones (tap to remove), the AI pill while nothing is being
 * typed, and the tag input with its Add.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Tags(model: WriteModel) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel(L10n.Write.tagsLabel)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            model.values.tags.forEach { tag ->
                val seed = (tag.sumOf { it.code } % 97).toDouble()
                Row(
                    Modifier
                        .drawWithCache {
                            val o = WobRectShape(14.0, seed).createOutline(size, layoutDirection, this)
                            val s = Stroke(Tokens.InkLight.toPx())
                            onDrawBehind {
                                drawOutline(o, Tokens.TerracottaLight)
                                drawOutline(o, Tokens.GhostStroke.copy(alpha = 0.5f), style = s)
                            }
                        }
                        .plainClickable(role = Role.Button, onClickLabel = L10n.Write.mediaRemove) { model.removeTag(tag) }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    BasicText(tag, style = AppFonts.body(14f, 600, lineHeight = 1.3f))
                    OrganicIcon(IconName.Close, size = 12.dp, strokeWidth = Tokens.Ink.value)
                }
            }
            if (model.tagDraft.isBlank()) {
                OrganicButton(
                    if (model.suggestingTags) L10n.Write.tagsSuggesting else L10n.Write.tagsSuggest,
                    variant = ButtonVariant.Ghost, icon = IconName.Plus, small = true, enabled = !model.suggestingTags,
                ) { model.suggestTags() }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier
                    .weight(1f)
                    .drawWithCache {
                        val o = WobRectShape(Tokens.RadiusMd.toDouble(), 19.0).createOutline(size, layoutDirection, this)
                        val s = Stroke(Tokens.Ink.toPx())
                        onDrawBehind {
                            drawOutline(o, Tokens.Cream)
                            drawOutline(o, Tokens.FieldBorder, style = s)
                        }
                    }
                    .padding(horizontal = Tokens.FieldPadX.dp, vertical = Tokens.FieldPadY.dp),
            ) {
                val text = AppFonts.body(15f, lineHeight = 1.6f)
                if (model.tagDraft.isEmpty()) BasicText(L10n.Write.tagsPlaceholder, style = text.copy(color = Tokens.Placeholder))
                BasicTextField(
                    model.tagDraft, { model.tagDraft = it },
                    textStyle = text,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { model.addTag() }),
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = L10n.Write.tagsLabel },
                )
            }
            OrganicButton(L10n.Write.tagsAdd, variant = ButtonVariant.Outline, icon = IconName.Plus, small = true, enabled = model.tagDraft.isNotBlank()) { model.addTag() }
        }
        model.tagError?.let { BasicText(it, style = AppFonts.body(13f, color = Mixes.Danger)) }
    }
}

/**
 * The cover: the picked photo in its hand-drawn frame (tap × to remove), or
 * the dashed drop surface that opens the photo picker.
 */
@Composable
private fun Cover(model: WriteModel, pick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel(L10n.Write.mediaLabel)
        val url = model.values.imageUrl
        if (url != null) {
            Box(Modifier.fillMaxWidth().aspectRatio(1 / 0.56f)) {
                OrganicImage(url, seed = 31.0, radius = 16.0, modifier = Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize().background(Tokens.CreamDark)) }
                Box(Modifier.align(Alignment.TopEnd).padding(8.dp).background(Tokens.Cream.copy(alpha = 0.9f), CircleShape)) {
                    OrganicButton(L10n.Write.mediaRemove, variant = ButtonVariant.Ghost, icon = IconName.Close, iconOnly = true) { model.removeCover() }
                }
            }
        } else {
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 150.dp)
                    .drawBehind {
                        val o = WobRectShape(16.0, 31.0).createOutline(size, layoutDirection, this)
                        drawOutline(o, Tokens.FieldBorder, style = Stroke(
                            Tokens.Ink.toPx(), cap = StrokeCap.Round,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(7.dp.toPx(), 6.dp.toPx())),
                        ))
                    }
                    .plainClickable(role = Role.Button, onClickLabel = L10n.Write.mediaPlaceholder) { if (!model.uploadingCover) pick() }
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
            ) {
                if (model.uploadingCover) {
                    SketchLoader(56.dp)
                    BasicText(L10n.Write.mediaUploading, style = AppFonts.body(14f, 600, color = Tokens.TextMuted))
                } else {
                    OrganicIcon(IconName.Image, size = 26.dp, color = Tokens.Terracotta)
                    BasicText(L10n.Write.mediaPlaceholder, style = AppFonts.body(14f, 600).copy(textAlign = TextAlign.Center))
                    BasicText(L10n.Write.mediaHint, style = AppFonts.body(12f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
                }
            }
        }
        model.mediaError?.let { BasicText(it, style = AppFonts.body(13f, color = Mixes.Danger)) }
    }
}

/**
 * The publish panel (PublishPanel.tsx): the insight echo, who can see it,
 * publishing anonymously with the card head it will get, then Publish.
 */
@Composable
private fun PublishPanel(session: Session, model: WriteModel, onPublished: (String) -> Unit, onCancel: () -> Unit) {
    val scope = rememberCoroutineScope()
    var visibility by remember { mutableStateOf(if (model.values.visibility == "private") "private" else "public") }
    var anonymous by remember { mutableStateOf(model.values.anonymous) }
    var insight by remember { mutableStateOf<String?>(null) }
    var insightLoading by remember { mutableStateOf(true) }
    var pending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        insight = runCatching { session.writing.insight(model.values.title, model.values.story) }.getOrNull()
        insightLoading = false
    }

    OrganicModal(if (pending) null else onCancel, L10n.Write.PublishPanel.title, seed = 29.0, closeLabel = L10n.Write.PublishPanel.cancel) {
        ModalTitle(L10n.Write.PublishPanel.title)
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
            if (anonymous) BasicText(L10n.Write.PublishPanel.anonymousHint, style = AppFonts.body(Tokens.HintSize, color = Tokens.TextMuted))
        }
        WavyDivider(seed = 47.0)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OrganicButton(if (pending) L10n.Write.PublishPanel.publishing else L10n.Write.PublishPanel.publish, small = true, enabled = !pending) {
                pending = true
                error = null
                scope.launch {
                    try {
                        onPublished(model.publish(visibility, anonymous))
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
            OrganicButton(L10n.Write.PublishPanel.cancel, variant = ButtonVariant.Ghost, small = true, enabled = !pending, onClick = onCancel)
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

/** InsertCardModal: one of your public cards, dropped in as an embedded card. */
@Composable
private fun InsertCardModal(session: Session, onPick: (FeedCard) -> Unit, onCancel: () -> Unit) {
    var cards by remember { mutableStateOf<List<FeedCard>?>(null) }
    LaunchedEffect(Unit) { cards = runCatching { session.reading.cardBox(TabGetCardBox.published) }.getOrDefault(emptyList()) }
    OrganicModal(onCancel, L10n.Write.Editor.CardModal.title, seed = 41.0, closeLabel = L10n.Write.Editor.CardModal.cancel) {
        ModalTitle(L10n.Write.Editor.CardModal.title)
        ModalBody(L10n.Write.Editor.CardModal.subtitle)
        val list = cards
        if (list == null) {
            Box(Modifier.fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) { SketchLoader(40.dp) }
        } else {
            if (list.isEmpty()) OrganicListEmpty(L10n.Write.Editor.CardModal.empty, modifier = Modifier.padding(vertical = 12.dp))
            Column {
                list.forEachIndexed { i, card ->
                    if (i > 0) WavyDivider(seed = (60 + i * 7).toDouble(), modifier = Modifier.padding(vertical = 2.dp))
                    BasicText(
                        card.title,
                        style = AppFonts.heading(16f, lineHeight = 1.3f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 44.dp)
                            .plainClickable(role = Role.Button) { onPick(card) }
                            .padding(vertical = 12.dp),
                    )
                }
            }
        }
        ModalActions { OrganicButton(L10n.Write.Editor.CardModal.cancel, variant = ButtonVariant.Ghost, small = true, onClick = onCancel) }
    }
}
