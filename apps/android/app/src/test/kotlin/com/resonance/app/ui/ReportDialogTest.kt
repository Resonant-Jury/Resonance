package com.resonance.app.ui

import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * A tap beside the report dialog is named by the way out its foot shows: 取消 while the report is
 * being written (its foot is 取消 | 送出), 關閉 once it has turned into the thank-you note.
 */
class ReportDialogTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun theBackdropSaysCancelWhileTheReportIsWrittenAndCloseOnceItIsSent() {
        assertEquals("取消", reportCloseLabel(sent = false))
        assertEquals("關閉", reportCloseLabel(sent = true))
    }
}
