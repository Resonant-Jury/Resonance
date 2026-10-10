package com.resonance.app.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Me
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.AvatarCrop
import com.resonance.design.AvatarCropStage
import com.resonance.design.ButtonVariant
import com.resonance.design.CropRect
import com.resonance.design.CropState
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.Mixes
import com.resonance.design.ModalActions
import com.resonance.design.ModalError
import com.resonance.design.ModalGap
import com.resonance.design.ModalTitle
import com.resonance.design.OklchColor
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicSlider
import com.resonance.design.cropMask
import com.resonance.design.cropStageSide
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The profile photo (design note B7): picked from the system's Photo Picker, framed in our own
 * crop modal, drawn as a square, sent up as an avatar and saved on the profile ([Session.setAvatar]).
 */
object AvatarPhoto {
    /**
     * What the mask showed of [photo], as the avatar's JPEG (0.9): a square of the crop's own size
     * kept between 256 and 512, on cream first (a transparent picture never turns black).
     */
    fun render(photo: Bitmap, rect: CropRect): ByteArray {
        val out = AvatarCrop.outputSize(rect.side)
        val square = Bitmap.createBitmap(out, out, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(square)
        canvas.drawColor(Tokens.Cream.toArgb())
        val k = (out / rect.side).toFloat()
        val place = Matrix().apply {
            setScale(k, k)
            postTranslate((-rect.x * k).toFloat(), (-rect.y * k).toFloat())
        }
        canvas.drawBitmap(photo, place, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        return ByteArrayOutputStream().use {
            square.compress(Bitmap.CompressFormat.JPEG, 90, it)
            square.recycle()
            it.toByteArray()
        }
    }
}

/**
 * The first row of Settings → Profile, the web's: the avatar (88, seed 77), what it is and how it
 * is chosen, and the tonal photo button — add one, or change it. Tapping the avatar does the same.
 * A photo that can't be opened says so under the hint; one that opens goes to the crop modal.
 */
@Composable
internal fun AvatarSettingsRow(session: Session, me: Me) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var photo by remember { mutableStateOf<Bitmap?>(null) }
    var openError by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            openError = false
            scope.launch {
                // Upright (the decoder applies the photo's orientation), its first frame, at most 2048 on its long side.
                val decoded = try {
                    withContext(Dispatchers.IO) { CoverImage.decode(context, uri) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
                if (decoded == null) openError = true else photo = decoded
            }
        }
    }
    val pick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    val verb = if (me.avatarUrl != null) L10n.Settings.Profile.avatarChange else L10n.Settings.Profile.avatarAdd
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.clickable(onClickLabel = verb, role = Role.Button, onClick = pick)) {
            HandDrawnAvatar(me.initials, me.avatarUrl, OklchColor.parse(me.accentColor) ?: Tokens.TerracottaLight, 88.dp, 77.0)
        }
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            BasicText(L10n.Settings.Profile.avatar, style = AppFonts.body(14f, 600, lineHeight = 1.4f))
            BasicText(L10n.Settings.Profile.avatarHint, style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted), modifier = Modifier.padding(top = 2.dp))
            if (openError) BasicText(L10n.Settings.Profile.avatarOpenError, style = AppFonts.body(13f, lineHeight = 1.5f, color = Mixes.Danger), modifier = Modifier.padding(top = 2.dp))
            Spacer(Modifier.height(8.dp))
            OrganicButton(verb, variant = ButtonVariant.Tonal, small = true, icon = IconName.Image, onClick = pick)
        }
    }
    photo?.let { picked ->
        AvatarCropModal(picked, onCancel = { photo = null }) { jpeg ->
            session.setAvatar(jpeg)
            photo = null
        }
    }
}

/**
 * The crop modal (design note B7), in the app's own modal: title and hint, the stage, the zoom
 * slider between − and +, then Cancel | 使用 at the right. 使用 draws the square, sends it up and
 * saves it, showing its loader meanwhile (Cancel resting, the scrim and Back doing nothing); a
 * failure says so above the actions and 使用 can be tried again.
 */
@Composable
private fun AvatarCropModal(photo: Bitmap, onCancel: () -> Unit, onUse: suspend (ByteArray) -> Unit) {
    val image = remember(photo) { photo.asImageBitmap() }
    var state by remember(photo) { mutableStateOf(CropState()) }
    var sending by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    OrganicModal(if (sending) null else onCancel, L10n.Settings.Profile.cropTitle, seed = 89.0, closeLabel = L10n.Settings.Profile.cropCancel) {
        BoxWithConstraints {
            val side = cropStageSide(maxWidth)
            val crop = remember(image, side) { AvatarCrop(image.width.toDouble(), image.height.toDouble(), cropMask(side).value.toDouble()) }
            Column(verticalArrangement = Arrangement.spacedBy(ModalGap)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ModalTitle(L10n.Settings.Profile.cropTitle)
                    BasicText(L10n.Settings.Profile.cropHint, style = AppFonts.body(13.5f, lineHeight = 1.5f, color = Tokens.TextMuted))
                }
                Box(Modifier.fillMaxWidth().padding(top = 2.dp), contentAlignment = Alignment.Center) {
                    AvatarCropStage(image, side, state, { if (!sending) state = it }, L10n.Settings.Profile.cropStage)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OrganicIcon(IconName.Minus, size = 16.dp, color = Tokens.TextMuted)
                    OrganicSlider(
                        state.z.toFloat(), { z -> if (!sending) state = crop.zoomTo(state, z.toDouble()) },
                        AvatarCrop.MIN_ZOOM.toFloat()..AvatarCrop.MAX_ZOOM.toFloat(), L10n.Settings.Profile.cropZoom,
                        Modifier.weight(1f), step = 0.01f,
                    )
                    OrganicIcon(IconName.Plus, size = 16.dp, color = Tokens.TextMuted)
                }
                if (failed) ModalError(L10n.Settings.Profile.avatarError)
                ModalActions(
                    L10n.Settings.Profile.cropCancel, onCancel, L10n.Settings.Profile.cropUse,
                    busy = sending,
                    onVerb = {
                        if (!sending) {
                            sending = true
                            failed = false
                            scope.launch {
                                try {
                                    val jpeg = withContext(Dispatchers.Default) { AvatarPhoto.render(photo, crop.crop(crop.clamp(state))) }
                                    onUse(jpeg)
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    failed = true
                                } finally {
                                    sending = false
                                }
                            }
                        }
                    },
                )
            }
        }
    }
}
