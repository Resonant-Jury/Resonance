package com.resonance.app.ui

import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException

/**
 * A note that didn't go says why in the reader's language, as the web's composer does — never the
 * server's English (a block refused with "You cannot send a note to this person." would read so
 * to a zh-TW reader, and would say more than the web lets it).
 */
class NoteComposerTest {
    private val language = Strings.language

    @Before fun catalogs() {
        // The web's own catalogs (this module runs from apps/android/app).
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun aRefusalIsTheLocalizedSendErrorNeverTheServersWords() {
        val blocked = ApiFailure("blocked", "You cannot send a note to this person.", 403)
        assertEquals("沒送出去，再試一次。", noteSendError(blocked))
        assertEquals("沒送出去，再試一次。", noteSendError(ApiFailure("forbidden", "Choose a pen name first.", 403)))
    }

    @Test fun notesWaitingUnansweredSayToWaitForTheirReply() {
        assertEquals("你留的紙條對方還沒回覆，先等等對方吧。", noteSendError(ApiFailure("conflict", "Wait for a reply.", 409)))
    }

    @Test fun theServersTroubleOrTheNetworksIsTheSendError() {
        assertEquals("沒送出去，再試一次。", noteSendError(ApiFailure("internal", "HTTP 500", 500)))
        assertEquals("沒送出去，再試一次。", noteSendError(IOException("offline")))
    }
}
