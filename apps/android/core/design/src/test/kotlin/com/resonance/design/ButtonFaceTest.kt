package com.resonance.design

import com.resonance.design.generated.Tokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every button has a fill and none a pen line (OrganicButton.tsx's BTN_VARIANTS): the verb solid in
 * the deep terracotta with a cream label, everything beside it the tonal peach with the deep
 * label — the older names (Ghost, Outline, Text, TextAccent) wearing it too — the final destructive
 * confirm solid red, and the way into a destructive flow the red's own tint.
 */
class ButtonFaceTest {
    @Test fun noFaceIsSeeThrough() {
        for (variant in ButtonVariant.entries) {
            assertTrue("$variant has a fill", ButtonFace.of(variant).fill.alpha == 1f)
        }
    }

    @Test fun theVerbIsTheDeepTerracottaWithACreamLabel() {
        for (variant in listOf(ButtonVariant.Solid, ButtonVariant.Primary)) {
            val face = ButtonFace.of(variant)
            assertEquals(Mixes.ButtonFill, face.fill)
            assertEquals(Tokens.Cream, face.label)
            assertEquals(3.0, face.seed, 0.0)
        }
    }

    @Test fun cancelCloseRetryAndLoadMoreWearTheTonalPill() {
        for (variant in listOf(ButtonVariant.Tonal, ButtonVariant.Text, ButtonVariant.TextAccent, ButtonVariant.Ghost, ButtonVariant.Outline)) {
            val face = ButtonFace.of(variant)
            assertEquals("$variant", Mixes.ButtonTonal, face.fill)
            assertEquals("$variant", Mixes.ButtonOnTonal, face.label)
            // A tinted face takes a wash of its own hue when pressed, not the filled faces' darkening.
            assertEquals("$variant", OrganicIndication.Wash, face.press)
        }
        // Each keeps the wobble of the variant it grew out of.
        assertEquals(401.0, ButtonFace.of(ButtonVariant.Text).seed, 0.0)
        assertEquals(601.0, ButtonFace.of(ButtonVariant.TextAccent).seed, 0.0)
        assertEquals(601.0, ButtonFace.of(ButtonVariant.Tonal).seed, 0.0)
    }

    @Test fun theFinalDestructiveConfirmIsSolidRedAndTheWayIntoItItsTint() {
        val danger = ButtonFace.of(ButtonVariant.Danger)
        assertEquals(Mixes.DangerFill, danger.fill)
        assertEquals(Tokens.Cream, danger.label)
        val entry = ButtonFace.of(ButtonVariant.DangerTonal)
        assertEquals(Mixes.ButtonDangerTonal, entry.fill)
        assertEquals(Mixes.ButtonOnDangerTonal, entry.label)
    }

    @Test fun everyFaceButPaperCarriesTheButtonsGrain() {
        for (variant in ButtonVariant.entries) {
            val face = ButtonFace.of(variant)
            if (variant == ButtonVariant.Paper) assertEquals("grain-card", face.grainTile)
            else assertEquals("$variant", "grain-button", face.grainTile)
        }
    }
}
