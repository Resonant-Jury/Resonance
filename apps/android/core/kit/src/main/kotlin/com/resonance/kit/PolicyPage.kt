package com.resonance.kit

import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings

/**
 * The site's policy pages, which settings' Terms section links to (the web
 * list is privacy, terms, contact → /{locale}/support; the twin of iOS's
 * PolicyPage). The apps show the live pages: the configured origin plus the
 * locale-prefixed path.
 */
enum class PolicyPage(private val segment: String) {
    Privacy("privacy"),
    Terms("terms"),
    Support("support");

    /** The footer label the web's link carries. */
    val label: String
        get() = when (this) {
            Privacy -> L10n.Footer.privacy
            Terms -> L10n.Footer.terms
            Support -> L10n.Footer.contact
        }

    /** The web link's `href`: `/zh-TW/privacy`, `/en/support`. */
    fun path(language: Strings.Language): String = "/${language.tag}/$segment"

    fun url(origin: String, language: Strings.Language): String = origin.trimEnd('/') + path(language)
}
