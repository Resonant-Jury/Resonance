package com.resonance.app.thoughtmap

import android.graphics.Paint
import android.util.Log
import android.util.LruCache
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Path
import com.resonance.design.AppFonts
import com.resonance.design.GeometryCache
import com.resonance.design.toPath
import com.resonance.geometry.EdgeGeometry
import com.resonance.geometry.MapCamera
import com.resonance.geometry.MapGroupRect
import com.resonance.geometry.PathCommand
import com.resonance.geometry.Pt
import com.resonance.geometry.Rect
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.arrowHeadPath
import com.resonance.geometry.autoMag
import com.resonance.geometry.autoSegments
import com.resonance.geometry.fitCamera
import com.resonance.geometry.majorityGroupId
import com.resonance.geometry.mapNodeH
import com.resonance.geometry.mapNodeRect
import com.resonance.geometry.mapNodeW
import com.resonance.geometry.organicEdgePath
import com.resonance.geometry.rectContains
import com.resonance.geometry.resolveOverlap
import com.resonance.geometry.screenToWorld
import com.resonance.geometry.seedFromString
import com.resonance.geometry.wobRect
import com.resonance.geometry.zoomAt
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** A card on my map. Position and filing are snapshot state of their own, so dragging one card redraws just that card. */
@Stable
class MapNode(val cardId: String, x: Double, y: Double, groupId: String?) {
    var x by mutableDoubleStateOf(x)
    var y by mutableDoubleStateOf(y)
    var groupId: String? by mutableStateOf(groupId)
}

/** A directed arrow between two of my cards (`{source}_{target}`), with its optional words. */
@Stable
class MapEdge(val id: String, val sourceCardId: String, val targetCardId: String, label: String) {
    var label by mutableStateOf(label)
}

/** A region (分類): a titled, tinted box cards are filed into. */
@Stable
class MapGroup(val id: String, title: String, val hue: Double, x: Double, y: Double, w: Double, h: Double) {
    var title by mutableStateOf(title)
    var x by mutableDoubleStateOf(x)
    var y by mutableDoubleStateOf(y)
    var w by mutableDoubleStateOf(w)
    var h by mutableDoubleStateOf(h)

    val rect: Rect get() = Rect(x, y, w, h)
}

/** An arrow's drawn geometry in world units: its curve and head as paths, cached until an end moves. */
class EdgeGeo(val geo: EdgeGeometry, val path: Path, val head: Path)

/**
 * The thought map's state and its gestures — ThoughtMapCanvas.tsx without the
 * DOM, the twin of iOS's ThoughtMapStore. Edits are optimistic and written
 * through when a gesture ends (no debounce), exactly as on the web; the web's
 * pointer handlers are one state machine here, fed every touch by
 * `MapTouchSurface`, with hit-testing done in world coordinates in the web's
 * paint order. Every position is in dp (the web's CSS px).
 */
class ThoughtMapStore {
    sealed interface Selection {
        data class Node(val id: String) : Selection
        data class Edge(val id: String) : Selection
        data class Group(val id: String) : Selection
    }

    data class LinkDraft(val sourceId: String, val wx: Double, val wy: Double)

    var loaded by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set

    // Insertion order is paint order (a new card or region lands on top), so each collection keeps its order beside its map.
    val nodes = mutableStateMapOf<String, MapNode>()
    val nodeOrder = mutableStateListOf<String>()
    val edges = mutableStateMapOf<String, MapEdge>()
    val edgeOrder = mutableStateListOf<String>()
    val groups = mutableStateMapOf<String, MapGroup>()
    val groupOrder = mutableStateListOf<String>()
    var cards by mutableStateOf<Map<String, MapCard>>(emptyMap())
        private set
    private var cardOrder: List<String> = emptyList()
    var resonated by mutableStateOf<Set<String>>(emptySet())
        private set

    /** `screen = world × s + (x, y)`; read while drawing, so a pan or pinch redraws without recomposing. */
    var camera by mutableStateOf(MapCamera(0.0, 0.0, 1.0))
    var viewportW = 0.0
        private set
    var viewportH = 0.0
        private set
    var selection by mutableStateOf<Selection?>(null)
    var dragNodeId by mutableStateOf<String?>(null)
        private set
    var linkDraft by mutableStateOf<LinkDraft?>(null)
        private set
    var panning by mutableStateOf(false)
        private set
    var trayOpen by mutableStateOf(false)
    var editingGroupId by mutableStateOf<String?>(null)
    var groupDraft by mutableStateOf("")
    var editingEdgeId by mutableStateOf<String?>(null)
    var labelDraft by mutableStateOf("")

    /** Opening a card from its tab (the screen decides where: writer or card page). */
    var onOpen: (MapCard) -> Unit = {}

    /** The count of the writer's card changes this map has read its cards after. */
    var seenChanges = -1

    private var service: ThoughtMapService? = null
    private var fitted = false
    // Writes outlive the screen (they are the gesture's ending), like iOS's unstructured Tasks.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    companion object {
        val groupHues = listOf(88.0, 215.0, 290.0, 140.0, 55.0, 18.0)
        val nodeHues = listOf(55.0, 290.0, 140.0, 88.0, 215.0, 18.0)

        /** A card's action tab (TAB_X, TAB_W, TAB_H in ThoughtMapNode.tsx). */
        const val tabX = 24.0
        const val tabW = 118.0
        const val tabH = 30.0

        /** A region can't shrink below a card with room around it. */
        const val minGroupW = mapNodeW + 60
        const val minGroupH = mapNodeH + 80

        fun hue(card: MapCard): Double = card.accentHue ?: nodeHues[seedFromString(card.id) % nodeHues.size]

        /** The label pill's size in world units (TagPill sm: 10px 600 uppercase at 0.04em, 3×10 padding). */
        fun pillSize(text: String): Pair<Double, Double> =
            Pair(Math.ceil(MapText.width(text.uppercase(), AppFonts.Family.Body, 600, 10f, 0.04f).toDouble()) + 20, 19.0)

        /** Where the tab's two buttons split ("Open" on the left, the trash on the right). */
        fun tabSplitX(): Double {
            val openW = Math.ceil(MapText.width(L10n.Me.ThoughtMap.open, AppFonts.Family.Body, 600, 12.5f).toDouble()) + 14
            val trashW = 14.0 + 14
            val content = openW + 2 + trashW
            return tabX + (tabW - content) / 2 + openW + 1
        }
    }

    // Loading

    suspend fun load(uid: String) {
        val service = ThoughtMapService(uid).also { this.service = it }
        try {
            coroutineScope {
                val mapJob = async { service.load() }
                val cardJob = async { service.cards() }
                val m = mapJob.await()
                val c = cardJob.await()
                val byId = LinkedHashMap(c.cards)
                // A placed card older than the newest 40 is still on the map: read it by id.
                val missing = m.nodes.map { it.cardId }.filter { byId[it] == null }
                for (card in service.cards(missing)) byId[card.id] = card
                applyCards(byId, c.resonated)
                // A card that's gone (deleted, or an original I can no longer read) drops out of view.
                nodes.clear()
                nodeOrder.clear()
                for (n in m.nodes) if (cards[n.cardId] != null) {
                    nodes[n.cardId] = MapNode(n.cardId, n.x, n.y, n.groupId)
                    nodeOrder.add(n.cardId)
                }
                edges.clear()
                edgeOrder.clear()
                for (e in m.edges) {
                    edges[e.id] = MapEdge(e.id, e.sourceCardId, e.targetCardId, e.label)
                    edgeOrder.add(e.id)
                }
                groups.clear()
                groupOrder.clear()
                for (g in m.groups) {
                    groups[g.id] = MapGroup(g.id, g.title, g.hue, g.x, g.y, g.w, g.h)
                    groupOrder.add(g.id)
                }
                loaded = true
                failed = false
                fitIfReady()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w("ThoughtMap", "load failed", e)
            failed = !loaded
        }
    }

    /** Titles and tags may have changed in the writer: refresh the cards, keep the map. */
    suspend fun refreshCards() {
        val service = service ?: return
        try {
            val c = service.cards()
            val byId = LinkedHashMap(c.cards)
            val missing = nodeOrder.filter { byId[it] == null }
            for (card in service.cards(missing)) byId[card.id] = card
            applyCards(byId, c.resonated)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w("ThoughtMap", "refresh failed", e)
        }
    }

    private fun applyCards(byId: Map<String, MapCard>, resonated: Set<String>) {
        cards = byId
        // Newest first, drafts (no date) last — the order the web's query hands them over.
        cardOrder = byId.values.sortedWith { a, b ->
            val pa = a.publishedAt
            val pb = b.publishedAt
            when {
                pa != null && pb != null -> pb.compareTo(pa)
                pa != null -> -1
                pb != null -> 1
                else -> a.id.compareTo(b.id)
            }
        }.map { it.id }
        this.resonated = resonated
    }

    fun setViewport(w: Double, h: Double) {
        if (w == viewportW && h == viewportH) return
        viewportW = w
        viewportH = h
        fitIfReady()
    }

    private fun fitIfReady() {
        if (fitted || !loaded || viewportW <= 0 || viewportH <= 0) return
        fitted = true
        fit()
    }

    // Derived

    val isEmpty: Boolean get() = nodes.isEmpty() && groups.isEmpty()

    fun nodeRect(id: String): Rect? = nodes[id]?.let { mapNodeRect(it.x, it.y) }

    val groupRects: List<MapGroupRect>
        get() = groupOrder.mapNotNull { groups[it] }.map { MapGroupRect(it.id, it.rect) }

    private fun isFiled(id: String): Boolean = nodes[id]?.groupId?.let { groups[it] } != null

    /** Paint order: filed cards (inside their region's clip, regions in order), then free cards. */
    val filedOrder: List<String> get() = nodeOrder.filter { isFiled(it) }
    val freeOrder: List<String> get() = nodeOrder.filter { !isFiled(it) }

    /** Cards not on the map yet, drafts first, then newest. */
    val trayCards: List<MapCard>
        get() {
            val off = cardOrder.mapNotNull { cards[it] }.filter { nodes[it.id] == null }
            return off.filter { it.publishedAt == null } + off.filter { it.publishedAt != null }
        }

    /** The region a dragged card is being filed into shows as an open folder. */
    fun hotGroupId(): String? = dragNodeId?.let { nodes[it]?.groupId }

    /** The node an arrow in progress would land on. */
    val linkTarget: String?
        get() {
            val d = linkDraft ?: return null
            return nodeOrder.firstOrNull { it != d.sourceId && nodes[it]?.let { n -> rectContains(mapNodeRect(n.x, n.y), Pt(d.wx, d.wy)) } == true }
        }

    // Camera

    fun zoom(factor: Double) {
        camera = zoomAt(camera, viewportW / 2, viewportH / 2, factor)
    }

    fun fit() {
        val rects = nodeOrder.mapNotNull { nodeRect(it) } + groupOrder.mapNotNull { groups[it]?.rect }
        camera = fitCamera(rects, viewportW, viewportH)
    }

    // Geometry the layers share

    private val regionPaths = LruCache<String, Path>(96)

    /** A region's wobbly box, in world units at its own origin (cached by size, since it regenerates with it). */
    fun regionPath(g: MapGroup): Path {
        val w = g.w
        val h = g.h
        return regionPaths.get("${g.id}|$w|$h") ?: run {
            val options = WobRectOptions(
                curve = 0.6, cornerOffset = 5.0,
                segmentsH = SegValue.Count(autoSegments(w).toDouble()), segmentsV = SegValue.Count(autoSegments(h).toDouble()),
            )
            val cmds = GeometryCache.get("region|${g.id}|$w|$h") {
                wobRect(w, h, min(34.0, min(w, h) / 2), seedFromString(g.id).toDouble(), autoMag(w, h), options)
            }
            cmds.toPath(1f).also { regionPaths.put("${g.id}|$w|$h", it) }
        }
    }

    private class EdgeCacheEntry(val sx: Double, val sy: Double, val tx: Double, val ty: Double, val geo: EdgeGeo)

    private val edgeCache = HashMap<String, EdgeCacheEntry>()

    /** The arrow's curve between its two cards, redrawn only when one of them has moved. */
    fun edgeGeometry(edge: MapEdge): EdgeGeo? {
        val s = nodes[edge.sourceCardId] ?: return null
        val t = nodes[edge.targetCardId] ?: return null
        val sx = s.x
        val sy = s.y
        val tx = t.x
        val ty = t.y
        edgeCache[edge.id]?.let { if (it.sx == sx && it.sy == sy && it.tx == tx && it.ty == ty) return it.geo }
        val seed = seedFromString(edge.id).toDouble()
        val geo = organicEdgePath(mapNodeRect(sx, sy), mapNodeRect(tx, ty), seed)
        val head = arrowHeadPath(Pt(geo.end.x, geo.end.y), geo.endAngle, 13.0, seed + 7)
        val built = EdgeGeo(geo, geo.path.toPath(1f), head.toPath(1f))
        edgeCache[edge.id] = EdgeCacheEntry(sx, sy, tx, ty, built)
        return built
    }

    fun labelText(edge: MapEdge): String = edge.label.ifEmpty { L10n.Me.ThoughtMap.edgeLabelPlaceholder }

    fun showsLabel(edge: MapEdge): Boolean =
        edge.label.isNotEmpty() || selection == Selection.Edge(edge.id) || editingEdgeId == edge.id

    // Hit-testing (the web's paint order, top first)

    sealed interface Hit {
        data class EdgeLabel(val id: String) : Hit
        data class TabOpen(val id: String) : Hit
        data class TabRemove(val id: String) : Hit
        data class LinkHandle(val id: String) : Hit
        data class Node(val id: String) : Hit
        data class GroupTitle(val id: String) : Hit
        data class GroupDelete(val id: String) : Hit
        data class GroupResize(val id: String) : Hit
        data class Edge(val id: String) : Hit
        data class Group(val id: String) : Hit
        data object Empty : Hit
    }

    fun hitTest(px: Double, py: Double): Hit {
        val w = screenToWorld(camera, px, py)
        val s = camera.s
        // A finger is wider than the web's pointer: small targets get at least ~22dp of reach.
        val reach = max(0.0, 22 / s)
        for (id in edgeOrder.asReversed()) {
            val e = edges[id] ?: continue
            if (!showsLabel(e) || editingEdgeId == id) continue
            val g = edgeGeometry(e) ?: continue
            val (pw, ph) = pillSize(labelText(e))
            if (abs(w.x - g.geo.mid.x) <= pw / 2 + 4 / s && abs(w.y - g.geo.mid.y) <= ph / 2 + 6 / s) return Hit.EdgeLabel(id)
        }
        val sel = selection
        if (sel is Selection.Node && dragNodeId == null) {
            nodes[sel.id]?.let { n ->
                val hx = n.x + 233
                val hy = n.y + 89
                if (hypot(w.x - hx, w.y - hy) <= max(14.0, reach)) return Hit.LinkHandle(sel.id)
                if (w.y >= n.y - tabH && w.y < n.y + 2 && w.x >= n.x + tabX && w.x <= n.x + tabX + tabW) {
                    return if (w.x - n.x < tabSplitX()) Hit.TabOpen(sel.id) else Hit.TabRemove(sel.id)
                }
            }
        }
        for (id in (filedOrder + freeOrder).asReversed()) {
            val n = nodes[id] ?: continue
            if (rectContains(clippedRect(n), w)) return Hit.Node(id)
        }
        for (id in groupOrder.asReversed()) {
            val g = groups[id] ?: continue
            val rx = g.x + g.w + 6 - 11
            val ry = g.y + g.h + 6 - 11
            if (hypot(w.x - rx, w.y - ry) <= max(11.0, reach)) return Hit.GroupResize(id)
            val dx = g.x + g.w - 10 - 14
            val dy = g.y + 8 + 14
            if (abs(w.x - dx) <= max(14.0, reach) && abs(w.y - dy) <= max(14.0, reach)) return Hit.GroupDelete(id)
            if (w.x >= g.x && w.x <= g.x + g.w - 44 && w.y >= g.y && w.y <= g.y + 43) return Hit.GroupTitle(id)
        }
        val slop = max(8.0, 12 / s)
        for (id in edgeOrder.asReversed()) {
            val e = edges[id] ?: continue
            val g = edgeGeometry(e) ?: continue
            if (distance(w, g.geo.path) <= slop) return Hit.Edge(id)
        }
        for (id in groupOrder.asReversed()) {
            val g = groups[id] ?: continue
            if (rectContains(g.rect, w)) return Hit.Group(id)
        }
        return Hit.Empty
    }

    /** A filed card only shows (and takes touches) inside its region's rounded clip. */
    private fun clippedRect(n: MapNode): Rect {
        val r = mapNodeRect(n.x, n.y)
        val g = n.groupId?.let { groups[it] } ?: return r
        val x0 = max(r.x, g.x)
        val y0 = max(r.y, g.y)
        val x1 = min(r.x + r.w, g.x + g.w)
        val y1 = min(r.y + r.h, g.y + g.h)
        return if (x1 > x0 && y1 > y0) Rect(x0, y0, x1 - x0, y1 - y0) else Rect(0.0, 0.0, -1.0, -1.0)
    }

    /** Distance from a point to the arrow's cubic, sampled. */
    private fun distance(p: Pt, path: List<PathCommand>): Double {
        var best = Double.POSITIVE_INFINITY
        var cx = 0.0
        var cy = 0.0
        for (cmd in path) {
            when (cmd) {
                is PathCommand.Move -> { cx = cmd.x; cy = cmd.y }
                is PathCommand.Cubic -> {
                    for (i in 0..32) {
                        val t = i / 32.0
                        val u = 1 - t
                        val bx = u * u * u * cx + 3 * u * u * t * cmd.x1 + 3 * u * t * t * cmd.x2 + t * t * t * cmd.x
                        val by = u * u * u * cy + 3 * u * u * t * cmd.y1 + 3 * u * t * t * cmd.y2 + t * t * t * cmd.y
                        best = min(best, hypot(p.x - bx, p.y - by))
                    }
                    cx = cmd.x
                    cy = cmd.y
                }
                else -> {}
            }
        }
        return best
    }

    // Touches (the web's pointer handlers)

    private class Member(val id: String, val dx: Double, val dy: Double)

    private sealed interface Drag {
        class Pan(val px: Double, val py: Double, val camX: Double, val camY: Double) : Drag
        class NodeDrag(val id: String, val dx: Double, val dy: Double) : Drag
        class GroupDrag(val id: String, val dx: Double, val dy: Double, val members: List<Member>, val fromTitle: Boolean) : Drag
        class Resize(val id: String) : Drag
        class Link(val sourceId: String) : Drag
        /** Buttons and labels act when the finger lifts without moving. */
        class Tap(val hit: Hit) : Drag
    }

    private class PinchFrame(val dist: Double, val cx: Double, val cy: Double)
    private class Touch(val id: Long, var x: Double, var y: Double)

    private val touches = ArrayList<Touch>()
    private var drag: Drag? = null
    private var pinch: PinchFrame? = null
    private var moved = false
    private var startX = 0.0
    private var startY = 0.0
    private var lastX = 0.0
    private var lastY = 0.0

    private fun pinchFrame(): PinchFrame? {
        if (touches.size < 2) return null
        val a = touches[0]
        val b = touches[1]
        return PinchFrame(max(1.0, hypot(a.x - b.x, a.y - b.y)), (a.x + b.x) / 2, (a.y + b.y) / 2)
    }

    fun touchDown(id: Long, x: Double, y: Double) {
        touches.add(Touch(id, x, y))
        if (touches.size == 2) {
            // A second finger turns whatever the first was doing into a pinch (finishing a move it had made).
            if (moved) finishDrag(lastX, lastY)
            drag = null
            panning = false
            dragNodeId = null
            linkDraft = null
            pinch = pinchFrame()
            return
        }
        if (touches.size != 1 || pinch != null) return
        commitEditors()
        moved = false
        startX = x
        startY = y
        lastX = x
        lastY = y
        val w = screenToWorld(camera, x, y)
        when (val hit = hitTest(x, y)) {
            is Hit.LinkHandle -> {
                drag = Drag.Link(hit.id)
                linkDraft = LinkDraft(hit.id, w.x, w.y)
            }
            is Hit.Node -> {
                val n = nodes[hit.id] ?: return
                drag = Drag.NodeDrag(hit.id, w.x - n.x, w.y - n.y)
                dragNodeId = hit.id
            }
            is Hit.GroupTitle -> drag = groupDrag(hit.id, w, fromTitle = true)
            is Hit.Group -> drag = groupDrag(hit.id, w, fromTitle = false)
            is Hit.GroupResize -> drag = Drag.Resize(hit.id)
            is Hit.Edge -> {
                // Selected as the finger lands; nothing to drag.
                selection = Selection.Edge(hit.id)
                drag = Drag.Tap(hit)
            }
            Hit.Empty -> {
                drag = Drag.Pan(x, y, camera.x, camera.y)
                panning = true
            }
            else -> drag = Drag.Tap(hit)
        }
    }

    private fun groupDrag(id: String, w: Pt, fromTitle: Boolean): Drag {
        val g = groups[id]!!
        val members = nodeOrder.mapNotNull { nodes[it] }.filter { it.groupId == id }.map { Member(it.cardId, w.x - it.x, w.y - it.y) }
        return Drag.GroupDrag(id, w.x - g.x, w.y - g.y, members, fromTitle)
    }

    fun touchMove(id: Long, x: Double, y: Double) {
        val i = touches.indexOfFirst { it.id == id }
        if (i < 0) return
        touches[i].x = x
        touches[i].y = y
        val prev = pinch
        if (prev != null) {
            val frame = pinchFrame() ?: return
            val cam = zoomAt(camera, frame.cx, frame.cy, frame.dist / prev.dist)
            camera = cam.copy(x = cam.x + frame.cx - prev.cx, y = cam.y + frame.cy - prev.cy)
            pinch = frame
            return
        }
        val current = drag
        if (i != 0 || current == null) return
        lastX = x
        lastY = y
        if (!moved && hypot(x - startX, y - startY) > 4) moved = true
        val w = screenToWorld(camera, x, y)
        when (current) {
            is Drag.Pan -> camera = camera.copy(x = current.camX + (x - current.px), y = current.camY + (y - current.py))
            is Drag.NodeDrag -> {
                if (!moved) return
                val n = nodes[current.id] ?: return
                n.x = w.x - current.dx
                n.y = w.y - current.dy
                n.groupId = majorityGroupId(mapNodeRect(n.x, n.y), groupRects)
            }
            is Drag.GroupDrag -> {
                if (!moved) return
                val g = groups[current.id] ?: return
                g.x = w.x - current.dx
                g.y = w.y - current.dy
                for (m in current.members) nodes[m.id]?.let { it.x = w.x - m.dx; it.y = w.y - m.dy }
            }
            is Drag.Resize -> {
                val g = groups[current.id] ?: return
                g.w = max(minGroupW, w.x - g.x)
                g.h = max(minGroupH, w.y - g.y)
            }
            is Drag.Link -> linkDraft = linkDraft?.copy(wx = w.x, wy = w.y)
            is Drag.Tap -> {}
        }
    }

    fun touchUp(id: Long, x: Double, y: Double) {
        val i = touches.indexOfFirst { it.id == id }
        if (i < 0) return
        touches.removeAt(i)
        if (pinch != null) {
            // A pinch finger never taps; the one left behind does nothing until lifted.
            pinch = if (touches.size >= 2) pinchFrame() else null
            return
        }
        if (!(i == 0 || touches.isEmpty())) return
        finishDrag(x, y)
    }

    private fun finishDrag(x: Double, y: Double) {
        val current = drag ?: return
        drag = null
        val w = screenToWorld(camera, x, y)
        when (current) {
            is Drag.Pan -> {
                panning = false
                if (!moved) {
                    selection = null
                    trayOpen = false
                }
            }
            is Drag.NodeDrag -> {
                dragNodeId = null
                if (!moved) {
                    selection = Selection.Node(current.id)
                    return
                }
                val node = nodes[current.id] ?: return
                val others = nodeOrder.filter { it != current.id }.mapNotNull { nodeRect(it) }
                val pos = resolveOverlap(mapNodeRect(w.x - current.dx, w.y - current.dy), others)
                val groupId = majorityGroupId(mapNodeRect(pos.x, pos.y), groupRects)
                node.x = pos.x
                node.y = pos.y
                node.groupId = groupId
                persist { it.moveNode(current.id, pos.x, pos.y, groupId) }
            }
            is Drag.GroupDrag -> {
                if (!moved) {
                    if (current.fromTitle && selection == Selection.Group(current.id)) startGroupRename(current.id) else selection = Selection.Group(current.id)
                    return
                }
                val g = groups[current.id] ?: return
                val moves = current.members.mapNotNull { m -> nodes[m.id]?.let { Triple(m.id, it.x, it.y) } }
                val gx = g.x
                val gy = g.y
                persist { it.moveGroup(current.id, gx, gy, moves) }
            }
            is Drag.Resize -> {
                val g = groups[current.id] ?: return
                val gw = g.w
                val gh = g.h
                persist { it.updateGroup(current.id, mapOf("w" to gw, "h" to gh)) }
                reconcileMemberships()
            }
            is Drag.Link -> {
                val target = linkTarget
                linkDraft = null
                if (target == null) return
                val eid = ThoughtMapService.edgeId(current.sourceId, target)
                if (edges[eid] == null) {
                    edges[eid] = MapEdge(eid, current.sourceId, target, "")
                    edgeOrder.add(eid)
                    persist { it.createEdge(current.sourceId, target) }
                    selection = Selection.Edge(eid)
                    labelDraft = ""
                    editingEdgeId = eid
                } else {
                    selection = Selection.Edge(eid)
                }
            }
            is Drag.Tap -> {
                if (moved) return
                when (val hit = current.hit) {
                    is Hit.EdgeLabel -> startEdgeEdit(hit.id)
                    is Hit.TabOpen -> cards[hit.id]?.let { onOpen(it) }
                    is Hit.TabRemove -> removeNode(hit.id)
                    is Hit.GroupDelete -> removeGroup(hit.id)
                    else -> {}
                }
            }
        }
    }

    fun touchesCancelled() {
        // A cancelled gesture ends like a lift (the web's onPointerCancel = onPointerUp).
        if (pinch == null && touches.isNotEmpty()) finishDrag(lastX, lastY)
        touches.clear()
        pinch = null
        drag = null
        panning = false
        dragNodeId = null
        linkDraft = null
    }

    // Edits

    private fun persist(work: suspend (ThoughtMapService) -> Unit) {
        val service = service ?: return
        scope.launch {
            try {
                work(service)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w("ThoughtMap", "write failed", e)
            }
        }
    }

    /** The tray's pick: onto the middle of the view, nudged per card already there, clear of the others. */
    fun addCard(card: MapCard) {
        val center = screenToWorld(camera, viewportW / 2, viewportH / 2)
        val k = (nodes.size % 5).toDouble()
        val rect = Rect(center.x - mapNodeW / 2 + k * 28, center.y - mapNodeH / 2 + k * 22, mapNodeW, mapNodeH)
        val pos = resolveOverlap(rect, nodeOrder.mapNotNull { nodeRect(it) })
        val groupId = majorityGroupId(mapNodeRect(pos.x, pos.y), groupRects)
        nodes[card.id] = MapNode(card.id, pos.x, pos.y, groupId)
        nodeOrder.add(card.id)
        trayOpen = false
        persist { service ->
            service.addNode(card.id, pos.x, pos.y)
            if (groupId != null) service.setNodeGroups(listOf(card.id to groupId))
        }
    }

    suspend fun addGroup() {
        val service = service ?: return
        val center = screenToWorld(camera, viewportW / 2, viewportH / 2)
        val hue = groupHues[groups.size % groupHues.size]
        val title = L10n.Me.ThoughtMap.newGroup
        val x = center.x - 230
        val y = center.y - 170
        // The region appears once it's written (it needs its id), as on the web.
        val id = try {
            service.createGroup(title, hue, x, y, 460.0, 340.0)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w("ThoughtMap", "add group failed", e)
            return
        }
        groups[id] = MapGroup(id, title, hue, x, y, 460.0, 340.0)
        groupOrder.add(id)
        selection = Selection.Group(id)
        startGroupRename(id)
    }

    fun removeNode(id: String) {
        nodes.remove(id)
        nodeOrder.remove(id)
        val gone = edgeOrder.filter { edges[it]?.sourceCardId == id || edges[it]?.targetCardId == id }
        for (e in gone) edges.remove(e)
        edgeOrder.removeAll(gone.toSet())
        if (selection == Selection.Node(id)) selection = null
        persist { it.removeNode(id) }
    }

    fun removeEdge(id: String) {
        edges.remove(id)
        edgeOrder.remove(id)
        if (selection == Selection.Edge(id)) selection = null
        if (editingEdgeId == id) editingEdgeId = null
        persist { it.removeEdge(id) }
    }

    fun removeGroup(id: String) {
        groups.remove(id)
        groupOrder.remove(id)
        for (nid in nodeOrder) if (nodes[nid]?.groupId == id) nodes[nid]?.groupId = null
        if (selection == Selection.Group(id)) selection = null
        persist { it.removeGroup(id) }
    }

    /** After a resize: re-file every card by majority, persisting only the changes. */
    private fun reconcileMemberships() {
        val changes = ArrayList<Pair<String, String?>>()
        val rects = groupRects
        for (id in nodeOrder) {
            val n = nodes[id] ?: continue
            val g = majorityGroupId(mapNodeRect(n.x, n.y), rects)
            if (g != n.groupId) {
                n.groupId = g
                changes.add(id to g)
            }
        }
        persist { it.setNodeGroups(changes) }
    }

    fun startGroupRename(id: String) {
        val g = groups[id] ?: return
        groupDraft = g.title
        editingGroupId = id
    }

    fun commitGroupTitle() {
        val id = editingGroupId ?: return
        editingGroupId = null
        val trimmed = groupDraft.trim()
        val title = trimmed.ifEmpty { L10n.Me.ThoughtMap.newGroup }
        val g = groups[id] ?: return
        if (g.title == title) return
        g.title = title
        persist { it.updateGroup(id, mapOf("title" to title)) }
    }

    fun startEdgeEdit(id: String) {
        val e = edges[id] ?: return
        selection = Selection.Edge(id)
        labelDraft = e.label
        editingEdgeId = id
    }

    fun commitEdgeLabel() {
        val id = editingEdgeId ?: return
        editingEdgeId = null
        val label = labelDraft.trim()
        val e = edges[id] ?: return
        e.label = label
        persist { it.updateEdgeLabel(id, label) }
    }

    /** Tapping the map ends any in-place editing (the web's blur). */
    fun commitEditors() {
        if (editingGroupId != null) commitGroupTitle()
        if (editingEdgeId != null) commitEdgeLabel()
    }
}

/** Text widths for hit targets, measured off screen in the same faces the map draws with. */
object MapText {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isLinearText = true }

    /** The width of `text` in dp (the size given in dp): measured at 10× so hinting can't round it. */
    fun width(text: String, family: AppFonts.Family, weight: Int, sizeDp: Float, letterSpacingEm: Float = 0f): Float {
        val k = 10f
        paint.typeface = AppFonts.typeface(family, weight)
        paint.textSize = sizeDp * k
        paint.letterSpacing = letterSpacingEm
        return paint.measureText(text) / k
    }
}
