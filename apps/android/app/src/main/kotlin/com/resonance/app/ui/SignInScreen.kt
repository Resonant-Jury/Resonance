package com.resonance.app.ui

import com.resonance.app.R
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
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
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicLink
import com.resonance.design.OrganicTextField
import com.resonance.design.WavyDivider
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.grainOverlay
import com.resonance.kit.PolicyPage
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.launch

/**
 * The web's sign-in page on a phone ((auth)/layout.tsx + AuthCard): the brand
 * lockup over a full-bleed section between two wavy rules, the whole block
 * centred on the screen; Google (Apple is iOS-only).
 */
@Composable
fun SignInScreen(session: Session) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val signingIn by session.signingIn.collectAsStateWithLifecycle()
    val error by session.signInError.collectAsStateWithLifecycle()
    val signedOutForDeletion by session.signedOutForDeletion.collectAsStateWithLifecycle()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    AuthPage {
        AuthSection {
            BasicText(L10n.Auth.signInTitle, style = AppFonts.heading(24f, lineHeight = 1.3f), modifier = Modifier.padding(bottom = 22.dp).semantics { heading() })
            BasicText(L10n.Auth.googleIntro, style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted), modifier = Modifier.padding(bottom = 24.dp))
            if (signedOutForDeletion) {
                BasicText(L10n.Auth.deletionScheduled, style = AppFonts.body(14f, 600, lineHeight = 1.6f, color = Tokens.Terracotta), modifier = Modifier.padding(bottom = 20.dp))
            }
            OrganicButton(
                L10n.Auth.continueWithGoogle,
                variant = ButtonVariant.Outline,
                image = painterResource(R.drawable.google_mark),
                busyTitle = L10n.Auth.signingIn,
                busy = signingIn,
            ) {
                scope.launch { session.signInWithGoogle(context) }
            }
            error?.let { BasicText(it, style = AppFonts.body(13f, color = Tokens.Terracotta), modifier = Modifier.padding(top = 12.dp)) }
            TermsConsentLine(session, Modifier.padding(top = 24.dp))
        }
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

/**
 * The web's (auth)/layout.tsx on a phone: the brand lockup over the page's
 * content, the whole block centred on the screen and scrolling when taller
 * (the sign-in and pen-name steps share it).
 */
@Composable
internal fun AuthPage(content: @Composable ColumnScope.() -> Unit) {
    // The keyboard shortens the page (a field stays in view), and the block re-centres above it.
    BoxWithConstraints(Modifier.fillMaxSize().cream().imePadding()) {
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .fillMaxWidth()
                .heightIn(min = maxHeight)
                .systemBarsPadding()
                .padding(vertical = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // ResonanceIcon (the wave glyph, nudged down 7%) beside the wordmark.
            Row(verticalAlignment = Alignment.CenterVertically) {
                OrganicIcon(IconName.Wave, Modifier.offset(y = (44 * 0.07).dp), size = 44.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value)
                Spacer(Modifier.width(10.dp))
                BasicText("Resonance", style = AppFonts.heading(26f, 700, lineHeight = 1.3f))
            }
            Spacer(Modifier.height(36.dp))
            content()
        }
    }
}

/**
 * AuthCard's phone section: full bleed on the auth paper with grain; the
 * rules lie on the fill's own edges (top/bottom −3), not in rows of their own.
 */
@Composable
internal fun AuthSection(content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxWidth()) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Tokens.AuthInterior)
                .grainOverlay(0.04f)
                .padding(horizontal = 36.dp, vertical = 42.dp),
            content = content,
        )
        WavyDivider(Tokens.AuthBorder, seed = 313.0, modifier = Modifier.align(Alignment.TopCenter).offset(y = (-3).dp))
        WavyDivider(Tokens.AuthBorder, seed = 324.0, modifier = Modifier.align(Alignment.BottomCenter).offset(y = 3.dp))
    }
}

/**
 * TermsConsent (web): "By continuing, you agree to the Terms of Use and the
 * Privacy Policy" under the buttons, 13sp muted, the two policy pages as
 * OrganicLinks inside the sentence (App Store 1.2 / the same promise on
 * Play: people agree to the terms before they can post). The sentence wraps
 * like text around the links; words break at spaces, Han between characters.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TermsConsentLine(session: Session, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val language = Strings.language
    val mark = "\u0001"
    val sentence = L10n.Auth.agreeTerms(terms = "${mark}terms$mark", privacy = "${mark}privacy$mark")
    val text = AppFonts.body(13f, lineHeight = 1.8f, color = Tokens.TextMuted)
    FlowRow(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        sentence.split(mark).forEachIndexed { i, part ->
            when {
                part.isEmpty() -> Unit
                i % 2 == 1 -> {
                    val page = if (part == "terms") PolicyPage.Terms else PolicyPage.Privacy
                    OrganicLink(
                        if (page == PolicyPage.Terms) L10n.Auth.termsLink else L10n.Auth.privacyLink,
                        href = page.path(language),
                        sizeSp = 13f,
                        modifier = Modifier.alignByBaseline(),
                    ) { InAppBrowser.open(context, page.url(session.config.origin, language)) }
                }
                ' ' in part -> part.split(' ').let { words ->
                    words.forEachIndexed { j, w ->
                        val piece = w + if (j < words.lastIndex) "\u00A0" else ""
                        if (piece.isNotEmpty()) BasicText(piece, style = text, modifier = Modifier.alignByBaseline())
                    }
                }
                else -> part.forEach { c -> BasicText(c.toString(), style = text, modifier = Modifier.alignByBaseline()) }
            }
        }
    }
}
