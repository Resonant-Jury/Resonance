package com.resonance.app.ui

import com.resonance.app.R
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicTextField
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.launch

/** The web's sign-in page on a phone: a section between two wavy rules; Google (Apple is iOS-only). */
@Composable
fun SignInScreen(session: Session) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val signingIn by session.signingIn.collectAsStateWithLifecycle()
    val error by session.signInError.collectAsStateWithLifecycle()
    val signedOutForDeletion by session.signedOutForDeletion.collectAsStateWithLifecycle()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().cream().verticalScroll(rememberScrollState()).padding(top = 96.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        BasicText("Resonance", style = AppFonts.heading(22f, 600, lineHeight = 1.3f).copy(color = Tokens.Terracotta))
        Spacer(Modifier.height(28.dp))
        WavyDivider(Tokens.AuthBorder, seed = 313.0)
        Column(
            Modifier.fillMaxWidth().background(Tokens.AuthInterior).padding(horizontal = 36.dp, vertical = 42.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            BasicText(L10n.Auth.signInTitle, style = AppFonts.heading(30f, lineHeight = 1.25f), modifier = Modifier.semantics { heading() })
            BasicText(L10n.Auth.googleIntro, style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted))
            Spacer(Modifier.height(10.dp))
            if (signedOutForDeletion) BasicText(L10n.Auth.deletionScheduled, style = AppFonts.body(14f, 600, lineHeight = 1.6f, color = Tokens.Terracotta))
            OrganicButton(
                if (signingIn) L10n.Auth.signingIn else L10n.Auth.continueWithGoogle,
                variant = ButtonVariant.Outline,
                image = painterResource(R.drawable.google_mark),
                enabled = !signingIn,
            ) {
                scope.launch { session.signInWithGoogle(context) }
            }
            error?.let { BasicText(it, style = AppFonts.body(13f, color = Tokens.Terracotta)) }
        }
        WavyDivider(Tokens.AuthBorder, seed = 317.0)
        if (session.config.usesEmulator) {
            Column(Modifier.fillMaxWidth().padding(36.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                BasicText("Emulator", style = AppFonts.body(12f, 600, color = Tokens.TextMuted))
                OrganicTextField(L10n.Auth.email, email, { email = it }, placeholder = "alice@resonance.test")
                OrganicTextField(L10n.Auth.password, password, { password = it }, isSecure = true, seed = 23.0)
                OrganicButton(L10n.Auth.signIn, enabled = email.isNotEmpty() && password.isNotEmpty() && !signingIn) {
                    scope.launch { session.signIn(email, password) }
                }
            }
        }
    }
}
