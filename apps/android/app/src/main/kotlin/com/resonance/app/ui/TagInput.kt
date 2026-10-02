package com.resonance.app.ui

/**
 * What the tag field does with the words it is given (TagField.tsx): a comma
 * of either width or the enumeration comma (、) ends a tag, so a pasted list
 * splits in one go, and a tag is trimmed and never added twice. Pure, so the
 * rules are pinned without a keyboard. The twin of iOS's TagInput.
 */
object TagInput {
    private val separators = charArrayOf(',', '，', '、')

    /**
     * The text as typed or pasted, cut at its separators: the words it has
     * finished (not yet trimmed) and what is still being typed after the last
     * separator.
     */
    fun split(text: String): Pair<List<String>, String> {
        if (text.none { it in separators }) return emptyList<String>() to text
        val words = text.split(*separators).toMutableList()
        val rest = words.removeAt(words.lastIndex).trimStart()
        return words to rest
    }

    /** [tags] with [words] added, in order: trimmed, blanks and tags already there left out. */
    fun merge(tags: List<String>, words: List<String>): List<String> {
        val next = tags.toMutableList()
        for (word in words) {
            val tag = word.trim()
            if (tag.isNotEmpty() && tag !in next) next += tag
        }
        return next
    }
}
