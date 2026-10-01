package com.resonance.app.ui

import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.serialization.NavBackStackSerializer
import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A tab's back stack survives a rotation or a reclaimed process: every kind of page it can hold
 * is saved and comes back as itself (through the serializer the saved stacks use), keeping the
 * key its saved state and ViewModels are found under. What a list handed a card page to draw
 * meanwhile is not saved — a restored page reads its card.
 */
class RouteStackTest {
    private val serializer = NavBackStackSerializer(Route.serializer())
    private val json = Json

    private fun restored(vararg routes: Route): List<Route> =
        json.decodeFromString(serializer, json.encodeToString(serializer, NavBackStack(*routes))).toList()

    private val preview = FeedCard(
        id = "c1", slug = "a-walk", title = "A walk", excerpt = "…", tags = listOf("walks"), publishedAt = "2026-09-01T08:00:00.000Z",
        author = Author(id = "bob", handle = "bob", initials = "BO", accentColor = "oklch(90% 0.06 140)", avatarUrl = null, avatarSeed = "42", verified = false, region = null),
        anonymous = false, visibility = FeedCard.Visibility.`public`, imageUrl = null, imageLabel = null, accentHue = 140.0,
        readMinutes = 2, referenceCardId = null, reason = null,
    )

    @Test fun everyKindOfPageComesBack() {
        val stack = listOf(
            Route.Root(Tab.CardBox),
            Route.Card("a-walk"),
            Route.Author("bob"),
            Route.Thread("bob", noteCardId = "c1", noteId = "n1", uid = "b1"),
            Route.Write(referenceCardId = "c1", story = "Words to start from"),
            Route.Write(cardId = "draft-1", showsCard = false),
            Route.Settings,
            Route.SettingsSection(SettingsSection.Account),
            Route.ThoughtMap,
        )
        assertEquals(stack, restored(*stack.toTypedArray()))
    }

    @Test fun aCardPageComesBackWithoutWhatTheListDrew() {
        val back = restored(Route.Root(Tab.Feed), Route.Card("a-walk", preview)).last() as Route.Card
        assertEquals("a-walk", back.key)
        assertNull(back.preview)
        // Its saved scroll and ViewModels are still found under the same key.
        assertEquals(Route.Card("a-walk", preview).contentKey, back.contentKey)
    }

    @Test fun differentPagesAreKeptApart() {
        val keys = listOf(
            Route.Root(Tab.Feed), Route.Root(Tab.Messages), Route.Card("a"), Route.Card("b"), Route.Author("a"),
            Route.Thread("bob"), Route.Thread("bob", noteCardId = "c1", noteId = "n1"), Route.Write(), Route.Write(cardId = "d1"),
        ).map { it.contentKey }
        assertEquals(keys.size, keys.toSet().size)
        // The same person's conversation, whatever case their pen name was typed in.
        assertEquals(Route.Thread("Bob").contentKey, Route.Thread("bob").contentKey)
        assertNotEquals(Route.Thread("bob", uid = "b1").contentKey, Route.Thread("bob", uid = "b2").contentKey)
    }

    @Test fun reselectingATabGoesBackToItsRoot() {
        val stack = mutableListOf<Route>(Route.Root(Tab.Feed), Route.Card("a"), Route.Author("bob"), Route.Card("b"))
        stack.popToRoot()
        assertEquals(listOf<Route>(Route.Root(Tab.Feed)), stack)
        stack.popToRoot()
        assertEquals(listOf<Route>(Route.Root(Tab.Feed)), stack)
    }
}
