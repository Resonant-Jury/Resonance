package com.resonance.kit

import com.resonance.kit.l10n.Strings
import java.io.File
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** SettingsClient's Terms section: privacy, terms, contact → /{locale}/{privacy|terms|support}. */
class PolicyPageTest {
    @BeforeTest fun load() {
        val messages = File(System.getProperty("repoRoot"), "src/messages")
        Strings.load { File(messages, "${it.tag}.json").readText() }
    }

    @Test fun linksMirrorTheWebsTermsSection() {
        assertEquals(listOf("/zh-TW/privacy", "/zh-TW/terms", "/zh-TW/support"), PolicyPage.entries.map { it.path(Strings.Language.ZhTW) })
        assertEquals(listOf("/en/privacy", "/en/terms", "/en/support"), PolicyPage.entries.map { it.path(Strings.Language.En) })
    }

    @Test fun pagesLiveOnTheConfiguredOrigin() {
        assertEquals("https://resonance-world.vercel.app/zh-TW/privacy", PolicyPage.Privacy.url("https://resonance-world.vercel.app", Strings.Language.ZhTW))
        assertEquals("http://10.0.2.2:3100/en/support", PolicyPage.Support.url("http://10.0.2.2:3100/", Strings.Language.En))
    }

    @Test fun labelsAreTheFootersInTheInterfaceLanguage() {
        Strings.language = Strings.Language.En
        assertEquals(listOf("Privacy", "Terms", "Contact"), PolicyPage.entries.map { it.label })
        Strings.language = Strings.Language.ZhTW
        assertEquals(listOf("隱私政策", "服務條款", "聯絡我們"), PolicyPage.entries.map { it.label })
    }
}
