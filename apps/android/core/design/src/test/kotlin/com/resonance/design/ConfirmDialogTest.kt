package com.resonance.design

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.File

/**
 * A confirm's ways out all say the same thing: the backdrop around the card, which TalkBack reads
 * as a button after the card, and the card's own dismiss action are named by the dialog's cancel
 * words ("先留著" for a card's delete) — not "關閉", a close the dialog has no button for.
 */
@RunWith(RobolectricTestRunner::class)
class ConfirmDialogTest {
    @get:Rule val compose = createComposeRule()

    private val language = Strings.language

    @Before fun catalogs() {
        // The app's fonts and grain, as ResonanceApp sets them up.
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun theBackdropIsNamedByTheWayOutAtItsFoot() {
        var cancelled = 0
        compose.setContent {
            OrganicConfirmDialog(
                title = L10n.Me.Actions.deleteConfirmTitle,
                body = L10n.Me.Actions.deleteConfirmBody,
                cancelLabel = L10n.Me.Actions.deleteCancel,
                confirmLabel = L10n.Me.Actions.deleteConfirm,
                onCancel = { cancelled++ },
                onConfirm = {},
                destructive = true,
            )
        }
        val keep = L10n.Me.Actions.deleteCancel
        compose.onAllNodesWithContentDescription(L10n.Safety.Report.close).assertCountEquals(0)
        // TalkBack's double tap on the backdrop, and a finger beside the card (the centre is the card's).
        compose.onNodeWithContentDescription(keep).performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(1, cancelled)
        compose.onNodeWithContentDescription(keep).performTouchInput { click(topLeft + Offset(8f, 8f)) }
        assertEquals(2, cancelled)
        // The card's dismiss action (TalkBack's "dismiss" gesture) says it too.
        compose.onNode(SemanticsMatcher("dismisses as $keep") { it.config.getOrNull(SemanticsActions.Dismiss)?.label == keep }).assertExists()
    }
}
