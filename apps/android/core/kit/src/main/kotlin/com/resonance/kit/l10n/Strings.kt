package com.resonance.kit.l10n

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.util.Locale

/**
 * The web's message catalogs (src/messages/<language>.json, bundled unchanged) and the
 * slice of ICU MessageFormat they use: `{name}` arguments and
 * `{count, plural, =0 {…} one {…} other {…}}` with `#`. Use the generated
 * [L10n] accessors rather than raw keys. The twin of iOS's Strings.
 */
object Strings {
    enum class Language(val tag: String) {
        En("en"), ZhTW("zh-TW");

        val locale: Locale get() = if (this == ZhTW) Locale.forLanguageTag("zh-Hant-TW") else Locale.ENGLISH

        companion object {
            fun fromTag(tag: String?) = entries.firstOrNull { it.tag == tag }

            /** The system's preferred languages, mapped onto the site's two. */
            fun preferred(tags: List<String>): Language {
                for (tag in tags) {
                    if (tag.startsWith("zh")) return ZhTW
                    if (tag.startsWith("en")) return En
                }
                return En
            }
        }
    }

    @Volatile var language: Language = Language.En
    private val catalogs = HashMap<Language, Map<String, String>>()

    /** Loads each language's catalog from its JSON text. */
    fun load(read: (Language) -> String?) {
        synchronized(catalogs) {
            catalogs.clear()
            for (lang in Language.entries) {
                val text = read(lang) ?: continue
                catalogs[lang] = flatten(Json.parseToJsonElement(text).jsonObject)
            }
        }
    }

    /** The message in the current language, then English, then the key itself. */
    fun string(key: String): String = synchronized(catalogs) {
        catalogs[language]?.get(key) ?: catalogs[Language.En]?.get(key) ?: key
    }

    fun format(key: String, args: Map<String, Any>): String = MessageFormat.format(string(key), args, language)

    internal fun flatten(tree: JsonObject, prefix: String = ""): Map<String, String> {
        val out = HashMap<String, String>()
        for ((k, v) in tree) {
            val path = if (prefix.isEmpty()) k else "$prefix.$k"
            when (v) {
                is JsonObject -> out.putAll(flatten(v, path))
                is JsonPrimitive -> if (v.isString) out[path] = v.content
                else -> {}
            }
        }
        return out
    }
}

/** The ICU subset the catalogs use (scripts/apps/l10n.ts refuses anything else). */
object MessageFormat {
    fun format(pattern: String, args: Map<String, Any>, language: Strings.Language): String {
        val out = StringBuilder()
        var i = 0
        while (i < pattern.length) {
            val c = pattern[i]
            if (c != '{') {
                out.append(c)
                i++
                continue
            }
            val close = matchingBrace(pattern, i)
            if (close < 0) {
                out.append(pattern, i, pattern.length)
                break
            }
            out.append(argument(pattern.substring(i + 1, close), args, language))
            i = close + 1
        }
        return out.toString()
    }

    private fun matchingBrace(s: String, open: Int): Int {
        var depth = 0
        for (j in open until s.length) {
            if (s[j] == '{') depth++
            if (s[j] == '}' && --depth == 0) return j
        }
        return -1
    }

    private fun argument(body: String, args: Map<String, Any>, language: Strings.Language): String {
        val parts = body.split(",", limit = 3).map { it.trim() }
        val name = parts[0]
        if (parts.size != 3 || parts[1] != "plural") return args[name]?.toString() ?: "{$name}"
        val n = (args[name] as? Number)?.toInt() ?: args[name]?.toString()?.toIntOrNull() ?: 0
        val branches = branches(parts[2])
        val chosen = branches["=$n"] ?: branches[category(n, language)] ?: branches["other"] ?: ""
        return format(chosen.replace("#", n.toString()), args, language)
    }

    private fun branches(s: String): Map<String, String> {
        val out = HashMap<String, String>()
        var i = 0
        while (i < s.length) {
            while (i < s.length && s[i].isWhitespace()) i++
            val open = s.indexOf('{', i)
            if (open < 0) break
            val close = matchingBrace(s, open)
            if (close < 0) break
            out[s.substring(i, open).trim()] = s.substring(open + 1, close)
            i = close + 1
        }
        return out
    }

    /** CLDR plural category for the site's two languages. */
    fun category(n: Int, language: Strings.Language) = when (language) {
        Strings.Language.En -> if (n == 1) "one" else "other"
        Strings.Language.ZhTW -> "other"
    }
}
