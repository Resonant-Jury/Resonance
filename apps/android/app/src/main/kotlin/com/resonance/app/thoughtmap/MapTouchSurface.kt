package com.resonance.app.thoughtmap

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.changedToDown
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity

/**
 * Every finger on the map, raw — the web's pointer events (with capture), so
 * the store can run the web's own state machine: the 4px rule, a second finger
 * turning any gesture into a pinch about the fingers' midpoint. Positions
 * reach the store in dp.
 *
 * The system's back gesture starts at the screen's edges, exactly where a pan
 * ends up: the middle 200dp of each edge (the most the system will exempt)
 * is handed to the map, and the Leave button and the back key still leave.
 */
@Composable
fun MapTouchSurface(store: ThoughtMapStore, modifier: Modifier = Modifier) {
    val density = LocalDensity.current.density
    Box(
        modifier
            .fillMaxSize()
            .onSizeChanged { store.setViewport(it.width / density.toDouble(), it.height / density.toDouble()) }
            .systemGestureExclusion { c ->
                val h = 200f * density
                val top = (c.size.height - h) / 2f
                Rect(0f, top, c.size.width.toFloat(), top + h)
            }
            .pointerInput(store) {
                try {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            for (c in event.changes) {
                                val x = c.position.x / density.toDouble()
                                val y = c.position.y / density.toDouble()
                                when {
                                    c.changedToDown() -> store.touchDown(c.id.value, x, y)
                                    c.changedToUp() -> store.touchUp(c.id.value, x, y)
                                    c.pressed && c.positionChanged() -> store.touchMove(c.id.value, x, y)
                                }
                                c.consume()
                            }
                        }
                    }
                } finally {
                    // Leaving mid-gesture ends it like a lift (the web's onPointerCancel = onPointerUp).
                    store.touchesCancelled()
                }
            },
    )
}
