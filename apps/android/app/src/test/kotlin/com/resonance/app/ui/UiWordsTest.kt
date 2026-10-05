package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Every word the app shows or reads out comes from the web's catalogs (L10n), in the reader's
 * language: a button, a notice's way out, a label TalkBack reads, never an English literal written
 * into the UI code (a zh-TW reader would see "OK", or hear "unread").
 *
 * The code is read as Kotlin, not line by line: comments are left out (a KDoc quoting a call is not
 * one), a call's arguments run to its closing parenthesis over as many lines as it takes, and a
 * label's value is the whole expression assigned (`if (checked) "on" else "off"`). A literal counts
 * when a letter is left in it once its templates (`$name`, `${…}`) and escapes are taken out.
 */
class UiWordsTest {
    private val sources: List<File> = listOf(File("src/main/kotlin"), File("../core/design/src/main/kotlin"))
        .flatMap { root -> root.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList() }

    @Test fun theUiCodeIsFound() {
        assertTrue(sources.any { it.name == "CardActionsMenu.kt" })
        assertTrue(sources.any { it.name == "Dialogs.kt" })
    }

    @Test fun noButtonOrNoticeIsLabelledInWordsOfItsOwn() {
        // A label written as a literal (`OrganicAlert(title, "OK")`, `OrganicButton("Close")`): it should be an L10n string.
        val found = sources.flatMap { file -> UiWords.labelledCalls(file.readText()).map { "${file.name}:$it" } }
        assertTrue(found.joinToString("\n"), found.isEmpty())
    }

    @Test fun nothingTalkBackReadsIsWrittenInWordsOfItsOwn() {
        // `contentDescription = "unread"`: read out in English whatever the reader's language.
        val found = sources.flatMap { file -> UiWords.spokenLabels(file.readText()).map { "${file.name}:$it" } }
        assertTrue(found.joinToString("\n"), found.isEmpty())
    }

    // The guard itself: what it must catch, and what it must leave alone.

    @Test fun theGuardCatchesALabelWrittenOverSeveralLinesOrInAnExpression() {
        val code = """
            fun a() {
                OrganicConfirmDialog(
                    title,
                    "OK.",
                    onConfirm = {},
                )
                OrganicIconButton(IconName.Pen,
                    "Edit") { open() }
                Box(Modifier.semantics {
                    contentDescription = label
                    stateDescription = if (checked) "on" else "off"
                })
                Canvas(Modifier.plainClickable(role = Role.Button, onClickLabel = "Remove tag", onClick = onRemove))
                Box(Modifier.semantics { contentDescription = name ?: "Someone" })
                Box(Modifier.semantics {
                    paneTitle =
                        "Menu"
                })
            }
        """.trimIndent()
        assertEquals(listOf(2, 7), UiWords.labelledCalls(code).map { it.substringBefore(':').toInt() })
        assertEquals(listOf(11, 13, 14, 16), UiWords.spokenLabels(code).map { it.substringBefore(':').toInt() })
    }

    @Test fun theGuardLeavesCatalogWordsCommentsTemplatesAndLambdasAlone() {
        val code = """
            /** Never `OrganicAlert(title, "OK")`: contentDescription = "unread" reads English. */
            fun a() {
                // OrganicButton("Close") once said so.
                OrganicButton(if (pending) "…" else L10n.Card.Note.send, onClick = { log("Sent") })
                OrganicButton(L10n.Native.retry) { Log.d("Resonance", "retry") }
                ModalCloseButton(L10n.Native.close, onClose)
                Box(Modifier.semantics { contentDescription = "${'$'}{L10n.Home.moreLoading} ${'$'}count · \n" })
                Text("https://example.com/a // not a comment") ; OrganicButton(L10n.Native.close) {}
                val c = '"'; OrganicButton(L10n.Native.retry) {}
            }
        """.trimIndent()
        assertEquals(emptyList<String>(), UiWords.labelledCalls(code))
        assertEquals(emptyList<String>(), UiWords.spokenLabels(code))
    }
}

/** A small reading of Kotlin source, enough to find the words a UI call or a TalkBack label is given. */
internal object UiWords {
    /** The UI's own calls that take a label to show or read: a literal with words in their arguments is one written in English. */
    private val labelled = Regex("""\b(OrganicAlert|OrganicButton|OrganicIconButton|ModalCloseButton|OrganicConfirmDialog|OrganicMenuItem|OrganicEmptyState)\s*\(""")

    /** The semantics TalkBack reads out, set by assignment or as a named argument. */
    private val spoken = Regex("""\b(contentDescription|stateDescription|onClickLabel|onLongClickLabel|paneTitle)\s*=(?!=)""")

    /** Each call of [labelled] given a literal with words — outside the lambdas it takes — as `line: text`. */
    fun labelledCalls(source: String): List<String> {
        val code = blankComments(source)
        return labelled.findAll(code).mapNotNull { match ->
            val open = match.range.last
            val close = closing(code, open)
            match.takeIf { literals(code, open + 1, close, outsideLambdas = true).any(::hasWords) }
                ?.let { "${lineOf(code, it.range.first)}: ${code.substring(it.range.first, close + 1).lines().joinToString(" ") { l -> l.trim() }}" }
        }.toList()
    }

    /** Each TalkBack label given a literal with words, wherever in the expression assigned, as `line: text`. */
    fun spokenLabels(source: String): List<String> {
        val code = blankComments(source)
        return spoken.findAll(code).mapNotNull { match ->
            val from = match.range.last + 1
            val to = expressionEnd(code, from)
            match.takeIf { literals(code, from, to, outsideLambdas = false).any(::hasWords) }
                ?.let { "${lineOf(code, it.range.first)}: ${code.substring(it.range.first, to).lines().joinToString(" ") { l -> l.trim() }}" }
        }.toList()
    }

    private fun lineOf(code: String, at: Int) = code.substring(0, at).count { it == '\n' } + 1

    /** Letters left in a literal's text once its templates and escapes are out. */
    private fun hasWords(literal: String) = Regex("""\p{L}""").containsMatchIn(literal)

    /** The source with its comments blanked (lines kept, so positions and line numbers stay); strings and chars untouched. */
    fun blankComments(t: String): String {
        val out = StringBuilder(t)
        var i = 0
        while (i < t.length) {
            when {
                t[i] == '"' -> i = stringEnd(t, i)
                t[i] == '\'' -> i = charEnd(t, i)
                t.startsWith("//", i) -> while (i < t.length && t[i] != '\n') out[i++] = ' '
                t.startsWith("/*", i) -> {
                    var depth = 0
                    while (i < t.length) {
                        when {
                            t.startsWith("/*", i) -> { depth++; out[i] = ' '; out[i + 1] = ' '; i += 2 }
                            t.startsWith("*/", i) -> { depth--; out[i] = ' '; out[i + 1] = ' '; i += 2; if (depth == 0) break }
                            else -> { if (t[i] != '\n') out[i] = ' '; i++ }
                        }
                    }
                }
                else -> i++
            }
        }
        return out.toString()
    }

    /** Past the string literal opening at [i] (`"…"` or `"""…"""`), its templates skipped whole. */
    private fun stringEnd(t: String, i: Int): Int {
        val raw = t.startsWith("\"\"\"", i)
        var j = i + if (raw) 3 else 1
        while (j < t.length) {
            when {
                raw && t.startsWith("\"\"\"", j) -> {
                    j += 3
                    while (j < t.length && t[j] == '"') j++
                    return j
                }
                !raw && t[j] == '\\' -> j += 2
                !raw && t[j] == '"' -> return j + 1
                !raw && t[j] == '\n' -> return j
                t.startsWith("\${", j) -> j = blockEnd(t, j + 1)
                else -> j++
            }
        }
        return j
    }

    /** Past the char literal opening at [i] (`'x'`, `'\''`, `'"'`). */
    private fun charEnd(t: String, i: Int): Int {
        var j = i + 1
        if (j < t.length && t[j] == '\\') j += 2 else j++
        while (j < t.length && t[j] != '\'' && t[j] != '\n') j++
        return minOf(j + 1, t.length)
    }

    /** Past the `}` that closes the `{` at [i]. */
    private fun blockEnd(t: String, i: Int): Int {
        var depth = 0
        var j = i
        while (j < t.length) {
            when (t[j]) {
                '"' -> { j = stringEnd(t, j); continue }
                '\'' -> { j = charEnd(t, j); continue }
                '{' -> depth++
                '}' -> if (--depth == 0) return j + 1
            }
            j++
        }
        return j
    }

    /** The index of the `)` closing the `(` at [open]. */
    private fun closing(t: String, open: Int): Int {
        var depth = 0
        var j = open
        while (j < t.length) {
            when (t[j]) {
                '"' -> { j = stringEnd(t, j); continue }
                '\'' -> { j = charEnd(t, j); continue }
                '(', '[', '{' -> depth++
                ')', ']', '}' -> if (--depth == 0) return j
            }
            j++
        }
        return t.length - 1
    }

    /**
     * Where the expression starting at [from] (just past an `=`) ends: a `,` `;` or closing bracket
     * of its own level, or the end of its line — unless the expression goes on over the next one
     * (an `if (…)`, an `else`, an `?:` or an operator at the break, or nothing yet on the line).
     */
    private fun expressionEnd(t: String, from: Int): Int {
        var depth = 0
        var j = from
        while (j < t.length) {
            val c = t[j]
            when {
                c == '"' -> { j = stringEnd(t, j); continue }
                c == '\'' -> { j = charEnd(t, j); continue }
                c == '(' || c == '[' || c == '{' -> depth++
                c == ')' || c == ']' || c == '}' -> if (depth-- == 0) return j
                depth == 0 && (c == ',' || c == ';') -> return j
                depth == 0 && c == '\n' -> {
                    val sofar = t.substring(from, j).trim()
                    val next = t.substring(j).trimStart()
                    val goesOn = sofar.isEmpty() ||
                        Regex("""(\belse|\?:|[+\-*/&|=]|\bif\s*\(.*\))$""").containsMatchIn(sofar) ||
                        Regex("""^(else\b|\?:|\?\.|\.|\+|&&|\|\|)""").containsMatchIn(next)
                    if (!goesOn) return j
                }
            }
            j++
        }
        return t.length
    }

    /** The text of each string literal in [from, to) — templates and escapes taken out — leaving lambdas' own out if [outsideLambdas]. */
    private fun literals(t: String, from: Int, to: Int, outsideLambdas: Boolean): List<String> {
        val found = ArrayList<String>()
        var braces = 0
        var j = from
        while (j < to) {
            when (t[j]) {
                '"' -> {
                    val end = stringEnd(t, j)
                    if (!outsideLambdas || braces == 0) found += literalText(t.substring(j, end))
                    j = end
                    continue
                }
                '\'' -> { j = charEnd(t, j); continue }
                '{' -> braces++
                '}' -> braces--
            }
            j++
        }
        return found
    }

    /** A literal's own words: quotes, templates (`$name`, `${…}`) and escapes (`\n`, `A`) taken out. */
    private fun literalText(literal: String): String {
        val raw = literal.startsWith("\"\"\"")
        val body = literal.removePrefix(if (raw) "\"\"\"" else "\"").removeSuffix(if (raw) "\"\"\"" else "\"")
        val out = StringBuilder()
        var j = 0
        while (j < body.length) {
            when {
                body.startsWith("\${", j) -> j = blockEnd(body, j + 1)
                body[j] == '$' && j + 1 < body.length && (body[j + 1].isLetter() || body[j + 1] == '_') -> {
                    j++
                    while (j < body.length && (body[j].isLetterOrDigit() || body[j] == '_')) j++
                }
                !raw && body.startsWith("\\u", j) -> j += 6
                !raw && body[j] == '\\' -> j += 2
                else -> out.append(body[j++])
            }
        }
        return out.toString()
    }
}
