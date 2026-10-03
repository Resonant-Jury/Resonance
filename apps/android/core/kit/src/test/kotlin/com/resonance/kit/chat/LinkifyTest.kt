package com.resonance.kit.chat

import com.resonance.kit.chat.Linkify.LinkAction
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Which words in a message are links, where they end, and what a tap on one may do — the rules the server's firstLink shares. */
class LinkifyTest {
    private fun urls(text: String) = Linkify.find(text).map { it.url }
    private fun written(text: String) = Linkify.find(text).map { text.substring(it.range.first, it.range.last + 1) }

    @Test fun findsHttpHttpsAndWwwLinksAndNormalizesThem() {
        val text = "a http://Example.com b HTTPS://example.org:443/Path?Q=1#Frag c www.example.net/x"
        assertEquals(
            listOf("http://example.com/", "https://example.org/Path?Q=1#Frag", "https://www.example.net/x"),
            urls(text),
        )
        assertEquals(listOf("http://Example.com", "HTTPS://example.org:443/Path?Q=1#Frag", "www.example.net/x"), written(text))
    }

    @Test fun aRangeCoversTheLinkAsWritten() {
        val text = "see https://example.com/a now"
        val link = Linkify.first(text)!!
        assertEquals(4..24, link.range)
        assertEquals("https://example.com/a", text.substring(link.range.first, link.range.last + 1))
    }

    @Test fun aBareDomainOrAnotherSchemeIsNoLink() {
        assertEquals(emptyList(), urls("example.com and foo.bar/baz and ftp://example.com and mailto:a@b.com"))
        assertEquals(emptyList(), urls("javascript:alert(1) data:text/html;base64,AAAA"))
    }

    @Test fun aLinkInsideAWordIsNoLink() {
        assertEquals(emptyList(), urls("xhttps://example.com and foowww.example.com and a.www.example.com and a@www.example.com"))
        assertEquals(listOf("https://example.com/"), urls("[https://example.com]"))
        assertEquals(listOf("https://www.example.com/"), urls("(www.example.com)"))
    }

    @Test fun trailingPunctuationIsNotPartOfTheLink() {
        assertEquals(listOf("https://example.com/a"), urls("Go to https://example.com/a."))
        assertEquals(listOf("https://example.com/a?b=1&c=2"), urls("really? https://example.com/a?b=1&c=2!!"))
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a, then"))
        assertEquals(listOf("https://example.com/a"), urls("'https://example.com/a'"))
        assertEquals(listOf("https://example.com/a"), urls("*https://example.com/a*"))
    }

    @Test fun anUnbalancedClosingParenthesisIsNotPartOfTheLink() {
        assertEquals(listOf("https://example.com/a"), urls("(see https://example.com/a)"))
        assertEquals(listOf("https://en.wikipedia.org/wiki/Foo_(bar)"), urls("https://en.wikipedia.org/wiki/Foo_(bar)"))
        assertEquals(listOf("https://en.wikipedia.org/wiki/Foo_(bar)"), urls("(see https://en.wikipedia.org/wiki/Foo_(bar))"))
        assertEquals(listOf("https://example.com/a"), urls("[https://example.com/a]"))
    }

    @Test fun chinesePunctuationEndsTheLink() {
        assertEquals(listOf("https://example.com/a"), urls("請看https://example.com/a，然後"))
        assertEquals(listOf("https://example.com/a"), urls("連結：https://example.com/a。"))
        assertEquals(listOf("https://example.com/a"), urls("「https://example.com/a」"))
        assertEquals(listOf("https://example.com/a"), urls("（https://example.com/a）"))
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a！好玩"))
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a、https"))
        // An ideographic space ends it like any space.
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a\u3000後面"))
    }

    @Test fun chineseTextRightAfterTheHostIsNotPartOfIt() {
        assertEquals(listOf("https://example.com/"), urls("這個網站https://example.com很棒"))
        assertEquals(listOf("https://www.example.com/"), urls("www.example.com很棒"))
    }

    @Test fun aPathMayHoldChineseAndIsPercentEncoded() {
        assertEquals(listOf("https://zh.wikipedia.org/wiki/%E5%85%B1%E6%8C%AF"), urls("https://zh.wikipedia.org/wiki/共振"))
        assertEquals(listOf("https://example.com/?q=%E4%B8%AD"), urls("https://example.com/?q=中"))
    }

    @Test fun anEmojiAnArrowOrACurlyQuoteEndsTheLink() {
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a🙂"))
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a→b"))
        assertEquals(listOf("https://example.com/a"), urls("\u201chttps://example.com/a\u201d"))
        assertEquals(listOf("https://example.com/a"), urls("\u00abhttps://example.com/a\u00bb"))
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a\u2026"))
    }

    @Test fun aLinkDoesntStartAfterAPathOrAnAddressCharacter() {
        assertEquals(emptyList(), urls("foo/https://example.com and a_https://example.com and a%https://example.com and a\\https://example.com"))
        assertEquals(emptyList(), urls("-https://example.com and .www.example.com"))
        assertEquals(listOf("https://example.com/"), urls("see:https://example.com"))
    }

    @Test fun anUnbalancedClosingBraceIsNotPartOfTheLinkAndBracesAreEscaped() {
        assertEquals(listOf("https://example.com/a"), urls("{https://example.com/a}"))
        assertEquals(listOf("https://example.com/%7Bid%7D"), urls("https://example.com/{id}"))
        assertEquals(listOf("https://example.com/a%7Cb"), urls("https://example.com/a%7Cb"))
        assertEquals(listOf("https://example.com/a|b"), urls("https://example.com/a|b"))
    }

    @Test fun invisibleAndDirectionControlsEndTheLink() {
        // A zero-width space or a right-to-left override can't hide the rest of a lookalike inside a link.
        assertEquals(listOf("https://example.com/"), urls("https://example.com\u200b.evil.com"))
        assertEquals(emptyList(), urls("https://exa\u202emple.com"))
        assertEquals(listOf("https://example.com/a"), urls("https://example.com/a\u2060b"))
    }

    @Test fun userinfoIsNeverALink() {
        assertEquals(emptyList(), urls("https://google.com@evil.com/"))
        assertEquals(emptyList(), urls("http://user:pass@example.com"))
        assertEquals(emptyList(), urls("https://user@example.com/a"))
        // What is after a rejected link is not looked at inside it.
        assertEquals(emptyList(), urls("https://user@evil.com/http://good.com"))
        assertNull(Linkify.normalize("https://google.com@evil.com/"))
    }

    @Test fun aHostWithoutADotIsNoLink() {
        assertEquals(emptyList(), urls("http://localhost/ https://intranet/x http://[::1]/ http://[2001:db8::1]:8080/"))
    }

    @Test fun addressesInDisguiseAreNoLinks() {
        // Browsers read these as 127.0.0.1.
        assertEquals(emptyList(), urls("http://2130706433/ http://0x7f.1/ http://127.1/ http://0177.0.0.1/ http://1.2.3/ http://1.2.3.4.5/"))
        assertEquals(emptyList(), urls("http://01.2.3.4/ http://256.1.1.1/ http://example.0x1/"))
    }

    @Test fun aPlainDottedQuadIsALinkButAnAddressIsSuspicious() {
        assertEquals(listOf("http://192.168.1.1/"), urls("http://192.168.1.1"))
        assertTrue(Linkify.isSuspicious("http://192.168.1.1/"))
        assertTrue(Linkify.isSuspicious("https://8.8.8.8/dns"))
        assertTrue(Linkify.isSuspicious("http://[::1]/"))
        assertTrue(Linkify.isSuspicious("http://2130706433/"))
    }

    @Test fun portsAreLinksAndOnlyTheDefaultOnesAreNotSuspicious() {
        assertEquals(
            listOf("https://example.com/", "http://example.com/", "https://example.com:8443/x"),
            urls("https://example.com:443 http://example.com:80 https://example.com:8443/x"),
        )
        assertFalse(Linkify.isSuspicious("https://example.com:443/x"))
        assertFalse(Linkify.isSuspicious("http://example.com:80/x"))
        assertTrue(Linkify.isSuspicious("https://example.com:8443/x"))
        assertTrue(Linkify.isSuspicious("https://example.com:80/"))
        assertEquals(emptyList(), urls("https://example.com:99999/ https://example.com:0/ https://example.com:abc/"))
        assertEquals("example.com:8443", Linkify.displayHost("https://example.com:8443/x"))
        assertEquals("example.com", Linkify.displayHost("https://example.com:443/x"))
    }

    @Test fun aUnicodeHostBecomesPunycodeAndIsSuspicious() {
        val link = Linkify.first("https://例子.測試/a")!!
        assertTrue(link.url.startsWith("https://xn--"), link.url)
        assertTrue(link.url.endsWith("/a"))
        assertTrue(Linkify.isSuspicious(link.url))
        val shown = Linkify.displayHost(link.url)!!
        assertTrue(shown.all { it.code < 128 } && shown.contains("xn--"), shown)
        // A lookalike written in punycode is the same.
        assertTrue(Linkify.isSuspicious("https://xn--pple-43d.com/"))
        assertEquals(listOf("https://xn--pple-43d.com/"), urls("https://xn--pple-43d.com"))
    }

    @Test fun aLongLinkIsRefused() {
        val long = "https://example.com/" + "a".repeat(Linkify.MAX_LENGTH)
        assertEquals(emptyList(), urls(long))
        val fits = "https://example.com/" + "a".repeat(Linkify.MAX_LENGTH - 20)
        assertEquals(listOf(fits), urls(fits))
    }

    @Test fun anEmptyPathBecomesASlashAndAQueryKeepsIt() {
        assertEquals(listOf("https://example.com/"), urls("https://example.com"))
        assertEquals(listOf("https://example.com/?a=1"), urls("https://example.com?a=1"))
        assertEquals(listOf("https://example.com/#top"), urls("https://example.com#top"))
    }

    @Test fun aBackslashEndsTheLink() {
        // Browsers read a backslash as a slash: `https://evil.com\@good.com` leads to evil.com.
        assertEquals(listOf("https://evil.com/"), urls("https://evil.com\\@good.com"))
        assertTrue(Linkify.isSuspicious("https://evil.com\\@good.com"))
    }

    @Test fun everyLinkOfAMessageIsFoundInOrder() {
        val text = "a https://one.example.com/x, b www.two.example.com. c http://three.example.org/(y)"
        assertEquals(
            listOf("https://one.example.com/x", "https://www.two.example.com/", "http://three.example.org/(y)"),
            urls(text),
        )
        assertEquals("https://one.example.com/x", Linkify.first(text)!!.url)
        assertNull(Linkify.first("nothing to see"))
    }

    // What a tap does

    @Test fun anOrdinaryLinkOpens() {
        assertEquals(LinkAction.Open("https://example.com/a"), Linkify.action("https://Example.com/a"))
        assertEquals(LinkAction.Open("https://www.example.com/"), Linkify.action("www.example.com"))
    }

    @Test fun aSuspiciousLinkAsksFirstWithItsAsciiHost() {
        assertEquals(LinkAction.Confirm("http://10.0.0.1/", "10.0.0.1"), Linkify.action("http://10.0.0.1"))
        assertEquals(LinkAction.Confirm("https://example.com:8443/", "example.com:8443"), Linkify.action("https://example.com:8443"))
        val unicode = Linkify.action("https://例子.測試/") as LinkAction.Confirm
        assertTrue(unicode.host.startsWith("xn--"), unicode.host)
    }

    @Test fun anythingElseIsNotOpened() {
        for (url in listOf(
            "javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "intent://scan/#Intent;scheme=zxing;end", "content://media/x",
            "ftp://example.com/", "mailto:a@example.com", "tel:+123", "market://details?id=x", "https:evil.com", "//example.com",
            "https://user@example.com", "https://google.com@evil.com", "https://localhost/", "https://exa mple.com", "https://example.com/\u0000",
            "", "   ",
        )) {
            assertEquals(LinkAction.Unsupported, Linkify.action(url), url)
        }
    }

    @Test fun aSchemeInTheWrongCaseIsStillHttp() {
        assertEquals(LinkAction.Open("https://example.com/"), Linkify.action("HTTPS://EXAMPLE.COM"))
    }

    @Test fun anUnparseableUrlIsSuspicious() {
        assertTrue(Linkify.isSuspicious("not a url"))
        assertTrue(Linkify.isSuspicious("https://"))
        assertTrue(Linkify.isSuspicious("https://example.com:70000/"))
        assertTrue(Linkify.isSuspicious("https://user@example.com/"))
        assertFalse(Linkify.isSuspicious("https://example.com/a@b"))
    }
}
