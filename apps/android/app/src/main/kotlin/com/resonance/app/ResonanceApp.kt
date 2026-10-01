package com.resonance.app

import android.app.Application
import android.os.Build
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.api.HttpCaching
import com.resonance.kit.l10n.Strings
import com.resonance.kit.reading.ApiCache
import okhttp3.Cache
import okhttp3.OkHttpClient
import java.io.File

class ResonanceApp : Application(), SingletonImageLoader.Factory {
    private var session: Session? = null

    /** The app's one HTTP client: the API and the images share its connections and threads. */
    private val http by lazy { OkHttpClient() }
    /** The API's HTTP cache (what the server lets a private cache keep; emptied on sign-out). */
    private val httpCaching by lazy { HttpCaching(Cache(File(cacheDir, "http"), 10L * 1024 * 1024)) }

    /** One session for the process, so a recreated activity finds the same state and listeners. */
    fun session(config: AppConfig): Session = session ?: Session(
        config,
        getSharedPreferences("settings", MODE_PRIVATE),
        http = httpCaching.client(http),
        httpCaching = httpCaching,
        // What the screens a cold start opens on last showed, per account (cache: never backed up).
        kept = ApiCache(File(cacheDir, "api")),
    ).also {
        session = it
        it.start { it.loadMe() }
    }

    /**
     * Coil reads the pictures through the app's client (its own disk cache keeps them; their
     * addresses never change). AVIF — the AI illustrations — needs its own decoder before
     * Android 12.
     */
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components {
            add(OkHttpNetworkFetcherFactory(callFactory = { http }))
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
