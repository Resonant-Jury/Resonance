package com.resonance.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.resonance.app.DraftService
import com.resonance.app.DraftValues
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.WritingApi
import com.resonance.kit.images.AccentHue
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.ByteArrayOutputStream
import java.net.URL
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * The writing screen's state and its work (CardEditor): the draft's values,
 * autosave a moment after typing stops, AI tags, the cover photo, publishing.
 * Opened on a published card it revises instead: autosave buffers the
 * working copy privately and "Save changes" puts it in front of readers.
 * The twin of iOS's WriteModel. It owns its scope so the last save still
 * lands after the screen is gone ([leave]).
 */
class WriteModel(
    private val drafts: DraftService?,
    private val writing: WritingApi,
    referenceCardId: String?,
    val editor: StoryEditorBridge,
    /** One of your cards to edit: a draft to resume, or a live card to revise. */
    opened: DraftService.OpenedCard? = null,
) {
    /** The card this one resonates with, if any (a response card). */
    val referenceCardId: String? = opened?.referenceCardId ?: referenceCardId
    var values by mutableStateOf(opened?.values ?: DraftValues())
        private set
    var draftId: String? = opened?.id
        private set
    var savedAt by mutableStateOf<LocalTime?>(null)
        private set
    /** Revising a live card (fixed for the model's lifetime, as on the web). */
    val isPublished: Boolean = opened?.isPublished ?: false
    /** A revision is waiting in the buffer — only its author can see it. */
    var hasPendingEdit by mutableStateOf(opened?.hasPendingEdit ?: false)
        private set
    /** The published card's slug (its page lives at slug ?: id). */
    val slug: String? = opened?.slug
    private val editing = opened != null
    var tagDraft by mutableStateOf("")
    var suggestingTags by mutableStateOf(false)
        private set
    var tagError by mutableStateOf<String?>(null)
        private set
    var uploadingCover by mutableStateOf(false)
        private set
    var uploadingInline by mutableStateOf(false)
        private set
    var generating by mutableStateOf(false)
        private set
    /** The illustration's in-progress pass while it renders. */
    var partialPreview by mutableStateOf<Bitmap?>(null)
        private set
    var mediaError by mutableStateOf<String?>(null)
        private set

    /** Uploading or illustrating — the image surface waits either way. */
    val mediaBusy: Boolean get() = uploadingCover || generating
    /** The web's canGenerate: there is a story to draw from. */
    val canGenerate: Boolean get() = values.story.isNotBlank() && !mediaBusy

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var saveJob: Job? = null
    /** Writes run one after another, so a slow create can't race the next update. */
    private val writes = Mutex()
    /** What the last successful write stored; an unchanged working copy isn't written again (and opening a card writes nothing). */
    private var lastSaved: DraftValues? = opened?.values

    init {
        opened?.let { editor.setMarkdown(it.values.story) }
        editor.onChange = { story -> update { copy(story = story) } }
    }

    /** The page title: a new card, a draft being resumed, or a live card being revised. */
    val title: String
        get() = when {
            !editing -> L10n.Write.title
            isPublished -> L10n.Write.editPublishedTitle
            else -> L10n.Write.editTitle
        }

    /** The card's page: its slug, or its id (a draft, or a card without one). */
    val routeKey: String? get() = slug ?: draftId

    fun update(change: DraftValues.() -> DraftValues) {
        val next = values.change()
        if (next == values) return
        values = next
        scheduleSave()
    }

    // Autosave

    private fun scheduleSave() {
        saveJob?.cancel()
        // Only the wait can be cancelled: a write that has begun always finishes, so
        // a create can't lose its id and a second save can't create a duplicate draft.
        saveJob = scope.launch {
            delay(AUTOSAVE_DELAY_MS)
            save()
        }
    }

    /** Writes the draft now (creating it the first time there is something to keep); returns its id. */
    suspend fun saveNow(): String? {
        saveJob?.cancel()
        return save()
    }

    /** The app is going to the background: what is written now is saved now, not 1.5s later (the web's visibilitychange flush). */
    fun flush() {
        scope.launch { saveNow() }
    }

    private suspend fun save(): String? = writes.withLock { withContext(NonCancellable) { write() } }

    private suspend fun write(): String? {
        val drafts = drafts ?: return draftId
        val v = values
        if (v.isEmpty && draftId == null) return null
        if (v == lastSaved) return draftId
        try {
            val id = draftId
            if (isPublished && id != null) {
                // A live card: the revision waits privately in its buffer.
                drafts.saveEdit(id, v)
                hasPendingEdit = true
            } else if (id != null) {
                drafts.update(id, v)
            } else {
                draftId = drafts.create(v, Strings.language.tag, referenceCardId)
            }
            lastSaved = v
            savedAt = LocalTime.now()
        } catch (e: Exception) {
            // Kept in memory; the next edit (or leaving) tries again.
        }
        return draftId
    }

    /** The screen is going away: the last edit is saved, then the model stops. */
    fun leave() {
        scope.launch {
            try {
                saveNow()
            } finally {
                editor.destroy()
                scope.cancel()
            }
        }
    }

    /**
     * The first-card guide's question, as the story to write against: it is
     * the starting point, not writing — nothing is saved until the user adds to it.
     */
    fun seed(story: String) {
        editor.setMarkdown(story)
        val before = values
        values = before.copy(story = story)
        // Nothing else waiting to be written: the seed becomes the baseline. (Anything the
        // user had typed before picking is still owed a save, so its timer runs.)
        if (before == lastSaved || (draftId == null && before.isEmpty)) lastSaved = values else scheduleSave()
    }

    /**
     * One line of plain reassurance under the page title: what has happened
     * and, for a live card, what has not happened yet.
     */
    val saveStatus: String
        get() {
            val time = savedAt?.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(Strings.language.locale))
            if (isPublished) {
                if (time != null) return L10n.Write.editBuffered(time)
                return if (hasPendingEdit) L10n.Write.editBufferedIdle else L10n.Write.editLiveHint
            }
            return if (time != null) L10n.Write.autosaved(time) else L10n.Write.autosaveHint
        }

    // Tags

    fun addTag() {
        val tag = tagDraft.trim()
        tagDraft = ""
        if (tag.isEmpty() || tag in values.tags) return
        update { copy(tags = tags + tag) }
    }

    fun removeTag(tag: String) = update { copy(tags = tags - tag) }

    /** Two or three from the model, informed by the author's past tags; new ones only. */
    fun suggestTags() {
        if (suggestingTags) return
        tagError = null
        suggestingTags = true
        scope.launch {
            try {
                val suggested = writing.suggestTags(values.title, values.story, values.tags)
                update { copy(tags = tags + suggested.filter { it !in tags }) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                tagError = L10n.Write.tagsSuggestError
            } finally {
                suggestingTags = false
            }
        }
    }

    // Images

    /** The cover: compressed here, uploaded, and its hue read from the local pixels. */
    fun setCover(context: Context, uri: Uri) {
        if (mediaBusy) return
        mediaError = null
        uploadingCover = true
        scope.launch {
            try {
                val (jpeg, hue) = withContext(Dispatchers.Default) {
                    val bitmap = CoverImage.decode(context, uri)
                    CoverImage.jpeg(bitmap) to CoverImage.accentHue(bitmap)
                }
                val url = writing.upload(jpeg, "cover.jpg")
                update { copy(imageUrl = url, imageLabel = "cover.jpg", accentHue = hue) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mediaError = L10n.Write.mediaUploadError
            } finally {
                uploadingCover = false
            }
        }
    }

    /**
     * An illustration drawn from the story (/api/generate-image): its previews
     * show as they arrive; the stored picture becomes the cover, its hue read
     * from that picture (or, failing that, the last preview).
     */
    fun generateCover() {
        if (!canGenerate) return
        mediaError = null
        generating = true
        scope.launch {
            try {
                var stored: String? = null
                var failed = false
                writing.illustrate(values.story).collect { event ->
                    when (event) {
                        is WritingApi.IllustrationEvent.Partial ->
                            withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(event.png, 0, event.png.size) }?.let { partialPreview = it }
                        is WritingApi.IllustrationEvent.Done -> stored = event.url
                        WritingApi.IllustrationEvent.Failed -> failed = true
                    }
                }
                val url = stored
                if (failed || url == null) {
                    mediaError = L10n.Write.mediaGenerateError
                    return@launch
                }
                val preview = partialPreview
                val hue = withContext(Dispatchers.IO) {
                    val picture = runCatching { URL(url).readBytes() }.getOrNull()?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
                    (picture ?: preview)?.let(CoverImage::accentHue)
                }
                update { copy(imageUrl = url, imageLabel = L10n.Write.mediaGeneratedLabel, accentHue = hue) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mediaError = L10n.Write.mediaGenerateError
            } finally {
                generating = false
                partialPreview = null
            }
        }
    }

    fun removeCover() = update { copy(imageUrl = null, imageLabel = null, accentHue = null) }

    /** A photo inside the story (the toolbar's Insert image). */
    fun insertImage(context: Context, uri: Uri) {
        if (uploadingInline) return
        uploadingInline = true
        scope.launch {
            try {
                val jpeg = withContext(Dispatchers.Default) { CoverImage.jpeg(CoverImage.decode(context, uri)) }
                val url = writing.upload(jpeg, "photo.jpg")
                editor.exec("insertImage", mapOf("src" to url, "alt" to "photo.jpg"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mediaError = L10n.Write.Editor.imageUploadError
            } finally {
                uploadingInline = false
            }
        }
    }

    // Publish

    /** Saves the choices with the draft, then publishes it; returns where the card lives. */
    suspend fun publish(visibility: String, anonymous: Boolean): String {
        update { copy(visibility = visibility, anonymous = anonymous) }
        val id = saveNow() ?: throw ApiFailure("invalid_request", "Nothing to publish.", null)
        val result = writing.publish(id)
        return result.slug ?: result.id
    }

    /**
     * Save changes: the working copy (with the panel's choices) goes into the
     * buffer, then the server makes it the live card — the moment an edit
     * reaches readers. The publish date stays. Returns where the card lives.
     */
    suspend fun applyEdit(visibility: String, anonymous: Boolean): String {
        update { copy(visibility = visibility, anonymous = anonymous) }
        val id = draftId ?: throw ApiFailure("not_found", "No such card.", null)
        saveNow()
        // The server applies what is in the buffer: a save that didn't land must stop here.
        if (values != lastSaved) throw ApiFailure("internal", L10n.Native.saveError, null)
        val result = writing.applyEdit(id)
        hasPendingEdit = false
        return result.slug ?: slug ?: id
    }

    /** Discard changes: the buffer goes; the live card was never touched. Returns where the card lives. */
    suspend fun discardEdit(): String {
        val id = draftId
        val drafts = drafts
        if (id == null || drafts == null) throw ApiFailure("not_found", "No such card.", null)
        saveJob?.cancel()
        // Behind any autosave in flight, so a straggling write can't re-create the buffer.
        writes.withLock { drafts.discardEdit(id) }
        hasPendingEdit = false
        lastSaved = values
        return slug ?: id
    }

    companion object {
        /** CardEditor's AUTOSAVE_DELAY_MS (leaving, or going to the background, saves at once). */
        const val AUTOSAVE_DELAY_MS = 1500L
        const val TITLE_MAX = 60
    }
}

/**
 * A photo on its way up: decoded small enough, re-encoded on the device as
 * the web compresses before /api/upload, and its accent hue read from a
 * 32×32 thumbnail (lib/images/accentHue).
 */
object CoverImage {
    private const val MAX_SIDE = 2048

    /** A software bitmap (its pixels are read) at most 2048px on the long side. */
    fun decode(context: Context, uri: Uri): Bitmap =
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val long = max(info.size.width, info.size.height)
            if (long > MAX_SIDE) {
                val scale = MAX_SIDE.toFloat() / long
                decoder.setTargetSize((info.size.width * scale).roundToInt(), (info.size.height * scale).roundToInt())
            }
        }

    /** JPEG at 0.85 — well under the upload's 8 MB cap. */
    fun jpeg(bitmap: Bitmap): ByteArray = ByteArrayOutputStream().use {
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it)
        it.toByteArray()
    }

    fun accentHue(bitmap: Bitmap): Double? {
        val thumb = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
        val pixels = IntArray(32 * 32)
        thumb.getPixels(pixels, 0, 32, 0, 0, 32, 32)
        return AccentHue.of(pixels)
    }
}
