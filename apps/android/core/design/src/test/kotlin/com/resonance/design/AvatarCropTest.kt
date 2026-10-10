package com.resonance.design

import org.junit.Assert.assertEquals
import org.junit.Test
import androidx.compose.ui.unit.dp

/** The profile photo's crop (design note B7): the shared table every platform answers the same way. */
class AvatarCropTest {
    private fun assertRect(x: Double, y: Double, side: Double, got: CropRect) {
        assertEquals("x", x, got.x, 1e-6)
        assertEquals("y", y, got.y, 1e-6)
        assertEquals("side", side, got.side, 1e-6)
    }

    @Test fun aLandscapePhotoStartsCentredWithItsShortSideFillingTheMask() {
        val crop = AvatarCrop(4000.0, 3000.0, 272.0)
        val start = CropState()
        assertRect(500.0, 0.0, 3000.0, crop.crop(start))
        // Twice the zoom about the mask's centre: half the side, the same middle.
        assertRect(1250.0, 750.0, 1500.0, crop.crop(crop.zoomTo(start, 2.0)))
    }

    @Test fun aDragNeverUncoversTheMask() {
        val crop = AvatarCrop(4000.0, 3000.0, 272.0)
        // Right as far as it goes (a little over 45 of the 100 asked), then left.
        assertRect(0.0, 0.0, 3000.0, crop.crop(crop.pan(CropState(), 100.0, 0.0)))
        assertRect(1000.0, 0.0, 3000.0, crop.crop(crop.pan(CropState(), -100.0, 0.0)))
        // Up or down there is nothing to move at the start: the short side fills the mask.
        assertRect(500.0, 0.0, 3000.0, crop.crop(crop.pan(CropState(), 0.0, 60.0)))
    }

    @Test fun aPortraitPhotoAndTheMostZoom() {
        val crop = AvatarCrop(1000.0, 2000.0, 250.0)
        assertRect(0.0, 500.0, 1000.0, crop.crop(CropState()))
        assertEquals(250.0, crop.crop(crop.zoomTo(CropState(), 4.0)).side, 1e-6)
        // Zoom stays between 1 and 4.
        assertEquals(4.0, crop.zoomTo(CropState(), 9.0).z, 1e-9)
        assertEquals(1.0, crop.zoomTo(CropState(), 0.2).z, 1e-9)
    }

    @Test fun zoomingAboutAPointKeepsThatPointUnderIt() {
        val crop = AvatarCrop(4000.0, 3000.0, 272.0)
        val start = crop.zoomTo(CropState(), 2.0)
        // The photo's point under (40, −30) from the mask's centre, before and after.
        fun under(state: CropState, ax: Double, ay: Double): Pair<Double, Double> {
            val s = crop.scale(state.z)
            return (4000.0 / 2 + (ax - state.ox) / s) to (3000.0 / 2 + (ay - state.oy) / s)
        }
        val before = under(start, 40.0, -30.0)
        val after = under(crop.zoomTo(start, 3.0, 40.0, -30.0), 40.0, -30.0)
        assertEquals(before.first, after.first, 1e-6)
        assertEquals(before.second, after.second, 1e-6)
    }

    @Test fun theOutputIsTheCropsOwnSizeBetween256And512() {
        assertEquals(512, AvatarCrop.outputSize(3000.0))
        assertEquals(300, AvatarCrop.outputSize(300.4))
        assertEquals(256, AvatarCrop.outputSize(120.0))
        assertEquals(1.0 * kotlin.math.exp(-0.2), AvatarCrop.wheelZoom(1.0, 100.0), 1e-9)
    }

    @Test fun theStageIsAtMost320AndTheMask48Smaller() {
        assertEquals(320f, cropStageSide(400f.dp).value, 1e-4f)
        assertEquals(296f, cropStageSide(296f.dp).value, 1e-4f)
        assertEquals(272f, cropMask(320f.dp).value, 1e-4f)
    }
}
