package com.resonance.kit

import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryLink
import com.resonance.kit.story.StoryParser
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A story's links lead where their scheme says, and nowhere else: the site's own pages into the
 * app, other web pages into the in-app browser, mailto: to a mail app — any other scheme is plain
 * text a stranger's story can't hand to the system (the same cases as iOS's StoryLinkTests).
 */
class StoryLinkTest {
    private val origin = "https://resonance-world.vercel.app"
    private fun resolve(href: String) = StoryLink.resolve(href, origin)

    @Test fun relativeLinksArePagesOfTheSite() {
        assertEquals(StoryLink.Site("/card/a-walk"), resolve("/card/a-walk"))
        assertEquals(StoryLink.Site("/zh-TW/u/bob"), resolve("/zh-TW/u/bob"))
        // Resolved from the card's page, as the web resolves them.
        assertEquals(StoryLink.Site("/card/another-walk"), resolve("another-walk"))
        assertEquals(StoryLink.Site("/u/bob"), resolve("../u/bob"))
        // The query stays (a note's reply link), the fragment goes.
        assertEquals(StoryLink.Site("/messages/bob?note=n1&card=c1"), resolve("/messages/bob?note=n1&card=c1#end"))
    }

    @Test fun theSitesOwnHostIsTheSiteWhateverItsScheme() {
        assertEquals(StoryLink.Site("/card/a-walk"), resolve("https://resonance-world.vercel.app/card/a-walk"))
        assertEquals(StoryLink.Site("/u/bob"), resolve("http://Resonance-World.vercel.app/u/bob"))
        assertEquals(StoryLink.Site("/"), resolve("https://resonance-world.vercel.app"))
        assertEquals(StoryLink.Site("/en/privacy"), resolve("//resonance-world.vercel.app/en/privacy"))
    }

    @Test fun otherWebPagesOpenInTheBrowser() {
        assertEquals(StoryLink.Web("https://example.com/a?b=1&c=2"), resolve("https://example.com/a?b=1&c=2"))
        assertEquals(StoryLink.Web("HTTP://example.com/"), resolve("HTTP://example.com/"))
        assertEquals(StoryLink.Web("https://example.com/x"), resolve("//example.com/x"))
        // Look-alikes of the site's host are someone else's.
        assertEquals(StoryLink.Web("https://resonance-world.vercel.app.example.com/card/x"), resolve("https://resonance-world.vercel.app.example.com/card/x"))
        assertEquals(StoryLink.Web("https://resonance-world.vercel.app@example.com/card/x"), resolve("https://resonance-world.vercel.app@example.com/card/x"))
    }

    @Test fun mailtoWritesAMail() {
        assertEquals(StoryLink.Mail("mailto:hello@example.com"), resolve("mailto:hello@example.com"))
        assertEquals(StoryLink.Mail("MAILTO:hello@example.com?subject=Hi"), resolve("MAILTO:hello@example.com?subject=Hi"))
        assertNull(resolve("mailto:"))
    }

    @Test fun everyOtherSchemeLeadsNowhere() {
        listOf(
            "tel:+886912345678", "sms:+886912345678", "shortcuts://run-shortcut?name=x", "someapp://do/something",
            "intent://scan/#Intent;scheme=zxing;end", "javascript:alert(1)", "JavaScript:alert(1)", "java\tscript:alert(1)",
            " javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/hosts", "content://contacts/people", "market://details?id=x",
            "itms-apps://apps.apple.com/app/id1", "http:no-host", "https://", "#section", "", "  ", "card:x",
        ).forEach { href ->
            assertNull(resolve(href), href)
            assertFalse(StoryLink.isTappable(href), href)
        }
        assertTrue(StoryLink.isTappable("/card/a-walk"))
        assertTrue(StoryLink.isTappable("https://example.com"))
        assertTrue(StoryLink.isTappable("mailto:a@example.com"))
    }

    @Test fun aLinkThatLeadsNowhereReadsAsPlainText() {
        val p = StoryParser.parse("打給我 [這裡](tel:+886912345678)，或 [寫信](mailto:a@example.com)、看 [這篇](https://example.com)。")
            .single() as StoryBlock.Paragraph
        assertEquals("打給我 這裡，或 寫信、看 這篇。", p.runs.joinToString("") { it.text })
        assertNull(p.runs.single { it.text == "這裡" }.link)
        assertEquals("mailto:a@example.com", p.runs.single { it.text == "寫信" }.link)
        assertEquals("https://example.com", p.runs.single { it.text == "這篇" }.link)
        // Not even a card embed: a lone link to another app is a plain paragraph.
        val lone = StoryParser.parse("[開啟](shortcuts://run-shortcut?name=x)").single() as StoryBlock.Paragraph
        assertNull(lone.runs.single().link)
    }
}
