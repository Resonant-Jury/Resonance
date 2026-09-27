package com.resonance.spikes.s2

import android.app.Activity
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.PixelCopy
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.resonance.spikes.design.GrainShader
import com.resonance.spikes.design.GrainSpec
import com.resonance.spikes.generated.Tokens
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume

/**
 * S2 — is the AGSL grain the web's noise, pixel for pixel? Draws the parity
 * probes (opaque luminance / opaque noise alpha) for the card grain, copies
 * them from the window with PixelCopy (RuntimeShader only runs on the GPU)
 * and writes PNGs to the app's files dir. Compare with
 * `npx tsx scripts/native/grain-parity.ts <dir> --scale <density>`.
 */
@Composable
fun GrainParity(autorun: Boolean) {
    val activity = LocalContext.current as Activity
    val bounds = remember { mutableStateMapOf<Int, android.graphics.Rect>() }
    var status by remember { mutableStateOf("") }

    LaunchedEffect(autorun) {
        if (!autorun || Build.VERSION.SDK_INT < 33) return@LaunchedEffect
        delay(1500)
        for (mode in listOf(2, 3)) {
            val r = bounds[mode] ?: continue
            val bmp = Bitmap.createBitmap(r.width(), r.height(), Bitmap.Config.ARGB_8888)
            val ok = suspendCancellableCoroutine { c ->
                PixelCopy.request(activity.window, r, bmp, { c.resume(it == PixelCopy.SUCCESS) }, Handler(Looper.getMainLooper()))
            }
            if (ok) File(activity.filesDir, "grain-probe-$mode.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
        status = activity.filesDir.path
        Log.i("S2", "GRAINPARITY ${activity.filesDir.path} density=${activity.resources.displayMetrics.density}")
    }

    Column(Modifier.fillMaxSize().background(Tokens.Cream).safeDrawingPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (Build.VERSION.SDK_INT >= 33) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (mode in listOf(2, 3)) {
                    Box(
                        Modifier
                            .size(128.dp)
                            .onGloballyPositioned { c ->
                                val b = c.boundsInWindow()
                                bounds[mode] = android.graphics.Rect(b.left.toInt(), b.top.toInt(), b.right.toInt(), b.bottom.toInt())
                            }
                            .drawWithCache {
                                val brush = ShaderBrush(GrainShader.create(GrainSpec.named("grain-card"), size, density, 1f, mode.toFloat()))
                                onDrawBehind { drawRect(brush) }
                            },
                    )
                }
            }
        }
        Text(status)
    }
}
