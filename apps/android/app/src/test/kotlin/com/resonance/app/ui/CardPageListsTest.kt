package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.design.CardListLayout
import com.resonance.design.WindowLayout
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A card page's resonances and the owner's linked cards (round 5 D3) take the related list's
 * layout at every width: the mini bands where it draws bands, its bordered grid where it does.
 */
class CardPageListsTest {
    private fun styleAt(width: Float) = answerListStyle(CardListLayout.of(WindowLayout(width.dp)))

    @Test fun aPhoneAndAMediumWindowKeepTheMiniBands() {
        assertEquals(AnswerListStyle.MiniBands, styleAt(390f))
        assertEquals(AnswerListStyle.MiniBands, styleAt(700f))
    }

    @Test fun anExpandedWindowDrawsThemInTheRelatedGrid() {
        assertEquals(AnswerListStyle.Grid, styleAt(900f))
        assertEquals(AnswerListStyle.Grid, styleAt(1280f))
    }
}
