package com.resonance.app

import android.app.NotificationManager
import android.provider.Settings
import com.resonance.api.models.NotificationSettings
import com.resonance.app.PushCenter.PicksBlock
import com.resonance.app.ui.TurnOn
import com.resonance.app.ui.showsPermissionNotice
import com.resonance.app.ui.turnOn
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PicksBlockTest {
    /** The pushes of Settings → Notifications come on the "picks" channel: that channel off alone holds them back too. */
    @Test fun aPicksChannelTurnedOffHoldsThePushesBack() {
        assertEquals(PicksBlock.None, PushCenter.picksBlock(appEnabled = true, picksImportance = NotificationManager.IMPORTANCE_DEFAULT))
        assertEquals(PicksBlock.None, PushCenter.picksBlock(appEnabled = true, picksImportance = NotificationManager.IMPORTANCE_LOW))
        // Not made yet (it is, from init): nothing says it is off.
        assertEquals(PicksBlock.None, PushCenter.picksBlock(appEnabled = true, picksImportance = null))
        assertEquals(PicksBlock.Channel, PushCenter.picksBlock(appEnabled = true, picksImportance = NotificationManager.IMPORTANCE_NONE))
        // The app's notifications off is the wider block, whatever the channel says.
        assertEquals(PicksBlock.App, PushCenter.picksBlock(appEnabled = false, picksImportance = NotificationManager.IMPORTANCE_DEFAULT))
        assertEquals(PicksBlock.App, PushCenter.picksBlock(appEnabled = false, picksImportance = NotificationManager.IMPORTANCE_NONE))
    }

    /** With only the channel off the permission is given, so there is nothing to ask: the switch is refused and the notice shows. */
    @Test fun turningASwitchOnWithThePicksChannelOffIsRefused() {
        val block = PushCenter.picksBlock(appEnabled = true, picksImportance = NotificationManager.IMPORTANCE_NONE)
        assertEquals(TurnOn.Refused, turnOn(canNotify = block == PicksBlock.None, canAskPermission = false))
        val on = NotificationSettings(picks = true, connectionCards = false)
        assertTrue(showsPermissionNotice(on, canNotify = block == PicksBlock.None, refused = false))
    }

    /** The notice's button opens where the block is lifted: the "picks" channel's own page when only it is off. */
    @Test fun theNoticeOpensThePicksChannelWhenOnlyItIsOff() {
        assertEquals(
            PushCenter.SettingsPage(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS, PushCenter.PICKS_CHANNEL_ID),
            PushCenter.settingsPage(PicksBlock.Channel),
        )
        assertEquals("picks", PushCenter.settingsPage(PicksBlock.Channel).channelId)
        assertEquals(PushCenter.SettingsPage(Settings.ACTION_APP_NOTIFICATION_SETTINGS), PushCenter.settingsPage(PicksBlock.App))
    }
}
