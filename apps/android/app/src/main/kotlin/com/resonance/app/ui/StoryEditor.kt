package com.resonance.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.resonance.design.AppFonts
import com.resonance.design.OrganicIcon
import com.resonance.design.WavyDivider
import com.resonance.design.WobRectShape
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.toPath
import com.resonance.geometry.wavyVertical
import com.resonance.kit.l10n.L10n
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The story editor island (native/editor, the web's Tiptap schema) in a
 * WebView, embedded: the page is transparent and never scrolls; it reports
 * its height, its Markdown and which toolbar buttons are on, and takes
 * toolbar commands (ResonanceEditor.exec). The twin of iOS's StoryEditorBridge.
 */
@SuppressLint("SetJavaScriptEnabled")
class StoryEditorBridge(context: Context, placeholder: String) {
    data class Active(
        val bold: Boolean = false, val italic: Boolean = false, val h2: Boolean = false, val h3: Boolean = false,
        val bulletList: Boolean = false, val orderedList: Boolean = false, val blockquote: Boolean = false,
    )

    var ready by mutableStateOf(false)
        private set
    /** The page's height in dp (CSS px at device width); never under the field's 200. */
    var height by mutableIntStateOf(200)
        private set
    var active by mutableStateOf(Active())
        private set
    var focused by mutableStateOf(false)
        private set
    /** The story as the editor serializes it (the web's Markdown). */
    var onChange: (String) -> Unit = {}
    private var pendingMarkdown: String? = null

    val webView: WebView = WebView(context).apply {
        settings.javaScriptEnabled = true
        setBackgroundColor(AndroidColor.TRANSPARENT)
        // The writing screen scrolls; the island only grows.
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        addJavascriptInterface(Bridge(), "ResonanceBridge")
        // Assets are readable from file:///android_asset regardless of allowFileAccess;
        // the fonts sit at the asset root (apps/shared/fonts).
        loadUrl("file:///android_asset/editor.html?embed=1&fonts=&placeholder=" + Uri.encode(placeholder))
    }

    /** Loads a saved story (kept out of undo history by the island). */
    fun setMarkdown(markdown: String) {
        if (!ready) {
            pendingMarkdown = markdown
            return
        }
        webView.evaluateJavascript("ResonanceEditor.setMarkdown(${JsonPrimitive(markdown)})", null)
    }

    /** A toolbar command; `args` for insertCard (href, title) and insertImage (src, alt). */
    fun exec(command: String, args: Map<String, String> = emptyMap()) {
        val a = JsonObject(args.mapValues { JsonPrimitive(it.value) })
        webView.evaluateJavascript("ResonanceEditor.exec(${JsonPrimitive(command)}, $a)", null)
    }

    fun focus() = webView.evaluateJavascript("ResonanceEditor.focus()", null)

    /**
     * Lets go of the keyboard while the page is still on screen (leaving the
     * writer): unlike a Compose field, a WebView keeps the IME up after it
     * leaves the composition.
     */
    fun releaseKeyboard() {
        webView.clearFocus()
        webView.context.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(webView.windowToken, 0)
    }

    fun destroy() {
        webView.removeJavascriptInterface("ResonanceBridge")
        webView.destroy()
    }

    // Called on the WebView's JavaBridge thread; state changes go to the main thread.
    private inner class Bridge {
        @JavascriptInterface
        fun postMessage(message: String) {
            val m = runCatching { json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return
            webView.post { handle(m) }
        }
    }

    private fun handle(m: JsonObject) {
        when (m["type"]?.jsonPrimitive?.content) {
            "ready" -> {
                ready = true
                pendingMarkdown?.let(::setMarkdown)
                pendingMarkdown = null
            }
            "change" -> onChange(m["markdown"]?.jsonPrimitive?.content ?: "")
            "height" -> m["px"]?.jsonPrimitive?.doubleOrNull?.let { height = maxOf(200, it.toInt()) }
            "state" -> {
                val a = m["active"]?.jsonObject
                fun on(key: String) = a?.get(key)?.jsonPrimitive?.booleanOrNull ?: false
                active = Active(on("bold"), on("italic"), on("h2"), on("h3"), on("bulletList"), on("orderedList"), on("blockquote"))
            }
            "focus" -> focused = m["focused"]?.jsonPrimitive?.boolean ?: false
        }
    }

    private companion object {
        val json = Json { ignoreUnknownKeys = true }
    }
}

/**
 * MarkdownEditor on a phone: the field's hand-drawn frame, the text toolbar
 * on top (the web's words, not icons — Bold, Italic | H2, H3 | List,
 * Numbered, Quote | Insert card, Insert image), a wavy rule, then the story.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StoryEditorField(bridge: StoryEditorBridge, onInsertCard: () -> Unit, onInsertImage: () -> Unit, uploadingImage: Boolean = false) {
    Column(
        Modifier
            .fillMaxWidth()
            .drawWithCache {
                val o = WobRectShape(Tokens.RadiusMd.toDouble(), 17.0).createOutline(size, layoutDirection, this)
                val s = Stroke(Tokens.Ink.toPx(), join = StrokeJoin.Round)
                val r = CornerRadius(Tokens.RadiusMd.dp.toPx())
                onDrawBehind {
                    drawRoundRect(Tokens.Cream, cornerRadius = r)
                    drawOutline(o, if (bridge.focused) Tokens.Terracotta else Tokens.FieldBorder, style = s)
                }
            },
    ) {
        FlowRow(
            Modifier
                .padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 4.dp)
                .semantics { contentDescription = L10n.Write.Editor.toolbarLabel },
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            val a = bridge.active
            Tool(L10n.Write.Editor.bold, a.bold, weight = 700) { bridge.exec("bold") }
            Tool(L10n.Write.Editor.italic, a.italic, italic = true) { bridge.exec("italic") }
            ToolRule()
            Tool("H2", a.h2) { bridge.exec("h2") }
            Tool("H3", a.h3) { bridge.exec("h3") }
            ToolRule()
            Tool(L10n.Write.Editor.bulletList, a.bulletList) { bridge.exec("bulletList") }
            Tool(L10n.Write.Editor.orderedList, a.orderedList) { bridge.exec("orderedList") }
            Tool(L10n.Write.Editor.quote, a.blockquote) { bridge.exec("blockquote") }
            ToolRule()
            Tool(L10n.Write.Editor.insertCard, icon = IconName.Cards, onClick = onInsertCard)
            Tool(if (uploadingImage) L10n.Write.Editor.imageUploading else L10n.Write.Editor.insertImage, icon = IconName.Image,
                enabled = !uploadingImage, onClick = onInsertImage)
        }
        WavyDivider(color = Tokens.FieldBorder, seed = 22.0, amp = 1.2)
        AndroidView(
            factory = { bridge.webView },
            modifier = Modifier.fillMaxWidth().height(bridge.height.dp).semantics { contentDescription = L10n.Write.storyLabel },
        )
    }
}

/** ToolButton: the label on a wobbly wash when on. */
@Composable
private fun Tool(
    label: String,
    on: Boolean = false,
    weight: Int = 600,
    italic: Boolean = false,
    icon: IconName? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val color = if (on) Tokens.Terracotta else Tokens.Text
    Row(
        Modifier
            .heightIn(min = 34.dp)
            .drawBehind {
                if (on) drawOutline(
                    WobRectShape(10.0, (label.length * 7 + 3).toDouble(), mag = 1.0).createOutline(size, layoutDirection, this),
                    Tokens.TerracottaLight.copy(alpha = 0.45f),
                )
            }
            .plainClickable(role = Role.Button) { if (enabled) onClick() }
            .semantics { selected = on }
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (icon != null) OrganicIcon(icon, size = 15.dp, color = color, strokeWidth = Tokens.Ink.value)
        BasicText(label, style = AppFonts.body(14f, weight, lineHeight = 1.3f, color = color).copy(fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal))
    }
}

/** The toolbar's vertical pen rule between groups (the web's vertical Divider). */
@Composable
private fun ToolRule() {
    Box(Modifier.size(8.dp, 34.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(8.dp, 26.dp).clearAndSetSemantics { }) {
            val path = wavyVertical(size.height / density.toDouble(), seed = 7.0, amp = 1.0, steps = 3).toPath(density, size.width / 2, 0f)
            drawPath(path, Tokens.FieldBorder, style = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round))
        }
    }
}
