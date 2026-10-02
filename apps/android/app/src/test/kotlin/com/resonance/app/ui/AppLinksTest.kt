package com.resonance.app.ui

import com.resonance.app.AppConfig
import com.resonance.kit.story.StoryLink
import java.io.File
import java.net.URI
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/**
 * The App Links filter claims only the site pages the app shows itself: were it
 * to claim the whole host, a verified install would swallow every link to the
 * site — the policy pages included, which the in-app browser must be able to open.
 * It claims them on each of the site's hosts: the one the app talks to, and the
 * one it had before, whose links are in older stories and messages.
 */
class AppLinksTest {
    private val android = "http://schemas.android.com/apk/res/android"

    private fun verifiedFilterData(): List<Element> {
        val doc = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
            .newDocumentBuilder().parse(File("src/main/AndroidManifest.xml"))
        val filters = doc.getElementsByTagName("intent-filter")
        val verified = (0 until filters.length).map { filters.item(it) as Element }
            .single { it.getAttributeNS(android, "autoVerify") == "true" }
        val data = verified.getElementsByTagName("data")
        return (0 until data.length).map { data.item(it) as Element }
    }

    @Test fun claimsOnlyTheRoutedPagesUnderEachLocale() {
        val data = verifiedFilterData()
        val prefixes = data.mapNotNull { d -> d.getAttributeNS(android, "pathPrefix").takeIf { it.isNotEmpty() } }.toSet()
        val pages = listOf("/card/", "/u/", "/messages/", "/me/thought-map")
        assertEquals(listOf("", "/en", "/zh-TW").flatMap { locale -> pages.map { locale + it } }.toSet(), prefixes)
        // No other path attribute widens the filter back to the whole host.
        data.forEach { d ->
            listOf("path", "pathPattern", "pathAdvancedPattern", "pathSuffix").forEach { assertTrue(d.getAttributeNS(android, it).isEmpty()) }
        }
    }

    @Test fun claimsTheSitesHostsOverHttpsOnly() {
        val data = verifiedFilterData()
        val hosts = data.mapNotNull { d -> d.getAttributeNS(android, "host").takeIf { it.isNotEmpty() } }.toSet()
        val origin = URI(AppConfig(usesEmulator = false).origin).host
        assertEquals("resonance.channel", origin)
        assertEquals(setOf(origin) + StoryLink.FORMER_HOSTS, hosts)
        assertEquals(setOf("https"), data.mapNotNull { d -> d.getAttributeNS(android, "scheme").takeIf { it.isNotEmpty() } }.toSet())
    }

    @Test fun theClaimedPagesAreOnesTheAppRoutes() {
        // (The pen-name paths decode through android.net.Uri, which JVM tests don't have.)
        listOf("", "/en", "/zh-TW").forEach { locale ->
            assertNotNull(Route.fromPath("$locale/card/a-walk"))
            assertEquals(Route.ThoughtMap, Route.fromPath("$locale/me/thought-map"))
        }
        listOf("/en/privacy", "/zh-TW/terms", "/support", "/me").forEach { assertEquals(it, null, Route.fromPath(it)) }
    }
}
