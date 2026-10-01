package com.resonance.app.ui

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.LocalIndication
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.Session
import com.resonance.design.OrganicIndication
import com.resonance.design.SketchLoader
import com.resonance.design.cream
import com.resonance.design.generated.Tokens

/**
 * Signed out → sign-in; signed in → the tabs, or first the pen-name step for
 * a new account (see [Session.Entry]); restoring → the paper and a loader.
 */
@Composable
fun ResonanceRoot(session: Session, incomingRoute: MutableState<String?>) {
    MaterialTheme(colorScheme = lightColorScheme(primary = Tokens.Terracotta, surface = Tokens.Cream, background = Tokens.Cream)) {
    // Every press is the hand-drawn ink spread, never Material's rectangular ripple (it spilt past round chips and bare glyphs).
    CompositionLocalProvider(LocalIndication provides OrganicIndication()) {
        val phase by session.phase.collectAsStateWithLifecycle()
        Crossfade(phase, Modifier.fillMaxSize().cream(), label = "phase") { p ->
            when (p) {
                Session.Phase.Restoring -> Loading()
                Session.Phase.SignedOut -> SignInScreen(session)
                Session.Phase.SignedIn -> SignedIn(session, incomingRoute)
            }
        }
    }
    }
}

/**
 * A link that arrives meanwhile waits in `incomingRoute` until the tabs open it. The tabs belong to
 * the account: another one signing in (without a sign-out between) gets its own, nothing kept.
 */
@Composable
private fun SignedIn(session: Session, incomingRoute: MutableState<String?>) {
    val entry by session.entry.collectAsStateWithLifecycle()
    val account by session.signedInUid.collectAsStateWithLifecycle()
    Crossfade(entry, Modifier.fillMaxSize().cream(), label = "entry") { e ->
        when (e) {
            Session.Entry.Waiting -> Loading()
            Session.Entry.Onboarding -> OnboardingScreen(session)
            Session.Entry.App -> key(account) { MainTabs(session, incomingRoute) }
        }
    }
}

@Composable
private fun Loading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { SketchLoader(56.dp) }
}

private val Int.dp get() = androidx.compose.ui.unit.Dp(this.toFloat())
