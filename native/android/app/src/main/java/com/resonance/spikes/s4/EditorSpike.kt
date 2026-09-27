package com.resonance.spikes.s4

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.graphics.Typeface
import android.os.SystemClock
import android.text.Editable
import android.text.Spanned
import android.text.TextWatcher
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.EditText
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.resonance.spikes.design.AppFonts
import com.resonance.spikes.generated.Tokens
import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive

/**
 * S4 on Android — the story editor two ways (same as iOS):
 *  • Island: the web's Tiptap schema in a WebView (native/editor/dist/editor.html).
 *  • Native: a Markdown *source* editor (EditText) that styles the syntax as you type.
 *
 *   adb shell am start -n com.resonance.spikes/.MainActivity --es spike editor --es run 1
 */
@Serializable
data class CorpusCase(val id: String, val markdown: String, val canonical: String)

@Serializable
private data class Corpus(val cases: List<CorpusCase>)

private val json = Json { ignoreUnknownKeys = true }

@Composable
fun EditorSpike(autorun: Boolean) {
    var mode by remember { mutableStateOf("island") }
    Column(Modifier.fillMaxSize().background(Tokens.Cream).safeDrawingPadding()) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(12.dp)) {
            listOf("island" to "Island (WebView)", "native" to "Native source").forEachIndexed { i, (key, label) ->
                SegmentedButton(mode == key, { mode = key }, SegmentedButtonDefaults.itemShape(i, 2)) { Text(label) }
            }
        }
        if (mode == "island") IslandEditor(autorun, Modifier.weight(1f)) else NativeMarkdownEditor(Modifier.weight(1f))
    }
}

private fun corpus(context: android.content.Context): List<CorpusCase> =
    json.decodeFromString(Corpus.serializer(), context.assets.open("markdown-corpus.json").bufferedReader().readText()).cases

private val sampleIds = listOf("headings", "inline-marks", "link", "card-embed", "blockquote", "lists")

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun IslandEditor(autorun: Boolean, modifier: Modifier) {
    val context = LocalContext.current
    var status by remember { mutableStateOf("loading…") }
    var markdown by remember { mutableStateOf("") }
    val created = remember { SystemClock.elapsedRealtime() }
    val ready = remember { CompletableDeferred<Unit>() }

    val web = remember {
        WebView(context).apply {
            settings.javaScriptEnabled = true
            setBackgroundColor(Tokens.Cream.toArgb())
            addJavascriptInterface(object {
                @JavascriptInterface
                fun postMessage(message: String) {
                    val m = json.parseToJsonElement(message) as JsonObject
                    when (m["type"]?.jsonPrimitive?.content) {
                        "ready" -> post {
                            status = "ready in ${SystemClock.elapsedRealtime() - created} ms (page script ${m["ms"]?.jsonPrimitive?.content?.toDouble()?.toInt()} ms)"
                            Log.i("S4", "S4RESULT island-ready $status")
                            ready.complete(Unit)
                        }
                        "change" -> post { markdown = m["markdown"]?.jsonPrimitive?.content ?: "" }
                    }
                }
            }, "ResonanceBridge")
            // Assets are readable from file:///android_asset regardless of allowFileAccess.
            loadUrl("file:///android_asset/editor.html?fonts=")
        }
    }

    suspend fun call(fn: String, arg: String): String {
        val result = CompletableDeferred<String>()
        web.evaluateJavascript("ResonanceEditor.$fn(${JsonPrimitive(arg)})") { result.complete(it) }
        return json.parseToJsonElement(result.await()).jsonPrimitive.content
    }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        ready.await()
        val cases = corpus(context)
        val failed = mutableListOf<String>()
        val start = SystemClock.elapsedRealtime()
        for (c in cases) {
            val once = call("roundtrip", c.markdown)
            val twice = call("roundtrip", once)
            if (once != c.canonical || twice != once) failed += c.id
        }
        status = "corpus ${cases.size - failed.size}/${cases.size} identical to web" + if (failed.isEmpty()) "" else " — failed: $failed"
        Log.i("S4", "S4RESULT island-corpus passed=${cases.size - failed.size} total=${cases.size} ms=${SystemClock.elapsedRealtime() - start} failed=${failed.joinToString(",")}")
        markdown = call("setMarkdown", cases.filter { it.id in sampleIds }.joinToString("\n\n") { it.canonical })
        Log.i("S4", "S4RESULT island-done")
    }

    Column(modifier) {
        AndroidView({ web }, Modifier.weight(1f).fillMaxWidth())
        Column(Modifier.fillMaxWidth().background(Tokens.CreamDark).padding(10.dp)) {
            Text(status, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            Text("Markdown: ${markdown.take(80)}…", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = Tokens.TextMuted, maxLines = 2)
        }
    }
}

/**
 * Styles Markdown syntax in place, leaving every character as typed.
 *
 * IME: Zhuyin/Cangjie keep the word being composed under the keyboard's
 * *composing span*. Clearing all spans to restyle (the obvious
 * `text.clearSpans()`) removes it and the keyboard loses the composition, so
 * only this styler's own spans are removed and re-added.
 */
private class MarkdownStyler(private val muted: Int, private val accent: Int) : TextWatcher {
    private val rules: List<Pair<Regex, (Editable, MatchResult) -> Unit>> = listOf(
        Regex("(?m)^#{1,6} .*$") to { e, m -> span(e, m.range, StyleSpan(Typeface.BOLD), RelativeSizeSpan(1.3f)) },
        Regex("(?m)^> .*$") to { e, m -> span(e, m.range, ForegroundColorSpan(muted)) },
        Regex("\\*\\*[^*\\n]+\\*\\*") to { e, m -> span(e, m.range, StyleSpan(Typeface.BOLD)) },
        Regex("(?<![*\\\\])\\*[^*\\n]+\\*(?!\\*)") to { e, m -> span(e, m.range, StyleSpan(Typeface.ITALIC)) },
        Regex("\\[[^\\]\\n]+\\]\\([^)\\n]+\\)") to { e, m -> span(e, m.range, ForegroundColorSpan(accent)) },
        Regex("(?m)^\\s*([-*+]|\\d+\\.) ") to { e, m -> span(e, m.range, ForegroundColorSpan(accent)) },
        Regex("[#*>`~_\\[\\]()]") to { e, m -> span(e, m.range, ForegroundColorSpan(AndroidColor.argb(150, AndroidColor.red(muted), AndroidColor.green(muted), AndroidColor.blue(muted)))) },
    )
    private val ours = HashSet<Any>()

    private fun span(e: Editable, range: IntRange, vararg spans: Any) {
        for (s in spans) {
            e.setSpan(s, range.first, range.last + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            ours += s
        }
    }

    fun restyle(e: Editable) {
        ours.forEach { e.removeSpan(it) } // never clearSpans(): that drops the IME's composing span
        ours.clear()
        val text = e.toString()
        for ((regex, apply) in rules) regex.findAll(text).forEach { apply(e, it) }
    }

    override fun afterTextChanged(s: Editable) = restyle(s)
    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
}

@Composable
private fun NativeMarkdownEditor(modifier: Modifier) {
    val context = LocalContext.current
    var count by remember { mutableStateOf(0) }
    Column(modifier) {
        AndroidView(
            factory = {
                EditText(it).apply {
                    background = null
                    typeface = AppFonts.typeface(AppFonts.Family.Body, 400)
                    textSize = 17f
                    setLineSpacing(0f, 1.5f)
                    setTextColor(Tokens.Text.toArgb())
                    setPadding(48, 32, 48, 240)
                    gravity = android.view.Gravity.TOP
                    val styler = MarkdownStyler(Tokens.TextMuted.toArgb(), Tokens.Terracotta.toArgb())
                    setText(corpus(context).filter { c -> c.id in sampleIds && c.id != "card-embed" }.joinToString("\n\n") { c -> c.canonical })
                    styler.restyle(text)
                    addTextChangedListener(styler)
                    addTextChangedListener(object : TextWatcher {
                        override fun afterTextChanged(s: Editable) { count = s.length }
                        override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                        override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                    })
                    count = text.length
                }
            },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        )
        Text("$count characters · stored exactly as typed", Modifier.fillMaxWidth().background(Tokens.CreamDark).padding(10.dp), fontFamily = FontFamily.Monospace, fontSize = 12.sp)
    }
}
