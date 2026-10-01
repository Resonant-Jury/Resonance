package com.resonance.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Matrix
import com.resonance.design.OrganicVerticalRule
import com.resonance.design.SketchLoader
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.pointsToBezier
import com.resonance.geometry.wavyPoints
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
 *
 * The WebView only ever holds the bundled island — it is what the bridge is
 * exposed to: any other page a link or a script would load is refused, and an
 * http(s) link the writer taps opens in the browser instead. It reads no
 * files but the app's assets, and no content providers.
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
        // Assets are readable from file:///android_asset regardless of allowFileAccess (the fonts
        // sit at the asset root, apps/shared/fonts): nothing else on the device is.
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        @Suppress("DEPRECATION")
        settings.allowFileAccessFromFileURLs = false
        @Suppress("DEPRECATION")
        settings.allowUniversalAccessFromFileURLs = false
        settings.setGeolocationEnabled(false)
        webViewClient = EditorClient()
        setBackgroundColor(AndroidColor.TRANSPARENT)
        // The writing screen scrolls; the island only grows.
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        addJavascriptInterface(Bridge(), "ResonanceBridge")
        loadUrl("file://$EDITOR_PATH?embed=1&fonts=&placeholder=" + Uri.encode(placeholder))
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

    /** Keeps the WebView on the island: its own page loads, an http(s) link the writer taps opens in the browser, nothing else. */
    private class EditorClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (isEditor(url)) return false
            if (request.isForMainFrame && request.hasGesture() && url.scheme?.lowercase() in setOf("http", "https")) {
                InAppBrowser.open(view.context, url.toString())
            }
            return true
        }
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

    internal companion object {
        val json = Json { ignoreUnknownKeys = true }
        /** The island, as the app bundles it (npm run native:editor → native/editor/dist → the assets). */
        const val EDITOR_PATH = "/android_asset/editor.html"

        /** The bundled island itself (whatever its query), the one page the editor's WebView may hold. */
        fun isEditor(url: Uri): Boolean = url.scheme == "file" && url.authority.isNullOrEmpty() && url.path == EDITOR_PATH
    }
}

/**
 * MarkdownEditor on a phone: the field's hand-drawn frame (seed 17), the text
 * toolbar on top (the web's words, not icons — Bold, Italic | H2, H3 | List,
 * Numbered, Quote | Insert card, Insert image) over its wavy bottom line,
 * then the story.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StoryEditorField(bridge: StoryEditorBridge, onInsertCard: () -> Unit, onInsertImage: () -> Unit, uploadingImage: Boolean = false) {
    Column(
        Modifier
            .fillMaxWidth()
            .drawWithCache {
                val o = WobRectShape(Tokens.RadiusMd.toDouble(), EDITOR_SEED).createOutline(size, layoutDirection, this)
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
                .fillMaxWidth()
                .toolbarWave(EDITOR_SEED + 5)
                // toolbarWrap: 10 above and beside, 12 below for the wave; the toolbar keeps 4 of its own.
                .padding(start = 10.dp, end = 10.dp, top = 10.dp, bottom = 16.dp)
                .semantics { contentDescription = L10n.Write.Editor.toolbarLabel },
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            val a = bridge.active
            Tool(L10n.Write.Editor.bold, a.bold, seed = 21.0) { bridge.exec("bold") }
            Tool(L10n.Write.Editor.italic, a.italic, seed = 28.0) { bridge.exec("italic") }
            ToolRule(3.0)
            Tool("H2", a.h2, seed = 35.0) { bridge.exec("h2") }
            Tool("H3", a.h3, seed = 42.0) { bridge.exec("h3") }
            ToolRule(9.0)
            Tool(L10n.Write.Editor.bulletList, a.bulletList, seed = 49.0) { bridge.exec("bulletList") }
            Tool(L10n.Write.Editor.orderedList, a.orderedList, seed = 56.0) { bridge.exec("orderedList") }
            Tool(L10n.Write.Editor.quote, a.blockquote, seed = 63.0) { bridge.exec("blockquote") }
            ToolRule(15.0)
            Tool(L10n.Write.Editor.insertCard, icon = IconName.Cards, seed = 70.0, onClick = onInsertCard)
            Tool(L10n.Write.Editor.insertImage, icon = IconName.Image, busy = uploadingImage, seed = 77.0, enabled = !uploadingImage, onClick = onInsertImage)
        }
        AndroidView(
            factory = { bridge.webView },
            modifier = Modifier.fillMaxWidth().height(bridge.height.dp).semantics { contentDescription = L10n.Write.storyLabel },
        )
    }
}

/** MarkdownEditor's `seed`; the buttons, rules and wave offset from it. */
private const val EDITOR_SEED = 17.0

/** ToolButton: 13sp semibold on nothing, or on its wobbly terracotta wash when on; a disabled tool fades (0.6). */
@Composable
private fun Tool(
    label: String,
    on: Boolean = false,
    icon: IconName? = null,
    busy: Boolean = false,
    seed: Double,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val color = if (on) Tokens.Terracotta else Tokens.Text
    Row(
        Modifier
            .alpha(if (enabled) 1f else 0.6f)
            .drawWithCache {
                val h = (size.height / density).toDouble()
                // A soft two-turn pill (R 0.4h, mag 1.4, bow 1.5).
                val o = WobRectShape(h * 0.4, EDITOR_SEED + seed, mag = 1.4, options = WobRectOptions(
                    curve = 1.5, cornerJitter = 2.6, cornerOffset = h * 0.05, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(1.0),
                )).createOutline(size, layoutDirection, this)
                onDrawBehind { if (on) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.7f)) }
            }
            .plainClickable(role = Role.Button) { if (enabled) onClick() }
            .semantics { selected = on }
            .padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (busy) SketchLoader(15.dp) else if (icon != null) OrganicIcon(icon, size = 15.dp, color = color)
        BasicText(label, style = AppFonts.body(13f, 600, lineHeight = 1.3f, color = color))
    }
}

/** The toolbar's vertical Divider (amplitude 1.2, 4 either side), as tall as a button. */
@Composable
private fun ToolRule(offset: Double) {
    OrganicVerticalRule(Modifier.height(27.dp).padding(horizontal = 4.dp), seed = EDITOR_SEED + offset, amp = 1.2)
}

/**
 * The toolbar's pen line: AppHeader's construction — ten turns across an
 * 800×54 box stretched over the toolbar, low in it, edge to edge.
 */
private fun Modifier.toolbarWave(seed: Double): Modifier = drawBehind {
    val line = pointsToBezier(wavyPoints(800.0, 42 + 12 * 0.35, 2.0, seed, 10)).toPath(1f)
    line.transform(Matrix().apply { scale(size.width / 800f, size.height / 54f) })
    drawPath(line, Tokens.FieldBorderHover.copy(alpha = 0.45f), style = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round))
}
