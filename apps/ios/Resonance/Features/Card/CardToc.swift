import DesignSystem
import ResonanceKit
import SwiftUI

/// One line of a card's table of contents: a heading among the story's own blocks (its place there
/// is the ``StoryHeadingAnchor`` the page scrolls to), h2 or h3, by its words.
struct TocEntry: Equatable, Identifiable {
    let index: Int
    let level: Int
    let text: String

    var id: Int { index }

    /// The story's h2 and h3 in order, as the web's ToC reads them from the rendered story (`h2, h3`):
    /// a heading with no words is left out (rehype-slug gives it no id), and so is any other level.
    static func entries(_ blocks: [StoryBlock]) -> [TocEntry] {
        blocks.enumerated().compactMap { i, block in
            guard case let .heading(level, _) = block, level == 2 || level == 3,
                  let text = block.headingText?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty
            else { return nil }
            return TocEntry(index: i, level: level, text: text)
        }
    }
}

/// Which heading is being read, and where the table of contents scrolls to show it (the web's
/// CardToc, number for number).
nonisolated enum TocReading {
    struct Heading: Equatable {
        /// Its block's place in the story.
        let index: Int
        /// Its top in the page.
        let top: CGFloat
    }

    /// The reading line: this far under the bar's bottom edge, just under the header.
    static let line: CGFloat = 96
    /// The marked row comes to rest this share of the list's visible height from its top.
    static let restAt: CGFloat = 1.0 / 3
    /// How long a heading chosen by a tap stays marked at most while the page scrolls to it.
    static let choiceHold: Double = 1.0
    /// The list's own scroll to the marked row.
    static let followDuration: Double = 0.25

    /// The last heading whose top has passed the reading line (`visibleTop`: the page's y at the
    /// bar's bottom edge); none before the first has.
    static func current(_ headings: [Heading], visibleTop: CGFloat) -> Int? {
        let line = visibleTop + Self.line
        return headings.last(where: { $0.top < line })?.index
    }

    /// The list's offset that rests a row whose top is `rowTop` (in the list's content) a third of
    /// the way down `visible`, held to the list's ends.
    static func followOffset(rowTop: CGFloat, visible: CGFloat, range: CGFloat) -> CGFloat {
        min(max(rowTop - visible * restAt, 0), max(0, range))
    }
}

/// Where a scroller's thumb stands on a track `track` tall (scrollbarGeometry.ts `thumbGeometry`): as
/// long as the share of the content in view (at least 36, at most the track), as far down the track
/// as the scroller is down its range. Nil when there's nothing worth a bar: a range of 6 or less,
/// or nothing measured yet.
struct ScrollThumb: Equatable {
    /// The thumb's length.
    let length: CGFloat
    /// How far down the track its top is.
    let top: CGFloat
    /// The scroller's range (content − what shows).
    let range: CGFloat

    static let minLength: CGFloat = 36

    init?(offset: CGFloat, content: CGFloat, visible: CGFloat, track: CGFloat) {
        let range = content - visible
        guard range > 6, track > 0, visible > 0 else { return nil }
        let length = min(track, max(Self.minLength, track * visible / content)).rounded()
        let progress = min(1, max(0, offset / range))
        self.length = length
        self.top = (track - length) * progress
        self.range = range
    }

    /// The offset that puts the thumb's top at `thumbTop` (`scrollTopForThumb`: the inverse, held to
    /// the track's ends) — what a drag asks for, the place it was grabbed by taken off first.
    func offset(forThumbTop thumbTop: CGFloat, track: CGFloat) -> CGFloat {
        let room = track - length
        guard room > 0 else { return 0 }
        return min(max(thumbTop, 0), room) / room * range
    }
}

/// The table of contents under the author in a wide card page's rail (the web's CardToc): 「目錄」,
/// then the story's h2 and h3 (h3 set in 12), each taking the page to its heading. The rail never
/// runs past the window, so a story with many headings scrolls its list in place, with no bar of its
/// own: the wavy rule down its left is the bar. It stays put, as tall as the list shows, and a
/// terracotta stretch of the same rule (its length along the curve) stands for the part of the list
/// in view, running down it as the list scrolls; it can be dragged, and a tap on the rule above or
/// below it moves the list a page. The list fades out at the end it can still scroll toward. The
/// drawn rule is hidden from VoiceOver, which has the list itself.
///
/// The heading being read is marked in terracotta (``TocReading``, from the page's `meter`), and as
/// it changes the list scrolls itself to rest its row a third of the way down — the stretch on the
/// rule following — unless the reader is moving the list or the stretch.
struct CardToc: View {
    let entries: [TocEntry]
    let title: String
    let meter: ReadingMeter
    let onPick: (TocEntry) -> Void

    /// The rule's wave: its depth, and the column it takes (both sides of the wave, the pen, 2 of air).
    static let amp: CGFloat = 5
    static let railWidth: CGFloat = amp * 2 + Tokens.inkLight + 2
    /// A tap on the rule beside the stretch moves the list this share of what shows.
    static let page: CGFloat = 0.9
    /// The fade at an end the list can still scroll toward.
    static let fade: CGFloat = 16
    private static let listSpace = "card.toc.list"

    private struct Metrics: Equatable {
        var offset: CGFloat = 0
        var content: CGFloat = 0
        var visible: CGFloat = 0
    }

    @State private var metrics = Metrics()
    @State private var position = ScrollPosition()
    /// Where on the stretch a drag took it (nil: not dragging it).
    @State private var grab: CGFloat?
    /// The drag began on the stretch (a drag) or beside it (a tap: a page).
    @State private var pressed = false
    /// Each row's top in the list's content, by its heading's place in the story.
    @State private var rowTops: [Int: CGFloat] = [:]
    /// The reader has the list under a finger (or it is still coasting from one).
    @State private var listMoving = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var track: CGFloat { metrics.visible }
    private var thumb: ScrollThumb? {
        ScrollThumb(offset: metrics.offset, content: metrics.content, visible: metrics.visible, track: track)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(AppFonts.body(12, weight: .semibold))
                .tracking(12 * 0.08)
                .foregroundStyle(Tokens.textMuted)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .top, spacing: 0) {
                rule
                list
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
        .onChange(of: meter.readingHeading, initial: true) { _, reading in follow(reading) }
    }

    /// The list scrolls itself to rest the marked row a third of the way down (smoothly, at once
    /// when motion is reduced) — not while the reader moves the list or the stretch.
    private func follow(_ reading: Int?) {
        guard let reading, grab == nil, !listMoving, let top = rowTops[reading],
              metrics.content - metrics.visible > 1 else { return }
        let to = TocReading.followOffset(rowTop: top, visible: metrics.visible, range: metrics.content - metrics.visible)
        guard abs(to - metrics.offset) > 1 else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: TocReading.followDuration)) { position.scrollTo(y: to) }
    }

    private var list: some View {
        let reading = meter.readingHeading
        return ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(entries) { entry in
                    Button { onPick(entry) } label: {
                        Text(entry.text)
                    }
                    .buttonStyle(TocLinkStyle(text: entry.text, current: entry.index == reading))
                    .accessibilityLabel(entry.text)
                    .accessibilityAddTraits(entry.index == reading ? .isSelected : [])
                    .padding(.leading, entry.level == 3 ? 12 : 0)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.listSpace)).minY } action: { rowTops[entry.index] = $0 }
                }
            }
            .padding(.leading, 6)
            // Room for the press, which the scroller would otherwise clip, as the web's 2 / 4.
            .padding(.vertical, 2)
            .padding(.trailing, 4)
            .coordinateSpace(.named(Self.listSpace))
        }
        .scrollPosition($position)
        .onScrollPhaseChange { _, phase in listMoving = phase == .interacting || phase == .decelerating }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        .onScrollGeometryChange(for: Metrics.self) { geo in
            Metrics(offset: geo.contentOffset.y + geo.contentInsets.top,
                    content: geo.contentSize.height + geo.contentInsets.top + geo.contentInsets.bottom,
                    visible: geo.containerSize.height)
        } action: { _, now in
            metrics = now
        }
        // As tall as its headings, never taller than the rail leaves it.
        .frame(maxHeight: max(1, metrics.content))
        .scrollEdgeFades(Self.fade)
    }

    /// The rule as tall as the list shows, a turn every 32 or so; while the list scrolls, its
    /// terracotta stretch, dragged or tapped beside.
    private var rule: some View {
        let height = track
        let path = height > 0
            ? wavyVertical(Double(height), seed: 9, amp: Double(Self.amp), steps: max(5, Int((height / 32).rounded())))
                .path(offsetX: Double(Self.railWidth / 2))
            : Path()
        return ZStack(alignment: .topLeading) {
            path.stroke(Tokens.fieldBorder, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            if let thumb, height > 0 {
                path.trimmedPath(from: thumb.top / height, to: (thumb.top + thumb.length) / height)
                    .stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: Tokens.inkStrong, lineCap: .round))
            }
        }
        .frame(width: Self.railWidth, height: height)
        // A finger's room either side of the 13pt rule: its column reaches 10 out into the rail's gutter.
        .padding(.leading, 10)
        .contentShape(Rectangle())
        .gesture(drag, isEnabled: thumb != nil)
        .padding(.leading, -10)
        .accessibilityHidden(true)
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { g in
                guard let thumb else { return }
                if !pressed {
                    pressed = true
                    let y = g.startLocation.y
                    // On the stretch (with a little slop, it is thin): it keeps the place it was taken by.
                    if y >= thumb.top - 8, y <= thumb.top + thumb.length + 8 { grab = y - thumb.top }
                }
                if let grab {
                    position.scrollTo(y: thumb.offset(forThumbTop: g.location.y - grab, track: track))
                }
            }
            .onEnded { g in
                defer {
                    pressed = false
                    grab = nil
                }
                guard grab == nil, let thumb, abs(g.translation.height) < 10 else { return }
                // The rule above or below the stretch: a page up or down.
                let by = (g.startLocation.y < thumb.top ? -1 : 1) * metrics.visible * Self.page
                let to = min(max(metrics.offset + by, 0), thumb.range)
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) { position.scrollTo(y: to) }
            }
    }
}

/// A heading of the table of contents: 14 on a 1.45 line, muted, 4 above and below; terracotta while
/// it is the one being read (the weight unchanged), and under the finger (the web's hover).
private struct TocLinkStyle: ButtonStyle {
    /// Set in a CSS line box (a label's words can't be read back out of it).
    let text: String
    var current = false

    func makeBody(configuration: Configuration) -> some View {
        CSSText(text, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.45,
                color: UIColor(current || configuration.isPressed ? Tokens.terracotta : Tokens.textMuted))
            .padding(.vertical, 4)
            .contentShape(Rectangle())
    }
}
