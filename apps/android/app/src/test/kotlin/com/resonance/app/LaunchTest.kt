package com.resonance.app

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/** How the app opens: the splash only on a launch, and the paper's bars kept as it hands off. */
class LaunchTest {
    @Test fun anActivityComingBackOnAndroid10Or11AsksForNoSplash() {
        // The library would lay its own splash over the screen restored under it (a rotation, a font size).
        assertFalse(handsOff(fresh = false, sdk = 29))
        assertFalse(handsOff(fresh = false, sdk = 30))
        assertTrue(handsOff(fresh = true, sdk = 29))
        // From 12 the system shows a splash or doesn't, and hands off only its own.
        assertTrue(handsOff(fresh = false, sdk = 31))
        assertTrue(handsOff(fresh = true, sdk = 36))
    }

    @Test fun thePostSplashThemeKeepsTheBarsSeeThroughWithDarkGlyphs() {
        // Android 12 and 12L copy these onto the window as the splash hands off: Theme.Material's
        // own would put a grey band over the status bar and a black one under the page.
        val styles = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/values/themes.xml"))
            .documentElement.getElementsByTagName("style")
        val theme = (0 until styles.length).map { styles.item(it) as Element }.single { it.getAttribute("name") == "Theme.Resonance" }
        val items = theme.getElementsByTagName("item").let { list ->
            (0 until list.length).map { list.item(it) as Element }.associate { it.getAttribute("name") to it.textContent.trim() }
        }
        assertEquals("@android:color/transparent", items["android:statusBarColor"])
        assertEquals("@android:color/transparent", items["android:navigationBarColor"])
        assertEquals("true", items["android:windowLightStatusBar"])
        assertEquals("true", items["android:windowLightNavigationBar"])
        assertEquals("false", items["android:enforceStatusBarContrast"])
        assertEquals("false", items["android:enforceNavigationBarContrast"])
    }
}
