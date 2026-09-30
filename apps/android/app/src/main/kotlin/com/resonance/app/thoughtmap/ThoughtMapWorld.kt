package com.resonance.app.thoughtmap

import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.resonance.design.AppFonts
import com.resonance.design.OrganicIcon
import com.resonance.design.TagPill
import com.resonance.design.TagSize
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.Pt
import com.resonance.geometry.arrowHeadPath
import com.resonance.geometry.inflateRect
import com.resonance.geometry.mapNodeH
import com.resonance.geometry.mapNodeW
import com.resonance.geometry.organicEdgePath
import com.resonance.geometry.rectContains
import com.resonance.geometry.seedFromString
import com.resonance.design.toPath
import kotlin.math.ceil
import kotlin.math.max

// The map's layers, bottom to top in the web's paint order: the dot grid;
// regions and arrows; the regions' titles; the cards (filed ones inside their
// region's clip, then the free ones); the arrow being drawn and the regions'
// rims re-inked over the cards; the arrows' words. None takes touches — the
// touch surface above them hit-tests in world coordinates.
//
// World layers are placed by the camera with one graphicsLayer each (scale
// about the world origin, then translate), read while the layer is drawn: a
// pan or pinch moves the layers without recomposing or re-recording a card,
// and text and strokes inside stay vector, so they are crisp at any zoom.

/** Places world content under the camera. World units are dp; the layer's children lay out in dp as usual. */
@Composable
fun MapCameraLayer(store: ThoughtMapStore, content: @Composable BoxScope.() -> Unit) {
    FixedFontScale {
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer {
                    val cam = store.camera
                    transformOrigin = TransformOrigin(0f, 0f)
                    scaleX = cam.s.toFloat()
                    scaleY = cam.s.toFloat()
                    translationX = (cam.x * density).toFloat()
                    translationY = (cam.y * density).toFloat()
                },
        ) {
            // World content is bigger than the screen and sits where its own coordinates say: give it unbounded room,
            // so nothing is squeezed into (or re-centred by) the screen's constraints.
            Box(Modifier.wrapContentSize(Alignment.TopStart, unbounded = true), content = content)
        }
    }
}

/**
 * The map is a fixed-size world (a card is always 232×178 CSS px, its words set at 15/11.5px in 21/18.4px line
 * boxes, like the web's), so its text ignores the system's font scale: at 1.5× the tags row would outgrow its
 * 18px box, a region's title its 44-px-short bar and an arrow's pill its hit target. (The drawn lines already do.)
 */
@Composable
fun FixedFontScale(content: @Composable () -> Unit) {
    val d = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(d.density, fontScale = 1f), content = content)
}

// The dot grid

/**
 * The dot grid (radial-gradient(oklch(82% 0.025 75) 1.2px, transparent 1.5px) on a
 * (26·s)px tile positioned at the camera, over card-bg paper): a dot at the centre
 * of every tile, its radius fixed at every zoom, only the spacing scaled. An AGSL
 * shader on API 33+, else a batch of points.
 */
@Composable
fun MapGridLayer(store: ThoughtMapStore) {
    val shader = remember { if (MapDots.useShader && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) MapDots.shader() else null }
    val fallbackPaint = remember {
        Paint().apply {
            isAntiAlias = true
            strokeCap = StrokeCap.Round
            color = MapInk.dot
        }
    }
    Canvas(Modifier.fillMaxSize()) {
        drawRect(Tokens.CardBg)
        val cam = store.camera
        val d = density
        val spacing = (26 * cam.s * d).toFloat()
        if (shader != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            MapDots.draw(this, shader, spacing, (cam.x * d).toFloat(), (cam.y * d).toFloat())
        } else {
            // Dots at cam + spacing·(i + ½), radius ~1.35 (the gradient's soft edge from 1.2 to 1.5).
            val w = size.width
            val h = size.height
            val x0 = (cam.x * d).toFloat()
            val y0 = (cam.y * d).toFloat()
            val i0 = kotlin.math.floor(-x0 / spacing - 0.5f).toInt() - 1
            val i1 = ceil((w - x0) / spacing).toInt() + 1
            val j0 = kotlin.math.floor(-y0 / spacing - 0.5f).toInt() - 1
            val j1 = ceil((h - y0) / spacing).toInt() + 1
            val points = FloatArray(max(0, (i1 - i0 + 1) * (j1 - j0 + 1) * 2))
            var n = 0
            for (j in j0..j1) for (i in i0..i1) {
                points[n++] = x0 + spacing * (i + 0.5f)
                points[n++] = y0 + spacing * (j + 0.5f)
            }
            fallbackPaint.strokeWidth = 2.7f * d
            drawContext.canvas.drawRawPoints(PointMode.Points, points.copyOf(n), fallbackPaint)
        }
    }
}

/** The grid's AGSL: distance to the nearest tile centre, a dot with a fixed radius and a soft edge. */
object MapDots {
    /** Off, the point-batch fallback draws the grid (what an API 29–32 phone gets). */
    var useShader = true

    private const val Source = """
        uniform float spacing;
        uniform float2 origin;
        uniform float r0;
        uniform float r1;
        layout(color) uniform half4 dotColor;
        half4 main(float2 coord) {
            float2 local = coord - origin;
            float2 cell = local - spacing * floor(local / spacing);
            float d = distance(cell, float2(spacing * 0.5));
            half a = half(1.0 - smoothstep(r0, r1, d));
            return half4(dotColor.rgb * a, a);
        }
    """

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun shader(): RuntimeShader = RuntimeShader(Source).apply { setColorUniform("dotColor", MapInk.dot.toArgb()) }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun draw(scope: DrawScope, shader: RuntimeShader, spacing: Float, ox: Float, oy: Float) {
        shader.setFloatUniform("spacing", spacing)
        shader.setFloatUniform("origin", ox, oy)
        shader.setFloatUniform("r0", 1.2f * scope.density)
        shader.setFloatUniform("r1", 1.5f * scope.density)
        scope.drawRect(ShaderBrush(shader))
    }
}

// Regions and arrows

/** Regions (fill and rim) and the arrows between cards, with their heads. */
@Composable
fun MapUnderLayer(store: ThoughtMapStore) {
    MapCameraLayer(store) {
        Canvas(Modifier.fillMaxSize()) {
            val d = density
            val selection = store.selection
            val hot = store.hotGroupId()
            scale(d, d, pivot = Offset.Zero) {
                for (gid in store.groupOrder) {
                    val g = store.groups[gid] ?: continue
                    val isHot = hot == g.id
                    val strong = isHot || (selection as? ThoughtMapStore.Selection.Group)?.id == g.id
                    val path = store.regionPath(g)
                    translate(g.x.toFloat(), g.y.toFloat()) {
                        drawPath(path, MapInk.regionFill(g.hue, isHot))
                        drawPath(path, MapInk.regionStroke(g.hue, strong), style = Stroke(if (strong) INK_STRONG else INK_LIGHT, join = StrokeJoin.Round))
                    }
                }
                for (eid in store.edgeOrder) {
                    val e = store.edges[eid] ?: continue
                    val geo = store.edgeGeometry(e) ?: continue
                    val selected = (selection as? ThoughtMapStore.Selection.Edge)?.id == e.id
                    val color = MapInk.edgeInk(selected)
                    val style = Stroke(if (selected) INK_STRONG else INK, cap = StrokeCap.Round)
                    drawPath(geo.path, color, style = style)
                    drawPath(geo.head, color, style = style)
                }
            }
        }
    }
}

private val INK = Tokens.Ink.value
private val INK_LIGHT = Tokens.InkLight.value
private val INK_STRONG = Tokens.InkStrong.value

/** The arrow being drawn (dashed until it docks) with the docking dots, then the regions' rims re-inked over their cards. */
@Composable
fun MapOverLayer(store: ThoughtMapStore) {
    MapCameraLayer(store) {
        Canvas(Modifier.fillMaxSize()) {
            val d = density
            val selection = store.selection
            val hot = store.hotGroupId()
            val draft = store.linkDraft
            scale(d, d, pivot = Offset.Zero) {
                if (draft != null) {
                    val source = store.nodeRect(draft.sourceId)
                    if (source != null) {
                        val target = store.linkTarget
                        val targetRect = target?.let { store.nodeRect(it) }
                        val hue = store.cards[draft.sourceId]?.let(ThoughtMapStore::hue) ?: 55.0
                        val linkColor = MapInk.linkInk(hue)
                        val to = targetRect ?: com.resonance.geometry.Rect(draft.wx - 1, draft.wy - 1, 2.0, 2.0)
                        val seed = seedFromString(draft.sourceId).toDouble()
                        val geo = organicEdgePath(source, to, seed)
                        drawPath(
                            geo.path.toPath(1f), linkColor,
                            style = Stroke(INK_STRONG, cap = StrokeCap.Round, pathEffect = if (targetRect == null) PathEffect.dashPathEffect(floatArrayOf(7f, 6f)) else null),
                        )
                        drawPath(
                            arrowHeadPath(Pt(geo.end.x, geo.end.y), geo.endAngle, 15.0, seed + 7).toPath(1f), linkColor,
                            style = Stroke(INK_STRONG, cap = StrokeCap.Round),
                        )
                        // Docking dots on the cards the pointer is near (their four mid-sides).
                        for (id in store.nodeOrder) {
                            if (id == draft.sourceId) continue
                            val r = store.nodeRect(id) ?: continue
                            if (!rectContains(inflateRect(r, 90.0), Pt(draft.wx, draft.wy))) continue
                            val docked = r == targetRect
                            val radius = if (docked) 7f else 5.5f
                            val mids = listOf(
                                Offset((r.x + r.w / 2).toFloat(), r.y.toFloat()), Offset((r.x + r.w).toFloat(), (r.y + r.h / 2).toFloat()),
                                Offset((r.x + r.w / 2).toFloat(), (r.y + r.h).toFloat()), Offset(r.x.toFloat(), (r.y + r.h / 2).toFloat()),
                            )
                            for (m in mids) {
                                drawCircle(if (docked) linkColor else Tokens.CardBg, radius, m)
                                drawCircle(linkColor, radius, m, style = Stroke(INK))
                            }
                        }
                    }
                }
                // The regions' rims, re-inked over the cards so they tuck under it.
                for (gid in store.groupOrder) {
                    val g = store.groups[gid] ?: continue
                    val strong = hot == g.id || (selection as? ThoughtMapStore.Selection.Group)?.id == g.id
                    translate(g.x.toFloat(), g.y.toFloat()) {
                        drawPath(store.regionPath(g), MapInk.regionStroke(g.hue, strong), style = Stroke(if (strong) INK_STRONG else INK_LIGHT, join = StrokeJoin.Round))
                    }
                }
            }
        }
    }
}

/** Region titles and their corner trash (under the cards, as on the web). */
@Composable
fun MapRegionChrome(store: ThoughtMapStore) {
    MapCameraLayer(store) {
        for (gid in store.groupOrder) key(gid) { RegionChrome(store, gid) }
    }
}

@Composable
private fun RegionChrome(store: ThoughtMapStore, gid: String) {
    val g = store.groups[gid] ?: return
    if (store.editingGroupId != gid) {
        BasicText(
            g.title,
            style = AppFonts.heading(16f, 700, lineHeight = 1.333f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .requiredWidth(max(0.0, g.w - 44 - 40).dp)
                .graphicsLayer {
                    translationX = ((g.x + 20) * density).toFloat()
                    translationY = ((g.y + 12) * density).toFloat()
                },
        )
    }
    Box(
        Modifier
            .requiredSize(28.dp)
            .graphicsLayer {
                translationX = ((g.x + g.w - 10 - 28) * density).toFloat()
                translationY = ((g.y + 8) * density).toFloat()
            },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(IconName.Trash, size = 15.dp, color = Tokens.TextMuted) }
}

// The cards

private val RegionClip = RoundedCornerShape(30.dp)

/** The cards: each region's members clipped to its rounded box, then the free ones. */
@Composable
fun MapNodesLayer(store: ThoughtMapStore) {
    val selection = store.selection
    val dragging = store.dragNodeId
    val target by remember(store) { derivedStateOf { store.linkTarget } }
    val linking by remember(store) { derivedStateOf { store.linkDraft != null } }
    MapCameraLayer(store) {
        for (gid in store.groupOrder) key(gid) { RegionCards(store, gid, selection, dragging, target, linking) }
        for (id in store.freeOrder) key(id) { NodeItem(store, id, null, selection, dragging, target, linking) }
    }
}

/** One region's filed cards, clipped to its rounded box (`overflow: hidden; border-radius: 30px`). */
@Composable
private fun RegionCards(
    store: ThoughtMapStore,
    gid: String,
    selection: ThoughtMapStore.Selection?,
    dragging: String?,
    target: String?,
    linking: Boolean,
) {
    val g = store.groups[gid] ?: return
    val members = store.nodeOrder.filter { store.nodes[it]?.groupId == gid }
    Box(
        Modifier
            .layout { measurable, _ ->
                val w = (g.w * density).toInt()
                val h = (g.h * density).toInt()
                val p = measurable.measure(Constraints.fixed(w, h))
                layout(w, h) { p.place(0, 0) }
            }
            .graphicsLayer {
                translationX = (g.x * density).toFloat()
                translationY = (g.y * density).toFloat()
                transformOrigin = TransformOrigin(0f, 0f)
                clip = true
                shape = RegionClip
            },
    ) {
        for (id in members) key(id) { NodeItem(store, id, g, selection, dragging, target, linking) }
    }
}

@Composable
private fun NodeItem(
    store: ThoughtMapStore,
    id: String,
    group: MapGroup?,
    selection: ThoughtMapStore.Selection?,
    dragging: String?,
    target: String?,
    linking: Boolean,
) {
    val n = store.nodes[id] ?: return
    val card = store.cards[id] ?: return
    MapNodeView(
        card,
        selected = (selection as? ThoughtMapStore.Selection.Node)?.id == id,
        linkTarget = target == id,
        dragging = dragging == id,
        showsHandle = !linking,
        modifier = Modifier
            .graphicsLayer {
                translationX = ((n.x - (group?.x ?: 0.0)) * density).toFloat()
                translationY = ((n.y - (group?.y ?: 0.0)) * density).toFloat()
            }
            .zIndex(if (dragging == id) 2f else 0f),
    )
}

// Arrows' words

/** The arrows' words: a small tag pill at each curve's middle (above the cards). */
@Composable
fun MapEdgeLabels(store: ThoughtMapStore) {
    MapCameraLayer(store) {
        for (eid in store.edgeOrder) key(eid) { EdgeLabel(store, eid) }
    }
}

@Composable
private fun EdgeLabel(store: ThoughtMapStore, eid: String) {
    val e = store.edges[eid] ?: return
    if (store.nodes[e.sourceCardId] == null || store.nodes[e.targetCardId] == null) return
    if (!store.showsLabel(e) || store.editingEdgeId == eid) return
    val selected = (store.selection as? ThoughtMapStore.Selection.Edge)?.id == eid
    Box(
        Modifier.layout { measurable, _ ->
            val p = measurable.measure(Constraints())
            layout(p.width, p.height) {
                // Centred on the curve's middle; the arrow's geometry is read as the layer is placed, so a dragged card takes its words along.
                p.placeWithLayer(0, 0) {
                    val g = store.edgeGeometry(e)
                    if (g != null) {
                        translationX = (g.geo.mid.x * density).toFloat() - p.width / 2f
                        translationY = (g.geo.mid.y * density).toFloat() - p.height / 2f
                    }
                }
            }
        },
    ) {
        TagPill(store.labelText(e), fill = if (selected) MapInk.pillFillSelected else MapInk.pillFill, size = TagSize.Sm)
    }
}
