package com.resonance.app.ui

import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * A row of the card pick lists (the resonate picker, inserting or sharing a card) says, under its
 * one-line title, when the card came out — the year only when it isn't this one — led by 匿名 for
 * an anonymous card, in place of the old 匿名 pill (CardPickList.tsx's meta line).
 */
class PickMetaTest {
    private val language = Strings.language
    private val today = LocalDate.of(2026, 10, 9)

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun aCardFromThisYearSaysItsMonthAndDay() {
        Strings.language = Strings.Language.ZhTW
        assertEquals("10月5日", pickMeta(anonymous = false, publishedAt = "2026-10-05T04:00:00.000Z", anonymousLabel = L10n.Card.ResonatePicker.anonymous, today = today))
        Strings.language = Strings.Language.En
        assertEquals("Oct 5", pickMeta(anonymous = false, publishedAt = "2026-10-05T04:00:00.000Z", anonymousLabel = L10n.Card.ResonatePicker.anonymous, today = today))
    }

    @Test fun anOlderOneSaysItsYearToo() {
        Strings.language = Strings.Language.ZhTW
        assertEquals("2025年9月28日", pickMeta(false, "2025-09-28T04:00:00.000Z", null, today))
        Strings.language = Strings.Language.En
        assertEquals("Sep 28, 2025", pickMeta(false, "2025-09-28T04:00:00.000Z", null, today))
    }

    @Test fun anAnonymousCardLeadsWithTheWordWhereTheListMarksIt() {
        Strings.language = Strings.Language.ZhTW
        assertEquals("匿名 · 10月5日", pickMeta(true, "2026-10-05T04:00:00.000Z", L10n.Card.ResonatePicker.anonymous, today))
        Strings.language = Strings.Language.En
        assertEquals("Anonymous · Oct 5", pickMeta(true, "2026-10-05T04:00:00.000Z", L10n.Card.ResonatePicker.anonymous, today))
        // A list that doesn't mark anonymous cards (inserting a card) says only the date.
        assertEquals("Oct 5", pickMeta(true, "2026-10-05T04:00:00.000Z", null, today))
    }

    @Test fun nothingToSayIsNoLine() {
        assertNull(pickMeta(false, null, L10n.Card.ResonatePicker.anonymous, today))
        assertNull(pickMeta(false, "not a date", null, today))
    }
}
