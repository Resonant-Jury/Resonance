package com.resonance.spikes

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.activity.compose.BackHandler
import com.resonance.spikes.design.AppFonts
import com.resonance.spikes.design.Grain
import com.resonance.spikes.generated.Tokens
import com.resonance.spikes.s1.CurveLab
import com.resonance.spikes.s2.FeedBench
import com.resonance.spikes.s2.GrainParity
import com.resonance.spikes.s3.ChromeMode
import com.resonance.spikes.s3.NavSpike
import com.resonance.spikes.s4.EditorSpike
import com.resonance.spikes.s5.TypeLab
import com.resonance.spikes.s6.ApiArgs
import com.resonance.spikes.s6.ApiSpike

/**
 * Android spike app for the native-feasibility experiments (S1–S6).
 * Intent extras jump straight to one experiment, e.g.
 *   adb shell am start -n com.resonance.spikes/.MainActivity --es spike feed --es bench all
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        Grain.init(this)
        AppFonts.init(this)
        val initial = intent.getStringExtra("spike")
        val autorun = intent.getStringExtra("bench") == "all" || intent.hasExtra("run")
        val api = ApiArgs(
            api = intent.getStringExtra("api") ?: "http://10.0.2.2:3100/api/v1",
            auth = intent.getStringExtra("auth") ?: "http://10.0.2.2:9099",
            email = intent.getStringExtra("email"),
            password = intent.getStringExtra("password"),
        )
        setContent { SpikeHome(initial, autorun, api) }
    }
}

@Composable
private fun SpikeHome(initial: String?, autorun: Boolean, api: ApiArgs) {
    var current by rememberSaveable { mutableStateOf(initial) }
    if (current != null && initial == null) BackHandler { current = null }
    when (current) {
        "curves" -> CurveLab()
        "feed" -> FeedBench(autorun)
        "grain" -> GrainParity(autorun)
        "nav-system" -> NavSpike(ChromeMode.System)
        "nav-organic" -> NavSpike(ChromeMode.Organic)
        "type" -> TypeLab(autorun)
        "api" -> ApiSpike(api, autorun)
        "editor" -> EditorSpike(autorun)
        else -> Column(
            Modifier.fillMaxSize().background(Tokens.Cream).safeDrawingPadding().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BasicText("共振 Spikes", style = AppFonts.heading(30f))
            listOf(
                "curves" to "S1 · Curve Lab (web vs Kotlin paths)",
                "feed" to "S2 · Feed scroll benchmark",
                "grain" to "S2 · GPU grain parity",
                "nav-system" to "S3 · Navigation — Material chrome",
                "nav-organic" to "S3 · Navigation — organic chrome",
                "editor" to "S4 · Editor",
                "type" to "S5 · Typography",
                "api" to "S6 · Backend contract",
            ).forEach { (key, label) ->
                OutlinedButton({ current = key }, Modifier.fillMaxWidth()) { Text(label) }
            }
        }
    }
}
