package com.resonance.app

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.animation.PathInterpolator
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen
import androidx.core.splashscreen.SplashScreenViewProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * How the app opens, as Google Maps or YouTube do: the system's splash — the launcher's waves on the
 * paper (Theme.Resonance.Starting), never the black of a phone in dark mode — stays while the
 * session restores, at most [HOLD_MILLIS], and then hands off to the first screen: the waves grow a
 * little as they fade, and the splash dissolves into the page under it. That page is the same paper,
 * so the hand-off reads as one surface coming to life rather than a cut. The twin of iOS's launch
 * cover.
 */
object Launch {
    /** The longest the splash waits for the first screen; past it, the screen's own loader shows. */
    const val HOLD_MILLIS = 700L

    /** The splash dissolving into the first screen. */
    const val EXIT_MILLIS = 320L

    /** The waves fade sooner than the paper, so they are gone by the time the page shows through. */
    const val ICON_EXIT_MILLIS = 200L

    /** The longest the hand-off waits for the first screen to settle. */
    const val HANDOFF_WAIT_MILLIS = 400L

    /** When a launch that showed no splash stops counting as covered (from its first frame). */
    private const val UNCOVER_FALLBACK_MILLIS = 3000L

    /** How far the waves grow as they go. */
    const val ICON_GROWTH = 1.12f

    /** CSS's ease-out (iOS's too): the dissolve starts at once and settles. */
    private val EaseOut = PathInterpolator(0f, 0f, 0.58f, 1f)

    /**
     * While the splash covers the screen. A screen that changes under it — the loader giving way to
     * the tabs once the session is back — changes at once rather than crossfading (ResonanceRoot),
     * so what the splash dissolves into is the page itself, not a loader on its way out.
     */
    var covering by mutableStateOf(false)
        private set

    /**
     * Holds [splash] until [ready] (or [HOLD_MILLIS]) and plays the hand-off. `fresh` is a launch, not
     * an activity coming back (rotation, a restored process), which shows no splash. From Android 12
     * the system decides that, and calls the hand-off only for a splash it showed; on 10 and 11 the
     * splash is the library's own view, laid over the screen as soon as a hand-off is asked for — so
     * there an activity coming back asks for none, or a rotation would be covered and dissolved again.
     */
    fun hold(activity: ComponentActivity, splash: SplashScreen, fresh: Boolean, ready: () -> Boolean) {
        covering = fresh
        if (!handsOff(fresh, Build.VERSION.SDK_INT)) return
        val start = SystemClock.uptimeMillis()
        var released = false
        splash.setKeepOnScreenCondition {
            val keep = !ready() && SystemClock.uptimeMillis() - start < HOLD_MILLIS
            if (!keep && !released) {
                released = true
                // A launch the system shows no splash for never calls the listener below: it uncovers on its own.
                if (fresh) activity.lifecycleScope.launch {
                    delay(UNCOVER_FALLBACK_MILLIS)
                    covering = false
                }
            }
            keep
        }
        splash.setOnExitAnimationListener { provider ->
            // The dissolve starts once the first screen has settled (the main thread has a moment to
            // spare, at most HANDOFF_WAIT_MILLIS on): begun while the page is still being built, its
            // frames are skipped and the splash just cuts away.
            whenIdle(HANDOFF_WAIT_MILLIS) {
                covering = false
                handOff(provider)
            }
        }
    }

    /** Runs [action] once the main thread is idle, or after [maxWaitMillis], whichever is first. */
    private fun whenIdle(maxWaitMillis: Long, action: () -> Unit) {
        var done = false
        val once = { if (!done) { done = true; action() } }
        Looper.myQueue().addIdleHandler { once(); false }
        Handler(Looper.getMainLooper()).postDelayed(once, maxWaitMillis)
    }

    private fun handOff(provider: SplashScreenViewProvider) {
        // A launch shown as a bare color (Android 12, opened by a link or a push) has no icon to animate.
        val icon: View? = runCatching { provider.iconView }.getOrNull()
        icon?.animate()
            ?.scaleX(ICON_GROWTH)?.scaleY(ICON_GROWTH)?.alpha(0f)
            ?.setDuration(ICON_EXIT_MILLIS)?.setInterpolator(EaseOut)
            ?.start()
        provider.view.animate()
            .alpha(0f)
            .setDuration(EXIT_MILLIS)
            .setInterpolator(EaseOut)
            .withEndAction { provider.remove() }
            .start()
    }
}

/**
 * Whether [Launch.hold] holds and hands off the splash on Android [sdk]: always from 12, where the
 * system shows one or not and calls the hand-off only for its own; before 12 only on a launch
 * (`fresh`), since asking draws the library's splash over whatever is on screen.
 */
internal fun handsOff(fresh: Boolean, sdk: Int): Boolean = fresh || sdk >= Build.VERSION_CODES.S
