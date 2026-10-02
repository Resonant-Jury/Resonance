package com.resonance.app.ui

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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.AuthShell
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicLink
import com.resonance.design.WavyDivider
import com.resonance.design.generated.Tokens
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * The web's signup profile step ((auth)/signup/page.tsx, step 'profile'),
 * which a signed-in account without a profile passes before the tabs: a pen
 * name checked as it is typed, where you are, the language you mainly write
 * in, then Finish (POST /api/v1/me). On the sign-in's shell, the cover only
 * the one-row lockup and the form on the sheet below it; signing out stays at
 * hand at the sheet's end, for an account picked by mistake. What was typed
 * survives rotation and process death.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OnboardingScreen(session: Session) {
    val scope = rememberCoroutineScope()
    var handle by rememberSaveable { mutableStateOf("") }
    var region by rememberSaveable { mutableStateOf("TW") }
    // The web defaults to 繁體中文; the app starts from the language it is shown in.
    var primaryLocale by rememberSaveable { mutableStateOf(Strings.language.tag) }
    var retry by remember { mutableIntStateOf(0) }
    val availability = rememberPenNameAvailability(session, handle, retry = retry)
    var pending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val ready = availability.value == Availability.Available && !pending

    fun finish() {
        if (!ready) return
        scope.launch {
            pending = true
            error = null
            try {
                // Success hands the account its profile, and the tabs take this screen's place.
                session.createProfile(handle.trim(), region, primaryLocale)
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiFailure) {
                // Taken between the check and the tap.
                if (e.isConflict) availability.value = Availability.Taken else error = L10n.Auth.signUpError
            } catch (e: Exception) {
                error = L10n.Auth.signUpError
            } finally {
                pending = false
            }
        }
    }

    AuthShell {
        SheetHeading(L10n.Auth.signUpTitle, L10n.Auth.stepHandle)
        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
            PenNameField(L10n.Auth.handleLabel, handle, { handle = it; error = null }, availability.value, onRetry = { retry++ })
            ChoiceList(L10n.Auth.regionLabel, Regions.signup, region, seed = 131.0, flag = { it }) { region = it }
            ChoiceList(L10n.Auth.primaryLocaleLabel, WritingLanguages, primaryLocale, seed = 151.0) { primaryLocale = it }
            // The web's Finish sits at the end of the row, dimmed until the name is free.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OrganicButton(if (pending) L10n.Auth.creating else L10n.Auth.finish, enabled = ready, onClick = ::finish)
            }
        }
        error?.let { BasicText(it, style = AppFonts.body(13f, color = Tokens.Terracotta), modifier = Modifier.padding(top = 12.dp)) }
        // The web's footer under a rule ("Already have one?"): here, whose account this is, and the way out of it.
        WavyDivider(seed = 171.0, modifier = Modifier.padding(top = 24.dp, bottom = 16.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            session.email?.let { BasicText(it, style = AppFonts.body(14f, lineHeight = 1.6f, color = Tokens.TextMuted)) }
            OrganicLink(L10n.App.Nav.signOut, href = "/signout", sizeSp = 14f) { session.signOut() }
        }
    }
}
