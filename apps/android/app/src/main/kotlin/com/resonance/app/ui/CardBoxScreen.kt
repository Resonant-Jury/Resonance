package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OklchColor
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIconButton
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n

/** My card box — A1 shows who is signed in; the shelves, settings and safety arrive in A2. */
@Composable
fun CardBoxScreen(session: Session, open: (Route) -> Unit) {
    val profile by session.profile.collectAsStateWithLifecycle()
    TabScreen(L10n.App.Nav.me, trailing = {
        OrganicIconButton(IconName.Logout, L10n.App.Nav.signOut) { session.signOut() }
    }) {
        item {
            when (val p = profile) {
                is Session.Profile.Loaded -> Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    HandDrawnAvatar(p.me.initials, p.me.avatarUrl, OklchColor.parse(p.me.accentColor) ?: Tokens.TerracottaLight, 72.dp, seedFromString(p.me.id).toDouble())
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        BasicText(p.me.handle, style = AppFonts.heading(24f))
                        BasicText(p.me.bio ?: L10n.Me.bioEmpty, style = AppFonts.body(14f, color = Tokens.TextMuted))
                    }
                }
                Session.Profile.Missing -> OrganicEmptyState(L10n.Auth.stepHandle)
                Session.Profile.Failed -> OrganicEmptyState(L10n.Native.loadError)
                else -> {}
            }
        }
    }
}

@Composable
fun PlaceholderScreen(title: String, message: String) {
    TabScreen(title) { item { OrganicEmptyState(message) } }
}
