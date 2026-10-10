package com.resonance.app.ui

import com.resonance.app.R
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.AuthShell
import com.resonance.design.BrandTagline
import com.resonance.design.ButtonVariant
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicLink
import com.resonance.design.OrganicTextField
import com.resonance.design.WavyDivider
import com.resonance.design.generated.Tokens
import com.resonance.kit.PolicyPage
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.launch

/**
 * The web's sign-in page on a phone ((auth)/layout.tsx + AuthCard at ≤640px,
 * "anchored"): the brand and the hero's line on the cover, the sign-in on the
 * sheet at the bottom, in the thumb's reach. Google only (Apple is iOS-only;
 * it would sit above Google, in ink).
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
    AuthShell(BrandTagline(L10n.Hero.headlinePrefix, L10n.Hero.headlineAccent, L10n.Hero.headlineSuffix)) {
        SheetHeading(L10n.Auth.signInTitle, L10n.Auth.googleIntro)
        if (signedOutForDeletion) {
            BasicText(L10n.Auth.deletionScheduled, style = AppFonts.body(14f, 600, lineHeight = 1.6f, color = Tokens.Terracotta), modifier = Modifier.padding(bottom = 16.dp))
        }
        // The sheet is the frame, so the button draws none (solid); the G keeps its white ground on a disc.
        OrganicButton(
            L10n.Auth.continueWithGoogle,
            variant = ButtonVariant.Solid,
            image = painterResource(R.drawable.google_mark),
            markOnDisc = true,
            block = true,
            loading = signingIn,
        ) {
            scope.launch { session.signInWithGoogle(context) }
        }
        error?.let { BasicText(it, style = AppFonts.body(13f, color = Tokens.Terracotta), modifier = Modifier.padding(top = 12.dp)) }
        TermsConsentLine(session, Modifier.padding(top = 16.dp))
        if (session.config.usesEmulator) {
            WavyDivider(seed = 181.0, modifier = Modifier.padding(vertical = 20.dp))
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
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
 * The sheet's heading (the sign-in and pen-name steps share it): Playfair
 * 24/700, 8 above the muted 14 intro (wrapped as `text-wrap: pretty`), 22
 * above what follows.
 */
@Composable
internal fun SheetHeading(title: String, intro: String) {
    BasicText(title, style = AppFonts.heading(24f, 700, lineHeight = 1.3f), modifier = Modifier.padding(bottom = 8.dp).semantics { heading() })
    BasicText(
        intro,
        style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted).copy(lineBreak = LineBreak.Paragraph),
        modifier = Modifier.padding(bottom = 22.dp),
    )
}

/**
 * TermsConsent (web): "By continuing, you agree to the Terms of Use and the
 * Privacy Policy" under the buttons, 13sp muted, the two policy pages as
 * OrganicLinks inside the sentence (App Store 1.2 / the same promise on
 * Play: people agree to the terms before they can post). The sentence wraps
 * like text around the links; words break at spaces, Han between characters,
 * and closing punctuation (the \u3002 after a link) stays on the line before it.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TermsConsentLine(session: Session, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val language = Strings.language
    val mark = "\u0001"
    val sentence = L10n.Auth.agreeTerms(terms = "${mark}terms$mark", privacy = "${mark}privacy$mark")
    val text = AppFonts.body(13f, lineHeight = 1.75f, color = Tokens.TextMuted)
    // Each run is one unbreakable piece: a link, a word or a Han character.
    // A run that opens with closing punctuation joins the one before it.
    val runs = mutableListOf<MutableList<Pair<String, PolicyPage?>>>()
    fun add(piece: String, page: PolicyPage? = null) {
        if (page == null && piece.first() in NO_BREAK_BEFORE && runs.isNotEmpty()) runs.last() += piece to null
        else runs += mutableListOf(piece to page)
    }
    sentence.split(mark).forEachIndexed { i, part ->
        when {
            part.isEmpty() -> Unit
            i % 2 == 1 -> add(part, if (part == "terms") PolicyPage.Terms else PolicyPage.Privacy)
            ' ' in part -> part.split(' ').let { words ->
                words.forEachIndexed { j, w ->
                    val piece = w + if (j < words.lastIndex) "\u00A0" else ""
                    if (piece.isNotEmpty()) add(piece)
                }
            }
            else -> part.forEach { c -> add(c.toString()) }
        }
    }
    FlowRow(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        runs.forEach { run ->
            Row(Modifier.alignByBaseline()) {
                run.forEach { (piece, page) ->
                    if (page != null) {
                        OrganicLink(
                            if (page == PolicyPage.Terms) L10n.Auth.termsLink else L10n.Auth.privacyLink,
                            href = page.path(language),
                            sizeSp = 13f,
                            modifier = Modifier.alignByBaseline(),
                        ) { InAppBrowser.open(context, page.url(session.config.origin, language)) }
                    } else {
                        BasicText(piece, style = text, modifier = Modifier.alignByBaseline())
                    }
                }
            }
        }
    }
}

/** Punctuation that never opens a line (CJK kinsoku, and the Latin stops). */
private const val NO_BREAK_BEFORE = "\u3002\uFF0C\u3001\uFF0E\uFF01\uFF1F\uFF1A\uFF1B\uFF09\u300D\u300F\u300B\u3009\u2026,.!?:;)"
