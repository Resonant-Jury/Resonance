package com.resonance.app

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Test
import org.w3c.dom.Element

/**
 * A backup (or a move to a new phone) takes the app's settings and nothing else: not the push
 * install id — a phone restored from another would claim the same device record, and one of the
 * two would stop getting pushes — nor Firestore's local copy of the account, nor the caches.
 */
class BackupRulesTest {
    private val android = "http://schemas.android.com/apk/res/android"

    private fun parse(path: String) =
        DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }.newDocumentBuilder().parse(File(path)).documentElement

    private fun rules(element: Element, tag: String): List<Pair<String, String>> {
        val nodes = element.getElementsByTagName(tag)
        return (0 until nodes.length).map { nodes.item(it) as Element }.map { it.getAttribute("domain") to it.getAttribute("path") }
    }

    @Test fun theManifestNamesBothRuleSets() {
        val app = parse("src/main/AndroidManifest.xml").getElementsByTagName("application").item(0) as Element
        assertEquals("@xml/backup_rules", app.getAttributeNS(android, "fullBackupContent"))
        assertEquals("@xml/data_extraction_rules", app.getAttributeNS(android, "dataExtractionRules"))
    }

    @Test fun onlyTheSettingsAreBackedUp() {
        val settings = listOf("sharedpref" to "settings.xml")
        // Android 11 and older.
        val full = parse("src/main/res/xml/backup_rules.xml")
        assertEquals(settings, rules(full, "include"))
        assertEquals(emptyList<Pair<String, String>>(), rules(full, "exclude"))
        // Android 12+: the cloud backup and a device-to-device move alike.
        val extraction = parse("src/main/res/xml/data_extraction_rules.xml")
        listOf("cloud-backup", "device-transfer").forEach { section ->
            val rules = extraction.getElementsByTagName(section)
            assertEquals(section, 1, rules.length)
            assertEquals(section, settings, rules(rules.item(0) as Element, "include"))
        }
    }
}
