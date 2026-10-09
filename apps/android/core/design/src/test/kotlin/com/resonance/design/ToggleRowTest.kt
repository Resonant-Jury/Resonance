package com.resonance.design

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A switch and its words are one control, as the web's `<label>` around a ToggleSwitch makes
 * them (the publish panel's 以匿名發布, the report's "also block", Settings → 通知): a tap on the
 * words flips it, and TalkBack meets one switch named by them — never a nameless 50×28 target
 * beside a line of text that does nothing.
 */
@RunWith(RobolectricTestRunner::class)
class ToggleRowTest {
    @get:Rule val compose = createComposeRule()

    private var on by mutableStateOf(false)

    private fun row(enabled: Boolean = true) = compose.setContent {
        Row(Modifier.toggleRow(on, enabled) { on = it }) {
            BasicText("以匿名發布", Modifier.weight(1f))
            OrganicToggle(on, seed = 57.0, enabled = enabled)
        }
    }

    @Test fun aTapOnTheWordsFlipsTheSwitch() {
        row()
        compose.onNodeWithText("以匿名發布").performClick()
        assertTrue(on)
        compose.onNodeWithText("以匿名發布").performClick()
        assertFalse(on)
    }

    @Test fun aTapOnTheSwitchItselfFlipsItToo() {
        row()
        // The switch sits at the row's far end: a tap there, where the drawing is.
        compose.onNodeWithText("以匿名發布").performTouchInput { click(centerRight.copy(x = right - 25.dp.toPx())) }
        assertTrue(on)
    }

    @Test fun talkBackMeetsOneSwitchNamedByItsWords() {
        row()
        compose.onAllNodes(isToggleable()).assertCountEquals(1)
        val node = compose.onNode(isToggleable())
        node.assert(hasText("以匿名發布")).assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Switch)).assertIsOff()
        on = true
        node.assertIsOn()
        // The words are the switch's name, not a node of their own beside it.
        compose.onAllNodesWithText("以匿名發布").assertCountEquals(1)
    }

    @Test fun itsTargetIsAFingerTallThoughTheRowIsShorter() {
        row()
        val node = compose.onNode(isToggleable()).fetchSemanticsNode()
        with(compose.density) {
            // The row is as tall as the switch (28); what a finger or TalkBack's focus may land on is at least 48.
            assertTrue(node.boundsInRoot.height < 48.dp.toPx())
            assertTrue(node.touchBoundsInRoot.height >= 48.dp.toPx() - 0.5f)
        }
    }

    @Test fun notEnabledATapDoesNothing() {
        row(enabled = false)
        compose.onNode(isToggleable()).assertIsNotEnabled()
        compose.onNodeWithText("以匿名發布").performClick()
        assertEquals(false, on)
    }
}
