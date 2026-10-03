package com.resonance.kit.story

import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.HtmlBlock
import org.commonmark.node.HtmlInline
import org.commonmark.node.Image
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

/**
 * A story's Markdown as the reader lays it out — the blocks the web's
 * StoryMarkdown (react-markdown + remark-gfm) produces, with its paragraph
 * rules: a paragraph holding only a card link is an embedded card, only a
 * photo is an image block, only a link of the web is a standalone link (drawn
 * as its page's card when the card page brought a preview for it), only the
 * blank marker (U+00A0) is extra space. The twin of iOS's StoryFormat.
 */
sealed interface StoryBlock {
    data class Heading(val level: Int, val runs: List<InlineRun>) : StoryBlock
    data class Paragraph(val runs: List<InlineRun>) : StoryBlock
    data object Blank : StoryBlock
    data class Image(val url: String, val alt: String) : StoryBlock
    data class CardEmbed(val href: String, val title: String) : StoryBlock
    /**
     * A paragraph that is one link of the web and nothing else ([StoryLinks]): [key] is the address
     * its preview is found by; [runs] are the paragraph as written, drawn when there is no preview.
     */
    data class SoleLink(val key: String, val runs: List<InlineRun>) : StoryBlock
    data class Quote(val children: List<StoryBlock>) : StoryBlock
    data class ListBlock(val ordered: Boolean, val start: Int, val items: List<List<StoryBlock>>) : StoryBlock
    data object Rule : StoryBlock
    data class CodeBlock(val code: String) : StoryBlock
}

data class InlineRun(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val strikethrough: Boolean = false,
    val code: Boolean = false,
    val link: String? = null,
)

object StoryParser {
    private val parser = Parser.builder()
        .extensions(listOf(StrikethroughExtension.create(), TablesExtension.create()))
        .build()

    fun parse(markdown: String): List<StoryBlock> = children(parser.parse(markdown)).mapNotNull(::block)

    private fun children(node: Node): List<Node> = generateSequence(node.firstChild) { it.next }.toList()

    private fun block(node: Node): StoryBlock? = when (node) {
        is Paragraph -> paragraph(node)
        is Heading -> StoryBlock.Heading(node.level, inlines(node))
        is BlockQuote -> StoryBlock.Quote(children(node).mapNotNull(::block))
        is BulletList -> StoryBlock.ListBlock(false, 1, children(node).filterIsInstance<ListItem>().map { item -> children(item).mapNotNull(::block) })
        is OrderedList -> StoryBlock.ListBlock(true, node.markerStartNumber ?: 1, children(node).filterIsInstance<ListItem>().map { item -> children(item).mapNotNull(::block) })
        is ThematicBreak -> StoryBlock.Rule
        is FencedCodeBlock -> StoryBlock.CodeBlock(node.literal.removeSuffix("\n"))
        is IndentedCodeBlock -> StoryBlock.CodeBlock(node.literal.removeSuffix("\n"))
        // The site renders stories without raw HTML: it shows as text.
        is HtmlBlock -> StoryBlock.Paragraph(listOf(InlineRun(node.literal.trim('\n'))))
        is TableBlock -> StoryBlock.Paragraph(listOf(InlineRun(tableText(node))))
        else -> null
    }

    /** The web's `p` override (StoryMarkdown.tsx). */
    private fun paragraph(p: Paragraph): StoryBlock {
        val meaningful = children(p).filterNot { it is Text && it.literal.isBlank() }
        val only = meaningful.singleOrNull()
        if (only is Link && only.destination.startsWith("/card/")) return StoryBlock.CardEmbed(only.destination, plain(only))
        if (only is Image) return StoryBlock.Image(only.destination, plain(only))
        val runs = inlines(p)
        val linkKey = when (only) {
            // A linked picture is a picture, not a link of its own.
            is Link -> only.destination.takeIf { !holdsImage(only) }?.let(StoryLinks::keyOf)
            is Text -> StoryLinks.bareKey(only.literal)
            else -> null
        }
        if (linkKey != null) return StoryBlock.SoleLink(linkKey, runs)
        val text = runs.joinToString("") { it.text }
        if (text.isNotEmpty() && text.all { it == ' ' || it.isWhitespace() }) return StoryBlock.Blank
        return StoryBlock.Paragraph(runs)
    }

    private fun inlines(node: Node, bold: Boolean = false, italic: Boolean = false, strike: Boolean = false, link: String? = null): List<InlineRun> {
        val runs = ArrayList<InlineRun>()
        for (child in children(node)) {
            when (child) {
                is Text -> runs += InlineRun(child.literal, bold, italic, strike, link = link)
                is SoftLineBreak -> runs += InlineRun(" ", bold, italic, strike, link = link)
                is HardLineBreak -> runs += InlineRun("\n", bold, italic, strike, link = link)
                is Code -> runs += InlineRun(child.literal, bold, italic, strike, code = true, link = link)
                is StrongEmphasis -> runs += inlines(child, true, italic, strike, link)
                is Emphasis -> runs += inlines(child, bold, true, strike, link)
                is Strikethrough -> runs += inlines(child, bold, italic, true, link)
                // A link the reader can't open (tel:, another app's scheme…) is plain text (StoryLink).
                is Link -> runs += inlines(child, bold, italic, strike, child.destination.takeIf(StoryLink::isTappable))
                // An image inside running text keeps its alt text in the line.
                is Image -> runs += InlineRun(plain(child), bold, italic, strike, link = link)
                is HtmlInline -> runs += InlineRun(child.literal, bold, italic, strike, link = link)
                else -> runs += inlines(child, bold, italic, strike, link)
            }
        }
        return runs
    }

    private fun plain(node: Node): String = inlines(node).joinToString("") { it.text }

    private fun holdsImage(node: Node): Boolean = node is Image || children(node).any(::holdsImage)

    private fun tableText(table: TableBlock): String {
        val rows = ArrayList<String>()
        fun walk(n: Node) {
            for (c in children(n)) {
                if (c.javaClass.simpleName == "TableRow") rows += children(c).filterIsInstance<TableCell>().joinToString("  ·  ") { plain(it) }
                else walk(c)
            }
        }
        walk(table)
        return rows.joinToString("\n")
    }
}

/**
 * CSS margins (top, bottom) of each block at the reader's 17px, and the gap
 * between two blocks: the larger of the facing margins, as CSS collapses them.
 */
object ProseMetrics {
    const val EM = 17f

    fun margins(block: StoryBlock): Pair<Float, Float> = when (block) {
        is StoryBlock.Heading -> if (block.level <= 2) 1.6f * 22 to 0.6f * 22 else 1.4f * 18 to 0.5f * 18
        StoryBlock.Blank -> 0f to 0f
        is StoryBlock.Image -> 22f to 22f
        StoryBlock.Rule -> 28f to 28f
        else -> 0f to 1.1f * EM
    }

    fun gaps(blocks: List<StoryBlock>): List<Float> =
        blocks.indices.map { i -> if (i == 0) 0f else maxOf(margins(blocks[i - 1]).second, margins(blocks[i]).first) }
}
