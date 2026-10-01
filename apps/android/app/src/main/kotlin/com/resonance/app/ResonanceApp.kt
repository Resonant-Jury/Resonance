package com.resonance.app

import android.app.Application
import android.os.Build
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.l10n.Strings

class ResonanceApp : Application(), SingletonImageLoader.Factory {
    private var session: Session? = null

    /** One session for the process, so a recreated activity finds the same state and listeners. */
    fun session(config: AppConfig): Session = session ?: Session(config, getSharedPreferences("settings", MODE_PRIVATE)).also {
        session = it
        it.start { it.loadMe() }
    }

    /** AVIF — the AI illustrations — needs its own decoder before Android 12. */
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || (BuildConfig.DEBUG && DebugLaunch.avifDecoder)) add(AvifDecoder.Factory())
        }
        .build()

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
