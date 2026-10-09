package com.resonance.app.ui

import com.resonance.design.generated.IconName
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * The verb's segment of the card page's bar says what your answer to the card is: 共振 with the
 * wave while there is none (and while it is looked for), 修改 with the pen for a draft, 已共振 with
 * a tick once it is published — as the web's CardViewerActions.
 */
class ResonateActionTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun noAnswerYetIsTheVerb() {
        for (mine in listOf(null, ResonateAction.Mine.None)) {
            val action = ResonateAction.of(mine)
            assertEquals("共振", action.label)
            assertEquals(IconName.Wave, action.icon)
        }
    }

    @Test fun aDraftAnswerIsModify() {
        val action = ResonateAction.of(ResonateAction.Mine.Found(published = false))
        assertEquals("修改", action.label)
        assertEquals(IconName.Pen, action.icon)
    }

    @Test fun aPublishedAnswerIsResonated() {
        val action = ResonateAction.of(ResonateAction.Mine.Found(published = true))
        assertEquals("已共振", action.label)
        assertEquals(IconName.Check, action.icon)
    }
}
