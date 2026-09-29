package com.resonance.app

import android.app.Application
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.l10n.Strings

class ResonanceApp : Application() {
    private var session: Session? = null

    /** One session for the process, so a recreated activity finds the same state and listeners. */
    fun session(config: AppConfig): Session = session ?: Session(config, getSharedPreferences("settings", MODE_PRIVATE)).also {
        session = it
        it.start { it.loadMe() }
    }

    override fun onCreate() {
        super.onCreate()
        AppFonts.init(this)
        Grain.init(this)
        // The web's catalogs, bundled as they are (see L10n.kt).
        Strings.load { lang -> runCatching { assets.open("${lang.tag}.json").bufferedReader().use { it.readText() } }.getOrNull() }
        val saved = getSharedPreferences("settings", MODE_PRIVATE).getString(Session.LANGUAGE_KEY, null)
        Strings.language = Strings.Language.fromTag(saved)
            ?: Strings.Language.preferred(resources.configuration.locales.let { l -> List(l.size()) { l[it].toLanguageTag() } })
        // The "activity" channel (named in the language just chosen) exists before any push can arrive.
        PushCenter.init(this)
    }
}
