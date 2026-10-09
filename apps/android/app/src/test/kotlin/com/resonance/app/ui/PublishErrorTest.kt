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
 * The publish panel says why publishing (or saving changes) didn't go through in the reader's
 * language — never the server's English ("A card needs a title before it is published.") or the
 * network's ("Unable to resolve host…"): a card gone can't be found; anything else didn't work,
 * or for an update didn't save — try again.
 */
class PublishErrorTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun aRefusalOrTheServersTroubleIsTheActionErrorNeverItsWords() {
        val refusals = listOf(
            ApiFailure("invalid_request", "A card needs a title before it is published.", 400),
            ApiFailure("rate_limited", "Too many requests.", 429),
            ApiFailure("internal", "Something went wrong.", 500),
            ApiFailure("unexpected", "HTTP 502", 502),
        )
        for (e in refusals) assertEquals("沒完成，再試一次", publishError(e, updating = false))
        assertEquals("沒完成，再試一次", publishError(IOException("Unable to resolve host"), updating = false))
    }

    @Test fun savingChangesThatFailSaysTheyDidntSave() {
        assertEquals("沒存成，再試一次", publishError(ApiFailure("internal", "Something went wrong.", 500), updating = true))
        assertEquals("沒存成，再試一次", publishError(IOException("timeout"), updating = true))
    }

    @Test fun aCardGoneSaysItCantBeFound() {
        assertEquals("找不到這張卡片", publishError(ApiFailure("not_found", "No such card.", 404), updating = false))
        assertEquals("找不到這張卡片", publishError(ApiFailure("not_found", "No such card.", null), updating = true))
    }

    @Test fun inEnglishToo() {
        Strings.language = Strings.Language.En
        assertEquals("That didn't work — try again", publishError(ApiFailure("internal", "Something went wrong.", 500), updating = false))
    }
}
