package com.resonance.app.ui

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Every word the app shows or reads out comes from the web's catalogs (L10n), in the reader's
 * language: a button, a notice's way out, a label TalkBack reads, never an English literal written
 * into the UI code (a zh-TW reader would see "OK", or hear "unread").
 */
class UiWordsTest {
    private val sources: List<File> = listOf(File("src/main/kotlin"), File("../core/design/src/main/kotlin"))
        .flatMap { root -> root.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList() }

    /** Each line of the UI code matching [pattern], as `file:line: text`. */
    private fun offending(pattern: Regex): List<String> = sources.flatMap { file ->
        file.readLines().mapIndexedNotNull { i, line -> if (pattern.containsMatchIn(line)) "${file.name}:${i + 1}: ${line.trim()}" else null }
    }

    @Test fun theUiCodeIsFound() {
        assertTrue(sources.any { it.name == "CardActionsMenu.kt" })
        assertTrue(sources.any { it.name == "Dialogs.kt" })
    }

    @Test fun noButtonOrNoticeIsLabelledInWordsOfItsOwn() {
        // A label written as a literal (`OrganicAlert(title, "OK")`, `OrganicButton("Close")`): it should be an L10n string.
        val found = offending(Regex("""\b(OrganicAlert|OrganicButton|ModalCloseButton|OrganicConfirmDialog)\([^)]*"[^"]*\p{L}"""))
        assertTrue(found.joinToString("\n"), found.isEmpty())
    }
}
