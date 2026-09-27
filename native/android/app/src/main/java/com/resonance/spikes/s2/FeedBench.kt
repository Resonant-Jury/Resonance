package com.resonance.spikes.s2

import android.app.Activity
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.metrics.performance.FrameDataApi31
import androidx.metrics.performance.JankStats
import com.resonance.spikes.design.GrainMode
import com.resonance.spikes.generated.Tokens
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * S2 on Android — the same feed and variants as the iOS FeedBench: 60 cards
 * auto-scrolled at 1,400 dp/s for 8 s per variant. Pacing comes from the
 * Choreographer frame clock (hitch = a frame interval over 1.5 × the vsync
 * budget, reported as ms of hitch per s like Apple's hitch ratio); cost comes
 * from JankStats / FrameMetrics (CPU time per frame, independent of vsync).
 *
 *   adb shell am start -n com.resonance.spikes/.MainActivity --es spike feed --es bench all
 *   adb logcat -s S2
 */
@Serializable
data class BenchResult(
    val label: String,
    val frames: Int,
    val avgIntervalMs: Double,
    val hitches: Int,
    val hitchRatioMsPerS: Double,
    val jankStatsJanky: Int,
    val cpuAvgMs: Double,
    val cpuP95Ms: Double,
)

@Composable
fun FeedBench(autorun: Boolean) {
    var grain by remember { mutableStateOf(GrainMode.Tile) }
    var clip by remember { mutableStateOf(true) }
    var status by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val activity = LocalContext.current as Activity
    val density = LocalDensity.current.density

    LaunchedEffect(autorun) {
        if (!autorun) return@LaunchedEffect
        delay(2000)
        run(listState, activity, density, "warm-up", record = false)
        val results = mutableListOf<BenchResult>()
        repeat(2) {
            for ((g, c) in listOf(GrainMode.None to true, GrainMode.Tile to true, GrainMode.Shader to true, GrainMode.Tile to false)) {
                grain = g
                clip = c
                val r = run(listState, activity, density, "grain=${g.name.lowercase()} clip=$c")
                results += r
                status = "${r.label}  hitch ${"%.1f".format(r.hitchRatioMsPerS)} ms/s  cpu ${"%.1f".format(r.cpuAvgMs)} ms"
            }
        }
        Log.i("S2", "S2DONE")
    }

    Column(Modifier.fillMaxSize().background(Tokens.Cream).safeDrawingPadding()) {
        Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            GrainMode.entries.forEach { g -> FilterChip(grain == g, { grain = g }, { Text(g.name) }) }
            FilterChip(clip, { clip = !clip }, { Text("clip") })
        }
        Text(status, Modifier.padding(horizontal = 12.dp))
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            items(SampleStory.all, key = { it.id }) { StoryCardView(it, grain, clip) }
        }
    }
}

private suspend fun run(list: LazyListState, activity: Activity, density: Float, label: String, record: Boolean = true): BenchResult {
    list.scrollToItem(0)
    delay(1000)
    val cpu = mutableListOf<Long>()
    var janky = 0
    val jank = JankStats.createAndTrack(activity.window) { fd ->
        if (fd is FrameDataApi31) cpu += fd.frameDurationCpuNanos else cpu += fd.frameDurationUiNanos
        if (fd.isJank) janky++
    }
    val intervals = mutableListOf<Long>()
    val speed = 1400f * density // px per second
    list.scroll {
        val start = withFrameNanos { it }
        var last = start
        while (last - start < 8_000_000_000L) {
            val now = withFrameNanos { it }
            intervals += now - last
            scrollBy(speed * (now - last) / 1e9f)
            last = now
        }
    }
    jank.isTrackingEnabled = false
    val budget = 1e9 / activity.display.refreshRate
    val hitchNanos = intervals.filter { it > budget * 1.5 }.sumOf { it - budget }
    val seconds = intervals.sum() / 1e9
    val cpuSorted = cpu.sorted()
    val result = BenchResult(
        label = label,
        frames = intervals.size,
        avgIntervalMs = intervals.average() / 1e6,
        hitches = intervals.count { it > budget * 1.5 },
        hitchRatioMsPerS = hitchNanos / 1e6 / seconds,
        jankStatsJanky = janky,
        cpuAvgMs = cpu.average() / 1e6,
        cpuP95Ms = (cpuSorted.getOrNull((cpuSorted.size * 0.95).toInt()) ?: 0L) / 1e6,
    )
    if (record) Log.i("S2", "S2RESULT " + Json.encodeToString(BenchResult.serializer(), result))
    return result
}
