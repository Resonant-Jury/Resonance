package com.resonance.app

import okio.Buffer
import okio.ByteString.Companion.decodeHex
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Before Android 12 the app reads AVIF itself: it knows one by its `ftyp` box — the brand sharp
 * writes for the AI illustrations, or AVIF among the compatible brands — and leaves every other
 * picture (JPEG, PNG, WebP, HEIC) to the system, without consuming any of it.
 */
class AvifSniffTest {
    private fun ftyp(major: String, vararg compatible: String): Buffer {
        val brands = compatible.joinToString("") { it }
        val size = 16 + brands.length
        return Buffer().writeInt(size).writeUtf8("ftyp").writeUtf8(major).writeInt(0).writeUtf8(brands).writeUtf8("meta")
    }

    @Test fun theIllustrationsAreAvif() {
        // The head of what sharp's `.avif()` writes.
        assertTrue(AvifDecoder.isAvif(Buffer().write("0000001c6674797061766966000000006d696631617669666d696166".decodeHex())))
        assertTrue(AvifDecoder.isAvif(ftyp("mif1", "avif", "miaf")))
        assertTrue(AvifDecoder.isAvif(ftyp("avis", "msf1")))
    }

    @Test fun otherPicturesAreLeftToTheSystem() {
        assertFalse(AvifDecoder.isAvif(ftyp("heic", "mif1", "heic")))
        assertFalse(AvifDecoder.isAvif(Buffer().write("ffd8ffe000104a46494600010100000100010000".decodeHex())))
        assertFalse(AvifDecoder.isAvif(Buffer().write("89504e470d0a1a0a0000000d49484452".decodeHex())))
        assertFalse(AvifDecoder.isAvif(Buffer().writeUtf8("RIFF").writeIntLe(100).writeUtf8("WEBPVP8 ")))
        assertFalse(AvifDecoder.isAvif(Buffer().writeUtf8("tiny")))
    }

    @Test fun lookingDoesNotConsumeThePicture() {
        val source = ftyp("avif", "mif1")
        val size = source.size
        AvifDecoder.isAvif(source)
        assertEquals(size, source.size)
    }
}
