package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.design.ModalErrorGap
import com.resonance.design.ModalErrorTuck
import com.resonance.design.ModalGap
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException

/**
 * The publish panel says why publishing (or saving changes) didn't go through in its own words
 * (write.publishPanel.*) — never the server's English ("A card needs a title before it is
 * published.") or the network's ("Unable to resolve host…"): a card gone can't be found; the
 * day's publishing used up waits for tomorrow; anything else didn't publish, or for an update
 * didn't save — try again. Its error line stands 12 over its buttons, as in every dialog.
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

    @Test fun aRefusalOrTheServersTroubleIsThePanelsOwnFailureNeverItsWords() {
        val refusals = listOf(
            ApiFailure("invalid_request", "A card needs a title before it is published.", 400),
            ApiFailure("internal", "Something went wrong.", 500),
            ApiFailure("unexpected", "HTTP 502", 502),
        )
        for (e in refusals) assertEquals("沒發布成功，再試一次", publishError(e, updating = false))
        assertEquals("沒發布成功，再試一次", publishError(IOException("Unable to resolve host"), updating = false))
    }

    @Test fun theDaysPublishingUsedUpSaysToComeBackTomorrow() {
        // POST …/publish spends the `publish` budget (30 a day): trying again now would be refused again.
        assertEquals("今天的次數用完了，明天再試", publishError(ApiFailure("rate_limited", "Too many requests.", 429), updating = false))
        // By the code alone (a proxy's status lost) or the status alone (an older server's code).
        assertEquals("今天的次數用完了，明天再試", publishError(ApiFailure("rate_limited", "Too many requests.", null), updating = false))
        assertEquals("今天的次數用完了，明天再試", publishError(ApiFailure("unexpected", "HTTP 429", 429), updating = true))
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
        assertEquals("Couldn't publish — try again", publishError(ApiFailure("internal", "Something went wrong.", 500), updating = false))
        assertEquals("That's the limit for today — try again tomorrow", publishError(ApiFailure("rate_limited", "Too many requests.", 429), updating = false))
    }

    @Test fun itsErrorLineStandsTwelveOverTheButtonsAsInEveryDialog() {
        // The column's gap, less what the error line gives back at its foot, plus the air the actions keep.
        assertEquals(ModalErrorGap, ModalGap - ModalErrorTuck + publishActionsTop(afterError = true))
        // Under the divider, with no error, the column's own gap is all.
        assertEquals(0.dp, publishActionsTop(afterError = false))
    }
}
