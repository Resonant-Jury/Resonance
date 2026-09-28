package com.resonance.app.ui

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.Session
import com.resonance.design.SketchLoader
import com.resonance.design.cream
import com.resonance.design.generated.Tokens

/** Signed out → sign-in; signed in → the tabs; restoring → the paper and a loader. */
@Composable
fun ResonanceRoot(session: Session, incomingRoute: MutableState<String?>) {
    MaterialTheme(colorScheme = lightColorScheme(primary = Tokens.Terracotta, surface = Tokens.Cream, background = Tokens.Cream)) {
        val phase by session.phase.collectAsStateWithLifecycle()
        Crossfade(phase, Modifier.fillMaxSize().cream(), label = "phase") { p ->
            when (p) {
                Session.Phase.Restoring -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { SketchLoader(56.dp) }
                Session.Phase.SignedOut -> SignInScreen(session)
                Session.Phase.SignedIn -> MainTabs(session, incomingRoute)
            }
        }
    }
}

private val Int.dp get() = androidx.compose.ui.unit.Dp(this.toFloat())
