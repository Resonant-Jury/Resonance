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
 * The twin of iOS's WriteModel. It owns its scope so the last save still
 * lands after the screen is gone ([leave]).
 */
class WriteModel(
    private val drafts: DraftService?,
    private val writing: WritingApi,
    /** The card this one resonates with, if any (a response card). */
    val referenceCardId: String?,
    val editor: StoryEditorBridge,
) {
    var values by mutableStateOf(DraftValues())
        private set
    var draftId: String? = null
        private set
    var savedAt by mutableStateOf<LocalTime?>(null)
        private set
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
    /** What the last successful write stored; leaving right after a save doesn't write again. */
    private var lastSaved: DraftValues? = null

    init {
        editor.onChange = { story -> update { copy(story = story) } }
    }

    fun update(change: DraftValues.() -> DraftValues) {
        val next = values.change()
        if (next == values) return
        values = next
        saveJob?.cancel()
        saveJob = scope.launch {
            delay(AUTOSAVE_DELAY_MS)
            save()
        }
    }

    // Autosave

    /** Writes the draft now (creating it the first time there is something to keep); returns its id. */
    suspend fun saveNow(): String? {
        saveJob?.cancel()
        return save()
    }

    private suspend fun save(): String? = writes.withLock {
        val drafts = drafts ?: return@withLock draftId
        val v = values
        if (v.isEmpty && draftId == null) return@withLock null
        if (v == lastSaved) return@withLock draftId
        try {
            val id = draftId
            if (id != null) drafts.update(id, v) else draftId = drafts.create(v, Strings.language.tag, referenceCardId)
            lastSaved = v
            savedAt = LocalTime.now()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Kept in memory; the next edit (or leaving) tries again.
        }
        draftId
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

    /** "Draft saved · 14:32", or the hint that drafts save themselves. */
    val saveStatus: String
        get() = savedAt?.let { L10n.Write.autosaved(it.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(Strings.language.locale))) }
            ?: L10n.Write.autosaveHint

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

    companion object {
        /** CardEditor's AUTOSAVE_DELAY_MS. */
        const val AUTOSAVE_DELAY_MS = 800L
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
