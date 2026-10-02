import DesignSystem
import ResonanceKit
import SwiftUI

/// 思想地圖 (me/thought-map): my cards laid out on an endless dotted paper,
/// filed into regions and joined by arrows with words on them. The whole
/// screen is the map (no tab bar, no header); Leave, the toolbar and the zoom
/// controls float over it.
struct ThoughtMapScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @Environment(\.dismiss) private var dismiss
    /// Kept by the session between visits (see ThoughtMapStore.open).
    private var store: ThoughtMapStore { session.thoughtMap }

    var body: some View {
        GeometryReader { outer in
            let insets = outer.safeAreaInsets
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    MapGridLayer(store: store)
                    MapUnderLayer(store: store)
                    MapCameraTransform(store: store) { MapRegionChrome(store: store) }
                    MapCameraTransform(store: store) { MapNodesLayer(store: store) }
                    MapOverLayer(store: store)
                    MapCameraTransform(store: store) { MapEdgeLabels(store: store) }
                    MapTouchSurface(store: store)
                    MapEditors(store: store)
                    chrome(insets: insets, size: geo.size)
                    if store.trayOpen { MapTray(store: store, size: geo.size) }
                }
                .onAppear { store.setViewport(geo.size) }
                .onChange(of: geo.size) { _, size in store.setViewport(size) }
            }
            .ignoresSafeArea()
        }
        .ignoresSafeArea(.keyboard)
        .background(Tokens.cardBg)
        .toolbar(.hidden, for: .navigationBar)
        // The canvas takes every drag: going back is from the screen's edge only.
        .swipeBackFromEdgeOnly()
        .task {
            store.onOpen = { card in open(card) }
            if let uid = session.uid { await store.open(uid: uid, changes: writer.changes, lastChange: writer.lastChange) }
        }
        // Back from the writer: the card's title and tags may have changed.
        .onChange(of: writer.changes) {
            guard let uid = session.uid else { return }
            Task { await store.writerChanged(writer.changes, writer.lastChange, uid: uid) }
        }
    }

    /// A card of mine opens in the writer (a published one with its pending edit); a
    /// card I resonated with opens on its page.
    private func open(_ card: MapCard) {
        if card.authorId == session.uid {
            writer.edit(card.id, showsCard: false)
        } else {
            openRoute(.card(card.slug ?? card.id))
        }
    }

    @ViewBuilder private func chrome(insets: EdgeInsets, size: CGSize) -> some View {
        let top = insets.top + 8
        ZStack(alignment: .topLeading) {
            OrganicButton(icon: .arrowRight, label: L10n.Me.ThoughtMap.leave, iconSize: 15, variant: .paper, size: .sm) { dismiss() }
                .mirroringIcon()
                .roomy()
                .offset(x: 20, y: top)
            HStack(spacing: 10) {
                OrganicButton(L10n.Me.ThoughtMap.addGroupShort, icon: .frame, variant: .paper, size: .sm) {
                    Task { await store.addGroup() }
                }
                OrganicButton(L10n.Me.ThoughtMap.addCardShort, icon: .plus, variant: .solid, size: .sm) {
                    store.commitEditors()
                    store.trayOpen.toggle()
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 20)
            .offset(y: top)
            zoomCluster
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .padding(.leading, 16)
                .padding(.bottom, 16 + insets.bottom)
            if store.loaded, store.isEmpty, !store.trayOpen { emptyState.frame(width: size.width, height: size.height) }
            if !store.loaded {
                Group {
                    if store.failed {
                        OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                            Task { if let uid = session.uid { await store.load(uid: uid) } }
                        }
                    } else {
                        SketchLoader(size: 48)
                    }
                }
                .frame(width: size.width, height: size.height)
            }
        }
    }

    /// The zoom cluster: − 100% + and the eye (fit), on a wobbly sheet of card
    /// paper with no pen line (like the toolbar's paper buttons above).
    private var zoomCluster: some View {
        HStack(spacing: 4) {
            zoomButton(.minus, L10n.Me.ThoughtMap.zoomOut) { store.zoom(by: 1 / 1.25) }
            Text(verbatim: "\(Int((store.camera.s * 100).rounded()))%")
                .font(AppFonts.body(12))
                .monospacedDigit()
                .foregroundStyle(Tokens.textMuted)
                .frame(minWidth: 38)
            zoomButton(.plus, L10n.Me.ThoughtMap.zoomIn) { store.zoom(by: 1.25) }
            zoomButton(.eye, L10n.Me.ThoughtMap.zoomFit) { store.fit() }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background {
            // The paper buttons' paper: card fill and the cards' own grain tile.
            let shape = WobRectShape(radius: 18, seed: 41)
            shape.fill(Tokens.cardBg)
            GrainLayer(shape: shape, mode: .tile, opacity: 0.3, tile: "grain-card")
        }
    }

    private func zoomButton(_ icon: IconName, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            OrganicIcon(icon, size: 16)
                .foregroundStyle(Tokens.textMuted)
                .frame(width: 30, height: 30)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var emptyState: some View {
        VStack(spacing: 18) {
            CSSText(L10n.Me.ThoughtMap.empty, font: AppFonts.scaledUIFont(.body, size: 15), lineHeight: 1.7,
                    color: UIColor(Tokens.textMuted))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .fixedSize(horizontal: false, vertical: true)
            OrganicButton(L10n.Me.ThoughtMap.addCard, icon: .plus) { store.trayOpen = true }
        }
        .padding(.horizontal, 24)
    }
}

// MARK: - The tray

/// "Pick a card to add": my cards not on the map yet (drafts first, then
/// newest) on a hand-drawn card over a light scrim; a tap places one.
struct MapTray: View {
    let store: ThoughtMapStore
    let size: CGSize

    var body: some View {
        ZStack {
            OKLCHColor.color(0.3, 0.02, 75, alpha: 0.16)
                .contentShape(Rectangle())
                .onTapGesture { store.trayOpen = false }
            let cards = store.trayCards
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(L10n.Me.ThoughtMap.trayTitle)
                        .font(AppFonts.heading(14.5, weight: .bold))
                        .foregroundStyle(Tokens.text)
                        .padding(EdgeInsets(top: 4, leading: 2, bottom: 10, trailing: 2))
                    WavyDivider(seed: 31).padding(.bottom, 4)
                    if cards.isEmpty {
                        Text(L10n.Me.ThoughtMap.trayEmpty)
                            .font(AppFonts.body(13))
                            .foregroundStyle(Tokens.textMuted)
                            .padding(EdgeInsets(top: 14, leading: 4, bottom: 18, trailing: 4))
                    }
                    ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                        if i > 0 { WavyDivider(seed: 31 + Double(i) * 7) }
                        Button { store.addCard(card) } label: {
                            HStack(spacing: 10) {
                                OrganicIcon(store.resonated.contains(card.id) ? .wave : card.publishedAt != nil ? .cards : .pen, size: 15)
                                    .foregroundStyle(Tokens.textMuted)
                                Text(card.title)
                                    .font(AppFonts.body(13.5))
                                    .foregroundStyle(Tokens.text)
                                    .lineLimit(2)
                                    .lineSpacing(13.5 * 0.4 - 4)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                OrganicIcon(.plus, size: 14).foregroundStyle(Tokens.textMuted)
                            }
                            .padding(.vertical, 12)
                            .padding(.horizontal, 4)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(width: min(340, size.width - 32))
            .frame(maxHeight: min(440, size.height * 0.6))
            .fixedSize(horizontal: false, vertical: true)
            .background {
                let shape = WobRectShape(radius: 16, seed: 29)
                shape.fill(Tokens.cardBg)
                shape.stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

// MARK: - Editing words in place

/// The region-title and arrow-label editors. The web edits them inside the
/// zoomed world; a text field can't scale with it (caret, selection, keyboard),
/// so here they sit in screen space at 1:1, over where the words are.
struct MapEditors: View {
    let store: ThoughtMapStore
    @FocusState private var focus: Field?

    enum Field: Hashable { case group, edge }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let id = store.editingGroupId, let g = store.groups[id] {
                groupEditor(g)
            }
            if let id = store.editingEdgeId, let e = store.edges[id], let geo = store.edgeGeometry(e) {
                edgeEditor(e, at: CGPoint(x: geo.mid.x * store.camera.s + store.camera.x, y: geo.mid.y * store.camera.s + store.camera.y))
            }
        }
        .onChange(of: focus) { _, new in
            // Leaving a field commits it, as the web's blur does.
            if new != .group, store.editingGroupId != nil { store.commitGroupTitle() }
            if new != .edge, store.editingEdgeId != nil { store.commitEdgeLabel() }
        }
    }

    /// GroupTitleEditor: the title in its heading type over a wavy underline in the region's hue.
    private func groupEditor(_ g: MapGroup) -> some View {
        @Bindable var store = store
        let font = AppFonts.uiFont(.heading, size: 16, weight: .bold)
        let textW = (store.groupDraft as NSString).size(withAttributes: [.font: font]).width
        let lineW = max(32, textW + 8)
        let x = (g.x + 16) * store.camera.s + store.camera.x
        let y = (g.y + 8) * store.camera.s + store.camera.y
        return VStack(alignment: .leading, spacing: 0) {
            TextField(L10n.Me.ThoughtMap.groupTitlePlaceholder, text: $store.groupDraft)
                .font(AppFonts.heading(16, weight: .bold))
                .foregroundStyle(Tokens.text)
                .focused($focus, equals: .group)
                .submitLabel(.done)
                .onSubmit { store.commitGroupTitle() }
                .padding(EdgeInsets(top: 4, leading: 4, bottom: 1, trailing: 4))
                .frame(width: max(120, g.w * store.camera.s - 44 - 16))
            WavyLineShape(seed: Double(seedFromString(g.id)) + 17, amp: 1.7, stepsPerPoint: 1.0 / 46)
                .stroke(OKLCHColor.color(0.48, 0.09, g.hue), style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
                .frame(width: lineW, height: 6)
                .padding(.leading, 4)
        }
        .padding(6)
        .background(OKLCHColor.color(0.965, 0.032, g.hue).opacity(0.96), in: RoundedRectangle(cornerRadius: 12))
        .offset(x: x - 6, y: y - 6)
        .onAppear { focus = .group }
    }

    /// EdgeLabelEditor: a pill-shaped badge with the words centred and a trash at its end.
    private func edgeEditor(_ e: MapEdge, at p: CGPoint) -> some View {
        @Bindable var store = store
        let font = AppFonts.uiFont(.body, size: 11.5, weight: .semibold)
        let shown = store.labelDraft.isEmpty ? L10n.Me.ThoughtMap.edgeLabelPlaceholder : store.labelDraft
        let textW = (shown as NSString).size(withAttributes: [.font: font, .kern: 0.46]).width
        let w = max(72, textW + 16) + 26 + 12
        return HStack(spacing: 0) {
            TextField(L10n.Me.ThoughtMap.edgeLabelPlaceholder, text: $store.labelDraft)
                .font(AppFonts.body(11.5, weight: .semibold))
                .tracking(0.46)
                .multilineTextAlignment(.center)
                .foregroundStyle(Tokens.text)
                .focused($focus, equals: .edge)
                .submitLabel(.done)
                .onSubmit { store.commitEdgeLabel() }
            Button { store.removeEdge(e.id) } label: {
                OrganicIcon(.trash, size: 13).foregroundStyle(Tokens.text)
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.Me.ThoughtMap.deleteEdge)
            .padding(.leading, 2)
        }
        .padding(EdgeInsets(top: 0, leading: 10, bottom: 0, trailing: 6))
        .frame(width: w, height: 28)
        .background {
            let shape = WobRectShape(radius: 14, seed: Double(seedFromString(e.id)) + 5)
            shape.fill(OKLCHColor.color(0.88, 0.03, 60))
            shape.stroke(OKLCHColor.color(0.46, 0.045, 60), style: StrokeStyle(lineWidth: Tokens.inkLight, lineJoin: .round))
        }
        .offset(x: p.x - w / 2, y: p.y - 14)
        .onAppear { focus = .edge }
    }
}
