package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * A thread draws no caption over a reply's quote or a note's card — one to one, who answered whom
 * goes without saying — but a screen reader still hears it before the quote; and a run that leads
 * with what it answers stands a little further off (18, not 12), so the quote never reads as the
 * foot of the run above.
 */
class ThreadCaptionsTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun whoRepliedToWhomIsSpokenBeforeTheQuote() {
        assertEquals("ben 回覆了你", replySpoken(mine = false, quotedMine = true, handle = "ben"))
        assertEquals("你回覆了 ben", replySpoken(mine = true, quotedMine = false, handle = "ben"))
        assertEquals("ben 回覆了自己", replySpoken(mine = false, quotedMine = false, handle = "ben"))
        assertEquals("你回覆了自己", replySpoken(mine = true, quotedMine = true, handle = "ben"))
    }

    @Test fun aNoteSaysItAnswersTheCardBeforeTheCard() {
        assertEquals("ben 用小紙條回覆了你的卡片", noteSpoken(mine = false, handle = "ben"))
        assertEquals("你用小紙條回覆了 ben 的卡片", noteSpoken(mine = true, handle = "ben"))
    }

    @Test fun aRunLeadingWithAQuoteStandsFurtherOff() {
        assertEquals(18.dp, rowGap(labelled = false, joinsAbove = false, quoted = true))
        assertEquals(12.dp, rowGap(labelled = false, joinsAbove = false, quoted = false))
        // Inside a run the bubbles nearly touch, and under a day or time label the label brings its own air.
        assertEquals(2.dp, rowGap(labelled = false, joinsAbove = true, quoted = false))
        assertEquals(0.dp, rowGap(labelled = true, joinsAbove = false, quoted = true))
    }
}
