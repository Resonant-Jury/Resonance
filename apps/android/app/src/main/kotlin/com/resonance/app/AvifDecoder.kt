package com.resonance.app

import android.graphics.Bitmap
import coil3.ImageLoader
import coil3.asImage
import coil3.decode.DecodeResult
import coil3.decode.DecodeUtils
import coil3.decode.Decoder
import coil3.fetch.SourceFetchResult
import coil3.request.Options
import coil3.request.maxBitmapSize
import coil3.size.pxOrElse
import kotlinx.coroutines.runInterruptible
import okio.BufferedSource
import okio.ByteString.Companion.encodeUtf8
import java.nio.ByteBuffer
import kotlin.math.roundToInt
import org.aomedia.avif.android.AvifDecoder as LibAvif

/**
 * AVIF for Coil where the system can't read it (Android 10–11; 12 decodes it itself): the AI
 * illustrations are stored as AVIF, and without this their covers stay blank there. libavif
 * decodes at full size; the picture is then scaled down to what the view asked for.
 */
class AvifDecoder(private val result: SourceFetchResult, private val options: Options) : Decoder {
    override suspend fun decode(): DecodeResult? = runInterruptible {
        val bytes = result.source.use { it.source().readByteArray() }
        // libavif reads from native memory.
        val buffer = ByteBuffer.allocateDirect(bytes.size).put(bytes)
        val info = LibAvif.Info()
        if (!LibAvif.getInfo(buffer, bytes.size, info) || info.width <= 0 || info.height <= 0) return@runInterruptible null
        val full = Bitmap.createBitmap(info.width, info.height, Bitmap.Config.ARGB_8888)
        if (!LibAvif.decode(buffer, bytes.size, full)) {
            full.recycle()
            return@runInterruptible null
        }
        val dstWidth = options.size.width.pxOrElse { info.width }
        val dstHeight = options.size.height.pxOrElse { info.height }
        val scale = DecodeUtils.computeSizeMultiplier(info.width, info.height, dstWidth, dstHeight, options.scale, options.maxBitmapSize).coerceAtMost(1.0)
        if (scale >= 1.0) return@runInterruptible DecodeResult(full.asImage(), isSampled = false)
        val scaled = Bitmap.createScaledBitmap(full, (info.width * scale).roundToInt().coerceAtLeast(1), (info.height * scale).roundToInt().coerceAtLeast(1), true)
        if (scaled !== full) full.recycle()
        DecodeResult(scaled.asImage(), isSampled = true)
    }

    class Factory : Decoder.Factory {
        override fun create(result: SourceFetchResult, options: Options, imageLoader: ImageLoader): Decoder? =
            if (result.mimeType == "image/avif" || isAvif(result.source.source())) AvifDecoder(result, options) else null
    }

    companion object {
        private val FTYP = "ftyp".encodeUtf8()
        private val BRANDS = setOf("avif", "avis")

        /** An ISO-BMFF file whose `ftyp` box names an AVIF brand (major or compatible). */
        internal fun isAvif(source: BufferedSource): Boolean = runCatching {
            val peek = source.peek()
            if (!peek.request(16)) return false
            val boxSize = peek.readInt().toLong()
            if (!peek.rangeEquals(0, FTYP)) return false
            peek.skip(4)
            val end = boxSize.coerceIn(16, 64) - 8
            var read = 0L
            while (read + 4 <= end && peek.request(4)) {
                val brand = peek.readUtf8(4)
                read += 4
                // The minor version sits between the major brand and the compatible ones.
                if (read == 8L) continue
                if (brand in BRANDS) return true
            }
            false
        }.getOrDefault(false)
    }
}
