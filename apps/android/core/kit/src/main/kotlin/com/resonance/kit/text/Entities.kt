package com.resonance.kit.text

/**
 * HTML character references (src/lib/text/entities.ts, line for line) — what the story editor's
 * Markdown writes for `<`, `>` and `&` typed as text, read back for excerpts ([com.resonance.kit.story.PlainText]).
 * The names pages and the editor actually use, the server's very table, plus every numeric reference.
 */
object Entities {
    /** entities.ts's NAMED (EntitiesTest holds the two to the same table). */
    internal val Named = mapOf(
        "amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ", "copy" to "©", "reg" to "®",
        "trade" to "™", "hellip" to "…", "mdash" to "—", "ndash" to "–", "lsquo" to "‘", "rsquo" to "’", "ldquo" to "“",
        "rdquo" to "”", "laquo" to "«", "raquo" to "»", "middot" to "·", "bull" to "•", "times" to "×", "deg" to "°",
        "euro" to "€", "pound" to "£", "yen" to "¥", "cent" to "¢", "sect" to "§", "para" to "¶", "iexcl" to "¡",
        "iquest" to "¿", "eacute" to "é", "egrave" to "è", "ecirc" to "ê", "agrave" to "à", "aacute" to "á", "acirc" to "â",
        "ccedil" to "ç", "uuml" to "ü", "ouml" to "ö", "auml" to "ä", "szlig" to "ß", "ntilde" to "ñ", "oacute" to "ó",
        "iacute" to "í", "uacute" to "ú",
    )

    /**
     * One character reference, `&…;`; the body is group 1 (entities.ts's ENTITY). JavaScript's `/…/i`
     * folds ASCII letters only; Java's IGNORE_CASE (Kotlin adds UNICODE_CASE) would also read `ſ` as
     * `s` and the Kelvin sign as `k`, so both cases are spelled out instead.
     */
    const val PATTERN = "&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});"
    private val Entity = Regex(PATTERN)

    /** What one reference's body (`amp`, `#62`, `#x3E`) stands for; null for a name it doesn't know. */
    fun value(body: String): String? {
        if (body[0] == '#') {
            val code = if (body[1].lowercaseChar() == 'x') body.substring(2).toInt(16) else body.substring(1).toInt()
            if (code == 0 || code > 0x10FFFF || code in 0xD800..0xDFFF) return "�"
            return String(Character.toChars(code))
        }
        return Named[body.lowercase()]
    }

    /** HTML character references, decoded once (`&amp;lt;` is `&lt;`). Unknown names are left as written. */
    fun decode(text: String): String = Entity.replace(text) { value(it.groupValues[1]) ?: it.value }
}
